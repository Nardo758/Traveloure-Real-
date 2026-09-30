/**
 * THE ALL-UNDELIVERED PARENT — decision-maker ruling 2026-09-17 (ledger
 * `2026-09-17-all-undelivered-parent`), against a real Postgres and a stubbed `Stripe.refunds.create`
 * (no network). NO schema change, no migration, no new status value: `cancelled` already exists.
 *
 * Until this ruling a bundle whose EVERY component ended undelivered stayed `confirmed` — holding the
 * provider's slot capacity and the traveler's money — because the two component recorders derived
 * `all_undelivered`, said so, and stopped. Now the LAST terminal-undelivered answer flips the PARENT
 * to `cancelled` in ONE atomic statement that also releases the booking's claimed slot units exactly
 * once, records `booking_details.allUndelivered = { at, cause, componentIds }`, and hands the money to
 * the EXISTING D-51 settlement. ONE implementation (`settleBundleAllUndelivered`), TWO callers — the
 * seller's component-failure rail and the traveler's component-cancel rail (§18 rule 1).
 *
 *   U1  the LAST component FAILED ⇒ parent cancelled, cause `seller_failed`, the slot released ONCE
 *   U2  the LAST component TRAVELER-CANCELLED ⇒ cause `traveler_cancelled`
 *   U3  one failed + one cancelled ⇒ cause `mixed` — the two answers are never collapsed (§13)
 *   U4  ONE DELIVERABLE COMPONENT LEFT ⇒ the parent is untouched and nothing is released; and a bundle
 *       with NO component rows at all never triggers this ("we cannot enumerate it" ≠ "nothing was
 *       delivered")
 *   U5  two concurrent last-flips ⇒ ONE flip, ONE release, ONE settlement row, ONE Stripe call
 *   U6  a retry is a NO-OP: the from-state is the guard, nothing is released twice, no second claim
 *   U7  the settlement AFTER the flip refunds each allocation at its OWN pinned answer — a failed one
 *       in full, a traveler-cancelled one at the percent its snapshotted policy pinned — as ONE Stripe
 *       refund through the EXISTING path; and NOTHING MINTS on a cancelled parent (§13)
 *   U8  the whole-row cancel rail on an already all-undelivered parent is refused by its OWN from-state
 *       list — no second cancel, no double release
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  readAllUndeliveredRecord,
  recordBundleComponentCancellation,
  recordBundleComponentCompletion,
  recordBundleComponentFailure,
  settleBundleAllUndelivered,
} from "../services/booking-completion.service";
import { readBundleComponentRows } from "../services/bundle-component-states.service";
import { sweepUnsettledBundlePartials } from "../services/bundle-partial-settlement.service";
import { deriveAllUndeliveredCause } from "@shared/bundle-component-states";
import { BOOKING_CANCELLABLE_FROM_STATUSES, isBookingCancellable } from "@shared/booking-cancellation";
import { ALL_UNDELIVERED_CANCEL_FROM_STATUSES } from "../utils/booking-from-states";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `und-${RUN}-prov`,
  traveler: `und-${RUN}-trav`,
  bundle: `und-${RUN}-bundle`,
  compA: `und-${RUN}-a`,
  compB: `und-${RUN}-b`,
  compC: `und-${RUN}-c`,
};
const COMPONENTS = [
  { id: ids.compA, serviceName: `Und comp A ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compB, serviceName: `Und comp B ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compC, serviceName: `Und comp C ${RUN}`, price: "20.00", priceCents: 2000 },
];
const createdBookingIds: string[] = [];
const createdSlotIds: string[] = [];
const actor = "provider_bundle_components" as const;
const HOUR = 60 * 60 * 1000;
const startIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

// ── Disposable-DB guard (mirrors bundle-partial-settlement.db.test.ts; never defaults open) ──────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[bundle-all-undelivered] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Stripe stub on the shared prototype (every `new Stripe()` shares it) ─────────────────────────
const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const originalCreate = refundsProto.create;
let calls: Array<{ params: any; options: any }> = [];
function stubSucceed() {
  calls = [];
  refundsProto.create = async (params: any, options: any) => {
    calls.push({ params, options });
    return { id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: params.amount };
  };
}
afterEach(() => {
  refundsProto.create = originalCreate;
});

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

/** A CONFIRMED bundle booking born through the composer, 100.00 (fee 25.00 / earnings 75.00). */
async function bornBundleBooking(opts: {
  snapshot?: unknown[];
  details?: Record<string, unknown>;
  policy?: string | null;
} = {}): Promise<string> {
  if (opts.policy !== undefined) {
    await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = ${opts.policy} WHERE id = ${ids.bundle}`);
  }
  const booking = await storage.createServiceBooking({
    serviceId: ids.bundle,
    travelerId: ids.traveler,
    providerId: ids.provider,
    status: "confirmed",
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    bookingDetails: {
      bundleComponents: opts.snapshot ?? COMPONENTS.map((c) => ({ id: c.id, serviceName: c.serviceName, priceCents: c.priceCents })),
      travelerCharge: { conciergeFee: "5.00" },
      travelerServiceFee: { charged: 10, waived: false },
      ...(opts.details ?? {}),
    },
  } as any);
  createdBookingIds.push(booking.id);
  await db.execute(sql`
    UPDATE service_bookings
       SET stripe_payment_intent_id = ${`pi_${RUN}_${booking.id.slice(0, 8)}`}, confirmed_at = NOW() - interval '10 days'
     WHERE id = ${booking.id}
  `);
  return booking.id;
}

/**
 * A slot the checkout would have claimed PER CART LINE — a bundle is ONE line, so ONE claim. Each
 * fixture takes its own DAY: `vendor_availability_slots` is UNIQUE (service_id, date, start_time).
 */
let slotDay = 0;
async function makeSlot(units: number, capacity: number): Promise<string> {
  const slotId = `und-${RUN}-slot-${crypto.randomUUID().slice(0, 6)}`;
  const date = new Date(Date.now() + (30 + slotDay++) * 24 * HOUR).toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${slotId}, ${ids.bundle}, ${ids.provider}, ${date}::date, '09:00', '17:00', ${capacity}, ${units},
            ${units >= capacity ? "fully_booked" : "available"})
  `);
  createdSlotIds.push(slotId);
  return slotId;
}
async function bindSlot(bookingId: string, slotId: string, units: number): Promise<void> {
  await db.execute(sql`
    UPDATE service_bookings
       SET slot_id = ${slotId},
           booking_details = COALESCE(booking_details, '{}'::jsonb)
             || ${JSON.stringify({ claimedSlotIds: [slotId], claimedSlotUnits: units })}::jsonb
     WHERE id = ${bookingId}
  `);
}
async function slotRow(slotId: string): Promise<any> {
  return (await db.execute(sql`SELECT booked_count, status FROM vendor_availability_slots WHERE id = ${slotId}`)).rows[0];
}
async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, cancelled_at, cancellation_reason, completed_at, booking_details
      FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}
