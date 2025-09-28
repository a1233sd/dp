import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/storage', () => ({
  generateReportId: vi.fn(),
  persistReportText: vi.fn(),
  removeReportText: vi.fn(),
}));

vi.mock('@/lib/repository', () => ({
  createReport: vi.fn(),
  listReports: vi.fn(),
  findLatestCheckForReport: vi.fn(),
  deleteAllReports: vi.fn(),
}));

vi.mock('@/lib/check-processor', () => ({
  queueCheck: vi.fn(),
}));

vi.mock('@/lib/pdf-parser', () => ({
  parsePdf: vi.fn(),
}));

vi.mock('@/lib/cloud-scanner', () => ({
  syncCloudStorage: vi.fn(),
  CloudSyncError: class MockCloudSyncError extends Error {},
}));

vi.mock('@/lib/match-index', () => ({
  resetMatchIndex: vi.fn(),
}));

import { DELETE, GET, POST } from './route';
import { generateReportId, persistReportText, removeReportText } from '@/lib/storage';
import { createReport, deleteAllReports, listReports, findLatestCheckForReport } from '@/lib/repository';
import { queueCheck } from '@/lib/check-processor';
import { parsePdf } from '@/lib/pdf-parser';
import { syncCloudStorage, CloudSyncError } from '@/lib/cloud-scanner';
import { config } from '@/lib/config';
import { resetMatchIndex } from '@/lib/match-index';

const generateReportIdMock = vi.mocked(generateReportId);
const createReportMock = vi.mocked(createReport);
const listReportsMock = vi.mocked(listReports);
const findLatestCheckForReportMock = vi.mocked(findLatestCheckForReport);
const queueCheckMock = vi.mocked(queueCheck);
const pdfParseMock = vi.mocked(parsePdf);
const persistReportTextMock = vi.mocked(persistReportText);
const syncCloudStorageMock = vi.mocked(syncCloudStorage);
const deleteAllReportsMock = vi.mocked(deleteAllReports);
const removeReportTextMock = vi.mocked(removeReportText);
const resetMatchIndexMock = vi.mocked(resetMatchIndex);

