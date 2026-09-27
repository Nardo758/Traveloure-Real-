/**
 * booking-status-vocabulary.db.test.ts — R154: a plan item reads "Booked" only for a real paid
 * booking (ledger `2026-09-27-booking-status-vocabulary`; decision-maker ruled Sep 27, 2026; extends
 * R145 `2026-09-27-refunded-item-status`; CLAUDE.md LD 44 (e)).
 *
 * THE DEFECT. The plancard assembler attached `activity.booking` for every linked booking that was not
 * CLOSED, and every client surface reads the PRESENCE of `booking` as "Booked". So an item whose
 * checkout was still in flight (`payment_pending`), whose card payment FAILED (the webhook flips
 * `payment_pending → failed` and leaves the item `purchased`), or whose claim the TTL sweep EXPIRED
 * read "Booked" with no confirmation in hand; and a DISPUTED booking read "Booked", telling a traveler
 * who may not have what they paid for that there is nothing to do.
 *
 * Proves against a real database, reading the REAL plancard assembler, then the REAL client readers
 * over the DTO it returns (the same ones the slip, the PlanCard and My Plans render):
 *   S1. payment_pending ⇒ no `booking`; disclosed as `endedBooking`; kind NOT `included`; counts nowhere;
 *       the row reads "Payment processing".
 *   S2. failed ⇒ no `booking`; kind NOT `included`; counted back in checkout; reads "Payment didn't go
 *       through" with the Try again action.
 *   S3. expired ⇒ no `booking`; kind NOT `included`; NO booking line; counts nowhere.
 *   S4. disputed ⇒ `booking` IS attached (a real booking: kind `included`, counted purchased) but the
 *       row's state is `under_review`, never `booked`, with the View booking action.
 *   S5. control — confirmed still reads booked.
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/booking-status-vocabulary.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";

const { db } = await import("../db");
const { sql, eq } = await import("drizzle-orm");
const { trips, users, itineraryItems, serviceBookings, itemTransitionLog } = await import(
  "../../shared/schema"
);
const { assembleTripPlan } = await import("../services/trip-plan.service");
const { itemKind } = await import("../../shared/item-kind");
const { itemBookingState, itemBookingAction, isBookedActivity } = await import(
  "../../client/src/lib/item-booking-state"
);
const { routingCountsFromPlancard } = await import("../../client/src/lib/plan-row-model");

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[booking-status-vocabulary] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId: string;
const createdTrips: string[] = [];
const createdBookings: string[] = [];

/**
 * One trip holding ONE item linked to ONE booking in `status` — the item `purchased` with its
 * `booking_id` stamped, which is where the checkout's authorization leaves it (markItemPurchased) and
 * where a later failed / disputed signal finds it (neither touches the item).
 */
async function seedLinked(status: string, title: string): Promise<{ tripId: string; itemId: string; bookingId: string }> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Booking vocab ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    numberOfTravelers: 2,
  } as any).returning();
  createdTrips.push(t.id);
  const [b] = await db.insert(serviceBookings).values({
    travelerId: userId,
    tripId: t.id,
    totalAmount: "120.00",
    status,
  } as any).returning();
  createdBookings.push(b.id);
  const [it] = await db.insert(itineraryItems).values({
    tripId: t.id,
    title,
    dayNumber: 1,
    origin: "traveler",
    routingStatus: "purchased",
    bookingId: b.id,
    status: "planned",
  } as any).returning();
  return { tripId: t.id, itemId: it.id, bookingId: b.id };
}

async function planOf(tripId: string, itemId: string): Promise<{ plan: any; a: any }> {
  const plan: any = await assembleTripPlan(tripId, "full");
  const all = (plan.days ?? []).flatMap((d: any) => d.activities ?? []);
  const a = all.find((x: any) => x.id === itemId);
  assert.ok(a, "the item is on the assembled plan");
  return { plan, a };
}

