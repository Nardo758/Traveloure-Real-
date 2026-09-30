/**
 * SLIP CONVERGENCE — the projected cart row is EQUIVALENT to the cart-direct row it replaces.
 * Ledger `2026-09-03-slip-convergence`, migration 275.
 *
 * WHAT THIS LANE CHANGED, AND WHAT THEREFORE HAS TO BE PROVEN.
 * The slip is stationary: every traveler surface is a VIEW of `itinerary_items` and the cart is
 * the `ready_for_checkout` PROJECTION of it (docs/briefs/SLIP_EXPERIENCE_DISPATCH.md §0,
 * server/services/cart-projection.service.ts). Three surfaces wrote STRAIGHT to /api/cart,
 * minting rows with `itinerary_item_id IS NULL` — rows `syncItemProjection` is permanently blind
 * to — so those items never reached the traveler's own plan. They now post to the itinerary rail
 * and carry their booking inputs on migration 275's `slot_id` / `check_in` / `check_out`.
 *
 * The ONLY way that repoint is safe is if the row the PROJECTION builds is indistinguishable, to
 * the money path, from the row the direct add used to build. `getRoomNights()`
 * (server/routes/payments.routes.ts) is the exact predicate that decides whether a cart line is a
 * stay and how many nights it is charged for — every stay-money surface funnels through it
 * (`resolveStayNightlyRates`, `resolveItemBaseAmount`, the checkout charge loop, the fee
 * preview). So the equivalence is asserted by running the REAL `getRoomNights` over BOTH rows,
 * not by comparing our own idea of the shape. If that predicate ever moves, this test fails
 * rather than the projection silently drifting away from it (§18 rule 1's failure mode, pinned).
 *
 * NEGATIVES FIRST, per house convention:
 *   N1  a NON-per-night service never gets a stay: an item carrying check_in/check_out on an
 *       hourly listing projects `contentMeta = {}` and `getRoomNights` returns null. The pricing
 *       unit is read from the LISTING row, never from the item and never from a request (§14) —
 *       a stay is a property of what is being sold, not of what was typed.
 *   N2  an unparseable range writes NOTHING — no partial meta, no guessed second date. Proven on
 *       the three ways a range fails `getRoomNights`: inverted (checkOut <= checkIn), half-given
 *       (check_in only), and over the 30-night ceiling. §13: an item with a broken range renders
 *       as "no stay dates", never as a fabricated one-night stay.
 *   N3  the cart-direct row stays INVISIBLE to the projection. The NULL-keyed row seeded for the
 *       equivalence proof is byte-unchanged after two syncs of an unrelated item, and is never
 *       adopted (its `itinerary_item_id` stays NULL). That blindness is the whole compatibility
 *       story for the pre-existing cart consumers and this lane does not weaken it.
 *
 * POSITIVES:
 *   P1  EQUIVALENCE — for the same per-night listing and the same night range, `getRoomNights`
 *       returns the IDENTICAL {checkIn, checkOut, nights} for the projected row and for the
 *       cart-direct row, and the two `contentMeta` objects are deep-equal.
 *   P2  IDEMPOTENCY — syncing the same item twice leaves exactly ONE projection row, with the
 *       dates and the slot intact (the second sync is an UPDATE with the same values, not a
 *       second row and not a wipe).
 *   P3  the picked slot rides the projection: `cart_items.slot_id` equals the item's `slot_id`.
 *       INTENT only — this test asserts the slot is CARRIED, and asserts the slot's
 *       `booked_count` is STILL ZERO afterwards: the capacity claim belongs to checkout's atomic
 *       `storage.bookSlot` (§15) and must not happen at add/projection time.
 *   P4  leaving `ready_for_checkout` deletes the projection row — the dates and slot go with it,
 *       so a de-routed stay cannot linger in the cart as a chargeable line.
 *
 * DISPOSABLE DB ONLY. Serialize:
 *   npx tsx --test --test-concurrency=1 server/__tests__/slip-stay-projection.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import {
  cartItems,
  itineraryItems,
  providerServices,
  trips,
  users,
  vendorAvailabilitySlots,
} from "@shared/schema";
import { storage } from "../storage";
import * as cartProjection from "../services/cart-projection.service";
// The REAL money-path predicate. Imported (not re-implemented) on purpose — see the header.
import { getRoomNights } from "../routes/payments.routes";

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
  if (!ok) throw new Error(`[slip-stay-projection] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
let tripId: string;
let roomServiceId: string;
let hourlyServiceId: string;
let slotId: string;

/** Far enough out that the range never trips a "checkIn must be today or later" style rule. */
const CHECK_IN = "2027-04-10";
const CHECK_OUT = "2027-04-13"; // 3 nights

