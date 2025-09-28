export class CloudLinkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudLinkValidationError';
  }
}

const SUPPORTED_CLOUD_DOMAINS = [
  'disk.yandex.ru',
  'yadi.sk',
  'cloud.mail.ru',
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'onedrive.live.com',
  'sharepoint.com',
  'mega.nz',
];

export function isSupportedCloudHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return SUPPORTED_CLOUD_DOMAINS.some((domain) => {
    const target = domain.toLowerCase();
    return normalized === target || normalized.endsWith(`.${target}`);
  });
}

export function normalizeCloudLink(raw: string): string {
  const value = raw?.trim();
  if (!value) {
    throw new CloudLinkValidationError('Ссылка на облачный диск обязательна');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CloudLinkValidationError('Некорректная ссылка на облачный диск');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CloudLinkValidationError('Ссылка на облачный диск должна начинаться с http или https');
  }

  if (!isSupportedCloudHost(parsed.hostname)) {
    throw new CloudLinkValidationError('Ссылка должна вести на поддерживаемое облачное хранилище');
  }

  return parsed.toString();
}
