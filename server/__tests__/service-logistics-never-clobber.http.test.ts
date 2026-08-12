/**
 * D7 NEVER-CLOBBER — the radius-or-route amendment, proven both directions on ONE service.
 * (docs/DECISIONS.md ruling 62's amendment + ruling 64; Catalog+Distribute ruling 74, lane T1.)
 *
 * The sibling suite `service-logistics-capture.http.test.ts` already proves each direction in
 * isolation (L4a: picking 'radius' deletes no route stops; L4b: picking 'route' nulls no radius).
 * THIS suite is the stronger amendment proof T1 owes: a single place-anchored service that holds
 * BOTH a `service_radius` AND `service_route_points` at once is switched
 *
 *     radius → route → radius → route
 *
 * through the OWNER PATCH the wizard uses, and after EVERY switch BOTH stores are asserted intact.
 * The mode column records WHICH store to render; ruling 62/64 forbid it from ever deleting or
 * nulling the other. This is the one load-bearing invariant of lane T1 — the presentation polish
 * is cosmetic, but the data surviving the switch is the ratified rule, so it is proven server-side
 * (§13 — the data must survive regardless of what the client sends).
 *
 * NEGATIVES FIRST: NC-1 proves a mode-only PATCH writes the mode column and NOTHING else — no
 * collateral write to the radius, the stops, or any other captured logistics field — before the
 * round-trip proofs lean on that guarantee.
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/service-logistics-never-clobber.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-logistics-capture.http.test.ts) ──────────────────────
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
      `[service-logistics-never-clobber] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
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
  const email = `slnc-${RUN}-${label}@t.test`;
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

async function createService(cookie: string, extra: Record<string, unknown> = {}) {
  return api("/api/provider/services", cookie, "POST", {
    serviceName: `D7 never-clobber ${RUN}`,
    description: "ruling-62/64 amendment fixture",
    price: "150.00",
    priceType: "fixed",
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Karasuma exit",
    status: "draft",
    location: "Kyoto",
    ...extra,
  });
}

/** Reads the full logistics + radius truth straight from the DB (not the response echo). */
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

async function routeStops(serviceId: string): Promise<{ name: string; latitude: string | null }[]> {
  const r = await readPool.query(
    `SELECT name, latitude FROM service_route_points WHERE service_id = $1 ORDER BY "position"`,
    [serviceId],
  );
  return r.rows as any;
}

let provider: Actor;
/** A service that holds BOTH a saved radius AND saved route stops — the amendment's crux fixture. */
let bothStoresServiceId: string;
const RADIUS_KM = 20;
const STOP_NAMES = ["Nishiki Market", "Gion Shirakawa", "Kiyomizu-dera"];

async function assertBothStoresIntact(where: string) {
  const row = await logisticsRow(bothStoresServiceId);
  assert.equal(Number(row.service_radius), RADIUS_KM, `${where}: the saved radius must survive`);
  const stops = await routeStops(bothStoresServiceId);
  assert.deepEqual(stops.map((s) => s.name), STOP_NAMES, `${where}: every route stop must survive in order`);
  assert.equal(stops[2].latitude, null, `${where}: the unlocated stop stays honestly coordinate-less`);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);
  await assertDisposableDb();

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
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [provider.id]);

  // Build the crux fixture: a place-anchored service that holds BOTH stores at once.
  const res = await createService(provider.cookie, {
    transportProvision: "pickup_available",
    pickupCoverageMode: "radius",
    pickupAvailable: true,
    serviceRadius: RADIUS_KM,
  });
  assert.equal(res.status, 201, `fixture create failed: ${await res.clone().text()}`);
  bothStoresServiceId = ((await res.json()) as any).id;
  createdServiceIds.push(bothStoresServiceId);

  // Save the route through the ruling-22 replace-list PUT (the stops' ONE write path).
  const put = await api(`/api/provider/services/${bothStoresServiceId}/route-points`, provider.cookie, "PUT", {
    stops: [
      { name: STOP_NAMES[0], latitude: 35.0050, longitude: 135.7649 },
      { name: STOP_NAMES[1], latitude: 35.0055, longitude: 135.7756 },
      { name: STOP_NAMES[2], latitude: null, longitude: null },
    ],
  });
  assert.equal(put.status, 200, `route save failed: ${await put.clone().text()}`);
  await assertBothStoresIntact("fixture setup");
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

// ── (NC-1) NEGATIVE FIRST — a mode-only PATCH clobbers NOTHING but the mode column ──────────────

