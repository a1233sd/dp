import { NextRequest, NextResponse } from 'next/server';
import { getCheckResult } from '@/lib/check-processor';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const check = getCheckResult(params.id);
  if (!check) {
    return NextResponse.json({ message: 'Проверка не найдена' }, { status: 404 });
  }
  const report = check.report;
  return NextResponse.json({
    check: {
      id: check.id,
      status: check.status,
      similarity: check.similarity,
      matches: check.matches,
      createdAt: check.created_at,
      completedAt: check.completed_at,
      reportId: check.report_id,
      reportName: report?.original_name ?? null,
      reportCloudLink: report?.cloud_link ?? null,
      reportAddedToCloud: report ? Boolean(report.added_to_cloud) : false,
    },
  });
}
