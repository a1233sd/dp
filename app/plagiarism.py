from __future__ import annotations

import hashlib
import html
import re

TOKEN_PATTERN = re.compile(r"[\wа-яА-ЯёЁ-]+", re.UNICODE)
SHINGLE_SIZE = 3


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


def apply_exclusions(text: str, patterns: list[str]) -> str:
    result = text
    for pattern in patterns:
        result = re.sub(pattern, " ", result, flags=re.MULTILINE)
    return result


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
