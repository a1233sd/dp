"""Initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-12 00:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS exclusion_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL DEFAULT 'regex',
            value TEXT NOT NULL DEFAULT '',
            pattern TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    op.execute(
        """
        ALTER TABLE exclusion_rules
        ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'regex'
        """
    )
    op.execute(
        """
        ALTER TABLE exclusion_rules
        ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT ''
        """
    )
    op.execute(
        """
        UPDATE exclusion_rules
        SET value = pattern
        WHERE value = ''
        """
    )

    op.execute(
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
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS document_indexes (
            document_id TEXT PRIMARY KEY,
            shingle_size INTEGER NOT NULL,
            token_count INTEGER NOT NULL,
            shingles_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
        """
    )

    op.execute(
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
        )
        """
    )

    op.execute(
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
        )
        """
    )

    op.execute(
        """
        ALTER TABLE check_matches
        ADD COLUMN IF NOT EXISTS source_fragment TEXT NOT NULL DEFAULT ''
        """
    )

    op.execute(
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

    op.execute(
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


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS check_matches")
    op.execute("DROP TABLE IF EXISTS checks")
    op.execute("DROP TABLE IF EXISTS document_indexes")
    op.execute("DROP TABLE IF EXISTS documents")
    op.execute("DROP TABLE IF EXISTS exclusion_rules")
    op.execute("DROP TABLE IF EXISTS users")
