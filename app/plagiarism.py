from __future__ import annotations

import hashlib
import html
import re

TOKEN_PATTERN = re.compile(r"[\wа-яА-ЯёЁ-]+", re.UNICODE)
PAGE_MARKER_PATTERN = re.compile(r"(?:^|\n)\s*@@ANTIPLAGIARISM_PAGE:(\d+)@@\s*(?:\n|$)")
PAGE_RANGE_PART_PATTERN = re.compile(r"^\s*(\d+)\s*(?:[-–—]\s*(\d+)\s*)?$")
SHINGLE_SIZE = 3


def page_marker(page_number: int) -> str:
    return f"@@ANTIPLAGIARISM_PAGE:{page_number}@@"


def tokenize_with_spans(text: str) -> list[tuple[str, int, int]]:
    tokens: list[tuple[str, int, int]] = []
    for match in TOKEN_PATTERN.finditer(text):
        token = match.group(0).lower()
        tokens.append((token, match.start(), match.end()))
    return tokens


def make_shingles(tokens: list[str], size: int) -> list[tuple[str, ...]]:
    if len(tokens) < size:
        return []
    return [tuple(tokens[i : i + size]) for i in range(len(tokens) - size + 1)]


def hash_shingle(shingle: tuple[str, ...]) -> str:
    payload = " ".join(shingle).encode("utf-8", errors="ignore")
    return hashlib.sha1(payload).hexdigest()


def shingle_hashes(tokens: list[str], size: int) -> set[str]:
    return {hash_shingle(shingle) for shingle in make_shingles(tokens, size)}


def parse_page_ranges(raw_value: str) -> list[int]:
    parts = [part.strip() for part in raw_value.split(",") if part.strip()]
    if not parts:
        raise ValueError("Page range must not be empty.")

    pages: set[int] = set()
    for part in parts:
        match = PAGE_RANGE_PART_PATTERN.match(part)
        if not match:
            raise ValueError("Use page numbers like 1-2, 5.")
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < 1:
            raise ValueError("Page numbers must be positive.")
        if end < start:
            raise ValueError("Page range end must be greater than start.")
        pages.update(range(start, end + 1))
    return sorted(pages)


def normalize_page_ranges(raw_value: str) -> str:
    pages = parse_page_ranges(raw_value)
    ranges: list[str] = []
    start = previous = pages[0]
    for page in pages[1:]:
        if page == previous + 1:
            previous = page
            continue
        ranges.append(str(start) if start == previous else f"{start}-{previous}")
        start = previous = page
    ranges.append(str(start) if start == previous else f"{start}-{previous}")
    return ", ".join(ranges)


def strip_page_markers(text: str) -> str:
    return PAGE_MARKER_PATTERN.sub("\n", text)


def split_text_by_pages(text: str) -> list[tuple[int | None, str]]:
    markers = list(PAGE_MARKER_PATTERN.finditer(text))
    if not markers:
        return [(None, text)]

    chunks: list[tuple[int | None, str]] = []
    preface = text[: markers[0].start()]
    if preface.strip():
        chunks.append((None, preface))

    for index, marker in enumerate(markers):
        page_number = int(marker.group(1))
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        chunks.append((page_number, text[start:end]))
    return chunks


def apply_page_exclusions(text: str, page_ranges: list[str]) -> str:
    excluded_pages: set[int] = set()
    for page_range in page_ranges:
        excluded_pages.update(parse_page_ranges(page_range))

    if not excluded_pages:
        return strip_page_markers(text)

    chunks = split_text_by_pages(text)
    if all(page_number is None for page_number, _ in chunks):
        return strip_page_markers(text)

    kept = [chunk for page_number, chunk in chunks if page_number is None or page_number not in excluded_pages]
    return strip_page_markers("\n".join(kept))


def apply_exclusions(text: str, patterns: list[str]) -> str:
    result = text
    for pattern in patterns:
        result = re.sub(pattern, " ", result, flags=re.MULTILINE)
    return result


def prepare_text_for_analysis(text: str, patterns: list[str], page_ranges: list[str]) -> str:
    result = apply_page_exclusions(text, page_ranges)
    return apply_exclusions(result, patterns)


def build_highlight_html(text: str, intervals: list[tuple[int, int]]) -> str:
    if not intervals:
        return f"<pre>{html.escape(text)}</pre>"

    merged: list[tuple[int, int]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))

    chunks: list[str] = []
    cursor = 0
    for start, end in merged:
        if cursor < start:
            chunks.append(html.escape(text[cursor:start]))
        chunks.append(f"<mark>{html.escape(text[start:end])}</mark>")
        cursor = end
    if cursor < len(text):
        chunks.append(html.escape(text[cursor:]))
    return "<pre>" + "".join(chunks) + "</pre>"
