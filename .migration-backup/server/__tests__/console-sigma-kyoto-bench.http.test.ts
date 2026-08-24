/**
 * CONSOLE-SIGMA Phase 2 — Kyoto expert fixture (R23) + admin-bridge regression (A1).
 *
 * R23 (ruling 23): the Kyoto expert fixture is seeded via the FULL lifecycle
 * (submission → pending → admin approval), never bypassing the application guard.
 * The seeding itself is an assertion pass:
 *   K1 born-approved is impossible through the application guard — the insert
 *      schema strips `status` (and the expertType privilege-escalation clamp
 *      rejects out-of-vocabulary roles); the DB fact of a fresh submission is
 *      status='pending'.
 *   K2 approval cannot precede submission (no form row → 404, no role flip).
 *   K3 full lifecycle on a throwaway probe: pending → admin PATCH approved →
 *      DB facts: form status='approved' AND users.role flipped to the clamped
 *      expertType.
 *   K4 the DURABLE bench fixture kyoto-temples@traveloure.test is seeded through
 *      the same lifecycle (idempotent: if it already exists, its facts are
 *      re-asserted). It is intentionally NOT cleaned up — built once, owned here,
 *      consumed by the journey suite (see the bench registry in
 *      docs/testing/CONSOLE_SIGMA_AUDIT.md §12).
 *
 * §11 re-diff note: the dispatch's "application guard + DB CHECK" premise is
 * half-true — there is NO DB CHECK on local_expert_forms.status (schema comment
 * confirms: "The varchar column has no DB CHECK — this is the gate", the gate
 * being insertLocalExpertFormSchema). K1 therefore exercises the REAL gate at
 * its actual layer; the missing CHECK is recorded as a §11 finding.
 *
 * A1 (ruling 20, spec flag #1 — batched here from Phase 1): the admin
 * lead→workspace bridge POST /api/admin/routing-queue/:requestId/confirm
 * (legacy alias of /api/admin/leads/:expertRequestId/confirm) transactionally
 *   (a) inserts the trip_expert_advisors row (status=assigned, workspace=draft)
 *   (b) flips expert_requests.status='assigned'
 *   A1-403: non-admin actor → 403 and NEITHER write lands.
 *   A1-TX:  both writes land on success.
 *   A1-PF:  partial-failure probe — an assigned_expert_id pointing at a
 *           nonexistent user makes write (a) violate its FK; the transaction
 *           must roll back so write (b) never lands either (both-or-neither).
 *
 * Every green is a DB fact. Dev DB only; throwaway rows cleaned in `after`;
 * the K4 bench fixture is the sole intentional survivor.
 *
 * Run with: npx tsx --test server/__tests__/console-sigma-kyoto-bench.http.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import passport from "passport";
import type { Server } from "http";

delete process.env.REPL_ID;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
}
// Hermetic: the approval path fires a best-effort congratulations email. Point the
// mail provider at a dummy key so no real send is attempted (failures are caught
// and logged non-fatally by the route).
process.env.RESEND_API_KEY = "re_test_dummy_console_sigma";

const { db, pool } = await import("../db");
const { and, eq } = await import("drizzle-orm");
const { users, trips, tripExpertAdvisors, expertRequests, localExpertForms, insertLocalExpertFormSchema } =
  await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { storage } = await import("../storage");
const adminRoutes = (await import("../routes/admin.routes")).default;

const PASSWORD = "test-password-sigma2";
/** Standard fixture-bench convention (audit §0.7 / ruling 23). */
const BENCH_PASSWORD = "TestPass123!";
const BENCH_EMAIL = "kyoto-temples@traveloure.test";

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(salt + ":" + key.toString("hex"));
    });
  });
}

