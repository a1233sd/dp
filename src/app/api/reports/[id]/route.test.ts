import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/repository', () => ({
  getReportById: vi.fn(),
  listChecks: vi.fn(),
  deleteReport: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  removeReportText: vi.fn(),
}));

vi.mock('@/lib/match-index', () => ({
  removeReportFromMatchIndex: vi.fn(),
}));

import { DELETE } from './route';
import { deleteReport } from '@/lib/repository';
import type { ReportRecord } from '@/lib/repository';
import { removeReportText } from '@/lib/storage';
import { removeReportFromMatchIndex } from '@/lib/match-index';

const deleteReportMock = vi.mocked(deleteReport);
const removeReportTextMock = vi.mocked(removeReportText);
const removeReportFromMatchIndexMock = vi.mocked(removeReportFromMatchIndex);

const baseReport: ReportRecord = {
  id: 'report-1',
  original_name: 'report.pdf',
  text_index: 'report-1.txt',
  cloud_link: null,
  added_to_cloud: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('DELETE /api/reports/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteReportMock.mockReturnValue(baseReport);
  });

  it('removes report files when deletion succeeds', async () => {
    const response = await DELETE({} as NextRequest, { params: { id: baseReport.id } });

    expect(deleteReportMock).toHaveBeenCalledWith(baseReport.id);
    expect(removeReportTextMock).toHaveBeenCalledWith(baseReport.text_index);
    expect(removeReportFromMatchIndexMock).toHaveBeenCalledWith(baseReport.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ report: { id: baseReport.id } });
  });

  it('returns 404 when report is missing', async () => {
    deleteReportMock.mockReturnValueOnce(undefined);

    const response = await DELETE({} as NextRequest, { params: { id: 'missing' } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: 'Отчет не найден' });
  });
});
