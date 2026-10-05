from __future__ import annotations

import csv
from datetime import date
from io import StringIO
import logging
import os
from pathlib import Path
import secrets
import time
from typing import Any, Mapping

import streamlit as st

from fairshare.component import get_fairshare_ui
from fairshare.domain import ValidationError, allocate_split, calculate_balances, from_minor_units, simplify_balances, to_minor_units
from fairshare.storage import LedgerStore


APP_ROOT = Path(__file__).resolve().parent
CATEGORIES = [
    "Food & drink",
    "Travel",
    "Stay",
    "Transport",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Health",
    "Other",
]
CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"]
PAGES = {"overview", "expenses", "add-expense", "settle", "people", "settings"}
LOGGER = logging.getLogger(__name__)


st.set_page_config(page_title="FairShare", page_icon="🤝", layout="wide", initial_sidebar_state="collapsed")
st.html(
    """
    <style>
      [data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stSidebar"] { display: none !important; }
      [data-testid="stAppViewContainer"], [data-testid="stMain"] { background: #f4f4f8; }
      [data-testid="stMainBlockContainer"] { max-width: none; padding: 0 !important; }
      [data-testid="stVerticalBlock"], [data-testid="stElementContainer"] { gap: 0 !important; }
      .stApp { min-height: 100vh; }
    </style>
    """
)


def setting(name: str, default: str = "") -> str:
    try:
        value = st.secrets[name]
    except (KeyError, FileNotFoundError):
        value = os.getenv(name, default)
    return str(value).strip() if value is not None else default


try:
    fairshare_ui = get_fairshare_ui()
except FileNotFoundError:
    st.error("FairShare's React bundle is missing. Run `npm run build:ui` inside `apps/fairshare`.")
    st.stop()


@st.cache_resource(show_spinner=False)
def create_store(database_url: str, sqlite_path: str, owner_name: str, default_currency: str) -> LedgerStore:
    store = LedgerStore(database_url or None, sqlite_path)
    store.initialize(owner_name=owner_name, default_currency=default_currency)
    return store


def set_flash(kind: str, message: str) -> None:
    st.session_state["fairshare_flash"] = {"kind": kind, "message": message, "id": time.time_ns()}


def take_flash() -> dict[str, Any] | None:
    return st.session_state.pop("fairshare_flash", None)


def export_csv(expenses: list[dict], settlements: list[dict]) -> str:
    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["type", "date", "description", "amount", "currency", "paid_by", "category", "split", "notes"],
    )
    writer.writeheader()
    for expense in expenses:
        writer.writerow(
            {
                "type": "expense",
                "date": expense["expense_date"],
                "description": expense["description"],
                "amount": from_minor_units(expense["amount_minor"], expense["currency"]),
                "currency": expense["currency"],
                "paid_by": expense["paid_by_name"],
                "category": expense["category"],
                "split": "; ".join(
                    f"{split['member_name']}: {from_minor_units(split['amount_minor'], expense['currency'])}"
                    for split in expense["splits"]
                ),
                "notes": expense.get("notes") or "",
            }
        )
    for settlement in settlements:
        writer.writerow(
            {
                "type": "settlement",
                "date": settlement["settled_date"],
                "description": f"{settlement['from_name']} paid {settlement['to_name']}",
                "amount": from_minor_units(settlement["amount_minor"], settlement["currency"]),
                "currency": settlement["currency"],
                "paid_by": settlement["from_name"],
                "category": "Settlement",
                "split": settlement["to_name"],
                "notes": settlement.get("notes") or "",
            }
        )
    return output.getvalue()


def sort_members(members: list[dict], owner_id: str) -> list[dict]:
    return sorted(members, key=lambda member: (member["id"] != owner_id, member["name"].lower()))


def selected_group(store: LedgerStore) -> tuple[list[dict], dict]:
    groups = store.list_groups()
    if not groups:
        raise RuntimeError("No active FairShare groups are available.")
    valid_group_ids = {group["id"] for group in groups}
    group_id = st.session_state.get("fairshare_group_id")
    if group_id not in valid_group_ids:
        group_id = groups[0]["id"]
        st.session_state["fairshare_group_id"] = group_id
    group = store.get_group(group_id)
    if not group:
        raise RuntimeError("The selected FairShare group is unavailable.")
    return groups, group


