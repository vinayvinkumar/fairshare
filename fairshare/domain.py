from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation, ROUND_FLOOR, ROUND_HALF_UP
from typing import Iterable, Mapping


class ValidationError(ValueError):
    pass


CURRENCY_SYMBOLS = {
    "AED": "AED ",
    "AUD": "A$",
    "CAD": "C$",
    "EUR": "€",
    "GBP": "£",
    "INR": "₹",
    "JPY": "¥",
    "SGD": "S$",
    "USD": "$",
}

ZERO_DECIMAL_CURRENCIES = {"JPY"}


def currency_scale(currency: str) -> int:
    return 1 if currency.upper() in ZERO_DECIMAL_CURRENCIES else 100


def to_minor_units(value: object, currency: str = "INR") -> int:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValidationError("Enter a valid amount.") from error
    if not amount.is_finite() or amount <= 0:
        raise ValidationError("Amount must be greater than zero.")
    return int((amount * currency_scale(currency)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_minor_units(value: int, currency: str = "INR") -> Decimal:
    return Decimal(value) / Decimal(currency_scale(currency))


def format_money(value: int, currency: str = "INR", *, signed: bool = False) -> str:
    currency = currency.upper()
    amount = from_minor_units(abs(value), currency)
    decimals = 0 if currency in ZERO_DECIMAL_CURRENCIES else 2
    prefix = CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    sign = ""
    if signed and value > 0:
        sign = "+"
    elif value < 0:
        sign = "−"
    return f"{sign}{prefix}{amount:,.{decimals}f}"


def _unique_participants(participant_ids: Iterable[str]) -> list[str]:
    participants = list(dict.fromkeys(participant_ids))
    if not participants:
        raise ValidationError("Select at least one person for this expense.")
    return participants


def _weighted_allocation(amount_minor: int, weights: Mapping[str, Decimal], order: list[str]) -> dict[str, int]:
    total_weight = sum(weights.values(), Decimal("0"))
    if total_weight <= 0:
        raise ValidationError("Split values must add up to more than zero.")

    raw_amounts = {
        member_id: Decimal(amount_minor) * weights[member_id] / total_weight
        for member_id in order
    }
    allocated = {
        member_id: int(raw_amounts[member_id].to_integral_value(rounding=ROUND_FLOOR))
        for member_id in order
    }
    remaining = amount_minor - sum(allocated.values())
    ranked = sorted(
        order,
        key=lambda member_id: (raw_amounts[member_id] - allocated[member_id], -order.index(member_id)),
        reverse=True,
    )
    for member_id in ranked[:remaining]:
        allocated[member_id] += 1
    return allocated


def allocate_split(
    amount_minor: int,
    participant_ids: Iterable[str],
    method: str,
    values: Mapping[str, object] | None = None,
    currency: str = "INR",
) -> dict[str, int]:
    participants = _unique_participants(participant_ids)
    if amount_minor <= 0:
        raise ValidationError("Amount must be greater than zero.")

    if method == "equal":
        quotient, remainder = divmod(amount_minor, len(participants))
        return {
            member_id: quotient + (1 if index < remainder else 0)
            for index, member_id in enumerate(participants)
        }

    if values is None:
        raise ValidationError("Enter the split values for every participant.")

    if method == "exact":
        try:
            exact_values = {member_id: Decimal(str(values.get(member_id, 0))) for member_id in participants}
        except (InvalidOperation, TypeError, ValueError) as error:
            raise ValidationError("Enter valid exact amounts.") from error
        if any(not value.is_finite() or value < 0 for value in exact_values.values()):
            raise ValidationError("Exact amounts cannot be negative.")
        shares = {
            member_id: int(
                (value * currency_scale(currency)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            )
            for member_id, value in exact_values.items()
        }
        if sum(shares.values()) != amount_minor:
            difference = format_money(sum(shares.values()) - amount_minor, currency, signed=True)
            raise ValidationError(f"Exact shares must match the expense total. Current difference: {difference}.")
        return shares

    try:
        weights = {member_id: Decimal(str(values.get(member_id, 0))) for member_id in participants}
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValidationError("Enter valid split values.") from error

    if any(not weight.is_finite() or weight <= 0 for weight in weights.values()):
        raise ValidationError("Every selected participant needs a positive split value.")

    if method == "percentage":
        percentage_total = sum(weights.values(), Decimal("0"))
        if abs(percentage_total - Decimal("100")) > Decimal("0.02"):
            raise ValidationError(f"Percentages must total 100%. Current total: {percentage_total.normalize()}%.")
        return _weighted_allocation(amount_minor, weights, participants)

    if method == "shares":
        return _weighted_allocation(amount_minor, weights, participants)

    raise ValidationError("Choose a supported split method.")


def calculate_balances(expenses: Iterable[Mapping], settlements: Iterable[Mapping]) -> dict[str, int]:
    balances: defaultdict[str, int] = defaultdict(int)
    for expense in expenses:
        amount_minor = int(expense["amount_minor"])
        balances[str(expense["paid_by_member_id"])] += amount_minor
        for split in expense["splits"]:
            balances[str(split["member_id"])] -= int(split["amount_minor"])

    for settlement in settlements:
        amount_minor = int(settlement["amount_minor"])
        balances[str(settlement["from_member_id"])] += amount_minor
        balances[str(settlement["to_member_id"])] -= amount_minor

    return dict(balances)


def simplify_balances(balances: Mapping[str, int]) -> list[dict[str, object]]:
    debtors = [[member_id, -amount] for member_id, amount in balances.items() if amount < 0]
    creditors = [[member_id, amount] for member_id, amount in balances.items() if amount > 0]
    debtors.sort(key=lambda item: (-item[1], item[0]))
    creditors.sort(key=lambda item: (-item[1], item[0]))

    transfers: list[dict[str, object]] = []
    debtor_index = 0
    creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor_id, owed = debtors[debtor_index]
        creditor_id, due = creditors[creditor_index]
        amount = min(owed, due)
        if amount:
            transfers.append({"from_member_id": debtor_id, "to_member_id": creditor_id, "amount_minor": amount})
        debtors[debtor_index][1] -= amount
        creditors[creditor_index][1] -= amount
        if debtors[debtor_index][1] == 0:
            debtor_index += 1
        if creditors[creditor_index][1] == 0:
            creditor_index += 1
    return transfers


def percentage_defaults(participant_ids: Iterable[str]) -> dict[str, Decimal]:
    participants = _unique_participants(participant_ids)
    base = (Decimal("100") / len(participants)).quantize(Decimal("0.01"), rounding=ROUND_FLOOR)
    defaults = {member_id: base for member_id in participants}
    defaults[participants[-1]] += Decimal("100") - sum(defaults.values(), Decimal("0"))
    return defaults
