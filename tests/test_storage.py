from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest
from unittest.mock import patch

from fairshare.storage import LedgerStore


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "fairshare.db"
        self.store = LedgerStore(sqlite_path=database_path)
        self.store.initialize(owner_name="Owner", default_currency="INR")
        self.group = self.store.list_groups()[0]
        self.owner_id = self.store.owner_member_id()
        self.friend_id = self.store.add_member("Friend")
        self.store.add_members_to_group(self.group["id"], [self.friend_id])

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_expense_round_trip_and_restore(self):
        expense_id = self.store.add_expense(
            group_id=self.group["id"],
            description="Shared dinner",
            amount_minor=240000,
            currency="INR",
            paid_by_member_id=self.owner_id,
            expense_date="2026-10-04",
            category="Food & drink",
            notes="",
            split_method="equal",
            splits={self.owner_id: 120000, self.friend_id: 120000},
        )

        expenses = self.store.list_expenses(self.group["id"])
        self.assertEqual(len(expenses), 1)
        self.assertEqual(sum(split["amount_minor"] for split in expenses[0]["splits"]), 240000)
        self.assertEqual(self.store.deleted_activity(self.group["id"]), [])

        self.store.soft_delete("expense", expense_id)
        self.assertEqual(self.store.list_expenses(self.group["id"]), [])
        self.assertEqual(len(self.store.deleted_activity(self.group["id"])), 1)

        self.store.restore("expense", expense_id)
        self.assertEqual(len(self.store.list_expenses(self.group["id"])), 1)

    def test_export_contains_portable_group_data(self):
        payload = json.loads(self.store.export_payload(self.group["id"]))
        self.assertEqual(payload["format"], "fairshare-backup-v1")
        self.assertEqual(payload["group"]["currency"], "INR")
        self.assertEqual(len(payload["members"]), 2)

    def test_nested_operations_reuse_one_connection(self):
        with patch.object(self.store, "_connect", wraps=self.store._connect) as connect:
            with self.store.transaction():
                self.store.list_groups()
                self.store.list_members()
                self.store.group_members(self.group["id"])

        self.assertEqual(connect.call_count, 1)

    def test_outer_transaction_rolls_back_nested_writes(self):
        with self.assertRaisesRegex(RuntimeError, "cancel transaction"):
            with self.store.transaction():
                member_id = self.store.add_member("Temporary person")
                self.store.add_members_to_group(self.group["id"], [member_id])
                raise RuntimeError("cancel transaction")

        self.assertNotIn("Temporary person", [member["name"] for member in self.store.list_members()])

    def test_caught_nested_failure_marks_transaction_for_rollback(self):
        with self.assertRaisesRegex(RuntimeError, "nested operation failed"):
            with self.store.transaction():
                self.store.add_member("Temporary person")
                try:
                    with self.store.transaction():
                        raise ValueError("nested failure")
                except ValueError:
                    pass

        self.assertNotIn("Temporary person", [member["name"] for member in self.store.list_members()])


if __name__ == "__main__":
    unittest.main()
