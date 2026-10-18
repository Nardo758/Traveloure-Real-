/**
 * FD-4 (ledger `2026-10-18-fd4-share-projection`): every share rail carries public stops only.
 *
 * One plan, two stops on day 1: a PUBLIC stop and a LOCAL stop (an expert's, with an expert note), plus a
 * day-2 stop whose variant copy has no `source_item_id` (unclassifiable ⇒ counted, fail closed). Every
 * share read is asserted to carry no local name, no expert note and no local field name, and to state the
 * hidden stops as a per-day `localCount`:
 *   L1 itinerary-share JSON (anonymous)      L5 trips/shared/:token
 *   L2 KML export                            L6 shared-trips/:token
 *   L3 GPX export                            L7 saved-places share (a local gem is counted)
 *   L4 navigate: local leg 404, public 302   L8 trip GET with ?token= (anonymous)
 * Quick-start's prompt input is pinned in shared/__tests__/share-projection.test.ts (it calls a model).
 *
 * Transport: real HTTP against the running server on :5000 (the share-link-price-redaction pattern).
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { localFieldsIn } from "@shared/share-projection";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const LOCAL_NAME = `Secret Garden ${RUN}`;
const LOCAL_NOTE = `expert whisper ${RUN}`;
const TRIP_NOTE = `trip note ${RUN}`;
const UNCLASSIFIED_NAME = `Unlinked Stop ${RUN}`;
const PUBLIC_NAME = `Kiyomizu-dera ${RUN}`;
const PUBLIC_NAME_2 = `Yasaka Shrine ${RUN}`;
const LOCAL_GEM = `Hidden Teahouse ${RUN}`;
const LOCAL_LAT = 35.0123456;

const email = `slp4-${RUN}-owner@t.test`;
let ownerId = "";
const ids = {
  trip: `slp4-${RUN}-trip`,
  pub: `slp4-${RUN}-pub`,
  pub2: `slp4-${RUN}-pub2`,
  loc: `slp4-${RUN}-loc`,
  cmp: `slp4-${RUN}-cmp`,
  variant: `slp4-${RUN}-var`,
  vPub: `slp4-${RUN}-vpub`,
  vPub2: `slp4-${RUN}-vpub2`,
  vLoc: `slp4-${RUN}-vloc`,
  vUnl: `slp4-${RUN}-vunl`,
  legPub: `slp4-${RUN}-legpub`,
  legLoc: `slp4-${RUN}-legloc`,
  share: `slp4-${RUN}-shr`,
  gem: `slp4-${RUN}-gem`,
};
const tokens = {
  view: `slp4-${RUN}-view`,
  trip: `slp4-${RUN}-trip-token`,
  sharedTrip: `slp4-${RUN}-st`,
  sharedVariant: `slp4-${RUN}-sv`,
  saved: crypto.randomBytes(32).toString("hex"),
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[share-local-projection] REFUSING to write fixtures on '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function get(path: string, redirect: RequestRedirect = "follow") {
  const res = await fetch(`${BASE_URL}${path}`, { redirect });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { status: res.status, raw, body, location: res.headers.get("location") };
}

function assertNothingLocal(raw: string, body: unknown, where: string): void {
  for (const s of [LOCAL_NAME, LOCAL_NOTE, TRIP_NOTE, UNCLASSIFIED_NAME, LOCAL_GEM, String(LOCAL_LAT)]) {
    assert.ok(!raw.includes(s), `'${s}' LEAKED on ${where}`);
  }
  if (body !== null) assert.deepEqual(localFieldsIn(body), [], `local field names carried a value on ${where}`);
}

before(async () => {
  assertDisposableDb();
  const actor = await registerAndSignIn({ baseUrl: BASE_URL, email, password: PASSWORD, firstName: "Owner", lastName: "FD4" });
  ownerId = actor.id;

  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, share_token, expert_traveler_note, expert_notes)
    VALUES (${ids.trip}, ${ownerId}, ${`FD4 ${RUN}`}, 'Kyoto', '2026-11-01', '2026-11-03', ${tokens.trip}, ${TRIP_NOTE}, ${TRIP_NOTE})
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, source_class, expert_note) VALUES
      (${ids.pub}, ${ids.trip}, ${PUBLIC_NAME}, 1, 0, 'public', NULL),
      (${ids.pub2}, ${ids.trip}, ${PUBLIC_NAME_2}, 1, 1, 'public', NULL),
      (${ids.loc}, ${ids.trip}, ${LOCAL_NAME}, 1, 2, 'local', ${LOCAL_NOTE})
  `);
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, start_date, end_date, status)
    VALUES (${ids.cmp}, ${ownerId}, ${ids.trip}, ${`FD4 ${RUN}`}, 'Kyoto', '2026-11-01', '2026-11-03', 'completed')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_variants (id, comparison_id, name, description, total_cost, optimization_score)
    VALUES (${ids.variant}, ${ids.cmp}, ${`Variant ${RUN}`}, 'fixture', '10.00', 80)
  `);
  await db.execute(sql`
    INSERT INTO itinerary_variant_items (id, variant_id, day_number, start_time, name, location, latitude, longitude, sort_order, source_item_id) VALUES
      (${ids.vPub}, ${ids.variant}, 1, '09:00', ${PUBLIC_NAME}, 'Kyoto', 34.9948, 135.7850, 0, ${ids.pub}),
      (${ids.vPub2}, ${ids.variant}, 1, '11:00', ${PUBLIC_NAME_2}, 'Kyoto', 35.0036, 135.7786, 1, ${ids.pub2}),
      (${ids.vLoc}, ${ids.variant}, 1, '13:00', ${LOCAL_NAME}, 'Kyoto', ${LOCAL_LAT}, 135.7700, 2, ${ids.loc}),
      (${ids.vUnl}, ${ids.variant}, 2, '10:00', ${UNCLASSIFIED_NAME}, 'Kyoto', 35.0200, 135.7600, 0, NULL)
  `);
  await db.execute(sql`
    INSERT INTO transport_legs (id, variant_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
                                to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display,
                                recommended_mode, estimated_duration_minutes) VALUES
      (${ids.legPub}, ${ids.variant}, 1, 1, ${ids.vPub}, ${PUBLIC_NAME}, 34.9948, 135.7850, ${ids.vPub2}, ${PUBLIC_NAME_2}, 35.0036, 135.7786, 1100, '1.1 km', 'walk', 15),
      (${ids.legLoc}, ${ids.variant}, 1, 2, ${ids.vPub2}, ${PUBLIC_NAME_2}, 35.0036, 135.7786, ${ids.vLoc}, ${LOCAL_NAME}, ${LOCAL_LAT}, 135.7700, 1500, '1.5 km', 'walk', 20)
  `);
  await db.execute(sql`
    INSERT INTO shared_itineraries (id, share_token, variant_id, shared_by_user_id, permissions, expert_status)
    VALUES (${ids.share}, ${tokens.view}, ${ids.variant}, ${ownerId}, 'view', 'pending')
  `);
  await db.execute(sql`
    INSERT INTO shared_trips (trip_id, shared_by, share_token, expires_at)
    VALUES (${ids.trip}, ${ownerId}, ${tokens.sharedTrip}, NOW() + INTERVAL '1 day')
  `);
  await db.execute(sql`
    INSERT INTO shared_trips (variant_id, comparison_id, shared_by, share_token, expires_at)
    VALUES (${ids.variant}, ${ids.cmp}, ${ownerId}, ${tokens.sharedVariant}, NOW() + INTERVAL '1 day')
  `);
  await db.execute(sql`
    INSERT INTO travel_pulse_hidden_gems (id, city, place_name, source_class) VALUES (${ids.gem}, 'Kyoto', ${LOCAL_GEM}, 'local')
  `);
  await db.execute(sql`
    INSERT INTO saved_items (id, user_id, content_type, content_id, content_name, city) VALUES
      (${`slp4-${RUN}-si1`}, ${ownerId}, 'gem', ${ids.gem}, ${LOCAL_GEM}, 'Kyoto'),
      (${`slp4-${RUN}-si2`}, ${ownerId}, 'activity', ${`slp4-${RUN}-act`}, ${PUBLIC_NAME}, 'Kyoto')
  `);
  await db.execute(sql`
    INSERT INTO saved_place_shares (id, user_id, city_key, city_label, token) VALUES (${`slp4-${RUN}-sps`}, ${ownerId}, 'kyoto', 'Kyoto', ${tokens.saved})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM saved_place_shares WHERE token = ${tokens.saved}`);
  await db.execute(sql`DELETE FROM saved_items WHERE user_id = ${ownerId}`);
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE id = ${ids.gem}`);
  await db.execute(sql`DELETE FROM shared_trips WHERE share_token IN (${tokens.sharedTrip}, ${tokens.sharedVariant})`);
  await db.execute(sql`DELETE FROM shared_itineraries WHERE id = ${ids.share}`);
  await db.execute(sql`DELETE FROM maps_export_cache WHERE variant_id = ${ids.variant}`);
  await db.execute(sql`DELETE FROM itinerary_variants WHERE id = ${ids.variant}`);
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${ids.cmp}`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
});

test("L1 — itinerary-share JSON: public stops shown, local and unlinked stops counted, local leg dropped", async () => {
  const { status, raw, body } = await get(`/api/itinerary-share/${tokens.view}`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, body, "itinerary-share");
  const [d1, d2] = body.variant.days;
  assert.deepEqual(d1.activities.map((a: any) => a.name), [PUBLIC_NAME, PUBLIC_NAME_2]);
  assert.equal(d1.localCount, 1);
  assert.deepEqual(d1.transportLegs.map((l: any) => l.id), [ids.legPub]);
  assert.deepEqual(d2.activities, []);
  assert.equal(d2.localCount, 1);
  assert.equal("expertTravelerNote" in body, false);
  assert.ok(String(body.mapsLinks.googleMapsPerDay["1"] ?? "").includes("34.9948"));
  assert.equal(body.mapsLinks.googleMapsPerDay["2"], undefined);
});

test("L2 — KML export carries no local stop", async () => {
  const { status, raw } = await get(`/api/itinerary-share/${tokens.view}/export/kml`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, null, "KML");
  assert.ok(raw.includes(PUBLIC_NAME));
});

test("L3 — GPX export carries no local stop", async () => {
  const { status, raw } = await get(`/api/itinerary-share/${tokens.view}/export/gpx`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, null, "GPX");
  assert.ok(raw.includes(PUBLIC_NAME));
});

test("L4 — navigate: a leg into a local stop is not found; a public leg redirects", async () => {
  const local = await get(`/api/itinerary-share/${tokens.view}/navigate/1/2`, "manual");
  assert.equal(local.status, 404);
  assert.ok(!String(local.location ?? "").includes(String(LOCAL_LAT)));
  const pub = await get(`/api/itinerary-share/${tokens.view}/navigate/1/1`, "manual");
  assert.equal(pub.status, 302);
});

test("L5 — trips/shared/:token: the local stop is counted, never named", async () => {
  const { status, raw, body } = await get(`/api/trips/shared/${tokens.sharedTrip}`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, body, "trips/shared");
  const day1 = body.trip.itinerary_data.days.find((d: any) => d.day === 1);
  assert.deepEqual(day1.activities.map((a: any) => a.title), [PUBLIC_NAME, PUBLIC_NAME_2]);
  assert.equal(day1.localCount, 1);
});

test("L6 — shared-trips/:token carries nothing local and only its allowlisted fields", async () => {
  const { status, raw, body } = await get(`/api/shared-trips/${tokens.sharedVariant}`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, body, "shared-trips");
  assert.deepEqual(Object.keys(body.shared).sort(), ["description", "destination", "endDate", "expiresAt", "name", "startDate"]);
  assert.equal(body.shared.name, `Variant ${RUN}`);
  assert.ok(!raw.includes(ownerId), "the sharer's user id LEAKED on shared-trips");
});

test("L7 — saved-places share: a local gem is counted, a listing is shown", async () => {
  const { status, raw, body } = await get(`/api/saved-places/shared/${tokens.saved}`);
  assert.equal(status, 200, raw);
  assertNothingLocal(raw, body, "saved-places share");
  assert.deepEqual(body.places.map((p: any) => p.contentName), [PUBLIC_NAME]);
  assert.equal(body.localCount, 1);
});

test("L8 — trip GET with the share token, anonymous: no expert note", async () => {
  const { raw, body } = await get(`/api/trips/${ids.trip}?token=${tokens.trip}`);
  assertNothingLocal(raw, body, "trip GET ?token=");
});
