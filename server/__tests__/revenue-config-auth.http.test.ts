/**
 * Task 1151 — revenue-config endpoint lockdown (server/routes/payments.routes.ts).
 *
 * Proves the auth posture added in task 1151:
 *   - GET /api/revenue-splits: 401 unauthenticated, 403 non-admin, 200 admin.
 *   - GET /api/booking-fee-config: 401 unauthenticated; with expertId/providerId params,
 *     403 for a non-admin requesting someone ELSE's context, 200 for self, 200 for admin
 *     requesting any id; 200 for any authenticated user with no id params.
 *   - /stripe/connect/return + /refresh: unauthenticated hits redirect to /login with a
 *     returnTo param instead of processing redirect state.
 *   - GET /api/fee-bands/:bandKey stays public (documented read-only rate reference).
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server (same posture as
 * f2-verification-gate.http.test.ts) — fixture users via the app's own auth API, one
 * disposable-DB-guarded SQL write to grant the admin role (no HTTP path exists for that).
 *
 * Run solo: npx tsx --test server/__tests__/revenue-config-auth.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors f2-verification-gate.http.test.ts; never defaults open) ──
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
      `[revenue-config-auth] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const emailTag = (label: string) => `rcauth-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];

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
    body: JSON.stringify({ email, password: PASSWORD, firstName: "RcAuth", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
}

let user: Actor; // plain authenticated traveler
let other: Actor; // second user whose id `user` must not be able to probe
let admin: Actor; // role flipped to admin via guarded SQL

before(async () => {
  await assertDisposableDb();
  [user, other, admin] = await Promise.all([
    registerActor("user"),
    registerActor("other"),
    registerActor("admin"),
  ]);
  await readPool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
});

after(async () => {
  if (createdEmails.length > 0) {
    await readPool.query(`DELETE FROM users WHERE email = ANY($1::varchar[])`, [createdEmails]);
  }
  await readPool.end();
});

test("GET /api/revenue-splits: 401 unauth, 403 non-admin, 200 admin", async () => {
  assert.equal((await api("/api/revenue-splits")).status, 401);
  assert.equal((await api("/api/revenue-splits", user.cookie)).status, 403);
  const adminRes = await api("/api/revenue-splits", admin.cookie);
  assert.equal(adminRes.status, 200);
  assert.ok(Array.isArray(await adminRes.json()), "admin gets the splits array");
});

test("GET /api/booking-fee-config: 401 unauth; ownership on id params", async () => {
  assert.equal((await api("/api/booking-fee-config")).status, 401);
  assert.equal((await api(`/api/booking-fee-config?expertId=${other.id}`)).status, 401);

  // No id params — any authenticated user sees category-level rates.
  assert.equal((await api("/api/booking-fee-config", user.cookie)).status, 200);

  // Non-admin cross-ID: blocked, for both param names.
  assert.equal((await api(`/api/booking-fee-config?expertId=${other.id}`, user.cookie)).status, 403);
  assert.equal((await api(`/api/booking-fee-config?providerId=${other.id}`, user.cookie)).status, 403);

  // Self-ID: allowed.
  assert.equal((await api(`/api/booking-fee-config?expertId=${user.id}`, user.cookie)).status, 200);
  assert.equal((await api(`/api/booking-fee-config?providerId=${user.id}`, user.cookie)).status, 200);

  // Admin cross-ID: allowed.
  assert.equal((await api(`/api/booking-fee-config?expertId=${other.id}`, admin.cookie)).status, 200);
  assert.equal((await api(`/api/booking-fee-config?providerId=${other.id}`, admin.cookie)).status, 200);
});

test("Stripe Connect callbacks: unauthenticated hits redirect to login with returnTo", async () => {
  for (const path of ["/stripe/connect/return", "/stripe/connect/refresh"]) {
    const res = await api(path);
    assert.equal(res.status, 302, `${path} must redirect unauthenticated hits`);
    const location = res.headers.get("location") ?? "";
    assert.ok(location.startsWith("/login?returnTo="), `${path} redirects to login (got ${location})`);
    assert.ok(location.includes(encodeURIComponent(path)), `${path} carries itself as returnTo`);
  }
  // Authenticated hit still routes by role (plain user → dashboard).
  const authed = await api("/stripe/connect/return", user.cookie);
  assert.equal(authed.status, 302);
  assert.equal(authed.headers.get("location"), "/dashboard?stripe=connected");
});

test("GET /api/fee-bands/:bandKey stays public (no auth required)", async () => {
  const res = await api("/api/fee-bands/definitely-not-a-real-band");
  // Public endpoint: reachable without a session — 404 for an unknown band, never 401.
  assert.equal(res.status, 404);
});
