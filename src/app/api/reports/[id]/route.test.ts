import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/repository', () => ({
  getReportById: vi.fn(),
  listChecks: vi.fn(),
  updateReport: vi.fn(),
}));

import { PATCH } from './route';
import { getReportById, updateReport } from '@/lib/repository';
import type { ReportRecord } from '@/lib/repository';

const getReportByIdMock = vi.mocked(getReportById);
const updateReportMock = vi.mocked(updateReport);

const baseReport: ReportRecord = {
  id: 'report-1',
  original_name: 'report.pdf',
  stored_name: 'stored.pdf',
  text_index: 'report-1.txt',
  cloud_link: null,
  added_to_cloud: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('PATCH /api/reports/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReportByIdMock.mockReturnValue(baseReport);
  });

  it('automatically marks report as added to cloud when link is provided', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: 'https://disk.yandex.ru/d/folder' }),
    } as unknown as NextRequest;

    updateReportMock.mockReturnValue({
      ...baseReport,
      cloud_link: 'https://disk.yandex.ru/d/folder',
      added_to_cloud: 1,
    });

    const response = await PATCH(request, { params: { id: baseReport.id } });

    expect(updateReportMock).toHaveBeenCalledWith(baseReport.id, {
      cloud_link: 'https://disk.yandex.ru/d/folder',
      added_to_cloud: true,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: {
        id: baseReport.id,
        originalName: baseReport.original_name,
        createdAt: baseReport.created_at,
        cloudLink: 'https://disk.yandex.ru/d/folder',
        addedToCloud: true,
      },
    });
  });

  it('unmarks report when cloud link is cleared', async () => {
    getReportByIdMock.mockReturnValueOnce({
      ...baseReport,
      cloud_link: 'https://disk.yandex.ru/d/folder',
      added_to_cloud: 1,
    });

    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: '' }),
    } as unknown as NextRequest;

    updateReportMock.mockReturnValue({
      ...baseReport,
      cloud_link: null,
      added_to_cloud: 0,
    });

    const response = await PATCH(request, { params: { id: baseReport.id } });

    expect(updateReportMock).toHaveBeenCalledWith(baseReport.id, {
      cloud_link: null,
      added_to_cloud: false,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: {
        id: baseReport.id,
        originalName: baseReport.original_name,
        createdAt: baseReport.created_at,
        cloudLink: null,
        addedToCloud: false,
      },
    });
  });
});
