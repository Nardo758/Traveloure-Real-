/**
 * F2 publish-verification gate — ROLE-AWARE fix (QA_PUNCH_LIST.md P0, decision-maker ratified
 * Aug 10 2026: "Yes, experts need to verify their identity.").
 *
 * be78a9c introduced a Phase-0.5 publish gate on POST/PATCH /api/provider/services that fires on
 * `status: "active"` and required a verified `service_provider_forms` row — which blocked EVERY
 * expert, since expert verification lives in `local_expert_forms` (no `business_verification_status`
 * column at all there). The fix, factored into one shared `checkPublishVerificationGate` helper
 * used by both routes (server/routes.ts):
 *   - admin (DB role lookup, not req.user.role) -> bypass entirely.
 *   - isProviderRole -> service_provider_forms row, BOTH identity AND business "verified".
 *   - isExpertRole -> local_expert_forms row, identity "verified" ONLY.
 *   - anything else / no form row -> default-deny, blocked.
 * Error copy routes per role: providers -> /provider-status, experts -> /expert-status.
 * Draft saves (status !== "active") are never gated for anyone.
 *
 * This suite proves: (a) a VERIFIED expert publishes; (b) an UNVERIFIED expert is blocked with the
 * expert-routed message; (c) a provider still requires BOTH statuses; (d) an admin bypasses;
 * (e) a draft save is never gated, for any of the above.
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000, same
 * posture as short-links-frame.http.test.ts / service-deliverable.http.test.ts — fixtures via the
 * app's own auth API for the user (real FK-safe id + session cookie), direct disposable-DB-guarded
 * SQL to set `users.role` and the verification-form rows (there is no HTTP path for either — role
 * assignment and admin-reviewed verification are both operator/admin actions in real life).
 *
 * Run solo: npx tsx --test server/__tests__/f2-verification-gate.http.test.ts
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
      `[f2-verification-gate] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `f2vg-${RUN}-${label}@t.test`;
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
    body: JSON.stringify({ email, password: PASSWORD, firstName: "F2Gate", lastName: label }),
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

async function setRole(userId: string, role: string): Promise<void> {
  await readPool.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, userId]);
}

// No unique constraint on (user_id) for either forms table, so this is a plain INSERT — safe
// here because each userId is a freshly-registered fixture user with no pre-existing form row.
async function upsertExpertForm(userId: string, identityStatus: string): Promise<void> {
  await readPool.query(
    `INSERT INTO local_expert_forms (id, user_id, identity_verification_status)
     VALUES ($1, $2, $3)`,
    [crypto.randomUUID(), userId, identityStatus],
  );
}

async function upsertProviderForm(userId: string, identityStatus: string, businessStatus: string): Promise<void> {
  await readPool.query(
    `INSERT INTO service_provider_forms
       (id, user_id, business_name, name, email, mobile, country, address, business_type,
        identity_verification_status, business_verification_status)
     VALUES ($1, $2, 'F2 Gate Test Biz', 'F2 Gate Tester', 'f2gate@t.test', '+1-555-0100',
             'USA', '123 Test St', 'tour_operator', $3, $4)`,
    [crypto.randomUUID(), userId, identityStatus, businessStatus],
  );
}

function servicePayload(overrides: Record<string, unknown> = {}) {
  return {
    serviceName: `F2 Gate service ${RUN}-${crypto.randomUUID().slice(0, 6)}`,
    description: "fixture f2 verification gate service",
    price: "50.00",
    // FP-1 / B7: STATE the delivery method. This fixture used to omit it, so every listing it
    // created took the `provider_services.delivery_method` DB DEFAULT of 'pdf' — which every
    // consumer of that column already treats as a real pdf listing (the storefront chip renders
    // "PDF guide", the D8 completion rule routes it to artifact_timer, and the health rail scores
    // it on `delivery_asset`), and which the new deliverable publish gate therefore also refuses to
    // publish with no file. `async_messaging` is the neutral choice here: no meeting point, no
    // calendar, no deliverable. This does not weaken the F2 proof by one inch — the suite is about
    // identity/business VERIFICATION gating, and the delivery method was never part of what it
    // asserts; it simply stops the fixture from silently claiming to be a downloadable product.
    deliveryMethod: "async_messaging",
    status: "active",
    ...overrides,
  };
}

async function publish(cookie: string, body: Record<string, unknown>) {
  const res = await api("/api/provider/services", cookie, "POST", body);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let expertVerified: Actor;
let expertUnverified: Actor;
let providerBoth: Actor;
let providerIdOnly: Actor;
let admin: Actor;
let plainUser: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  [expertVerified, expertUnverified, providerBoth, providerIdOnly, admin, plainUser] = await Promise.all([
    registerActor("expert-verified"),
    registerActor("expert-unverified"),
    registerActor("provider-both"),
    registerActor("provider-id-only"),
    registerActor("admin"),
    registerActor("plain-user"),
  ]);

  await Promise.all([
    setRole(expertVerified.id, "expert"),
    setRole(expertUnverified.id, "expert"),
    setRole(providerBoth.id, "service_provider"),
    setRole(providerIdOnly.id, "service_provider"),
    setRole(admin.id, "admin"),
    // plainUser stays default "user" — role in neither family.
  ]);

  await Promise.all([
    upsertExpertForm(expertVerified.id, "verified"),
    upsertExpertForm(expertUnverified.id, "pending"),
    upsertProviderForm(providerBoth.id, "verified", "verified"),
    upsertProviderForm(providerIdOnly.id, "verified", "pending"),
  ]);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    const ids = [expertVerified, expertUnverified, providerBoth, providerIdOnly, admin, plainUser]
      .filter(Boolean)
      .map((a) => a.id);
    if (ids.length) {
      await readPool.query(`DELETE FROM local_expert_forms WHERE user_id = ANY($1)`, [ids]).catch(() => {});
      await readPool.query(`DELETE FROM service_provider_forms WHERE user_id = ANY($1)`, [ids]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── (a) a VERIFIED expert publishes successfully ─────────────────────────────────────────────

test("F2-a: a verified expert (local_expert_forms.identity_verification_status='verified') can publish", async () => {
  const { status, json } = await publish(expertVerified.cookie, servicePayload());
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.status, "active");
  createdServiceIds.push(json.id);
});

// ── (b) an UNVERIFIED expert is blocked, routed to /expert-status ───────────────────────────

test("F2-b: an unverified expert is blocked (403 VERIFICATION_GATE) and routed to /expert-status, not /provider-status", async () => {
  const { status, json } = await publish(expertUnverified.cookie, servicePayload());
  assert.equal(status, 403);
  assert.equal(json.code, "VERIFICATION_GATE");
  assert.equal(json.identityVerified, false);
  assert.ok(
    /expert status page|expert-status/i.test(json.message),
    `message should route to the expert status page, got: ${json.message}`,
  );
  assert.ok(
    !/provider status page|provider-status/i.test(json.message),
    `message must NOT point an expert at the provider status page, got: ${json.message}`,
  );
  // businessVerified must not read as a failed check the expert can never pass.
  assert.notEqual(json.businessVerified, false);
});

// ── (c) a provider still requires BOTH identity AND business verified ───────────────────────

test("F2-c1: a provider with identity verified but business NOT verified is still blocked", async () => {
  const { status, json } = await publish(providerIdOnly.cookie, servicePayload());
  assert.equal(status, 403);
  assert.equal(json.code, "VERIFICATION_GATE");
  assert.equal(json.identityVerified, true);
  assert.equal(json.businessVerified, false);
  assert.ok(
    /provider status page|provider-status/i.test(json.message),
    `message should route to the provider status page, got: ${json.message}`,
  );
});

test("F2-c2: a provider with BOTH identity and business verified can publish", async () => {
  const { status, json } = await publish(providerBoth.cookie, servicePayload());
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(json)}`);
  createdServiceIds.push(json.id);
});

// ── (d) an admin bypasses entirely (no form row of any kind) ────────────────────────────────

test("F2-d: an admin publishes with no verification form row at all", async () => {
  const { status, json } = await publish(admin.cookie, servicePayload());
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(json)}`);
  createdServiceIds.push(json.id);
});

// Default-deny: a role in neither family (plain "user") is blocked. Note: for THIS route the
// pre-existing `isEarner` RBAC backstop (server/middleware/role-rbac.ts, mounted on
// EARNER_SELF_SERVICE_PREFIXES in server/routes.ts) already rejects a plain "user" role before
// the handler — and therefore before checkPublishVerificationGate — ever runs, on BOTH draft and
// active writes ("Expert or provider access required", not VERIFICATION_GATE). That backstop is
// what §12/§14-style default-deny for this endpoint actually rests on; the gate's own
// "role in neither family" branch is additional defense-in-depth that this specific route can't
// currently reach via HTTP (nothing in EARNER_SELF_SERVICE_PREFIXES lets a non-earner past the
// front door), but stays correct if that middleware's coverage ever changes.
test("F2-d2: a plain user (neither expert nor provider family) cannot publish — blocked upstream by the isEarner backstop", async () => {
  const { status, json } = await publish(plainUser.cookie, servicePayload());
  assert.equal(status, 403);
});

test("F2-d3: a plain user cannot even reach a draft save — same isEarner backstop, not the F2 gate", async () => {
  const { status } = await publish(plainUser.cookie, servicePayload({ status: "draft" }));
  assert.equal(status, 403);
});

// ── (e) a draft save is NEVER gated, for any earner who IS allowed onto the route ────────────

test("F2-e: an unverified expert's draft save (status: 'draft') is never gated", async () => {
  const { status, json } = await publish(expertUnverified.cookie, servicePayload({ status: "draft" }));
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.status, "draft");
  createdServiceIds.push(json.id);
});

test("F2-e2: an under-verified provider's draft save (status: 'draft') is never gated", async () => {
  const { status, json } = await publish(providerIdOnly.cookie, servicePayload({ status: "draft" }));
  assert.equal(status, 201, `expected 201, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json.status, "draft");
  createdServiceIds.push(json.id);
});

// ── PATCH call site: same gate, exercised on an edit-to-active of an existing draft ──────────

test("F2-patch: PATCH to status:'active' on an owned draft applies the same role-aware gate (blocked case)", async () => {
  // Create as draft first (ungated), then attempt to publish via PATCH.
  const { status: createStatus, json: created } = await publish(
    expertUnverified.cookie,
    servicePayload({ status: "draft" }),
  );
  assert.equal(createStatus, 201);
  createdServiceIds.push(created.id);

  const res = await api(`/api/provider/services/${created.id}`, expertUnverified.cookie, "PATCH", {
    status: "active",
  });
  const json = await res.json();
  assert.equal(res.status, 403);
  assert.equal(json.code, "VERIFICATION_GATE");
  assert.ok(/expert status page|expert-status/i.test(json.message));
});

test("F2-patch2: PATCH to status:'active' succeeds once the expert is verified", async () => {
  const { status: createStatus, json: created } = await publish(
    expertVerified.cookie,
    servicePayload({ status: "draft" }),
  );
  assert.equal(createStatus, 201);
  createdServiceIds.push(created.id);

  const res = await api(`/api/provider/services/${created.id}`, expertVerified.cookie, "PATCH", {
    status: "active",
  });
  const json = await res.json();
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(json)}`);
  assert.equal(json.status, "active");
});
