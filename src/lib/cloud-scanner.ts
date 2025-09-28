import { parsePdf } from './pdf-parser';
import { generateReportId, persistReportText } from './storage';
import {
  createReport,
  findReportByCloudLinkAndName,
  updateReport,
} from './repository';

export class CloudSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudSyncError';
  }
}

interface CloudResource {
  name: string;
  url?: string;
  arrayBuffer?: ArrayBuffer;
}

interface SyncResult {
  imported: number;
  activated: number;
  skipped: number;
  errors: string[];
}

export type CloudPreviewStatus = 'new' | 'existing' | 'pending';

export interface CloudPreviewItem {
  name: string;
  status: CloudPreviewStatus;
}

const PDF_EXTENSION_REGEX = /\.pdf(?:$|[?#])/i;

function isYandexDiskLink(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith('disk.yandex.ru');
  } catch {
    return false;
  }
}

async function resolveYandexDownloadUrl(publicKey: string, path: string): Promise<string> {
  const params = new URLSearchParams({ public_key: publicKey });
  if (path) {
    params.set('path', path);
  }
  const response = await fetchWithBrowserHeaders(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?${params.toString()}`
  );
  if (!response.ok) {
    throw new CloudSyncError('Не удалось получить ссылку для скачивания файла из Яндекс.Диска');
  }
  const payload = await response.json().catch(() => null);
  const href = payload && typeof payload.href === 'string' ? payload.href : null;
  if (!href) {
    throw new CloudSyncError('Не удалось получить ссылку для скачивания файла из Яндекс.Диска');
  }
  return href;
}

async function tryListYandexDiskResources(cloudLink: string): Promise<CloudResource[] | null> {
  if (!isYandexDiskLink(cloudLink)) {
    return null;
  }

  const publicKey = cloudLink;
  const resources: CloudResource[] = [];
  const visited = new Set<string>();
  const queue: (string | undefined)[] = [undefined];

  const fetchListing = async (path?: string) => {
    const params = new URLSearchParams({ public_key: publicKey, limit: '500' });
    if (path) {
      params.set('path', path);
    }
    const response = await fetchWithBrowserHeaders(
      `https://cloud-api.yandex.net/v1/disk/public/resources?${params.toString()}`
    );
    if (!response.ok) {
      throw new CloudSyncError('Не удалось получить список файлов из Яндекс.Диска');
    }
    return response.json().catch(() => {
      throw new CloudSyncError('Яндекс.Диск вернул некорректный список файлов');
    });
  };

  const consumeFile = async (entry: any) => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name || !PDF_EXTENSION_REGEX.test(name)) {
      return;
    }
    const path = typeof entry?.path === 'string' ? entry.path : '';
    let url = typeof entry?.file === 'string' ? entry.file : undefined;
    if (!url && path) {
      url = await resolveYandexDownloadUrl(publicKey, path);
    }
    if (!url) {
      throw new CloudSyncError(`Не удалось получить ссылку на файл «${name}» из Яндекс.Диска`);
    }
    resources.push({ name, url });
  };

  while (queue.length) {
    const path = queue.shift();
    const payload = await fetchListing(path);

    if (payload?.type === 'file') {
      await consumeFile(payload);
      continue;
    }

    const items: any[] = Array.isArray(payload?._embedded?.items) ? payload._embedded.items : [];
    for (const item of items) {
      if (item?.type === 'dir') {
        const nestedPath = typeof item.path === 'string' ? item.path : null;
        if (nestedPath && !visited.has(nestedPath)) {
          visited.add(nestedPath);
          queue.push(nestedPath);
        }
        continue;
      }
      if (item?.type === 'file') {
        await consumeFile(item);
      }
    }
  }

  if (!resources.length) {
    throw new CloudSyncError('В облаке не найдены PDF файлы. Проверьте ссылку или предоставьте прямой список.');
  }

  return resources;
}

function guessFileName(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    if (last) {
      return decodeURIComponent(last) || 'cloud-file.pdf';
    }
  } catch {
    // ignore
  }
  return 'cloud-file.pdf';
}

