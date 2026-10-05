from decimal import Decimal
import unittest

from fairshare.domain import (
    ValidationError,
    allocate_split,
    calculate_balances,
    percentage_defaults,
    simplify_balances,
    to_minor_units,
)


class MoneyTests(unittest.TestCase):
    def test_money_uses_currency_precision(self):
        self.assertEqual(to_minor_units("123.456", "INR"), 12346)
        self.assertEqual(to_minor_units("123.6", "JPY"), 124)

    def test_non_positive_amount_is_rejected(self):
        with self.assertRaises(ValidationError):
            to_minor_units("0", "INR")


class SplitTests(unittest.TestCase):
    def test_equal_split_preserves_every_cent(self):
        self.assertEqual(
            allocate_split(10000, ["a", "b", "c"], "equal"),
            {"a": 3334, "b": 3333, "c": 3333},
        )

    def test_exact_split_requires_full_total(self):
        with self.assertRaises(ValidationError):
            allocate_split(10000, ["a", "b"], "exact", {"a": "40", "b": "50"})

    def test_percentage_split_handles_rounding(self):
        values = {"a": Decimal("33.33"), "b": Decimal("33.33"), "c": Decimal("33.34")}
        result = allocate_split(10000, values.keys(), "percentage", values)
        self.assertEqual(sum(result.values()), 10000)
        self.assertEqual(result["c"], 3334)

    def test_share_split_is_proportional(self):
        result = allocate_split(12000, ["a", "b", "c"], "shares", {"a": 1, "b": 2, "c": 3})
        self.assertEqual(result, {"a": 2000, "b": 4000, "c": 6000})

    def test_percentage_defaults_total_one_hundred(self):
        self.assertEqual(sum(percentage_defaults(["a", "b", "c"]).values()), Decimal("100.00"))


class BalanceTests(unittest.TestCase):
    def test_balances_and_settlement_reach_zero(self):
        expenses = [
            {
                "amount_minor": 9000,
                "paid_by_member_id": "a",
                "splits": [
                    {"member_id": "a", "amount_minor": 3000},
                    {"member_id": "b", "amount_minor": 3000},
                    {"member_id": "c", "amount_minor": 3000},
                ],
            }
        ]
        balances = calculate_balances(expenses, [])
        self.assertEqual(balances, {"a": 6000, "b": -3000, "c": -3000})

        settlements = [
            {"from_member_id": "b", "to_member_id": "a", "amount_minor": 3000},
            {"from_member_id": "c", "to_member_id": "a", "amount_minor": 3000},
        ]
        self.assertEqual(calculate_balances(expenses, settlements), {"a": 0, "b": 0, "c": 0})

    def test_simplification_minimizes_transfers(self):
        transfers = simplify_balances({"a": 7000, "b": -5000, "c": -2000})
        self.assertEqual(
            transfers,
            [
                {"from_member_id": "b", "to_member_id": "a", "amount_minor": 5000},
                {"from_member_id": "c", "to_member_id": "a", "amount_minor": 2000},
            ],
        )


if __name__ == "__main__":
    unittest.main()
