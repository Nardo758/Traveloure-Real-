/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the support inbox routes on a real database.
 *   SQ0  a submission sent through POST /api/contact is on the inbox list on the next read
 *   SQ1  the list; the status filter returns only that status; an unknown status is 400
 *   SQ2  assignment: one audit row, before → after assignee; a non-admin assignee is 400 and writes none
 *   SQ3  an empty PATCH body is 400 and leaves the row unchanged; an unknown key is 400
 *   SQ4  status and note: one audit row each; first_response_at is stamped once
 *   SQ5  digest counts with the target unset: overdue is null; with it set: counted
 *
 * Synthetic rows only. Assertions compare single fields, ids and counts. This file does not print row contents.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/support-intake.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import {
  CONTACT_SUBMISSION_RESOURCE,
  SUPPORT_ASSIGN_ACTION,
  SUPPORT_NOTE_ACTION,
  SUPPORT_STATUS_ACTION,
} from "../services/admin-decision-audit";
import { SUPPORT_FIRST_RESPONSE_HOURS_SETTING } from "@shared/support-intake";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const adminEmail = `gap7-${RUN}-admin@traveloure.test`;
const travelerId = `gap7-${RUN}-traveler`;
const ids = { fresh: `gap7-${RUN}-new`, resolved: `gap7-${RUN}-resolved`, old: `gap7-${RUN}-old` };
let adminCookie = "";
let adminId = "";
let savedSetting: string | null | undefined;
const contactEmail = `gap7-${RUN}-contact@traveloure.test`;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { cookie: adminCookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}
async function audits(action: string, id: string) {
  const r = await pool.query(
    `SELECT actor_id, resource_type, metadata->>'beforeStatus' AS before_status, metadata->>'afterStatus' AS after_status
       FROM access_audit_logs WHERE action = $1 AND resource_id = $2 ORDER BY created_at, id`,
    [action, id],
  );
  return r.rows as Array<{ actor_id: string; resource_type: string; before_status: string | null; after_status: string | null }>;
}
async function auditCount(id: string) {
  return (await pool.query(`SELECT count(*)::int AS n FROM access_audit_logs WHERE resource_id = $1`, [id])).rows[0].n as number;
}
async function row(id: string) {
  return (await pool.query(`SELECT status, assigned_admin_id, response_notes, first_response_at FROM contact_submissions WHERE id = $1`, [id])).rows[0];
}
const listIds = (json: any) => new Set<string>((json?.submissions ?? []).map((r: any) => r.id));

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const admin = await registerAndSignIn({ baseUrl: BASE_URL, email: adminEmail, password: "TestPass123!", firstName: "Gap7", lastName: "Admin", extra: { intent: "supply" } });
  adminCookie = admin.cookie;
  adminId = admin.id;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);
  await pool.query(`INSERT INTO users (id, email, first_name, role) VALUES ($1, $2, 'Gap7', 'user')`, [travelerId, `${travelerId}@traveloure.test`]);
  const s = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = $1`, [SUPPORT_FIRST_RESPONSE_HOURS_SETTING]);
  savedSetting = s.rows[0]?.setting_value ?? null;
  await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [SUPPORT_FIRST_RESPONSE_HOURS_SETTING]);
  const ins = `INSERT INTO contact_submissions (id, name, email, subject, message, status, created_at) VALUES ($1, 'Synthetic Sender', $2, 'Synthetic subject', 'Synthetic message', $3, $4)`;
  await pool.query(ins, [ids.fresh, `gap7-${RUN}@traveloure.test`, "new", new Date()]);
  await pool.query(ins, [ids.resolved, `gap7-${RUN}@traveloure.test`, "resolved", new Date()]);
  await pool.query(ins, [ids.old, `gap7-${RUN}@traveloure.test`, "new", new Date(Date.now() - 1000 * 3_600_000)]);
});

after(async () => {
  try {
    await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [SUPPORT_FIRST_RESPONSE_HOURS_SETTING]);
    if (savedSetting != null) {
      await pool.query(`INSERT INTO platform_settings (setting_key, setting_value) VALUES ($1, $2)`, [SUPPORT_FIRST_RESPONSE_HOURS_SETTING, savedSetting]);
    }
    await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = $1 OR resource_id = ANY($2)`, [adminId, Object.values(ids)]).catch(() => {});
    await pool.query(`DELETE FROM notifications WHERE related_type = 'contact_submission' AND related_id IN (SELECT id FROM contact_submissions WHERE email = $1)`, [contactEmail]).catch(() => {});
    await pool.query(`DELETE FROM contact_submissions WHERE id = ANY($1) OR email = $2`, [Object.values(ids), contactEmail]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1) OR email = $2`, [[adminId, travelerId], adminEmail]).catch(() => {});
  } finally {
    await pool.end();
  }
});

test("SQ0 — a /contact submission appears on the next read", async () => {
  const sent = await fetch(`${BASE_URL}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Synthetic Sender", email: contactEmail, subject: `gap7 ${RUN}`, message: "Synthetic message body." }),
  });
  assert.equal(sent.status, 200);
  const created = await pool.query(`SELECT id FROM contact_submissions WHERE email = $1`, [contactEmail]);
  assert.equal(created.rows.length, 1);
  const list = await call("GET", "/api/admin/contact-submissions?status=new&limit=200");
  assert.ok(listIds(list.json).has(created.rows[0].id));
});

