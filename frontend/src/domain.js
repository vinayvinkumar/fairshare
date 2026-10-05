export const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);

export function currencyScale(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
}

export function toMinorUnits(value, currency = "INR") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * currencyScale(currency));
}

export function formatMoney(value, currency = "INR", signed = false) {
  const amount = Number(value || 0) / currencyScale(currency);
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2,
    maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2,
  });
  const formatted = formatter.format(Math.abs(amount));
  if (amount < 0) return `−${formatted}`;
  if (signed && amount > 0) return `+${formatted}`;
  return formatted;
}

export function formatDate(value, withYear = true) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export function equalAllocation(amountMinor, participantIds) {
  if (!participantIds.length) return {};
  const quotient = Math.floor(amountMinor / participantIds.length);
  const remainder = amountMinor - quotient * participantIds.length;
  return Object.fromEntries(
    participantIds.map((memberId, index) => [memberId, quotient + (index < remainder ? 1 : 0)]),
  );
}

export function percentageDefaults(participantIds) {
  if (!participantIds.length) return {};
  const base = Math.floor((10000 / participantIds.length)) / 100;
  const values = Object.fromEntries(participantIds.map((memberId) => [memberId, base]));
  values[participantIds.at(-1)] = Number((100 - base * (participantIds.length - 1)).toFixed(2));
  return values;
}

export function splitPreview(amount, currency, participantIds, method, values = {}) {
  const amountMinor = toMinorUnits(amount, currency);
  if (!amountMinor || !participantIds.length) return {};
  if (method === "equal") return equalAllocation(amountMinor, participantIds);

  const numericValues = Object.fromEntries(
    participantIds.map((memberId) => [memberId, Math.max(0, Number(values[memberId]) || 0)]),
  );
  if (method === "exact") {
    return Object.fromEntries(
      participantIds.map((memberId) => [memberId, Math.round(numericValues[memberId] * currencyScale(currency))]),
    );
  }
  const total = Object.values(numericValues).reduce((sum, value) => sum + value, 0);
  if (!total) return {};
  const raw = Object.fromEntries(
    participantIds.map((memberId) => [memberId, (amountMinor * numericValues[memberId]) / total]),
  );
  const allocated = Object.fromEntries(
    participantIds.map((memberId) => [memberId, Math.floor(raw[memberId])]),
  );
  let remainder = amountMinor - Object.values(allocated).reduce((sum, value) => sum + value, 0);
  const ranked = [...participantIds].sort(
    (first, second) => (raw[second] - allocated[second]) - (raw[first] - allocated[first]),
  );
  ranked.slice(0, remainder).forEach((memberId) => { allocated[memberId] += 1; });
  return allocated;
}

export function buildActivity(expenses = [], settlements = []) {
  const rows = expenses.map((expense) => ({
    id: expense.id,
    type: "expense",
    date: expense.expense_date,
    created_at: expense.created_at,
    title: expense.description,
    detail: `${expense.paid_by_name} paid · ${expense.category}`,
    amount_minor: expense.amount_minor,
    currency: expense.currency,
    record: expense,
  }));
  rows.push(...settlements.map((settlement) => ({
    id: settlement.id,
    type: "settlement",
    date: settlement.settled_date,
    created_at: settlement.created_at,
    title: `${settlement.from_name} paid ${settlement.to_name}`,
    detail: "Settlement recorded",
    amount_minor: settlement.amount_minor,
    currency: settlement.currency,
    record: settlement,
  })));
  return rows.sort((first, second) =>
    `${second.date}${second.created_at}`.localeCompare(`${first.date}${first.created_at}`),
  );
}

export function downloadText(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
