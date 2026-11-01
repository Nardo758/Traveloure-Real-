/**
 * LW-1h (ledger `2026-10-16-lw1h-waitlist-retention`; Leon, Oct 16, 2026): the waitlist retention clock and job.
 * In-process: the admin router and the job, against a disposable local database.
 *
 *   H1  The FIRST flip of traveler_signup_mode to "open" stamps traveler_signup_opened_at (ISO-8601 UTC) in the same
 *       request, with an audit row naming the cause; a close and a reopen keep the first instant.
 *   H2  traveler_signup_opened_at cannot be set by PATCH (400 server_written_setting), and a non-open write stamps
 *       nothing.
 *   H3  No opened-at row ⇒ `not_open`; an unreadable one ⇒ `error`; before opened-at + 12 months ⇒ `not_due`. None
 *       of the three deletes a row.
 *   H4  Once due: a never-converted row is deleted, a row whose address has an account (any case, any surrounding
 *       spaces) is kept, and each deletion writes ONE `waitlist_row_retention_delete` audit row with the row id and
 *       the email's sha256 — never the address. A second run deletes nothing more of ours.
 *   H5  With no recorded account behind the opening, the job deletes nothing and reports an error.
 *   H6  The due date is the opening instant plus 12 UTC calendar months (a 29 Feb opening falls due on 28 Feb).
 *   H7  (LW-1f-b, issue #1486) The per-row floor: a row that joined after the opening is kept until ITS OWN 12 months
 *       have passed — deleted only when now > max(opening, created_at) + 12 months — and a row with no created_at is
 *       never deleted.
 *
 * The settings it touches (traveler_signup_mode, traveler_signup_opened_at) are restored in after().
 * Run: npx tsx --test server/__tests__/waitlist-retention.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { pool } = await import("../db");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { default: adminRoutes } = await import("../routes/admin.routes");
const { runWaitlistRetention } = await import("../jobs/waitlistRetention");
const { waitlistEmailSha256 } = await import("../services/launch-waitlist.service");
const { waitlistRetentionDueAt } = await import("../../shared/launch-waitlist");
const { TRAVELER_SIGNUP_OPENED_AT_SETTING } = await import("../../shared/launch-signup");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; } })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`waitlist-retention.db.test refuses a non-local database (${host ?? "unknown host"})`);
}

const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "retention-pass-123";
const OPENED = TRAVELER_SIGNUP_OPENED_AT_SETTING;
const userIds: string[] = [];
const rowIds: string[] = [];
let base = "";
let server: http.Server;
let adminId = "";
let adminCookie = "";
const saved = new Map<string, { value: string; updatedBy: string | null } | null>();

function scryptHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
async function account(role: string, email = `retention-${role}-${RUN}-${crypto.randomUUID().slice(0, 6)}@traveloure-qa.test`) {
  const id = crypto.randomUUID();
  userIds.push(id);
  await pool.query(
    `INSERT INTO users (id, email, password, first_name, last_name, role, auth_provider) VALUES ($1, $2, $3, 'Ret', 'Test', $4, 'email')`,
    [id, email, scryptHash(PASSWORD), role],
  );
  return { id, email };
}
async function signIn(email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  return res.headers.get("set-cookie")!.split(";")[0];
}
async function patchSetting(key: string, value: string) {
  const res = await fetch(`${base}/api/admin/platform-settings/${key}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ settingValue: value }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function setting(key: string): Promise<{ value: string; updatedBy: string | null } | null> {
  const r = await pool.query(`SELECT setting_value, updated_by FROM platform_settings WHERE setting_key = $1`, [key]);
  return r.rows[0] ? { value: r.rows[0].setting_value, updatedBy: r.rows[0].updated_by } : null;
}
async function remember(key: string) {
  if (!saved.has(key)) saved.set(key, await setting(key));
}
async function putOpenedAt(value: string, updatedBy: string | null) {
  await remember(OPENED);
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by`,
    [OPENED, value, updatedBy],
  );
}
async function waitlistRow(email: string | null): Promise<string> {
  const id = crypto.randomUUID();
  rowIds.push(id);
  await pool.query(
    `INSERT INTO launch_waitlist (id, email, market_slug, role, source, created_at, updated_at)
     VALUES ($1, $2, 'kyoto', 'traveler', 'kyoto_waitlist_page', NOW(), NOW())`,
    [id, email],
  );
  return id;
}
async function rowExists(id: string): Promise<boolean> {
  return (await pool.query(`SELECT 1 FROM launch_waitlist WHERE id = $1`, [id])).rowCount === 1;
}

describe("LW-1h: waitlist retention", () => {
  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    await remember("traveler_signup_mode");
    await remember(OPENED);
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    app.use(adminRoutes);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    const admin = await account("admin");
    adminId = admin.id;
    adminCookie = await signIn(admin.email);
  });

  after(async () => {
    for (const [key, prior] of saved) {
      if (prior === null) await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [key]);
      else await pool.query(`UPDATE platform_settings SET setting_value = $2, updated_by = $3 WHERE setting_key = $1`, [key, prior.value, prior.updatedBy]);
    }
    if (rowIds.length) await pool.query(`DELETE FROM launch_waitlist WHERE id = ANY($1)`, [rowIds]);
    if (userIds.length) {
      await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = ANY($1)`, [userIds]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  });

  it("H1: the first flip to open stamps the opening instant once, with an audit row", async () => {
    await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [OPENED]);
    assert.equal((await patchSetting("traveler_signup_mode", "waitlist")).status, 200);
    assert.equal(await setting(OPENED), null, "a waitlist write stamps nothing");

    const before = Date.now();
    assert.equal((await patchSetting("traveler_signup_mode", "open")).status, 200);
    const first = await setting(OPENED);
    assert.ok(first, "the flip stamps the opening instant");
    assert.match(first!.value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.ok(Math.abs(new Date(first!.value).getTime() - before) < 60_000, "the stamp is the moment of the flip");
    assert.equal(first!.updatedBy, adminId);
    const audit = await pool.query(
      `SELECT metadata FROM access_audit_logs WHERE actor_id = $1 AND action = 'platform_setting_update' AND resource_id = $2`,
      [adminId, OPENED],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].metadata.after, first!.value);

    await new Promise((r) => setTimeout(r, 1100));
    assert.equal((await patchSetting("traveler_signup_mode", "waitlist")).status, 200);
    assert.equal((await patchSetting("traveler_signup_mode", "open")).status, 200);
    assert.equal((await setting(OPENED))!.value, first!.value, "a reopen keeps the first instant");
    const audits = await pool.query(
      `SELECT 1 FROM access_audit_logs WHERE actor_id = $1 AND action = 'platform_setting_update' AND resource_id = $2`,
      [adminId, OPENED],
    );
    assert.equal(audits.rowCount, 1, "no second stamp, no second audit row");
  });

  it("H2: the opening instant is server-written only", async () => {
    const r = await patchSetting(OPENED, "2020-01-01T00:00:00Z");
    assert.equal(r.status, 400);
    assert.equal(r.json?.code, "server_written_setting");
  });

  it("H3: not open, unreadable and not yet due delete nothing", async () => {
    const keep = await waitlistRow(`retention-h3-${RUN}@example.org`);
    await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [OPENED]);
    assert.deepEqual(await runWaitlistRetention(new Date("2100-01-01T00:00:00Z")), { status: "not_open", deleted: 0 });

    await putOpenedAt("tomorrow", adminId);
    const bad = await runWaitlistRetention(new Date("2100-01-01T00:00:00Z"));
    assert.equal(bad.status, "error");
    assert.equal(bad.deleted, 0);

    await putOpenedAt("2026-11-01T09:00:00Z", adminId);
    const early = await runWaitlistRetention(new Date("2027-11-01T08:59:59Z"));
    assert.equal(early.status, "not_due");
    assert.equal((await runWaitlistRetention(new Date("2027-11-01T09:00:00Z"))).status, "not_due", "strictly after the due instant");
    assert.equal((early as any).dueAt, "2027-11-01T09:00:00.000Z");
    assert.equal(await rowExists(keep), true);
  });

  it("H4: once due, never-converted rows go, converted rows stay, each deletion audited without the address", async () => {
    const member = await account("user", `Retention-Member-${RUN}@Example.org`);
    const converted = await waitlistRow(`  retention-member-${RUN}@example.org `);
    const goneEmail = `retention-gone-${RUN}@example.org`;
    const gone = await waitlistRow(goneEmail);
    const noEmail = await waitlistRow(null);
    // The per-row floor (H7) keeps a row until its own 12 months have passed, so these rows are dated before the
    // opening, as H7 dates its own; created at the real clock they would stop being due once that clock passed the
    // opening instant.
    await pool.query(`UPDATE launch_waitlist SET created_at = '2026-10-01 12:00:00' WHERE id = ANY($1)`, [[converted, gone, noEmail]]);
    await putOpenedAt("2026-11-01T09:00:00Z", adminId);

    const res = await runWaitlistRetention(new Date("2027-11-01T09:00:01Z"));
    assert.equal(res.status, "deleted");
    assert.ok(res.deleted >= 2);
    assert.equal(await rowExists(converted), true, `${member.email} has an account, so the row converted`);
    assert.equal(await rowExists(gone), false);
    assert.equal(await rowExists(noEmail), false);

    const audit = await pool.query(
      `SELECT actor_id, actor_role, metadata::text AS meta, metadata FROM access_audit_logs
       WHERE action = 'waitlist_row_retention_delete' AND resource_id = $1`,
      [gone],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].actor_id, adminId);
    assert.equal(audit.rows[0].actor_role, "system");
    assert.equal(audit.rows[0].metadata.emailSha256, waitlistEmailSha256(goneEmail));
    assert.equal(audit.rows[0].metadata.retentionMonths, 12);
    assert.ok(!audit.rows[0].meta.includes(goneEmail.split("@")[0]), "the address is never in the audit row");

    const again = await runWaitlistRetention(new Date("2027-11-01T09:00:01Z"));
    assert.equal(again.status, "deleted");
    assert.equal(await rowExists(converted), true);
    const twice = await pool.query(
      `SELECT 1 FROM access_audit_logs WHERE action = 'waitlist_row_retention_delete' AND resource_id = $1`,
      [gone],
    );
    assert.equal(twice.rowCount, 1, "a second run writes no second row for the same deletion");
  });

  it("H5: no recorded account behind the opening ⇒ nothing deleted, reported as an error", async () => {
    const keep = await waitlistRow(`retention-h5-${RUN}@example.org`);
    await putOpenedAt("2026-11-01T09:00:00Z", null);
    const res = await runWaitlistRetention(new Date("2030-01-01T00:00:00Z"));
    assert.equal(res.status, "error");
    assert.equal(res.deleted, 0);
    assert.equal(await rowExists(keep), true);
  });

  it("H6: the due date is twelve UTC calendar months on", () => {
    assert.equal(waitlistRetentionDueAt(new Date("2026-11-01T09:00:00Z")).toISOString(), "2027-11-01T09:00:00.000Z");
    assert.equal(waitlistRetentionDueAt(new Date("2028-02-29T12:00:00Z")).toISOString(), "2029-02-28T12:00:00.000Z");
    assert.equal(waitlistRetentionDueAt(new Date("2026-12-31T23:59:59Z")).toISOString(), "2027-12-31T23:59:59.000Z");
  });

  it("H7: the per-row floor keeps a late joiner until its own 12 months have passed", async () => {
    const late = await waitlistRow(`retention-h7-late-${RUN}@example.org`);
    const noDate = await waitlistRow(`retention-h7-nodate-${RUN}@example.org`);
    await pool.query(`UPDATE launch_waitlist SET created_at = '2027-06-01 12:00:00' WHERE id = $1`, [late]);
    await pool.query(`UPDATE launch_waitlist SET created_at = NULL WHERE id = $1`, [noDate]);
    await putOpenedAt("2026-11-01T09:00:00Z", adminId);

    const due = await runWaitlistRetention(new Date("2027-11-02T00:00:00Z"));
    assert.equal(due.status, "deleted", "the opening clock has run");
    assert.equal(await rowExists(late), true, "joined Jun 2027: kept until Jun 2028");
    assert.equal(await rowExists(noDate), true, "an unknown age is never deleted");

    await runWaitlistRetention(new Date("2028-05-31T00:00:00Z"));
    assert.equal(await rowExists(late), true, "still inside its own 12 months");
    await runWaitlistRetention(new Date("2028-06-03T00:00:00Z"));
    assert.equal(await rowExists(late), false, "past max(opening, created_at) + 12 months");
    assert.equal(await rowExists(noDate), true);
  });
});
