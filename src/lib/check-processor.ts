import { diffLines } from 'diff';
import { cosineSimilarity } from './text';
import { CheckRecord, createCheck, getCheckById, getReportById, listReports, updateCheck } from './repository';

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

    const otherReports = listReports().filter((item) => item.id !== reportId);
    const matches: MatchResult[] = otherReports.map((other) => {
      const similarity = cosineSimilarity(report.text_content, other.text_content) * 100;
      const diff = diffLines(other.text_content, report.text_content)
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
    });

    matches.sort((a, b) => b.similarity - a.similarity);
    const topSimilarity = matches[0]?.similarity ?? 0;

    updateCheck(checkId, {
      status: 'completed',
      similarity: topSimilarity,
      matches: JSON.stringify(matches),
      completed_at: new Date().toISOString(),
    });
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
  return { ...check, matches };
}
