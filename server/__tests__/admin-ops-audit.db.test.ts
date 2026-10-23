/**
 * Ops gap 8 (ledger `2026-10-22-admin-ops-screens`): every write the three /admin/system ops tabs send leaves one
 * access_audit_logs row through `recordAdminDecisionAudit`, with before → after where there is one. A refused
 * request and the auto-cancel dry run leave none.
 *
 *   AO1  email outbox retry: one row, dead → pending; a retry of a sent email is 404 and writes none
 *   AO2  out-of-band refund clear: one row, refunded_outside_platform → cleared; a short note is 400 and writes none
 *   AO3  auto-cancel config edit: one row, old hours → new hours; an out-of-range value is 400 and writes none
 *   AO4  auto-cancel run: the dry run counts the stale booking and acts on nothing, with no audit row; the run cancels
 *        it and writes one row naming it
 *
 * Synthetic rows only. Assertions compare single fields, ids and counts. This file does not print row contents.
 *
 * Run against a disposable dev database with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/admin-ops-audit.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import {
  AUTO_CANCEL_CONFIG_ACTION,
  AUTO_CANCEL_RESOURCE,
  AUTO_CANCEL_RUN_ACTION,
  EMAIL_OUTBOX_RESOURCE,
  EMAIL_OUTBOX_RETRY_ACTION,
  OUT_OF_BAND_REFUND_CLEARED_ACTION,
  SERVICE_BOOKING_RESOURCE,
} from "../services/admin-decision-audit";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const adminEmail = `gap8-${RUN}-admin@traveloure.test`;
const travelerId = `gap8-${RUN}-traveler`;
const providerId = `gap8-${RUN}-provider`;
const oobBookingId = `gap8-${RUN}-oob`;
const legacyBookingId = crypto.randomUUID();

let adminCookie = "";
let adminId = "";
let outboxDeadId = 0;
let outboxSentId = 0;
let originalHours: number | null = null;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { cookie: adminCookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

interface AuditField {
  actor_id: string;
  actor_role: string;
  resource_type: string;
  before_status: string | null;
  after_status: string | null;
  metadata: any;
}
async function audits(action: string, resourceId: string): Promise<AuditField[]> {
  const r = await pool.query(
    `SELECT actor_id, actor_role, resource_type, metadata->>'beforeStatus' AS before_status,
            metadata->>'afterStatus' AS after_status, metadata
       FROM access_audit_logs WHERE actor_id = $1 AND action = $2 AND resource_id = $3 ORDER BY created_at, id`,
    [adminId, action, resourceId],
  );
  return r.rows as AuditField[];
}
async function adminAuditCount(): Promise<number> {
  const r = await pool.query(`SELECT count(*)::int AS n FROM access_audit_logs WHERE actor_id = $1`, [adminId]);
  return r.rows[0].n as number;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const admin = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: adminEmail,
    password: "TestPass123!",
    firstName: "Gap8",
    lastName: "Admin",
    extra: { intent: "supply" },
  });
  adminCookie = admin.cookie;
  adminId = admin.id;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);
  await pool.query(
    `INSERT INTO users (id, email, first_name, role) VALUES ($1, $2, 'Gap8', 'user'), ($3, $4, 'Gap8', 'service_provider')`,
    [travelerId, `${travelerId}@traveloure.test`, providerId, `${providerId}@traveloure.test`],
  );
  const ob = await pool.query(
    `INSERT INTO email_outbox (email_type, to_email, subject, html, status, attempt_count, last_error, metadata)
     VALUES ('gap8_test', $1, 'gap8', '<p>gap8</p>', 'dead', 5, 'gap8 synthetic error', $2::jsonb),
            ('gap8_test', $1, 'gap8', '<p>gap8</p>', 'sent', 1, NULL, $2::jsonb)
     RETURNING id, status`,
    [`gap8-${RUN}@traveloure.test`, JSON.stringify({ gap8Run: RUN })],
  );
  outboxDeadId = ob.rows.find((r: any) => r.status === "dead").id;
  outboxSentId = ob.rows.find((r: any) => r.status === "sent").id;
  const marker = {
    detectedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    paymentIntentId: `pi_gap8_${RUN}`,
    chargeId: null,
    refundIds: [`re_gap8_${RUN}`],
    amountCents: 500,
  };
  await pool.query(
    `INSERT INTO service_bookings (id, traveler_id, provider_id, total_amount, platform_fee, provider_earnings, status, booking_details)
     VALUES ($1, $2, $3, '10.00', '2.00', '8.00', 'confirmed', $4::jsonb)`,
    [oobBookingId, travelerId, providerId, JSON.stringify({ outOfBandRefund: marker })],
  );
  await pool.query(
    `INSERT INTO bookings (id, user_id, title, status, created_at) VALUES ($1, $2, 'gap8', 'pending_payment', NOW() - interval '1000 hours')`,
    [legacyBookingId, travelerId],
  );
  const cfg = await call("GET", "/api/admin/bookings/auto-cancel/config");
  assert.equal(cfg.status, 200);
  originalHours = cfg.json.config.staleThresholdHours;
});

after(async () => {
  try {
    if (originalHours != null) await call("PATCH", "/api/admin/bookings/auto-cancel/config", { staleThresholdHours: originalHours });
    await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = $1`, [adminId]).catch(() => {});
    await pool.query(`DELETE FROM admin_notifications WHERE metadata->>'resourceId' = ANY($1)`, [[String(outboxDeadId), oobBookingId]]).catch(() => {});
    await pool.query(`DELETE FROM notifications WHERE user_id = $1`, [travelerId]).catch(() => {});
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'gap8Run' = $1`, [RUN]).catch(() => {});
    await pool.query(`DELETE FROM bookings WHERE id = $1`, [legacyBookingId]).catch(() => {});
    await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [oobBookingId]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1) OR email = $2`, [[adminId, travelerId, providerId], adminEmail]).catch(() => {});
  } finally {
    await pool.end();
  }
});

test("AO1 — an email retry writes one audit row, dead → pending; a refused retry writes none", async () => {
  const refused = await call("POST", `/api/admin/email-outbox/${outboxSentId}/retry`);
  assert.equal(refused.status, 404);
  assert.equal((await audits(EMAIL_OUTBOX_RETRY_ACTION, String(outboxSentId))).length, 0);

  const ok = await call("POST", `/api/admin/email-outbox/${outboxDeadId}/retry`);
  assert.equal(ok.status, 200);
  const rows = await audits(EMAIL_OUTBOX_RETRY_ACTION, String(outboxDeadId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_role, "admin");
  assert.equal(rows[0].resource_type, EMAIL_OUTBOX_RESOURCE);
  assert.equal(rows[0].before_status, "dead");
  assert.equal(rows[0].after_status, "pending");
});

test("AO2 — clearing an out-of-band refund writes one audit row; a short note writes none", async () => {
  const short = await call("POST", `/api/admin/bookings/${oobBookingId}/out-of-band-refund/clear`, { note: "short" });
  assert.equal(short.status, 400);
  assert.equal((await audits(OUT_OF_BAND_REFUND_CLEARED_ACTION, oobBookingId)).length, 0);

  const ok = await call("POST", `/api/admin/bookings/${oobBookingId}/out-of-band-refund/clear`, { note: "gap8 synthetic goodwill note" });
  assert.equal(ok.status, 200);
  const rows = await audits(OUT_OF_BAND_REFUND_CLEARED_ACTION, oobBookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resource_type, SERVICE_BOOKING_RESOURCE);
  assert.equal(rows[0].before_status, "refunded_outside_platform");
  assert.equal(rows[0].after_status, "cleared");
  const again = await call("POST", `/api/admin/bookings/${oobBookingId}/out-of-band-refund/clear`, { note: "gap8 synthetic goodwill note" });
  assert.equal(again.status, 404);
  assert.equal((await audits(OUT_OF_BAND_REFUND_CLEARED_ACTION, oobBookingId)).length, 1);
});

test("AO3 — a config edit writes one audit row, old → new hours; an out-of-range value writes none", async () => {
  const before = await adminAuditCount();
  const bad = await call("PATCH", "/api/admin/bookings/auto-cancel/config", { staleThresholdHours: 9999 });
  assert.equal(bad.status, 400);
  assert.equal(await adminAuditCount(), before);

  const next = originalHours === 700 ? 701 : 700;
  const ok = await call("PATCH", "/api/admin/bookings/auto-cancel/config", { staleThresholdHours: next });
  assert.equal(ok.status, 200);
  const rows = await audits(AUTO_CANCEL_CONFIG_ACTION, "staleThresholdHours");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resource_type, AUTO_CANCEL_RESOURCE);
  assert.equal(rows[0].before_status, String(originalHours));
  assert.equal(rows[0].after_status, String(next));
});

test("AO4 — the dry run counts without acting or auditing; the run cancels and writes one row naming the booking", async () => {
  const before = await adminAuditCount();
  const dry = await call("POST", "/api/admin/bookings/auto-cancel/run?dryRun=1");
  assert.equal(dry.status, 200);
  assert.equal(dry.json.dryRun, true);
  assert.ok(dry.json.count >= 1);
  assert.equal(await adminAuditCount(), before);
  const still = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [legacyBookingId]);
  assert.equal(still.rows[0].status, "pending_payment");

  const ran = await call("POST", "/api/admin/bookings/auto-cancel/run");
  assert.equal(ran.status, 200);
  const after = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [legacyBookingId]);
  assert.equal(after.rows[0].status, "canceled");
  const rows = await audits(AUTO_CANCEL_RUN_ACTION, "run");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resource_type, AUTO_CANCEL_RESOURCE);
  assert.ok(Array.isArray(rows[0].metadata.bookingIds) && rows[0].metadata.bookingIds.includes(legacyBookingId));
  assert.equal(rows[0].metadata.cancelledCount, ran.json.stats.cancelledCount);
});
