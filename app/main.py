from __future__ import annotations

import hashlib
import logging
import os
import re
from collections import Counter
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .file_ingest import extract_text_from_upload
from .plagiarism import (
    SHINGLE_SIZE,
    apply_exclusions,
    build_highlight_html,
    hash_shingle,
    make_shingles,
    shingle_hashes,
    tokenize_with_spans,
)
from .storage import (
    delete_document_by_id,
    delete_rule,
    get_check,
    get_check_matches,
    get_document,
    get_document_index,
    get_user,
    init_db,
    insert_check,
    insert_check_matches,
    insert_document,
    insert_rule,
    insert_user,
    list_archive_unique,
    list_documents,
    list_reference_candidates,
    list_rules,
    list_users,
    mark_document_unique,
    promote_document_to_unique_reference,
    update_document_fields,
    upsert_document_index,
    update_check_originality,
)

DocumentKind = Literal["reference", "submission"]
UserRole = Literal["student", "teacher"]
RuleType = Literal["literal", "contains", "starts_with", "regex"]


app = FastAPI(
    title="AntiPlagiarism Educational API",
    description=(
        "Local anti-plagiarism API for educational works. "
        "Supports local archive index, exclusion rules, "
        "text checks, and structured reports."
    ),
    version="3.0.0",
)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
logger = logging.getLogger(__name__)


def read_percent_env(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number between 0 and 100.") from exc
    if value < 0.0 or value > 100.0:
        raise RuntimeError(f"{name} must be in range [0, 100].")
    return value


DEFAULT_UNIQUENESS_THRESHOLD = read_percent_env("DEFAULT_UNIQUENESS_THRESHOLD", 80.0)


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    role: UserRole
    password: str = Field(min_length=6, max_length=200)


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: UserRole
    created_at: str


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1)
    kind: DocumentKind = "reference"
    owner_user_id: str | None = None


class DocumentOut(BaseModel):
    id: str
    title: str
    kind: DocumentKind
    owner_user_id: str | None = None
    source_url: str | None = None
    is_unique: bool
    created_at: str


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    text: str | None = None
    kind: DocumentKind | None = None
    owner_user_id: str | None = None


class ExclusionRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rule_type: RuleType = "literal"
    value: str | None = Field(default=None, min_length=1)
    # Backward compatibility for old clients.
    pattern: str | None = Field(default=None, min_length=1)
    description: str | None = None


class ExclusionRuleOut(BaseModel):
    id: str
    name: str
    rule_type: RuleType
    value: str
    pattern: str
    description: str | None
    created_at: str


class CheckRequest(BaseModel):
    submission_document_id: str | None = None
    text: str | None = None
    title: str | None = Field(default=None, max_length=200)
    owner_user_id: str | None = None
    reference_ids: list[str] | None = None
    include_unique_archive: bool = True
    use_exclusion_rules: bool = True
    uniqueness_threshold: float = Field(default=DEFAULT_UNIQUENESS_THRESHOLD, ge=0.0, le=100.0)


class MatchOut(BaseModel):
    source_document_id: str
    source_title: str
    source_kind: DocumentKind
    source_url: str | None = None
    overlap_percent: float
    fragment: str
    source_fragment: str
    start_char: int
    end_char: int


class CheckOut(BaseModel):
    id: str
    submission_document_id: str | None = None
    originality_percent: float
    matched_tokens: int
    total_tokens: int
    processed_text: str
    highlighted_html: str
    checked_at: str
    matches: list[MatchOut]


class CheckReportOut(BaseModel):
    check: CheckOut
    summary: dict[str, float | int]
    by_source_kind: dict[str, int]


class ArchiveItem(BaseModel):
    id: str
    title: str
    created_at: str
    owner_user_id: str | None = None
    shingle_size: int | None = None
    token_count: int | None = None
    updated_at: str | None = None


class CheckOriginalityUpdate(BaseModel):
    originality_percent: float = Field(ge=0.0, le=100.0)


