import { describe, expect, it } from 'vitest';
import { prioritizeReportsForCheck } from './check-processor';
import type { ReportRecord } from './repository';

describe('prioritizeReportsForCheck', () => {
  const makeReport = (overrides: Partial<ReportRecord>): ReportRecord => ({
    id: overrides.id ?? 'id',
    original_name: overrides.original_name ?? 'report.pdf',
    stored_name: overrides.stored_name ?? 'report.pdf',
    text_index: overrides.text_index ?? 'report.txt',
    cloud_link: overrides.cloud_link ?? null,
    added_to_cloud: overrides.added_to_cloud ?? 1,
    priority_indexed_at: overrides.priority_indexed_at ?? null,
    created_at: overrides.created_at ?? '2024-05-01T10:00:00.000Z',
  });

  it('places reports with priority index first', () => {
    const reports: ReportRecord[] = [
      makeReport({ id: 'a', priority_indexed_at: null, created_at: '2024-05-02T10:00:00.000Z' }),
      makeReport({ id: 'b', priority_indexed_at: '2024-05-02T12:00:00.000Z' }),
      makeReport({ id: 'c', priority_indexed_at: '2024-05-01T15:00:00.000Z' }),
    ];

    const sorted = prioritizeReportsForCheck(reports);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by creation date for reports without priority index', () => {
    const reports: ReportRecord[] = [
      makeReport({ id: 'a', created_at: '2024-05-03T10:00:00.000Z' }),
      makeReport({ id: 'b', created_at: '2024-05-01T10:00:00.000Z' }),
      makeReport({ id: 'c', created_at: '2024-05-02T10:00:00.000Z' }),
    ];

    const sorted = prioritizeReportsForCheck(reports);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });
});
