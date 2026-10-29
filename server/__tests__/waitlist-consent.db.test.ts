/**
 * 291a — waitlist consent rows, unsubscribe, and market-opened enqueue.
 *
 *   T1  A POST with N boxes ticked writes N consent_records rows, each with consented_at
 *       and a text version. An unticked box writes none. marketingConsent writes a row
 *       only when a launch_marketing_news text version is already present.
 *   T2  A repeat sign-up with the boxes unticked keeps the earlier rows. A repeat after
 *       a revoke keeps revoked_at set.
 *   T3  A tampered token and a token signed with the wrong secret are rejected on GET
 *       and POST and write nothing.
 *   T4  GET confirm does not set revoked_at or unsubscribed_at.
 *   T5  POST revoke sets revoked_at and unsubscribed_at. A second POST keeps the first timestamps.
 *   T6  A waitlist_open row to a revoked address is cancelled with waitlist_consent_revoked
 *       and not sent. password_reset and booking_confirmation to the same address are still sent.
 *   T7  Two market-opened calls enqueue one waitlist_open row per recipient. dedupeKey is
 *       market-opened-${market}-${role}-${email}.
 *   T8  Only a consented, not-revoked, not-unsubscribed row in that market and role is enqueued.
 *   T9  Each market-opened call writes one audit row with no address and a null IP.
 *   T10 No session is 401, a non-admin is 403, an admin is 200. 401 and 403 enqueue nothing.
 *   T11 One unsubscribe POST revokes both launch_waitlist_updates and launch_marketing_news.
 *   Migration 415 is additive (no change to launch_waitlist) and a second run is a no-op.
 *
 * Run: npx tsx --test server/__tests__/waitlist-consent.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
process.env.SESSION_SECRET ??= "waitlist-consent-test-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_waitlist_consent";
}

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[waitlist-consent] REFUSING to write fixtures to '${host}'.`);
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { default: launchWaitlistRoutes } = await import("../routes/launch-waitlist.routes.js");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags.js");
const { _outboxTestHooks, deliverQueuedEmail, drainOutbox } = await import("../services/email-outbox.service.js");
const { MARKETING_EMAIL_TYPES, WAITLIST_MARKETING_REVOKED_REASON } = await import("../services/email-outbox-classes.js");
const { signWaitlistUnsubscribeToken } = await import("../services/waitlist-unsubscribe-token.js");
const {
  WAITLIST_CONSENT_KEY,
  WAITLIST_MARKETING_CONSENT_KEY,
  waitlistConsentVersion,
} = await import("../../shared/launch-waitlist.js");
const { MARKETING_EMAIL_FOOTER_FIELDS } = await import("../../shared/marketing-email-footer.js");

const RUN = crypto.randomUUID().slice(0, 8);
const MARKET = "kyoto";
const OTHER = "goa";
const EMAIL = (n: string) => `w291a-${n}-${RUN}@traveloure.test`;
const QA = `w291a-qa-${RUN}@traveloure-qa.test`;
const STARTED = new Date();
const MARKETING_VERSION = `291a-${RUN}`;
const FOOTER: Record<string, string> = {
  marketing_email_sender_name: "W291A Sender",
  marketing_email_opt_out_address: "w291a-opt-out@example.test",
  marketing_email_postal_address: "W291A-POSTAL",
  marketing_email_complaint_contact: "w291a-complaints@example.test",
};

let baseUrl = "";
let server: http.Server;
let adminId = "";
let memberId = "";
const priorFooter = new Map<string, string | null>();
const priorEnv = {
  sends: process.env.EMAIL_SENDS_ENABLED,
  allow: process.env.EMAIL_TEMPLATE_ALLOWLIST,
};
const priorNotify = { value: null as string | null, existed: false };

function app() {
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use((req, _res, next) => {
    const raw = req.headers["x-test-user"];
    const id = typeof raw === "string" && raw !== "" ? raw : null;
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => id !== null;
    (req as unknown as { user?: { id: string } }).user = id ? { id } : undefined;
    (req as unknown as { logout: (cb?: () => void) => void }).logout = (cb) => { cb?.(); };
    next();
  });
  expressApp.use(launchWaitlistRoutes);
  return expressApp;
}

async function listen(): Promise<void> {
  server = http.createServer(app());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function call(method: string, path: string, body?: unknown, userId?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json };
}

async function rowsFor(email: string) {
  const r = await pool.query(`SELECT * FROM launch_waitlist WHERE email = $1`, [email.toLowerCase()]);
  return r.rows;
}

async function consents(waitlistId: string) {
  const r = await pool.query(
    `SELECT consent_key, consent_text_version, consented_at, revoked_at
     FROM consent_records WHERE waitlist_id = $1 ORDER BY consent_key`,
    [waitlistId],
  );
  return r.rows as { consent_key: string; consent_text_version: string | null; consented_at: Date | null; revoked_at: Date | null }[];
}

async function setSetting(key: string, value: string | null) {
  if (value === null) await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [key]);
  else await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
    [key, value],
  );
  invalidatePlatformFlagCache(key);
}

async function outboxFor(email: string, emailType: string) {
  const r = await pool.query(
    `SELECT id, status, last_error, metadata, html, subject FROM email_outbox
     WHERE lower(to_email) = $1 AND email_type = $2 ORDER BY id`,
    [email.toLowerCase(), emailType],
  );
  return r.rows as { id: string; status: string; last_error: string | null; metadata: any; html: string; subject: string }[];
}

before(async () => {
  const sql = readFileSync("server/migrations/415_consent_records.sql", "utf8");
  const stripped = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(stripped, /ALTER\s+TABLE\s+launch_waitlist/i);
  assert.doesNotMatch(stripped, /\bDROP\b/i);
  assert.match(stripped, /CREATE TABLE IF NOT EXISTS consent_records/);
  assert.doesNotMatch(stripped, /ip_address|user_agent/i);
  await pool.query(sql);
  const beforeCount = await pool.query(`SELECT COUNT(*)::int AS n FROM consent_records`);
  await pool.query(sql);
  const afterCount = await pool.query(`SELECT COUNT(*)::int AS n FROM consent_records`);
  assert.equal(afterCount.rows[0].n, beforeCount.rows[0].n, "a second run changes no rows");

  const cols = await pool.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'consent_records' ORDER BY column_name`,
  );
  const names = cols.rows.map((row) => row.column_name);
  assert.deepEqual(names, [
    "consent_key", "consent_text_version", "consented_at", "created_at", "id",
    "market_slug", "revoked_at", "waitlist_id",
  ]);
  assert.equal(names.includes("ip_address"), false);
  assert.equal(names.includes("user_agent"), false);
  const waitlistCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'launch_waitlist'`,
  );
  assert.equal(waitlistCols.rows.some((row) => row.column_name === "market_slug"), true);

  adminId = crypto.randomUUID();
  memberId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, role, first_name) VALUES ($1, $2, 'admin', 'Ada'), ($3, $4, 'user', 'Bea')`,
    [adminId, EMAIL("admin"), memberId, EMAIL("member")],
  );
  for (const field of MARKETING_EMAIL_FOOTER_FIELDS) {
    const existing = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = $1`, [field.key]);
    priorFooter.set(field.key, existing.rows[0]?.setting_value ?? null);
    await setSetting(field.key, FOOTER[field.key]);
  }
  const notify = await pool.query(
    `SELECT setting_value FROM platform_settings WHERE setting_key = 'email_notifications_enabled'`,
  );
  priorNotify.existed = notify.rows.length > 0;
  priorNotify.value = notify.rows[0]?.setting_value ?? null;
  await setSetting("email_notifications_enabled", "true");
  await listen();
});

after(async () => {
  _outboxTestHooks.sendEmailFn = undefined;
  if (priorEnv.sends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = priorEnv.sends;
  if (priorEnv.allow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = priorEnv.allow;
  await pool.query(
    `DELETE FROM email_outbox
     WHERE created_at >= $1
       AND (
         lower(to_email) LIKE $2
         OR (email_type = 'waitlist_open' AND metadata->>'dedupeKey' LIKE 'market-opened-%')
       )`,
    [STARTED, `%w291a-%-${RUN}@%`],
  );
  await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1 OR email = $2`, [`%w291a-%-${RUN}@%`, QA]);
  await pool.query(
    `DELETE FROM consent_texts WHERE consent_key = $1 AND version = $2`,
    [WAITLIST_MARKETING_CONSENT_KEY, MARKETING_VERSION],
  );
  await pool.query(
    `DELETE FROM access_audit_logs WHERE actor_id = $1 AND action = 'waitlist_market_opened' AND created_at >= $2`,
    [adminId, STARTED],
  );
  await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[adminId, memberId]]);
  for (const [key, value] of priorFooter) await setSetting(key, value);
  if (!priorNotify.existed) await setSetting("email_notifications_enabled", null);
  else await setSetting("email_notifications_enabled", priorNotify.value);
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await pool.end();
});

test("T10 — market opened is admin only and enqueues nothing on 401 or 403", async () => {
  const before = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_outbox WHERE metadata->>'dedupeKey' LIKE $1`,
    [`market-opened-${MARKET}-traveler-%`],
  );
  const anon = await call("POST", "/api/admin/waitlist/market-opened", { market: MARKET, role: "traveler" });
  assert.equal(anon.status, 401, anon.text);
  const member = await call("POST", "/api/admin/waitlist/market-opened", { market: MARKET, role: "traveler" }, memberId);
  assert.equal(member.status, 403, member.text);
  const after = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_outbox WHERE metadata->>'dedupeKey' LIKE $1`,
    [`market-opened-${MARKET}-traveler-%`],
  );
  assert.equal(after.rows[0].n, before.rows[0].n);
  const audits = await pool.query(
    `SELECT COUNT(*)::int AS n FROM access_audit_logs
     WHERE actor_id = $1 AND action = 'waitlist_market_opened' AND created_at >= $2`,
    [adminId, STARTED],
  );
  assert.equal(audits.rows[0].n, 0);
});

test("T1 — one consent row per ticked box, and none for an unticked box or a marketing tick with no text", async () => {
  const saved = await pool.query(
    `SELECT id, consent_key, version, body, created_at FROM consent_texts WHERE consent_key = $1`,
    [WAITLIST_MARKETING_CONSENT_KEY],
  );
  await pool.query(`DELETE FROM consent_texts WHERE consent_key = $1`, [WAITLIST_MARKETING_CONSENT_KEY]);
  try {
    const bare = EMAIL("t1-bare");
    const bareRes = await call("POST", "/api/waitlist", { email: bare, marketingConsent: true, consent: false });
    assert.deepEqual(bareRes.json, { ok: true });
    const bareRows = await rowsFor(bare);
    assert.equal(bareRows.length, 1);
    assert.equal((await consents(bareRows[0].id)).length, 0, "no marketing text version, so no row");

    const none = EMAIL("t1-none");
    assert.deepEqual((await call("POST", "/api/waitlist", { email: none })).json, { ok: true });
    assert.equal((await consents((await rowsFor(none))[0].id)).length, 0);

    await pool.query(
      `INSERT INTO consent_texts (id, consent_key, version, body, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'News and updates for the test.', '2099-01-01')`,
      [WAITLIST_MARKETING_CONSENT_KEY, MARKETING_VERSION],
    );
    const both = EMAIL("t1-both");
    const bothRes = await call("POST", "/api/waitlist", { email: both, consent: true, marketingConsent: true });
    assert.equal(bothRes.status, 200, bothRes.text);
    assert.deepEqual(bothRes.json, { ok: true });
    assert.equal(bothRes.text.includes(both), false);
    const bothRows = await consents((await rowsFor(both))[0].id);
    assert.equal(bothRows.length, 2);
    for (const row of bothRows) {
      assert.ok(row.consented_at, row.consent_key);
      assert.equal(row.revoked_at, null);
      assert.ok(row.consent_text_version);
    }
    const notify = bothRows.find((row) => row.consent_key === WAITLIST_CONSENT_KEY);
    const news = bothRows.find((row) => row.consent_key === WAITLIST_MARKETING_CONSENT_KEY);
    assert.equal(notify?.consent_text_version, waitlistConsentVersion(MARKET));
    assert.equal(news?.consent_text_version, MARKETING_VERSION);

    const one = EMAIL("t1-one");
    await call("POST", "/api/waitlist", { email: one, consent: true, marketingConsent: false });
    const oneRows = await consents((await rowsFor(one))[0].id);
    assert.deepEqual(oneRows.map((row) => row.consent_key), [WAITLIST_CONSENT_KEY]);
  } finally {
    await pool.query(`DELETE FROM consent_texts WHERE consent_key = $1 AND version = $2`, [WAITLIST_MARKETING_CONSENT_KEY, MARKETING_VERSION]);
    for (const row of saved.rows) {
      await pool.query(
        `INSERT INTO consent_texts (id, consent_key, version, body, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [row.id, row.consent_key, row.version, row.body, row.created_at],
      );
    }
    await pool.query(
      `INSERT INTO consent_texts (id, consent_key, version, body, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'News and updates for the test.', '2099-01-01')
       ON CONFLICT DO NOTHING`,
      [WAITLIST_MARKETING_CONSENT_KEY, MARKETING_VERSION],
    );
  }
});

test("T2 — a repeat sign-up keeps prior consent and a later revoke", async () => {
  const email = EMAIL("t2");
  await call("POST", "/api/waitlist", { email, consent: true, marketingConsent: true });
  const first = await rowsFor(email);
  const before = await consents(first[0].id);
  assert.equal(before.length, 2);
  await call("POST", "/api/waitlist", { email, consent: false, marketingConsent: false });
  const kept = await consents(first[0].id);
  assert.equal(kept.length, 2);
  assert.equal(String(kept[0].consented_at), String(before[0].consented_at));
  assert.equal(String(kept[1].consented_at), String(before[1].consented_at));
  const token = signWaitlistUnsubscribeToken(first[0].id);
  assert.equal((await call("POST", "/api/waitlist/unsubscribe", { token })).status, 200);
  await call("POST", "/api/waitlist", { email, consent: true, marketingConsent: true });
  const after = await consents(first[0].id);
  assert.equal(after.length, 2);
  for (const row of after) {
    assert.ok(row.revoked_at, row.consent_key);
    const prior = before.find((item) => item.consent_key === row.consent_key);
    assert.equal(String(row.consented_at), String(prior?.consented_at));
  }
});

test("T3 — a tampered or wrong-secret token is rejected and writes nothing", async () => {
  const email = EMAIL("t3");
  await call("POST", "/api/waitlist", { email, consent: true, marketingConsent: true });
  const row = (await rowsFor(email))[0];
  const token = signWaitlistUnsubscribeToken(row.id);
  const flipped = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const wrong = signWaitlistUnsubscribeToken(row.id, "not-the-session-secret");
  for (const bad of [flipped, wrong, "not-a-token"]) {
    const got = await call("GET", `/api/waitlist/unsubscribe?token=${encodeURIComponent(bad)}`);
    const posted = await call("POST", "/api/waitlist/unsubscribe", { token: bad });
    assert.equal(got.status, 400, bad);
    assert.equal(posted.status, 400, bad);
  }
  const still = await consents(row.id);
  assert.equal(still.every((item) => item.revoked_at === null), true);
  assert.equal((await rowsFor(email))[0].unsubscribed_at, null);
});

test("T4 — GET confirm does not revoke", async () => {
  const email = EMAIL("t4");
  await call("POST", "/api/waitlist", { email, consent: true });
  const row = (await rowsFor(email))[0];
  const token = signWaitlistUnsubscribeToken(row.id);
  const got = await call("GET", `/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`);
  assert.equal(got.status, 200, got.text);
  assert.equal(got.json.ok, true);
  assert.equal(got.json.list, "waitlist");
  assert.equal(got.json.market, MARKET);
  assert.equal(got.json.city, "Kyoto");
  assert.equal(got.text.includes(email), false);
  const after = await consents(row.id);
  assert.equal(after[0].revoked_at, null);
  assert.equal((await rowsFor(email))[0].unsubscribed_at, null);
});

test("T5 and T11 — one POST revokes both keys and a second POST keeps the first timestamps", async () => {
  const email = EMAIL("t5");
  await call("POST", "/api/waitlist", { email, consent: true, marketingConsent: true });
  const row = (await rowsFor(email))[0];
  const token = signWaitlistUnsubscribeToken(row.id);
  const first = await call("POST", "/api/waitlist/unsubscribe", { token });
  assert.deepEqual(first.json, { ok: true });
  const revoked = await consents(row.id);
  assert.deepEqual(revoked.map((item) => item.consent_key), [WAITLIST_MARKETING_CONSENT_KEY, WAITLIST_CONSENT_KEY].sort());
  assert.equal(revoked.length, 2);
  for (const item of revoked) assert.ok(item.revoked_at, item.consent_key);
  const unsubscribed = (await rowsFor(email))[0].unsubscribed_at;
  assert.ok(unsubscribed);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await call("POST", "/api/waitlist/unsubscribe", { token });
  assert.deepEqual(second.json, { ok: true });
  const again = await consents(row.id);
  for (const item of again) {
    const prior = revoked.find((rowItem) => rowItem.consent_key === item.consent_key);
    assert.equal(new Date(item.revoked_at as Date).getTime(), new Date(prior!.revoked_at as Date).getTime());
  }
  assert.equal(
    new Date((await rowsFor(email))[0].unsubscribed_at).getTime(),
    new Date(unsubscribed).getTime(),
  );
});

test("T6 — drain and deliverQueuedEmail cancel a revoked waitlist_open and still send transactional mail", async () => {
  assert.deepEqual([...MARKETING_EMAIL_TYPES], ["waitlist_open"]);
  const email = EMAIL("t6");
  await call("POST", "/api/waitlist", { email, consent: true, marketingConsent: true });
  const row = (await rowsFor(email))[0];
  const token = signWaitlistUnsubscribeToken(row.id);
  assert.equal((await call("POST", "/api/waitlist/unsubscribe", { token })).status, 200);

  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = "waitlist_open,password_reset,booking_confirmation";
  const sent: string[] = [];
  _outboxTestHooks.sendEmailFn = async (params) => {
    sent.push(String(params.emailType));
    return { ok: true, id: "stub-sent" };
  };

  async function insertOutbox(emailType: string, subject: string) {
    const inserted = await pool.query(
      `INSERT INTO email_outbox (email_type, to_email, subject, html, status, metadata, attempt_count)
       VALUES ($1, $2, $3, '<p>x</p>', 'pending', $4::jsonb, 0)
       RETURNING id`,
      [emailType, email.toLowerCase(), subject, JSON.stringify({ marketSlug: MARKET })],
    );
    return Number(inserted.rows[0].id);
  }

  const openId = await insertOutbox("waitlist_open", "open");
  const resetId = await insertOutbox("password_reset", "reset");
  const bookingId = await insertOutbox("booking_confirmation", "booked");
  await deliverQueuedEmail(openId);
  await deliverQueuedEmail(resetId);
  await deliverQueuedEmail(bookingId);
  const open = await pool.query(`SELECT status, last_error FROM email_outbox WHERE id = $1`, [openId]);
  assert.equal(open.rows[0].status, "cancelled");
  assert.equal(open.rows[0].last_error, WAITLIST_MARKETING_REVOKED_REASON);
  assert.equal(sent.includes("waitlist_open"), false);
  assert.equal(sent.filter((type) => type === "password_reset").length, 1);
  assert.equal(sent.filter((type) => type === "booking_confirmation").length, 1);

  const drainOpen = await insertOutbox("waitlist_open", "open-drain");
  const drainReset = await insertOutbox("password_reset", "reset-drain");
  const deferred = await pool.query(
    `SELECT id, retry_after FROM email_outbox
     WHERE id <> ALL($1::bigint[])
       AND (
         (status IN ('pending', 'failed', 'held') AND (retry_after IS NULL OR retry_after <= NOW()))
         OR (status = 'processing' AND retry_after < NOW() - INTERVAL '1 minute')
       )`,
    [[drainOpen, drainReset]],
  );
  if (deferred.rows.length) {
    await pool.query(
      `UPDATE email_outbox SET retry_after = NOW() + INTERVAL '2 days' WHERE id = ANY($1::bigint[])`,
      [deferred.rows.map((item) => item.id)],
    );
  }
  sent.length = 0;
  try {
    const drained = await drainOutbox();
    assert.equal(drained.error, undefined, drained.error);
    const cancelled = await pool.query(`SELECT status, last_error FROM email_outbox WHERE id = $1`, [drainOpen]);
    assert.equal(cancelled.rows[0].status, "cancelled");
    assert.equal(cancelled.rows[0].last_error, WAITLIST_MARKETING_REVOKED_REASON);
    assert.equal(sent.includes("waitlist_open"), false);
    assert.equal(sent.includes("password_reset"), true);
  } finally {
    for (const item of deferred.rows) {
      await pool.query(`UPDATE email_outbox SET retry_after = $2 WHERE id = $1`, [item.id, item.retry_after]);
    }
  }
});

test("T7 T8 T9 — market opened enqueues only the consented audience, once, and audits without an address or IP", async () => {
  process.env.EMAIL_SENDS_ENABLED = "false";
  const yes = EMAIL("t8-yes");
  const provider = EMAIL("t8-provider");
  const other = EMAIL("t8-other");
  const silent = EMAIL("t8-silent");
  const revoked = EMAIL("t8-revoked");
  await call("POST", "/api/waitlist", { email: yes, consent: true, marketingConsent: true });
  await call("POST", "/api/waitlist", {
    email: provider, role: "provider", contactName: "Ada", serviceType: "experience", consent: true,
  });
  await call("POST", "/api/waitlist", { email: other, market: OTHER, consent: true });
  await call("POST", "/api/waitlist", { email: silent, consent: false, marketingConsent: false });
  await call("POST", "/api/waitlist", { email: revoked, consent: true });
  await call("POST", "/api/waitlist/unsubscribe", { token: signWaitlistUnsubscribeToken((await rowsFor(revoked))[0].id) });
  await call("POST", "/api/waitlist", { email: QA, consent: true });

  const first = await call("POST", "/api/admin/waitlist/market-opened", { market: MARKET, role: "traveler" }, adminId);
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.ok, true);
  const second = await call("POST", "/api/admin/waitlist/market-opened", { market: MARKET, role: "traveler" }, adminId);
  assert.equal(second.status, 200, second.text);
  assert.equal(second.json.enqueued, 0);

  const mine = await outboxFor(yes, "waitlist_open");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].metadata.dedupeKey, `market-opened-${MARKET}-traveler-${yes.toLowerCase()}`);
  assert.match(mine[0].subject, /We're open in Kyoto/);
  assert.match(mine[0].html, /Unsubscribe from waitlist emails/);
  assert.equal((await outboxFor(provider, "waitlist_open")).length, 0);
  assert.equal((await outboxFor(other, "waitlist_open")).length, 0);
  assert.equal((await outboxFor(silent, "waitlist_open")).length, 0);
  assert.equal((await outboxFor(revoked, "waitlist_open")).length, 0);
  assert.equal((await outboxFor(QA, "waitlist_open")).length, 0);
  const otherMarket = await call("POST", "/api/admin/waitlist/market-opened", { market: OTHER, role: "traveler" }, adminId);
  assert.equal(otherMarket.status, 200, otherMarket.text);
  const otherRows = await outboxFor(other, "waitlist_open");
  assert.equal(otherRows.length, 1);
  assert.equal(otherRows[0].metadata.dedupeKey, `market-opened-${OTHER}-traveler-${other.toLowerCase()}`);

  const unknown = await call("POST", "/api/admin/waitlist/market-opened", { market: "lisbon", role: "traveler" }, adminId);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.code, "UNKNOWN_MARKET");

  const audits = await pool.query(
    `SELECT metadata, ip_address, user_agent FROM access_audit_logs
     WHERE actor_id = $1 AND action = 'waitlist_market_opened' AND created_at >= $2
     ORDER BY created_at`,
    [adminId, STARTED],
  );
  assert.equal(audits.rows.length, 3, "one audit row per call, including the second click");
  for (const audit of audits.rows) {
    assert.equal(audit.ip_address, null);
    assert.equal(audit.user_agent, null);
    const text = JSON.stringify(audit.metadata);
    assert.equal(text.includes("@"), false, text);
    assert.equal(text.includes(yes), false);
  }
});
