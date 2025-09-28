'use client';

export interface DiffSegment {
  added: boolean;
  removed: boolean;
  value: string;
}

function renderSegmentContent(value: string) {
  const parts = value.split(/(\n)/);
  return parts.map((part, index) => {
    if (part === '\n') {
      return <br key={`br-${index}`} />;
    }
    return part;
  });
}

export function CloudMatchViewer({ segments }: { segments: DiffSegment[] }) {
  const visibleSegments = segments.filter((segment) => !segment.removed);
  const hasContent = visibleSegments.some((segment) => segment.value.trim().length > 0);

  if (!visibleSegments.length || !hasContent) {
    return <div className="diff-placeholder">Нет совпадающих фрагментов в тексте из облака.</div>;
  }

  return (
    <div className="match-viewer" aria-live="polite">
      {visibleSegments.map((segment, index) => {
        const isHighlight = !segment.added;
        const className = [
          'match-viewer__segment',
          isHighlight ? 'match-viewer__segment--highlight' : 'match-viewer__segment--context',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <span key={index} className={className}>
            {renderSegmentContent(segment.value)}
          </span>
        );
      })}
    </div>
  );
}
