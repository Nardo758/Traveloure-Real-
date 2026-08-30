/**
 * S9 — SESSION/ASYNC SERVICE FIELDS (execution-map Wave 3, Gate G3; docs/DECISIONS.md ledger
 * row 102, ratifying docs/briefs/WAVE3_SCHEMA_PROPOSALS.md's S9 section).
 *
 * Three additive-nullable columns on `provider_services` (migration 212): `joinLink`,
 * `responseWindowHours`, `scopeStatement`. `responseWindowHours`/`scopeStatement` are PUBLIC
 * pre-purchase info, no different in kind from `earliestStartTime`/`serviceTimezone` next to them
 * (D7, migration 195). `joinLink` is the lane's §-critical field: the provider's OWN meeting link
 * for a scheduled remote session (call/video — shared/service-fundamentals.ts
 * SESSION_END_METHODS), stripped on every public/pre-booking surface — including a PENDING
 * advisor's read grant (§12) — and revealed ONLY to the CONFIRMED traveler + the owning provider,
 * mirroring `GET /api/service-bookings/:id/deliverable`'s gate exactly (booking.travelerId ===
 * session user, booking.status === 'confirmed', never 'payment_pending' — §15b).
 *
 * This suite proves, against the ALREADY-RUNNING dev server (the `service-deliverable.http` /
 * `service-logistics-capture.http` posture — real routes, real DB, real HTTP), NEGATIVES FIRST:
 *
 *   N1  joinLink absent from the public detail read (GET /api/services/:id) for an approved+
 *       active call-delivery listing that has a real, non-null joinLink set.
 *   N2  joinLink absent from the public browse read (GET /api/services) for the same listing.
 *   N3  joinLink absent from the traveler's OWN booking-list read (GET /api/service-bookings)
 *       while the booking is 'payment_pending' — never revealed pre-confirmation (§15b).
 *   N4  joinLink absent from a CONFIRMED booking whose service is NOT a scheduled-remote method
 *       (in_person) — the reveal gate checks deliveryMethod, not merely booking status.
 *   N5  joinLink absent from a PENDING advisor's read surface (GET /api/trips/:tripId/plancard)
 *       for a trip carrying a confirmed call booking whose service has joinLink set — §12's broad
 *       read grant does NOT extend to this field.
 *
 * THEN positives:
 *
 *   P1  joinLink round-trips through POST /api/provider/services and the owner-gated read.
 *   P2  joinLink round-trips through PATCH /api/provider/services/:id.
 *   P3  a malformed joinLink (not http(s)://…) is rejected with 400 on create AND update.
 *   P4  responseWindowHours round-trips through POST/PATCH; an out-of-range value (<=0) is
 *       rejected with 400 on both.
 *   P5  joinLink IS present for the CONFIRMED traveler on a call booking (GET
 *       /api/service-bookings) — the reveal.
 *   P6  joinLink IS present on the owner console read (GET /api/provider/services/:id) — the
 *       owner console stays ungated per CLAUDE.md.
 *   P7  responseWindowHours/scopeStatement round-trip onto the PUBLIC detail read and browse read
 *       — these two are ordinary public pre-purchase info, unlike joinLink.
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/session-async-fields.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-deliverable.http.test.ts; never defaults open) ──────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await readPool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[session-async-fields] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `s9-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTripIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "S9", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const JOIN_LINK = "https://meet.example.com/s9-fixture-room";
const RESPONSE_WINDOW_HOURS = 24;
const SCOPE_STATEMENT = "Replies cover itinerary questions only — booking changes go through support.";

async function makeService(opts: {
  ownerId: string;
  deliveryMethod: string;
  joinLink?: string | null;
  responseWindowHours?: number | null;
  scopeStatement?: string | null;
}): Promise<string> {
  const id = `s9-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, status, approval_status, delivery_method,
        join_link, response_window_hours, scope_statement)
     VALUES ($1, $2, $3, 'S9 fixture service', '40.00', 'active', 'approved', $4, $5, $6, $7)`,
    [
      id, opts.ownerId, `S9 service ${RUN}`, opts.deliveryMethod,
      opts.joinLink ?? null, opts.responseWindowHours ?? null, opts.scopeStatement ?? null,
    ],
  );
  createdServiceIds.push(id);
  return id;
}

async function makeBooking(opts: {
  serviceId: string;
  travelerId: string;
  providerId: string;
  status: string;
  tripId?: string | null;
}): Promise<string> {
  const id = `s9-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, booking_details, trip_id)
     VALUES ($1, $2, $3, $4, $5, '40.00', '8.00', '{}'::jsonb, $6)`,
    [id, opts.serviceId, opts.travelerId, opts.providerId, opts.status, opts.tripId ?? null],
  );
  createdBookingIds.push(id);
  return id;
}

let owner: Actor; // the provider who owns every fixture service
let buyer: Actor; // the traveler with real bookings
let advisor: Actor; // a PENDING trip_expert_advisors assignee — read grant, no write

let callServiceId: string;
let inPersonServiceId: string;
let asyncServiceId: string;

let confirmedCallBookingId: string;
let pendingCallBookingId: string;
let confirmedInPersonBookingId: string;

let advisorTripId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);
  await assertDisposableDb();

  // Fail loudly if migration 212 has not reached this database — a new migration only runs on a
  // full server restart, and a silent skip here would make every test below pass for the wrong
  // reason (columns simply not existing reads back as "always absent").
  const cols = await readPool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'provider_services' AND column_name = 'join_link'`,
  );
  assert.equal(
    cols.rowCount, 1,
    "migration 212 has not been applied to this database — restart the dev server so runMigrations() runs",
  );

  owner = await registerActor("owner");
  buyer = await registerActor("buyer");
  advisor = await registerActor("advisor");
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [owner.id]);

  callServiceId = await makeService({ ownerId: owner.id, deliveryMethod: "call", joinLink: JOIN_LINK });
  inPersonServiceId = await makeService({ ownerId: owner.id, deliveryMethod: "in_person", joinLink: JOIN_LINK });
  asyncServiceId = await makeService({
    ownerId: owner.id, deliveryMethod: "async_messaging",
    responseWindowHours: RESPONSE_WINDOW_HOURS, scopeStatement: SCOPE_STATEMENT,
  });

  confirmedCallBookingId = await makeBooking({
    serviceId: callServiceId, travelerId: buyer.id, providerId: owner.id, status: "confirmed",
  });
  pendingCallBookingId = await makeBooking({
    serviceId: callServiceId, travelerId: buyer.id, providerId: owner.id, status: "payment_pending",
  });
  confirmedInPersonBookingId = await makeBooking({
    serviceId: inPersonServiceId, travelerId: buyer.id, providerId: owner.id, status: "confirmed",
  });

  // N5 fixture: a trip owned by the buyer, a PENDING (not accepted) advisor assignment, and the
  // confirmed call booking above linked onto this trip — the shape §12 grants READ access on.
  const tripRes = await api("/api/trips", buyer.cookie, "POST", {
    title: `S9 advisor trip ${RUN}`, destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-05",
  });
  assert.equal(tripRes.status, 201, `createTrip failed: ${await tripRes.clone().text()}`);
  advisorTripId = ((await tripRes.json()) as any).id;
  createdTripIds.push(advisorTripId);
  await readPool.query(
    `INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status) VALUES ($1, $2, $3, 'pending')`,
    [crypto.randomUUID(), advisorTripId, advisor.id],
  );
  await readPool.query(`UPDATE service_bookings SET trip_id = $1 WHERE id = $2`, [advisorTripId, confirmedCallBookingId]);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdTripIds) {
      await readPool.query(`DELETE FROM trip_expert_advisors WHERE trip_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM trips WHERE id = $1`, [id]).catch(() => {});
    }
    for (const id of createdBookingIds) {
      await readPool.query(`DELETE FROM service_bookings WHERE id = $1`, [id]).catch(() => {});
    }
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── The one property that actually matters: the real link never appears, in any shape (an
//    omitted key OR a present-but-null key) — shape-agnostic, like the D3 deliverable-rail proof.
function assertNoJoinLinkLeak(payload: unknown, joinLinkValue: unknown) {
  assert.ok(
    joinLinkValue === undefined || joinLinkValue === null,
    `joinLink must be absent or null, got: ${JSON.stringify(joinLinkValue)}`,
  );
  assert.ok(!JSON.stringify(payload).includes(JOIN_LINK), "the raw join link must not appear anywhere in this payload");
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// NEGATIVES FIRST
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("N1: GET /api/services/:id (public detail) does not include joinLink even though it is set non-null", async () => {
  const res = await api(`/api/services/${callServiceId}`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assertNoJoinLinkLeak(body, body.joinLink);
});

test("N2: GET /api/services (public browse) does not include joinLink on any row", async () => {
  const res = await api(`/api/services`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((s) => s.id === callServiceId);
  assert.ok(mine, "the fixture call service should appear in public browse (active + approved)");
  assertNoJoinLinkLeak(mine, mine.joinLink);
});

test("N3 (§15b): joinLink is absent from the traveler's OWN booking read while payment_pending", async () => {
  const res = await api(`/api/service-bookings`, buyer.cookie);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((b) => b.id === pendingCallBookingId);
  assert.ok(mine, "the pending booking should appear in the traveler's own list");
  assertNoJoinLinkLeak(mine.service, mine.service?.joinLink);
});

test("N4: joinLink is absent from a CONFIRMED booking whose service is not a scheduled-remote method (in_person)", async () => {
  const res = await api(`/api/service-bookings`, buyer.cookie);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((b) => b.id === confirmedInPersonBookingId);
  assert.ok(mine, "the confirmed in_person booking should appear in the traveler's own list");
  assert.equal(mine.status, "confirmed", "sanity: this booking really is confirmed");
  assertNoJoinLinkLeak(mine.service, mine.service?.joinLink);
});

test("N5 (§12): joinLink is absent from a PENDING advisor's read surface (plancard) for a trip carrying a confirmed call booking", async () => {
  const res = await api(`/api/trips/${advisorTripId}/plancard`, advisor.cookie);
  assert.equal(res.status, 200, `plancard read failed for pending advisor: ${await res.clone().text()}`);
  const body = await res.json();
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("joinLink"), "the plancard response must never carry a joinLink key at all");
  assert.ok(!raw.includes(JOIN_LINK), "the raw join link must not appear anywhere in the plancard payload");
  // Sanity: the advisor's read grant is real (not an accidental 403/empty-body pass) — the
  // booking IS visible to them, just without the sensitive field.
  assert.ok(Array.isArray(body.bookings), "plancard must expose the trip's bookings list to the assigned advisor");
  assert.ok(body.bookings.some((b: any) => b.id === confirmedCallBookingId), "the confirmed call booking must be visible to the pending advisor");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// POSITIVES — write-rail round-trip
// ═════════════════════════════════════════════════════════════════════════════════════════════

let roundTripServiceId: string;

test("P1: joinLink round-trips through POST /api/provider/services and the owner-gated read", async () => {
  const res = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: `S9 round-trip ${RUN}`,
    description: "S9 write-rail fixture",
    price: "60.00",
    priceType: "fixed",
    deliveryMethod: "call",
    status: "draft",
  });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const created = (await res.json()) as any;
  roundTripServiceId = created.id;
  createdServiceIds.push(roundTripServiceId);
  // The owner sees their own row on the create echo (owner-write echo — not a public read);
  // joinLink was never sent, so it comes back NULL, not stripped (this route only omits
  // revenueShareRate — §18 — the sensitive-strip class is a public-read concern, proven below).
  assert.equal(created.joinLink, null, "joinLink was never sent on create, so it is unset");

  const patch = await api(`/api/provider/services/${roundTripServiceId}`, owner.cookie, "PATCH", {
    joinLink: JOIN_LINK,
  });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);
  const patched = (await patch.json()) as any;
  assert.equal(patched.joinLink, JOIN_LINK, "the owner's own write echo must carry the value back");

  const dbRow = await readPool.query(`SELECT join_link FROM provider_services WHERE id = $1`, [roundTripServiceId]);
  assert.equal(dbRow.rows[0].join_link, JOIN_LINK);

  const ownerRead = await api(`/api/provider/services/${roundTripServiceId}`, owner.cookie);
  assert.equal(ownerRead.status, 200);
  assert.equal(((await ownerRead.json()) as any).joinLink, JOIN_LINK, "the owner console read is ungated (CLAUDE.md)");
});

test("P2: joinLink can also be set on CREATE directly", async () => {
  const res = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: `S9 create-with-link ${RUN}`,
    price: "60.00",
    priceType: "fixed",
    deliveryMethod: "video",
    status: "draft",
    joinLink: JOIN_LINK,
  });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const id = ((await res.json()) as any).id as string;
  createdServiceIds.push(id);
  const row = await readPool.query(`SELECT join_link FROM provider_services WHERE id = $1`, [id]);
  assert.equal(row.rows[0].join_link, JOIN_LINK);
});

test("P3: a malformed joinLink (not http(s)://…) is rejected with 400 on CREATE and UPDATE", async () => {
  const badCreate = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: `S9 bad link ${RUN}`,
    price: "60.00",
    priceType: "fixed",
    deliveryMethod: "call",
    status: "draft",
    joinLink: "not-a-url",
  });
  assert.equal(badCreate.status, 400, `expected 400, got ${badCreate.status}: ${await badCreate.clone().text()}`);

  const badUpdate = await api(`/api/provider/services/${roundTripServiceId}`, owner.cookie, "PATCH", {
    joinLink: "ftp://wrong-scheme.example.com",
  });
  assert.equal(badUpdate.status, 400, `expected 400, got ${badUpdate.status}: ${await badUpdate.clone().text()}`);

  // …and the rejected update changed nothing.
  const row = await readPool.query(`SELECT join_link FROM provider_services WHERE id = $1`, [roundTripServiceId]);
  assert.equal(row.rows[0].join_link, JOIN_LINK);
});

test("P4: responseWindowHours round-trips through POST/PATCH; an out-of-range value is rejected on both", async () => {
  const res = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: `S9 async round-trip ${RUN}`,
    price: "30.00",
    priceType: "fixed",
    deliveryMethod: "async_messaging",
    status: "draft",
    responseWindowHours: 12,
    scopeStatement: "Reply covers scheduling questions only.",
  });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const id = ((await res.json()) as any).id as string;
  createdServiceIds.push(id);
  let row = await readPool.query(`SELECT response_window_hours, scope_statement FROM provider_services WHERE id = $1`, [id]);
  assert.equal(row.rows[0].response_window_hours, 12);
  assert.equal(row.rows[0].scope_statement, "Reply covers scheduling questions only.");

  const patch = await api(`/api/provider/services/${id}`, owner.cookie, "PATCH", { responseWindowHours: 48 });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);
  row = await readPool.query(`SELECT response_window_hours FROM provider_services WHERE id = $1`, [id]);
  assert.equal(row.rows[0].response_window_hours, 48);

  const badCreate = await api("/api/provider/services", owner.cookie, "POST", {
    serviceName: `S9 bad window ${RUN}`,
    price: "30.00",
    priceType: "fixed",
    deliveryMethod: "async_messaging",
    status: "draft",
    responseWindowHours: 0,
  });
  assert.equal(badCreate.status, 400, `expected 400, got ${badCreate.status}: ${await badCreate.clone().text()}`);

  const badUpdate = await api(`/api/provider/services/${id}`, owner.cookie, "PATCH", { responseWindowHours: -3 });
  assert.equal(badUpdate.status, 400, `expected 400, got ${badUpdate.status}: ${await badUpdate.clone().text()}`);
  row = await readPool.query(`SELECT response_window_hours FROM provider_services WHERE id = $1`, [id]);
  assert.equal(row.rows[0].response_window_hours, 48, "the rejected update changed nothing");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// POSITIVES — the reveal
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("P5: joinLink IS present for the CONFIRMED traveler on a call booking (GET /api/service-bookings)", async () => {
  const res = await api(`/api/service-bookings`, buyer.cookie);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((b) => b.id === confirmedCallBookingId);
  assert.ok(mine, "the confirmed call booking should appear in the traveler's own list");
  assert.equal(mine.status, "confirmed");
  assert.equal(mine.service?.joinLink, JOIN_LINK, "the reveal gate should include joinLink here");
});

test("P6: joinLink IS present on the owner console read (GET /api/provider/services/:id) — ungated per CLAUDE.md", async () => {
  const res = await api(`/api/provider/services/${callServiceId}`, owner.cookie);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as any).joinLink, JOIN_LINK);
});

test("P7: responseWindowHours/scopeStatement round-trip onto the PUBLIC detail read and browse read", async () => {
  const detail = await api(`/api/services/${asyncServiceId}`, undefined);
  assert.equal(detail.status, 200);
  const detailBody = (await detail.json()) as any;
  assert.equal(detailBody.responseWindowHours, RESPONSE_WINDOW_HOURS);
  assert.equal(detailBody.scopeStatement, SCOPE_STATEMENT);

  const browse = await api(`/api/services`, undefined);
  assert.equal(browse.status, 200);
  const mine = ((await browse.json()) as any[]).find((s) => s.id === asyncServiceId);
  assert.ok(mine, "the fixture async service should appear in public browse (active + approved)");
  assert.equal(mine.responseWindowHours, RESPONSE_WINDOW_HOURS);
  assert.equal(mine.scopeStatement, SCOPE_STATEMENT);
});

test("P8 (§13): a bare service (never captured) reads back absent/null, never a fabricated default", async () => {
  const id = await makeService({ ownerId: owner.id, deliveryMethod: "async_messaging" });
  const res = await api(`/api/services/${id}`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.responseWindowHours, null);
  assert.equal(body.scopeStatement, null);
  assert.ok(body.joinLink === undefined || body.joinLink === null);
});