def build_ready_payload(store: LedgerStore, password_enabled: bool) -> dict[str, Any]:
    groups, group = selected_group(store)
    owner_id = store.owner_member_id()
    members = sort_members(store.group_members(group["id"]), owner_id)
    all_members = sort_members(store.list_members(), owner_id)
    ledger = store.group_ledger(group["id"])
    expenses = ledger["expenses"]
    settlements = ledger["settlements"]
    balance_map = calculate_balances(expenses, settlements)
    balances = [
        {"member_id": member["id"], "name": member["name"], "amount_minor": balance_map.get(member["id"], 0)}
        for member in members
    ]
    category_totals: dict[str, int] = {}
    for expense in expenses:
        category_totals[expense["category"]] = category_totals.get(expense["category"], 0) + expense["amount_minor"]

    page = st.session_state.get("fairshare_page", "overview")
    if page not in PAGES:
        page = "overview"
    total_spend = sum(expense["amount_minor"] for expense in expenses)

    return {
        "mode": "ready",
        "page": page,
        "data_revision": st.session_state.get("fairshare_data_revision", 0),
        "today": date.today().isoformat(),
        "owner_id": owner_id,
        "owner_name": next((member["name"] for member in all_members if member["id"] == owner_id), "You"),
        "group": group,
        "groups": groups,
        "members": members,
        "all_members": all_members,
        "expenses": expenses,
        "settlements": settlements,
        "balances": balances,
        "debts": simplify_balances(balance_map),
        "deleted_activity": store.deleted_activity(group["id"]),
        "category_totals": [
            {"category": category, "amount_minor": amount}
            for category, amount in sorted(category_totals.items(), key=lambda item: item[1], reverse=True)
        ],
        "totals": {
            "total_spend": total_spend,
            "unsettled": sum(amount for amount in balance_map.values() if amount > 0),
        },
        "categories": CATEGORIES,
        "currencies": CURRENCIES,
        "storage": {"backend": store.backend, "label": store.storage_label},
        "security": {"password_enabled": password_enabled},
        "exports": {"json": store.export_payload(group["id"]), "csv": export_csv(expenses, settlements)},
        "flash": take_flash(),
    }


def require_string(action: Mapping[str, Any], name: str) -> str:
    value = str(action.get(name, "")).strip()
    if not value:
        raise ValidationError(f"{name.replace('_', ' ').capitalize()} is required.")
    return value


def mark_data_changed() -> None:
    st.session_state["fairshare_data_revision"] = st.session_state.get("fairshare_data_revision", 0) + 1


