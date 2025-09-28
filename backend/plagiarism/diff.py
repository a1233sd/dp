from __future__ import annotations

from typing import List

from diff_match_patch import diff_match_patch

MAX_PREVIEW_LENGTH = 180
MAX_PREVIEW_MATCHES = 5


def build_diff_segments(source_text: str, target_text: str) -> List[dict[str, object]]:
    engine = diff_match_patch()
    engine.Diff_Timeout = 1
    diffs = engine.diff_main(source_text, target_text)
    engine.diff_cleanupSemantic(diffs)
    segments: List[dict[str, object]] = []
    for operation, text in diffs:
        segments.append({
            'added': operation == 1,
            'removed': operation == -1,
            'value': text,
        })
    return segments


def compress_whitespace(value: str) -> str:
    return ' '.join(value.split())


def truncate(value: str) -> str:
    if len(value) <= MAX_PREVIEW_LENGTH:
        return value
    return value[: MAX_PREVIEW_LENGTH - 1].rstrip() + '…'


def build_match_preview(segments: List[dict[str, object]]) -> str:
    matches = [
        compress_whitespace(str(segment['value']))
        for segment in segments
        if not segment['added'] and not segment['removed']
    ]
    matches = [item for item in matches if item]
    highlighted = [f"Совпадение: «{truncate(value)}»" for value in matches[:MAX_PREVIEW_MATCHES]]
    if highlighted:
        return '\n'.join(highlighted)

    fallback = []
    for segment in segments[:MAX_PREVIEW_MATCHES]:
        value = compress_whitespace(str(segment['value']))
        if not value:
            continue
        if segment['added']:
            label = 'Добавлено'
        elif segment['removed']:
            label = 'Контекст'
        else:
            label = 'Совпадение'
        fallback.append(f"{label}: «{truncate(value)}»")
    return '\n'.join(fallback)