async function settlementRows(bookingId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM bundle_partial_settlements WHERE booking_id = ${bookingId}`)).rows as any[];
}
async function ledgerRowCount(bookingId: string): Promise<number> {
  const pe = await db.execute(sql`SELECT COUNT(*)::int AS n FROM provider_earnings WHERE source_id = ${bookingId}`);
  const pr = await db.execute(sql`SELECT COUNT(*)::int AS n FROM platform_revenue WHERE source_id = ${bookingId}`);
  const ee = await db.execute(sql`SELECT COUNT(*)::int AS n FROM expert_earnings WHERE reference_id = ${bookingId}`);
  return Number((pe.rows[0] as any).n) + Number((pr.rows[0] as any).n) + Number((ee.rows[0] as any).n);
}
async function diaryCount(bookingId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM item_transition_log
     WHERE event_type = 'booking_all_undelivered'
       AND trip_id IN (SELECT trip_id FROM service_bookings WHERE id = ${bookingId})
  `);
  return Number((r.rows[0] as any).n);
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`und-${RUN}-prov@t.test`}, 'Und', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`und-${RUN}-trav@t.test`}, 'Und', 'Traveler')
  `);
  for (const c of COMPONENTS) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                     approval_status, delivery_method)
      VALUES (${c.id}, ${ids.provider}, ${c.serviceName}, 'fixture component', ${c.price}, 'active',
              'approved', 'in_person')
    `);
  }
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, product_shape)
    VALUES (${ids.bundle}, ${ids.provider}, ${`Und bundle ${RUN}`}, 'fixture bundle', '100.00', 'active',
            'approved', 'in_person', 'bundle')
  `);
  for (const [i, c] of COMPONENTS.entries()) {
    await db.execute(sql`
      INSERT INTO bundle_components (id, bundle_service_id, component_service_id, position)
      VALUES (${`und-${RUN}-bc-${i}`}, ${ids.bundle}, ${c.id}, ${i})
    `);
  }
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE related_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const slotId of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${slotId}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${ids.bundle}`).catch(() => {});
  for (const svc of [ids.bundle, ids.compA, ids.compB, ids.compC]) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
  await db.execute(sql`DELETE FROM daily_revenue_summary WHERE date = CURRENT_DATE::text AND transaction_count = 0`).catch(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════

test("U1 — the LAST component FAILED: the parent is cancelled, the cause is `seller_failed`, and the booking's slot is released ONCE", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const slotId = await makeSlot(3, 3);
  await bindSlot(id, slotId, 3);
  assert.deepEqual(await slotRow(slotId), { booked_count: 3, status: "fully_booked" });

  // The first two failures leave a deliverable component, so the parent must not move.
  for (const c of [ids.compA, ids.compB]) {
    const r = await recordBundleComponentFailure({ bookingId: id, componentServiceId: c, actor, reason: "supplier out" });
    assert.equal(r.recorded, true);
    assert.equal(r.allUndelivered, undefined, "not the last answer — the parent leg was not attempted (§13)");
    assert.equal((await readBooking(id)).status, "confirmed");
  }

  const last = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: "supplier out" });
  assert.equal(last.recorded, true);
  assert.equal(last.partiallyCompleted, false, "nothing was delivered — this is not a partial completion");
  assert.equal(last.parentOutcome, "all_undelivered");
  assert.ok(last.allUndelivered, "the parent leg's NAMED result rides the response");
  assert.equal(last.allUndelivered!.flipped, true);
  assert.equal(last.allUndelivered!.cause, "seller_failed");

  const parent = await readBooking(id);
  assert.equal(parent.status, "cancelled");
  assert.ok(parent.cancelled_at, "the cancel instant is stamped by the ONE writer that owns the transition");
  assert.equal(parent.cancellation_reason, "all_undelivered:seller_failed");
  assert.equal(parent.completed_at, null, "nothing completed");

  // The provenance: merged onto the jsonb, the components NAMED, never a count.
  const record = readAllUndeliveredRecord(parent.booking_details);
  assert.ok(record);
  assert.equal(record!.cause, "seller_failed");
  assert.deepEqual(record!.componentIds.sort(), [ids.compA, ids.compB, ids.compC].sort());
  assert.ok(Date.parse(record!.at) > 0);
  assert.ok(parent.booking_details.bundleComponents, "the merge destroyed nothing already on the row");

  // THE RELEASE — exactly the units the claim took, through the rail that already owned it.
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" });
});

