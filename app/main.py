from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Dict, List, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="AntiPlagiarism Educational API",
    description=(
        "Локальный API для проверки учебных работ на заимствования "
        "с визуальным выделением совпадений."
    ),
    version="2.0.0",
)


ContentType = Literal["text", "code"]
DocumentKind = Literal["reference", "submission"]


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1)
    kind: DocumentKind = "reference"
    content_type: ContentType = "text"


class DocumentOut(BaseModel):
    id: str
    title: str
    kind: DocumentKind
    content_type: ContentType


class ExclusionRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pattern: str = Field(min_length=1, description="Регулярное выражение для исключения")
    description: str | None = None


class ExclusionRuleOut(BaseModel):
    id: str
    name: str
    pattern: str
    description: str | None


class CheckRequest(BaseModel):
    text: str = Field(min_length=1)
    content_type: ContentType = "text"
    reference_ids: List[str] | None = None
    use_exclusion_rules: bool = True


class MatchOut(BaseModel):
    source_id: str
    source_title: str
    overlap_percent: float
    fragment: str
    start_char: int
    end_char: int


class CheckOut(BaseModel):
    id: str
    originality_percent: float
    matched_tokens: int
    total_tokens: int
    processed_text: str
    highlighted_html: str
    matches: List[MatchOut]


@dataclass
class StoredDocument:
    id: str
    title: str
    text: str
    kind: DocumentKind
    content_type: ContentType


@dataclass
class ExclusionRule:
    id: str
    name: str
    pattern: str
    description: str | None = None


documents: Dict[str, StoredDocument] = {}
checks: Dict[str, CheckOut] = {}
exclusion_rules: Dict[str, ExclusionRule] = {}

TOKEN_PATTERN = re.compile(r"[\wа-яА-ЯёЁ-]+", re.UNICODE)
DEFAULT_SHINGLE_BY_TYPE = {"text": 3, "code": 3}


CODE_KEYWORDS = {"def", "return", "for", "while", "if", "else", "elif", "class", "import", "from", "try", "except", "with", "as", "in", "and", "or", "not", "None", "True", "False"}


def tokenize_with_spans(text: str, content_type: ContentType = "text") -> List[tuple[str, int, int]]:
    tokens: List[tuple[str, int, int]] = []
    for m in TOKEN_PATTERN.finditer(text):
        token = m.group(0).lower()
        if content_type == "code" and token.isidentifier() and token not in CODE_KEYWORDS:
            token = "id"
        tokens.append((token, m.start(), m.end()))
    return tokens


def make_shingles(tokens: List[str], size: int) -> set[tuple[str, ...]]:
    if len(tokens) < size:
        return set()
    return {tuple(tokens[i : i + size]) for i in range(len(tokens) - size + 1)}


def apply_exclusions(text: str) -> str:
    result = text
    for rule in exclusion_rules.values():
        result = re.sub(rule.pattern, " ", result, flags=re.MULTILINE)
    return result


def build_highlight_html(text: str, intervals: List[tuple[int, int]]) -> str:
    if not intervals:
        return f"<pre>{html.escape(text)}</pre>"

    merged: List[tuple[int, int]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))

    chunks: List[str] = []
    cursor = 0
    for start, end in merged:
        if cursor < start:
            chunks.append(html.escape(text[cursor:start]))
        chunks.append(f"<mark>{html.escape(text[start:end])}</mark>")
        cursor = end
    if cursor < len(text):
        chunks.append(html.escape(text[cursor:]))

    return "<pre>" + "".join(chunks) + "</pre>"


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/documents", response_model=DocumentOut, tags=["documents"])
def create_document(payload: DocumentCreate) -> DocumentOut:
    document_id = str(uuid4())
    documents[document_id] = StoredDocument(
        id=document_id,
        title=payload.title,
        text=payload.text,
        kind=payload.kind,
        content_type=payload.content_type,
    )
    return DocumentOut(
        id=document_id,
        title=payload.title,
        kind=payload.kind,
        content_type=payload.content_type,
    )


@app.get("/documents", response_model=List[DocumentOut], tags=["documents"])
def list_documents(
    kind: DocumentKind | None = None,
    content_type: ContentType | None = None,
) -> List[DocumentOut]:
    values = list(documents.values())
    if kind:
        values = [d for d in values if d.kind == kind]
    if content_type:
        values = [d for d in values if d.content_type == content_type]

    return [
        DocumentOut(id=d.id, title=d.title, kind=d.kind, content_type=d.content_type)
        for d in values
    ]


