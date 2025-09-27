import { NextRequest, NextResponse } from 'next/server';
import { diffLines } from 'diff';
import { getReportById } from '@/lib/repository';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const sourceId = searchParams.get('source');
  const targetId = searchParams.get('target');
  if (!sourceId || !targetId) {
    return NextResponse.json({ message: 'source и target обязательны' }, { status: 400 });
  }
  const source = getReportById(sourceId);
  const target = getReportById(targetId);
  if (!source || !target) {
    return NextResponse.json({ message: 'Отчет не найден' }, { status: 404 });
  }

  const diff = diffLines(source.text_content, target.text_content).map((part) => ({
    added: !!part.added,
    removed: !!part.removed,
    value: part.value,
  }));

  return NextResponse.json({
    source: {
      id: source.id,
      name: source.original_name,
    },
    target: {
      id: target.id,
      name: target.original_name,
    },
    diff,
  });
}
