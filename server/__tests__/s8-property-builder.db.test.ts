/**
 * S8 — PROPERTY BUILDER FIELDS + PRIVACY CIRCLE (behavioural proof, HTTP against the real dev
 * server; migration 211, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102, Gate G2).
 *
 * WHAT THIS SUITE PROVES, negatives first:
 *   N1  a property's PUBLIC detail read does NOT carry its exact stored lat/lng — the jitter
 *       from `server/services/property-location-privacy.service.ts` is applied, and the response
 *       carries an honest `locationApproximate: true` flag.
 *   N2  the jitter is DETERMINISTIC — two consecutive public reads of the same property return
 *       the identical jittered coordinate (a reshuffling map reads as broken, not as
 *       privacy-preserving — the teaser-map module's own rule, reused here).
 *   N3  the PUBLIC BROWSE list (GET /api/services) jitters the same property row too — the
 *       privacy circle is not a detail-read-only accident.
 *   N4  a `payment_pending` booking's embedded service does NOT reveal the exact pin, even
 *       though it is the TRAVELER'S OWN booking (§15b: a provisional claim is not an
 *       authorization) — GET /api/service-bookings/{list}.
 *   N5  a room read STANDALONE (no coordinates of its own — S8-Q3 absolute inheritance: a room
 *       never writes its own pin) falls back to the PARENT's pin at READ TIME, jittered exactly
 *       like the property's own read — never the room's raw NULL, never a fabricated pin.
 *   N6  REGRESSION — a non-property (`in_person` tour) service with a confirmed meeting pin is
 *       NEVER jittered on the public detail read: the exact coordinates ride the wire untouched,
 *       and no `locationApproximate` flag appears. routePoints/serviceRadius rendering for that
 *       shape is a completely separate code path and is not touched by this lane.
 *   N7  amenities NULL vs [] is preserved end-to-end (§13, the deliveryLanguages precedent): a
 *       service created with no `amenities` field stores/reads back NULL; a PATCH sending
 *       `amenities: []` stores/reads back an empty array, not NULL.
 *
 * POSITIVES:
 *   P1  a CONFIRMED booking's embedded service DOES carry the exact pin (the one sanctioned
 *       reveal, mirroring the `/deliverable` gate's status check).
 *   P2  the four new columns (check_in_time/check_out_time/house_rules/amenities) round-trip
 *       through BOTH POST and PATCH /api/provider/services.
 *   P3  an invalid check-in time ("25:99") is rejected by the HH:MM app-level validator.
 *
 * NEGATIVES FIRST, disposable DB only. Runs against the ALREADY-RUNNING dev server (the
 * fp1-console-defects / fp3-property-room-edit posture) — see those files for the harness this
 * one copies.
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/s8-property-builder.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

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
  if (!ok) throw new Error(`[s8] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

let provider = { id: "", email: "", cookie: "" };
let traveler = { id: "", email: "", cookie: "" };
let propertyId = "";
let roomId = "";
let plainInPersonId = "";
const PROPERTY_LAT = 35.0116;
const PROPERTY_LNG = 135.7681; // Kyoto — matches the fixture convention elsewhere in this suite
const PLAIN_LAT = 35.6812;
const PLAIN_LNG = 139.7671; // Tokyo — deliberately far from the property fixture

async function createProviderAccount(): Promise<{ id: string; email: string; cookie: string }> {
  const email = `s8-${RUN}-${crypto.randomUUID().slice(0, 6)}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "S8", lastName: "Provider",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${id}`);
  const login = await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD });
  assert.equal(login.status, 200, "login must succeed");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  return { id, email, cookie };
}

async function createTravelerAccount(): Promise<{ id: string; email: string; cookie: string }> {
  const email = `s8-${RUN}-trav-${crypto.randomUUID().slice(0, 6)}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "S8", lastName: "Traveler",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  const login = await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD });
  assert.equal(login.status, 200, "login must succeed");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  return { id, email, cookie };
}

async function insertBooking(opts: { serviceId: string; status: string }): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, created_at)
    VALUES (${id}, ${opts.serviceId}, ${traveler.id}, ${provider.id}, ${opts.status}, '150.00', '20.00', '130.00', NOW())
  `);
  createdBookingIds.push(id);
  return id;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  provider = await createProviderAccount();
  traveler = await createTravelerAccount();

  // A confirmed-pin property with one room, per the fp3 fixture shape.
  const prop = await readOnce(await api("/api/provider/properties", provider.cookie, "POST", {
    serviceName: `S8 Machiya ${RUN}`,
    description: "S8 property fixture",
    location: "Nishijin, Kamigyo-ku",
    locationPoint: { lat: PROPERTY_LAT, lng: PROPERTY_LNG },
    rooms: [{ roomName: "S8 Garden Room", price: "180.00", units: 1 }],
  }));
  assert.equal(prop.status, 201, `property create failed (${prop.status}): ${prop.text}`);
  propertyId = prop.body.id;
  roomId = prop.body.rooms[0].id;
  createdServiceIds.push(propertyId, roomId);

  // A plain in_person service with its OWN confirmed meeting pin — the regression control:
  // exact coordinates must survive on the public read untouched (never jittered).
  const plain = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `S8 Plain Tour ${RUN}`,
    description: "S8 non-property regression control",
    price: "40.00",
    deliveryMethod: "in_person",
    meetingPoint: "Shibuya Crossing",
    locationPoint: { lat: PLAIN_LAT, lng: PLAIN_LNG },
    status: "draft",
  }));
  assert.equal(plain.status, 201, `plain service create failed (${plain.status}): ${plain.text}`);
  plainInPersonId = plain.body.id;
  createdServiceIds.push(plainInPersonId);

  // F2 public read-gate needs approval_status='approved' AND status='active' — approve every
  // fixture row directly (this suite is not proving the review queue).
  await db.execute(sql`
    UPDATE provider_services SET approval_status = 'approved', status = 'active'
    WHERE id IN (${propertyId}, ${roomId}, ${plainInPersonId})
  `);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdBookingIds) {
      await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
    }
    for (const id of [roomId, propertyId, plainInPersonId]) {
      if (id) await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ N1/N2 — public property detail: jittered, flagged, deterministic ══════════════════════════

test("N1: public property detail does NOT carry the exact stored pin — jittered + flagged", async () => {
  const res = await readOnce(await api(`/api/services/${propertyId}`, undefined));
  assert.equal(res.status, 200, `public read failed (${res.status}): ${res.text}`);
  assert.equal(res.body.locationApproximate, true, "the response must say the pin is approximate");
  assert.ok(res.body.latitude != null && res.body.longitude != null, "a jittered pin is still a real pin");
  const dLat = Math.abs(Number(res.body.latitude) - PROPERTY_LAT);
  const dLng = Math.abs(Number(res.body.longitude) - PROPERTY_LNG);
  assert.ok(dLat > 0 || dLng > 0, "the served coordinate must differ from the exact stored one");
  // ~500m radius ⇒ well under 0.01° in either direction at this latitude; a generous bound that
  // still catches "jitter broken / returning something wildly different".
  assert.ok(dLat < 0.02 && dLng < 0.02, "the jitter must stay within a plausible ~500m-class radius");
});

test("N2: the jitter is deterministic — two reads return the identical approximate pin", async () => {
  const a = await readOnce(await api(`/api/services/${propertyId}`, undefined));
  const b = await readOnce(await api(`/api/services/${propertyId}`, undefined));
  assert.equal(a.body.latitude, b.body.latitude, "latitude must be stable across reads");
  assert.equal(a.body.longitude, b.body.longitude, "longitude must be stable across reads");
});

// ═══ N3 — the public BROWSE list jitters too ════════════════════════════════════════════════════

test("N3: the public browse list (GET /api/services) also jitters the property row", async () => {
  const res = await readOnce(await api("/api/services", undefined));
  assert.equal(res.status, 200, `browse read failed (${res.status}): ${res.text}`);
  const row = (res.body as any[]).find((r) => r.id === propertyId);
  assert.ok(row, "the approved property must appear in the public browse list");
  assert.equal(row.locationApproximate, true, "browse must flag the same approximation");
  assert.notEqual(String(row.latitude), String(PROPERTY_LAT.toFixed(7)), "browse must not leak the exact latitude");
});

// ═══ N4/P1 — booking-status-gated reveal (§15b posture) ═════════════════════════════════════════

test("N4: a payment_pending booking does NOT reveal the exact pin, even to its own traveler", async () => {
  const bookingId = await insertBooking({ serviceId: propertyId, status: "payment_pending" });
  const res = await readOnce(await api("/api/service-bookings", traveler.cookie));
  assert.equal(res.status, 200, `traveler bookings read failed (${res.status}): ${res.text}`);
  const row = (res.body as any[]).find((b: any) => b.id === bookingId);
  assert.ok(row, "the booking must be in the traveler's own list");
  assert.ok(row.service, "the booking must carry its service");
  assert.equal(row.service.locationApproximate, true, "an unconfirmed claim must still be jittered");
  assert.notEqual(String(row.service.latitude), String(PROPERTY_LAT.toFixed(7)), "the exact pin must not leak on a payment_pending booking");
});

test("P1: a CONFIRMED booking DOES reveal the exact pin — the one sanctioned reveal", async () => {
  const bookingId = await insertBooking({ serviceId: propertyId, status: "confirmed" });
  const res = await readOnce(await api("/api/service-bookings", traveler.cookie));
  assert.equal(res.status, 200);
  const row = (res.body as any[]).find((b: any) => b.id === bookingId);
  assert.ok(row?.service, "the confirmed booking must carry its service");
  assert.ok(!row.service.locationApproximate, "a confirmed booking must NOT carry the approximate flag");
  assert.equal(Number(row.service.latitude).toFixed(7), PROPERTY_LAT.toFixed(7), "latitude must be exact");
  assert.equal(Number(row.service.longitude).toFixed(7), PROPERTY_LNG.toFixed(7), "longitude must be exact");
});

// ═══ N5 — room standalone read falls back to the parent's (jittered) pin ═══════════════════════

test("N5: a room's own stored pin is NULL — the room owner-read never writes one", async () => {
  const res = await readOnce(await api(`/api/provider/services/${roomId}`, provider.cookie));
  assert.equal(res.status, 200);
  assert.equal(res.body.latitude, null, "S8-Q3: a room row never writes its own pin");
  assert.equal(res.body.longitude, null);
});

test("N5b: the room's PUBLIC detail read falls back to the parent's pin, jittered, at read time", async () => {
  const res = await readOnce(await api(`/api/services/${roomId}`, undefined));
  assert.equal(res.status, 200, `public room read failed (${res.status}): ${res.text}`);
  assert.equal(res.body.locationApproximate, true, "the room's fallback pin is approximate too");
  assert.ok(res.body.latitude != null && res.body.longitude != null, "the room must resolve a pin from its parent, never a blank map");
  const dLat = Math.abs(Number(res.body.latitude) - PROPERTY_LAT);
  const dLng = Math.abs(Number(res.body.longitude) - PROPERTY_LNG);
  assert.ok(dLat < 0.02 && dLng < 0.02, "the room's jittered fallback must stay near the PARENT's real pin, not drift elsewhere");
  assert.ok(dLat > 0 || dLng > 0, "the room's served pin must not be the exact parent coordinate either");
});

// ═══ N6 — regression: a non-property shape is NEVER jittered ═══════════════════════════════════

test("N6: a non-property (in_person) service keeps its EXACT pin on the public detail read", async () => {
  const res = await readOnce(await api(`/api/services/${plainInPersonId}`, undefined));
  assert.equal(res.status, 200, `public read failed (${res.status}): ${res.text}`);
  assert.ok(!res.body.locationApproximate, "a non-property shape must never carry the approximate flag");
  assert.equal(Number(res.body.latitude).toFixed(7), PLAIN_LAT.toFixed(7), "latitude must be exact — no jitter for this shape");
  assert.equal(Number(res.body.longitude).toFixed(7), PLAIN_LNG.toFixed(7), "longitude must be exact — no jitter for this shape");
});

// ═══ P2/P3 — the four new columns round-trip through POST + PATCH; app-level HH:MM validation ══

test("P2: check_in_time/check_out_time/house_rules/amenities round-trip through POST and PATCH", async () => {
  const created = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `S8 Fields Roundtrip ${RUN}`,
    description: "S8 field round-trip fixture",
    price: "10.00",
    deliveryMethod: "pdf",
    status: "draft",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    houseRules: "No smoking. Quiet hours after 22:00.",
    amenities: ["WiFi", "Kitchen"],
  }));
  assert.equal(created.status, 201, `create failed (${created.status}): ${created.text}`);
  const id = created.body.id as string;
  createdServiceIds.push(id);
  assert.equal(created.body.checkInTime, "15:00");
  assert.equal(created.body.checkOutTime, "11:00");
  assert.equal(created.body.houseRules, "No smoking. Quiet hours after 22:00.");
  assert.deepEqual(created.body.amenities, ["WiFi", "Kitchen"]);

  const patched = await readOnce(await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    checkInTime: "16:00",
    checkOutTime: "10:00",
    houseRules: "No pets.",
    amenities: ["Parking"],
  }));
  assert.equal(patched.status, 200, `patch failed (${patched.status}): ${patched.text}`);
  assert.equal(patched.body.checkInTime, "16:00");
  assert.equal(patched.body.checkOutTime, "10:00");
  assert.equal(patched.body.houseRules, "No pets.");
  assert.deepEqual(patched.body.amenities, ["Parking"]);

  const reread = await readOnce(await api(`/api/provider/services/${id}`, provider.cookie));
  assert.equal(reread.status, 200);
  assert.equal(reread.body.checkInTime, "16:00");
  assert.deepEqual(reread.body.amenities, ["Parking"]);
});

test("N7: amenities NULL (never captured) survives a create that omits it; [] (cleared) is distinct and preserved", async () => {
  const created = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `S8 Amenities Null ${RUN}`,
    description: "S8 amenities-null fixture",
    price: "10.00",
    deliveryMethod: "pdf",
    status: "draft",
  }));
  assert.equal(created.status, 201, `create failed (${created.status}): ${created.text}`);
  const id = created.body.id as string;
  createdServiceIds.push(id);
  assert.equal(created.body.amenities ?? null, null, "amenities omitted at create ⇒ NULL, never []");

  const cleared = await readOnce(await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    amenities: [],
  }));
  assert.equal(cleared.status, 200, `patch failed (${cleared.status}): ${cleared.text}`);
  assert.deepEqual(cleared.body.amenities, [], "an explicit [] must be stored as [], not collapsed back to NULL");

  const reread = await readOnce(await api(`/api/provider/services/${id}`, provider.cookie));
  assert.deepEqual(reread.body.amenities, [], "[] must survive a re-read distinctly from NULL");
});

test("P3: an invalid check-in time is rejected by the HH:MM app-level validator", async () => {
  const res = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `S8 Bad Time ${RUN}`,
    description: "must be rejected",
    price: "10.00",
    deliveryMethod: "pdf",
    status: "draft",
    checkInTime: "25:99",
  }));
  assert.equal(res.status, 400, `an out-of-range HH:MM must be rejected (got ${res.status}): ${res.text}`);
});
