/**
 * refunded-item-status.db.test.ts — R145: a refunded or cancelled item never reads "Booked"
 * (ledger `2026-09-27-refunded-item-status`; decision-maker ruled Sep 27, 2026).
 *
 * THE DEFECT. A refund reverts the plan item `purchased → in_planning` through
 * `revertPurchasedItemsForBooking` and — deliberately (§13, it is the honest history) — KEEPS
 * `itinerary_items.booking_id`. The plancard assembler attached `activity.booking` for a linked
 * booking of ANY status, and every client surface reads the PRESENCE of `booking` as the booked
 * state (ROUTING_STATE_CONTRACT §2; `RoutingBadge`, the slip's `isPurchasedRow`, the kind chip's
 * rule 1). So a refunded item still rendered "Booked" / "included". A non-refundable traveler
 * cancel sets the booking `cancelled` WITHOUT reverting the item, which read "Booked" too.
 *
 * Proves against a real database, driving the REAL write paths (the refund's revert edge and the
 * storage writer's guarded cancel) and reading the REAL plancard assembler:
 *   R1. refunded + reverted ⇒ no `booking`, routingStatus `in_planning`, kind chip NOT `included`,
 *       and the ended booking is disclosed as `refunded` (§13 — say what happened); `booking_id`
 *       stays on the row (history kept, no write-path change).
 *   R2. non-refundable cancel (item left `purchased`) ⇒ no `booking`, the ended booking is
 *       disclosed as `cancelled`, kind chip NOT `included`.
 *   R3. control — a CONFIRMED booking still attaches `booking` (status confirmed, kind `included`)
 *       and carries no `endedBooking`.
 *   R4. `plan.bookings` still lists the refunded booking with its real status (the D9 record).
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/refunded-item-status.db.test.ts
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
const { storage } = await import("../storage");
const { assembleTripPlan } = await import("../services/trip-plan.service");
const { revertPurchasedItemsForBooking } = await import("../services/item-routing.service");
const { BOOKING_CANCELLABLE_FROM_STATUSES } = await import("../../shared/booking-cancellation");
const { itemKind } = await import("../../shared/item-kind");

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
      `[refunded-item-status] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId: string;
const createdTrips: string[] = [];
const createdBookings: string[] = [];

/** One trip holding ONE purchased item bought through ONE booking — the checkout's end state. */
async function seedPurchased(title: string): Promise<{ tripId: string; itemId: string; bookingId: string }> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Refund status ${RUN}`,
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
    status: "confirmed",
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

async function activityOf(tripId: string, itemId: string): Promise<any> {
  const plan: any = await assembleTripPlan(tripId, "full");
  const all = (plan.days ?? []).flatMap((d: any) => d.activities ?? []);
  const a = all.find((x: any) => x.id === itemId);
  assert.ok(a, "the item is on the assembled plan");
  return { plan, a };
}

/** The kind chip exactly as the client computes it (`ItemKindBadge` on the Trip Card). */
function kindOf(a: any): string {
  return itemKind({
    bookingId: a.booking?.id ?? null,
    providerServiceId: a.providerServiceId ?? null,
    affiliateProductId: a.affiliateProductId ?? null,
  });
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `refund-status-${RUN}@t.test` } as any).returning();
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

test("R1 a REFUNDED + reverted item is not presented as booked, and says it was refunded", async () => {
  const { tripId, itemId, bookingId } = await seedPurchased(`Tea ceremony ${RUN}`);

  // The refund's own status flip (refundServiceBooking's atomic claim lands `refunded`), then the
  // REAL revert edge both refund callers run after a successful refund.
  await db.update(serviceBookings).set({ status: "refunded" } as any).where(eq(serviceBookings.id, bookingId));
  const { reverted } = await revertPurchasedItemsForBooking(bookingId);
  assert.equal(reverted, 1, "the revert edge flipped the item");

  const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.equal(row.routingStatus, "in_planning");
  assert.equal(row.bookingId, bookingId, "booking_id is KEPT — the honest history (no write-path change)");

  const { a } = await activityOf(tripId, itemId);
  assert.equal(a.routingStatus, "in_planning");
  assert.equal(a.booking, undefined, `a refunded item must carry no \`booking\` (got ${JSON.stringify(a.booking)})`);
  assert.notEqual(kindOf(a), "included", "the kind chip must not read `included` for a refunded item");
  assert.deepEqual(
    a.endedBooking && { id: a.endedBooking.id, status: a.endedBooking.status },
    { id: bookingId, status: "refunded" },
    "the ended booking is disclosed with its real status (§13)",
  );
});

test("R2 a non-refundable CANCEL (item left purchased) is not presented as booked", async () => {
  const { tripId, itemId, bookingId } = await seedPurchased(`Kaiseki dinner ${RUN}`);

  // The routes.ts no-refund branch: the guarded storage writer, no item revert.
  const updated = await storage.updateServiceBookingStatus(
    bookingId,
    "cancelled",
    "changed plans",
    BOOKING_CANCELLABLE_FROM_STATUSES as unknown as string[],
  );
  assert.ok(updated, "the guarded cancel landed");

  const { a } = await activityOf(tripId, itemId);
  assert.equal(a.routingStatus, "purchased", "the no-refund branch leaves the item's routing untouched");
  assert.equal(a.booking, undefined, "a cancelled booking is not attached as `booking`");
  assert.notEqual(kindOf(a), "included");
  assert.equal(a.endedBooking?.status, "cancelled", "the cancellation is disclosed (§13)");
});

test("R3 control — a CONFIRMED booking still reads booked", async () => {
  const { tripId, itemId, bookingId } = await seedPurchased(`Temple tour ${RUN}`);
  const { a } = await activityOf(tripId, itemId);
  assert.equal(a.booking?.id, bookingId);
  assert.equal(a.booking?.status, "confirmed");
  assert.equal(kindOf(a), "included");
  assert.equal(a.endedBooking, undefined);
});

test("R4 plan.bookings keeps the refunded booking with its real status", async () => {
  const { tripId, bookingId } = await seedPurchased(`Sake tasting ${RUN}`);
  await db.update(serviceBookings).set({ status: "refunded" } as any).where(eq(serviceBookings.id, bookingId));
  await revertPurchasedItemsForBooking(bookingId);
  const plan: any = await assembleTripPlan(tripId, "full");
  const b = (plan.bookings ?? []).find((x: any) => x.id === bookingId);
  assert.equal(b?.status, "refunded", "the record keeps the refunded row and says refunded");
});
