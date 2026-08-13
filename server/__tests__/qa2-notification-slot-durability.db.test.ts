/**
 * QA-2 — notification durability + slot-leak proof (DECISIONS.md ledger 96).
 *
 * FINDING A/B (durability): the booking-status canonical writer, `storage.updateServiceBookingStatus`,
 * now inserts its accept/decline traveler notification INSIDE the same transaction as the status flip
 * (ruling 80's "flip-and-mint in one transaction" precedent, generalized to notifications), keyed by
 * a `dedupeKey` (`booking:<id>:<event>`) against `notifications.dedupe_key`'s partial UNIQUE index
 * (migration 209) with `ON CONFLICT DO NOTHING`. This suite proves, against a real database:
 *
 *   P1   pending → confirmed produces EXACTLY ONE notification.
 *   N1   a concurrent second accept (the §18b atomic-conditional race LOSER) produces ZERO
 *        additional notifications and throws/leaks nothing (Promise.all resolves cleanly).
 *   N2   a crash-simulating RETRY — re-running the exact same transition a second time (the shape
 *        both real call sites use when no restrictive `expectedFromStatuses` is passed, e.g. the
 *        traveler's own POST /api/bookings/:id/cancel) — is a no-op: no second notification row,
 *        no double slot-release, no thrown error.
 *
 * FINDING C (slot leak — investigated before building, see the storage.ts docblock and the closed
 * stale comment in payments.routes.ts): the §15b TTL sweep (voidClaim) and the paid-refund path
 * (refundServiceBooking) already release a claimed slot; proven by the EXISTING sweep suite
 * (checkout-claim-sweep.db.test.ts) and NOT re-proven here. The gap this lane found and fixed was
 * the NO-REFUND cancel/decline branch, which called the canonical writer directly with no slot
 * release at all:
 *
 *   P2   a paid, slot-bound booking cancelled with NO refund due gives its slot back — one atomic
 *        release, inside the SAME writer, on the FIRST transition into cancelled/refunded.
 *   N3   a retried/duplicated cancel of the SAME already-cancelled booking releases the slot ONCE,
 *        never twice (no double-release on a retry).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/qa2-notification-slot-durability.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage, type BookingStatusNotification } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `qa2-${RUN}-prov`,
  traveler: `qa2-${RUN}-trav`,
  trip: `qa2-${RUN}-trip`,
};
const createdServiceIds: string[] = [];
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts / provider-money-hardening) ────
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
      `[qa2-notification-slot] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, confirmed_at, cancelled_at, stripe_payment_intent_id, slot_id
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

async function readSlotBookedCount(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT COALESCE(booked_count, 0) AS c FROM vendor_availability_slots WHERE id = ${id}`);
  return Number((r.rows[0] as any)?.c ?? -1);
}

async function notificationCount(dedupeKey: string): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM notifications WHERE dedupe_key = ${dedupeKey}`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function makeSlot(serviceId: string, capacity = 1, bookedCount = 1): Promise<string> {
  const id = `qa2-${RUN}-slot-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, provider_id, service_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${id}, ${ids.provider}, ${serviceId}, CURRENT_DATE + 21, '10:00', '12:00', ${capacity}, ${bookedCount}, 'available')
  `);
  createdSlotIds.push(id);
  return id;
}

async function makePendingBooking(serviceId: string): Promise<string> {
  const id = `qa2-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id,
                                  status, total_amount, platform_fee, provider_earnings)
    VALUES (${id}, ${serviceId}, ${ids.traveler}, ${ids.provider}, ${ids.trip},
            'pending', '100.00', '10.00', '90.00')
  `);
  createdBookingIds.push(id);
  return id;
}

/** A paid, slot-bound `confirmed` booking — the shape a real checkout-promoted booking has. */
async function makeConfirmedSlottedBooking(serviceId: string, slotId: string): Promise<string> {
  const id = `qa2-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id,
                                  status, total_amount, platform_fee, provider_earnings,
                                  stripe_payment_intent_id, confirmed_at)
    VALUES (${id}, ${serviceId}, ${ids.traveler}, ${ids.provider}, ${ids.trip}, ${slotId},
            'confirmed', '100.00', '10.00', '90.00', ${`pi_qa2_${id}`}, NOW())
  `);
  createdBookingIds.push(id);
  return id;
}

