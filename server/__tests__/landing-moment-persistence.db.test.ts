/**
 * landing-moment-persistence.db.test.ts — L3: trips.moment_key is stamped at trip birth.
 *
 * The AI-flow trip-of-record is born in saveGeneratedItinerarySnapshot (content-query.service.ts,
 * the insert(trips) block reached when tripId is absent). A trip born from a landing Moment CTA
 * carries its momentKey; every other path stays NULL. The occasion never touches special_requests
 * (L2). The attribution funnel joins landing_moment_events → trips on moment_key.
 *
 *   K1  valid key present → born trip has moment_key = <key> AND special_requests = the user's text
 *       byte-for-byte (no "Occasion:" prefix).
 *   K2  absent key → moment_key IS NULL.
 *   K3  invalid key → the route returns 400 upstream (isMomentKeyAcceptable), the insert is never
 *       reached (HTTP, against the booted dev server).
 *   K4  funnel join — one landing_moment_events row + K1's trip → the join on moment_key returns
 *       the pair.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/landing-moment-persistence.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, landingMomentEvents } from "@shared/schema";
import { saveGeneratedItinerarySnapshot } from "../services/content-query.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host !== null && !DISPOSABLE.has(host)) {
    throw new Error(`[moment-persistence] REFUSING to write: '${host}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

let userId: string;
const createdTripIds: string[] = [];
const USER_TEXT = "window seat, quiet hotel near the station";

async function bornTrip(momentKey: string | null, specialRequests: string | null): Promise<any> {
  const snap = await saveGeneratedItinerarySnapshot({
    userId,
    tripId: null, // absent ⇒ births a new trip (the trip-of-record)
    trip: {
      title: `Moment trip ${RUN}`,
      destination: "Kyoto, Japan",
      startDate: "2026-10-01",
      endDate: "2026-10-04",
      numberOfTravelers: 2,
      status: "draft",
      eventType: "",
      specialRequests,
      momentKey,
    },
    generatedPlan: { destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-04" },
    canonicalItems: [{ title: `Stop ${RUN}`, description: "", type: "activity", dayNumber: 1, time: "09:00", durationMinutes: 60, location: "Kyoto", estimatedCost: "0" } as any],
    comparison: { destination: "Kyoto, Japan" },
  });
  createdTripIds.push(snap.trip.id);
  return snap.trip;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `mk-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const id of createdTripIds) {
    await db.delete(landingMomentEvents).where(eq(landingMomentEvents.momentKey, "proposal")).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM landing_moment_events WHERE guest_session_id = ${`sess-${RUN}`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`).catch(() => {});
});

test("K1 valid momentKey → stamped; special_requests is the user's text with no occasion", async () => {
  const trip = await bornTrip("proposal", USER_TEXT);
  const [row] = await db.select({ momentKey: trips.momentKey, sr: trips.specialRequests }).from(trips).where(eq(trips.id, trip.id));
  assert.equal(row.momentKey, "proposal", "the born trip carries moment_key = the moment CTA's key");
  assert.equal(row.sr, USER_TEXT, "special_requests is the user's text byte-for-byte");
  assert.ok(!(row.sr ?? "").includes("Occasion:"), "no occasion prefix leaked into the persisted column (L2)");
});

test("K2 absent momentKey → moment_key IS NULL", async () => {
  const trip = await bornTrip(null, null);
  const [row] = await db.select({ momentKey: trips.momentKey }).from(trips).where(eq(trips.id, trip.id));
  assert.equal(row.momentKey, null, "a non-moment trip has NULL moment_key");
});

test("K3 invalid momentKey → 400 upstream, the insert is never reached", async () => {
  // Register a traveler and POST with a forged key; the route rejects it before any trip is made.
  const email = `mk-http-${RUN}@t.test`;
  const reg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPass123!", firstName: "MK", lastName: "Test", userType: "user" }),
  });
  assert.equal(reg.status, 201, `register: ${await reg.text()}`);
  const cookie = (reg.headers.get("set-cookie") ?? "").split(";")[0];
  const res = await fetch(`${BASE_URL}/api/ai/generate-itinerary`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ momentKey: "not_a_moment", destination: "Kyoto, Japan", dates: { start: "2026-10-01", end: "2026-10-04" }, travelers: 2 }),
  });
  assert.equal(res.status, 400, "a present-but-invalid momentKey is rejected with 400");
  await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
});

test("K4 attribution funnel: landing_moment_events joins trips on moment_key", async () => {
  const trip = await bornTrip("proposal", USER_TEXT);
  await db.insert(landingMomentEvents).values({ momentKey: "proposal", kind: "cta", position: 0, guestSessionId: `sess-${RUN}` });
  const joined = await db.execute(sql`
    SELECT e.id AS event_id, t.id AS trip_id, t.moment_key
    FROM landing_moment_events e
    JOIN trips t ON t.moment_key = e.moment_key
    WHERE t.id = ${trip.id} AND e.guest_session_id = ${`sess-${RUN}`}
  `);
  const rows = (joined.rows ?? []) as any[];
  assert.ok(rows.length >= 1, "the funnel join returns the event↔trip pair on the shared moment_key");
  assert.equal(rows[0].moment_key, "proposal", "joined on the moment key");
});
