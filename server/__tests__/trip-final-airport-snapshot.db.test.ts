/**
 * Row 185 J6 — Make final freezes flight anchors and the airport leg into trip_finals.snapshot.
 *
 *   A1  both flight types: wall-clock HH:MM, trimmed airport, blank location and description are null
 *   A2  two arrivals: earlier anchor_datetime wins; the same datetime, the lower id wins
 *   A3  no flight anchors: anchors is present with both directions null, airportLeg is absent
 *   A4  airportLeg.platformCarFits matches platformCarFits(tripId) when a flight exists
 *   A5  airportLegMinutes is a positive integer only for a shown routed leg touching the anchor;
 *       finalize writes no leg rows and does not call the routing engine
 *   A6  a failed anchors read (SQL error inside the savepoint) still finalizes, writes neither key,
 *       and leaves the trip and its items intact
 *   A7  an unchanged plan, including one that gains a flight after finalize, writes one version and
 *       does not rewrite it; a content change writes the next version with the anchor
 *   A8  refreshTripFinalLiveDays keeps anchors and airportLeg
 *   A9  planContentHash ignores anchors
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/trip-final-airport-snapshot.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { sql, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals, itemTransitionLog } from "@shared/schema";
import {
  airportFactsReads,
  finalizeTrip,
  planContentHash,
  refreshTripFinalLiveDays,
} from "../services/trip-finalize.service";
import { platformCarFits } from "../services/airport-leg.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `j6-${RUN}-${s}`;

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
  if (!ok) throw new Error(`[trip-final-airport] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
const createdTrips: string[] = [];
const createdListings: string[] = [];

async function seedTrip(opts: { destination?: string; adults?: number | null } = {}): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Airport final ${RUN}`,
    destination: opts.destination ?? "Kyoto, Japan",
    startDate: "2027-06-01",
    endDate: "2027-06-04",
    numberOfTravelers: 2,
    adults: opts.adults === undefined ? 2 : opts.adults,
    timezone: "Asia/Tokyo",
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

async function addItem(tripId: string, opts: { title?: string; startTime?: string } = {}): Promise<string> {
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title: opts.title ?? `Stop ${RUN}`,
    dayNumber: 1,
    origin: "traveler",
    startTime: opts.startTime ?? "09:00",
    latitude: "35.0116",
    longitude: "135.7681",
  } as any).returning();
  return it.id;
}

async function addAnchor(tripId: string, f: {
  id: string;
  type: "flight_arrival" | "flight_departure" | "custom";
  at: string;
  location?: string | null;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location, description, latitude, longitude)
    VALUES (
      ${f.id}, ${tripId}, ${f.type}, ${f.at}::timestamp,
      ${f.location ?? null}, ${f.description ?? null}, ${f.lat ?? null}, ${f.lng ?? null}
    )
  `);
}

async function addLeg(tripId: string, f: {
  id: string;
  fromId: string;
  toId: string;
  minutes: number;
  status: "confirmed" | "proposed";
  source?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO transport_legs (
      id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, source
    ) VALUES (
      ${f.id}, ${tripId}, 1, 1, ${f.fromId}, 'KIX', 34.43, 135.24,
      ${f.toId}, 'Kyoto Station', 34.98, 135.75, 8000, '8 km', 'transit',
      ${f.minutes}, ${f.status}, ${f.source ?? null}
    )
  `);
}

async function legsOf(tripId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, from_activity_id, to_activity_id, estimated_duration_minutes, proposal_status, source
      FROM transport_legs WHERE trip_id = ${tripId} ORDER BY id
  `);
  return r.rows as any[];
}

async function latest(tripId: string): Promise<any> {
  const [row] = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId)).orderBy(desc(tripFinals.version)).limit(1);
  return row;
}

async function versionSnap(tripId: string, version: number): Promise<any> {
  const all = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId));
  return all.find((r) => r.version === version)?.snapshot;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `airport-final-${RUN}@t.test` } as any).returning();
  userId = u.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM temporal_anchors WHERE trip_id = ${t}`).catch(() => {});
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itemTransitionLog).where(eq(itemTransitionLog.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  if (createdListings.length) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ANY(${createdListings})`).catch(() => {});
  }
  if (createdTrips.length) await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  if (userId) await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("A1 both flight anchors freeze wall-clock time, a trimmed airport, and blank text as null", async () => {
  const tripId = await seedTrip();
  await addItem(tripId);
  await addAnchor(tripId, {
    id: id("arr"),
    type: "flight_arrival",
    at: "2026-11-11 14:30:00",
    location: "  KIX  ",
    description: "  NH 123  ",
    lat: 34.43,
    lng: 135.24,
  });
  await addAnchor(tripId, {
    id: id("dep"),
    type: "flight_departure",
    at: "2026-11-14 18:05:00",
    location: "   ",
    description: "  ",
  });
  await finalizeTrip(tripId, userId);
  const snap = (await latest(tripId)).snapshot;
  assert.deepEqual(snap.anchors.flightArrival, {
    time: "14:30",
    airport: "KIX",
    description: "NH 123",
    airportLegMinutes: null,
  });
  assert.deepEqual(snap.anchors.flightDeparture, {
    time: "18:05",
    airport: null,
    description: null,
    airportLegMinutes: null,
  });
});

test("A2 the earlier anchor_datetime wins, and the same datetime keeps the lower id", async () => {
  const byTime = await seedTrip();
  await addItem(byTime);
  await addAnchor(byTime, { id: id("z-late"), type: "flight_arrival", at: "2026-11-11 10:00:00", location: "LATE", lat: 1, lng: 1 });
  await addAnchor(byTime, { id: id("a-early"), type: "flight_arrival", at: "2026-11-11 09:00:00", location: "EARLY", lat: 1, lng: 1 });
  await finalizeTrip(byTime, userId);
  assert.equal((await latest(byTime)).snapshot.anchors.flightArrival.airport, "EARLY");
  assert.equal((await latest(byTime)).snapshot.anchors.flightArrival.time, "09:00");

  const byId = await seedTrip();
  await addItem(byId);
  await addAnchor(byId, { id: id("z-high"), type: "flight_arrival", at: "2026-11-11 12:00:00", location: "HIGH", lat: 1, lng: 1 });
  await addAnchor(byId, { id: id("a-low"), type: "flight_arrival", at: "2026-11-11 12:00:00", location: "LOW", lat: 1, lng: 1 });
  await finalizeTrip(byId, userId);
  assert.equal((await latest(byId)).snapshot.anchors.flightArrival.airport, "LOW", "same datetime, lower id wins");
});

test("A3 no flight anchors still writes anchors with both directions null, and no airportLeg", async () => {
  const tripId = await seedTrip();
  await addItem(tripId);
  await addAnchor(tripId, { id: id("custom"), type: "custom", at: "2026-11-11 08:00:00", location: "Tea", description: "ceremony" });
  await finalizeTrip(tripId, userId);
  const snap = (await latest(tripId)).snapshot;
  assert.deepEqual(snap.anchors, { flightArrival: null, flightDeparture: null });
  assert.equal("airportLeg" in snap, false);
});

test("A4 airportLeg.platformCarFits matches platformCarFits when a flight exists", async () => {
  const city = `J6${RUN}`;
  const yes = await seedTrip({ destination: `${city}, Testland` });
  const no = await seedTrip({ destination: `${city}none, Testland` });
  await addItem(yes);
  await addItem(no);
  await addAnchor(yes, { id: id("yes-arr"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX" });
  await addAnchor(no, { id: id("no-arr"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX" });
  const listing = id("car");
  createdListings.push(listing);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, status, approval_status, city, service_type)
    VALUES (${listing}, ${userId}, ${`J6 car ${RUN}`}, 'active', 'approved', ${city}, 'transportation')
  `);
  assert.equal(await platformCarFits(yes), true, "the listing in the plan's city fits");
  assert.equal(await platformCarFits(no), false, "a city with no listing does not");
  await finalizeTrip(yes, userId);
  await finalizeTrip(no, userId);
  assert.deepEqual((await latest(yes)).snapshot.airportLeg, { platformCarFits: true });
  assert.deepEqual((await latest(no)).snapshot.airportLeg, { platformCarFits: false });
});

test("A5 shown routed minutes freeze; a leg that is not shown stays null; finalize writes no legs", async () => {
  const src = readFileSync(new URL("../services/trip-finalize.service.ts", import.meta.url), "utf8");
  const start = src.indexOf("export async function freezeAirportFacts");
  const end = src.indexOf("export async function finalizeTrip");
  const body = src.slice(start, end);
  assert.ok(start >= 0 && end > start, "the freeze helper is in trip-finalize.service.ts");
  assert.match(src, /tripLegsShown\(tripId\)/, "minutes come from tripLegsShown");
  assert.doesNotMatch(body, /computePlanLegs|computeTransportLeg|enqueuePlanLegRecompute|plan-legs-engine|lookupFlight|GOOGLE_MAPS/);

  // The airport-legs suite's shown leg: a trip pass, and a proposed engine leg (source set) touching anchor:<id>.
  const shown = await seedTrip();
  const shownItem = await addItem(shown);
  const shownAnchor = id("shown-arr");
  await addAnchor(shown, { id: shownAnchor, type: "flight_arrival", at: "2026-11-11 13:00:00", location: "KIX", lat: 34.43, lng: 135.24 });
  await addAnchor(shown, { id: id("shown-dep"), type: "flight_departure", at: "2026-11-12 18:00:00", location: "KIX" });
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source)
    VALUES (${id("pass")}, ${shown}, 'trip_pass', 'active', 'manual')
  `);
  await addLeg(shown, {
    id: id("shown-leg"),
    fromId: `anchor:${shownAnchor}`,
    toId: shownItem,
    minutes: 47,
    status: "proposed",
    source: "stub",
  });

  // Same stored shape, but the plan does not qualify, so the proposed leg is not shown.
  const hidden = await seedTrip();
  const hiddenItem = await addItem(hidden);
  const hiddenAnchor = id("hidden-arr");
  await addAnchor(hidden, { id: hiddenAnchor, type: "flight_arrival", at: "2026-11-11 13:00:00", location: "KIX", lat: 34.43, lng: 135.24 });
  await addLeg(hidden, {
    id: id("hidden-leg"),
    fromId: `anchor:${hiddenAnchor}`,
    toId: hiddenItem,
    minutes: 47,
    status: "proposed",
    source: "stub",
  });

  // A point-less flight with a confirmed leg still has no minutes: the live rule requires a point.
  const bare = await seedTrip();
  const bareItem = await addItem(bare);
  const bareAnchor = id("bare-arr");
  await addAnchor(bare, { id: bareAnchor, type: "flight_arrival", at: "2026-11-11 13:00:00", location: "KIX" });
  await addLeg(bare, { id: id("bare-leg"), fromId: `anchor:${bareAnchor}`, toId: bareItem, minutes: 30, status: "confirmed" });

  const before = {
    shown: await legsOf(shown),
    hidden: await legsOf(hidden),
    bare: await legsOf(bare),
  };
  await finalizeTrip(shown, userId);
  await finalizeTrip(hidden, userId);
  await finalizeTrip(bare, userId);
  assert.deepEqual(await legsOf(shown), before.shown, "finalize wrote no leg on the shown plan");
  assert.deepEqual(await legsOf(hidden), before.hidden, "finalize wrote no leg on the hidden plan");
  assert.deepEqual(await legsOf(bare), before.bare, "finalize wrote no leg on the point-less plan");

  const shownSnap = (await latest(shown)).snapshot;
  assert.equal(shownSnap.anchors.flightArrival.airportLegMinutes, 47);
  assert.equal(shownSnap.anchors.flightDeparture.airportLegMinutes, null, "no shown leg touches the departure");
  assert.equal((await latest(hidden)).snapshot.anchors.flightArrival.airportLegMinutes, null, "a proposed leg on a free plan is not shown");
  assert.equal((await latest(bare)).snapshot.anchors.flightArrival.airportLegMinutes, null, "no point, so no minutes");
});

test("A6 a failed anchors read still finalizes with neither key and does not abort the transaction", async () => {
  const tripId = await seedTrip();
  const itemId = await addItem(tripId, { title: `Kept ${RUN}` });
  await addAnchor(tripId, { id: id("a6"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX", lat: 34.43, lng: 135.24 });
  const original = airportFactsReads.readFlightAnchors;
  airportFactsReads.readFlightAnchors = async (_tripId, sp) => {
    // A SQL error on the savepoint connection. A bare tx.select would abort the finalize transaction.
    await sp.execute(sql`SELECT * FROM no_such_airport_facts_relation`);
    return [];
  };
  try {
    const res = await finalizeTrip(tripId, userId);
    assert.equal(res.finalCreated, true);
    assert.equal(res.flipped, true);
    const snap = (await latest(tripId)).snapshot;
    assert.equal("anchors" in snap, false);
    assert.equal("airportLeg" in snap, false);
    assert.equal(snap.items.length, 1);
    assert.equal(snap.items[0].id, itemId);
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    assert.ok(trip.finalizedAt, "the trip update after the failed read committed");
    assert.equal(trip.title, `Airport final ${RUN}`);
  } finally {
    airportFactsReads.readFlightAnchors = original;
  }
});

test("a failed platformCarFits read omits only airportLeg", async () => {
  const tripId = await seedTrip();
  await addItem(tripId);
  await addAnchor(tripId, { id: id("fits-fail"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX" });
  const original = airportFactsReads.platformCarFits;
  airportFactsReads.platformCarFits = async () => {
    throw new Error("transport unreadable");
  };
  try {
    await finalizeTrip(tripId, userId);
    const snap = (await latest(tripId)).snapshot;
    assert.equal(snap.anchors.flightArrival.airport, "KIX");
    assert.equal("airportLeg" in snap, false);
  } finally {
    airportFactsReads.platformCarFits = original;
  }
});

test("A7 an unchanged plan writes one version; a later flight does not rewrite it; a content change does", async () => {
  const tripId = await seedTrip();
  const itemId = await addItem(tripId, { title: `Original ${RUN}` });
  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.version, 1);
  assert.equal(first.finalCreated, true);
  const again = await finalizeTrip(tripId, userId);
  assert.equal(again.finalCreated, false);
  assert.equal((await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId))).length, 1);

  const frozen = JSON.stringify((await versionSnap(tripId, 1)));
  await addAnchor(tripId, { id: id("later"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX", description: "added after" });
  const afterAnchor = await finalizeTrip(tripId, userId);
  assert.equal(afterAnchor.finalCreated, false, "a flight is outside the fingerprint");
  assert.equal(afterAnchor.version, 1);
  assert.equal(JSON.stringify(await versionSnap(tripId, 1)), frozen, "the existing version is not rewritten");
  assert.equal((await versionSnap(tripId, 1)).anchors.flightArrival, null);

  await db.update(itineraryItems).set({ title: `Edited ${RUN}` }).where(eq(itineraryItems.id, itemId));
  const next = await finalizeTrip(tripId, userId);
  assert.equal(next.version, 2);
  assert.equal(next.finalCreated, true);
  const v2 = await versionSnap(tripId, 2);
  assert.equal(v2.anchors.flightArrival.airport, "KIX");
  assert.equal(v2.anchors.flightArrival.description, "added after");
  assert.equal(JSON.stringify(await versionSnap(tripId, 1)), frozen, "version 1 stays the pre-flight snapshot");
});

test("A8 refreshTripFinalLiveDays keeps anchors and airportLeg", async () => {
  const tripId = await seedTrip({ destination: `A8${RUN}, Testland` });
  const itemId = await addItem(tripId, { startTime: "09:00" });
  await addAnchor(tripId, { id: id("a8"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX", description: "keep me" });
  await finalizeTrip(tripId, userId);
  const before = (await latest(tripId)).snapshot;
  assert.equal(before.anchors.flightArrival.airport, "KIX");
  assert.deepEqual(before.airportLeg, { platformCarFits: false });

  await db.update(itineraryItems).set({ startTime: "10:15" }).where(eq(itineraryItems.id, itemId));
  const refreshed = await refreshTripFinalLiveDays(tripId, new Date("2026-10-25T12:00:00Z"));
  assert.equal(refreshed.refreshed, true, "a future day's edited time rewrites the snapshot items");
  const after = (await latest(tripId)).snapshot;
  assert.deepEqual(after.anchors, before.anchors);
  assert.deepEqual(after.airportLeg, before.airportLeg);
  assert.equal(after.items.find((it: any) => it.id === itemId).startTime, "10:15");
  assert.equal((await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId))).length, 1, "refresh does not write a new version");
});

test("A9 planContentHash is identical when the only difference is a flight anchor", async () => {
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Hash ${RUN}` });
  const load = async () => {
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    return planContentHash(trip as any, items);
  };
  const before = await load();
  await addAnchor(tripId, { id: id("hash"), type: "flight_arrival", at: "2026-11-11 14:00:00", location: "KIX", description: "not in the hash" });
  assert.equal(await load(), before);
});