test("SQ1 — listing and the status filter", async () => {
  const all = await call("GET", "/api/admin/contact-submissions?limit=200");
  assert.equal(all.status, 200);
  for (const id of Object.values(ids)) assert.ok(listIds(all.json).has(id));
  assert.equal(all.json.firstResponseHours, null);
  assert.ok(all.json.assignees.some((a: any) => a.id === adminId));
  const resolved = await call("GET", "/api/admin/contact-submissions?status=resolved&limit=200");
  assert.ok(listIds(resolved.json).has(ids.resolved));
  assert.equal(listIds(resolved.json).has(ids.fresh), false);
  assert.ok(resolved.json.submissions.every((r: any) => r.status === "resolved"));
  assert.equal((await call("GET", "/api/admin/contact-submissions?status=closed")).status, 400);
});

test("SQ2 — assignment", async () => {
  const bad = await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, { assignedAdminId: travelerId });
  assert.equal(bad.status, 400);
  assert.equal(await auditCount(ids.fresh), 0);
  const ok = await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, { assignedAdminId: adminId });
  assert.equal(ok.status, 200);
  assert.equal((await row(ids.fresh)).assigned_admin_id, adminId);
  const a = await audits(SUPPORT_ASSIGN_ACTION, ids.fresh);
  assert.equal(a.length, 1);
  assert.equal(a[0].actor_id, adminId);
  assert.equal(a[0].resource_type, CONTACT_SUBMISSION_RESOURCE);
  assert.equal(a[0].before_status, null);
  assert.equal(a[0].after_status, adminId);
  assert.equal((await row(ids.fresh)).first_response_at, null, "assigning is not a response");
});

test("SQ3 — an empty body is 400 and changes nothing", async () => {
  const before = await row(ids.fresh);
  const countBefore = await auditCount(ids.fresh);
  const empty = await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, {});
  assert.equal(empty.status, 400);
  assert.equal(typeof empty.json?.message, "string");
  const none = await fetch(`${BASE_URL}/api/admin/contact-submissions/${ids.fresh}`, { method: "PATCH", headers: { cookie: adminCookie } });
  assert.equal(none.status, 400);
  assert.equal((await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, { priority: "high" })).status, 400);
  assert.deepEqual(await row(ids.fresh), before);
  assert.equal(await auditCount(ids.fresh), countBefore);
});

test("SQ4 — status and note each audit; first response stamped once", async () => {
  const s = await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, { status: "in_progress" });
  assert.equal(s.status, 200);
  const st = await audits(SUPPORT_STATUS_ACTION, ids.fresh);
  assert.equal(st.length, 1);
  assert.equal(st[0].before_status, "new");
  assert.equal(st[0].after_status, "in_progress");
  const first = (await row(ids.fresh)).first_response_at;
  assert.ok(first);
  const n = await call("PATCH", `/api/admin/contact-submissions/${ids.fresh}`, { responseNotes: "synthetic note", status: "resolved" });
  assert.equal(n.status, 200);
  const notes = await audits(SUPPORT_NOTE_ACTION, ids.fresh);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].before_status, null);
  assert.equal(notes[0].after_status, "noted");
  assert.equal((await audits(SUPPORT_STATUS_ACTION, ids.fresh)).length, 2);
  const after = await row(ids.fresh);
  assert.equal(after.status, "resolved");
  assert.equal(new Date(after.first_response_at).getTime(), new Date(first).getTime(), "stamped once");
});

test("SQ5 — digest counts and the target setting", async () => {
  const { loadSupportDigestCounts } = await import("../services/support-inbox.service");
  const unset = await loadSupportDigestCounts();
  assert.equal(unset.overdue, null);
  assert.ok(unset.new >= 1);
  const setBad = await call("PATCH", `/api/admin/platform-settings/${SUPPORT_FIRST_RESPONSE_HOURS_SETTING}`, { settingValue: "0" });
  assert.equal(setBad.status, 400);
  const set = await call("PATCH", `/api/admin/platform-settings/${SUPPORT_FIRST_RESPONSE_HOURS_SETTING}`, { settingValue: "24" });
  assert.equal(set.status, 200);
  const counted = await loadSupportDigestCounts();
  assert.equal(typeof counted.overdue, "number");
  assert.ok((counted.overdue ?? 0) >= 1, "the 1000-hour-old unanswered row is overdue");
  const list = await call("GET", "/api/admin/contact-submissions?status=new&limit=200");
  assert.equal(list.json.firstResponseHours, 24);
  assert.equal(list.json.submissions.find((r: any) => r.id === ids.old)?.overdue, true);
});
