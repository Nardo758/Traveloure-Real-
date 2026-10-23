/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`): `GET /api/admin/message-reports/:id/context`.
 *   RC1  default 10 each side: 21 messages, oldest first, the reported one in the middle; one audit row
 *   RC2  before/after above 25 are clamped to 25 each side; one more audit row
 *   RC3  a user-level report reads the latest messages between the two users, default 10, capped at 25
 *   RC4  a non-staff account and a support account are refused and write no audit row; a moderator may read
 *   RC5  an unknown report is 404 and writes no audit row
 *
 * Synthetic messages only. Assertions compare ids, counts and fields; this file never prints message content.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/report-context.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import { MESSAGE_REPORT_CONTEXT_VIEWED_ACTION, MESSAGE_REPORT_RESOURCE } from "../services/admin-decision-audit";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "TestPass123!";
const reporterId = `gap10-${RUN}-reporter`;
const reportedId = `gap10-${RUN}-reported`;
const msgId = (i: number) => `gap10-${RUN}-m${String(i).padStart(2, "0")}`;
const TOTAL = 60;
const ANCHOR = 30;
const messageReportId = `gap10-${RUN}-rep-msg`;
const userReportId = `gap10-${RUN}-rep-user`;
const accounts: Record<string, { id: string; cookie: string; email: string }> = {};

async function signIn(key: string, role: string | null) {
  const email = `gap10-${RUN}-${key}@traveloure.test`;
  const a = await registerAndSignIn({ baseUrl: BASE_URL, email, password: PASSWORD, firstName: "Gap10", lastName: key, extra: { intent: "supply" } });
  if (role) await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [a.id, role]);
  accounts[key] = { id: a.id, cookie: a.cookie, email };
}
async function get(key: string, path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie: accounts[key].cookie } });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}
async function auditRows(reportId: string) {
  const r = await pool.query(
    `SELECT actor_id, resource_type, target_user_id FROM access_audit_logs WHERE action = $1 AND resource_id = $2`,
    [MESSAGE_REPORT_CONTEXT_VIEWED_ACTION, reportId],
  );
  return r.rows as Array<{ actor_id: string; resource_type: string; target_user_id: string | null }>;
}
const ctx = (id: string, q = "") => `/api/admin/message-reports/${id}/context${q}`;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await signIn("admin", "admin");
  await signIn("moderator", "moderator");
  await signIn("support", "support");
  await signIn("member", null);
  await pool.query(
    `INSERT INTO users (id, email, first_name, role) VALUES ($1, $2, 'Gap10', 'user'), ($3, $4, 'Gap10', 'user')`,
    [reporterId, `${reporterId}@traveloure.test`, reportedId, `${reportedId}@traveloure.test`],
  );
  const base = Date.UTC(2026, 0, 1);
  for (let i = 1; i <= TOTAL; i++) {
    const fromReported = i % 2 === 0;
    await pool.query(
      `INSERT INTO user_and_expert_chats (id, sender_id, receiver_id, message, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [msgId(i), fromReported ? reportedId : reporterId, fromReported ? reporterId : reportedId, `synthetic ${i}`, new Date(base + i * 60_000)],
    );
  }
  await pool.query(
    `INSERT INTO message_reports (id, reporter_id, reported_user_id, message_id, report_type, reason)
     VALUES ($1, $2, $3, $4, 'message', 'spam'), ($5, $2, $3, NULL, 'user', 'spam')`,
    [messageReportId, reporterId, reportedId, msgId(ANCHOR), userReportId],
  );
});

after(async () => {
  try {
    const ids = Object.values(accounts).map((a) => a.id);
    await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = ANY($1) OR resource_id = ANY($2)`, [ids, [messageReportId, userReportId]]).catch(() => {});
    await pool.query(`DELETE FROM message_reports WHERE id = ANY($1)`, [[messageReportId, userReportId]]).catch(() => {});
    await pool.query(`DELETE FROM user_and_expert_chats WHERE id LIKE $1`, [`gap10-${RUN}-m%`]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1) OR email LIKE $2`, [[...ids, reporterId, reportedId], `gap10-${RUN}-%`]).catch(() => {});
  } finally {
    await pool.end();
  }
});

test("RC1 — default 10 each side, one audit row", async () => {
  const r = await get("admin", ctx(messageReportId));
  assert.equal(r.status, 200);
  assert.equal(r.json.mode, "message");
  assert.equal(r.json.before, 10);
  assert.equal(r.json.after, 10);
  const ids = r.json.messages.map((m: any) => m.id);
  assert.deepEqual(ids, Array.from({ length: 21 }, (_, k) => msgId(ANCHOR - 10 + k)));
  assert.equal(r.json.messages.filter((m: any) => m.isReported).length, 1);
  assert.equal(r.json.messages[10].id, msgId(ANCHOR));
  assert.equal(r.json.messages[10].sender, "reported");
  assert.equal(r.json.messages[9].sender, "reporter");
  const rows = await auditRows(messageReportId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, accounts.admin.id);
  assert.equal(rows[0].resource_type, MESSAGE_REPORT_RESOURCE);
  assert.equal(rows[0].target_user_id, reportedId);
});

test("RC2 — clamped to 25 each side", async () => {
  const r = await get("admin", ctx(messageReportId, "?before=100&after=999"));
  assert.equal(r.status, 200);
  assert.equal(r.json.before, 25);
  assert.equal(r.json.after, 25);
  assert.equal(r.json.messages.length, 51);
  assert.equal(r.json.messages[0].id, msgId(ANCHOR - 25));
  assert.equal(r.json.messages[50].id, msgId(ANCHOR + 25));
  assert.equal((await auditRows(messageReportId)).length, 2, "one row per open");
});

test("RC3 — a user-level report reads the latest messages, capped", async () => {
  const d = await get("admin", ctx(userReportId));
  assert.equal(d.status, 200);
  assert.equal(d.json.mode, "users");
  assert.equal(d.json.anchorMissing, false);
  assert.deepEqual(d.json.messages.map((m: any) => m.id), Array.from({ length: 10 }, (_, k) => msgId(TOTAL - 9 + k)));
  const c = await get("admin", ctx(userReportId, "?before=500"));
  assert.equal(c.json.messages.length, 25);
  assert.equal(c.json.messages[24].id, msgId(TOTAL));
  assert.equal((await auditRows(userReportId)).length, 2);
});

test("RC4 — non-staff and support are refused; a moderator may read", async () => {
  const beforeCount = (await auditRows(messageReportId)).length;
  assert.equal((await get("member", ctx(messageReportId))).status, 403);
  assert.equal((await get("support", ctx(messageReportId))).status, 403);
  assert.equal((await auditRows(messageReportId)).length, beforeCount);
  const mod = await get("moderator", ctx(messageReportId));
  assert.equal(mod.status, 200);
  const rows = await auditRows(messageReportId);
  assert.equal(rows.length, beforeCount + 1);
  assert.ok(rows.some((r) => r.actor_id === accounts.moderator.id));
});

test("RC5 — an unknown report is 404 and writes nothing", async () => {
  const missing = `gap10-${RUN}-nope`;
  assert.equal((await get("admin", ctx(missing))).status, 404);
  assert.equal((await auditRows(missing)).length, 0);
});
