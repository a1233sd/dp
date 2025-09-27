import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/storage', () => ({
  persistReportFile: vi.fn(),
  persistReportText: vi.fn(),
}));

vi.mock('@/lib/repository', () => ({
  createReport: vi.fn(),
  listReports: vi.fn(),
  findLatestCheckForReport: vi.fn(),
}));

vi.mock('@/lib/check-processor', () => ({
  queueCheck: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import { POST } from './route';
import { persistReportFile, persistReportText } from '@/lib/storage';
import { createReport } from '@/lib/repository';
import { queueCheck } from '@/lib/check-processor';
import pdfParse from 'pdf-parse';

const persistReportFileMock = vi.mocked(persistReportFile);
const createReportMock = vi.mocked(createReport);
const queueCheckMock = vi.mocked(queueCheck);
const pdfParseMock = vi.mocked(pdfParse);
const persistReportTextMock = vi.mocked(persistReportText);

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves uploaded report and queues a check', async () => {
    const file = new File(['%PDF-1.7 test content'], 'report.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);
    formData.set('cloudLink', 'https://example.com/report');

    const storedReport = {
      id: 'report-123',
      storedName: 'report-123.pdf',
      absolutePath: '/tmp/report-123.pdf',
    };
    persistReportFileMock.mockReturnValue(storedReport);
    persistReportTextMock.mockReturnValue({
      index: 'report-123.txt',
      absolutePath: '/tmp/report-123.txt',
    });

    createReportMock.mockReturnValue({
      id: storedReport.id,
      original_name: file.name,
      stored_name: storedReport.storedName,
      text_index: 'report-123.txt',
      cloud_link: 'https://example.com/report',
      added_to_cloud: 0,
      created_at: '2024-01-01T00:00:00.000Z',
    });

    queueCheckMock.mockReturnValue({
      id: 'check-456',
      report_id: storedReport.id,
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
      reportId: storedReport.id,
      checkId: 'check-456',
      status: 'queued',
    });

    expect(persistReportFileMock).toHaveBeenCalledTimes(1);
    expect(persistReportFileMock.mock.calls[0][0]).toBeInstanceOf(Buffer);
    expect(persistReportFileMock.mock.calls[0][1]).toBe('report.pdf');

    expect(persistReportTextMock).toHaveBeenCalledWith(storedReport.id, 'parsed text');

    expect(createReportMock).toHaveBeenCalledWith({
      id: storedReport.id,
      original_name: 'report.pdf',
      stored_name: storedReport.storedName,
      text_index: 'report-123.txt',
      cloud_link: 'https://example.com/report',
    });

    expect(queueCheckMock).toHaveBeenCalledWith(storedReport.id);
  });

  it('returns 400 when cloud link is invalid', async () => {
    const file = new File(['%PDF-1.7 test content'], 'report.pdf', {
      type: 'application/pdf',
    });
    const formData = new FormData();
    formData.set('file', file);
    formData.set('cloudLink', 'not-a-valid-url');

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Некорректная ссылка на облачный диск',
    });

    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(persistReportFileMock).not.toHaveBeenCalled();
    expect(createReportMock).not.toHaveBeenCalled();
    expect(queueCheckMock).not.toHaveBeenCalled();
  });
});
