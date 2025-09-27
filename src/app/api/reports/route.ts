import { NextRequest, NextResponse } from 'next/server';
import { persistReportFile, persistReportText } from '@/lib/storage';
import { createReport, findLatestCheckForReport, listReports } from '@/lib/repository';
import { queueCheck } from '@/lib/check-processor';
import { parsePdf } from '@/lib/pdf-parser';

export async function GET() {
  const reports = listReports().map((report) => {
    const latestCheck = findLatestCheckForReport(report.id);
    return {
      id: report.id,
      originalName: report.original_name,
      createdAt: report.created_at,
      cloudLink: report.cloud_link,
      addedToCloud: Boolean(report.added_to_cloud),
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
  const cloudLinkRaw = formData.get('cloudLink');
  let cloudLink: string | null = null;

  if (typeof cloudLinkRaw === 'string' && cloudLinkRaw.trim()) {
    try {
      const parsed = new URL(cloudLinkRaw.trim());
      cloudLink = parsed.toString();
    } catch {
      return NextResponse.json({ message: 'Некорректная ссылка на облачный диск' }, { status: 400 });
    }
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'Файл не найден в запросе' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ message: 'Поддерживаются только PDF файлы' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const buffer = Buffer.from(uint8Array);
  const pdfData = await parsePdf(uint8Array);

  if (!pdfData.text.trim()) {
    return NextResponse.json({ message: 'Не удалось извлечь текст из PDF' }, { status: 400 });
  }

  const stored = persistReportFile(buffer, file.name);
  const textIndex = persistReportText(stored.id, pdfData.text);
  const report = createReport({
    id: stored.id,
    original_name: file.name,
    stored_name: stored.storedName,
    text_index: textIndex.index,
    cloud_link: cloudLink,
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
