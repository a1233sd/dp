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
  const visibleSegments = segments.filter((segment) => !segment.added);
  const hasContent = visibleSegments.some((segment) => segment.value.trim().length > 0);
  const highlightedFragments = visibleSegments.filter(
    (segment) => !segment.removed && segment.value.trim().length > 0
  );
  const highlightCount = highlightedFragments.length;
  const hasHighlights = highlightCount > 0;

  if (!visibleSegments.length || !hasContent) {
    return <div className="diff-placeholder">Нет совпадающих фрагментов в тексте из облака.</div>;
  }

  return (
    <div className="match-viewer-wrapper" aria-live="polite">
      {hasHighlights && (
        <p className="match-viewer__meta" role="status">
          Найдены совпадения в тексте облачного отчета: подчеркнуты {highlightCount}{' '}
          {pluralizeFragments(highlightCount)}.
        </p>
      )}
      <div className="match-viewer" role="region" aria-label="Текст файла с подчеркнутыми совпадениями">
        {visibleSegments.map((segment, index) => {
          const isHighlight = !segment.removed;
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
    </div>
  );
}

function pluralizeFragments(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'фрагмент';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'фрагмента';
  }
  return 'фрагментов';
}