test("U2 — the LAST component TRAVELER-CANCELLED: the cause is `traveler_cancelled`, and it is never reported as the seller's failure", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  for (const c of [ids.compA, ids.compB]) {
    const r = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: c, travelerUserId: ids.traveler });
    assert.equal(r.recorded, true);
  }
  const last = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler, reason: "plans changed" });
  assert.ok(last.recorded);
  assert.equal(last.partiallyCompleted, false);
  assert.equal(last.parentOutcome, "all_undelivered");
  assert.equal(last.allUndelivered!.cause, "traveler_cancelled");
  const parent = await readBooking(id);
  assert.equal(parent.status, "cancelled");
  assert.equal(parent.cancellation_reason, "all_undelivered:traveler_cancelled");
  assert.equal(readAllUndeliveredRecord(parent.booking_details)!.cause, "traveler_cancelled");
});

test("U3 — one failed + one traveler-cancelled: the cause is `mixed`, because neither party's answer may stand for the other's", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compA, actor, reason: "no staff" });
  await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compB, travelerUserId: ids.traveler });
  const last = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor });
  assert.equal(last.allUndelivered!.cause, "mixed");
  assert.equal((await readBooking(id)).cancellation_reason, "all_undelivered:mixed");

  // The PURE derivation is the one authority, and it names NULL for anything that is not this case.
  assert.equal(
    deriveAllUndeliveredCause([
      { componentServiceId: "x", status: "failed", snapshotPriceCents: null },
      { componentServiceId: "y", status: "completed", snapshotPriceCents: null },
    ]),
    null,
    "something was delivered ⇒ NOT all-undelivered ⇒ no cause, never a default",
  );
  assert.equal(
    deriveAllUndeliveredCause([
      { componentServiceId: "x", status: "failed", snapshotPriceCents: null },
      { componentServiceId: "y", status: "pending", snapshotPriceCents: null },
    ]),
    null,
    "something is still pending ⇒ no cause",
  );
});

