/**
 * Row 209 (ledger `2026-10-30-row209-held-guest-invites-view`): GET /api/admin/email-outbox/held-guest-invites.
 *
 *   V1  only email_type = 'guest_invite' AND status = 'held' rows come back; sent, pending and other-type rows do not
 *   V2  a non-admin is 403 and an anonymous caller is 401
 *   V3  the call changes no row (before/after snapshot equal)
 *   V4  to_email is masked as j•••@domain and the full address never appears in the response
 *   V5  the client section draws no retry or send control (client/src/components/__tests__/admin-held-guest-invites.test.tsx H2)
 *   V6  the route's own source sends nothing, retries nothing, writes nothing and names no allowlist constant
 *
 * Synthetic rows only (example.com addresses). Run against a disposable dev database with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row209-held-guest-invites.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const URL_PATH = "/api/admin/email-outbox/held-guest-invites";
const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `r209-${RUN}`;

let adminCookie = "";
let userCookie = "";
let adminId = "";
let userId = "";
const ids: Record<string, number> = {};

async function insertOutbox(key: string, emailType: string, status: string, toEmail: string): Promise<void> {
  const r = await pool.query(
    `INSERT INTO email_outbox (email_type, to_email, subject, html, status, attempt_count, last_error, metadata)
     VALUES ($1, $2, $3, '<p>r209</p>', $4, 0, $5, $6::jsonb) RETURNING id`,
    [emailType, toEmail, `${PREFIX} ${key}`, status, status === "held" ? `${PREFIX} held reason` : null,
      JSON.stringify({ inviteId: `${PREFIX}-${key}`, r209Run: RUN })],
  );
  ids[key] = r.rows[0].id;
}

async function get(cookie: string | null) {
  const res = await fetch(`${BASE_URL}${URL_PATH}?limit=200`, { headers: cookie ? { cookie } : {} });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

async function snapshot(): Promise<string> {
  const r = await pool.query(
    `SELECT id, status, attempt_count, last_error, updated_at, retry_after, sent_at
       FROM email_outbox WHERE metadata->>'r209Run' = $1 ORDER BY id`,
    [RUN],
  );
  return JSON.stringify(r.rows);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const admin = await registerAndSignIn({
    baseUrl: BASE_URL, email: `${PREFIX}-admin@traveloure.test`, password: "TestPass123!",
    firstName: "Rowtwo", lastName: "Admin",
  });
  adminCookie = admin.cookie;
  adminId = admin.id;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);
  const user = await registerAndSignIn({
    baseUrl: BASE_URL, email: `${PREFIX}-user@traveloure.test`, password: "TestPass123!",
    firstName: "Rowtwo", lastName: "User",
  });
  userCookie = user.cookie;
  userId = user.id;
  await insertOutbox("held1", "guest_invite", "held", `jane.${RUN}@example.com`);
  await insertOutbox("held2", "guest_invite", "held", `kim.${RUN}@example.com`);
  await insertOutbox("sent", "guest_invite", "sent", `sent.${RUN}@example.com`);
  await insertOutbox("pending", "guest_invite", "pending", `pending.${RUN}@example.com`);
  await insertOutbox("other", "r209_other", "held", `other.${RUN}@example.com`);
});

after(async () => {
  await pool.query(`DELETE FROM email_outbox WHERE metadata->>'r209Run' = $1`, [RUN]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[adminId, userId].filter(Boolean)]).catch(() => {});
  await pool.end();
});

test("V1: only held guest_invite rows come back", async () => {
  const res = await get(adminCookie);
  assert.equal(res.status, 200);
  const returned: number[] = res.json.rows.map((r: any) => r.id);
  assert.ok(returned.includes(ids.held1) && returned.includes(ids.held2));
  for (const k of ["sent", "pending", "other"]) assert.equal(returned.includes(ids[k]), false, k);
  if (returned.length) {
    const db = await pool.query(`SELECT DISTINCT email_type, status FROM email_outbox WHERE id = ANY($1)`, [returned]);
    assert.deepEqual(db.rows, [{ email_type: "guest_invite", status: "held" }]);
  }
  const row = res.json.rows.find((r: any) => r.id === ids.held1);
  assert.deepEqual(Object.keys(row).sort(), ["createdAt", "id", "inviteId", "lastError", "subject", "toEmail"]);
  assert.equal(row.inviteId, `${PREFIX}-held1`);
  assert.equal(row.lastError, `${PREFIX} held reason`);
  assert.ok(returned.indexOf(ids.held2) < returned.indexOf(ids.held1), "newest first");
});

test("V2: non-admin 403, anonymous 401", async () => {
  assert.equal((await get(userCookie)).status, 403);
  assert.equal((await get(null)).status, 401);
});

test("V3: the call changes no row", async () => {
  const beforeSnap = await snapshot();
  await get(adminCookie);
  await get(adminCookie);
  assert.equal(await snapshot(), beforeSnap);
});

test("V4: to_email is masked and the full address never appears", async () => {
  const res = await get(adminCookie);
  const row = res.json.rows.find((r: any) => r.id === ids.held1);
  assert.equal(row.toEmail, "j•••@example.com");
  for (const local of [`jane.${RUN}`, `kim.${RUN}`]) assert.equal(res.text.includes(local), false);
  assert.equal(/"to_email"/.test(res.text), false);
});

test("V6: the route sends, retries and writes nothing", () => {
  const src = readFileSync("server/routes/admin.routes.ts", "utf8");
  const start = src.indexOf('router.get("/api/admin/email-outbox/held-guest-invites"');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf("\n});", start));
  assert.match(block, /requireAdminLocal/);
  assert.doesNotMatch(block, /\b(UPDATE|INSERT|DELETE)\b/);
  assert.doesNotMatch(block, /EMAIL_TEMPLATE_ALLOWLIST|EMAIL_SENDS_ENABLED|enqueueEmail|drain|retry/i);
});
