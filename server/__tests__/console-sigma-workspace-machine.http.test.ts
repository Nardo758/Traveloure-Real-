/**
 * CONSOLE-SIGMA Phase 1 — workspace state machine assertions (harness v1).
 *
 * Scope per ruling 24: the workspace machine ONLY (draft → in_review → delivered on
 * trip_expert_advisors.workspace_status). Per-item routing rows are deferred:phase-4
 * matrix cells and are NOT asserted here.
 *
 * Discipline (journey suite): every green requires a DATABASE FACT — no UI-only passes,
 * no swallowed assertions. Real HTTP against the real booking-actions router over a real
 * authenticated email-auth session (same boot recipe as trip-commission-band-edit.http.test.ts).
 * Dev DB only; all seeded rows removed in `after`.
 *
 * Assertion map (inventory IDs → rulings, see docs/testing/CONSOLE_SIGMA_AUDIT.md §9):
 *   M1–M6  ruling 24 — machine: happy path, terminal state, illegal jump, ownership,
 *          stale-precondition race guard (storage-level 409 source).
 *   L1–L3  ruling 21 — transition log. Phase 0 recorded this as expected-fail ABSENCE
 *          tagged deferred:#1028; #1028 MERGED (commit 45000861) → per ruling 21 these
 *          rows are FLIPPED to expected-PASS, citing the fixing commit.
 *   S1–S3  ruling 25 — server-derived next status. Phase 0 recorded client-computed
 *          `next` as expected-fail STATE_DIVERGENCE; #1027 MERGED (commit 0b1a8529)
 *          → flipped to expected-PASS. S3 is the divergence probe: a lying client
 *          value alongside `intent:"advance"` must never win over the server derivation.
 *   A2     ruling 20 — regression lock for spec flag #2 (dead empty-body saveMutation,
 *          removed client-side): the server rejects an empty-body PATCH outright and
 *          the DB fact is untouched.
 *   A4     ruling 20 — regression lock for spec flag #4 (engine wiring): the
 *          workspace-constraints aggregation endpoint exists and is assignment-gated.
 *
 * Run with: npx tsx --test server/__tests__/console-sigma-workspace-machine.http.test.ts
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

const { db, pool } = await import("../db");
const { and, eq } = await import("drizzle-orm");
const { users, trips, tripExpertAdvisors, itemTransitionLog } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { storage } = await import("../storage");
const bookingActionsRoutes = (await import("../routes/booking-actions")).default;

const PASSWORD = "test-password-sigma1";

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
let expertCookie: string;
let intruderCookie: string;
let expertId: string;
let intruderId: string;
let tripId: string;
let assignmentId: string;

async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed for ${email}: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  return setCookie!.split(";")[0];
}

/** THE database fact: current workspace_status of the assignment row. */
async function dbStatus(): Promise<string | null> {
  const [row] = await db
    .select({ ws: tripExpertAdvisors.workspaceStatus })
    .from(tripExpertAdvisors)
    .where(eq(tripExpertAdvisors.id, assignmentId));
  return row?.ws ?? null;
}

/** DB fact: workspace_status_transition diary rows for this trip, oldest first. */
async function diaryRows() {
  return db
    .select()
    .from(itemTransitionLog)
    .where(and(eq(itemTransitionLog.tripId, tripId), eq(itemTransitionLog.eventType, "workspace_status_transition")))
    .orderBy(itemTransitionLog.createdAt);
}