function ensureDirectoryBase(base: string): string {
  try {
    const parsed = new URL(base);
    if (parsed.pathname.endsWith('/')) {
      return parsed.toString();
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.at(-1);

    if (!last) {
      return parsed.toString();
    }

    const hasExtension = last.includes('.') || /%2e/i.test(last);
    if (hasExtension) {
      return parsed.toString();
    }

    parsed.pathname = `${parsed.pathname}/`;
    return parsed.toString();
  } catch {
    return base;
  }
}

function normaliseUrl(base: string, value: string): string {
  const normalisedBase = ensureDirectoryBase(base);
  return new URL(value, normalisedBase).toString();
}

const BROWSER_FETCH_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function mergeBrowserHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  for (const [key, value] of Object.entries(BROWSER_FETCH_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return { ...init, headers };
}

async function fetchWithBrowserHeaders(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, mergeBrowserHeaders(init));
}

function decodePotentiallyEscapedUrl(value: string): string {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\u002[fF]/g, '/')
    .replace(/&amp;/g, '&')
    .trim();
}

async function parseListingResponse(cloudLink: string): Promise<CloudResource[]> {
  const yandexResources = await tryListYandexDiskResources(cloudLink);
  if (yandexResources) {
    return yandexResources;
  }

  const response = await fetchWithBrowserHeaders(cloudLink);
  if (!response.ok) {
    throw new CloudSyncError('Не удалось получить список файлов из облака');
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const finalUrl = response.url || cloudLink;

  if (contentType.includes('application/pdf') || PDF_EXTENSION_REGEX.test(finalUrl)) {
    const arrayBuffer = await response.arrayBuffer();
    return [
      {
        name: guessFileName(finalUrl),
        arrayBuffer,
      },
    ];
  }

  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    try {
      const payload = await response.json();
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.files) ? payload.files : [];
      const resources: CloudResource[] = [];
      for (const item of items) {
        if (typeof item === 'string') {
          const url = normaliseUrl(finalUrl, item);
          resources.push({ name: guessFileName(url), url });
        } else if (item && typeof item === 'object') {
          const rawUrl = typeof item.url === 'string' ? item.url : typeof item.href === 'string' ? item.href : null;
          if (!rawUrl) {
            continue;
          }
          const url = normaliseUrl(finalUrl, rawUrl);
          const name = typeof item.name === 'string' && item.name.trim().length ? item.name.trim() : guessFileName(url);
          resources.push({ name, url });
        }
      }
      if (!resources.length) {
        throw new CloudSyncError('В облаке не найдено PDF файлов для синхронизации');
      }
      return resources;
    } catch (error) {
      if (error instanceof CloudSyncError) {
        throw error;
      }
      throw new CloudSyncError('Облако вернуло некорректный JSON со списком файлов');
    }
  }

  const body = await response.text();
  const linkRegex = /href=["']([^"']+)["']/gi;
  const resources = new Map<string, CloudResource>();
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(body)) !== null) {
    const href = match[1];
    if (!PDF_EXTENSION_REGEX.test(href)) {
      continue;
    }
    try {
      const url = normaliseUrl(finalUrl, href);
      resources.set(url, { name: guessFileName(url), url });
    } catch {
      // ignore invalid URLs
    }
  }

  if (!resources.size) {
    try {
      const parsedUrl = new URL(finalUrl);
      if (parsedUrl.hostname.endsWith('cloud.mail.ru')) {
        const cloudMailLinkRegex = /["']([^"'<>]*?\.pdf[^"'<>]*)["']/gi;
        while ((match = cloudMailLinkRegex.exec(body)) !== null) {
          const raw = match[1];
          if (!raw?.includes('/public/')) {
            continue;
          }
          const cleaned = decodePotentiallyEscapedUrl(raw);
          let candidate = cleaned;
          if (candidate.startsWith('//')) {
            candidate = `https:${candidate}`;
          } else if (!candidate.startsWith('http')) {
            if (!candidate.startsWith('/')) {
              candidate = `/public/${candidate.replace(/^public\/?/, '')}`;
            }
          }
          try {
            const url = normaliseUrl(finalUrl, candidate);
            resources.set(url, { name: guessFileName(url), url });
          } catch {
            // ignore invalid URLs
          }
        }
      }
    } catch {
      // ignore parsing URL errors and fall back to default behaviour below
    }
  }

  if (!resources.size) {
    throw new CloudSyncError('В облаке не найдены PDF файлы. Проверьте ссылку или предоставьте прямой список.');
  }

  return Array.from(resources.values());
}

