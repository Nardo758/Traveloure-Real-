/**
 * AUDIT-LOG ATOMICITY — regression suite for the workspace-status flip+log pair
 * (rulings 12/16/18: log write in the SAME transaction as the status flip).
 *
 * Three invariants this file guards:
 *
 *   P1  Successful flip → exactly one `workspace_status_transition` diary row written
 *       with the correct fields (tripId, itemId=NULL, from/to, actorType=expert, actorId).
 *
 *   P2  Forced log-insert failure → the status flip is rolled back (no flip without a log).
 *       A PostgreSQL BEFORE INSERT trigger on `item_transition_log` is created for the
 *       fixture trip's ID; it raises an exception whenever the helper attempts to diary the
 *       transition. Because both writes share one transaction, the exception rolls back the
 *       preceding UPDATE. The helper must throw (or return undefined with an error), the DB
 *       status must remain unchanged, and no diary row may exist.
 *
 *   P3  Stale expectedCurrentStatus → neither the status nor a diary row is written
 *       (the atomic conditional is the 409 source).
 *
 *   P4  Unconditional flip (no expectedCurrentStatus) still writes exactly one diary row.
 *
 * Disposable-DB discipline: every row created here is seeded in `before` and removed in
 * `after`. The trigger is dropped in a `finally` block within P2 so a test failure never
 * leaves it installed.
 *
 * Run solo:
 *   npx tsx --test server/__tests__/audit-log-atomicity.unit.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, count } from "drizzle-orm";
import { sql } from "drizzle-orm";

delete process.env.REPL_ID;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "[REDACTED_STRIPE_TEST_KEY]";
}

const { db, pool } = await import("../db");
const { users, trips, tripExpertAdvisors, itemTransitionLog } = await import("../../shared/schema");
const { storage } = await import("../storage");

// ── Test fixture IDs (all namespaced to this run so parallel CI is safe) ──────────────────────
const RUN = crypto.randomUUID().slice(0, 8);

const actorId = `atm-${RUN}-actor`;
// Trigger function name scoped to this run so parallel test runs don't collide.
const TRIGGER_FN   = `atm_block_log_insert_${RUN.replace(/-/g, "_")}`;
const TRIGGER_NAME = `atm_log_block_${RUN.replace(/-/g, "_")}`;

let tripId       = "";
let assignmentId = "";

// ── DB helpers ─────────────────────────────────────────────────────────────────────────────────

/** Current workspace_status from DB — the authoritative DB fact. */
async function dbStatus(asgId: string = assignmentId): Promise<string | null> {
  const [row] = await db
    .select({ ws: tripExpertAdvisors.workspaceStatus })
    .from(tripExpertAdvisors)
    .where(eq(tripExpertAdvisors.id, asgId));
  return row?.ws ?? null;
}

/** Count of workspace_status_transition diary rows for this trip. */
async function logCount(tId: string = tripId): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(itemTransitionLog)
    .where(
      and(
        eq(itemTransitionLog.tripId, tId),
        eq(itemTransitionLog.eventType, "workspace_status_transition"),
      ),
    );
  return Number(row?.n ?? 0);
}

/** All workspace_status_transition diary rows for a trip, oldest-first. */
async function logRows(tId: string = tripId) {
  return db
    .select()
    .from(itemTransitionLog)
    .where(
      and(
        eq(itemTransitionLog.tripId, tId),
        eq(itemTransitionLog.eventType, "workspace_status_transition"),
      ),
    )
    .orderBy(itemTransitionLog.createdAt);
}

// ── Trigger helpers ────────────────────────────────────────────────────────────────────────────

/**
 * Install a BEFORE INSERT trigger on `item_transition_log` that raises an exception
 * for any insert referencing our fixture `tripId`. Because the exception fires inside
 * the helper's own transaction, Postgres rolls back the preceding UPDATE automatically.
 */