test("U4 — ONE DELIVERABLE COMPONENT LEFT: the parent is untouched and nothing is released; and a bundle with no component rows never triggers this", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const slotId = await makeSlot(2, 4);
  await bindSlot(id, slotId, 2);
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compA, actor });
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compB, actor });
  // C is still PENDING — the bundle can still deliver something.
  assert.equal((await readBooking(id)).status, "confirmed");
  assert.deepEqual(await slotRow(slotId), { booked_count: 2, status: "available" }, "no release while a component can still be delivered");
  assert.equal((await settlementRows(id)).length, 0);
  assert.equal(calls.length, 0, "no Stripe call");

  // Driving the writer directly is refused by its own re-derivation — the caller's opinion is never trusted.
  const direct = await settleBundleAllUndelivered({ bookingId: id, actor });
  assert.equal(direct.cancelled, false);
  assert.equal(direct.flipped, false);
  assert.equal(direct.cause, null, "never a guessed cause");
  assert.equal(direct.reason, "bundle_components_incomplete");
  assert.equal((await readBooking(id)).status, "confirmed");

  // A DELIVERED component and the rest undelivered is the PARTIAL rail's case, not this one.
  const partial = await bornBundleBooking();
  await recordBundleComponentCompletion({ bookingId: partial, componentServiceId: ids.compA, actor });
  await recordBundleComponentFailure({ bookingId: partial, componentServiceId: ids.compB, actor });
  const lastPartial = await recordBundleComponentFailure({ bookingId: partial, componentServiceId: ids.compC, actor });
  assert.equal(lastPartial.partiallyCompleted, true);
  assert.equal(lastPartial.allUndelivered, undefined, "the partial rail owns it, and this leg was not attempted");
  assert.equal((await readBooking(partial)).status, "partially_completed");

  // NO COMPONENT ROWS AT ALL: "we cannot enumerate it" is not "nothing was delivered" (§13).
  const empty = await bornBundleBooking({ snapshot: [] });
  assert.equal((await readBundleComponentRows(db, empty)).length, 0);
  const emptyOutcome = await settleBundleAllUndelivered({ bookingId: empty, actor });
  assert.equal(emptyOutcome.cancelled, false);
  assert.equal(emptyOutcome.reason, "bundle_components_unknown");
  assert.equal((await readBooking(empty)).status, "confirmed");
});

