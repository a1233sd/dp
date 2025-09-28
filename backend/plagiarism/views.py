from __future__ import annotations

from typing import Any, Dict, List

from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .analysis import build_similarity_frame, iter_similarity_results
from .diff import build_diff_segments, build_match_preview
from .models import Check, Report
from .pdf import PdfExtractionError, extract_text_from_pdf


def _json_response(payload: Any, status: int = 200) -> JsonResponse:
    return JsonResponse(payload, status=status, safe=False)


def _serialize_report(report: Report) -> Dict[str, Any]:
    latest_check = report.checks.order_by('-created_at').first()
    return {
        'id': str(report.id),
        'originalName': report.original_name,
        'createdAt': report.created_at.isoformat(),
        'cloudLink': report.cloud_link,
        'addedToCloud': bool(report.added_to_cloud),
        'latestCheck': _serialize_check_summary(latest_check) if latest_check else None,
    }


def _serialize_check_summary(check: Check | None) -> Dict[str, Any] | None:
    if check is None:
        return None
    return {
        'id': str(check.id),
        'status': check.status,
        'similarity': round(check.similarity, 2) if check.similarity is not None else None,
        'createdAt': check.created_at.isoformat(),
        'completedAt': check.completed_at.isoformat() if check.completed_at else None,
    }


def _serialize_check(check: Check) -> Dict[str, Any]:
    return {
        'id': str(check.id),
        'status': check.status,
        'similarity': round(check.similarity, 2) if check.similarity is not None else None,
        'matches': check.matches,
        'createdAt': check.created_at.isoformat(),
        'completedAt': check.completed_at.isoformat() if check.completed_at else None,
        'reportId': str(check.report_id),
        'reportName': check.report.original_name,
        'reportCloudLink': check.report.cloud_link,
        'reportAddedToCloud': bool(check.report.added_to_cloud),
    }


def _run_similarity(report: Report) -> List[Dict[str, Any]]:
    other_reports = list(Report.objects.exclude(id=report.id))
    candidates = [(str(other.id), other.text) for other in other_reports]
    lookup = {str(other.id): other for other in other_reports}
    frame = build_similarity_frame(report.text, candidates)

    matches: List[Dict[str, Any]] = []
    for result in iter_similarity_results(frame):
        other = lookup.get(result.report_id)
        if other is None:
            continue
        segments = build_diff_segments(other.text, report.text)
        preview = build_match_preview(segments)
        matches.append(
            {
                'reportId': result.report_id,
                'reportName': other.original_name,
                'similarity': result.similarity,
                'diffPreview': preview,
            }
        )
    return matches


def _create_check(report: Report) -> Check:
    matches = _run_similarity(report)
    similarity = max((match['similarity'] for match in matches), default=0.0)
    completed_at = timezone.now()

    stored_matches = [
        {
            'reportId': match['reportId'],
            'reportName': match['reportName'],
            'similarity': match['similarity'],
            'diffPreview': match['diffPreview'],
        }
        for match in matches
    ]

    check = Check.objects.create(
        report=report,
        status='completed',
        similarity=similarity,
        matches=stored_matches,
        completed_at=completed_at,
    )

    return check


@csrf_exempt
def reports_collection(request: HttpRequest) -> JsonResponse:
    if request.method == 'GET':
        reports = [_serialize_report(report) for report in Report.objects.all()]
        cloud_reports_count = sum(1 for report in reports if report['addedToCloud'])
        return _json_response({
            'reports': reports,
            'cloudReportsCount': cloud_reports_count,
            'cloudSyncErrors': [],
        })

    if request.method == 'POST':
        return _handle_report_upload(request)

    if request.method == 'DELETE':
        deleted_count, _ = Report.objects.all().delete()
        return _json_response({'deleted': deleted_count})

    return _json_response({'message': 'Метод не поддерживается'}, status=405)


def _handle_report_upload(request: HttpRequest) -> JsonResponse:
    files = request.FILES.getlist('files')
    if not files:
        single = request.FILES.get('file')
        files = [single] if single is not None else []
    files = [file for file in files if file.size > 0]

    if not files:
        return _json_response({'message': 'Файлы не найдены в запросе'}, status=400)

    queued_results: List[Dict[str, Any]] = []

    with transaction.atomic():
        for uploaded in files:
            if uploaded.content_type not in {'application/pdf', 'application/octet-stream'} and not uploaded.name.lower().endswith('.pdf'):
                return _json_response({'message': f'Файл «{uploaded.name}» не является PDF'}, status=400)

            try:
                raw_bytes = uploaded.read()
                text = extract_text_from_pdf(raw_bytes)
            except PdfExtractionError as exc:
                return _json_response({'message': str(exc)}, status=400)

            report = Report.objects.create(
                original_name=uploaded.name,
                text=text,
                cloud_link=None,
                added_to_cloud=False,
            )
            check = _create_check(report)
            queued_results.append({
                'reportId': str(report.id),
                'checkId': str(check.id),
                'status': check.status,
            })

    if len(queued_results) == 1:
        return _json_response(queued_results[0], status=202)

    return _json_response({'items': queued_results}, status=202)


@csrf_exempt
def report_detail(request: HttpRequest, report_id: str) -> JsonResponse:
    try:
        report = Report.objects.get(id=report_id)
    except Report.DoesNotExist:
        return _json_response({'message': 'Отчет не найден'}, status=404)

    if request.method == 'GET':
        checks = [
            {
                'id': str(check.id),
                'status': check.status,
                'similarity': round(check.similarity, 2) if check.similarity is not None else None,
                'createdAt': check.created_at.isoformat(),
                'completedAt': check.completed_at.isoformat() if check.completed_at else None,
            }
            for check in report.checks.all()
        ]
        return _json_response({'report': _serialize_report(report), 'checks': checks})

    if request.method == 'DELETE':
        report.delete()
        return _json_response({'report': {'id': str(report_id)}})

    return _json_response({'message': 'Метод не поддерживается'}, status=405)


def _load_diff_segments(source: Report, target: Report) -> List[Dict[str, Any]]:
    segments = build_diff_segments(source.text, target.text)
    return [
        {
            'added': bool(segment['added']),
            'removed': bool(segment['removed']),
            'value': str(segment['value']),
        }
        for segment in segments
    ]


@csrf_exempt
def check_detail(request: HttpRequest, check_id: str) -> JsonResponse:
    try:
        check = Check.objects.select_related('report').get(id=check_id)
    except Check.DoesNotExist:
        return _json_response({'message': 'Проверка не найдена'}, status=404)

    if request.method != 'GET':
        return _json_response({'message': 'Метод не поддерживается'}, status=405)

    return _json_response({'check': _serialize_check(check)})


@csrf_exempt
def diff_view(request: HttpRequest) -> JsonResponse:
    if request.method != 'GET':
        return _json_response({'message': 'Метод не поддерживается'}, status=405)

    source_id = request.GET.get('source')
    target_id = request.GET.get('target')
    if not source_id or not target_id:
        return _json_response({'message': 'source и target обязательны'}, status=400)

    try:
        source_report = Report.objects.get(id=source_id)
        target_report = Report.objects.get(id=target_id)
    except Report.DoesNotExist:
        return _json_response({'message': 'Отчет не найден'}, status=404)

    segments = _load_diff_segments(source_report, target_report)

    return _json_response(
        {
            'source': {'id': str(source_report.id), 'name': source_report.original_name},
            'target': {'id': str(target_report.id), 'name': target_report.original_name},
            'diff': segments,
        }
    )
