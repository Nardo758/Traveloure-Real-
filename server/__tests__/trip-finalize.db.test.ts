/**
 * TRIP-FINALIZE — versioned plan snapshot proof (ledger 2026-08-31-two-surfaces-one-handoff).
 *
 * `finalizeTrip(tripId, actorId)` (server/services/trip-finalize.service.ts) freezes the plan into a
 * versioned `trip_finals` row, flips `trips.finalized_at`, and writes the `plan_finalized` diary row
 * — all in one transaction, idempotent by plan fingerprint.
 *
 * Proven:
 *   F1  first finalize → version 1, snapshot captures the items, finalized_at set, one plan_finalized
 *       diary row, finalCreated & flipped both true.
 *   F2  re-finalize an UNCHANGED plan → no new version (still v1), finalCreated=false & flipped=false
 *       (idempotent); still exactly one final row and one diary row.
 *   F3  reopen (clear finalized_at) + edit an item → finalize → version 2, finalCreated & flipped
 *       true; two final rows, two diary rows.
 *   F4  buying a stop (routing_status=purchased + booking_id) is NOT a plan edit → re-finalize writes
 *       NO new version (the fingerprint excludes live booking status) — the money-safety invariant.
 *   F5  two concurrent finalizes on a fresh trip → exactly ONE version-1 row (the row lock + UNIQUE
 *       (trip_id, version) serialize them), both calls resolve, no unhandled collision.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/trip-finalize.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, serviceBookings, tripFinals, itemTransitionLog } from "@shared/schema";
import { finalizeTrip } from "../services/trip-finalize.service";

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
  if (!ok) throw new Error(`[trip-finalize] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Finalize trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  return t.id;
}

async function addItem(tripId: string, opts: { title: string; dayNumber?: number; origin?: string; routingStatus?: string; bookingId?: string }): Promise<string> {
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title: opts.title,
    dayNumber: opts.dayNumber ?? 1,
    origin: opts.origin ?? "ai",
    routingStatus: opts.routingStatus ?? "in_planning",
    bookingId: opts.bookingId ?? null,
  } as any).returning();
  return it.id;
}

async function finalsFor(tripId: string) {
  return db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId));
}
async function finalizedDiaryCount(tripId: string): Promise<number> {
  const rows = await db.select({ id: itemTransitionLog.id })
    .from(itemTransitionLog)
    .where(and(eq(itemTransitionLog.tripId, tripId), eq(itemTransitionLog.eventType, "plan_finalized")));
  return rows.length;
}
async function finalizedAtOf(tripId: string): Promise<Date | null> {
  const [t] = await db.select({ f: trips.finalizedAt }).from(trips).where(eq(trips.id, tripId));
  return (t?.f as Date) ?? null;
}
async function reopen(tripId: string): Promise<void> {
  await db.update(trips).set({ finalizedAt: null }).where(eq(trips.id, tripId));
}

const createdTrips: string[] = [];
let bookingId: string;

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `finalize-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itemTransitionLog).where(eq(itemTransitionLog.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  if (bookingId) await db.delete(serviceBookings).where(eq(serviceBookings.id, bookingId)).catch(() => {});
  if (createdTrips.length) await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("F1 first finalize creates version 1, snapshots items, flips finalized_at, writes one diary row", async () => {
  const tripId = await seedTrip(); createdTrips.push(tripId);
  await addItem(tripId, { title: `Kinkaku-ji ${RUN}`, dayNumber: 1 });
  await addItem(tripId, { title: `Fushimi Inari ${RUN}`, dayNumber: 2 });

  const res = await finalizeTrip(tripId, userId);
  assert.equal(res.version, 1, "first final is version 1");
  assert.equal(res.finalCreated, true, "a new version was written");
  assert.equal(res.flipped, true, "finalized_at flipped NULL→now");
  assert.equal(res.itemCount, 2, "both items captured");

  const finals = await finalsFor(tripId);
  assert.equal(finals.length, 1, "exactly one final row");
  assert.equal(finals[0].version, 1);
  const snap = finals[0].snapshot as any;
  assert.equal(snap.items.length, 2, "snapshot holds both items");
  assert.ok(snap.items.some((i: any) => i.title === `Kinkaku-ji ${RUN}`), "snapshot carries the item titles");
  assert.equal(finals[0].finalizedBy, userId, "actor recorded");
  assert.ok(await finalizedAtOf(tripId), "trip.finalized_at is set");
  assert.equal(await finalizedDiaryCount(tripId), 1, "one plan_finalized diary row");
});

test("F2 re-finalize an unchanged plan writes no new version (idempotent)", async () => {
  const tripId = await seedTrip(); createdTrips.push(tripId);
  await addItem(tripId, { title: `Nishiki ${RUN}`, dayNumber: 1 });

  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.version, 1);
  assert.equal(first.finalCreated, true);

  const again = await finalizeTrip(tripId, userId);
  assert.equal(again.version, 1, "still version 1");
  assert.equal(again.finalCreated, false, "no new version — plan unchanged");
  assert.equal(again.flipped, false, "already finalized — no re-flip");

  assert.equal((await finalsFor(tripId)).length, 1, "still exactly one final row");
  assert.equal(await finalizedDiaryCount(tripId), 1, "still exactly one diary row");
});

test("F3 reopen + edit → finalize creates version 2", async () => {
  const tripId = await seedTrip(); createdTrips.push(tripId);
  const itemId = await addItem(tripId, { title: `Gion ${RUN}`, dayNumber: 1 });

  const v1 = await finalizeTrip(tripId, userId);
  assert.equal(v1.version, 1);

  // Reopen (clears finalized_at, as POST /reopen does) then materially edit the plan.
  await reopen(tripId);
  await db.update(itineraryItems).set({ title: `Gion — evening walk ${RUN}` }).where(eq(itineraryItems.id, itemId));

  const v2 = await finalizeTrip(tripId, userId);
  assert.equal(v2.version, 2, "changed plan after reopen → version 2");
  assert.equal(v2.finalCreated, true);
  assert.equal(v2.flipped, true, "reopen cleared finalized_at so this finalize re-flips");

  const finals = await finalsFor(tripId);
  assert.equal(finals.length, 2, "two final rows");
  assert.equal(await finalizedDiaryCount(tripId), 2, "two plan_finalized diary rows");
});

test("F4 buying a stop is not a plan edit — re-finalize writes no new version", async () => {
  const tripId = await seedTrip(); createdTrips.push(tripId);
  const itemId = await addItem(tripId, { title: `Tea ceremony ${RUN}`, dayNumber: 1 });

  const v1 = await finalizeTrip(tripId, userId);
  assert.equal(v1.version, 1);

  // Purchase the stop: routing_status → purchased + a booking_id (the live money columns the
  // fingerprint deliberately excludes). No reopen — the plan CONTENT is unchanged.
  const [b] = await db.insert(serviceBookings).values({ travelerId: userId, tripId, totalAmount: "88.00", status: "confirmed" } as any).returning();
  bookingId = b.id;
  await db.update(itineraryItems).set({ routingStatus: "purchased", bookingId }).where(eq(itineraryItems.id, itemId));

  const again = await finalizeTrip(tripId, userId);
  assert.equal(again.version, 1, "buying a stop does not fork a version");
  assert.equal(again.finalCreated, false, "fingerprint excludes live booking status");
  assert.equal((await finalsFor(tripId)).length, 1, "still one final row");
});

test("F5 two concurrent finalizes yield exactly one version-1 row", async () => {
  const tripId = await seedTrip(); createdTrips.push(tripId);
  await addItem(tripId, { title: `Arashiyama ${RUN}`, dayNumber: 1 });

  const [a, bRes] = await Promise.all([
    finalizeTrip(tripId, userId),
    finalizeTrip(tripId, userId),
  ]);

  const finals = await finalsFor(tripId);
  assert.equal(finals.length, 1, "the row lock + UNIQUE(trip_id,version) allow exactly one v1");
  assert.equal(finals[0].version, 1);
  assert.deepEqual([a.version, bRes.version].sort(), [1, 1], "both calls resolve to version 1");
  // Exactly one of the two actually created the row.
  assert.equal([a.finalCreated, bRes.finalCreated].filter(Boolean).length, 1, "exactly one writer created the version");
});
