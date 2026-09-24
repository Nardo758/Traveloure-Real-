/**
 * A FAILED ROLLBACK IS AN ALERT, NOT A LOG LINE — board task #1174, ledger
 * `2026-09-23-phase2-messages`.
 *
 * When the coordination fee payment cannot be created, `/api/coordination-states/:id/pay` rolls back
 * the credit it claimed and the `pending` status it set. If a rollback step itself fails, the state
 * is stranded (a used-up credit; a claim that refuses every retry with 409). That used to be a
 * `console.warn`. It is now an `admin_notifications` row, which the admin list and the daily digest
 * show while unread.
 *
 *   R1  `raiseOpsAlert` writes the row with its type, reason, context and the error text.
 *   R2  It never throws — not even when the row cannot be written — because it runs inside a
 *       failure handler that is already propagating another error.
 *   R3  Both rollback steps of the coordination /pay route raise it (source pin; forcing a real
 *       rollback failure needs a DB fault this suite cannot inject).
 *   R4  Board #1172: `recordAdminAudit` writes the audit row and returns no warning when it can.
 *   R5  When the audit write fails (here: an over-long action the column refuses), it does NOT
 *       throw, returns a warning sentence, and raises an `admin_audit_write_failed` alert.
 *   R6  No admin route swallows a failed audit write into a log line any more (source pin).
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/ops-alert.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { db } from "../db";
import { raiseOpsAlert } from "../services/ops-alert.service";
import { recordAdminAudit } from "../services/admin-query.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RUN = crypto.randomUUID().slice(0, 8);
const TYPE = `test_alert_${RUN}`;
const RESOURCE_ID = `audit-${RUN}`;

const ADMIN_ID = `admin-${RUN}`;

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(`INSERT INTO users (id, email, first_name, last_name, role) VALUES ($1, $2, 'Audit', 'Admin', 'admin')`, [
    ADMIN_ID,
    `${ADMIN_ID}@traveloure.test`,
  ]);
});

after(async () => {
  try {
    await pool.query(`DELETE FROM admin_notifications WHERE type = $1`, [TYPE]);
    await pool.query(`DELETE FROM admin_notifications WHERE type = 'admin_audit_write_failed' AND metadata->>'resourceId' = $1`, [RESOURCE_ID]);
    await pool.query(`DELETE FROM access_audit_logs WHERE resource_id = $1`, [RESOURCE_ID]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [ADMIN_ID]);
  } finally {
    await pool.end();
  }
});

test("R1: the alert is a durable, unread admin notification carrying its context", async () => {
  const recorded = await raiseOpsAlert({
    type: TYPE,
    reason: "release_credit",
    message: "Coordination c-1: releasing a claimed credit failed — release it by hand.",
    metadata: { coordinationId: "c-1", claimedCreditCents: 4900 },
    error: new Error("connection reset"),
  });
  assert.equal(recorded, true);
  const r = await pool.query(`SELECT message, reason, is_read, metadata FROM admin_notifications WHERE type = $1`, [TYPE]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].reason, "release_credit");
  assert.equal(r.rows[0].is_read, false, "unread, so the daily digest includes it");
  assert.equal(r.rows[0].metadata.coordinationId, "c-1");
  assert.equal(r.rows[0].metadata.claimedCreditCents, 4900);
  assert.equal(r.rows[0].metadata.error, "connection reset");
});

test("R2: it never throws, even when the row cannot be written", async () => {
  const original = db.insert.bind(db);
  (db as any).insert = () => {
    throw new Error("database unavailable");
  };
  try {
    const recorded = await raiseOpsAlert({ type: TYPE, reason: "reset_status", message: "x", metadata: {} });
    assert.equal(recorded, false);
  } finally {
    (db as any).insert = original;
  }
});

test("R3: both coordination /pay rollback steps raise the alert", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes.ts"), "utf-8");
  const start = src.indexOf('app.post("/api/coordination-states/:id/pay", ');
  const end = src.indexOf('app.post("/api/coordination-states/:id/pay/confirm"');
  assert.ok(start > 0 && end > start);
  const handler = src.slice(start, end);
  assert.ok(handler.includes('reason: "release_credit"'), "a failed credit release raises an alert");
  assert.ok(handler.includes('reason: "reset_status"'), "a failed status reset raises an alert");
  assert.ok(!/console\.warn\([^)]*rollback/i.test(handler), "no rollback failure is only warned");
});

test("R4: a successful audit write returns no warning and records the row", async () => {
  const warning = await recordAdminAudit({
    actorId: ADMIN_ID,
    actorRole: "admin",
    action: "ready_made_approve",
    resourceType: "ready_made_trip",
    resourceId: RESOURCE_ID,
  });
  assert.equal(warning, undefined);
  const r = await pool.query(`SELECT count(*)::int AS n FROM access_audit_logs WHERE resource_id = $1`, [RESOURCE_ID]);
  assert.equal(r.rows[0].n, 1);
});

test("R5: a failed audit write never throws, returns a warning and raises an alert", async () => {
  const action = "x".repeat(60); // access_audit_logs.action is varchar(50): the insert is refused
  const warning = await recordAdminAudit({
    actorId: ADMIN_ID,
    actorRole: "admin",
    action,
    resourceType: "ready_made_trip",
    resourceId: RESOURCE_ID,
  });
  assert.ok(warning && warning.includes("has no audit trail"), "the warning says what happened");
  const r = await pool.query(
    `SELECT message, is_read FROM admin_notifications WHERE type = 'admin_audit_write_failed' AND metadata->>'resourceId' = $1`,
    [RESOURCE_ID],
  );
  assert.equal(r.rows.length, 1, "an admin notification was raised");
  assert.equal(r.rows[0].is_read, false);
});

test("R6: no admin route swallows a failed audit write into a log line", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/admin.routes.ts"), "utf-8");
  // Every remaining direct call must let a failure surface (it is not followed by `.catch(`).
  const calls = [...src.matchAll(/insertAccessAuditLog\(\{/g)].map((m) => m.index!);
  for (const start of calls) {
    let depth = 0;
    let end = start + "insertAccessAuditLog".length;
    for (; end < src.length; end++) {
      if (src[end] === "(") depth++;
      else if (src[end] === ")" && --depth === 0) break;
    }
    assert.ok(!src.slice(end + 1).startsWith(".catch("), `a swallowed audit write remains at offset ${start}`);
  }
  assert.ok(src.includes("recordAdminAudit({"), "the routes use the alerting writer");
});
