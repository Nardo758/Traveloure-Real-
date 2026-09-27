/**
 * Admin exception refund form rules (ledger `2026-09-27-admin-exception-refund`).
 * Run: npx tsx --test client/src/lib/__tests__/exception-refund.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExceptionRefundForm, dollarsToCents, serverMessageOf } from "../exception-refund";

test("E1 dollars parse to exact cents; anything else is refused", () => {
  assert.equal(dollarsToCents("12.34"), 1234);
  assert.equal(dollarsToCents("$1,012.3"), 101230);
  assert.equal(dollarsToCents("7"), 700);
  for (const bad of ["", "abc", "1.234", "-5", "1e3"]) assert.equal(dollarsToCents(bad), null, bad);
});

test("E2 a reason is required", () => {
  const r = checkExceptionRefundForm({ mode: "full", amount: "", reason: "short", chargedCents: 11500 });
  assert.equal(r.ok, false);
});

test("E3 partial: must be positive and at most the charge; the whole charge is a full refund", () => {
  const base = { mode: "partial" as const, reason: "goodwill after a late pickup", chargedCents: 11500 };
  assert.equal(checkExceptionRefundForm({ ...base, amount: "0" }).ok, false);
  assert.equal(checkExceptionRefundForm({ ...base, amount: "115.01" }).ok, false);
  assert.deepEqual(checkExceptionRefundForm({ ...base, amount: "40" }), {
    ok: true,
    request: { mode: "partial", amountCents: 4000, reason: "goodwill after a late pickup" },
  });
  assert.deepEqual(checkExceptionRefundForm({ ...base, amount: "115.00" }), {
    ok: true,
    request: { mode: "full", reason: "goodwill after a late pickup" },
  });
});

test("E4 the server's refusal message is shown, not the raw status text", () => {
  assert.equal(serverMessageOf(new Error('409: {"refused":"disputed","message":"This booking is under dispute."}')), "This booking is under dispute.");
  assert.equal(serverMessageOf(new Error("500: plain text")), "plain text");
});
