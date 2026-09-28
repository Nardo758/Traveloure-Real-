/**
 * PAYMENT ON RECORD — writers, one predicate, and the displays (ledger
 * `2026-09-28-no-payment-no-earnings`). Pure: reads source files and calls pure helpers, no DB.
 *
 *   W1  the `paidCharge` key is spelled in exactly two non-test files: the shared module that
 *       defines it and the client-birth denylist that strips it (the decision-lint pattern).
 *   W2  the stamp is WRITTEN only by the paid flips: `stampPaidCharge` / `paidChargeMergeSql` are
 *       called only from checkout-claim.service.ts and stripe.service.ts.
 *   W3  the funnel revenue row derives from the stamp, never the reverse.
 *   W4  one predicate: every refusal site reads `hasPaymentOnRecord` / `paymentOnRecordSql`.
 *   D1  (part 2) an earner payload carries the server's own answer and never the stamp itself.
 *   D2  (parts 2 and 4) the displays and My Bookings read the ONE helper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasPaymentOnRecord, isEarningBookingRow, paidChargeOf } from "../../shared/payment-on-record";
import { sanitizeBookingForExpert } from "../utils/data-sanitizer";
import { paidRevenueEventValues } from "../services/funnel-revenue.service";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const SOURCES = [...walk("server"), ...walk("shared"), ...walk("client/src")];

test("W1: the paidCharge key is spelled only where it is defined and where it is stripped", () => {
  const hits = SOURCES.filter((f) => /["'`]paidCharge["'`]/.test(read(f))).sort();
  assert.deepEqual(hits, ["shared/booking-details-admission.ts", "shared/payment-on-record.ts"]);
});

test("W2: only the paid flips call the stamp writers", () => {
  const callers = SOURCES.filter((f) => /\b(stampPaidCharge|paidChargeMergeSql)\(/.test(read(f))).sort();
  assert.deepEqual(callers, [
    "server/services/checkout-claim.service.ts",
    "server/services/payment-on-record.ts",
    "server/services/stripe.service.ts",
  ]);
  // In checkout-claim, each stamp is taken inside a promotion (never elsewhere).
  const claim = read("server/services/checkout-claim.service.ts");
  assert.equal((claim.match(/await stampPaidCharge\(/g) ?? []).length, 2, "promoteOneBooking + promoteBalancePayment");
});

test("W3: the revenue event derives from the stamp", () => {
  const claim = read("server/services/checkout-claim.service.ts");
  const calls = claim.match(/recordPaidRevenueEvent\(tx, (\w+),/g) ?? [];
  assert.equal(calls.length, 2);
  for (const c of calls) {
    const v = c.match(/recordPaidRevenueEvent\(tx, (\w+),/)![1];
    assert.match(claim, new RegExp(`const ${v} = await stampPaidCharge\\(`), `${v} must be the stamp just written`);
  }
  // The event's amount is the STAMP's, whatever the row says.
  const ev = paidRevenueEventValues(
    { status: "confirmed", amount: 12.5, at: "2026-01-01T00:00:00.000Z" },
    { id: "b1", travelerId: "t", tripId: null, totalAmount: "999", platformFee: "1", depositAmount: null, balanceAmount: null, bookingDetails: null },
  );
  assert.deepEqual(ev.properties, { bookingId: "b1", paidStatus: "confirmed", amount: 12.5 });
});

test("W4: every refusal site reads the ONE predicate", () => {
  const sites: Record<string, RegExp> = {
    "server/storage.ts": /paymentOnRecordSql\(serviceBookings\.bookingDetails\)[\s\S]*hasPaymentOnRecord\(booking\)/,
    "server/jobs/bookingAutoCompletion.ts": /hasPaymentOnRecord\(booking\)[\s\S]*hasPaymentOnRecord\(declaring\)/,
    "server/routes/bookings.ts": /hasPaymentOnRecord\(bk\)/,
    "server/routes/admin.routes.ts": /hasPaymentOnRecord\(existing\)/,
    "server/services/artifact-acceptance-timer.service.ts": /hasPaymentOnRecord\(booking\)/,
    "server/services/earner-no-response.service.ts": /paymentOnRecordSql\(sql`sb\.booking_details`\)/,
    "server/routes/short-links.routes.ts": /paymentOnRecordSql\(serviceBookings\.bookingDetails\)/,
  };
  for (const [file, re] of Object.entries(sites)) assert.match(read(file), re, file);
});

test("D1: an earner payload carries the answer, never the stamp", () => {
  const stamp = { status: "confirmed", amount: 100, at: "2026-01-01T00:00:00.000Z" };
  const paid = sanitizeBookingForExpert({ id: "p", status: "confirmed", bookingDetails: { notes: "hi", paidCharge: stamp } }, "expert");
  assert.equal((paid as any).paymentOnRecord, true);
  assert.equal((paid as any).bookingDetails.paidCharge, undefined, "the stamp itself is not earner-visible");
  assert.equal(isEarningBookingRow(paid as any), true);

  const unpaid = sanitizeBookingForExpert({ id: "u", status: "confirmed", bookingDetails: { notes: "hi" } }, "expert");
  assert.equal((unpaid as any).paymentOnRecord, false);
  assert.equal(isEarningBookingRow(unpaid as any), false, "a confirmed row with no payment is not money");

  assert.equal(hasPaymentOnRecord({ bookingDetails: { paidCharge: { status: "pending" } } }), false, "only a paid status counts");
  assert.equal(paidChargeOf({ paidCharge: { status: "deposit_paid", amount: "x" } })?.amount, null, "an unreadable amount is null, never 0");
});

test("D2: the displays and My Bookings read the ONE helper", () => {
  const earnings = read("client/src/pages/provider/earnings.tsx");
  assert.doesNotMatch(earnings, /isEarningBooking\(b\.status\)/);
  assert.equal((earnings.match(/isEarningBookingRow\(b\)/g) ?? []).length, 4);
  assert.match(read("client/src/pages/expert/inbox.tsx"), /isEarningBookingRow\(booking\)/);
  const mine = read("client/src/pages/my-bookings.tsx");
  assert.match(mine, /const paymentOnRecord = hasPaymentOnRecord\(booking\)/);
  assert.match(mine, /canConfirmOrDispute = paymentOnRecord &&/);
  assert.match(mine, /canCancel = paymentOnRecord &&/);
});
