/**
 * PUBLISH-VERIFICATION HOLD + AUTO-ACTIVATION SWEEP (QA_PUNCH_LIST.md P0, found Aug 11 2026;
 * DECISIONS.md ruling 53's amending ruling — decision-maker option (B)).
 *
 * f2-verification-gate.http.test.ts proved `checkPublishVerificationGate` is correct at its two
 * ORIGINAL call sites (POST/PATCH /api/provider/services with status:"active"). This suite proves
 * the gate's placement was the bug: the expert ServiceForm's Submit-for-Approval never sends
 * status:"active" (it sends approvalStatus:"submitted" + status:"draft"), so the two paths that
 * ACTUALLY take a listing live — admin approval and the owner's own Activate toggle — were
 * completely ungated. Both now resolve through the SAME predicate
 * (resolvePublishVerification, server/services/publish-verification.service.ts) as the original
 * gate, never a re-implementation.
 *
 * Proves, per the option-(B) ruling:
 *   1. Admin approves an UNVERIFIED owner's listing -> approvalStatus="approved" AND
 *      status="draft" (held, not live) — for BOTH an expert (identity only) and a provider
 *      (identity + business).
 *   2. Admin approves a VERIFIED owner's listing -> approvalStatus="approved" AND
 *      status="active" — for both roles (role-agnostic, no expert/provider special-casing).
 *   3. A held (approved+draft) listing does NOT appear on the public browse read
 *      (GET /api/experts/:id/services — role-agnostic public read-gate, keyed by userId not role).
 *   4. PATCH /api/expert/services/:id/status now gates target status:"active" the same way:
 *      blocked while unverified, succeeds once verified.
 *   5. The auto-activation sweep (activateVerificationHeldListings): a verification flip
 *      activates approved+draft held rows for that user, and — the case that matters most —
 *      leaves an approved+PAUSED row for the SAME user untouched (owner intent, never
 *      overridden).
 *   6. The sweep is idempotent: running it twice changes nothing on the second pass.
 *
 * Transport: mixes real HTTP against the already-running dev server (http://127.0.0.1:5000) for
 * the two live enforcement points (admin approval, the owner PATCH toggle) with a direct import
 * of activateVerificationHeldListings/resolvePublishVerification for the sweep proofs, since no
 * HTTP endpoint triggers the sweep directly — it fires from inside the Stripe verification
 * webhook handlers (server/routes/webhooks.routes.ts), which this suite does not re-drive.
 * Fixture writes go through direct disposable-DB-guarded SQL for role/verification-form state,
 * matching f2-verification-gate.http.test.ts's rationale (no HTTP path exists for either).
 *
 * Run solo: npx tsx --test server/__tests__/publish-verification-hold.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { providerServices } from "@shared/schema";
import { activateVerificationHeldListings, resolvePublishVerification } from "../services/publish-verification.service";

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
      `[publish-verification-hold] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `pvh-${RUN}-${label}@t.test`;
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
    body: JSON.stringify({ email, password: PASSWORD, firstName: "PVHold", lastName: label }),
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
     VALUES ($1, $2, 'PV Hold Test Biz', 'PV Hold Tester', 'pvhold@t.test', '+1-555-0100',
             'USA', '123 Test St', 'tour_operator', $3, $4)`,
    [crypto.randomUUID(), userId, identityStatus, businessStatus],
  );
}

async function setFormVerification(userId: string, role: "expert" | "provider", field: "identity" | "business", status: string): Promise<void> {
  if (role === "expert") {
    await readPool.query(
      `UPDATE local_expert_forms SET identity_verification_status = $1 WHERE user_id = $2`,
      [status, userId],
    );
  } else {
    const col = field === "identity" ? "identity_verification_status" : "business_verification_status";
    await readPool.query(`UPDATE service_provider_forms SET ${col} = $1 WHERE user_id = $2`, [status, userId]);
  }
}

function servicePayload(overrides: Record<string, unknown> = {}) {
  return {
    serviceName: `PV Hold service ${RUN}-${crypto.randomUUID().slice(0, 6)}`,
    description: "fixture publish-verification hold service",
    price: "50.00",
    status: "draft", // ungated create; migration 111 F2-CLOSED: born approvalStatus="submitted"
    ...overrides,
  };
}

// Create a fixture listing as `draft` (ungated) via the actor's own cookie, born
// approvalStatus="submitted" by the schema default — ready for admin approval below.
async function createSubmittedFixture(cookie: string): Promise<string> {
  const res = await api("/api/provider/services", cookie, "POST", servicePayload());
  const json = await res.json();
  assert.equal(res.status, 201, `fixture create failed (${res.status}): ${JSON.stringify(json)}`);
  createdServiceIds.push(json.id);
  return json.id as string;
}

async function approveAsAdmin(adminCookie: string, serviceId: string) {
  const res = await api(`/api/admin/provider-services/${serviceId}/approve`, adminCookie, "POST");
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function readRow(serviceId: string): Promise<{ approvalStatus: string | null; status: string | null }> {
  const [row] = await db
    .select({ approvalStatus: providerServices.approvalStatus, status: providerServices.status })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId))
    .limit(1);
  return { approvalStatus: row?.approvalStatus ?? null, status: row?.status ?? null };
}

let expertUnverified: Actor;
let expertVerified: Actor;
let providerUnverified: Actor;
let providerVerified: Actor;
let sweepExpert: Actor; // dedicated actor for the sweep tests (held + paused rows)
let admin: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  [expertUnverified, expertVerified, providerUnverified, providerVerified, sweepExpert, admin] = await Promise.all([
    registerActor("expert-unverified"),
    registerActor("expert-verified"),
    registerActor("provider-unverified"),
    registerActor("provider-verified"),
    registerActor("sweep-expert"),
    registerActor("admin"),
  ]);

  await Promise.all([
    setRole(expertUnverified.id, "expert"),
    setRole(expertVerified.id, "expert"),
    setRole(providerUnverified.id, "service_provider"),
    setRole(providerVerified.id, "service_provider"),
    setRole(sweepExpert.id, "expert"),
    setRole(admin.id, "admin"),
  ]);

  await Promise.all([
    upsertExpertForm(expertUnverified.id, "pending"),
    upsertExpertForm(expertVerified.id, "verified"),
    upsertProviderForm(providerUnverified.id, "pending", "pending"),
    upsertProviderForm(providerVerified.id, "verified", "verified"),
    upsertExpertForm(sweepExpert.id, "pending"),
  ]);

  // Admin session (test-admin@traveloure.test also exists seeded, but a freshly-registered
  // + role-flipped actor keeps this suite self-contained like f2-verification-gate.http does).
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: PASSWORD }),
  });
  assert.equal(loginRes.status, 200, "admin re-login must succeed after role flip");
  const setCookie = loginRes.headers.get("set-cookie");
  assert.ok(setCookie, "admin login must set a session cookie");
  admin = { ...admin, cookie: setCookie!.split(";")[0] };
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    const actors = [expertUnverified, expertVerified, providerUnverified, providerVerified, sweepExpert, admin].filter(Boolean);
    const ids = actors.map((a) => a.id);
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

// ── (1)+(3) admin approves an UNVERIFIED expert's listing -> held, not live, not public ─────

test("PVH-1a: admin approving an UNVERIFIED expert's listing lands approved+draft (held, not live)", async () => {
  const serviceId = await createSubmittedFixture(expertUnverified.cookie);
  const { status, json } = await approveAsAdmin(admin.cookie, serviceId);
  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);

  const row = await readRow(serviceId);
  assert.equal(row.approvalStatus, "approved", "admin's review work must still be recorded");
  assert.notEqual(row.status, "active", "must NOT be live for an unverified owner");
  assert.equal(row.status, "draft", "held state is approved+draft by construction");

  // Public browse must not surface it — it is not publicly live.
  const browseRes = await api(`/api/experts/${expertUnverified.id}/services`, undefined, "GET");
  const browseJson = (await browseRes.json()) as any[];
  assert.ok(
    !browseJson.some((s) => s.id === serviceId),
    "a held (approved+draft) listing must not appear in the public browse read",
  );
});

// ── (2)+(3) admin approves a VERIFIED expert's listing -> live, and public ──────────────────

test("PVH-1b: admin approving a VERIFIED expert's listing lands approved+active (live) and appears publicly", async () => {
  const serviceId = await createSubmittedFixture(expertVerified.cookie);
  const { status, json } = await approveAsAdmin(admin.cookie, serviceId);
  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);

  const row = await readRow(serviceId);
  assert.equal(row.approvalStatus, "approved");
  assert.equal(row.status, "active");

  const browseRes = await api(`/api/experts/${expertVerified.id}/services`, undefined, "GET");
  const browseJson = (await browseRes.json()) as any[];
  assert.ok(
    browseJson.some((s) => s.id === serviceId),
    "an approved+active listing must appear in the public browse read",
  );
});

// ── same two proofs for a PROVIDER (role-agnostic — business+identity, not just identity) ───

test("PVH-2a: admin approving an UNVERIFIED provider's listing lands approved+draft (held)", async () => {
  const serviceId = await createSubmittedFixture(providerUnverified.cookie);
  const { status } = await approveAsAdmin(admin.cookie, serviceId);
  assert.equal(status, 200);

  const row = await readRow(serviceId);
  assert.equal(row.approvalStatus, "approved");
  assert.equal(row.status, "draft");
});

test("PVH-2b: admin approving a provider verified on BOTH identity and business lands approved+active", async () => {
  const serviceId = await createSubmittedFixture(providerVerified.cookie);
  const { status } = await approveAsAdmin(admin.cookie, serviceId);
  assert.equal(status, 200);

  const row = await readRow(serviceId);
  assert.equal(row.approvalStatus, "approved");
  assert.equal(row.status, "active");
});

test("PVH-2c: admin approving a provider verified on identity ONLY (business still pending) still lands approved+draft", async () => {
  const serviceId = await createSubmittedFixture(providerUnverified.cookie);
  await setFormVerification(providerUnverified.id, "provider", "identity", "verified");
  // business stays "pending" — a partial provider verification must still hold, proving the
  // admin-approval gate checks the FULL predicate, not just "some" verification.
  const { status } = await approveAsAdmin(admin.cookie, serviceId);
  assert.equal(status, 200);

  const row = await readRow(serviceId);
  assert.equal(row.approvalStatus, "approved");
  assert.equal(row.status, "draft");

  // restore for isolation from later tests using the same actor
  await setFormVerification(providerUnverified.id, "provider", "identity", "pending");
});

// ── (4) PATCH /api/expert/services/:id/status now gates target status:"active" ──────────────

test("PVH-3a: unverified owner's own Activate toggle (PATCH .../status active) is blocked", async () => {
  const serviceId = await createSubmittedFixture(expertUnverified.cookie);
  // Approve first (as admin) so it's a legitimate approved listing an owner could try to
  // re-activate — but the owner is still unverified, so it stays held.
  await approveAsAdmin(admin.cookie, serviceId);

  const res = await api(`/api/expert/services/${serviceId}/status`, expertUnverified.cookie, "PATCH", {
    status: "active",
  });
  const json = await res.json();
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(json)}`);
  assert.equal(json.code, "VERIFICATION_GATE");

  const row = await readRow(serviceId);
  assert.equal(row.status, "draft", "blocked toggle must not have moved the row to active");
});

test("PVH-3b: verified owner's Activate toggle succeeds", async () => {
  const serviceId = await createSubmittedFixture(expertVerified.cookie);
  await approveAsAdmin(admin.cookie, serviceId); // verified owner -> lands active already
  // Pause it first so the toggle back to active is a real transition, not a no-op.
  const pauseRes = await api(`/api/expert/services/${serviceId}/status`, expertVerified.cookie, "PATCH", {
    status: "paused",
  });
  assert.equal(pauseRes.status, 200);

  const res = await api(`/api/expert/services/${serviceId}/status`, expertVerified.cookie, "PATCH", {
    status: "active",
  });
  const json = await res.json();
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(json)}`);
  assert.equal(json.status, "active");
});

// ── (5)+(6) the auto-activation sweep: held rows activate, PAUSED rows are untouched, idempotent ─

test("PVH-4: verification flip activates approved+draft held rows but leaves an approved+paused row for the SAME user untouched; sweep is idempotent", async () => {
  // Two fixtures for the same owner: one that will be HELD (approved+draft), one that
  // reaches active-then-owner-paused (approved+paused = owner intent).
  const heldId = await createSubmittedFixture(sweepExpert.cookie);
  const pausedId = await createSubmittedFixture(sweepExpert.cookie);

  // Owner starts unverified: admin-approve both -> both land held (approved+draft).
  const heldApprove = await approveAsAdmin(admin.cookie, heldId);
  assert.equal(heldApprove.status, 200);
  const pausedApprove = await approveAsAdmin(admin.cookie, pausedId);
  assert.equal(pausedApprove.status, 200);

  let heldRow = await readRow(heldId);
  let pausedRow = await readRow(pausedId);
  assert.deepEqual(heldRow, { approvalStatus: "approved", status: "draft" });
  assert.deepEqual(pausedRow, { approvalStatus: "approved", status: "draft" });

  // Verify the owner (simulating the identity-verification webhook write), then directly
  // put `pausedId` into approved+paused via the DB — the deliberate PRE-EXISTING owner-intent
  // state the sweep must never touch even though it shares approvalStatus="approved" with the
  // held row. (In real life this only happens after go-live + a Pause; represented directly
  // here because the sweep's predicate cares about the STATE, not the history that produced it.)
  await readPool.query(`UPDATE provider_services SET status = 'paused' WHERE id = $1`, [pausedId]);
  pausedRow = await readRow(pausedId);
  assert.equal(pausedRow.status, "paused");

  await setFormVerification(sweepExpert.id, "expert", "identity", "verified");
  const verification = await resolvePublishVerification(sweepExpert.id);
  assert.equal(verification.ok, true, "sanity: predicate must now pass for this user");

  const activatedCount = await activateVerificationHeldListings(sweepExpert.id);
  assert.ok(activatedCount >= 1, `expected at least 1 row activated, got ${activatedCount}`);

  heldRow = await readRow(heldId);
  pausedRow = await readRow(pausedId);
  assert.equal(heldRow.status, "active", "the held (approved+draft) row must be activated");
  assert.equal(
    pausedRow.status,
    "paused",
    "an approved+paused row for the SAME user must be left untouched — owner intent is never overridden",
  );

  // Idempotency: running the sweep again changes nothing (heldId is already 'active' so it no
  // longer matches the approved+draft predicate; pausedId is never touched regardless).
  const secondPassCount = await activateVerificationHeldListings(sweepExpert.id);
  assert.equal(secondPassCount, 0, "a second sweep pass over the same user must activate zero rows");

  heldRow = await readRow(heldId);
  pausedRow = await readRow(pausedId);
  assert.equal(heldRow.status, "active");
  assert.equal(pausedRow.status, "paused");

  // restore for isolation
  await setFormVerification(sweepExpert.id, "expert", "identity", "pending");
});

test("PVH-5: the sweep safely no-ops for a user who still fails the predicate", async () => {
  const heldId = await createSubmittedFixture(expertUnverified.cookie);
  const approveRes = await approveAsAdmin(admin.cookie, heldId);
  assert.equal(approveRes.status, 200);

  let row = await readRow(heldId);
  assert.equal(row.status, "draft");

  // expertUnverified's identity is still "pending" — the sweep must no-op, not fabricate a pass.
  const count = await activateVerificationHeldListings(expertUnverified.id);
  assert.equal(count, 0);

  row = await readRow(heldId);
  assert.equal(row.status, "draft", "must remain held — never activated on a failing predicate");
});