function patchStatus(cookie: string, body: unknown) {
  return fetch(`${baseUrl}/api/expert/assignments/${assignmentId}/workspace-status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
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
  app.use("/api", bookingActionsRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  expertId = crypto.randomUUID();
  intruderId = crypto.randomUUID();
  const expertEmail = `sigma-expert-${expertId.slice(0, 8)}@t.test`;
  const intruderEmail = `sigma-intruder-${intruderId.slice(0, 8)}@t.test`;
  const password = await hashPassword(PASSWORD);
  await db.insert(users).values([
    { id: expertId, email: expertEmail, password, firstName: "Sigma", lastName: "Expert", role: "local_expert", authProvider: "email" },
    { id: intruderId, email: intruderEmail, password, firstName: "Sigma", lastName: "Intruder", role: "local_expert", authProvider: "email" },
  ] as any);

  const [trip] = await db
    .insert(trips)
    .values({ userId: expertId, title: "Console-sigma machine test trip", destination: "Lisbon", startDate: "2026-09-01", endDate: "2026-09-05" } as any)
    .returning({ id: trips.id });
  tripId = trip.id;

  const [adv] = await db
    .insert(tripExpertAdvisors)
    .values({ tripId, localExpertId: expertId, status: "accepted", workspaceStatus: "draft" } as any)
    .returning({ id: tripExpertAdvisors.id });
  assignmentId = adv.id;

  expertCookie = await login(expertEmail);
  intruderCookie = await login(intruderEmail);
});

after(async () => {
  try {
    // Diary rows + advisor rows cascade from the trip (item_transition_log FK: onDelete cascade).
    if (tripId) await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    if (expertId) await db.delete(users).where(eq(users.id, expertId)).catch(() => {});
    if (intruderId) await db.delete(users).where(eq(users.id, intruderId)).catch(() => {});
  } finally {
    server?.close();
    await pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// A2 (ruling 20 — spec flag #2 regression, fixed pre-5941a4ff): an empty-body
// PATCH (the old dead saveMutation shape) is rejected and moves nothing.
// ---------------------------------------------------------------------------
test("A2: empty-body PATCH is a 400 and the DB status is untouched", async () => {
  const res = await patchStatus(expertCookie, {});
  assert.equal(res.status, 400);
  assert.equal(await dbStatus(), "draft");
  assert.equal((await diaryRows()).length, 0, "a rejected transition must write no diary row");
});

// ---------------------------------------------------------------------------
// M5 (ruling 24): ownership — an authenticated expert who does not own the
// assignment gets 403 and the DB fact is untouched.
// ---------------------------------------------------------------------------
test("M5: non-owning expert gets 403; status and diary untouched", async () => {
  const res = await patchStatus(intruderCookie, { intent: "advance" });
  assert.equal(res.status, 403);
  assert.equal(await dbStatus(), "draft");
  assert.equal((await diaryRows()).length, 0);
});

// ---------------------------------------------------------------------------
// M4 (ruling 24): illegal jump draft → delivered via explicit target is a 400.
// ---------------------------------------------------------------------------
test("M4: draft → delivered jump is rejected; DB fact unchanged", async () => {
  const res = await patchStatus(expertCookie, { workspaceStatus: "delivered" });
  assert.equal(res.status, 400);
  assert.equal(await dbStatus(), "draft");
  assert.equal((await diaryRows()).length, 0);
});

// ---------------------------------------------------------------------------
// S3 (ruling 25 divergence probe — FLIPPED expected-PASS, fixing commit 0b1a8529 / #1027):
// a lying client target sent alongside intent:"advance" must NOT win; the server
// derivation (validTransitions[current][0]) is the only thing that reaches the DB.
// S1 rides the same request: advance with no usable target succeeds from draft.
// ---------------------------------------------------------------------------
test("S1+S3: intent:'advance' with a lying workspaceStatus lands the SERVER-derived next state", async () => {
  const res = await patchStatus(expertCookie, { intent: "advance", workspaceStatus: "delivered" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(await dbStatus(), "in_review", "server must derive draft → in_review and ignore the client's 'delivered'");
});

// ---------------------------------------------------------------------------
// L1 (ruling 21 — FLIPPED expected-PASS, fixing commit 45000861 / #1028): the
// transition wrote exactly one trip-scoped diary row with correct facts.
// ---------------------------------------------------------------------------
test("L1: draft→in_review wrote one workspace_status_transition diary row (itemId NULL, actor=expert)", async () => {
  const rows = await diaryRows();
  assert.equal(rows.length, 1);
  const r = rows[0] as any;
  assert.equal(r.itemId, null, "trip-scoped event must carry itemId NULL (ruling 16)");
  assert.equal(r.fromStatus, "draft");
  assert.equal(r.toStatus, "in_review");
  assert.equal(r.actorType, "expert");
  assert.equal(r.actorId, expertId, "the acting expert must be recorded");
});

// ---------------------------------------------------------------------------
// S2 (ruling 25 backward compat): an explicit LEGAL target still works.
// M2 rides the same request: in_review → delivered completes the machine.
// L2 (ruling 21): the second diary row lands with correct from/to.
// ---------------------------------------------------------------------------
test("S2+M2+L2: explicit legal target in_review→delivered still works and is diarised", async () => {
  const res = await patchStatus(expertCookie, { workspaceStatus: "delivered" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(await dbStatus(), "delivered");
  const rows = await diaryRows();
  assert.equal(rows.length, 2);
  const r = rows[1] as any;
  assert.equal(r.fromStatus, "in_review");
  assert.equal(r.toStatus, "delivered");
  assert.equal(r.actorType, "expert");
});

// ---------------------------------------------------------------------------
// M3 (ruling 24): delivered is terminal — advance and explicit targets are 400,
// DB fact frozen. L3 (ruling 21): rejected transitions add no diary rows.
// ---------------------------------------------------------------------------
test("M3+L3: delivered is terminal; rejected advances leave status and diary frozen", async () => {
  for (const body of [{ intent: "advance" }, { workspaceStatus: "draft" }, { workspaceStatus: "in_review" }]) {
    const res = await patchStatus(expertCookie, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
  assert.equal(await dbStatus(), "delivered");
  assert.equal((await diaryRows()).length, 2, "no diary rows for rejected transitions");
});

// ---------------------------------------------------------------------------
// M6 (ruling 24 race guard — the HTTP 409 source): the storage helper's
// expectedCurrentStatus precondition. A stale precondition writes NOTHING —
// neither the status nor a diary row (rulings 12/18: the pair is atomic).
// ---------------------------------------------------------------------------
test("M6: stale expectedCurrentStatus precondition writes neither status nor diary row", async () => {
  const updated = await storage.updateExpertAssignmentWorkspaceStatus(assignmentId, "in_review", "draft", expertId);
  assert.equal(updated, undefined, "precondition (row is 'delivered', expected 'draft') must reject the write");
  assert.equal(await dbStatus(), "delivered");
  assert.equal((await diaryRows()).length, 2, "the atomic pair means no orphan diary row on a lost race");
});

// ---------------------------------------------------------------------------
// A4 (ruling 20 — spec flag #4 regression): the engine aggregation endpoint
// exists and is assignment-gated (403 for a non-assigned expert). Content-shape
// assertions on optimizer signals belong to Phase 2 with the richer fixture.
// ---------------------------------------------------------------------------
test("A4: workspace-constraints is mounted and assignment-gated", async () => {
  const intruder = await fetch(`${baseUrl}/api/trips/${tripId}/workspace-constraints`, { headers: { cookie: intruderCookie } });
  assert.equal(intruder.status, 403, "non-assigned expert must be rejected");
  const owner = await fetch(`${baseUrl}/api/trips/${tripId}/workspace-constraints`, { headers: { cookie: expertCookie } });
  assert.equal(owner.status, 200, `assigned expert must reach the aggregation: ${await owner.clone().text()}`);
});