test("NC-1 (negative): a PATCH naming only pickupCoverageMode writes the mode and nothing else", async () => {
  // A service carrying a full spread of captured logistics values AND both coverage stores.
  const res = await createService(provider.cookie, {
    transportProvision: "pickup_included",
    pickupCoverageMode: "radius",
    pickupAvailable: true,
    serviceRadius: 12,
    durationMinutes: 180,
    bufferMinutes: 30,
    partySizeMin: 2,
    partySizeMax: 8,
    changeCutoffHours: 48,
    canAnchor: true,
  });
  assert.equal(res.status, 201, await res.clone().text());
  const id = ((await res.json()) as any).id as string;
  createdServiceIds.push(id);
  await api(`/api/provider/services/${id}/route-points`, provider.cookie, "PUT", {
    stops: [{ name: "Fushimi Inari", latitude: 34.9671, longitude: 135.7727 }],
  });

  const before = await logisticsRow(id);
  // The ONLY field this PATCH names.
  const patch = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    pickupCoverageMode: "route",
  });
  assert.equal(patch.status, 200, `patch failed: ${await patch.clone().text()}`);

  const after = await logisticsRow(id);
  // The one intended change:
  assert.equal(after.pickup_coverage_mode, "route", "the mode column IS the write");
  // Everything else — including BOTH coverage stores — is byte-identical.
  for (const col of [
    "transport_provision", "duration_minutes", "buffer_minutes", "earliest_start_time",
    "latest_start_time", "service_timezone", "party_size_min", "party_size_max",
    "change_cutoff_hours", "can_anchor", "service_radius",
  ]) {
    assert.deepEqual(after[col], before[col], `${col} must be untouched by a mode-only PATCH (§13)`);
  }
  assert.equal((await routeStops(id)).length, 1, "the route stop must be untouched by a mode-only PATCH");
});

// ── (NC-2) radius → route → radius → route, both stores intact after EVERY switch ───────────────

test("NC-2: switching the coverage mode both directions never clobbers the other store", async () => {
  // Baseline (fixture): mode is 'radius', both stores populated.
  assert.equal((await logisticsRow(bothStoresServiceId)).pickup_coverage_mode, "radius");
  await assertBothStoresIntact("baseline (radius)");

  for (const mode of ["route", "radius", "route", "radius"] as const) {
    const patch = await api(`/api/provider/services/${bothStoresServiceId}`, provider.cookie, "PATCH", {
      pickupCoverageMode: mode,
    });
    assert.equal(patch.status, 200, `switch to ${mode} failed: ${await patch.clone().text()}`);
    assert.equal(
      (await logisticsRow(bothStoresServiceId)).pickup_coverage_mode,
      mode,
      `mode must now read ${mode}`,
    );
    await assertBothStoresIntact(`after switching to ${mode}`);
  }
});

// ── (NC-3) the never-clobber holds even when the mode is CLEARED entirely ───────────────────────

test("NC-3: clearing the coverage mode to null leaves both stores intact (§13)", async () => {
  const cleared = await api(`/api/provider/services/${bothStoresServiceId}`, provider.cookie, "PATCH", {
    pickupCoverageMode: null,
  });
  assert.equal(cleared.status, 200, `clear failed: ${await cleared.clone().text()}`);
  assert.equal(
    (await logisticsRow(bothStoresServiceId)).pickup_coverage_mode,
    null,
    "an explicit null clears the CHOICE",
  );
  // …but clears no DATA — both stores are exactly as they were.
  await assertBothStoresIntact("after clearing the mode");
});

// ── (NC-4) an unrelated edit (no coverage field at all) touches neither store ───────────────────

test("NC-4: an edit that names no coverage field at all preserves both stores", async () => {
  // Restore a mode so the row is in a realistic authored state, then edit something unrelated.
  await api(`/api/provider/services/${bothStoresServiceId}`, provider.cookie, "PATCH", {
    pickupCoverageMode: "route",
  });
  const edit = await api(`/api/provider/services/${bothStoresServiceId}`, provider.cookie, "PATCH", {
    shortDescription: "an edit that mentions no coverage at all",
  });
  assert.equal(edit.status, 200, `unrelated edit failed: ${await edit.clone().text()}`);
  assert.equal((await logisticsRow(bothStoresServiceId)).pickup_coverage_mode, "route", "mode unchanged");
  await assertBothStoresIntact("after an unrelated edit");
});