def handle_action(action: Mapping[str, Any], store: LedgerStore | None, expected_password: str) -> None:
    action_id = str(action.get("client_action_id", ""))
    if action_id and st.session_state.get("fairshare_last_action_id") == action_id:
        return
    if action_id:
        st.session_state["fairshare_last_action_id"] = action_id

    view = str(action.get("view", ""))
    if view in PAGES:
        st.session_state["fairshare_page"] = view

    action_type = str(action.get("type", ""))
    if action_type == "unlock":
        supplied_password = str(action.get("password", ""))
        if expected_password and secrets.compare_digest(supplied_password, expected_password):
            st.session_state["fairshare_authenticated"] = True
            set_flash("success", "Welcome back. Your ledger is ready.")
        else:
            set_flash("error", "That passcode is not correct.")
        return

    if expected_password and not st.session_state.get("fairshare_authenticated"):
        set_flash("error", "Unlock FairShare before making changes.")
        return
    if store is None:
        raise RuntimeError("FairShare storage is unavailable.")

    if action_type == "lock":
        st.session_state["fairshare_authenticated"] = False
        return
    if action_type == "select_group":
        group_id = require_string(action, "group_id")
        if not store.get_group(group_id):
            raise ValidationError("That group is no longer available.")
        st.session_state["fairshare_group_id"] = group_id
        st.session_state["fairshare_page"] = "overview"
        return
    if action_type == "add_member":
        member_id = store.add_member(require_string(action, "name"), str(action.get("email", "")))
        store.add_members_to_group(require_string(action, "group_id"), [member_id])
        mark_data_changed()
        set_flash("success", "Person added to the group.")
        return
    if action_type == "add_members_to_group":
        store.add_members_to_group(
            require_string(action, "group_id"),
            [str(member_id) for member_id in action.get("member_ids", [])],
        )
        mark_data_changed()
        set_flash("success", "Group members updated.")
        return
    if action_type == "add_group":
        new_group_id = store.add_group(
            require_string(action, "name"),
            str(action.get("emoji", "✨")),
            require_string(action, "currency"),
            [str(member_id) for member_id in action.get("member_ids", [])],
        )
        st.session_state["fairshare_group_id"] = new_group_id
        st.session_state["fairshare_page"] = "overview"
        mark_data_changed()
        set_flash("success", "New group created.")
        return
    if action_type == "add_expense":
        currency = require_string(action, "currency")
        amount_minor = to_minor_units(action.get("amount"), currency)
        participant_ids = [str(member_id) for member_id in action.get("participant_ids", [])]
        split_method = require_string(action, "split_method")
        split_values = action.get("split_values")
        if not isinstance(split_values, Mapping):
            split_values = None
        splits = allocate_split(amount_minor, participant_ids, split_method, split_values, currency)
        store.add_expense(
            group_id=require_string(action, "group_id"),
            description=require_string(action, "description"),
            amount_minor=amount_minor,
            currency=currency,
            paid_by_member_id=require_string(action, "paid_by_member_id"),
            expense_date=require_string(action, "expense_date"),
            category=require_string(action, "category"),
            notes=str(action.get("notes", "")),
            split_method=split_method,
            splits=splits,
        )
        st.session_state["fairshare_page"] = "overview"
        mark_data_changed()
        set_flash("success", "Expense added. Every balance is up to date.")
        return
    if action_type == "add_settlement":
        currency = require_string(action, "currency")
        store.add_settlement(
            group_id=require_string(action, "group_id"),
            from_member_id=require_string(action, "from_member_id"),
            to_member_id=require_string(action, "to_member_id"),
            amount_minor=to_minor_units(action.get("amount"), currency),
            currency=currency,
            settled_date=require_string(action, "settled_date"),
            notes=str(action.get("notes", "")),
        )
        mark_data_changed()
        set_flash("success", "Payment recorded. The settlement plan is refreshed.")
        return
    if action_type == "delete":
        store.soft_delete(require_string(action, "record_type"), require_string(action, "record_id"))
        mark_data_changed()
        set_flash("success", "Moved to Trash. You can restore it anytime.")
        return
    if action_type == "restore":
        store.restore(require_string(action, "record_type"), require_string(action, "record_id"))
        mark_data_changed()
        set_flash("success", "Entry restored to the ledger.")
        return
    raise ValidationError("FairShare received an unsupported action.")


expected_password = setting("APP_PASSWORD")
authenticated = not expected_password or bool(st.session_state.get("fairshare_authenticated"))
store: LedgerStore | None = None
render_id = time.time_ns()

if authenticated:
    try:
        store = create_store(
            setting("DATABASE_URL"),
            setting("SQLITE_PATH", str(APP_ROOT / "data" / "fairshare.db")),
            setting("OWNER_NAME", "You"),
            setting("DEFAULT_CURRENCY", "INR").upper(),
        )
        payload = build_ready_payload(store, bool(expected_password))
    except Exception as error:
        LOGGER.exception("FairShare could not open its ledger")
        payload = {
            "mode": "error",
            "message": "Check the database connection and Streamlit secrets, then restart the app.",
        }
else:
    payload = {"mode": "locked", "flash": take_flash()}
payload["render_id"] = render_id

result = fairshare_ui(
    key="fairshare-react-root",
    data=payload,
    width="stretch",
    height="content",
    on_action_change=lambda: None,
)

if result.action:
    try:
        handle_action(dict(result.action), store, expected_password)
    except (ValidationError, ValueError, RuntimeError) as error:
        set_flash("error", str(error))
    st.rerun()
