import { NextRequest, NextResponse } from 'next/server';
import { getReportById, listChecks } from '@/lib/repository';

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
    },
    checks: relatedChecks,
  });
}
