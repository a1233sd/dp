'use client';

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

interface MatchFragment {
  id: number;
  text: string;
  sourceStart: number;
  sourceEnd: number;
  targetStart: number;
  targetEnd: number;
}

function toLineCount(value: string) {
  if (!value.length) {
    return 0;
  }
  const normalized = value.replace(/\r/g, '');
  const parts = normalized.split('\n');
  if (normalized.endsWith('\n')) {
    parts.pop();
  }
  return parts.length || (normalized.endsWith('\n') ? 1 : 0);
}

function normalizeMatchText(value: string) {
  const cleaned = value.replace(/\r/g, '');
  const withoutTrailingBreaks = cleaned.replace(/\n+$/g, '');
  const withoutLeadingBreaks = withoutTrailingBreaks.replace(/^\n+/g, '');
  return withoutLeadingBreaks.trimEnd();
}

function buildMatchFragments(segments: DiffSegment[]): MatchFragment[] {
  const fragments: MatchFragment[] = [];
  let sourceLine = 1;
  let targetLine = 1;

  segments.forEach((segment, index) => {
    const lineCount = toLineCount(segment.value);
    if (!segment.added && !segment.removed) {
      const text = normalizeMatchText(segment.value);
      if (text.length > 0 && lineCount > 0) {
        fragments.push({
          id: index,
          text,
          sourceStart: sourceLine,
          sourceEnd: sourceLine + lineCount - 1,
          targetStart: targetLine,
          targetEnd: targetLine + lineCount - 1,
        });
      }
    }

    if (!segment.added) {
      sourceLine += lineCount;
    }
    if (!segment.removed) {
      targetLine += lineCount;
    }
  });

  return fragments;
}

function formatRange(start: number, end: number) {
  if (start === end) {
    return `строка ${start}`;
  }
  return `строки ${start}–${end}`;
}

export function DiffViewer({ segments }: { segments: DiffSegment[] }) {
  if (!segments.length) {
    return <div className="diff-placeholder">Нет данных для сравнения.</div>;
  }

  const matches = buildMatchFragments(segments);

  if (!matches.length) {
    return <div className="diff-placeholder">Общие фрагменты не найдены.</div>;
  }

  return (
    <div className="match-viewer" aria-live="polite">
      {matches.map((fragment, index) => (
        <article key={fragment.id} className="match-fragment">
          <header className="match-fragment__header">
            <span className="match-fragment__title">Совпадение #{index + 1}</span>
            <span className="match-fragment__meta">
              Отчет: {formatRange(fragment.sourceStart, fragment.sourceEnd)} · Архив: {formatRange(fragment.targetStart, fragment.targetEnd)}
            </span>
          </header>
          <pre className="match-fragment__content">
            <mark>{fragment.text}</mark>
          </pre>
        </article>
      ))}
    </div>
  );
}