let server: Server;
let baseUrl: string;
let adminCookie: string;
let nonAdminCookie: string;
let adminId: string;
let probeApplicantId: string;
let nonAdminId: string;
let tripId: string;
let requestOkId: string; // A1-TX: healthy lead
let requestPfId: string; // A1-PF: lead whose assigned expert does not exist
const GHOST_EXPERT_ID = `sigma2-ghost-${crypto.randomUUID()}`;
let benchUserCreatedThisRun = false;
let benchUserId: string | null = null;

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login failed for ${email}: ${await res.text()}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

/** Submit an application the way the route does: parse through the REAL guard, then create. */
async function submitApplication(userId: string, raw: Record<string, unknown>) {
  const input = insertLocalExpertFormSchema.parse(raw);
  return storage.createLocalExpertForm({ ...(input as any), userId });
}

function confirmLead(requestId: string, cookie: string) {
  return fetch(`${baseUrl}/api/admin/routing-queue/${requestId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
  });
}

async function requestStatus(id: string): Promise<string | null> {
  const [row] = await db.select({ s: expertRequests.status }).from(expertRequests).where(eq(expertRequests.id, id));
  return row?.s ?? null;
}

async function advisorRows(trip: string) {
  return db.select().from(tripExpertAdvisors).where(eq(tripExpertAdvisors.tripId, trip));
}

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
  setupEmailAuth(app);
  app.use(adminRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  adminId = crypto.randomUUID();
  probeApplicantId = crypto.randomUUID();
  nonAdminId = crypto.randomUUID();
  const password = await hashPassword(PASSWORD);
  await db.insert(users).values([
    { id: adminId, email: `sigma2-admin-${adminId.slice(0, 8)}@t.test`, password, firstName: "Sigma2", lastName: "Admin", role: "admin", authProvider: "email" },
    { id: probeApplicantId, email: `sigma2-applicant-${probeApplicantId.slice(0, 8)}@t.test`, password, firstName: "Sigma2", lastName: "Applicant", role: "traveler", authProvider: "email" },
    { id: nonAdminId, email: `sigma2-nonadmin-${nonAdminId.slice(0, 8)}@t.test`, password, firstName: "Sigma2", lastName: "NonAdmin", role: "local_expert", authProvider: "email" },
  ] as any);

  const [trip] = await db
    .insert(trips)
    .values({ userId: probeApplicantId, title: "Console-sigma A1 bridge trip", destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-05" } as any)
    .returning({ id: trips.id });
  tripId = trip.id;

  // A1 leads: one healthy (assigned expert = real non-admin expert user), one poisoned
  // (assigned expert id points at NO users row → advisor insert violates its FK).
  const inserted = await db
    .insert(expertRequests)
    .values([
      { tripId, userId: probeApplicantId, destinationCity: "Kyoto", requestType: "expert_help", status: "pending", assignedExpertId: nonAdminId } as any,
      { tripId, userId: probeApplicantId, destinationCity: "Kyoto", requestType: "expert_help", status: "pending", assignedExpertId: GHOST_EXPERT_ID } as any,
    ])
    .returning({ id: expertRequests.id, assigned: expertRequests.assignedExpertId });
  requestOkId = inserted.find((r) => r.assigned === nonAdminId)!.id;
  requestPfId = inserted.find((r) => r.assigned === GHOST_EXPERT_ID)!.id;

  adminCookie = await login(`sigma2-admin-${adminId.slice(0, 8)}@t.test`, PASSWORD);
  nonAdminCookie = await login(`sigma2-nonadmin-${nonAdminId.slice(0, 8)}@t.test`, PASSWORD);
});

after(async () => {
  try {
    // Trip cascade removes expert_requests + trip_expert_advisors; user cascade removes
    // local_expert_forms, notifications. The K4 bench fixture is deliberately kept.
    if (tripId) await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    for (const id of [probeApplicantId, nonAdminId, adminId]) {
      if (id) await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  } finally {
    server?.close();
    await pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// K1 (ruling 23): born-approved is impossible through the application guard.
// The guard is insertLocalExpertFormSchema (no DB CHECK exists — §11 finding):
// a smuggled status is STRIPPED, and the DB fact of the created row is 'pending'.
// The expertType privilege-escalation clamp is asserted on the same layer.
// ---------------------------------------------------------------------------
test("K1: smuggled status:'approved' is stripped by the guard; fresh submission lands status='pending'", async () => {
  assert.throws(
    () => insertLocalExpertFormSchema.parse({ firstName: "Evil", expertType: "admin" }),
    "expertType outside the enum vocabulary must be rejected (privilege-escalation clamp)",
  );

  const form = await submitApplication(probeApplicantId, {
    firstName: "Sigma2",
    lastName: "Applicant",
    email: `sigma2-applicant-${probeApplicantId.slice(0, 8)}@t.test`,
    city: "Kyoto",
    country: "Japan",
    expertType: "local_expert",
    status: "approved", // the smuggle attempt — must be stripped, not honored
  });
  const [row] = await db.select().from(localExpertForms).where(eq(localExpertForms.id, form.id));
  assert.equal(row.status, "pending", "born-approved must be impossible: DB fact is 'pending'");
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, probeApplicantId));
  assert.equal(u.role, "traveler", "submission alone must not flip the role");
});

// ---------------------------------------------------------------------------
// K2 (ruling 23): approval cannot precede submission — no form row means 404
// and no write anywhere.
// ---------------------------------------------------------------------------
test("K2: approving a nonexistent application is a 404", async () => {
  const res = await fetch(`${baseUrl}/api/admin/expert-applications/${crypto.randomUUID()}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// K3 (ruling 23): the full lifecycle on the probe applicant — pending → admin
// approval over real HTTP → DB facts: form approved + users.role clamped flip.
// ---------------------------------------------------------------------------
test("K3: admin approval flips form to 'approved' and users.role to the clamped expertType", async () => {
  const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, probeApplicantId));
  assert.equal(form.status, "pending", "lifecycle precondition: K1 left the probe application pending");

  const res = await fetch(`${baseUrl}/api/admin/expert-applications/${form.id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(res.status, 200, await res.clone().text());

  const [after1] = await db.select({ s: localExpertForms.status }).from(localExpertForms).where(eq(localExpertForms.id, form.id));
  assert.equal(after1.s, "approved");
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, probeApplicantId));
  assert.equal(u.role, "local_expert", "approval must flip users.role to the form's (clamped) expertType");
});

// ---------------------------------------------------------------------------
// K4 (ruling 23): the DURABLE bench fixture — kyoto-temples@traveloure.test —
// seeded via the SAME lifecycle, idempotently. Never cleaned up: it is the
// journey suite's Kyoto expert (bench registry: audit §12).
// ---------------------------------------------------------------------------
test("K4: durable Kyoto bench fixture exists via the full lifecycle (reconciling, idempotent)", async () => {
  // RECONCILE, don't just branch on user-exists: a prior interrupted run may have
  // left a partial fixture (user without form, pending/rejected form, stale
  // password). Every repair step goes through the same lifecycle layers — the
  // application guard for submission, the admin HTTP route for approval. The only
  // direct write is the deterministic bench password (auth credential, not
  // lifecycle state).
  let [bench] = await db.select().from(users).where(eq(users.email, BENCH_EMAIL));
  if (!bench) {
    benchUserCreatedThisRun = true;
    const id = crypto.randomUUID();
    const password = await hashPassword(BENCH_PASSWORD);
    await db.insert(users).values({
      id, email: BENCH_EMAIL, password, firstName: "Kyoto", lastName: "Temples",
      role: "traveler", authProvider: "email",
    } as any);
    [bench] = await db.select().from(users).where(eq(users.email, BENCH_EMAIL));
  } else {
    // Deterministic credential policy: the bench password is part of the fixture
    // contract, so converge it (covers a pre-existing user seeded another way).
    await db
      .update(users)
      .set({ password: await hashPassword(BENCH_PASSWORD), authProvider: "email" } as any)
      .where(eq(users.id, bench.id));
  }

  // Form reconciliation through the real lifecycle:
  let [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, bench.id));
  if (!form) {
    form = await submitApplication(bench.id, {
      firstName: "Kyoto", lastName: "Temples", email: BENCH_EMAIL,
      city: "Kyoto", country: "Japan", expertType: "local_expert",
      specialties: ["temples", "shrines"], languages: ["ja", "en"],
      bio: "Console-sigma journey-suite bench fixture: Kyoto temple & shrine specialist.",
    });
  }
  if (form.status !== "approved") {
    // pending (fresh or interrupted) or rejected — the admin approval route is the
    // lifecycle-legitimate repair for both.
    const res = await fetch(`${baseUrl}/api/admin/expert-applications/${form.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(res.status, 200, `bench approval failed: ${await res.clone().text()}`);
  }
  [bench] = await db.select().from(users).where(eq(users.email, BENCH_EMAIL));
  benchUserId = bench.id;

  // Facts every run must re-prove, whether freshly seeded or pre-existing:
  assert.equal(bench.role, "local_expert", "bench fixture must be a lifecycle-approved local expert");
  const [finalForm] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, bench.id));
  assert.ok(finalForm, "bench fixture must own an application row (lifecycle provenance, not a bare role flip)");
  assert.equal(finalForm.status, "approved");
  assert.equal(finalForm.city, "Kyoto");

  // The bench account must actually be able to log in with the standard convention.
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: BENCH_EMAIL, password: BENCH_PASSWORD }),
  });
  assert.equal(loginRes.status, 200, "bench fixture must log in with the standard convention password");
});

