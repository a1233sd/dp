import { NextRequest, NextResponse } from 'next/server';
import { deleteReport, getReportById, listChecks } from '@/lib/repository';
import { removeReportFromMatchIndex } from '@/lib/match-index';
import { removeReportText } from '@/lib/storage';

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const removed = deleteReport(params.id);
  if (!removed) {
    return NextResponse.json({ message: 'Отчет не найден' }, { status: 404 });
  }
  removeReportText(removed.text_index);
  removeReportFromMatchIndex(removed.id);
  return NextResponse.json({
    report: {
      id: removed.id,
    },
  });
}