function resolvePreviewStatus(cloudLink: string, resource: CloudResource): CloudPreviewStatus {
  const existing = findReportByCloudLinkAndName(cloudLink, resource.name);
  if (!existing) {
    return 'new';
  }
  return existing.added_to_cloud ? 'existing' : 'pending';
}

export async function inspectCloudStorage(cloudLink: string): Promise<CloudPreviewItem[]> {
  const resources = await parseListingResponse(cloudLink);
  const unique = new Map<string, CloudPreviewItem>();
  for (const resource of resources) {
    const status = resolvePreviewStatus(cloudLink, resource);
    if (!unique.has(resource.name)) {
      unique.set(resource.name, { name: resource.name, status });
      continue;
    }
    const current = unique.get(resource.name);
    if (!current) {
      continue;
    }
    if (current.status === 'new' && status !== 'new') {
      unique.set(resource.name, { name: resource.name, status });
    }
    if (current.status === 'pending' && status === 'existing') {
      unique.set(resource.name, { name: resource.name, status });
    }
  }
  return Array.from(unique.values());
}

async function downloadResource(resource: CloudResource): Promise<ArrayBuffer> {
  if (resource.arrayBuffer) {
    return resource.arrayBuffer;
  }
  if (!resource.url) {
    throw new CloudSyncError('Ссылка на файл из облака отсутствует');
  }
  const response = await fetchWithBrowserHeaders(resource.url, {
    headers: {
      accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new CloudSyncError(`Не удалось скачать файл из облака: ${resource.name}`);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/pdf') && !PDF_EXTENSION_REGEX.test(resource.url)) {
    throw new CloudSyncError(`Файл «${resource.name}» не является PDF`);
  }
  return response.arrayBuffer();
}

export async function syncCloudStorage(cloudLink: string): Promise<SyncResult> {
  const resources = await parseListingResponse(cloudLink);
  const errors: string[] = [];
  let imported = 0;
  let activated = 0;
  let skipped = 0;

  for (const resource of resources) {
    try {
      const existing = findReportByCloudLinkAndName(cloudLink, resource.name);
      if (existing) {
        skipped += 1;
        if (!existing.added_to_cloud) {
          updateReport(existing.id, { added_to_cloud: true });
          activated += 1;
        }
        continue;
      }

      const arrayBuffer = await downloadResource(resource);
      const uint8 = new Uint8Array(arrayBuffer);
      const pdfData = await parsePdf(uint8);

      if (!pdfData.text?.trim()) {
        errors.push(`Не удалось извлечь текст из «${resource.name}»`);
        continue;
      }

      const reportId = generateReportId();
      const textIndex = persistReportText(reportId, pdfData.text);
      createReport({
        id: reportId,
        original_name: resource.name,
        text_index: textIndex.index,
        cloud_link: cloudLink,
        added_to_cloud: true,
      });
      imported += 1;
    } catch (error) {
      if (error instanceof CloudSyncError) {
        errors.push(error.message);
      } else if (error instanceof Error) {
        errors.push(error.message);
      } else {
        errors.push('Неизвестная ошибка синхронизации облака');
      }
    }
  }

  if (!imported && !activated && !skipped) {
    throw new CloudSyncError('В облачном хранилище не удалось найти подходящие PDF файлы');
  }

  return { imported, activated, skipped, errors };
}
