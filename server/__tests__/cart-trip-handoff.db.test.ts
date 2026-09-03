/**
 * CART TRIP HANDOFF — F-2 regression (slip row-12 CTA → /services?tripId= → listing → Add).
 *
 * Sibling of `slip-add-to-trip-targeting.db.test.ts`, which pins the GRID's rail (the trip-scoped
 * itinerary-items rail). This one pins the CART rail the service-detail page falls back to.
 *
 * SUPERSEDED IN PART, ledger `2026-09-03-slip-convergence` (READ THIS BEFORE TRUSTING THE PROSE
 * BELOW): the reason this suite originally gave for the listing STAYING on the cart rail — that
 * a picked `slotId` and a room's `checkIn`/`checkOut` night range "have no itinerary-item
 * equivalent" — is no longer true. Migration 275 gave `itinerary_items` all three columns and
 * `syncItemProjection` now carries them onto the projected cart row (proven by
 * `slip-stay-projection.db.test.ts`), so with a resolved target trip the listing posts to the
 * PLAN rail like the grid does. What is proven here is still exactly right and still live: it is
 * the TRIP-LESS / guest fallback — the sanctioned path until G2 (ledger row 5) — plus the
 * unchanged guarantee that a cart row born this way is never adopted by the projection. The
 * `tripId` scoping proved by C1/C2 also still applies to that fallback row.
 *
 * The writes below go through `cartProjection.addToCart` — the SINGLE writer of `cart_items` and
 * exactly what the POST /api/cart handler calls — and the reads through `storage.getCartItems`,
 * the same read `POST /api/cart/resolve-trip` uses.
 *
 *   C1  a service added with tripId=A lands on trip A's cart, NOT trip B's (targeting is
 *       trip-scoped, the same invariant T1 proves for the plan rail).
 *   C2  `resolve-trip`'s own reuse selector (`items.find(i => i.tripId)?.tripId`) then resolves
 *       to trip A — so the traveler is never asked to mint a SECOND trip for a browse that was
 *       already scoped to one. This is the actual reported symptom ("Your Cart — General").
 *   C3  the trip-less path is unchanged: an add with no tripId still writes NULL, and the reuse
 *       selector finds nothing (no guessed trip — §13).
 *   C4  the slot/date booking payload the listing carries survives the trip scoping — the reason
 *       this rail stayed on the cart rather than mirroring the grid.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/cart-trip-handoff.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, cartItems, providerServices, vendorAvailabilitySlots } from "@shared/schema";
import { storage } from "../storage";
import * as cartProjection from "../services/cart-projection.service";

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
  if (!ok) throw new Error(`[cart-trip-handoff] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
let tripA: string;
let tripB: string;
let scopedServiceId: string;
let looseServiceId: string;
let slotId: string;

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Cart handoff trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  return t.id;
}

async function seedService(label: string): Promise<string> {
  const [s] = await db.insert(providerServices).values({
    userId,
    serviceName: `${label} ${RUN}`,
    price: "95.00",
    status: "active",
    approvalStatus: "approved",
    location: "Kyoto, Japan",
  } as any).returning();
  return s.id;
}

/** The reuse selector POST /api/cart/resolve-trip step 2 runs over the caller's cart rows. */
function reusedTripId(items: any[]): string | undefined {
  return items.find((i) => i.tripId)?.tripId;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `cart-handoff-${RUN}@t.test` } as any).returning();
  userId = u.id;
  tripA = await seedTrip();
  tripB = await seedTrip();
  scopedServiceId = await seedService("Tea ceremony");
  looseServiceId = await seedService("Loose walking tour");
  const [slot] = await db.insert(vendorAvailabilitySlots).values({
    serviceId: scopedServiceId,
    providerId: userId,
    date: "2026-10-03",
    startTime: "14:30",
    capacity: 4,
    bookedCount: 0,
    status: "available",
  } as any).returning();
  slotId = slot.id;
});

after(async () => {
  await db.delete(cartItems).where(eq(cartItems.userId, userId)).catch(() => {});
  await db.delete(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.serviceId, scopedServiceId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${[tripA, tripB]})`).catch(() => {});
  for (const s of [scopedServiceId, looseServiceId]) {
    await db.delete(providerServices).where(eq(providerServices.id, s)).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("C1 a listing added with tripId=A lands on trip A's cart, not trip B's", async () => {
  // The write POST /api/cart performs for the service-detail add once the page forwards the
  // resolved handoff trip (scheduledDate is the page's optional preferred-date pick).
  const row = await cartProjection.addToCart(userId, {
    serviceId: scopedServiceId,
    quantity: 1,
    tripId: tripA,
    scheduledDate: new Date("2026-10-02T09:00:00.000Z"),
  });

  assert.equal(row.tripId, tripA, "the cart row must carry the trip the traveler browsed for");
  assert.notEqual(row.tripId, tripB, "targeting is trip-scoped — it must not land on another trip");

  const persisted = await db.select().from(cartItems).where(eq(cartItems.id, row.id));
  assert.equal(persisted[0].tripId, tripA, "…and that scoping must be on disk, not just in the return value");
});

test("C2 resolve-trip then REUSES trip A instead of minting a second trip", async () => {
  const items = await storage.getCartItems(userId);
  assert.equal(
    reusedTripId(items),
    tripA,
    "the reported symptom: a trip-less cart made resolve-trip mint a new 'General' trip beside the one the traveler was already planning",
  );
});

test("C3 the trip-less path is unchanged — no tripId in, no trip guessed out", async () => {
  const loose = await cartProjection.addToCart(userId, {
    serviceId: looseServiceId,
    quantity: 1,
  });
  assert.equal(loose.tripId, null, "an add with no target trip must write NULL, never a guessed trip (§13)");

  const looseOnly = (await storage.getCartItems(userId)).filter((i: any) => i.id === loose.id);
  assert.equal(reusedTripId(looseOnly), undefined, "and the reuse selector must find nothing to reuse");
});

test("C4 the listing's slot hold rides ALONGSIDE the trip scope on one row", async () => {
  // Re-add the same service with a picked slot and the slot's server-derived date, exactly as the
  // C3 slot branch of POST /api/cart does. `slotId` + `scheduledDate` + `tripId` coexist on ONE
  // cart row. (Ledger 2026-09-03-slip-convergence: `slotId` DOES now have an itinerary-item
  // equivalent — migration 275 — and the projection carries it, so this is no longer the reason
  // the page uses the cart; it is the trip-less fallback. The hold itself must still survive on
  // this rail: a rail that dropped it would be a silent loss (§13).)
  const when = new Date("2026-10-03T14:30:00.000Z");
  const readded = await cartProjection.addToCart(userId, {
    serviceId: scopedServiceId,
    quantity: 1,
    tripId: tripA,
    slotId,
    scheduledDate: when,
  });
  const [persisted] = await db.select().from(cartItems).where(eq(cartItems.id, readded.id));
  assert.equal(persisted.tripId, tripA, "the trip scope is not disturbed by a slot re-add");
  assert.equal(persisted.slotId, slotId, "the traveler's picked slot is held on the same row");
  assert.equal(
    persisted.scheduledDate?.toISOString(),
    when.toISOString(),
    "and the slot-derived schedule with it",
  );
});
