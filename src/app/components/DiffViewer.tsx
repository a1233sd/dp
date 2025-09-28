'use client';

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

export function DiffViewer({ segments }: { segments: DiffSegment[] }) {
  if (!segments.length) {
    return <div className="diff-placeholder">Нет данных для сравнения.</div>;
  }
  return (
    <div className="diff-viewer" aria-live="polite">
      {segments.map((segment, index) => {
        const prefix = segment.added ? '+' : segment.removed ? '-' : ' ';
        const isMatch = !segment.added && !segment.removed;
        const lineClass = [
          'diff-line',
          segment.added && 'diff-line--added',
          segment.removed && 'diff-line--removed',
          isMatch && 'diff-line--match',
          isMatch && 'diff-line--context',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={index} className={lineClass}>
            <span className="diff-line__prefix">{prefix}</span>
            <pre className="diff-line__content">{segment.value}</pre>
          </div>
        );
      })}
    </div>
  );
}
