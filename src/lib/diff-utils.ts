import { diff_match_patch, DIFF_DELETE, DIFF_INSERT } from 'diff-match-patch';

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

const MAX_PREVIEW_LENGTH = 180;
const MAX_PREVIEW_MATCHES = 5;

function createDiffEngine() {
  const engine = new diff_match_patch();
  engine.Diff_Timeout = 1;
  return engine;
}

export function buildDiffSegments(sourceText: string, targetText: string): DiffSegment[] {
  const engine = createDiffEngine();
  const diffs = engine.diff_main(sourceText, targetText);
  engine.diff_cleanupSemantic(diffs);
  return diffs.map(([operation, text]) => ({
    added: operation === DIFF_INSERT,
    removed: operation === DIFF_DELETE,
    value: text,
  }));
}

export function buildMatchPreview(segments: DiffSegment[]): string {
  const matches = segments.filter((segment) => !segment.added && !segment.removed);
  const cleanedMatches = matches
    .map((segment) => compressWhitespace(segment.value))
    .filter((value) => value.length > 0);
  const highlighted = cleanedMatches.slice(0, MAX_PREVIEW_MATCHES).map((value) => `Совпадение: «${truncate(value)}»`);
  if (highlighted.length > 0) {
    return highlighted.join('\n');
  }
  const fallbackSegments = segments
    .map((segment) => ({
      value: compressWhitespace(segment.value),
      label: segment.added ? 'Добавлено' : segment.removed ? 'Контекст' : 'Совпадение',
    }))
    .filter((item) => item.value.length > 0)
    .slice(0, MAX_PREVIEW_MATCHES)
    .map((item) => `${item.label}: «${truncate(item.value)}»`);
  return fallbackSegments.join('\n');
}

function compressWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string): string {
  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`;
}
