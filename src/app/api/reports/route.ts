import { NextRequest, NextResponse } from 'next/server';
import { persistReportFile } from '@/lib/storage';
import { createReport, findLatestCheckForReport, listReports } from '@/lib/repository';
import { queueCheck } from '@/lib/check-processor';

export async function GET() {
  const reports = listReports().map((report) => {
    const latestCheck = findLatestCheckForReport(report.id);
    return {
      id: report.id,
      originalName: report.original_name,
      createdAt: report.created_at,
      latestCheck: latestCheck
        ? {
            id: latestCheck.id,
            status: latestCheck.status,
            similarity: latestCheck.similarity,
            createdAt: latestCheck.created_at,
          }
        : null,
    };
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Файл не найден в запросе' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ message: 'Поддерживаются только PDF файлы' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { default: pdfParse } = await import('pdf-parse');
  const pdfData = await pdfParse(buffer);

  if (!pdfData.text.trim()) {
    return NextResponse.json({ message: 'Не удалось извлечь текст из PDF' }, { status: 400 });
  }

  const stored = persistReportFile(buffer, file.name);
  const report = createReport({
    id: stored.id,
    original_name: file.name,
    stored_name: stored.storedName,
    text_content: pdfData.text,
  });

  const check = queueCheck(report.id);

  return NextResponse.json(
    {
      reportId: report.id,
      checkId: check.id,
      status: check.status,
    },
    { status: 202 }
  );
}