async function seedService(label: string, pricingUnit: string | null): Promise<string> {
  const [s] = await db.insert(providerServices).values({
    userId,
    serviceName: `${label} ${RUN}`,
    price: "180.00",
    status: "active",
    approvalStatus: "approved",
    location: "Kyoto, Japan",
    ...(pricingUnit ? { pricingUnit } : {}),
  } as any).returning();
  return s.id;
}

/**
 * One plan item in `ready_for_checkout`, exactly as the repointed marketplace surfaces create it
 * (the route stamps `origin` server-side; irrelevant here, so it is written directly).
 */
async function seedItem(fields: Record<string, unknown>): Promise<string> {
  const [i] = await db.insert(itineraryItems).values({
    tripId,
    title: `Stay ${RUN}`,
    itemType: "accommodation",
    dayNumber: 1,
    routingStatus: "ready_for_checkout",
    origin: "traveler",
    ...fields,
  } as any).returning();
  return i.id;
}

/** Read one enriched cart row (the `service` join `getRoomNights` reads `pricingUnit` from). */
async function enrichedRow(cartItemId: string): Promise<any> {
  const rows = await storage.getCartItems(userId);
  const row = rows.find((r: any) => r.id === cartItemId);
  assert.ok(row, `cart row ${cartItemId} not found in the enriched read`);
  return row;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `slip-stay-${RUN}@t.test` } as any).returning();
  userId = u.id;
  const [t] = await db.insert(trips).values({
    userId,
    title: `Slip stay trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2027-04-10",
    endDate: "2027-04-13",
    numberOfTravelers: 2,
  } as any).returning();
  tripId = t.id;
  roomServiceId = await seedService("Machiya room", "per_night");
  hourlyServiceId = await seedService("Tea ceremony", null);
  const [slot] = await db.insert(vendorAvailabilitySlots).values({
    serviceId: roomServiceId,
    providerId: userId,
    date: CHECK_IN,
    startTime: "15:00",
    capacity: 2,
    bookedCount: 0,
    status: "available",
  } as any).returning();
  slotId = slot.id;
});

after(async () => {
  await db.delete(cartItems).where(eq(cartItems.userId, userId)).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`).catch(() => {});
  await db.delete(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.serviceId, roomServiceId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  for (const s of [roomServiceId, hourlyServiceId]) {
    await db.delete(providerServices).where(eq(providerServices.id, s)).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("P1 a projected stay is equivalent to the cart-direct row it replaces (same getRoomNights output)", async () => {
  // (a) THE OLD RAIL — exactly what POST /api/cart writes for the service-detail room add:
  // serviceId + contentMeta {checkIn, checkOut} (ledger 107/108 S11's "smallest existing
  // carrier"), through the module that is the single writer of cart_items.
  const direct = await cartProjection.addToCart(userId, {
    serviceId: roomServiceId,
    contentMeta: { checkIn: CHECK_IN, checkOut: CHECK_OUT },
    quantity: 1,
  } as any);

  // (b) THE NEW RAIL — the same stay as a plan item carrying the migration-275 columns, routed
  // to checkout and projected.
  const itemId = await seedItem({
    providerServiceId: roomServiceId,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
  });
  const result = await cartProjection.syncItemProjection(itemId);
  assert.equal(result.action, "upserted");

  const [projected] = await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId));
  assert.ok(projected, "the projection row was not created");

  // The carrier itself is identical…
  assert.deepEqual(projected.contentMeta, { checkIn: CHECK_IN, checkOut: CHECK_OUT });
  assert.deepEqual(projected.contentMeta, (await enrichedRow(direct.id)).contentMeta);

  // …and, the load-bearing part, the REAL money-path predicate reads them the same way.
  const directNights = getRoomNights(await enrichedRow(direct.id));
  const projectedNights = getRoomNights(await enrichedRow(projected.id));
  assert.deepEqual(projectedNights, { checkIn: CHECK_IN, checkOut: CHECK_OUT, nights: 3 });
  assert.deepEqual(projectedNights, directNights);

  // N3: the NULL-keyed direct row was never adopted or rewritten by the sync.
  const [directAfter] = await db.select().from(cartItems).where(eq(cartItems.id, direct.id));
  assert.equal(directAfter.itineraryItemId, null);
  assert.deepEqual(directAfter.contentMeta, { checkIn: CHECK_IN, checkOut: CHECK_OUT });
});

test("P2/P3 idempotent: a second sync keeps ONE row, with the dates and the slot intact — and claims no capacity", async () => {
  const itemId = await seedItem({
    providerServiceId: roomServiceId,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    slotId,
  });

  const first = await cartProjection.syncItemProjection(itemId);
  assert.equal(first.action, "upserted");
  const second = await cartProjection.syncItemProjection(itemId);
  assert.equal(second.action, "upserted");
  assert.equal(
    (first as any).cartItemId,
    (second as any).cartItemId,
    "the second sync must UPDATE the same row, never insert a second one",
  );

  const rows = await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId));
  assert.equal(rows.length, 1, "exactly one projection row per item");
  assert.deepEqual(rows[0].contentMeta, { checkIn: CHECK_IN, checkOut: CHECK_OUT });
  assert.equal(rows[0].slotId, slotId, "the picked slot must ride the projection");
  assert.deepEqual(getRoomNights(await enrichedRow(rows[0].id)), {
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    nights: 3,
  });

  // §15: the slot is an INTENT marker on both rails. Projecting is not claiming — the atomic
  // `storage.bookSlot` at checkout is the only thing that may move booked_count.
  const [slotAfter] = await db
    .select()
    .from(vendorAvailabilitySlots)
    .where(eq(vendorAvailabilitySlots.id, slotId));
  assert.equal(slotAfter.bookedCount ?? 0, 0, "projection must never claim capacity");
});