class SettingsOut(BaseModel):
    default_uniqueness_threshold: float


@app.on_event("startup")
def startup() -> None:
    auto_init_db = os.getenv("AUTO_INIT_DB", "1").strip().lower()
    if auto_init_db in {"0", "false", "no"}:
        logger.warning("AUTO_INIT_DB is disabled. Skipping DB initialization and migrations.")
        return
    logger.info("DB initialization started.")
    init_db()
    logger.info("DB initialization finished.")


@app.get("/", include_in_schema=False)
def frontend() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


def password_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def assert_user_exists(user_id: str | None) -> None:
    if user_id and not get_user(user_id):
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")


def document_out_from_row(row: dict) -> DocumentOut:
    return DocumentOut(
        id=row["id"],
        title=row["title"],
        kind=row["kind"],
        owner_user_id=row["owner_user_id"],
        source_url=row["source_url"],
        is_unique=bool(row["is_unique"]),
        created_at=row["created_at"],
    )


def compile_rule_pattern(rule_type: RuleType, value: str) -> str:
    escaped = re.escape(value.strip())
    if rule_type == "literal":
        return escaped
    if rule_type == "contains":
        return rf"(?im)^.*{escaped}.*(?:\n|$)"
    if rule_type == "starts_with":
        return rf"(?im)^\s*{escaped}.*(?:\n|$)"
    return value


def check_out_from_db(check_id: str) -> CheckOut:
    row = get_check(check_id)
    if not row:
        raise HTTPException(status_code=404, detail="Check result not found.")
    matches = get_check_matches(check_id)
    return CheckOut(
        id=row["id"],
        submission_document_id=row["submission_document_id"],
        originality_percent=row["originality_percent"],
        matched_tokens=row["matched_tokens"],
        total_tokens=row["total_tokens"],
        processed_text=row["processed_text"],
        highlighted_html=row["highlighted_html"],
        checked_at=row["checked_at"],
        matches=[MatchOut(**m) for m in matches],
    )


@app.get("/health", tags=["system"])
def health() -> dict[str, int | str]:
    docs = list_documents()
    checks_in_archive = list_archive_unique()
    return {
        "status": "ok",
        "documents_total": len(docs),
        "unique_archive_total": len(checks_in_archive),
        "users_total": len(list_users()),
    }


@app.get("/settings", response_model=SettingsOut, tags=["system"])
def get_settings() -> SettingsOut:
    return SettingsOut(default_uniqueness_threshold=DEFAULT_UNIQUENESS_THRESHOLD)