test("U5 — two concurrent last-flips: ONE parent flip, ONE slot release, ONE settlement row, ONE Stripe call", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const slotId = await makeSlot(3, 3);
  await bindSlot(id, slotId, 3);
  for (const c of COMPONENTS) {
    await recordBundleComponentFailure({ bookingId: id, componentServiceId: c.id, actor });
    // The LAST one already drove the parent leg; re-drive it concurrently below to prove the guard.
  }
  const before = await readBooking(id);
  assert.equal(before.status, "cancelled");
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" });

  const [a, b] = await Promise.all([
    settleBundleAllUndelivered({ bookingId: id, actor }),
    settleBundleAllUndelivered({ bookingId: id, actor }),
  ]);
  assert.equal(a.flipped, false);
  assert.equal(b.flipped, false);
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" }, "never released twice");
  assert.equal((await settlementRows(id)).length, 1, "the claim's UNIQUE (booking_id) is the guard");
  assert.equal(calls.length, 1, "exactly one Stripe refund for this bundle, across every caller");
  assert.equal(await diaryCount(id), 0, "no trip on the fixture ⇒ no diary row, and none is invented");
});

test("U6 — a retry is a NO-OP: the from-state is the guard, nothing is released twice and no second claim is taken", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const slotId = await makeSlot(2, 2);
  await bindSlot(id, slotId, 2);
  for (const c of COMPONENTS) await recordBundleComponentFailure({ bookingId: id, componentServiceId: c.id, actor });
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" });
  const stripeCallsAfterFirst = calls.length;
  assert.equal(stripeCallsAfterFirst, 1);

  // Re-declaring the same failure moves NOTHING, and the refusal comes from the resolver BEFORE any
  // claim is attempted: a `cancelled` parent is not a state a component write may re-decide, and it is
  // named (`wrong_status`, the status stated) rather than reported as a component problem (§13). The
  // parent leg is never reached, so there is nothing to re-run.
  const again = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor });
  assert.equal(again.recorded, false, "a decided parent cannot take another component answer");
  assert.equal(again.reason, "wrong_status");
  assert.equal((again.evidence as any).status, "cancelled");
  assert.equal(again.allUndelivered, undefined, "the parent leg was not attempted — nothing to re-run");

  // And driving the parent writer DIRECTLY a second time is a no-op that says so, rather than a
  // second flip: the from-state guard matched nothing, and the money leg answers from the SETTLED row.
  const redrive = await settleBundleAllUndelivered({ bookingId: id, actor });
  assert.equal(redrive.cancelled, true);
  assert.equal(redrive.flipped, false, "the parent had already left `confirmed`");
  assert.equal(redrive.alreadyCancelled, true);
  assert.equal(redrive.cause, "seller_failed", "read from the PINNED record, never re-derived into a new one");
  assert.equal(redrive.settlement!.settled, true);
  assert.equal((redrive.settlement as any).alreadySettled, true);

  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" });
  assert.equal((await settlementRows(id)).length, 1);
  assert.equal(calls.length, stripeCallsAfterFirst, "no second Stripe refund");

  // The nightly sweep sees a SETTLED row and re-drives nothing.
  const swept = await sweepUnsettledBundlePartials({ onlyBookingIds: [id] });
  assert.equal(swept.scanned, 0, "a promoted settlement is not a sweep candidate");
  assert.equal(calls.length, stripeCallsAfterFirst);

  // The from-state list is ONE entry, and it is the reason every retry above moved nothing.
  assert.deepEqual([...ALL_UNDELIVERED_CANCEL_FROM_STATUSES], ["confirmed"]);
});