// ---------------------------------------------------------------------------
// A1-403 (ruling 20): a non-admin actor is rejected and NEITHER write lands.
// ---------------------------------------------------------------------------
test("A1-403: non-admin confirm is 403; no advisor row, lead status unchanged", async () => {
  const res = await confirmLead(requestOkId, nonAdminCookie);
  assert.equal(res.status, 403);
  assert.equal((await advisorRows(tripId)).length, 0);
  assert.equal(await requestStatus(requestOkId), "pending");
});

// ---------------------------------------------------------------------------
// A1-PF (ruling 20): partial-failure probe. The poisoned lead's advisor insert
// violates the users FK inside the transaction → BOTH writes must vanish.
// Run BEFORE the healthy confirm so "no advisor rows for the trip" is unambiguous.
// ---------------------------------------------------------------------------
test("A1-PF: induced insert failure rolls back the whole bridge — neither write lands", async () => {
  const res = await confirmLead(requestPfId, adminCookie);
  assert.equal(res.status, 500, `expected the FK violation to surface, got ${res.status}: ${await res.clone().text()}`);
  assert.equal((await advisorRows(tripId)).length, 0, "rollback must leave no advisor row");
  assert.equal(await requestStatus(requestPfId), "pending", "rollback must leave the lead un-flipped (both-or-neither)");
});

// ---------------------------------------------------------------------------
// A1-TX (ruling 20, expected-PASS regression for spec flag #1): the healthy
// confirm lands BOTH writes — advisor row (assigned/draft) + lead flip.
// ---------------------------------------------------------------------------
test("A1-TX: admin confirm writes the advisor row AND flips the lead in one transaction", async () => {
  const res = await confirmLead(requestOkId, adminCookie);
  assert.equal(res.status, 200, await res.clone().text());
  const rows = await advisorRows(tripId);
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as any).localExpertId, nonAdminId);
  assert.equal((rows[0] as any).status, "assigned");
  assert.equal((rows[0] as any).workspaceStatus, "draft");
  assert.equal(await requestStatus(requestOkId), "assigned");

  // Idempotency: a second confirm returns the same advisor row, not a duplicate.
  const again = await confirmLead(requestOkId, adminCookie);
  assert.equal(again.status, 200);
  assert.equal((await advisorRows(tripId)).length, 1, "confirm must be idempotent");
});
