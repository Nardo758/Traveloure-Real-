/**
 * D7 — THE SERVICE-LOGISTICS CAPTURE (docs/DECISIONS.md ruling 62, migration 195).
 *
 * Ruling 62 captures the `service_logistics` field set in the wizard NOW, while the provider
 * count is ~0, with consumers wired in later lanes — plus the decision-maker's ratification
 * AMENDMENT (verbatim intent): *"ensure the service provider can set EITHER a pickup RADIUS or a
 * pickup ROUTE"*.
 *
 * This suite proves, against the ALREADY-RUNNING dev server (the `service-deliverable.http`
 * posture — real routes, real DB, real HTTP):
 *
 *   (L1) Every new logistics field round-trips through POST /api/provider/services and comes
 *        back off the owner read with the value that was sent.
 *   (L2) The same fields round-trip through PATCH /api/provider/services/:id, and a PATCH that
 *        names none of them leaves the captured values alone (§13 — an unrelated edit never
 *        erases a provider's answers).
 *   (L3) An unset field stays NULL — the capture never fabricates a default.
 *   (L4) THE NEVER-CLOBBER RULE, both directions: setting `pickupCoverageMode='radius'` does not
 *        delete a single `service_route_points` row, and setting `='route'` does not null
 *        `service_radius`. Declaring a coverage mode switches what RENDERS, never what is stored.
 *   (L5) The app-enforced vocabularies actually reject: an out-of-set `transportProvision` or
 *        `pickupCoverageMode` is a 400 on BOTH the create and the update path (there is no DB
 *        CHECK behind them — migration-195 posture — so the zod enum IS the enforcement, and the
 *        update path is checked as hard as the insert).
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/service-logistics-capture.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors deliverable-protected-rail.http.test.ts) ─────────────────────
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
    // NULL inet_server_addr() (local socket/loopback) is itself a disposable-local signal.
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-logistics-capture] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = `slc-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Logi", lastName: label }),
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

/** The full D7 field set — one canonical fixture reused by the round-trip proofs. */
const LOGISTICS = {
  transportProvision: "pickup_available",
  pickupCoverageMode: "radius",
  durationMinutes: 180,
  bufferMinutes: 30,
  earliestStartTime: "08:30",
  latestStartTime: "17:00",
  serviceTimezone: "Asia/Tokyo",
  partySizeMin: 2,
  partySizeMax: 8,
  changeCutoffHours: 48,
  canAnchor: true,
} as const;

async function createService(cookie: string, extra: Record<string, unknown> = {}) {
  const res = await api("/api/provider/services", cookie, "POST", {
    serviceName: `D7 logistics ${RUN}`,
    description: "ruling-62 capture fixture",
    price: "120.00",
    priceType: "fixed",
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Karasuma exit",
    status: "draft",
    location: "Kyoto",
    ...extra,
  });
  return res;
}

/** Reads the row straight from the DB — the storage truth, not just the response echo. */
async function logisticsRow(serviceId: string) {
  const r = await readPool.query(
    `SELECT transport_provision, pickup_coverage_mode, duration_minutes, buffer_minutes,
            earliest_start_time, latest_start_time, service_timezone, party_size_min,
            party_size_max, change_cutoff_hours, can_anchor, service_radius
       FROM provider_services WHERE id = $1`,
    [serviceId],
  );
  return r.rows[0];
}

async function routeStopCount(serviceId: string): Promise<number> {
  const r = await readPool.query(`SELECT count(*)::int AS n FROM service_route_points WHERE service_id = $1`, [serviceId]);
  return r.rows[0]?.n ?? 0;
}

