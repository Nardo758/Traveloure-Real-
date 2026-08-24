/**
 * D4 — OPEN-SLOT suggestedFrame BRANCH (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md,
 * decision-maker ratified Aug 10 2026).
 *
 * GET /api/me/posting-opportunities (server/routes/expert-console.routes.ts) maps each
 * opportunity to a suggested share frame. The `new_review` -> "review" mapping was verified
 * live already; the open-slot branch (a service WITH service_route_points rows suggests
 * "route", one WITHOUT suggests "feed" — ruling 22(d): the route frame's own share-image
 * endpoint 404s on a service with no route stops, so an honest absence never gets a fabricated
 * route card, §13) had never been exercised. This suite proves both open-slot outcomes.
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000, same
 * posture as short-links-frame.http.test.ts — fixtures via the app's own auth API for the user
 * (real FK-safe id + session cookie), direct disposable-DB-guarded SQL for provider_services /
 * vendor_availability_slots / service_route_points rows (no HTTP path needed for any of them
 * here).
 *
 * Run solo: npx tsx --test server/__tests__/posting-opportunities-frame.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors short-links-frame.http.test.ts; never defaults open) ──
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
      `[posting-opportunities-frame] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `pof-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

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
    body: JSON.stringify({ email, password: PASSWORD, firstName: "PostingOpp", lastName: label }),
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

async function makeService(ownerId: string, label: string): Promise<string> {
  const id = `pof-${RUN}-svc-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, 'fixture posting-opportunities frame service', '40.00', 'active', 'approved', 'pdf')`,
    [id, ownerId, `D4 posting-opp service ${label} ${RUN}`],
  );
  createdServiceIds.push(id);
  return id;
}

async function addOpenSlot(serviceId: string, ownerId: string): Promise<void> {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await readPool.query(
    `INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
     VALUES ($1, $2, $3, $4, 5, 0, 'available')`,
    [crypto.randomUUID(), serviceId, ownerId, futureDate],
  );
}

async function addRouteStop(serviceId: string): Promise<void> {
  await readPool.query(
    `INSERT INTO service_route_points (id, service_id, "position", name, latitude, longitude)
     VALUES ($1, $2, 1, 'Fixture stop', 35.0116, 135.7681)`,
    [crypto.randomUUID(), serviceId],
  );
}

let owner: Actor;
let routeServiceId: string;
let feedServiceId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  owner = await registerActor("owner");
  routeServiceId = await makeService(owner.id, "route");
  feedServiceId = await makeService(owner.id, "feed");

  // Both services get an open slot (the thing that makes them 'open_slots' opportunities at
  // all); only routeServiceId additionally gets a route_points row.
  await addOpenSlot(routeServiceId, owner.id);
  await addOpenSlot(feedServiceId, owner.id);
  await addRouteStop(routeServiceId);
});

after(async () => {
  try {
    await assertDisposableDb();
    // provider_services -> vendor_availability_slots / service_route_points both cascade
    // ON DELETE CASCADE, so deleting the services is sufficient cleanup for all three tables.
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

test("D4-open-1: an open-slot service WITH route_points rows suggests frame 'route'", async () => {
  const res = await api("/api/me/posting-opportunities", owner.cookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  const opp = (body.opportunities as any[]).find(
    (o) => o.kind === "open_slots" && o.serviceId === routeServiceId,
  );
  assert.ok(opp, "expected an open_slots opportunity for the route-stopped service");
  assert.equal(opp.suggestedFrame, "route");
});

test("D4-open-2: an open-slot service WITHOUT route_points rows suggests frame 'feed'", async () => {
  const res = await api("/api/me/posting-opportunities", owner.cookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  const opp = (body.opportunities as any[]).find(
    (o) => o.kind === "open_slots" && o.serviceId === feedServiceId,
  );
  assert.ok(opp, "expected an open_slots opportunity for the route-less service");
  assert.equal(opp.suggestedFrame, "feed");
});
