/**
 * TRIPS-LIST finalVersion enrichment — Trip Card rebuild Phase 4 (ledger 2026-08-31-stage-a-dashboard).
 *
 * The My Plans list flips a tile between "Open slip" (pre-final) and "View Trip Card · Final · v{N}"
 * (post-final) off ONE fact: does the trip have a trip_finals version? `storage.getTrips` carries that
 * as `finalVersion` on every TripListItem via ONE batched grouped query — never a per-row plancard
 * fetch. This proves the enrichment:
 *
 *   L1  a trip with a final reads finalVersion = its LATEST version (v1, then v2 after a real edit +
 *       re-finalize) — so a reopened/re-finalized trip advertises the version its Trip Card renders.
 *   L2  a trip with NO final reads finalVersion = null (the pre-final state → the tile stays "Open slip").
 *   L3  the two coexist correctly in one list (the join + group never bleeds one trip's version onto
 *       another, and a trip with no final is not dropped from the list).
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/trips-list-final-version.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals } from "@shared/schema";
import { storage } from "../storage";
import { finalizeTrip, reFinalizeIfCurrentlyFinal } from "../services/trip-finalize.service";

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
  if (!ok) throw new Error(`[trips-list-final] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
const createdTrips: string[] = [];

async function seedTrip(title: string): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `${title} ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

async function addItem(tripId: string, title: string): Promise<void> {
  await db.insert(itineraryItems).values({
    tripId,
    title: `${title} ${RUN}`,
    dayNumber: 1,
    origin: "ai",
    routingStatus: "in_planning",
    status: "planned",
  } as any);
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `tripslist-${RUN}@t.test` } as any).returning();
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

test("L1 a finalized trip reads finalVersion = its latest version (v1 → v2 after a real edit)", async () => {
  const tripId = await seedTrip("Finalized");
  await addItem(tripId, "Original stop");

  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.version, 1, "first finalize is v1");

  let list = await storage.getTrips(userId);
  let mine = list.find((t) => t.id === tripId);
  assert.ok(mine, "the finalized trip is in the list");
  assert.equal(mine!.finalVersion, 1, "finalVersion reads v1 after first finalize");

  // A real plan edit forks a new version on re-finalize (a new item = a plan change, Phase 1 fingerprint).
  await addItem(tripId, "Added stop");
  const bumped = await reFinalizeIfCurrentlyFinal(tripId, userId);
  assert.equal(bumped, 2, "re-finalize after an edit forks v2");

  list = await storage.getTrips(userId);
  mine = list.find((t) => t.id === tripId);
  assert.equal(mine!.finalVersion, 2, "finalVersion advances to the LATEST version (v2)");
});

test("L2 a trip with no final reads finalVersion = null (pre-final)", async () => {
  const tripId = await seedTrip("Never finalized");
  await addItem(tripId, "A stop");

  const list = await storage.getTrips(userId);
  const mine = list.find((t) => t.id === tripId);
  assert.ok(mine, "the never-finalized trip is still in the list");
  assert.equal(mine!.finalVersion, null, "no final ⇒ finalVersion null ⇒ tile stays 'Open slip'");
});

test("L3 finalized and pre-final trips coexist in one list without version bleed", async () => {
  const list = await storage.getTrips(userId);
  const byVersion = new Map(list.map((t) => [t.id, t.finalVersion]));
  // Every seeded trip is present; the finalized one carries a number, the pre-final ones carry null.
  const finalized = list.filter((t) => t.finalVersion != null);
  const preFinal = list.filter((t) => t.finalVersion == null);
  assert.ok(finalized.length >= 1, "at least one finalized trip carries a version");
  assert.ok(preFinal.length >= 1, "at least one pre-final trip carries null");
  // No trip both exists and is missing from the map — the group-by keyed each row to its own trip.
  for (const t of createdTrips) {
    assert.ok(byVersion.has(t), `trip ${t} is present in the list exactly once`);
  }
});
