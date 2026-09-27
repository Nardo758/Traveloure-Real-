/**
 * R164 (G2) — THE STALE AUTHORIZED-CLAIM SWEEP (decision-maker ruled Sep 27, 2026; ledger
 * `2026-09-27-stale-authorized-sweep`). `sweepStaleAuthorizedClaims` reads each STAMPED `payment_pending`
 * claim's PaymentIntent from Stripe and: succeeded ⇒ promote (ONE `promotePaidCheckout`); canceled ⇒
 * void + release; processing ⇒ never touched; unpaid past 24h ⇒ cancel (ONE `cancelStalePaymentIntent`)
 * + void + release; unpaid younger ⇒ left. A voided claim's plan item returns to planning. Stripe is
 * stubbed (injected), so these run with no network.
 *
 *   G1  succeeded ⇒ confirmed, diary actor `system`
 *   G2  canceled ⇒ expired, slot released, item back to in_planning
 *   G3  processing, even days old ⇒ untouched, never cancelled
 *   G4  unpaid but younger than 24h ⇒ untouched, never cancelled
 *   G5  unpaid past 24h ⇒ cancelled ONCE, expired, released, item reverted; a second pass is a no-op
 *   G6  paid between the read and the cancel ⇒ promoted, never voided
 *   G7  Stripe unreadable ⇒ quarantined, nothing changes
 *   G8  RACE: the webhook promotes while the sweep reads ⇒ the void matches zero rows, nothing released
 *   G9  an UNSTAMPED claim is not this sweep's (it is `sweepExpiredCheckoutClaims`')
 *   G10 claims younger than the checkout TTL are never considered
 *   G11 a released STAMPED claim ⇒ ONE email, the ruled copy, the plan link; re-runs send nothing
 *   G12 an UNSTAMPED claim released by the checkout sweep ⇒ never emailed
 *   G13 two concurrent notices on one booking ⇒ one email
 *   G14 the ruled sentence, verbatim; without a plan the "back in your plan" clause is not said
 *
 * Run: JOURNEY_DB_WRITES_OK=1 DATABASE_URL=… npx tsx --test server/__tests__/stale-authorized-sweep.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CLAIM_EXPIRED_STATUS,
  EXPIRED_CLAIM_NOTICE_KEY,
  notifyExpiredStampedClaim,
  promotePaidCheckout,
  sweepExpiredCheckoutClaims,
  sweepStaleAuthorizedClaims,
  type ExpiredClaimEmailSender,
  type StaleSweepStripe,
} from "../services/checkout-claim.service";
import { expiredClaimNoticeSentence } from "../services/email.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `g2-${RUN}-user`, service: `g2-${RUN}-svc`, trip: `g2-${RUN}-trip` };
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host: string | null = null;
    try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
    if (host === null || !DISPOSABLE_HOSTS.has(host)) {
      throw new Error(`[stale-authorized-sweep] REFUSING to write fixtures to '${host ?? "<none>"}'; opt in with JOURNEY_DB_WRITES_OK=1.`);
    }
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`g2-${RUN}@t.test`}, 'G2', 'Fixture')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.service}, ${ids.user}, 'G2 fixture', '100.00')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'G2 trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of createdSlotIds) await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** An AUTHORIZED claim as checkout leaves it: PI stamped, still payment_pending, one slot unit held,
 *  and its plan item already flipped to `purchased` by authorization. */
async function authorizedClaim(opts: { pi: string; ageMinutes: number; stamped?: boolean }) {
  const n = createdBookingIds.length;
  const bookingId = `g2-${RUN}-bk-${n}`;
  const slotId = `g2-${RUN}-slot-${n}`;
  const itemId = `g2-${RUN}-item-${n}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES (${slotId}, ${ids.service}, ${ids.user}, CURRENT_DATE + 20, 1, 1, 'fully_booked')
  `);
  createdSlotIds.push(slotId);
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id, status, total_amount,
      platform_fee, stripe_payment_intent_id, booking_details, created_at)
    VALUES (${bookingId}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${slotId}, 'payment_pending', '100.00', '0.00',
      ${opts.stamped === false ? null : opts.pi},
      ${JSON.stringify({ itineraryItemId: itemId, stripeAttemptAt: new Date().toISOString() })}::jsonb,
      NOW() - (${String(opts.ageMinutes)} || ' minutes')::interval)
  `);
  createdBookingIds.push(bookingId);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id, provider_service_id, status)
    VALUES (${itemId}, ${ids.trip}, 'G2 item', 1, 'traveler', 'purchased', ${bookingId}, ${ids.service}, 'planned')
  `);
  return { bookingId, slotId, itemId };
}