@app.post("/rules/exclusions", response_model=ExclusionRuleOut, tags=["rules"])
def create_exclusion_rule(payload: ExclusionRuleCreate) -> ExclusionRuleOut:
    try:
        re.compile(payload.pattern)
    except re.error as exc:
        raise HTTPException(status_code=400, detail=f"Некорректный regex: {exc}") from exc

    rule_id = str(uuid4())
    rule = ExclusionRule(
        id=rule_id,
        name=payload.name,
        pattern=payload.pattern,
        description=payload.description,
    )
    exclusion_rules[rule_id] = rule
    return ExclusionRuleOut(**rule.__dict__)


@app.get("/rules/exclusions", response_model=List[ExclusionRuleOut], tags=["rules"])
def list_exclusion_rules() -> List[ExclusionRuleOut]:
    return [ExclusionRuleOut(**rule.__dict__) for rule in exclusion_rules.values()]


@app.delete("/rules/exclusions/{rule_id}", tags=["rules"])
def delete_exclusion_rule(rule_id: str) -> dict[str, str]:
    if rule_id not in exclusion_rules:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    exclusion_rules.pop(rule_id)
    return {"status": "deleted"}


@app.post("/checks", response_model=CheckOut, tags=["checks"])
def run_check(payload: CheckRequest) -> CheckOut:
    source_text = payload.text
    processed_text = apply_exclusions(source_text) if payload.use_exclusion_rules else source_text

    query_tokens_spans = tokenize_with_spans(processed_text, payload.content_type)
    if not query_tokens_spans:
        raise HTTPException(status_code=400, detail="Текст не содержит токенов для анализа")

    query_tokens = [token for token, _, _ in query_tokens_spans]
    shingle_size = DEFAULT_SHINGLE_BY_TYPE[payload.content_type]
    query_shingles = make_shingles(query_tokens, shingle_size)

    reference_docs = [
        d for d in documents.values() if d.kind == "reference" and d.content_type == payload.content_type
    ]
    if payload.reference_ids is not None:
        requested = set(payload.reference_ids)
        reference_docs = [d for d in reference_docs if d.id in requested]

    if not reference_docs:
        raise HTTPException(status_code=400, detail="Нет эталонных документов для сравнения")

    matched_positions: set[int] = set()
    highlighted_intervals: List[tuple[int, int]] = []
    matches: List[MatchOut] = []

    for ref in reference_docs:
        ref_text = apply_exclusions(ref.text) if payload.use_exclusion_rules else ref.text
        ref_tokens_spans = tokenize_with_spans(ref_text, payload.content_type)
        ref_tokens = [token for token, _, _ in ref_tokens_spans]
        ref_shingles = make_shingles(ref_tokens, shingle_size)
        common = query_shingles.intersection(ref_shingles)

        if not common:
            continue

        local_positions: set[int] = set()
        for i in range(len(query_tokens) - shingle_size + 1):
            shingle = tuple(query_tokens[i : i + shingle_size])
            if shingle in common:
                local_positions.update(range(i, i + shingle_size))
                matched_positions.update(range(i, i + shingle_size))

        if not local_positions:
            continue

        start_idx = min(local_positions)
        end_idx = max(local_positions)
        start_char = query_tokens_spans[start_idx][1]
        end_char = query_tokens_spans[end_idx][2]
        highlighted_intervals.append((start_char, end_char))
        fragment = processed_text[start_char:end_char]
        overlap_percent = round(len(local_positions) / len(query_tokens) * 100, 2)

        matches.append(
            MatchOut(
                source_id=ref.id,
                source_title=ref.title,
                overlap_percent=overlap_percent,
                fragment=fragment,
                start_char=start_char,
                end_char=end_char,
            )
        )

    total_tokens = len(query_tokens)
    matched_tokens = len(matched_positions)
    originality_percent = round(max(0.0, (1 - matched_tokens / total_tokens) * 100), 2)

    result = CheckOut(
        id=str(uuid4()),
        originality_percent=originality_percent,
        matched_tokens=matched_tokens,
        total_tokens=total_tokens,
        processed_text=processed_text,
        highlighted_html=build_highlight_html(processed_text, highlighted_intervals),
        matches=sorted(matches, key=lambda m: m.overlap_percent, reverse=True),
    )
    checks[result.id] = result
    return result


@app.get("/checks/{check_id}", response_model=CheckOut, tags=["checks"])
def get_check(check_id: str) -> CheckOut:
    result = checks.get(check_id)
    if not result:
        raise HTTPException(status_code=404, detail="Результат проверки не найден")
    return result
