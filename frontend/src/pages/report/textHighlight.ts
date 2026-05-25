export interface HighlightInterval {
  end: number;
  index?: number;
  start: number;
}

export interface HighlightChunk {
  index?: number;
  mark: boolean;
  text: string;
}

export function buildHighlightChunks(text: string, intervals: HighlightInterval[]): HighlightChunk[] {
  const normalized = intervals
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .map((item) => ({
      ...item,
      start: Math.max(0, Math.min(text.length, item.start)),
      end: Math.max(0, Math.min(text.length, item.end)),
    }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const output: HighlightChunk[] = [];
  let cursor = 0;

  for (const item of normalized) {
    const start = Math.max(cursor, item.start);
    const end = Math.min(text.length, item.end);
    if (start > cursor) output.push({ text: text.slice(cursor, start), mark: false });
    if (end > start) output.push({ text: text.slice(start, end), mark: true, index: item.index });
    cursor = Math.max(cursor, end);
  }

  if (cursor < text.length) output.push({ text: text.slice(cursor), mark: false });
  return output;
}

export function findTextInterval(text: string, fragment: string): HighlightInterval | null {
  const needle = fragment.trim();
  if (!needle) return null;

  const start = text.toLocaleLowerCase("ru-RU").indexOf(needle.toLocaleLowerCase("ru-RU"));
  if (start < 0) return null;

  return {
    start,
    end: start + needle.length,
  };
}
