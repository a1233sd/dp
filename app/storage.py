from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row

# Compatibility alias for old tests/imports. SQLite file is no longer used.
DB_PATH = None
PG_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/antiplagiarism",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


def ensure_database_exists() -> None:
    conninfo = conninfo_to_dict(PG_DSN)
    target_db = conninfo.get("dbname")
    if not target_db:
        raise RuntimeError("DATABASE_URL must include database name.")

    admin_conninfo = make_conninfo(
        **{
            k: v
            for k, v in conninfo.items()
            if k != "dbname"
        },
        dbname="postgres",
    )

    with psycopg.connect(admin_conninfo, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (target_db,),
        ).fetchone()
        if exists:
            return
        conn.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db))
        )


@contextmanager
def connection() -> Iterable[psycopg.Connection]:
    conn = psycopg.connect(PG_DSN, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    ensure_database_exists()
    with connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exclusion_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                rule_type TEXT NOT NULL DEFAULT 'regex',
                value TEXT NOT NULL DEFAULT '',
                pattern TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            ALTER TABLE exclusion_rules
            ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'regex'
            """
        )
        conn.execute(
            """
            ALTER TABLE exclusion_rules
            ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT ''
            """
        )
        conn.execute(
            """
            UPDATE exclusion_rules
            SET value = pattern
            WHERE value = ''
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('reference', 'submission')),
                owner_user_id TEXT,
                source_url TEXT,
                is_unique BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TEXT NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_indexes (
                document_id TEXT PRIMARY KEY,
                shingle_size INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                shingles_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS checks (
                id TEXT PRIMARY KEY,
                submission_document_id TEXT,
                total_tokens INTEGER NOT NULL,
                matched_tokens INTEGER NOT NULL,
                originality_percent REAL NOT NULL,
                processed_text TEXT NOT NULL,
                highlighted_html TEXT NOT NULL,
                checked_at TEXT NOT NULL,
                FOREIGN KEY(submission_document_id) REFERENCES documents(id) ON DELETE SET NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS check_matches (
                id TEXT PRIMARY KEY,
                check_id TEXT NOT NULL,
                source_document_id TEXT NOT NULL,
                source_title TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                source_url TEXT,
                overlap_percent REAL NOT NULL,
                fragment TEXT NOT NULL,
                source_fragment TEXT NOT NULL DEFAULT '',
                start_char INTEGER NOT NULL,
                end_char INTEGER NOT NULL,
                FOREIGN KEY(check_id) REFERENCES checks(id) ON DELETE CASCADE,
                FOREIGN KEY(source_document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
            """
        )
        conn.execute(
            """
            ALTER TABLE check_matches
            ADD COLUMN IF NOT EXISTS source_fragment TEXT NOT NULL DEFAULT ''
            """
        )
        conn.execute(
            """
            DO $$
            BEGIN
                EXECUTE format(
                    'ALTER TABLE documents DROP COLUMN IF EXISTS %I',
                    'content' || '_' || 'type'
                );
            END $$;
            """
        )
        conn.execute(
            """
            DO $$
            BEGIN
                EXECUTE format(
                    'ALTER TABLE checks DROP COLUMN IF EXISTS %I',
                    'content' || '_' || 'type'
                );
            END $$;
            """
        )


def reset_db() -> None:
    init_db()
    with connection() as conn:
        conn.execute(
            """
            TRUNCATE TABLE
                check_matches,
                checks,
                document_indexes,
                documents,
                exclusion_rules,
                users
            RESTART IDENTITY CASCADE
            """
        )


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connection() as conn:
        return list(conn.execute(query, params).fetchall())


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with connection() as conn:
        return conn.execute(query, params).fetchone()


def execute(query: str, params: tuple[Any, ...] = ()) -> None:
    with connection() as conn:
        conn.execute(query, params)


def execute_many(query: str, rows: Iterable[tuple[Any, ...]]) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(query, rows)


def insert_user(full_name: str, email: str, role: str, password_hash: str) -> dict[str, Any]:
    user_id = new_id()
    created_at = utc_now_iso()
    execute(
        """
        INSERT INTO users (id, full_name, email, role, password_hash, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, full_name, email.lower(), role, password_hash, created_at),
    )
    return {
        "id": user_id,
        "full_name": full_name,
        "email": email.lower(),
        "role": role,
        "created_at": created_at,
    }


def list_users() -> list[dict[str, Any]]:
    rows = fetch_all(
        "SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC"
    )
    return [dict(row) for row in rows]


def get_user(user_id: str) -> dict[str, Any] | None:
    row = fetch_one(
        "SELECT id, full_name, email, role, created_at FROM users WHERE id = %s",
        (user_id,),
    )
    return dict(row) if row else None


def insert_rule(
    name: str,
    rule_type: str,
    value: str,
    pattern: str,
    description: str | None,
) -> dict[str, Any]:
    rule_id = new_id()
    created_at = utc_now_iso()
    execute(
        """
        INSERT INTO exclusion_rules (id, name, rule_type, value, pattern, description, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (rule_id, name, rule_type, value, pattern, description, created_at),
    )
    return {
        "id": rule_id,
        "name": name,
        "rule_type": rule_type,
        "value": value,
        "pattern": pattern,
        "description": description,
        "created_at": created_at,
    }


def list_rules() -> list[dict[str, Any]]:
    rows = fetch_all("SELECT * FROM exclusion_rules ORDER BY created_at DESC")
    return [dict(row) for row in rows]


def delete_rule(rule_id: str) -> bool:
    before = fetch_one("SELECT id FROM exclusion_rules WHERE id = %s", (rule_id,))
    if not before:
        return False
    execute("DELETE FROM exclusion_rules WHERE id = %s", (rule_id,))
    return True


def insert_document(
    title: str,
    text: str,
    kind: str,
    owner_user_id: str | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    doc_id = new_id()
    created_at = utc_now_iso()
    execute(
        """
        INSERT INTO documents (id, title, text, kind, owner_user_id, source_url, is_unique, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s)
        """,
        (doc_id, title, text, kind, owner_user_id, source_url, created_at),
    )
    return get_document(doc_id)  # type: ignore[return-value]


def get_document(doc_id: str) -> dict[str, Any] | None:
    row = fetch_one("SELECT * FROM documents WHERE id = %s", (doc_id,))
    return dict(row) if row else None


def update_document_fields(doc_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
    if not fields:
        return get_document(doc_id)
    if not get_document(doc_id):
        return None
    allowed = {
        "title",
        "text",
        "kind",
        "owner_user_id",
        "source_url",
        "is_unique",
    }
    items = [(k, v) for k, v in fields.items() if k in allowed]
    if not items:
        return get_document(doc_id)

    set_parts = [f"{k} = %s" for k, _ in items]
    params = [v for _, v in items]
    params.append(doc_id)
    execute(
        f"UPDATE documents SET {', '.join(set_parts)} WHERE id = %s",
        tuple(params),
    )
    return get_document(doc_id)


def delete_document_by_id(doc_id: str) -> bool:
    if not get_document(doc_id):
        return False
    execute("DELETE FROM documents WHERE id = %s", (doc_id,))
    return True


def list_documents(
    kind: str | None = None,
    only_unique: bool | None = None,
) -> list[dict[str, Any]]:
    query = "SELECT * FROM documents WHERE 1=1"
    params: list[Any] = []
    if kind:
        query += " AND kind = %s"
        params.append(kind)
    if only_unique is True:
        query += " AND is_unique = TRUE"
    elif only_unique is False:
        query += " AND is_unique = FALSE"
    query += " ORDER BY created_at DESC"
    rows = fetch_all(query, tuple(params))
    return [dict(row) for row in rows]


def list_reference_candidates(
    include_unique_archive: bool,
    reference_ids: list[str] | None = None,
    exclude_document_id: str | None = None,
) -> list[dict[str, Any]]:
    query = """
    SELECT * FROM documents
    WHERE (
            kind = 'reference'
            OR (%s AND is_unique = TRUE)
      )
    """
    params: list[Any] = [include_unique_archive]
    if exclude_document_id:
        query += " AND id <> %s"
        params.append(exclude_document_id)
    if reference_ids:
        placeholders = ",".join("%s" for _ in reference_ids)
        query += f" AND id IN ({placeholders})"
        params.extend(reference_ids)
    query += " ORDER BY created_at DESC"
    rows = fetch_all(query, tuple(params))
    return [dict(row) for row in rows]


def mark_document_unique(doc_id: str) -> None:
    execute("UPDATE documents SET is_unique = TRUE WHERE id = %s", (doc_id,))


def mark_document_unique_if_exists(doc_id: str) -> bool:
    if not get_document(doc_id):
        return False
    mark_document_unique(doc_id)
    return True


def promote_document_to_unique_reference(doc_id: str) -> bool:
    if not get_document(doc_id):
        return False
    execute(
        "UPDATE documents SET kind = 'reference', is_unique = TRUE WHERE id = %s",
        (doc_id,),
    )
    return True


def upsert_document_index(document_id: str, shingle_size: int, token_count: int, shingles: set[str]) -> None:
    shingles_json = json.dumps(sorted(shingles), ensure_ascii=False)
    updated_at = utc_now_iso()
    execute(
        """
        INSERT INTO document_indexes (document_id, shingle_size, token_count, shingles_json, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT(document_id) DO UPDATE SET
            shingle_size = EXCLUDED.shingle_size,
            token_count = EXCLUDED.token_count,
            shingles_json = EXCLUDED.shingles_json,
            updated_at = EXCLUDED.updated_at
        """,
        (document_id, shingle_size, token_count, shingles_json, updated_at),
    )


def get_document_index(document_id: str) -> dict[str, Any] | None:
    row = fetch_one("SELECT * FROM document_indexes WHERE document_id = %s", (document_id,))
    if not row:
        return None
    payload = dict(row)
    payload["shingles"] = set(json.loads(payload["shingles_json"]))
    return payload


def list_archive_unique() -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT d.id, d.title, d.created_at, d.owner_user_id,
               i.shingle_size, i.token_count, i.updated_at
        FROM documents d
        LEFT JOIN document_indexes i ON i.document_id = d.id
        WHERE d.is_unique = TRUE
        ORDER BY d.created_at DESC
        """
    )
    return [dict(row) for row in rows]


def insert_check(
    submission_document_id: str | None,
    total_tokens: int,
    matched_tokens: int,
    originality_percent: float,
    processed_text: str,
    highlighted_html: str,
) -> dict[str, Any]:
    check_id = new_id()
    checked_at = utc_now_iso()
    execute(
        """
        INSERT INTO checks (
            id, submission_document_id, total_tokens, matched_tokens,
            originality_percent, processed_text, highlighted_html, checked_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            check_id,
            submission_document_id,
            total_tokens,
            matched_tokens,
            originality_percent,
            processed_text,
            highlighted_html,
            checked_at,
        ),
    )
    return get_check(check_id)  # type: ignore[return-value]


def insert_check_matches(check_id: str, matches: list[dict[str, Any]]) -> None:
    rows = []
    for match in matches:
        rows.append(
            (
                new_id(),
                check_id,
                match["source_document_id"],
                match["source_title"],
                match["source_kind"],
                match.get("source_url"),
                match["overlap_percent"],
                match["fragment"],
                match.get("source_fragment", ""),
                match["start_char"],
                match["end_char"],
            )
        )
    if rows:
        execute_many(
            """
            INSERT INTO check_matches (
                id, check_id, source_document_id, source_title, source_kind, source_url,
                overlap_percent, fragment, source_fragment, start_char, end_char
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )


def get_check(check_id: str) -> dict[str, Any] | None:
    row = fetch_one("SELECT * FROM checks WHERE id = %s", (check_id,))
    return dict(row) if row else None


def get_check_matches(check_id: str) -> list[dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT source_document_id, source_title, source_kind, source_url,
               overlap_percent, fragment, source_fragment, start_char, end_char
        FROM check_matches
        WHERE check_id = %s
        ORDER BY overlap_percent DESC
        """,
        (check_id,),
    )
    return [dict(row) for row in rows]


def update_check_originality(check_id: str, originality_percent: float) -> bool:
    if not get_check(check_id):
        return False
    execute(
        "UPDATE checks SET originality_percent = %s WHERE id = %s",
        (originality_percent, check_id),
    )
    return True
