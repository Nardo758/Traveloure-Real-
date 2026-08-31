/**
 * MID-TRIP PURCHASE VERSIONS — Phase 4 rider proof (ledger 2026-08-31-mid-trip-purchase-versions).
 *
 * The two-surfaces model's last semantic gap: a service bought mid-trip via Explore → Book now
 * writes a NEW confirmed item onto the trip (the affiliate-booking-agent confirm path,
 * content.routes.ts). On a FINALIZED trip that new item must join the frozen Trip Card — the
 * traveler buying IS the acceptance, exactly like accepting a suggestion — so purchase completion
 * calls reFinalizeIfCurrentlyFinal and the card advances to v+1. A booking STATUS change on an
 * item already in the snapshot is NOT a new item: the finalize fingerprint excludes booking status
 * (Phase 1), so it stays a live overlay and never forks a version.
 *
 * Proven:
 *   M1  buy a NEW service on a finalized trip → v+1, and the new final's snapshot INCLUDES it.
 *   M2  a booking STATUS change on an existing snapshot item → reFinalize is a no-op (null): the
 *       fingerprint ignores routing_status/booking_id, so no spurious version.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/mid-trip-purchase-versions.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals } from "@shared/schema";
import { finalizeTrip, reFinalizeIfCurrentlyFinal, getLatestTripFinal } from "../services/trip-finalize.service";

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
  if (!ok) throw new Error(`[mid-trip-purchase] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
const createdTrips: string[] = [];

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Mid-trip buy ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

async function addItem(tripId: string, opts: { title: string; routingStatus?: string; bookingId?: string; status?: string }): Promise<string> {
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title: opts.title,
    dayNumber: 1,
    origin: "ai",
    routingStatus: opts.routingStatus ?? "in_planning",
    bookingId: opts.bookingId ?? null,
    status: opts.status ?? "planned",
  } as any).returning();
  return it.id;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `midtrip-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("M1 buying a NEW service on a finalized trip bumps v+1 and the snapshot includes it", async () => {
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Original stop ${RUN}` });

  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.finalCreated, true, "first finalize creates v1");
  assert.equal(first.version, 1);

  // The affiliate-booking-agent confirm writes a NEW confirmed item (content.routes.ts). Mirror it.
  const NEW_TITLE = `Booked tea ceremony ${RUN}`;
  await addItem(tripId, { title: NEW_TITLE, routingStatus: "in_planning", status: "confirmed" });

  const bumped = await reFinalizeIfCurrentlyFinal(tripId, userId);
  assert.equal(bumped, 2, "a new booked item on a finalized trip forks v2");

  const latest = await getLatestTripFinal(tripId);
  assert.ok(latest, "there is a latest final");
  const titles = new Set((latest!.snapshot as any).items.map((i: any) => i.title));
  assert.ok(titles.has(NEW_TITLE), "the v2 snapshot includes the newly-bought item");
  assert.ok(titles.has(`Original stop ${RUN}`), "the original stop is still in the snapshot");
});

test("M2 a booking STATUS change on an existing snapshot item forks NO version", async () => {
  const tripId = await seedTrip();
  const itemId = await addItem(tripId, { title: `Stop to buy ${RUN}`, routingStatus: "in_planning" });

  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.version, 1, "finalize v1 with the stop frozen in");

  // Buying an item ALREADY in the plan flips its live booking status — the cart-checkout promote
  // path (markItemPurchased) does exactly this and creates no new item. The fingerprint excludes
  // booking status, so a re-finalize must be a no-op.
  // Flip the fingerprint-EXCLUDED booking-status fields (routing_status / booking_status). booking_id
  // is a real FK, so this test asserts the status-change semantics without minting a booking row —
  // the fingerprint ignores all of these fields identically (Phase 1).
  await db.update(itineraryItems)
    .set({ routingStatus: "purchased", bookingStatus: "confirmed" } as any)
    .where(eq(itineraryItems.id, itemId));

  const bumped = await reFinalizeIfCurrentlyFinal(tripId, userId);
  assert.equal(bumped, null, "a booking-status-only change never forks a version (fingerprint excludes it)");

  const finalsCount = await db.select({ n: sql<number>`count(*)::int` }).from(tripFinals).where(eq(tripFinals.tripId, tripId));
  assert.equal(finalsCount[0].n, 1, "still exactly one final version");
});
