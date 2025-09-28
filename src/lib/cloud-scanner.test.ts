import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pdf-parser', () => ({
  parsePdf: vi.fn(),
}));

vi.mock('./storage', () => ({
  persistReportFile: vi.fn(),
  persistReportText: vi.fn(),
}));

vi.mock('./repository', () => ({
  createReport: vi.fn(),
  findReportByCloudLinkAndName: vi.fn(),
  updateReport: vi.fn(),
}));

import { inspectCloudStorage, syncCloudStorage } from './cloud-scanner';
import { parsePdf } from './pdf-parser';
import { persistReportFile, persistReportText } from './storage';
import { createReport, findReportByCloudLinkAndName } from './repository';

describe('cloud-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = vi.fn();
  });

  it('resolves relative PDF links when the cloud link points to a folder', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);

    const htmlResponse = {
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      url: 'https://example.com/folder',
      text: async () => '<a href="report.pdf">Report</a>',
      arrayBuffer: async () => new ArrayBuffer(0),
    };

    const pdfResponse = {
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => new TextEncoder().encode('pdf-content').buffer,
    };

    fetchMock.mockResolvedValueOnce(htmlResponse as any);
    fetchMock.mockResolvedValueOnce(pdfResponse as any);

    const parsePdfMock = vi.mocked(parsePdf);
    parsePdfMock.mockResolvedValue({ text: 'parsed content' });

    const persistReportFileMock = vi.mocked(persistReportFile);
    persistReportFileMock.mockReturnValue({
      id: 'report-1',
      storedName: 'stored-report.pdf',
      absolutePath: '/tmp/stored-report.pdf',
    } as any);

    const persistReportTextMock = vi.mocked(persistReportText);
    persistReportTextMock.mockReturnValue({
      index: 'report-1.txt',
      absolutePath: '/tmp/report-1.txt',
    } as any);

    vi.mocked(createReport).mockReturnValue({
      id: 'report-1',
      original_name: 'report.pdf',
      stored_name: 'stored-report.pdf',
      text_index: 'report-1.txt',
      cloud_link: 'https://example.com/folder',
      added_to_cloud: 1,
      created_at: new Date().toISOString(),
    } as any);

    vi.mocked(findReportByCloudLinkAndName).mockReturnValue(undefined);

    const result = await syncCloudStorage('https://example.com/folder');

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/folder',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const listingHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers | undefined;
    expect(listingHeaders).toBeInstanceOf(Headers);
    expect(listingHeaders?.get('user-agent')).toContain('Mozilla/5.0');
    expect(listingHeaders?.get('accept')).toContain('text/html');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/folder/report.pdf',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it('extracts files from a Cloud Mail.ru folder page without direct anchors', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);

    const htmlResponse = {
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      url: 'https://cloud.mail.ru/public/example/folder',
      text: async () => `
        <script>
          window.__NUXT__ = {
            state: {
              list: [
                { name: 'folder-report.pdf', href: '/public/example/folder/folder-report.pdf' },
                { name: 'another.pdf', href: '/public/example/folder/another.pdf' }
              ]
            }
          };
        </script>
      `,
    };

    fetchMock.mockResolvedValueOnce(htmlResponse as any);
    vi.mocked(findReportByCloudLinkAndName).mockReturnValue(null);

    const items = await inspectCloudStorage('https://cloud.mail.ru/public/example/folder');

    expect(items).toEqual([
      {
        name: 'folder-report.pdf',
        status: 'new',
      },
      {
        name: 'another.pdf',
        status: 'new',
      },
    ]);
  });

  it('loads PDFs from a shared Yandex.Disk folder', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: 'dir',
          _embedded: {
            items: [
              {
                type: 'file',
                name: 'root.pdf',
                path: 'disk:/root.pdf',
                file: 'https://downloader.disk.yandex.ru/root.pdf',
              },
              {
                type: 'dir',
                name: 'nested',
                path: 'disk:/nested',
              },
            ],
          },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: 'dir',
          _embedded: {
            items: [
              {
                type: 'file',
                name: 'nested.pdf',
                path: 'disk:/nested/nested.pdf',
                file: 'https://downloader.disk.yandex.ru/nested.pdf',
              },
            ],
          },
        }),
      } as any);

    vi.mocked(findReportByCloudLinkAndName).mockReturnValue(undefined);

    const items = await inspectCloudStorage('https://disk.yandex.ru/d/public-folder');

    expect(items).toEqual([
      { name: 'root.pdf', status: 'new' },
      { name: 'nested.pdf', status: 'new' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('cloud-api.yandex.net/v1/disk/public/resources'),
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });
});