describe('GET /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncCloudStorageMock.mockResolvedValue({ imported: 0, activated: 0, skipped: 0, errors: [] });
    listReportsMock.mockReturnValue([]);
    findLatestCheckForReportMock.mockReturnValue(undefined);
  });

  it('synchronizes cloud storage before listing reports', async () => {
    syncCloudStorageMock.mockResolvedValueOnce({ imported: 0, activated: 0, skipped: 1, errors: [] });
    listReportsMock.mockReturnValue([
      {
        id: 'report-1',
        original_name: 'report.pdf',
        text_index: 'report-1.txt',
        cloud_link: 'https://cloud.example/reports',
        added_to_cloud: 1,
        created_at: '2024-01-01T00:00:00.000Z',
      },
    ]);

    findLatestCheckForReportMock.mockReturnValue({
      id: 'check-1',
      report_id: 'report-1',
      status: 'completed',
      similarity: 87.5,
      matches: '[]',
      created_at: '2024-01-01T00:05:00.000Z',
      completed_at: '2024-01-01T00:06:00.000Z',
    });

    const response = await GET();

    expect(syncCloudStorageMock).toHaveBeenCalledWith(config.cloudArchiveLink);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          id: 'report-1',
          originalName: 'report.pdf',
          createdAt: '2024-01-01T00:00:00.000Z',
          cloudLink: 'https://cloud.example/reports',
          addedToCloud: true,
          latestCheck: {
            id: 'check-1',
            status: 'completed',
            similarity: 87.5,
            createdAt: '2024-01-01T00:05:00.000Z',
          },
        },
      ],
      cloudReportsCount: 1,
      cloudSyncErrors: [],
    });
  });

  it('returns error when cloud synchronization fails with validation issue', async () => {
    syncCloudStorageMock.mockRejectedValueOnce(new CloudSyncError('Cloud validation error'));

    const response = await GET();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'Cloud validation error' });
  });

  it('returns generic error when cloud synchronization fails unexpectedly', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    syncCloudStorageMock.mockRejectedValueOnce(new Error('network down'));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: 'Не удалось синхронизировать облачные файлы для сравнения',
    });
    consoleSpy.mockRestore();
  });
});

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncCloudStorageMock.mockResolvedValue({ imported: 0, activated: 0, skipped: 0, errors: [] });
  });

  it('saves uploaded report and queues a check', async () => {
    const file = new File(['%PDF-1.7 test content'], 'report.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);

    const reportId = 'report-123';
    generateReportIdMock.mockReturnValue(reportId);
    persistReportTextMock.mockReturnValue({
      index: 'report-123.txt',
      absolutePath: '/tmp/report-123.txt',
    });

    createReportMock.mockReturnValue({
      id: reportId,
      original_name: file.name,
      text_index: 'report-123.txt',
      cloud_link: config.cloudArchiveLink,
      added_to_cloud: 0,
      created_at: '2024-01-01T00:00:00.000Z',
    });

    queueCheckMock.mockReturnValue({
      id: 'check-456',
      report_id: reportId,
      status: 'queued',
      similarity: null,
      matches: '[]',
      created_at: '2024-01-01T00:01:00.000Z',
      completed_at: null,
    });

    pdfParseMock.mockResolvedValue({
      text: 'parsed text',
    });

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      reportId: reportId,
      checkId: 'check-456',
      status: 'queued',
    });

    expect(generateReportIdMock).toHaveBeenCalled();
    expect(persistReportTextMock).toHaveBeenCalledWith(reportId, 'parsed text');

    expect(createReportMock).toHaveBeenCalledWith({
      id: reportId,
      original_name: 'report.pdf',
      text_index: 'report-123.txt',
      cloud_link: config.cloudArchiveLink,
    });

    expect(queueCheckMock).toHaveBeenCalledWith(reportId);
    expect(syncCloudStorageMock).toHaveBeenCalledWith(config.cloudArchiveLink);
  });

  it('supports uploading multiple PDF files at once', async () => {
    const files = [
      new File(['%PDF-1.7 test content'], 'first.pdf', { type: 'application/pdf' }),
      new File(['%PDF-1.7 test content 2'], 'second.pdf', { type: 'application/pdf' }),
    ];
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    generateReportIdMock.mockReturnValueOnce('report-1').mockReturnValueOnce('report-2');

    persistReportTextMock
      .mockReturnValueOnce({ index: 'report-1.txt', absolutePath: '/tmp/report-1.txt' })
      .mockReturnValueOnce({ index: 'report-2.txt', absolutePath: '/tmp/report-2.txt' });

    createReportMock
      .mockReturnValueOnce({
        id: 'report-1',
        original_name: 'first.pdf',
        text_index: 'report-1.txt',
        cloud_link: config.cloudArchiveLink,
        added_to_cloud: 0,
        created_at: '2024-01-01T00:00:00.000Z',
      })
      .mockReturnValueOnce({
        id: 'report-2',
        original_name: 'second.pdf',
        text_index: 'report-2.txt',
        cloud_link: config.cloudArchiveLink,
        added_to_cloud: 0,
        created_at: '2024-01-01T00:00:10.000Z',
      });

    queueCheckMock
      .mockReturnValueOnce({
        id: 'check-1',
        report_id: 'report-1',
        status: 'queued',
        similarity: null,
        matches: '[]',
        created_at: '2024-01-01T00:01:00.000Z',
        completed_at: null,
      })
      .mockReturnValueOnce({
        id: 'check-2',
        report_id: 'report-2',
        status: 'queued',
        similarity: null,
        matches: '[]',
        created_at: '2024-01-01T00:01:10.000Z',
        completed_at: null,
      });

    pdfParseMock.mockResolvedValue({ text: 'parsed text' });

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      items: [
        { reportId: 'report-1', checkId: 'check-1', status: 'queued' },
        { reportId: 'report-2', checkId: 'check-2', status: 'queued' },
      ],
    });

    expect(persistReportTextMock).toHaveBeenNthCalledWith(1, 'report-1', 'parsed text');
    expect(persistReportTextMock).toHaveBeenNthCalledWith(2, 'report-2', 'parsed text');
    expect(queueCheckMock).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when pdf parsing fails', async () => {
    const file = new File(['%PDF-1.7 invalid'], 'broken.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);

    pdfParseMock.mockRejectedValue(new Error('Invalid PDF structure.'));

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Не удалось обработать PDF «broken.pdf». Проверьте, что файл не поврежден и содержит текст.',
    });

    expect(generateReportIdMock).not.toHaveBeenCalled();
    expect(persistReportTextMock).not.toHaveBeenCalled();
    expect(createReportMock).not.toHaveBeenCalled();
    expect(queueCheckMock).not.toHaveBeenCalled();
  });

  it('returns 400 when cloud sync reports a validation issue', async () => {
    const file = new File(['%PDF-1.7 test content'], 'report.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);

    syncCloudStorageMock.mockRejectedValueOnce(new CloudSyncError('Cloud validation error'));

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'Cloud validation error' });
    expect(generateReportIdMock).not.toHaveBeenCalled();
  });

  it('returns 502 when cloud sync fails unexpectedly', async () => {
    const file = new File(['%PDF-1.7 test content'], 'report.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    syncCloudStorageMock.mockRejectedValueOnce(new Error('network down'));

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: 'Не удалось синхронизировать облачные файлы для сравнения',
    });
    expect(generateReportIdMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes all reports and their stored files', async () => {
    deleteAllReportsMock.mockReturnValue([
      {
        id: 'report-1',
        original_name: 'report.pdf',
        text_index: 'report.txt',
        cloud_link: null,
        added_to_cloud: 0,
        created_at: '2024-01-01T00:00:00.000Z',
      },
    ] as any);

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 1 });
    expect(removeReportTextMock).toHaveBeenCalledWith('report.txt');
    expect(resetMatchIndexMock).toHaveBeenCalled();
  });

  it('returns zero when there are no reports to delete', async () => {
    deleteAllReportsMock.mockReturnValue([]);

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 0 });
    expect(removeReportTextMock).not.toHaveBeenCalled();
    expect(resetMatchIndexMock).not.toHaveBeenCalled();
  });
});
