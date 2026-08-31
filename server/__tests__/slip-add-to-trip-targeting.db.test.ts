/**
 * SLIP ADD-TO-TRIP TARGETING — cart-is-slip regression (Trip Card rebuild Phase 3b, row 12;
 * ledger 2026-08-31-manifest-is-the-boundary).
 *
 * The trip page lost its bolt-on "Available Services for Your Trip" grid. Adding a service to a
 * trip is now the /services grid's own job: its Add-to-trip resolves the active trip and posts to
 * the trip-scoped itinerary-items rail (POST /api/trips/:tripId/itinerary-items), carrying the
 * providerServiceId. This guards the server contract that rail depends on:
 *
 *   T1  a service added to trip A via the itinerary-items rail lands on trip A — linked by
 *       providerServiceId — and NOT on trip B (the "lands on THIS trip's slip, not the generic
 *       cart / some other trip" invariant). Proven by a trip-scoped read of each trip's items.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/slip-add-to-trip-targeting.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, providerServices } from "@shared/schema";
import { storage } from "../storage";

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
  if (!ok) throw new Error(`[slip-add-to-trip] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
let tripA: string;
let tripB: string;
let serviceId: string;

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Targeting trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  return t.id;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `slip-target-${RUN}@t.test` } as any).returning();
  userId = u.id;
  tripA = await seedTrip();
  tripB = await seedTrip();
  const [s] = await db.insert(providerServices).values({
    userId,
    serviceName: `Tea ceremony service ${RUN}`,
    price: "95.00",
    status: "active",
    approvalStatus: "approved",
    location: "Kyoto, Japan",
  } as any).returning();
  serviceId = s.id;
});

after(async () => {
  for (const t of [tripA, tripB]) {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${[tripA, tripB]})`).catch(() => {});
  await db.delete(providerServices).where(eq(providerServices.id, serviceId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("T1 a service added to trip A via the itinerary-items rail lands on trip A, not trip B", async () => {
  const TITLE = `Tea ceremony ${RUN}`;

  // The write the /services Add-to-trip → POST /api/trips/:tripId/itinerary-items handler performs
  // for the resolved active trip (server stamps origin='traveler' for the owner; we mirror that).
  await storage.createItineraryItem({
    tripId: tripA,
    title: TITLE,
    itemType: "activity",
    providerServiceId: serviceId,
    dayNumber: 1,
    origin: "traveler",
  } as any);

  const aItems = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripA));
  const bItems = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripB));

  const landed = aItems.find((i) => i.title === TITLE);
  assert.ok(landed, "the added service must land on trip A");
  assert.equal((landed as any).providerServiceId, serviceId, "the plan item stays linked to the provider service");
  assert.equal(bItems.find((i) => i.title === TITLE), undefined, "the service must NOT land on trip B (targeting is trip-scoped)");
});
