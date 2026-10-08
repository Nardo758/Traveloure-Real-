import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { scanSource, inventory } = await import(pathToFileURL(resolve("scripts/verification/automation-payment-inventory.mjs")).href);
test("payment inventory resolves imported table aliases without executing writers", () => {
  const rows = scanSource("fixture.ts", 'import { serviceBookings as sb } from "./schema"; export async function pay(tx) { await tx.update(sb).set({status:"confirmed"}); }');
  assert.equal(rows.length, 1); assert.equal(rows[0].model, "serviceBookings"); assert.equal(rows[0].writer, "pay");
  assert.equal(rows[0].retainedConfirmationEmailCoverage, "NOT COVERED");
});
test("raw SQL and provider writes remain visible; configuration is not payment state", () => {
  const rows = scanSource("fixture.ts", 'async function refund(){ await db.execute(sql`UPDATE bookings SET status = ${next}`); await stripe.refunds.create({amount:100}); await db.update(bookingFeeConfigs).set({rate:1}); }');
  assert.equal(rows.length, 2); assert.ok(rows.some((r: any) => r.kind === "provider create"));
});
test("current inventory does not mistake the provider alert suite for confirmation-writer coverage", () => {
  const result = inventory();
  assert.ok(result.rows.length > 50); assert.match(result.completeness, /^OPEN/);
  assert.ok(result.rows.some((r: any) => r.writer === "handlePaymentSucceeded"));
  assert.ok(result.rows.some((r: any) => r.retainedLedgerCoverage.startsWith("COVERED")));
  assert.ok(result.rows.every((r: any) => r.retainedConfirmationEmailCoverage === "NOT COVERED"));
});