test("N1 a non-per-night listing never becomes a stay, whatever dates the item carries", async () => {
  const itemId = await seedItem({
    providerServiceId: hourlyServiceId,
    itemType: "activity",
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
  });
  await cartProjection.syncItemProjection(itemId);

  const [projected] = await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId));
  assert.deepEqual(projected.contentMeta, {}, "a non-stay listing keeps today's empty contentMeta");
  assert.equal(getRoomNights(await enrichedRow(projected.id)), null);
});

test("N2 an unparseable range writes NOTHING — no partial meta, no guessed date", async () => {
  const broken: Array<[string, Record<string, unknown>]> = [
    ["inverted range", { checkIn: CHECK_OUT, checkOut: CHECK_IN }],
    ["half-given range", { checkIn: CHECK_IN }],
    ["over the 30-night ceiling", { checkIn: "2027-04-10", checkOut: "2027-06-30" }],
  ];
  for (const [label, dates] of broken) {
    const itemId = await seedItem({ providerServiceId: roomServiceId, ...dates });
    await cartProjection.syncItemProjection(itemId);
    const [projected] = await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId));
    assert.deepEqual(projected.contentMeta, {}, `${label}: must project no stay meta at all`);
    assert.equal(getRoomNights(await enrichedRow(projected.id)), null, `${label}: not a stay`);
  }
});

test("P4 leaving ready_for_checkout deletes the projection — the dates and slot go with it", async () => {
  const itemId = await seedItem({
    providerServiceId: roomServiceId,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    slotId,
  });
  await cartProjection.syncItemProjection(itemId);
  assert.equal(
    (await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId))).length,
    1,
  );

  await db.update(itineraryItems).set({ routingStatus: "in_planning" }).where(eq(itineraryItems.id, itemId));
  const result = await cartProjection.syncItemProjection(itemId);
  assert.equal(result.action, "deleted");
  assert.equal(
    (await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId))).length,
    0,
    "a de-routed stay must not linger in the cart as a chargeable line",
  );
});
