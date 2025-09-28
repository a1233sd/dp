import { NextRequest, NextResponse } from 'next/server';
import { getReportById, listChecks, updateReport } from '@/lib/repository';
import { CloudLinkValidationError, normalizeCloudLink } from '@/lib/cloud-link';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const report = getReportById(params.id);
  if (!report) {
    return NextResponse.json({ message: 'Отчет не найден' }, { status: 404 });
  }
  const relatedChecks = listChecks()
    .filter((check) => check.report_id === report.id)
    .map((check) => ({
      id: check.id,
      status: check.status,
      similarity: check.similarity,
      createdAt: check.created_at,
      completedAt: check.completed_at,
    }));

  return NextResponse.json({
    report: {
      id: report.id,
      originalName: report.original_name,
      createdAt: report.created_at,
      cloudLink: report.cloud_link,
      addedToCloud: Boolean(report.added_to_cloud),
    },
    checks: relatedChecks,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = getReportById(params.id);
  if (!existing) {
    return NextResponse.json({ message: 'Отчет не найден' }, { status: 404 });
  }

  const body = await req.json();
  const updates: { cloud_link?: string | null; added_to_cloud?: boolean } = {};
  const hasExplicitAddedFlag = Object.prototype.hasOwnProperty.call(body, 'addedToCloud');

  if (Object.prototype.hasOwnProperty.call(body, 'cloudLink')) {
    const value = body.cloudLink;
    if (typeof value === 'string' && value.trim()) {
      try {
        updates.cloud_link = normalizeCloudLink(value);
        if (!hasExplicitAddedFlag) {
          updates.added_to_cloud = true;
        }
      } catch (error) {
        if (error instanceof CloudLinkValidationError) {
          return NextResponse.json({ message: error.message }, { status: 400 });
        }
        throw error;
      }
    } else if (value === null || value === '') {
      updates.cloud_link = null;
      if (!hasExplicitAddedFlag) {
        updates.added_to_cloud = false;
      }
    } else {
      return NextResponse.json({ message: 'Некорректный формат ссылки' }, { status: 400 });
    }
  }

  if (hasExplicitAddedFlag) {
    if (typeof body.addedToCloud !== 'boolean') {
      return NextResponse.json({ message: 'Некорректный флаг добавления' }, { status: 400 });
    }
    updates.added_to_cloud = body.addedToCloud;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ message: 'Нет данных для обновления' }, { status: 400 });
  }

  const updated = updateReport(params.id, {
    cloud_link: updates.cloud_link,
    added_to_cloud: updates.added_to_cloud,
  });

  if (!updated) {
    return NextResponse.json({ message: 'Отчет не найден' }, { status: 404 });
  }

  return NextResponse.json({
    report: {
      id: updated.id,
      originalName: updated.original_name,
      createdAt: updated.created_at,
      cloudLink: updated.cloud_link,
      addedToCloud: Boolean(updated.added_to_cloud),
    },
  });
}