async function installBlockingTrigger(blockTripId: string): Promise<void> {
  // Use raw SQL via Drizzle's `db.execute` (the `sql` tag). The trigger function is created
  // OR REPLACED so a partial teardown from a previous crashed run doesn't interfere.
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION ${TRIGGER_FN}()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.trip_id = '${blockTripId}' THEN
        RAISE EXCEPTION 'atm_test: forced log-insert failure for trip %', NEW.trip_id;
      END IF;
      RETURN NEW;
    END;
    $$
  `));
  await db.execute(sql.raw(`
    CREATE TRIGGER ${TRIGGER_NAME}
    BEFORE INSERT ON item_transition_log
    FOR EACH ROW EXECUTE FUNCTION ${TRIGGER_FN}()
  `));
}

/** Remove the trigger and its function — called in a finally block so it never lingers. */
async function removeBlockingTrigger(): Promise<void> {
  await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON item_transition_log`));
  await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${TRIGGER_FN}()`));
}

// ── Fixture setup / teardown ───────────────────────────────────────────────────────────────────

before(async () => {
  await db.insert(users).values([
    {
      id: actorId,
      email: `atm-actor-${RUN}@t.test`,
      password: "irrelevant",
      firstName: "Atm",
      lastName: "Actor",
      role: "local_expert",
      authProvider: "email",
    },
  ] as any);

  const [trip] = await db
    .insert(trips)
    .values({
      userId: actorId,
      title: `Audit-log atomicity test trip ${RUN}`,
      destination: "Lisbon",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
    } as any)
    .returning({ id: trips.id });
  tripId = trip.id;

  const [adv] = await db
    .insert(tripExpertAdvisors)
    .values({
      tripId,
      localExpertId: actorId,
      status: "accepted",
      workspaceStatus: "draft",
    } as any)
    .returning({ id: tripExpertAdvisors.id });
  assignmentId = adv.id;
});

after(async () => {
  // Safety net: ensure the trigger is gone even if P2 crashed mid-test.
  await removeBlockingTrigger().catch(() => {});
  // Diary rows and advisor rows cascade from the trip.
  if (tripId)  await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
  if (actorId) await db.delete(users).where(eq(users.id, actorId)).catch(() => {});
  await pool.end().catch(() => {});
});

// ── P1 — successful flip ⇒ exactly one diary row with correct fields ──────────────────────────

test("P1: successful flip draft→in_review writes exactly one diary row with correct fields", async () => {
  assert.equal(await dbStatus(), "draft", "fixture must start at draft");
  assert.equal(await logCount(), 0, "no diary rows before the first flip");

  const result = await storage.updateExpertAssignmentWorkspaceStatus(
    assignmentId,
    "in_review",
    "draft",
    actorId,
  );

  assert.ok(result, "storage helper must return the updated row");
  assert.equal(await dbStatus(), "in_review", "DB status must be in_review after the flip");
  assert.equal(await logCount(), 1, "exactly one workspace_status_transition row");

  const [row] = await logRows() as any[];
  assert.equal(row.tripId,     tripId,     "diary row must carry the correct tripId");
  assert.equal(row.itemId,     null,       "trip-scoped event must carry itemId NULL (ruling 16)");
  assert.equal(row.fromStatus, "draft",    "fromStatus must match the previous state");
  assert.equal(row.toStatus,   "in_review","toStatus must match the new state");
  assert.equal(row.actorType,  "expert",   "actorType must be 'expert'");
  assert.equal(row.actorId,    actorId,    "actorId must be the performing expert");
});

// ── P2 — forced log-insert failure via DB trigger ⇒ status flip is rolled back ───────────────
//
// This is the core atomicity regression guard. We install a BEFORE INSERT trigger on
// `item_transition_log` that raises an exception for inserts referencing our fixture tripId.
// The trigger fires INSIDE the helper's own transaction, causing Postgres to roll back the
// preceding UPDATE on `trip_expert_advisors`. The helper must propagate the error, the DB
// status must remain at its pre-call value, and no diary row may exist.
//
// This test would FAIL if `updateExpertAssignmentWorkspaceStatus` ever moved its
// `logItemTransition` call outside the transaction: the UPDATE would commit before the
// trigger fires, leaving a flipped status with no diary row.

test("P2: log-insert failure (DB trigger) inside the helper's transaction rolls back the status flip", async () => {
  // Status is in_review from P1.
  const statusBefore = await dbStatus();
  assert.equal(statusBefore, "in_review", "fixture must be in_review as left by P1");
  const logsBefore = await logCount();

  await installBlockingTrigger(tripId);
  try {
    let thrownError: Error | null = null;
    try {
      await storage.updateExpertAssignmentWorkspaceStatus(
        assignmentId,
        "delivered",
        "in_review",
        actorId,
      );
    } catch (e: any) {
      thrownError = e;
    }

    // The helper must have propagated the trigger's exception.
    // (Drizzle wraps DB errors in its own message, so we check the thrown object exists
    // rather than matching the raw trigger message string.)
    assert.ok(
      thrownError !== null,
      "the helper must throw when the log insert fails inside its transaction",
    );

    // The status update must have been rolled back.
    assert.equal(
      await dbStatus(),
      statusBefore,
      "status must be unchanged — the transaction must have rolled back the status flip",
    );

    // No diary row may exist for this aborted transition.
    assert.equal(
      await logCount(),
      logsBefore,
      "no diary row may appear for a rolled-back transition",
    );
  } finally {
    await removeBlockingTrigger();
  }
});

// ── P3 — stale expectedCurrentStatus → no flip, no diary row ─────────────────────────────────

test("P3: stale expectedCurrentStatus writes neither status nor a diary row", async () => {
  // Status is in_review from P1 (P2 rolled back, so still in_review).
  assert.equal(await dbStatus(), "in_review", "fixture must be in_review");
  const logsBefore = await logCount();

  const result = await storage.updateExpertAssignmentWorkspaceStatus(
    assignmentId,
    "delivered",
    "draft",   // stale — real current is in_review
    actorId,
  );

  assert.equal(result, undefined, "helper must return undefined for a stale precondition");
  assert.equal(await dbStatus(), "in_review", "status must be unchanged");
  assert.equal(await logCount(), logsBefore, "no diary row for a lost-race attempt");
});

// ── P4 — unconditional flip still writes exactly one diary row ────────────────────────────────

test("P4: unconditional flip (no expectedCurrentStatus) still writes exactly one diary row", async () => {
  const logsBefore = await logCount();

  const result = await storage.updateExpertAssignmentWorkspaceStatus(
    assignmentId,
    "delivered",
    undefined,   // no CAS guard
    actorId,
  );

  assert.ok(result, "unconditional flip must succeed");
  assert.equal(await dbStatus(), "delivered", "status must be delivered");
  assert.equal(await logCount(), logsBefore + 1, "exactly one new diary row");

  const rows = await logRows() as any[];
  const latest = rows[rows.length - 1] as any;
  assert.equal(latest.toStatus,  "delivered", "latest diary row must record the new state");
  assert.equal(latest.fromStatus, null,       "fromStatus is NULL when expectedCurrentStatus is omitted");
  assert.equal(latest.actorType, "expert",    "actorType must always be expert");
  assert.equal(latest.itemId,    null,        "trip-scoped: itemId must be NULL");
});