@app.post("/users", response_model=UserOut, tags=["users"])
def create_user(payload: UserCreate) -> UserOut:
    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email format.")
    try:
        user = insert_user(
            full_name=payload.full_name.strip(),
            email=payload.email.strip(),
            role=payload.role,
            password_hash=password_hash(payload.password),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not create user: {exc}") from exc
    return UserOut(**user)


@app.get("/users", response_model=list[UserOut], tags=["users"])
def get_users() -> list[UserOut]:
    return [UserOut(**row) for row in list_users()]


@app.post("/documents", response_model=DocumentOut, tags=["documents"])
def create_document(payload: DocumentCreate) -> DocumentOut:
    assert_user_exists(payload.owner_user_id)
    row = insert_document(
        title=payload.title.strip(),
        text=payload.text.strip(),
        kind=payload.kind,
        owner_user_id=payload.owner_user_id,
    )
    if not row["text"]:
        raise HTTPException(status_code=400, detail="Document text is empty.")
    tokens = tokenize_with_spans(row["text"])
    token_values = [token for token, _, _ in tokens]
    upsert_document_index(
        document_id=row["id"],
        shingle_size=SHINGLE_SIZE,
        token_count=len(token_values),
        shingles=shingle_hashes(token_values, SHINGLE_SIZE),
    )
    if row["kind"] == "reference":
        promote_document_to_unique_reference(row["id"])
        row = get_document(row["id"]) or row
    return document_out_from_row(row)


@app.post("/documents/upload", response_model=DocumentOut, tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    kind: DocumentKind = Form(default="submission"),
    owner_user_id: str | None = Form(default=None),
) -> DocumentOut:
    assert_user_exists(owner_user_id)
    body = await extract_text_from_upload(file)
    row = insert_document(
        title=(title or file.filename or "uploaded-document").strip(),
        text=body,
        kind=kind,
        owner_user_id=owner_user_id,
    )
    tokens = tokenize_with_spans(row["text"])
    token_values = [token for token, _, _ in tokens]
    upsert_document_index(
        document_id=row["id"],
        shingle_size=SHINGLE_SIZE,
        token_count=len(token_values),
        shingles=shingle_hashes(token_values, SHINGLE_SIZE),
    )
    if row["kind"] == "reference":
        promote_document_to_unique_reference(row["id"])
        row = get_document(row["id"]) or row
    return document_out_from_row(row)


@app.get("/documents", response_model=list[DocumentOut], tags=["documents"])
def get_documents(
    kind: DocumentKind | None = None,
    only_unique: bool | None = None,
) -> list[DocumentOut]:
    rows = list_documents(kind=kind, only_unique=only_unique)
    return [document_out_from_row(row) for row in rows]


@app.get("/documents/{document_id}", response_model=DocumentOut, tags=["documents"])
def get_document_by_id(document_id: str) -> DocumentOut:
    row = get_document(document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document_out_from_row(row)


@app.patch("/documents/{document_id}", response_model=DocumentOut, tags=["documents"])
def patch_document(document_id: str, payload: DocumentUpdate) -> DocumentOut:
    current = get_document(document_id)
    if not current:
        raise HTTPException(status_code=404, detail="Document not found.")

    fields: dict[str, object] = {}
    if payload.title is not None:
        fields["title"] = payload.title.strip()
    if payload.text is not None:
        fields["text"] = payload.text
    if payload.kind is not None:
        fields["kind"] = payload.kind
        if payload.kind == "reference":
            fields["is_unique"] = True
        elif payload.kind == "submission":
            fields["is_unique"] = False
    if payload.owner_user_id is not None:
        assert_user_exists(payload.owner_user_id)
        fields["owner_user_id"] = payload.owner_user_id or None

    updated = update_document_fields(document_id, fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Rebuild index if text changed or document type changed.
    if payload.text is not None or payload.kind is not None:
        tokens = tokenize_with_spans(updated["text"])
        token_values = [token for token, _, _ in tokens]
        upsert_document_index(
            document_id=updated["id"],
            shingle_size=SHINGLE_SIZE,
            token_count=len(token_values),
            shingles=shingle_hashes(token_values, SHINGLE_SIZE),
        )

    if updated["kind"] == "reference":
        promote_document_to_unique_reference(updated["id"])
        updated = get_document(updated["id"]) or updated

    return document_out_from_row(updated)


@app.delete("/documents/{document_id}", tags=["documents"])
def delete_document(document_id: str) -> dict[str, str]:
    if not delete_document_by_id(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"status": "deleted", "document_id": document_id}


@app.get("/archive/unique", response_model=list[ArchiveItem], tags=["archive"])
def get_unique_archive() -> list[ArchiveItem]:
    rows = list_archive_unique()
    return [ArchiveItem(**row) for row in rows]


@app.post("/rules/exclusions", response_model=ExclusionRuleOut, tags=["rules"])
def create_exclusion_rule(payload: ExclusionRuleCreate) -> ExclusionRuleOut:
    value = (payload.value or payload.pattern or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Rule value must not be empty.")
    rule_type: RuleType = "regex" if payload.value is None and payload.pattern else payload.rule_type
    compiled_pattern = compile_rule_pattern(rule_type, value)
    try:
        re.compile(compiled_pattern)
    except re.error as exc:
        raise HTTPException(status_code=400, detail=f"Invalid regex: {exc}") from exc
    rule = insert_rule(
        name=payload.name.strip(),
        rule_type=rule_type,
        value=value,
        pattern=compiled_pattern,
        description=payload.description,
    )
    return ExclusionRuleOut(**rule)


@app.get("/rules/exclusions", response_model=list[ExclusionRuleOut], tags=["rules"])
def get_exclusion_rules() -> list[ExclusionRuleOut]:
    return [ExclusionRuleOut(**row) for row in list_rules()]


@app.delete("/rules/exclusions/{rule_id}", tags=["rules"])
def remove_exclusion_rule(rule_id: str) -> dict[str, str]:
    if not delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"status": "deleted"}


@app.post("/checks", response_model=CheckOut, tags=["checks"])
def run_check(payload: CheckRequest) -> CheckOut:
    submission_doc = None
    if payload.submission_document_id:
        submission_doc = get_document(payload.submission_document_id)
        if not submission_doc:
            raise HTTPException(status_code=404, detail="Submission document not found.")
        if submission_doc["kind"] != "submission":
            raise HTTPException(
                status_code=400,
                detail="Only submission documents can be checked.",
            )

    if submission_doc:
        source_text = submission_doc["text"]
    else:
        if not payload.text:
            raise HTTPException(
                status_code=400,
                detail="Provide submission_document_id or raw text for analysis.",
            )
        source_text = payload.text
        if payload.owner_user_id:
            assert_user_exists(payload.owner_user_id)

    patterns = [r["pattern"] for r in list_rules()] if payload.use_exclusion_rules else []
    processed_text = apply_exclusions(source_text, patterns).strip()
    query_tokens_spans = tokenize_with_spans(processed_text)
    if not query_tokens_spans:
        raise HTTPException(status_code=400, detail="Text has no tokens for analysis.")

    query_tokens = [token for token, _, _ in query_tokens_spans]
    query_shingles = make_shingles(query_tokens, SHINGLE_SIZE)
    query_hashes = {hash_shingle(shingle) for shingle in query_shingles}

    source_docs = list_reference_candidates(
        include_unique_archive=payload.include_unique_archive,
        reference_ids=payload.reference_ids,
        exclude_document_id=submission_doc["id"] if submission_doc else None,
    )
    if not source_docs:
        raise HTTPException(status_code=400, detail="No sources available for comparison.")

    matched_positions: set[int] = set()
    highlighted_intervals: list[tuple[int, int]] = []
    matches_payload: list[dict] = []

    for ref in source_docs:
        ref_text = apply_exclusions(ref["text"], patterns) if payload.use_exclusion_rules else ref["text"]
        ref_tokens_spans = tokenize_with_spans(ref_text)
        if not ref_tokens_spans:
            continue
        ref_tokens = [token for token, _, _ in ref_tokens_spans]

        if payload.use_exclusion_rules:
            ref_hashes = shingle_hashes(ref_tokens, SHINGLE_SIZE)
        else:
            indexed = get_document_index(ref["id"])
            if indexed and indexed["shingle_size"] == SHINGLE_SIZE:
                ref_hashes = indexed["shingles"]
            else:
                ref_hashes = shingle_hashes(ref_tokens, SHINGLE_SIZE)
                upsert_document_index(
                    document_id=ref["id"],
                    shingle_size=SHINGLE_SIZE,
                    token_count=len(ref_tokens),
                    shingles=ref_hashes,
                )

        common = query_hashes.intersection(ref_hashes)
        if not common:
            continue

        local_positions: set[int] = set()
        source_local_positions: set[int] = set()
        for i in range(len(query_tokens) - SHINGLE_SIZE + 1):
            shingle = tuple(query_tokens[i : i + SHINGLE_SIZE])
            if hash_shingle(shingle) in common:
                local_positions.update(range(i, i + SHINGLE_SIZE))
                matched_positions.update(range(i, i + SHINGLE_SIZE))
        for i in range(len(ref_tokens) - SHINGLE_SIZE + 1):
            shingle = tuple(ref_tokens[i : i + SHINGLE_SIZE])
            if hash_shingle(shingle) in common:
                source_local_positions.update(range(i, i + SHINGLE_SIZE))

        if not local_positions:
            continue

        start_idx = min(local_positions)
        end_idx = max(local_positions)
        start_char = query_tokens_spans[start_idx][1]
        end_char = query_tokens_spans[end_idx][2]
        highlighted_intervals.append((start_char, end_char))
        source_fragment = ""
        if source_local_positions:
            source_start_idx = min(source_local_positions)
            source_end_idx = max(source_local_positions)
            source_start_char = ref_tokens_spans[source_start_idx][1]
            source_end_char = ref_tokens_spans[source_end_idx][2]
            source_fragment = ref_text[source_start_char:source_end_char]

        overlap_percent = round(len(local_positions) / len(query_tokens) * 100, 2)
        matches_payload.append(
            {
                "source_document_id": ref["id"],
                "source_title": ref["title"],
                "source_kind": ref["kind"],
                "source_url": ref["source_url"],
                "overlap_percent": overlap_percent,
                "fragment": processed_text[start_char:end_char],
                "source_fragment": source_fragment,
                "start_char": start_char,
                "end_char": end_char,
            }
        )

    total_tokens = len(query_tokens)
    matched_tokens = len(matched_positions)
    originality_percent = round(max(0.0, (1 - matched_tokens / total_tokens) * 100), 2)
    highlighted_html = build_highlight_html(processed_text, highlighted_intervals)

    if submission_doc:
        submission_document_id = submission_doc["id"]
        # Store fresh index for submission in archive index storage.
        upsert_document_index(
            document_id=submission_document_id,
            shingle_size=SHINGLE_SIZE,
            token_count=len(query_tokens),
            shingles=query_hashes,
        )
    else:
        submission_document_id = None

    persisted = insert_check(
        submission_document_id=submission_document_id,
        total_tokens=total_tokens,
        matched_tokens=matched_tokens,
        originality_percent=originality_percent,
        processed_text=processed_text,
        highlighted_html=highlighted_html,
    )
    insert_check_matches(persisted["id"], matches_payload)

    if submission_document_id and originality_percent >= payload.uniqueness_threshold:
        mark_document_unique(submission_document_id)

    return check_out_from_db(persisted["id"])


@app.get("/checks/{check_id}", response_model=CheckOut, tags=["checks"])
def get_check_result(check_id: str) -> CheckOut:
    return check_out_from_db(check_id)


@app.patch("/checks/{check_id}/originality", response_model=CheckOut, tags=["checks"])
def patch_check_originality(check_id: str, payload: CheckOriginalityUpdate) -> CheckOut:
    if not update_check_originality(check_id, payload.originality_percent):
        raise HTTPException(status_code=404, detail="Check result not found.")
    return check_out_from_db(check_id)


@app.get("/checks/{check_id}/report", response_model=CheckReportOut, tags=["checks"])
def get_check_report(check_id: str) -> CheckReportOut:
    check = check_out_from_db(check_id)
    by_kind = Counter(match.source_kind for match in check.matches)
    summary: dict[str, float | int] = {
        "originality_percent": check.originality_percent,
        "matched_sources": len(check.matches),
        "matched_tokens": check.matched_tokens,
        "total_tokens": check.total_tokens,
    }
    return CheckReportOut(
        check=check,
        summary=summary,
        by_source_kind=dict(by_kind),
    )


@app.post("/documents/{document_id}/archive", tags=["archive"])
def add_document_to_unique_archive(document_id: str) -> dict[str, str]:
    if not promote_document_to_unique_reference(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"status": "added_to_unique_archive", "document_id": document_id}
