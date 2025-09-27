import { diffLines } from 'diff';
import { cosineSimilarity } from './text';
import { readReportText } from './storage';
import {
  CheckRecord,
  ReportRecord,
  createCheck,
  getCheckById,
  getReportById,
  listReports,
  markReportsIndexed,
  updateCheck,
} from './repository';

export interface MatchResult {
  reportId: string;
  reportName: string;
  similarity: number;
  diffPreview: string;
}

interface Job {
  checkId: string;
  reportId: string;
}

class CheckProcessor {
  private queue: Job[] = [];
  private processing = false;

  enqueue(job: Job) {
    this.queue.push(job);
    this.processNext();
  }

  private async processNext() {
    if (this.processing) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    this.processing = true;
    try {
      await this.processJob(job);
    } finally {
      this.processing = false;
      if (this.queue.length) {
        setTimeout(() => this.processNext(), 100);
      }
    }
  }

  private async processJob(job: Job) {
    const { checkId, reportId } = job;
    const report = getReportById(reportId);
    if (!report) {
      updateCheck(checkId, {
        status: 'failed',
        matches: JSON.stringify([]),
        similarity: 0,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const reportText = safeReadReportText(report.text_index);
    const otherReports = prioritizeReportsForCheck(
      listReports().filter((item) => item.id !== reportId && Boolean(item.added_to_cloud))
    );
    const matches: MatchResult[] = otherReports
      .map((other) => {
        const otherText = safeReadReportText(other.text_index);
        if (!otherText.trim()) {
          return null;
        }
        const similarity = cosineSimilarity(reportText, otherText) * 100;
        const diff = diffLines(otherText, reportText)
          .map((segment) => {
            const prefix = segment.added ? '+' : segment.removed ? '-' : ' ';
            return `${prefix} ${segment.value.trim()}`;
          })
          .slice(0, 10)
          .join('\n');
        return {
          reportId: other.id,
          reportName: other.original_name,
          similarity: Math.round(similarity * 100) / 100,
          diffPreview: diff,
        };
      })
      .filter((match): match is MatchResult => match !== null);

    matches.sort((a, b) => b.similarity - a.similarity);
    const topSimilarity = matches[0]?.similarity ?? 0;

    const completedAt = new Date().toISOString();

    updateCheck(checkId, {
      status: 'completed',
      similarity: topSimilarity,
      matches: JSON.stringify(matches),
      completed_at: completedAt,
    });

    if (matches.length) {
      markReportsIndexed([reportId, ...matches.map((match) => match.reportId)], completedAt);
    }
  }
}

function safeReadReportText(index: string): string {
  try {
    return readReportText(index);
  } catch {
    return '';
  }
}

const globalAny = globalThis as typeof globalThis & { __checkProcessor?: CheckProcessor };

export const checkProcessor = ((): CheckProcessor => {
  if (!globalAny.__checkProcessor) {
    globalAny.__checkProcessor = new CheckProcessor();
  }
  return globalAny.__checkProcessor;
})();

export function queueCheck(reportId: string): CheckRecord {
  const queuedCheck = createCheck({
    report_id: reportId,
    status: 'queued',
    similarity: null,
    matches: JSON.stringify([]),
  });
  setTimeout(() => {
    updateCheck(queuedCheck.id, { status: 'processing' });
    checkProcessor.enqueue({ checkId: queuedCheck.id, reportId });
  }, 10);
  return queuedCheck;
}

export function getCheckResult(checkId: string) {
  const check = getCheckById(checkId);
  if (!check) {
    return undefined;
  }
  const matches: MatchResult[] = check.matches ? JSON.parse(check.matches) : [];
  const report = getReportById(check.report_id);
  return { ...check, matches, report };
}

export function prioritizeReportsForCheck(reports: ReportRecord[]): ReportRecord[] {
  return [...reports].sort((a, b) => {
    const aPriority = a.priority_indexed_at ? 1 : 0;
    const bPriority = b.priority_indexed_at ? 1 : 0;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    if (a.priority_indexed_at && b.priority_indexed_at) {
      return b.priority_indexed_at.localeCompare(a.priority_indexed_at);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
