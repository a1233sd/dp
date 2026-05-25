import { Empty } from "antd";
import { useMemo } from "react";
import type { RefObject } from "react";
import type { CheckMatch, CheckResult } from "../../types";
import { buildHighlightChunks } from "./textHighlight";

interface SelectedWorkExcerptProps {
  match: CheckMatch;
  onSelect: (index: number) => void;
  readerRef: RefObject<HTMLDivElement | null>;
  result: CheckResult;
  selectedIndex: number;
}

const CONTEXT_CHARS = 420;

export function SelectedWorkExcerpt({
  match,
  onSelect,
  readerRef,
  result,
  selectedIndex,
}: SelectedWorkExcerptProps) {
  const chunks = useMemo(() => {
    const text = result.processed_text || "";
    const start = Math.max(0, Math.min(text.length, Number(match.start_char)));
    const end = Math.max(start, Math.min(text.length, Number(match.end_char)));
    const from = Math.max(0, start - CONTEXT_CHARS);
    const to = Math.min(text.length, end + CONTEXT_CHARS);
    const leading = from > 0 ? "... \n" : "";
    const trailing = to < text.length ? "\n ..." : "";
    const excerpt = `${leading}${text.slice(from, to)}${trailing}`;

    return buildHighlightChunks(excerpt, [{
      start: leading.length + start - from,
      end: leading.length + end - from,
      index: selectedIndex,
    }]);
  }, [match.end_char, match.start_char, result.processed_text, selectedIndex]);

  if (!result.processed_text) {
    return <Empty description="Текст работы недоступен" />;
  }

  return (
    <div className="document-reader work-excerpt-reader" ref={readerRef}>
      {chunks.map((chunk, index) => chunk.mark ? (
        <mark
          key={`selected-work-${index}`}
          data-match-index={selectedIndex}
          className="selected-hit"
          onClick={() => onSelect(selectedIndex)}
        >
          {chunk.text}
        </mark>
      ) : (
        <span key={`selected-work-text-${index}`}>{chunk.text}</span>
      ))}
    </div>
  );
}