async function state(c: { bookingId: string; slotId: string; itemId: string }) {
  const b = (await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${c.bookingId}`)).rows[0] as any;
  const s = (await db.execute(sql`SELECT booked_count, status FROM vendor_availability_slots WHERE id = ${c.slotId}`)).rows[0] as any;
  const i = (await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${c.itemId}`)).rows[0] as any;
  return { booking: b.status, booked: Number(s.booked_count), slotStatus: s.status, item: i.routing_status };
}

function stubStripe(statusOf: Record<string, string | Error>, cancelOverride?: (pi: string) => any) {
  const calls = { retrieve: [] as string[], cancel: [] as string[] };
  const stripe: StaleSweepStripe = {
    retrieveStatus: async (pi) => {
      calls.retrieve.push(pi);
      const v = statusOf[pi];
      if (v instanceof Error) throw v;
      return v ?? "requires_payment_method";
    },
    cancel: async (pi) => {
      calls.cancel.push(pi);
      if (cancelOverride) return cancelOverride(pi);
      statusOf[pi] = "canceled";
      return { outcome: "canceled", status: "canceled" };
    },
  };
  return { stripe, calls };
}

const DAY = 24 * 60;

test("G1 succeeded ⇒ promoted through the one shared promotion, recorded as the system", async () => {
  const pi = `pi_${RUN}_g1`;
  const c = await authorizedClaim({ pi, ageMinutes: 60 });
  const { stripe } = stubStripe({ [pi]: "succeeded" });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.promoted, 1);
  const s = await state(c);
  assert.equal(s.booking, "confirmed");
  assert.equal(s.booked, 1, "a paid claim keeps its slot");
  assert.equal(s.item, "purchased");
  const diary = (await db.execute(sql`SELECT actor_type FROM item_transition_log WHERE trip_id = ${ids.trip} AND item_id = ${c.itemId} AND event_type = 'checkout_payment_confirmed'`)).rows as any[];
  assert.equal(diary.length, 1, "one diary row for the promotion");
  assert.equal(diary[0].actor_type, "system", "the sweep is recorded as the system, never as the traveler");
});

test("G2 canceled ⇒ expired, slot released, item back in planning", async () => {
  const pi = `pi_${RUN}_g2`;
  const c = await authorizedClaim({ pi, ageMinutes: 60 });
  const { stripe, calls } = stubStripe({ [pi]: "canceled" });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.voidedCanceled, 1);
  assert.equal(calls.cancel.length, 0, "already canceled — nothing to cancel");
  const s = await state(c);
  assert.equal(s.booking, CLAIM_EXPIRED_STATUS);
  assert.equal(s.booked, 0, "capacity returned");
  assert.equal(s.slotStatus, "available");
  assert.equal(s.item, "in_planning", "the item is back in the plan, never stranded as purchased");
});

test("G3 processing is never touched, however old", async () => {
  const pi = `pi_${RUN}_g3`;
  const c = await authorizedClaim({ pi, ageMinutes: 5 * DAY });
  const { stripe, calls } = stubStripe({ [pi]: "processing" });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.leftProcessing, 1);
  assert.equal(calls.cancel.length, 0, "a processing intent is never cancelled");
  const s = await state(c);
  assert.deepEqual([s.booking, s.booked, s.item], ["payment_pending", 1, "purchased"]);
});

