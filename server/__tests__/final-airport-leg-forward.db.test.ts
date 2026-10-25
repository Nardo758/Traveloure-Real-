/**
 * Row 185 J6 — the Trip Card read forwards `finalAirportLeg` off the frozen snapshot.
 * Owner + `render: "final"` only. No new query: the value is the final already loaded.
 *
 *   F1  a new final, read as the owner with render final, carries finalAirportLeg
 *   F2  the same final read as a non-owner, or with no role and a different viewer, omits it
 *   F3  render live omits it even for the owner
 *   F4  a final written before the keys existed omits it for the owner
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/final-airport-leg-forward.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals, itemTransitionLog } from "@shared/schema";
import { finalizeTrip } from "../services/trip-finalize.service";
import { assembleTripPlan } from "../services/trip-plan.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `j6f-${RUN}-${s}`;

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
  if (!ok) throw new Error(`[final-airport-forward] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
const createdTrips: string[] = [];

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Forward ${RUN}`,
    destination: `Fwd${RUN}, Testland`,
    startDate: "2027-06-01",
    endDate: "2027-06-04",
    numberOfTravelers: 2,
    adults: 2,
    timezone: "Asia/Tokyo",
  } as any).returning();
  createdTrips.push(t.id);
  await db.insert(itineraryItems).values({
    tripId: t.id,
    title: `Stop ${RUN}`,
    dayNumber: 1,
    origin: "traveler",
    latitude: "35.0116",
    longitude: "135.7681",
  } as any);
  return t.id;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `airport-fwd-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.execute(sql`DELETE FROM temporal_anchors WHERE trip_id = ${t}`).catch(() => {});
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itemTransitionLog).where(eq(itemTransitionLog.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  if (createdTrips.length) await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  if (userId) await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("F1–F3 the owner final read carries finalAirportLeg; a non-owner and the live render do not", async () => {
  const tripId = await seedTrip();
  await db.execute(sql`
    INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location, description)
    VALUES (${id("arr")}, ${tripId}, 'flight_arrival', ${"2026-11-11 14:30:00"}::timestamp, 'KIX', 'NH 123')
  `);
  await finalizeTrip(tripId, userId);

  const owner: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId, render: "final" });
  assert.deepEqual(owner.plancard.finalAirportLeg, {
    flightArrival: { time: "14:30", airport: "KIX", description: "NH 123", airportLegMinutes: null },
    flightDeparture: null,
    platformCarFits: false,
  });

  const byUser: any = await assembleTripPlan(tripId, "full", { viewerId: userId, render: "final" });
  assert.deepEqual(byUser.plancard.finalAirportLeg.flightArrival.airport, "KIX", "the trip's own user is the owner when no role was passed");

  const expert: any = await assembleTripPlan(tripId, "full", { tripRole: "expert", viewerId: id("expert"), render: "final" });
  assert.equal("finalAirportLeg" in expert.plancard, false);

  const stranger: any = await assembleTripPlan(tripId, "full", { viewerId: id("stranger"), render: "final" });
  assert.equal("finalAirportLeg" in stranger.plancard, false, "a different viewer with no role is not the owner");

  const delegate: any = await assembleTripPlan(tripId, "full", { tripRole: "delegate", viewerId: userId, render: "final" });
  assert.equal("finalAirportLeg" in delegate.plancard, false, "a delegate is not the owner, even when the viewer id is the trip user's");

  const live: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId, render: "live" });
  assert.equal("finalAirportLeg" in live.plancard, false);
  const defaultRender: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
  assert.equal("finalAirportLeg" in defaultRender.plancard, false, "live is the default");
});

test("F4 a final written before the keys existed has no finalAirportLeg", async () => {
  const tripId = await seedTrip();
  await db.execute(sql`
    INSERT INTO trip_finals (id, trip_id, version, snapshot, content_hash, finalized_by)
    VALUES (
      ${id("old")}, ${tripId}, 1,
      ${JSON.stringify({ trip: { id: tripId }, items: [], card: { days: [], builtFrom: null, photos: {} } })}::jsonb,
      ${"ab".repeat(32)},
      ${userId}
    )
  `);
  const plan: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId, render: "final" });
  assert.equal(plan.plancard.trip.finalVersion, 1);
  assert.equal("finalAirportLeg" in plan.plancard, false);
});
