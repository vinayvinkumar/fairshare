from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

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


if __name__ == "__main__":
    unittest.main()
