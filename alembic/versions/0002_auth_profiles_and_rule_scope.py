"""Auth sessions, profiles, and scoped rules

Revision ID: 0002_auth_profiles_and_rule_scope
Revises: 0001_initial_schema
Create Date: 2026-05-25 00:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_auth_profiles_and_rule_scope"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, name),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        ALTER TABLE exclusion_rules
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE exclusion_rules
        ADD COLUMN IF NOT EXISTS profile_id TEXT
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE exclusion_rules DROP COLUMN IF EXISTS profile_id")
    op.execute("ALTER TABLE exclusion_rules DROP COLUMN IF EXISTS owner_user_id")
    op.execute("DROP TABLE IF EXISTS user_sessions")
    op.execute("DROP TABLE IF EXISTS user_profiles")
