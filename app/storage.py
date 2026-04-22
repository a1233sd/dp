from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row

BASE_DIR = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)
DEFAULT_POSTGRES_DSN = "postgresql://postgres:postgres@localhost:5432/antiplagiarism"
DEFAULT_SQLITE_PATH = BASE_DIR / "antiplagiarism.sqlite3"
DEFAULT_SQLITE_DSN = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
DATABASE_URL_ENV = os.getenv("DATABASE_URL")
DATABASE_URL = DATABASE_URL_ENV or DEFAULT_POSTGRES_DSN
DB_CONNECT_TIMEOUT_SECONDS = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5"))


def is_sqlite_dsn(dsn: str) -> bool:
    return dsn.startswith("sqlite:///")


def sqlite_path_from_dsn(dsn: str) -> Path | None:
    if not is_sqlite_dsn(dsn):
        return None
    raw_path = unquote(dsn.removeprefix("sqlite:///"))
    if not raw_path:
        return None
    return Path(raw_path)

def apply_connect_timeout(dsn: str, timeout_seconds: int) -> str:
    if is_sqlite_dsn(dsn):
        return dsn
    parts = urlsplit(dsn)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("connect_timeout", str(timeout_seconds))
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def configure_database(dsn: str) -> None:
    global DATABASE_URL, USE_SQLITE, DB_PATH, PG_DSN_WITH_TIMEOUT
    DATABASE_URL = dsn
    USE_SQLITE = is_sqlite_dsn(dsn)
    DB_PATH = sqlite_path_from_dsn(dsn)
    PG_DSN_WITH_TIMEOUT = apply_connect_timeout(dsn, DB_CONNECT_TIMEOUT_SECONDS)


configure_database(DATABASE_URL)


def to_sqlalchemy_psycopg_dsn(dsn: str) -> str:
    if is_sqlite_dsn(dsn):
        return dsn
    if dsn.startswith("postgresql+"):
        return dsn
    if dsn.startswith("postgres://"):
        return dsn.replace("postgres://", "postgresql+psycopg://", 1)
    if dsn.startswith("postgresql://"):
        return dsn.replace("postgresql://", "postgresql+psycopg://", 1)
    return dsn


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


def should_fallback_to_sqlite(exc: Exception) -> bool:
    return DATABASE_URL_ENV is None and not USE_SQLITE and isinstance(exc, psycopg.Error)


def activate_sqlite_fallback(exc: Exception) -> None:
    configure_database(DEFAULT_SQLITE_DSN)
    logger.warning(
        "PostgreSQL is unavailable and DATABASE_URL is not set. "
        "Falling back to local SQLite database at %s.",
        DB_PATH,
    )
    logger.warning("Original PostgreSQL connection error: %s", exc)


def ensure_database_exists() -> None:
    if USE_SQLITE:
        if DB_PATH and str(DB_PATH) != ":memory:":
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        return
    logger.info("Checking target database existence.")
    conninfo = conninfo_to_dict(PG_DSN_WITH_TIMEOUT)
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

    try:
        with psycopg.connect(admin_conninfo, autocommit=True) as conn:
            exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (target_db,),
            ).fetchone()
            if exists:
                logger.info("Target database already exists: %s", target_db)
                return
            logger.info("Creating target database: %s", target_db)
            conn.execute(
                sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db))
            )
            logger.info("Target database created: %s", target_db)
    except psycopg.Error as exc:
        if should_fallback_to_sqlite(exc):
            activate_sqlite_fallback(exc)
            return
        raise


def sqlite_query(query: str) -> str:
    return query.replace("%s", "?")


def sqlite_connect() -> sqlite3.Connection:
    db_target = ":memory:" if DB_PATH is None else str(DB_PATH)
    conn = sqlite3.connect(db_target)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    return dict(row)


def init_sqlite_schema() -> None:
    with sqlite_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS exclusion_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                rule_type TEXT NOT NULL DEFAULT 'regex',
                value TEXT NOT NULL DEFAULT '',
                pattern TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('reference', 'submission')),
                owner_user_id TEXT,
                source_url TEXT,
                is_unique INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS document_indexes (
                document_id TEXT PRIMARY KEY,
                shingle_size INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                shingles_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

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


@contextmanager
def connection() -> Iterable[Any]:
    if USE_SQLITE:
        conn = sqlite_connect()
    else:
        conn = psycopg.connect(PG_DSN_WITH_TIMEOUT, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    logger.info("init_db: ensure_database_exists started.")
    ensure_database_exists()
    logger.info("init_db: migrations started.")
    run_migrations()
    logger.info("init_db: migrations finished.")


def run_migrations() -> None:
    if USE_SQLITE:
        logger.info("Initializing SQLite schema.")
        init_sqlite_schema()
        logger.info("SQLite schema initialization finished.")
        return
    logger.info("Running Alembic upgrade head.")
    config = Config(str(BASE_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BASE_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", to_sqlalchemy_psycopg_dsn(PG_DSN_WITH_TIMEOUT))
    command.upgrade(config, "head")
    logger.info("Alembic upgrade head finished.")


def reset_db() -> None:
    init_db()
    with connection() as conn:
        if USE_SQLITE:
            for table in (
                "check_matches",
                "checks",
                "document_indexes",
                "documents",
                "exclusion_rules",
                "users",
            ):
                conn.execute(f"DELETE FROM {table}")
            return
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
        actual_query = sqlite_query(query) if USE_SQLITE else query
        rows = conn.execute(actual_query, params).fetchall()
        return [row_to_dict(row) for row in rows]


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with connection() as conn:
        actual_query = sqlite_query(query) if USE_SQLITE else query
        row = conn.execute(actual_query, params).fetchone()
        return row_to_dict(row) if row else None


def execute(query: str, params: tuple[Any, ...] = ()) -> None:
    with connection() as conn:
        actual_query = sqlite_query(query) if USE_SQLITE else query
        conn.execute(actual_query, params)


def execute_many(query: str, rows: Iterable[tuple[Any, ...]]) -> None:
    with connection() as conn:
        actual_query = sqlite_query(query) if USE_SQLITE else query
        if USE_SQLITE:
            conn.executemany(actual_query, rows)
            return
        with conn.cursor() as cur:
            cur.executemany(actual_query, rows)


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
