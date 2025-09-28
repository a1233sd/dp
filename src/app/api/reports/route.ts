import { NextRequest, NextResponse } from 'next/server';
import { persistReportFile, persistReportText, removeReportFile, removeReportText } from '@/lib/storage';
import { createReport, deleteAllReports, findLatestCheckForReport, listReports } from '@/lib/repository';
import { queueCheck } from '@/lib/check-processor';
import { parsePdf } from '@/lib/pdf-parser';
import { CloudSyncError, syncCloudStorage } from '@/lib/cloud-scanner';
import { config } from '@/lib/config';

export async function GET() {
  let cloudSyncResult: Awaited<ReturnType<typeof syncCloudStorage>> | null = null;
  try {
    cloudSyncResult = await syncCloudStorage(config.cloudArchiveLink);
  } catch (error) {
    if (error instanceof CloudSyncError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Cloud synchronization failed', error);
    return NextResponse.json(
      { message: 'Не удалось синхронизировать облачные файлы для сравнения' },
      { status: 502 }
    );
  }

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
  const cloudReportsCount = reports.filter((report) => report.addedToCloud).length;
  return NextResponse.json({
    reports,
    cloudReportsCount,
    cloudSyncErrors: cloudSyncResult?.errors ?? [],
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const cloudLink = config.cloudArchiveLink;

  const files = formData
    .getAll('files')
    .filter((item): item is File => item instanceof File && item.size > 0);

  const fileList = files.length
    ? files
    : (() => {
        const single = formData.get('file');
        return single instanceof File && single.size > 0 ? [single] : [];
      })();

  if (!fileList.length) {
    return NextResponse.json({ message: 'Файлы не найдены в запросе' }, { status: 400 });
  }

  try {
    await syncCloudStorage(cloudLink);
  } catch (error) {
    if (error instanceof CloudSyncError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Cloud synchronization failed', error);
    return NextResponse.json(
      { message: 'Не удалось синхронизировать облачные файлы для сравнения' },
      { status: 502 }
    );
  }

  const results: { reportId: string; checkId: string; status: string }[] = [];

  for (const file of fileList) {
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { message: `Файл «${file.name}» не является PDF` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const buffer = Buffer.from(uint8Array);

    let pdfData: Awaited<ReturnType<typeof parsePdf>>;
    try {
      pdfData = await parsePdf(uint8Array);
    } catch {
      return NextResponse.json(
        {
          message: `Не удалось обработать PDF «${file.name}». Проверьте, что файл не поврежден и содержит текст.`,
        },
        { status: 400 }
      );
    }

    if (!pdfData.text?.trim()) {
      return NextResponse.json(
        { message: `Не удалось извлечь текст из PDF «${file.name}»` },
        { status: 400 }
      );
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
    results.push({ reportId: report.id, checkId: check.id, status: check.status });
  }

  if (results.length === 1) {
    return NextResponse.json(results[0], { status: 202 });
  }

  return NextResponse.json({ items: results }, { status: 202 });
}

export async function DELETE() {
  const removed = deleteAllReports();
  removed.forEach((report) => {
    removeReportFile(report.stored_name);
    removeReportText(report.text_index);
  });
  return NextResponse.json({ deleted: removed.length });
}
