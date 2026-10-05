from __future__ import annotations

from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from threading import RLock
from typing import Iterable, Mapping
from uuid import uuid4


SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (group_id, member_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        amount_minor BIGINT NOT NULL,
        currency TEXT NOT NULL,
        paid_by_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        split_method TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS expense_splits (
        expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        amount_minor BIGINT NOT NULL,
        PRIMARY KEY (expense_id, member_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        from_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        to_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        amount_minor BIGINT NOT NULL,
        currency TEXT NOT NULL,
        settled_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_expenses_group_date ON expenses(group_id, expense_date)",
    "CREATE INDEX IF NOT EXISTS idx_settlements_group_date ON settlements(group_id, settled_date)",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_text(value: object, field_name: str, maximum: int = 120) -> str:
    text = " ".join(str(value or "").split())
    if not text:
        raise ValueError(f"{field_name} is required.")
    if len(text) > maximum:
        raise ValueError(f"{field_name} must be {maximum} characters or fewer.")
    return text


@dataclass
class _TransactionState:
    connection: object
    rollback_only: bool = False


class LedgerStore:
    def __init__(self, database_url: str | None = None, sqlite_path: str | Path = "data/fairshare.db"):
        self.database_url = (database_url or "").strip()
        self.sqlite_path = Path(sqlite_path)
        self.backend = "postgresql" if self.database_url.startswith(("postgres://", "postgresql://")) else "sqlite"
        self._lock = RLock()
        self._transaction_state: ContextVar[_TransactionState | None] = ContextVar(
            f"fairshare_transaction_{id(self)}",
            default=None,
        )
        self._owner_member_id: str | None = None
        self._pool = self._create_pool() if self.backend == "postgresql" else None
        if self.backend == "sqlite":
            self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def storage_label(self) -> str:
        return "Cloud PostgreSQL" if self.backend == "postgresql" else "Local SQLite"

    def _create_pool(self):
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as error:
            raise RuntimeError(
                "PostgreSQL storage requires psycopg and psycopg-pool. Install the packages in requirements.txt."
            ) from error

        url = self.database_url.replace("postgres://", "postgresql://", 1)
        return ConnectionPool(
            conninfo=url,
            min_size=0,
            max_size=4,
            timeout=30,
            kwargs={"row_factory": dict_row},
            check=ConnectionPool.check_connection,
            open=True,
        )

    def _connect(self):
        connection = sqlite3.connect(self.sqlite_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def _connection(self):
        if self.backend == "postgresql":
            if self._pool is None:
                raise RuntimeError("PostgreSQL connection pool is unavailable.")
            with self._pool.connection() as connection:
                yield connection
            return

        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    def _sql(self, query: str) -> str:
        return query.replace("?", "%s") if self.backend == "postgresql" else query

    @contextmanager
    def transaction(self):
        active_state = self._transaction_state.get()
        if active_state is not None:
            try:
                yield active_state.connection
            except Exception:
                active_state.rollback_only = True
                raise
            return

        lock = self._lock if self.backend == "sqlite" else nullcontext()
        with lock:
            with self._connection() as connection:
                state = _TransactionState(connection)
                token = self._transaction_state.set(state)
                try:
                    yield connection
                    if state.rollback_only:
                        raise RuntimeError("Transaction rolled back because a nested operation failed.")
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
                finally:
                    self._transaction_state.reset(token)

    def _execute(self, connection, query: str, parameters: Iterable[object] = ()):
        return connection.execute(self._sql(query), tuple(parameters))

    @staticmethod
    def _as_dict(row) -> dict:
        return dict(row)

    def initialize(self, owner_name: str = "You", default_currency: str = "INR") -> None:
        with self.transaction() as connection:
            for statement in SCHEMA:
                self._execute(connection, statement)

            owner_row = self._execute(
                connection,
                "SELECT value FROM app_settings WHERE key = ?",
                ("owner_member_id",),
            ).fetchone()
            if owner_row:
                owner_id = self._as_dict(owner_row)["value"]
            else:
                owner_id = uuid4().hex
                group_id = uuid4().hex
                created_at = utc_now()
                self._execute(
                    connection,
                    "INSERT INTO members (id, name, email, created_at) VALUES (?, ?, ?, ?)",
                    (owner_id, clean_text(owner_name, "Owner name"), None, created_at),
                )
                self._execute(
                    connection,
                    "INSERT INTO groups (id, name, emoji, currency, created_at) VALUES (?, ?, ?, ?, ?)",
                    (group_id, "My first group", "✨", default_currency.upper(), created_at),
                )
                self._execute(
                    connection,
                    "INSERT INTO group_members (group_id, member_id, created_at) VALUES (?, ?, ?)",
                    (group_id, owner_id, created_at),
                )
                self._execute(
                    connection,
                    "INSERT INTO app_settings (key, value) VALUES (?, ?)",
                    ("owner_member_id", owner_id),
                )
        self._owner_member_id = owner_id

    def owner_member_id(self) -> str:
        if self._owner_member_id:
            return self._owner_member_id
        with self.transaction() as connection:
            row = self._execute(
                connection,
                "SELECT value FROM app_settings WHERE key = ?",
                ("owner_member_id",),
            ).fetchone()
        if not row:
            raise RuntimeError("FairShare has not been initialized.")
        self._owner_member_id = self._as_dict(row)["value"]
        return self._owner_member_id

    def list_members(self) -> list[dict]:
        with self.transaction() as connection:
            rows = self._execute(connection, "SELECT * FROM members ORDER BY lower(name), created_at").fetchall()
        return [self._as_dict(row) for row in rows]

    def add_member(self, name: str, email: str | None = None) -> str:
        member_id = uuid4().hex
        normalized_email = " ".join(str(email or "").split()) or None
        if normalized_email and len(normalized_email) > 160:
            raise ValueError("Email must be 160 characters or fewer.")
        with self.transaction() as connection:
            self._execute(
                connection,
                "INSERT INTO members (id, name, email, created_at) VALUES (?, ?, ?, ?)",
                (member_id, clean_text(name, "Name", 80), normalized_email, utc_now()),
            )
        return member_id

    def list_groups(self) -> list[dict]:
        query = """
            SELECT g.*, COUNT(gm.member_id) AS member_count
            FROM groups g
            LEFT JOIN group_members gm ON gm.group_id = g.id
            WHERE g.archived_at IS NULL
            GROUP BY g.id, g.name, g.emoji, g.currency, g.created_at, g.archived_at
            ORDER BY g.created_at, lower(g.name)
        """
        with self.transaction() as connection:
            rows = self._execute(connection, query).fetchall()
        return [self._as_dict(row) for row in rows]

    def get_group(self, group_id: str) -> dict | None:
        with self.transaction() as connection:
            row = self._execute(
                connection,
                "SELECT * FROM groups WHERE id = ? AND archived_at IS NULL",
                (group_id,),
            ).fetchone()
        return self._as_dict(row) if row else None

    def add_group(self, name: str, emoji: str, currency: str, member_ids: Iterable[str]) -> str:
        group_id = uuid4().hex
        members = list(dict.fromkeys(member_ids))
        if not members:
            raise ValueError("A group needs at least one member.")
        created_at = utc_now()
        with self.transaction() as connection:
            self._execute(
                connection,
                "INSERT INTO groups (id, name, emoji, currency, created_at) VALUES (?, ?, ?, ?, ?)",
                (group_id, clean_text(name, "Group name", 80), emoji or "✨", currency.upper(), created_at),
            )
            for member_id in members:
                self._execute(
                    connection,
                    "INSERT INTO group_members (group_id, member_id, created_at) VALUES (?, ?, ?)",
                    (group_id, member_id, created_at),
                )
        return group_id

    def group_members(self, group_id: str) -> list[dict]:
        query = """
            SELECT m.*
            FROM members m
            JOIN group_members gm ON gm.member_id = m.id
            WHERE gm.group_id = ?
            ORDER BY lower(m.name), m.created_at
        """
        with self.transaction() as connection:
            rows = self._execute(connection, query, (group_id,)).fetchall()
        return [self._as_dict(row) for row in rows]

    def add_members_to_group(self, group_id: str, member_ids: Iterable[str]) -> None:
        with self.transaction() as connection:
            existing = {member["id"] for member in self.group_members(group_id)}
            created_at = utc_now()
            for member_id in dict.fromkeys(member_ids):
                if member_id in existing:
                    continue
                self._execute(
                    connection,
                    "INSERT INTO group_members (group_id, member_id, created_at) VALUES (?, ?, ?)",
                    (group_id, member_id, created_at),
                )

    def add_expense(
        self,
        *,
        group_id: str,
        description: str,
        amount_minor: int,
        currency: str,
        paid_by_member_id: str,
        expense_date: str,
        category: str,
        notes: str,
        split_method: str,
        splits: Mapping[str, int],
    ) -> str:
        expense_id = uuid4().hex
        if sum(splits.values()) != amount_minor:
            raise ValueError("Expense splits must match the expense total.")
        with self.transaction() as connection:
            self._execute(
                connection,
                """
                INSERT INTO expenses (
                    id, group_id, description, amount_minor, currency, paid_by_member_id,
                    expense_date, category, notes, split_method, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    expense_id,
                    group_id,
                    clean_text(description, "Description", 120),
                    amount_minor,
                    currency.upper(),
                    paid_by_member_id,
                    expense_date,
                    clean_text(category, "Category", 40),
                    notes.strip()[:500] or None,
                    split_method,
                    utc_now(),
                ),
            )
            for member_id, share_minor in splits.items():
                self._execute(
                    connection,
                    "INSERT INTO expense_splits (expense_id, member_id, amount_minor) VALUES (?, ?, ?)",
                    (expense_id, member_id, share_minor),
                )
        return expense_id

    def add_settlement(
        self,
        *,
        group_id: str,
        from_member_id: str,
        to_member_id: str,
        amount_minor: int,
        currency: str,
        settled_date: str,
        notes: str,
    ) -> str:
        if from_member_id == to_member_id:
            raise ValueError("Choose two different people for a settlement.")
        settlement_id = uuid4().hex
        with self.transaction() as connection:
            self._execute(
                connection,
                """
                INSERT INTO settlements (
                    id, group_id, from_member_id, to_member_id, amount_minor,
                    currency, settled_date, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    settlement_id,
                    group_id,
                    from_member_id,
                    to_member_id,
                    amount_minor,
                    currency.upper(),
                    settled_date,
                    notes.strip()[:500] or None,
                    utc_now(),
                ),
            )
        return settlement_id

    def list_expenses(self, group_id: str, *, include_deleted: bool = False) -> list[dict]:
        deleted_filter = "" if include_deleted else "AND e.deleted_at IS NULL"
        query = f"""
            SELECT e.*, m.name AS paid_by_name
            FROM expenses e
            JOIN members m ON m.id = e.paid_by_member_id
            WHERE e.group_id = ? {deleted_filter}
            ORDER BY e.expense_date DESC, e.created_at DESC
        """
        with self.transaction() as connection:
            rows = [self._as_dict(row) for row in self._execute(connection, query, (group_id,)).fetchall()]
            if not rows:
                return []
            placeholders = ", ".join("?" for _ in rows)
            split_rows = self._execute(
                connection,
                f"""
                SELECT es.*, m.name AS member_name
                FROM expense_splits es
                JOIN members m ON m.id = es.member_id
                WHERE es.expense_id IN ({placeholders})
                ORDER BY lower(m.name)
                """,
                [row["id"] for row in rows],
            ).fetchall()
        splits_by_expense: dict[str, list[dict]] = {row["id"]: [] for row in rows}
        for split_row in split_rows:
            split = self._as_dict(split_row)
            splits_by_expense[split["expense_id"]].append(split)
        for row in rows:
            row["splits"] = splits_by_expense[row["id"]]
        return rows

    def list_settlements(self, group_id: str, *, include_deleted: bool = False) -> list[dict]:
        deleted_filter = "" if include_deleted else "AND s.deleted_at IS NULL"
        query = f"""
            SELECT s.*, payer.name AS from_name, recipient.name AS to_name
            FROM settlements s
            JOIN members payer ON payer.id = s.from_member_id
            JOIN members recipient ON recipient.id = s.to_member_id
            WHERE s.group_id = ? {deleted_filter}
            ORDER BY s.settled_date DESC, s.created_at DESC
        """
        with self.transaction() as connection:
            rows = self._execute(connection, query, (group_id,)).fetchall()
        return [self._as_dict(row) for row in rows]

    def group_ledger(self, group_id: str) -> dict[str, list[dict]]:
        with self.transaction():
            return {
                "expenses": self.list_expenses(group_id),
                "settlements": self.list_settlements(group_id),
            }

    def soft_delete(self, record_type: str, record_id: str) -> None:
        table = {"expense": "expenses", "settlement": "settlements"}.get(record_type)
        if not table:
            raise ValueError("Unsupported activity type.")
        with self.transaction() as connection:
            self._execute(
                connection,
                f"UPDATE {table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
                (utc_now(), record_id),
            )

    def restore(self, record_type: str, record_id: str) -> None:
        table = {"expense": "expenses", "settlement": "settlements"}.get(record_type)
        if not table:
            raise ValueError("Unsupported activity type.")
        with self.transaction() as connection:
            self._execute(connection, f"UPDATE {table} SET deleted_at = NULL WHERE id = ?", (record_id,))

    @staticmethod
    def deleted_activity_from_records(expenses: list[dict], settlements: list[dict]) -> list[dict]:
        activity = [
            {
                "id": expense["id"],
                "type": "expense",
                "date": expense["expense_date"],
                "title": expense["description"],
                "amount_minor": expense["amount_minor"],
                "currency": expense["currency"],
                "deleted_at": expense["deleted_at"],
            }
            for expense in expenses
            if expense["deleted_at"]
        ]
        activity.extend(
            {
                "id": settlement["id"],
                "type": "settlement",
                "date": settlement["settled_date"],
                "title": f"{settlement['from_name']} paid {settlement['to_name']}",
                "amount_minor": settlement["amount_minor"],
                "currency": settlement["currency"],
                "deleted_at": settlement["deleted_at"],
            }
            for settlement in settlements
            if settlement["deleted_at"]
        )
        return sorted(activity, key=lambda item: (item["deleted_at"], item["date"]), reverse=True)

    def deleted_activity(self, group_id: str) -> list[dict]:
        with self.transaction():
            expenses = self.list_expenses(group_id, include_deleted=True)
            settlements = self.list_settlements(group_id, include_deleted=True)
        return self.deleted_activity_from_records(expenses, settlements)

    @staticmethod
    def export_payload_from_records(
        group: dict | None,
        members: list[dict],
        expenses: list[dict],
        settlements: list[dict],
    ) -> str:
        payload = {
            "format": "fairshare-backup-v1",
            "exported_at": utc_now(),
            "group": group,
            "members": members,
            "expenses": expenses,
            "settlements": settlements,
        }
        return json.dumps(payload, indent=2, ensure_ascii=False)

    def export_payload(self, group_id: str) -> str:
        with self.transaction():
            group = self.get_group(group_id)
            members = self.group_members(group_id)
            expenses = self.list_expenses(group_id, include_deleted=True)
            settlements = self.list_settlements(group_id, include_deleted=True)
        return self.export_payload_from_records(group, members, expenses, settlements)
