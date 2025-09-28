import { NextRequest, NextResponse } from 'next/server';
import { CloudLinkValidationError, normalizeCloudLink } from '@/lib/cloud-link';
import { CloudSyncError, inspectCloudStorage } from '@/lib/cloud-scanner';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ссылка на облачный диск обязательна' }, { status: 400 });
  }

  const cloudLinkRaw = (body as { cloudLink?: unknown })?.cloudLink;
  if (typeof cloudLinkRaw !== 'string') {
    return NextResponse.json({ message: 'Ссылка на облачный диск обязательна' }, { status: 400 });
  }

  let cloudLink: string;
  try {
    cloudLink = normalizeCloudLink(cloudLinkRaw);
  } catch (error) {
    if (error instanceof CloudLinkValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const resources = await inspectCloudStorage(cloudLink);
    return NextResponse.json({ cloudLink, resources });
  } catch (error) {
    if (error instanceof CloudSyncError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Cloud inspection failed', error);
    return NextResponse.json({ message: 'Не удалось просканировать облачное хранилище' }, { status: 502 });
  }
}
