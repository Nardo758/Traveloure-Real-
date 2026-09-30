/**
 * A REFUND WE DID NOT ISSUE STOPS THE EARNINGS MINT — board task #1288, ledger
 * `2026-09-24-out-of-band-refund-blocks-mint`.
 *
 *   O1  Pure: a refund is ours only when it carries `metadata.source`; the stamp reader is null-safe.
 *   O2  The webhook's `charge.refunded` arm stamps EVERY booking the PaymentIntent paid, ignores a
 *       refund we issued, raises ONE admin alert, and a redelivery keeps the first `detectedAt`.
 *   O3  The status writer refuses `completed` for a stamped booking (nothing minted, status kept),
 *       while an unstamped booking on another PaymentIntent completes and mints as before.
 *   O4  Earnings minted BEFORE the refund was seen are put on hold (`dispute_state='open'`), and the
 *       reconciliation caller's direct mint refuses a stamped completed booking.
 *   O5  An admin clear (decision-maker, Sep 24, 2026) moves the stamp into the history with the note,
 *       releases the hold, lets the booking complete, answers a second clear `not_found`, and a
 *       redelivery does NOT re-stamp the cleared refund — while a NEW refund on the payment does.
 *   O6  On a `disputed` booking the clear keeps the hold: it may be the traveler's own dispute's.
 *   O7  The admin route takes a `.strict()` note only.
 *
 * NO FEE LITERALS (§8): fixture amounts are asserted only for presence/absence of a mint.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after(). The
 * webhook is given a charge that already lists its refunds, so no Stripe call is made. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/out-of-band-refund.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { stripePaymentService } from "../services/stripe-payment.service";
import { clearOutOfBandRefund } from "../services/out-of-band-refund.service";
import fs from "node:fs";
import path from "node:path";
import {
  isPlatformIssuedRefund,
  outOfBandRefundOf,
  outOfBandRefunds,
} from "../../shared/out-of-band-refund";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `oob-${RUN}-prov`,
  traveler: `oob-${RUN}-trav`,
  service: `oob-${RUN}-svc`,
};
const PI_SHARED = `pi_oob_${RUN}_shared`;
const PI_CLEAN = `pi_oob_${RUN}_clean`;
const PI_LATE = `pi_oob_${RUN}_late`;
const PI_CLEAR = `pi_oob_${RUN}_clear`;
const PI_DISPUTED = `pi_oob_${RUN}_disputed`;
const bookingIds: string[] = [];

async function seedBooking(status: string, paymentIntentId: string): Promise<string> {
  const id = `oob-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings, stripe_payment_intent_id)
    VALUES (${id}, ${ids.service}, ${ids.traveler}, ${ids.provider}, ${status},
            '100.00', '25.00', '75.00', ${paymentIntentId})
  `);
  bookingIds.push(id);
  return id;
}

async function row(id: string): Promise<any> {
  return (await db.execute(sql`SELECT status, booking_details FROM service_bookings WHERE id = ${id}`)).rows[0];
}

async function minted(id: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM provider_earnings WHERE source_id = ${id})
         + (SELECT COUNT(*) FROM platform_revenue WHERE source_id = ${id}) AS n
  `);
  return Number((r.rows[0] as any).n);
}

async function alerts(paymentIntentId: string): Promise<any[]> {
  return (
    await db.execute(sql`
      SELECT metadata FROM admin_notifications
       WHERE type = 'out_of_band_refund' AND metadata->>'paymentIntentId' = ${paymentIntentId}
    `)
  ).rows as any[];
}

function chargeRefundedEvent(paymentIntentId: string, refunds: Array<{ id: string; amount: number; metadata?: Record<string, string> }>) {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${paymentIntentId}`,
        payment_intent: paymentIntentId,
        amount_refunded: refunds.reduce((s, r) => s + r.amount, 0),
        currency: "usd",
        refunds: { data: refunds.map((r) => ({ ...r, metadata: r.metadata ?? {} })), has_more: false },
      },
    },
  } as any;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`${ids.provider}@t.test`}, 'OOB', 'Provider', 'service_provider'),
           (${ids.traveler}, ${`${ids.traveler}@t.test`}, 'OOB', 'Traveler', 'user')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${ids.service}, ${ids.provider}, ${`OOB service ${RUN}`}, 'fixture', '100.00', 'active', 'approved')
  `);
});

after(async () => {
  for (const id of bookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE data->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const pi of [PI_SHARED, PI_CLEAN, PI_LATE, PI_CLEAR, PI_DISPUTED]) {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'paymentIntentId' = ${pi}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

test("O1: only a refund carrying our source tag is ours; the stamp reader is null-safe", () => {
  assert.equal(isPlatformIssuedRefund({ id: "re_a", amount: 100, metadata: { source: "service_booking" } }), true);
  assert.equal(isPlatformIssuedRefund({ id: "re_b", amount: 100, metadata: {} }), false);
  assert.equal(isPlatformIssuedRefund({ id: "re_c", amount: 100, metadata: { source: "  " } }), false);
  assert.equal(isPlatformIssuedRefund({ id: "re_d", amount: 100, metadata: null }), false);
  assert.deepEqual(
    outOfBandRefunds([
      { id: "re_ours", amount: 1, metadata: { source: "bundle_partial_settlement" } },
      { id: "re_dash", amount: 2, metadata: {} },
    ]).map((r) => r.id),
    ["re_dash"],
  );
  assert.equal(outOfBandRefundOf(null), null);
  assert.equal(outOfBandRefundOf({ other: 1 }), null);
  assert.equal(outOfBandRefundOf({ outOfBandRefund: "junk" }), null);
  assert.deepEqual(outOfBandRefundOf({ outOfBandRefund: { refundIds: ["re_x"] } }), { refundIds: ["re_x"] });
});

test("O2: the webhook stamps every booking on the PaymentIntent, alerts once, and keeps the first sighting", async () => {
  const a = await seedBooking("confirmed", PI_SHARED);
  const b = await seedBooking("confirmed", PI_SHARED);
  const event = chargeRefundedEvent(PI_SHARED, [
    { id: `re_${RUN}_ours`, amount: 1000, metadata: { source: "service_booking", bookingId: a } },
    { id: `re_${RUN}_dash`, amount: 2500 },
  ]);

  await stripePaymentService.handleWebhook(event);
  for (const id of [a, b]) {
    const marker = outOfBandRefundOf((await row(id)).booking_details);
    assert.ok(marker, `booking ${id} is stamped`);
    assert.deepEqual(marker!.refundIds, [`re_${RUN}_dash`], "only the refund we did not issue is named");
    assert.equal(marker!.amountCents, 2500, "Stripe's own figure, never one of ours");
    assert.equal(marker!.paymentIntentId, PI_SHARED);
    assert.equal((await row(id)).status, "confirmed", "no status is changed");
  }
  const firstDetectedAt = outOfBandRefundOf((await row(a)).booking_details)!.detectedAt;
  assert.equal((await alerts(PI_SHARED)).length, 1, "one alert");
  assert.deepEqual([...(await alerts(PI_SHARED))[0].metadata.bookingIds].sort(), [a, b].sort());

  await new Promise((r) => setTimeout(r, 5));
  await stripePaymentService.handleWebhook(event); // REDELIVERY
  const again = outOfBandRefundOf((await row(a)).booking_details)!;
  assert.equal(again.detectedAt, firstDetectedAt, "the first sighting is kept");
  assert.notEqual(again.lastSeenAt, firstDetectedAt, "the redelivery is recorded as a later sighting");
  assert.equal((await alerts(PI_SHARED)).length, 1, "a redelivery raises no second alert");

  // A charge whose only refund is ours stamps nothing.
  const clean = await seedBooking("confirmed", PI_CLEAN);
  await stripePaymentService.handleWebhook(
    chargeRefundedEvent(PI_CLEAN, [{ id: `re_${RUN}_clean`, amount: 500, metadata: { source: "service_booking", bookingId: clean } }]),
  );
  assert.equal(outOfBandRefundOf((await row(clean)).booking_details), null);
  assert.equal((await alerts(PI_CLEAN)).length, 0);
});

test("O3: a stamped booking cannot complete and mints nothing; an unstamped one completes as before", async () => {
  const stamped = bookingIds[0]; // from O2
  const refused = await storage.updateServiceBookingStatus(stamped, "completed", undefined, ["confirmed"]);
  assert.equal(refused, undefined, "the writer refuses the flip");
  assert.equal((await row(stamped)).status, "confirmed");
  assert.equal(await minted(stamped), 0, "nothing minted");

  const control = bookingIds[2]; // PI_CLEAN, unstamped
  const done = await storage.updateServiceBookingStatus(control, "completed", undefined, ["confirmed"]);
  assert.equal(done?.status, "completed");
  assert.ok((await minted(control)) > 0, "the ordinary completion still mints");
});

test("O4: earnings minted before the refund was seen are held, and the reconciliation mint refuses", async () => {
  const late = await seedBooking("confirmed", PI_LATE);
  const done = await storage.updateServiceBookingStatus(late, "completed", undefined, ["confirmed"]);
  assert.equal(done?.status, "completed");
  const before = await minted(late);
  assert.ok(before > 0);

  await stripePaymentService.handleWebhook(chargeRefundedEvent(PI_LATE, [{ id: `re_${RUN}_late`, amount: 10000 }]));
  const held = await db.execute(sql`
    SELECT status, dispute_state FROM provider_earnings WHERE source_id = ${late}
  `);
  assert.ok(held.rows.length > 0);
  for (const e of held.rows as any[]) {
    assert.equal(e.status, "held");
    assert.equal(e.dispute_state, "open", "the release job and payout summary skip it");
  }
  assert.equal((await alerts(PI_LATE))[0].metadata.heldEarnings >= 1, true);

  // The reconciliation caller mints for an ALREADY completed row; the stamp stops it too.
  await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${late}`);
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${late}`);
  const current = await storage.getServiceBooking(late);
  assert.equal(await storage.mintCompletionEarningsForBooking(current!), false);
  assert.equal(await minted(late), 0);
});

async function earningStates(id: string): Promise<string[]> {
  const r = await db.execute(sql`SELECT dispute_state FROM provider_earnings WHERE source_id = ${id}`);
  return (r.rows as any[]).map((e) => e.dispute_state);
}

test("O5: an admin clear releases the hold and survives a redelivery; a new refund still stamps", async () => {
  // Minted first, then refunded in the dashboard: the earning is held.
  const minted1 = await seedBooking("confirmed", PI_CLEAR);
  await storage.updateServiceBookingStatus(minted1, "completed", undefined, ["confirmed"]);
  // A second booking on the same payment, still confirmed.
  const pending1 = await seedBooking("confirmed", PI_CLEAR);
  const event = chargeRefundedEvent(PI_CLEAR, [{ id: `re_${RUN}_goodwill`, amount: 500 }]);
  await stripePaymentService.handleWebhook(event);
  assert.deepEqual(await earningStates(minted1), ["open"]);

  const note = "Goodwill discount for a late start; seller delivered in full.";
  const out = await clearOutOfBandRefund({ bookingId: minted1, actorId: "admin-oob-test", note });
  assert.equal(out.cleared, true);
  if (!out.cleared) return;
  assert.deepEqual(out.refundIds, [`re_${RUN}_goodwill`]);
  assert.equal(out.holdKeptForDispute, false);
  assert.ok(out.releasedEarnings >= 1);
  assert.deepEqual(await earningStates(minted1), ["none"], "the hold is released");

  const details = (await row(minted1)).booking_details;
  assert.equal(outOfBandRefundOf(details), null, "the stamp is gone");
  const history = details.outOfBandRefundCleared;
  assert.equal(history.length, 1);
  assert.equal(history[0].note, note);
  assert.equal(history[0].clearedBy, "admin-oob-test");
  assert.deepEqual(history[0].refundIds, [`re_${RUN}_goodwill`], "the record of what was cleared is kept");

  assert.deepEqual(await clearOutOfBandRefund({ bookingId: minted1, actorId: "admin-oob-test", note }), {
    cleared: false,
    reason: "not_found",
  });

  // Clearing the confirmed one lets it complete and mint as normal.
  await clearOutOfBandRefund({ bookingId: pending1, actorId: "admin-oob-test", note });
  const done = await storage.updateServiceBookingStatus(pending1, "completed", undefined, ["confirmed"]);
  assert.equal(done?.status, "completed");
  assert.ok((await minted(pending1)) > 0);

  // A redelivery names the same refund: nothing is re-stamped, no second alert.
  const alertsBefore = (await alerts(PI_CLEAR)).length;
  await stripePaymentService.handleWebhook(event);
  assert.equal(outOfBandRefundOf((await row(minted1)).booking_details), null);
  assert.equal(outOfBandRefundOf((await row(pending1)).booking_details), null);
  assert.equal((await alerts(PI_CLEAR)).length, alertsBefore);

  // A NEW refund on the same payment is a new fact: it stamps, naming only the new refund.
  await stripePaymentService.handleWebhook(
    chargeRefundedEvent(PI_CLEAR, [
      { id: `re_${RUN}_goodwill`, amount: 500 },
      { id: `re_${RUN}_second`, amount: 700 },
    ]),
  );
  const again = outOfBandRefundOf((await row(minted1)).booking_details)!;
  assert.deepEqual(again.refundIds, [`re_${RUN}_second`]);
  assert.equal(again.amountCents, 700);
  assert.deepEqual(await earningStates(minted1), ["open"], "held again");
});

test("O6: on a disputed booking the clear keeps the hold", async () => {
  const id = await seedBooking("confirmed", PI_DISPUTED);
  await storage.updateServiceBookingStatus(id, "completed", undefined, ["confirmed"]);
  await stripePaymentService.handleWebhook(chargeRefundedEvent(PI_DISPUTED, [{ id: `re_${RUN}_disp`, amount: 900 }]));
  await db.execute(sql`UPDATE service_bookings SET status = 'disputed' WHERE id = ${id}`);
  const out = await clearOutOfBandRefund({ bookingId: id, actorId: "admin-oob-test", note: "Handled with the dispute." });
  assert.equal(out.cleared, true);
  if (!out.cleared) return;
  assert.equal(out.holdKeptForDispute, true);
  assert.equal(out.releasedEarnings, 0);
  assert.deepEqual(await earningStates(id), ["open"], "the dispute decides the hold");
});

test("O7: the admin clear route takes a strict, required note and nothing else", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/admin.routes.ts"), "utf8");
  assert.match(src, /const outOfBandRefundClearBody = z\.object\(\{ note: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(2000\) \}\)\.strict\(\);/);
  assert.match(src, /router\.post\("\/api\/admin\/bookings\/:bookingId\/out-of-band-refund\/clear"/);
  assert.match(src, /action: "out_of_band_refund_cleared"/);
});
