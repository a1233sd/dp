import { useMemo } from "react";
import type { RefObject } from "react";
import type { CheckResult } from "../../types";

interface DocumentReaderProps {
  onSelect: (index: number) => void;
  readerRef: RefObject<HTMLDivElement | null>;
  result: CheckResult;
  selectedIndex: number;
}

export function DocumentReader({ onSelect, readerRef, result, selectedIndex }: DocumentReaderProps) {
  const chunks = useMemo(() => {
    const text = result.processed_text || "";
    const intervals = result.matches
      .map((match, index) => ({
        start: Number(match.start_char),
        end: Number(match.end_char),
        index,
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start || b.end - a.end);

    const output: Array<{ text: string; mark: boolean; index?: number }> = [];
    let cursor = 0;
    for (const item of intervals) {
      const start = Math.max(cursor, item.start);
      const end = Math.min(text.length, item.end);
      if (start > cursor) output.push({ text: text.slice(cursor, start), mark: false });
      if (end > start) output.push({ text: text.slice(start, end), mark: true, index: item.index });
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) output.push({ text: text.slice(cursor), mark: false });
    return output;
  }, [result]);

  return (
    <div className="document-reader" ref={readerRef}>
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