test("G4 unpaid but younger than 24h is left for the traveler to finish", async () => {
  const pi = `pi_${RUN}_g4`;
  const c = await authorizedClaim({ pi, ageMinutes: 23 * 60 });
  const { stripe, calls } = stubStripe({ [pi]: "requires_payment_method" });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.leftYoung, 1);
  assert.equal(calls.cancel.length, 0);
  assert.equal((await state(c)).booking, "payment_pending");
});

test("G5 unpaid past 24h ⇒ cancelled once, expired, released, item reverted; a second pass is a no-op", async () => {
  const pi = `pi_${RUN}_g5`;
  const c = await authorizedClaim({ pi, ageMinutes: DAY + 30 });
  const statusOf: Record<string, string | Error> = { [pi]: "requires_action" };
  const { stripe, calls } = stubStripe(statusOf);
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.voidedStale, 1);
  assert.deepEqual(calls.cancel, [pi]);
  const s = await state(c);
  assert.deepEqual([s.booking, s.booked, s.item], [CLAIM_EXPIRED_STATUS, 0, "in_planning"]);
  const again = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(again.examined, 0, "an expired row is not a candidate");
  assert.equal(calls.cancel.length, 1, "never cancelled twice");
  assert.equal((await state(c)).booked, 0, "nothing released twice");
});

test("G6 paid between the read and the cancel ⇒ promoted, never voided", async () => {
  const pi = `pi_${RUN}_g6`;
  const c = await authorizedClaim({ pi, ageMinutes: DAY + 30 });
  const { stripe } = stubStripe({ [pi]: "requires_payment_method" }, () => ({ outcome: "not_cancellable", status: "succeeded" }));
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.promoted, 1);
  assert.equal(r.voidedStale, 0);
  const s = await state(c);
  assert.deepEqual([s.booking, s.booked], ["confirmed", 1]);
});

test("G7 Stripe unreadable ⇒ quarantined, nothing changes", async () => {
  const pi = `pi_${RUN}_g7`;
  const c = await authorizedClaim({ pi, ageMinutes: 3 * DAY });
  const { stripe, calls } = stubStripe({ [pi]: new Error("stripe down") });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.quarantined, 1);
  assert.equal(calls.cancel.length, 0);
  const s = await state(c);
  assert.deepEqual([s.booking, s.booked, s.item], ["payment_pending", 1, "purchased"]);
});

test("G8 RACE: the webhook promotes while the sweep reads Stripe ⇒ the void matches nothing, nothing released", async () => {
  const pi = `pi_${RUN}_g8`;
  const c = await authorizedClaim({ pi, ageMinutes: 60 });
  const stripe: StaleSweepStripe = {
    retrieveStatus: async () => {
      // The webhook lands first and promotes the row…
      await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", bookingIds: [c.bookingId] });
      // …and the sweep's (stale) read says canceled.
      return "canceled";
    },
    cancel: async () => ({ outcome: "canceled", status: "canceled" }),
  };
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.voidedCanceled, 0, "the void's own predicate refused a confirmed row");
  const s = await state(c);
  assert.deepEqual([s.booking, s.booked, s.item], ["confirmed", 1, "purchased"], "one winner: the promotion");
});

test("G9 an unstamped claim is not this sweep's", async () => {
  const pi = `pi_${RUN}_g9`;
  const c = await authorizedClaim({ pi, ageMinutes: 3 * DAY, stamped: false });
  const { stripe, calls } = stubStripe({});
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.examined, 0);
  assert.equal(calls.retrieve.length, 0);
});

test("G10 a claim younger than the checkout TTL is never considered", async () => {
  const pi = `pi_${RUN}_g10`;
  const c = await authorizedClaim({ pi, ageMinutes: 5 });
  const { stripe, calls } = stubStripe({ [pi]: "canceled" });
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe });
  assert.equal(r.examined, 0);
  assert.equal(calls.retrieve.length, 0);
  assert.equal((await state(c)).booking, "payment_pending");
});

function captureEmails() {
  const sent: Array<Parameters<ExpiredClaimEmailSender>[0]> = [];
  const send: ExpiredClaimEmailSender = async (p) => { sent.push(p); };
  return { sent, send };
}

