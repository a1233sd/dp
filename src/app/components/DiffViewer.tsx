'use client';

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

function sanitizeDiffIndicators(value: string) {
  return value.replace(/^[+-]\s?/gm, '');
}

function renderMatchValue(value: string) {
  const lines = value.split('\n');
  const nodes: (string | JSX.Element)[] = [];

  lines.forEach((line, index) => {
    if (line.trim().length > 0) {
      nodes.push(
        <span key={`match-${index}`} className="diff-line__match-fragment">
          {line}
        </span>,
      );
    } else if (line.length > 0) {
      nodes.push(line);
    }

    if (index < lines.length - 1) {
      nodes.push('\n');
    }
  });

  return nodes.length ? nodes : value;
}

export function DiffViewer({ segments }: { segments: DiffSegment[] }) {
  if (!segments.length) {
    return <div className="diff-placeholder">Нет данных для сравнения.</div>;
  }
  return (
    <div className="diff-viewer" aria-live="polite">
      {segments.map((segment, index) => {
        const isMatch = !segment.added && !segment.removed;
        const lineClass = [
          'diff-line',
          isMatch && 'diff-line--match',
        ]
          .filter(Boolean)
          .join(' ');
        const value = segment.added || segment.removed
          ? sanitizeDiffIndicators(segment.value)
          : segment.value;
        return (
          <div key={index} className={lineClass}>
            <pre className="diff-line__content">
              {isMatch ? renderMatchValue(value) : value}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
