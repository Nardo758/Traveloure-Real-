/**
 * TRIP-CARD SNAPSHOT RENDER — Phase 2 proof (ledger 2026-08-31-two-surfaces-one-handoff).
 *
 * Once a trip has a latest final, `assembleTripPlan(tripId, "full")` renders the FROZEN plan (the
 * final's items) joined to LIVE booking status — never the live item set, never a stale blob. A
 * trip with no final renders its live plan (the not-final state). Accepting a suggestion on a
 * finalized trip auto-advances the version (reFinalizeIfCurrentlyFinal).
 *
 * Proven:
 *   R1  after finalize, a NEW live item added afterwards does NOT appear on the card (frozen render);
 *       the snapshot's items do.
 *   R2  buying a snapshot stop after finalize surfaces LIVE booking status (routingStatus=purchased
 *       + the booking row) on the card, while the plan-defining fields stay frozen.
 *   R3  finalVersion is emitted (null before any final → live render; = latest version after).
 *   R4  reFinalizeIfCurrentlyFinal: bumps v+1 on a finalized+changed trip; no-op (null) on a
 *       reopened trip and on a never-finalized trip.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/trip-card-snapshot-render.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, serviceBookings, tripFinals } from "@shared/schema";
import { finalizeTrip, reFinalizeIfCurrentlyFinal } from "../services/trip-finalize.service";
import { assembleTripPlan } from "../services/trip-plan.service";

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
  if (!ok) throw new Error(`[snapshot-render] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
const createdTrips: string[] = [];
let bookingId: string | undefined;

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Snapshot trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

// Items carry coordinates so the not-final render path never triggers external geocoding.
async function addItem(tripId: string, opts: { title: string; dayNumber?: number; origin?: string; routingStatus?: string }): Promise<string> {
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title: opts.title,
    dayNumber: opts.dayNumber ?? 1,
    origin: opts.origin ?? "ai",
    routingStatus: opts.routingStatus ?? "in_planning",
    latitude: "35.0116",
    longitude: "135.7681",
  } as any).returning();
  return it.id;
}

async function assembledTitles(tripId: string): Promise<string[]> {
  const plan: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
  const acts = (plan.days ?? []).flatMap((d: any) => d.activities ?? []);
  return acts.map((a: any) => a.title as string);
}
async function assembledPlan(tripId: string): Promise<any> {
  return assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `snaprender-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  if (bookingId) await db.delete(serviceBookings).where(eq(serviceBookings.id, bookingId)).catch(() => {});
  if (createdTrips.length) await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("R1 finalized card renders the frozen snapshot, not live items added afterward", async () => {
  const tripId = await seedTrip();
  const FROZEN = `Frozen stop ${RUN}`;
  await addItem(tripId, { title: FROZEN });
  await finalizeTrip(tripId, userId);

  // Add a live item AFTER the final — it must not appear on the card.
  const LATER = `Added-after-final ${RUN}`;
  await addItem(tripId, { title: LATER });

  const titles = await assembledTitles(tripId);
  assert.ok(titles.includes(FROZEN), "the frozen snapshot stop renders");
  assert.ok(!titles.includes(LATER), "an item added after Finalize is NOT on the card (frozen render)");
});

test("R2 buying a snapshot stop after finalize surfaces live booking status on the card", async () => {
  const tripId = await seedTrip();
  const STOP = `Payable stop ${RUN}`;
  const itemId = await addItem(tripId, { title: STOP });
  await finalizeTrip(tripId, userId);

  // Purchase it AFTER finalize: the live row flips to purchased + gets a booking_id.
  const [b] = await db.insert(serviceBookings).values({ travelerId: userId, tripId, totalAmount: "120.00", status: "confirmed" } as any).returning();
  bookingId = b.id;
  await db.update(itineraryItems).set({ routingStatus: "purchased", bookingId }).where(eq(itineraryItems.id, itemId));

  const plan = await assembledPlan(tripId);
  const act = (plan.days ?? []).flatMap((d: any) => d.activities ?? []).find((a: any) => a.title === STOP);
  assert.ok(act, "the frozen stop still renders");
  assert.equal(act.routingStatus, "purchased", "LIVE routing status is overlaid onto the frozen item");
  assert.ok(act.booking && act.booking.id === bookingId, "the live booking row is attached");
});

test("R3 finalVersion: null before any final (live render), = latest version after", async () => {
  const tripId = await seedTrip();
  const LIVE = `Live-only stop ${RUN}`;
  await addItem(tripId, { title: LIVE });

  const before = await assembledPlan(tripId);
  assert.equal(before.plancard.trip.finalVersion, null, "no final yet → finalVersion null");
  const beforeTitles = (before.days ?? []).flatMap((d: any) => d.activities ?? []).map((a: any) => a.title);
  assert.ok(beforeTitles.includes(LIVE), "not-final trip renders its live items");

  await finalizeTrip(tripId, userId);
  const after = await assembledPlan(tripId);
  assert.equal(after.plancard.trip.finalVersion, 1, "after Finalize → finalVersion 1");
});

test("R4 reFinalizeIfCurrentlyFinal bumps only a currently-finalized trip", async () => {
  const tripId = await seedTrip();
  const itemId = await addItem(tripId, { title: `Base ${RUN}` });

  // Never finalized → no-op.
  assert.equal(await reFinalizeIfCurrentlyFinal(tripId, userId), null, "never-finalized → null");

  await finalizeTrip(tripId, userId); // v1, finalized
  // Change the plan, then simulate a suggestion-accept re-final while finalized → v2.
  await db.update(itineraryItems).set({ title: `Base — revised ${RUN}` }).where(eq(itineraryItems.id, itemId));
  assert.equal(await reFinalizeIfCurrentlyFinal(tripId, userId), 2, "finalized + changed → v2");

  // Reopen (finalized_at NULL) → a further accept does NOT bump (revision waits for manual re-final).
  await db.update(trips).set({ finalizedAt: null }).where(eq(trips.id, tripId));
  await db.update(itineraryItems).set({ title: `Base — revised again ${RUN}` }).where(eq(itineraryItems.id, itemId));
  assert.equal(await reFinalizeIfCurrentlyFinal(tripId, userId), null, "reopened → null (no auto-bump)");

  const finals = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId));
  assert.equal(finals.length, 2, "still only v1 + v2 — the reopened accept wrote no version");
});
