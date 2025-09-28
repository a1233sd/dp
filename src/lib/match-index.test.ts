import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

describe('match-index', () => {
  let tempDir: string;
  let api: typeof import('./match-index');

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'match-index-'));
    process.env.REPORT_STORAGE_DIR = tempDir;
    vi.resetModules();
    api = await import('./match-index');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.REPORT_STORAGE_DIR;
  });

  it('stores unique symmetric matches', () => {
    api.updateMatchIndex('report-a', ['report-b', 'report-c', 'report-b']);

    expect(api.getIndexedMatches('report-a')).toEqual(['report-b', 'report-c']);
    expect(api.getIndexedMatches('report-b')).toEqual(['report-a']);
    expect(api.getIndexedMatches('report-c')).toEqual(['report-a']);
  });

  it('removes stale references when a report is deleted', () => {
    api.updateMatchIndex('report-a', ['report-b']);
    api.updateMatchIndex('report-b', ['report-c']);

    api.removeReportFromMatchIndex('report-b');

    expect(api.getIndexedMatches('report-a')).toEqual([]);
    expect(api.getIndexedMatches('report-b')).toEqual([]);
    expect(api.getIndexedMatches('report-c')).toEqual([]);
  });

  it('resets the entire index', () => {
    api.updateMatchIndex('report-a', ['report-b']);
    api.resetMatchIndex();

    expect(api.getIndexedMatches('report-a')).toEqual([]);
    expect(api.getIndexedMatches('report-b')).toEqual([]);
  });
});