const ACCEPT_FROM = ["pending"] as const;

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`qa2-${RUN}-prov@t.test`}, 'QA2', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`qa2-${RUN}-trav@t.test`}, 'QA2', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'QA2 fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.traveler}`).catch(() => {});
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  for (const id of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FINDING A/B — durable, deduped, in-transaction notification
// ─────────────────────────────────────────────────────────────────────────────────────────────

test("P1: pending → confirmed produces EXACTLY ONE notification, in the SAME transaction as the flip", async () => {
  const svc = await storage.createProviderService({
    serviceName: `QA2 p1 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const booking = await makePendingBooking(svc.id);
  const dedupeKey = `booking:${booking}:accepted`;
  const notify: BookingStatusNotification = {
    userId: ids.traveler,
    type: "booking_confirmed",
    title: "Booking accepted",
    message: "Your booking was accepted by the provider.",
    dedupeKey,
  };

  assert.equal(await notificationCount(dedupeKey), 0, "no notification before the accept");
  const result = await storage.updateServiceBookingStatus(booking, "confirmed", undefined, ACCEPT_FROM, notify);
  assert.ok(result, "the accept must succeed");
  assert.equal((await readBooking(booking)).status, "confirmed");
  assert.equal(await notificationCount(dedupeKey), 1, "exactly one notification must exist after the accept");

  const row = (
    await db.execute(sql`SELECT user_id, type, related_id, related_type FROM notifications WHERE dedupe_key = ${dedupeKey}`)
  ).rows[0] as any;
  assert.equal(row.user_id, ids.traveler);
  assert.equal(row.type, "booking_confirmed");
  assert.equal(row.related_id, booking);
  assert.equal(row.related_type, "booking");
});

test("N1: a CONCURRENT second accept (the atomic-conditional race loser) writes ZERO additional notifications and leaks no error", async () => {
  const svc = await storage.createProviderService({
    serviceName: `QA2 n1 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const booking = await makePendingBooking(svc.id);
  const dedupeKey = `booking:${booking}:accepted`;
  const notify: BookingStatusNotification = {
    userId: ids.traveler,
    type: "booking_confirmed",
    title: "Booking accepted",
    message: "Your booking was accepted by the provider.",
    dedupeKey,
  };

  // A double-click, or two tabs. Every caller races with the SAME dedupeKey.
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => storage.updateServiceBookingStatus(booking, "confirmed", undefined, ACCEPT_FROM, notify)),
  );
  const rejected = results.filter((r) => r.status === "rejected");
  assert.deepEqual(rejected, [], "no call may throw — a lost race is a clean undefined, never an exception");
  const fulfilled = results as PromiseFulfilledResult<any>[];
  const winners = fulfilled.filter((r) => r.value !== undefined);
  assert.equal(winners.length, 1, `exactly one accept may take; ${winners.length} did`);
  assert.equal((await readBooking(booking)).status, "confirmed");
  assert.equal(await notificationCount(dedupeKey), 1, "5 concurrent callers must still leave exactly ONE notification row");
});

test("N2: a crash-simulating RETRY of the exact same transition (no restrictive guard) is a no-op — one notification, one slot release, no throw", async () => {
  const svc = await storage.createProviderService({
    serviceName: `QA2 n2 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const slot = await makeSlot(svc.id, 1, 1);
  const booking = await makeConfirmedSlottedBooking(svc.id, slot);
  const dedupeKey = `booking:${booking}:cancelled`;
  const notify: BookingStatusNotification = {
    userId: ids.traveler,
    type: "booking_cancelled",
    title: "Booking cancelled by provider",
    message: "Your booking was cancelled by the provider. No charge was made.",
    dedupeKey,
  };

  // Call 1: the real cancel. Mirrors the two real call sites that pass NO expectedFromStatuses
  // (POST /api/bookings/:id/cancel's non-refund branch) — an unconditional `WHERE id = ?` guard,
  // which is exactly what makes a same-transition retry re-run the UPDATE instead of losing an
  // atomic-conditional race.
  const first = await storage.updateServiceBookingStatus(booking, "cancelled", "test reason", undefined, notify);
  assert.ok(first, "the first cancel must succeed");
  assert.equal((await readBooking(booking)).status, "cancelled");
  assert.equal(await notificationCount(dedupeKey), 1, "one notification after the first cancel");
  assert.equal(await readSlotBookedCount(slot), 0, "the slot must be released on the FIRST cancellation");

  // Call 2: the crash-simulating retry — same booking, same status, same dedupeKey. Must not throw,
  // must not write a second notification, must not release the slot a second time (floor at 0, but
  // proven here as "unchanged" so a capacity-2 slot would also be caught).
  const second = await storage.updateServiceBookingStatus(booking, "cancelled", "test reason", undefined, notify);
  assert.ok(second, "a retry that still matches the (unconditional) guard returns the row, not undefined");
  assert.equal(await notificationCount(dedupeKey), 1, "the retry must add ZERO additional notifications");
  assert.equal(await readSlotBookedCount(slot), 0, "the retry must not release the slot a second time");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FINDING C — the no-refund cancel/decline branch now releases its slot
// ─────────────────────────────────────────────────────────────────────────────────────────────

test("P2: a paid, slot-bound booking cancelled with NO refund due gives its slot back", async () => {
  const svc = await storage.createProviderService({
    serviceName: `QA2 p2 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const slot = await makeSlot(svc.id, 1, 1);
  const booking = await makeConfirmedSlottedBooking(svc.id, slot);

  assert.equal(await readSlotBookedCount(slot), 1, "the fixture starts with the slot claimed");
  // The exact call POST /api/bookings/:id/cancel's non-refund branch makes: no expectedFromStatuses,
  // no notify — proves the slot release does not depend on the notify param being supplied.
  const result = await storage.updateServiceBookingStatus(booking, "cancelled", "non-refundable policy");
  assert.ok(result);
  assert.equal((await readBooking(booking)).status, "cancelled");
  assert.equal(await readSlotBookedCount(slot), 0, "the slot must come back even though no refund was issued");
});

test("N3: a slot at capacity > 1 releases by exactly one per cancellation, never over- or under-released", async () => {
  const svc = await storage.createProviderService({
    serviceName: `QA2 n3 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const slot = await makeSlot(svc.id, 3, 2); // capacity 3, 2 already booked (this booking + one other)
  const booking = await makeConfirmedSlottedBooking(svc.id, slot);

  const result = await storage.updateServiceBookingStatus(booking, "refunded", "admin refund");
  assert.ok(result);
  assert.equal(await readSlotBookedCount(slot), 1, "exactly one seat comes back, the other booking's seat stays held");

  // Retry (e.g. a second admin refund click / the admin refund rail re-running an idempotent flip):
  // priorStatus is already 'refunded', so isFirstCancellation is false and nothing releases again.
  const retry = await storage.updateServiceBookingStatus(booking, "refunded", "admin refund");
  assert.ok(retry, "an unconditional-guard retry still matches and returns the row");
  assert.equal(await readSlotBookedCount(slot), 1, "a retried refund must not release a second seat");
});
