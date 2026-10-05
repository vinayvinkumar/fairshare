import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivity,
  equalAllocation,
  formatMoney,
  percentageDefaults,
  splitPreview,
  toMinorUnits,
} from "./domain.js";

test("money formatting and conversion respect currency precision", () => {
  assert.equal(toMinorUnits("123.456", "INR"), 12346);
  assert.equal(toMinorUnits("123.6", "JPY"), 124);
  assert.match(formatMoney(123456, "INR"), /1,234\.56/);
});

test("equal allocation preserves every minor unit", () => {
  assert.deepEqual(equalAllocation(10000, ["a", "b", "c"]), { a: 3334, b: 3333, c: 3333 });
});

test("percentage defaults total exactly one hundred", () => {
  const values = percentageDefaults(["a", "b", "c"]);
  assert.equal(Object.values(values).reduce((sum, value) => sum + value, 0), 100);
});

test("weighted preview stays equal to the expense total", () => {
  const preview = splitPreview("120", "INR", ["a", "b", "c"], "shares", { a: 1, b: 2, c: 3 });
  assert.deepEqual(preview, { a: 2000, b: 4000, c: 6000 });
});

test("activity combines expenses and settlements newest first", () => {
  const activity = buildActivity(
    [{ id: "e", expense_date: "2026-10-04", created_at: "a", description: "Dinner", paid_by_name: "A", category: "Food", amount_minor: 1, currency: "INR" }],
    [{ id: "s", settled_date: "2026-10-05", created_at: "b", from_name: "B", to_name: "A", amount_minor: 1, currency: "INR" }],
  );
  assert.deepEqual(activity.map((item) => item.id), ["s", "e"]);
});