let provider: Actor;
let roundTripServiceId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);
  await assertDisposableDb();

  // Fail loudly (never silently pass) if migration 195 has not been applied to this database —
  // a new migration only runs on a FULL server restart.
  const cols = await readPool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'provider_services' AND column_name = 'pickup_coverage_mode'`,
  );
  assert.equal(
    cols.rowCount,
    1,
    "migration 195 has not been applied to this database — restart the dev server so runMigrations() runs",
  );

  provider = await registerActor("provider");
  // Same earner-role promotion every other provider-surface suite does (the EARNER_SELF_SERVICE
  // RBAC backstop refuses a freshly-registered non-earner before the route itself is reached).
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [provider.id]);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM service_route_points WHERE service_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── (L1) create round-trip ──────────────────────────────────────────────────────────────────

test("D7-L1: every logistics field round-trips through POST /api/provider/services", async () => {
  const res = await createService(provider.cookie, { ...LOGISTICS });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const created = (await res.json()) as any;
  roundTripServiceId = created.id;
  createdServiceIds.push(roundTripServiceId);

  const row = await logisticsRow(roundTripServiceId);
  assert.equal(row.transport_provision, "pickup_available");
  assert.equal(row.pickup_coverage_mode, "radius");
  assert.equal(row.duration_minutes, 180);
  assert.equal(row.buffer_minutes, 30);
  assert.equal(row.earliest_start_time, "08:30");
  assert.equal(row.latest_start_time, "17:00");
  assert.equal(row.service_timezone, "Asia/Tokyo");
  assert.equal(row.party_size_min, 2);
  assert.equal(row.party_size_max, 8);
  assert.equal(row.change_cutoff_hours, 48);
  assert.equal(row.can_anchor, true);

  // …and the owner read hands the same values back to the wizard that has to re-populate them.
  const readRes = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie);
  assert.equal(readRes.status, 200);
  const detail = (await readRes.json()) as any;
  assert.equal(detail.transportProvision, "pickup_available");
  assert.equal(detail.pickupCoverageMode, "radius");
  assert.equal(detail.durationMinutes, 180);
  assert.equal(detail.serviceTimezone, "Asia/Tokyo");
  assert.equal(detail.canAnchor, true);
});

// ── (L2) update round-trip + no collateral erasure ──────────────────────────────────────────

test("D7-L2: the logistics fields round-trip through PATCH, and an unrelated PATCH leaves them alone", async () => {
  const patchRes = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie, "PATCH", {
    transportProvision: "pickup_included",
    durationMinutes: 240,
    partySizeMax: 12,
    canAnchor: false,
  });
  assert.equal(patchRes.status, 200, `patch failed: ${await patchRes.clone().text()}`);

  let row = await logisticsRow(roundTripServiceId);
  assert.equal(row.transport_provision, "pickup_included");
  assert.equal(row.duration_minutes, 240);
  assert.equal(row.party_size_max, 12);
  assert.equal(row.can_anchor, false);
  // Untouched by this patch:
  assert.equal(row.buffer_minutes, 30);
  assert.equal(row.service_timezone, "Asia/Tokyo");

  // §13: an edit that says nothing about logistics erases nothing.
  const unrelated = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie, "PATCH", {
    shortDescription: "an edit that mentions no logistics at all",
  });
  assert.equal(unrelated.status, 200);
  row = await logisticsRow(roundTripServiceId);
  assert.equal(row.transport_provision, "pickup_included");
  assert.equal(row.duration_minutes, 240);
  assert.equal(row.service_timezone, "Asia/Tokyo");
  assert.equal(row.can_anchor, false);
});

// ── (L3) unset stays NULL ───────────────────────────────────────────────────────────────────

test("D7-L3: a listing that captures nothing keeps NULL — the capture fabricates no defaults", async () => {
  const res = await createService(provider.cookie);
  assert.equal(res.status, 201);
  const id = ((await res.json()) as any).id;
  createdServiceIds.push(id);

  const row = await logisticsRow(id);
  for (const col of [
    "transport_provision", "pickup_coverage_mode", "duration_minutes", "buffer_minutes",
    "earliest_start_time", "latest_start_time", "service_timezone", "party_size_min",
    "party_size_max", "change_cutoff_hours", "can_anchor",
  ]) {
    assert.equal(row[col], null, `${col} must stay NULL when never captured (§13), got ${row[col]}`);
  }
});

// ── (L4) THE NEVER-CLOBBER RULE (ruling 62's amendment) ─────────────────────────────────────

test("D7-L4a: choosing coverage mode 'radius' deletes NO route stops", async () => {
  const res = await createService(provider.cookie, { serviceRadius: 12, pickupAvailable: true });
  assert.equal(res.status, 201);
  const id = ((await res.json()) as any).id;
  createdServiceIds.push(id);

  // Save a real route through the ruling-22 replace-list PUT (the stops' ONE write path).
  const put = await api(`/api/provider/services/${id}/route-points`, provider.cookie, "PUT", {
    stops: [
      { name: "Nishiki Market", latitude: 35.0050, longitude: 135.7649 },
      { name: "Gion Shirakawa", latitude: 35.0055, longitude: 135.7756 },
      { name: "Kiyomizu-dera", latitude: null, longitude: null },
    ],
  });
  assert.equal(put.status, 200, `route save failed: ${await put.clone().text()}`);
  assert.equal(await routeStopCount(id), 3);

  const patch = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    transportProvision: "pickup_available",
    pickupCoverageMode: "radius",
  });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);

  const row = await logisticsRow(id);
  assert.equal(row.pickup_coverage_mode, "radius");
  // The whole point: the route survives untouched, all three stops including the unlocated one.
  assert.equal(await routeStopCount(id), 3, "picking radius must never delete route stops (§13)");
  const stops = await readPool.query(
    `SELECT name, latitude FROM service_route_points WHERE service_id = $1 ORDER BY "position"`,
    [id],
  );
  assert.deepEqual(stops.rows.map((s: any) => s.name), ["Nishiki Market", "Gion Shirakawa", "Kiyomizu-dera"]);
  assert.equal(stops.rows[2].latitude, null, "the unlocated stop stays honestly coordinate-less");
});

test("D7-L4b: choosing coverage mode 'route' does NOT null the saved service radius", async () => {
  const res = await createService(provider.cookie, { serviceRadius: 15, pickupAvailable: true });
  assert.equal(res.status, 201);
  const id = ((await res.json()) as any).id;
  createdServiceIds.push(id);
  assert.equal((await logisticsRow(id)).service_radius, 15);

  const patch = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    transportProvision: "pickup_included",
    pickupCoverageMode: "route",
  });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);

  const row = await logisticsRow(id);
  assert.equal(row.pickup_coverage_mode, "route");
  assert.equal(row.service_radius, 15, "picking route must never null the saved radius (§13)");
});

// ── (L5) app-enforced vocabularies (there is no DB CHECK behind them) ───────────────────────

test("D7-L5a: an out-of-set transportProvision is rejected on CREATE", async () => {
  const res = await createService(provider.cookie, { transportProvision: "helicopter" });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
});

test("D7-L5b: an out-of-set pickupCoverageMode is rejected on CREATE", async () => {
  const res = await createService(provider.cookie, { pickupCoverageMode: "polygon" });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
});

test("D7-L5c: the UPDATE path is checked as hard as the insert — both vocabularies", async () => {
  const bad1 = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie, "PATCH", {
    transportProvision: "teleport",
  });
  assert.equal(bad1.status, 400, `expected 400, got ${bad1.status}: ${await bad1.clone().text()}`);

  const bad2 = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie, "PATCH", {
    pickupCoverageMode: "isochrone",
  });
  assert.equal(bad2.status, 400, `expected 400, got ${bad2.status}: ${await bad2.clone().text()}`);

  // …and the rejected writes changed nothing.
  const row = await logisticsRow(roundTripServiceId);
  assert.equal(row.transport_provision, "pickup_included");
  assert.equal(row.pickup_coverage_mode, "radius");
});

test("D7-L5d: a malformed start-time is rejected (HH:MM is the captured shape)", async () => {
  const res = await api(`/api/provider/services/${roundTripServiceId}`, provider.cookie, "PATCH", {
    earliestStartTime: "8am",
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${await res.clone().text()}`);
});