/** The kind chip exactly as the client computes it (`ItemKindBadge`, `SlipItemRow`). */
function kindOf(a: any): string {
  return itemKind({
    bookingId: a.booking?.id ?? null,
    providerServiceId: a.providerServiceId ?? null,
    affiliateProductId: a.affiliateProductId ?? null,
  });
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `booking-vocab-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(itemTransitionLog).where(eq(itemTransitionLog.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  for (const b of createdBookings) {
    await db.delete(serviceBookings).where(eq(serviceBookings.id, b)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("S1 payment_pending is NOT booked — it reads 'Payment processing' and counts nowhere", async () => {
  const { tripId, itemId, bookingId } = await seedLinked("payment_pending", `Tea ceremony ${RUN}`);
  const { plan, a } = await planOf(tripId, itemId);
  assert.equal(a.booking, undefined, `a payment in flight must carry no \`booking\` (got ${JSON.stringify(a.booking)})`);
  assert.deepEqual(a.endedBooking && { id: a.endedBooking.id, status: a.endedBooking.status }, { id: bookingId, status: "payment_pending" });
  assert.notEqual(kindOf(a), "included");
  assert.equal(isBookedActivity(a), false);
  assert.equal(itemBookingState(a), "payment_processing");
  assert.equal(itemBookingAction(a), null);
  assert.deepEqual(routingCountsFromPlancard(plan), { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 });
});

test("S2 failed is NOT booked — back to Ready to book, 'Payment didn't go through', Try again", async () => {
  const { tripId, itemId, bookingId } = await seedLinked("failed", `Kaiseki dinner ${RUN}`);
  const { plan, a } = await planOf(tripId, itemId);
  assert.equal(a.booking, undefined, "a failed payment must carry no `booking`");
  assert.equal(a.endedBooking?.id, bookingId);
  assert.equal(a.endedBooking?.status, "failed");
  assert.notEqual(kindOf(a), "included");
  assert.equal(itemBookingState(a), "payment_failed");
  assert.equal(itemBookingAction(a), "retry_checkout");
  assert.deepEqual(routingCountsFromPlancard(plan), { in_planning: 0, with_expert: 0, ready_for_checkout: 1, purchased: 0 });
});

test("S3 expired is NOT booked and draws NO booking line", async () => {
  const { tripId, itemId } = await seedLinked("expired", `Sake tasting ${RUN}`);
  const { plan, a } = await planOf(tripId, itemId);
  assert.equal(a.booking, undefined, "an expired claim must carry no `booking`");
  assert.notEqual(kindOf(a), "included");
  assert.equal(isBookedActivity(a), false);
  assert.equal(itemBookingState(a), null, "no booking line at all");
  assert.equal(itemBookingAction(a), null);
  assert.deepEqual(routingCountsFromPlancard(plan), { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 });
});

test("S4 disputed COUNTS as booked but reads 'Under review', never 'Booked'", async () => {
  const { tripId, itemId, bookingId } = await seedLinked("disputed", `Temple tour ${RUN}`);
  const { plan, a } = await planOf(tripId, itemId);
  assert.equal(a.booking?.id, bookingId, "a disputed booking is a real booking — it stays `booking`");
  assert.equal(a.booking?.status, "disputed");
  assert.equal(a.endedBooking, undefined);
  assert.equal(kindOf(a), "included", "the money reading: it is included");
  assert.equal(isBookedActivity(a), true);
  assert.deepEqual(routingCountsFromPlancard(plan), { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 1 });
  assert.equal(itemBookingState(a), "under_review", "the label reading: Under review");
  assert.notEqual(itemBookingState(a), "booked");
  assert.equal(itemBookingAction(a), "open_booking", "a prominent link to the booking");
});

test("S5 control — confirmed still reads booked", async () => {
  const { tripId, itemId, bookingId } = await seedLinked("confirmed", `Garden walk ${RUN}`);
  const { a } = await planOf(tripId, itemId);
  assert.equal(a.booking?.id, bookingId);
  assert.equal(itemBookingState(a), "booked");
  assert.equal(kindOf(a), "included");
});