test("G11 a released stamped claim ⇒ ONE email with the ruled copy; re-runs send nothing", async () => {
  const pi = `pi_${RUN}_g11`;
  const c = await authorizedClaim({ pi, ageMinutes: DAY + 30 });
  const { stripe } = stubStripe({ [pi]: "requires_payment_method" });
  const mail = captureEmails();
  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe, sendExpiredClaimEmail: mail.send });
  assert.equal(r.voidedStale, 1);
  assert.equal(r.noticesSent, 1);
  assert.equal(mail.sent.length, 1);
  assert.deepEqual(mail.sent[0], { toEmail: `g2-${RUN}@t.test`, travelerName: "G2", serviceName: "G2 fixture", tripId: ids.trip });
  assert.equal(
    expiredClaimNoticeSentence(mail.sent[0].serviceName, !!mail.sent[0].tripId),
    "Your booking for G2 fixture wasn't completed, so we released it. It's back in your plan; you can book it again.",
  );
  const d = (await db.execute(sql`SELECT booking_details -> ${EXPIRED_CLAIM_NOTICE_KEY}::text AS n FROM service_bookings WHERE id = ${c.bookingId}`)).rows[0] as any;
  assert.ok(d.n?.claimedAt, "the one-per-booking claim is recorded on the row");
  // A second pass, and a direct second notice, send nothing.
  await sweepStaleAuthorizedClaims({ onlyBookingIds: [c.bookingId], stripe, sendExpiredClaimEmail: mail.send });
  const again = await notifyExpiredStampedClaim(c.bookingId, mail.send);
  assert.deepEqual(again, { sent: false, reason: "not_claimed" });
  assert.equal(mail.sent.length, 1, "one email per booking, ever");
});

test("G12 an unstamped claim released by the checkout sweep is never emailed", async () => {
  const c = await authorizedClaim({ pi: `pi_${RUN}_g12`, ageMinutes: 3 * DAY, stamped: false });
  await db.execute(sql`UPDATE service_bookings SET booking_details = booking_details - 'stripeAttemptAt' WHERE id = ${c.bookingId}`);
  const sw = await sweepExpiredCheckoutClaims({ onlyBookingIds: [c.bookingId] });
  assert.equal(sw.voidedUnreached, 1, "the unstamped claim was released by its own sweep");
  assert.equal((await state(c)).booking, CLAIM_EXPIRED_STATUS);
  const mail = captureEmails();
  const n = await notifyExpiredStampedClaim(c.bookingId, mail.send);
  assert.deepEqual(n, { sent: false, reason: "not_claimed" }, "the traveler never reached payment — no email");
  assert.equal(mail.sent.length, 0);
});

test("G13 two concurrent notices on one booking ⇒ one email", async () => {
  const pi = `pi_${RUN}_g13`;
  const c = await authorizedClaim({ pi, ageMinutes: 60 });
  await db.execute(sql`UPDATE service_bookings SET status = ${CLAIM_EXPIRED_STATUS} WHERE id = ${c.bookingId}`);
  const mail = captureEmails();
  const results = await Promise.all([1, 2, 3, 4].map(() => notifyExpiredStampedClaim(c.bookingId, mail.send)));
  assert.equal(results.filter((x) => x.sent).length, 1);
  assert.equal(mail.sent.length, 1);
});

test("G14 the ruled sentence, verbatim; with no plan the plan clause is not said", () => {
  assert.equal(
    expiredClaimNoticeSentence("Tea ceremony", true),
    "Your booking for Tea ceremony wasn't completed, so we released it. It's back in your plan; you can book it again.",
  );
  assert.equal(
    expiredClaimNoticeSentence("Tea ceremony", false),
    "Your booking for Tea ceremony wasn't completed, so we released it. You can book it again.",
  );
  assert.equal(
    expiredClaimNoticeSentence(null, true),
    "Your booking wasn't completed, so we released it. It's back in your plan; you can book it again.",
  );
});