test("U7 — the settlement refunds each allocation at its OWN pinned answer through the EXISTING path, and a cancelled parent MINTS NOTHING", async () => {
  stubSucceed();
  // MODERATE, 72h out ⇒ a traveler cancel pins 50%. A and C fail (full allocation, no policy input).
  const id = await bornBundleBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  const cancelled = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler, reason: "changed mind" });
  assert.ok(cancelled.recorded);
  assert.equal(cancelled.terms.refundPercent, 50);
  assert.equal(cancelled.terms.refundCents, 1000, "2000 allocation × 50%");
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compA, actor });
  const last = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compB, actor });
  assert.equal(last.allUndelivered!.cause, "mixed");
  assert.equal(last.allUndelivered!.settlement!.settled, true);

  // ONE Stripe refund: 4000 + 4000 + 1000 allocation, plus 90% of the 5.00 concierge fee and of the
  // 10.00 traveler service fee. Seller nonperformance is refunded in FULL regardless of the policy.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 10350, "the 9000 refunded allocation plus 90% of each traveler-paid fee");
  const s = (await settlementRows(id))[0];
  assert.equal(s.traveler_refund_cents, 10350);
  assert.equal(s.settled_amount_cents, 1000, "only the retained half of the traveler-cancelled component");
  const outcomes = s.component_outcomes.components as any[];
  const byId = Object.fromEntries(outcomes.map((o) => [o.componentServiceId, o]));
  assert.equal(byId[ids.compA].outcome, "failed");
  assert.equal(byId[ids.compA].refundCents, 4000);
  assert.equal(byId[ids.compA].refundPercent, null, "no policy was applied to a failure — stating 100 would claim one (§13)");
  assert.equal(byId[ids.compC].outcome, "cancelled");
  assert.equal(byId[ids.compC].refundCents, 1000);
  assert.equal(byId[ids.compC].refundPercent, 50);

  // The promote stamped the components it refunded; WHO ended each and WHY survives.
  const rows = await readBundleComponentRows(db, id);
  assert.deepEqual(rows.map((r) => r.status).sort(), ["refunded", "refunded", "refunded"]);
  const cRow = rows.find((r) => r.componentServiceId === ids.compC)!;
  assert.equal(cRow.cancelRefundPercent, 50);
  assert.equal(cRow.cancelReason, "changed mind");
  assert.equal(rows.find((r) => r.componentServiceId === ids.compA)!.failedAt !== null, true);

  // §13 — NOTHING MINTS on a cancelled parent. The retained 1000 cents is recorded on the immutable
  // settlement row (`seller_earning_cents`) and is deliberately NOT an earning: minting on a cancelled
  // parent is a new money event and needs its own ruling.
  assert.equal(s.seller_earning_cents, 750, "75.00 × the kept 0.1 — pinned on the record, not minted");
  assert.equal(await ledgerRowCount(id), 0, "no provider earning, no expert earning, no platform revenue row");
  assert.equal((await readBooking(id)).status, "cancelled");
});

test("U8 — the whole-row cancel rail on an already all-undelivered parent is refused by its OWN from-state list: no second cancel, no double release", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const slotId = await makeSlot(2, 2);
  await bindSlot(id, slotId, 2);
  for (const c of COMPONENTS) await recordBundleComponentFailure({ bookingId: id, componentServiceId: c.id, actor });
  assert.equal((await readBooking(id)).status, "cancelled");
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" });

  // The rail's own pre-check and its atomic conditional both refuse — and the write is the guard.
  assert.equal(isBookingCancellable("cancelled"), false, "the surface and the route read the SAME list");
  const second = await storage.updateServiceBookingStatus(id, "cancelled", "traveler asked again", BOOKING_CANCELLABLE_FROM_STATUSES);
  assert.equal(second, undefined, "zero rows matched — none of the side-effects ran");
  assert.deepEqual(await slotRow(slotId), { booked_count: 0, status: "available" }, "capacity is never handed back twice");

  // And the reason it cannot: `cancelled` is in neither list.
  assert.equal([...BOOKING_CANCELLABLE_FROM_STATUSES].includes("cancelled" as any), false);
  assert.equal([...ALL_UNDELIVERED_CANCEL_FROM_STATUSES].includes("cancelled"), false);
  assert.equal(calls.length, 1, "still exactly one refund for this bundle");
});
