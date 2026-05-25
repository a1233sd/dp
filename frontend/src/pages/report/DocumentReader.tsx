import { useMemo } from "react";
import type { RefObject } from "react";
import type { CheckResult } from "../../types";
import { buildHighlightChunks } from "./textHighlight";

interface DocumentReaderProps {
  className?: string;
  onSelect: (index: number) => void;
  readerRef?: RefObject<HTMLDivElement | null>;
  result: CheckResult;
  selectedIndex: number;
  visibleMatchIndexes?: number[];
}

export function DocumentReader({
  className = "",
  onSelect,
  readerRef,
  result,
  selectedIndex,
  visibleMatchIndexes,
}: DocumentReaderProps) {
  const chunks = useMemo(() => {
    const text = result.processed_text || "";
    const visible = visibleMatchIndexes ? new Set(visibleMatchIndexes) : null;
    const intervals = result.matches
      .map((match, index) => ({
        start: Number(match.start_char),
        end: Number(match.end_char),
        index,
      }))
      .filter((item) => !visible || visible.has(item.index));
    return buildHighlightChunks(text, intervals);
  }, [result, visibleMatchIndexes]);

  return (
    <div className={`document-reader ${className}`.trim()} ref={readerRef}>
      {chunks.map((chunk, index) => chunk.mark ? (
        <mark
          key={`${chunk.index}-${index}`}
          data-match-index={chunk.index}
          className={chunk.index === selectedIndex ? "selected-hit" : ""}
          onClick={() => typeof chunk.index === "number" && onSelect(chunk.index)}
        >
          {chunk.text}
        </mark>
      ) : (
        <span key={`text-${index}`}>{chunk.text}</span>
      ))}
    </div>
  );
}
