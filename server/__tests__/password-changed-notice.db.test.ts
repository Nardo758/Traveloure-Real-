/**
 * Row 172 slice b: one password_changed notice after a successful reset.
 *
 * The notice goes to the account's current email, once per reset token, with
 * no link and no token. Invalid, expired, replayed and unverified-refused
 * resets send nothing. The 200 and 400 bodies stay the ones already pinned.
 *
 * DISPOSABLE DB ONLY. Every row this file writes, it deletes. RESEND_API_KEY
 * is removed so nothing leaves the process.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit \
 *   server/__tests__/password-changed-notice.db.test.ts
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const priorAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;
const priorResend = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { and, eq } = await import("drizzle-orm");
const { users, passwordResetTokens } = await import("../../shared/models/auth");
const { emailOutbox } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { issuePasswordResetToken, hashAuthToken } = await import("../services/password-reset-tokens.service");
const { _outboxTestHooks } = await import("../services/email-outbox.service");
const { _passwordChangedNoticeTestHooks } = await import("../services/email.service");
const { PASSWORD_CHANGED_COPY } = await import("../services/password-changed-copy");

const INVALID = "This reset link is invalid or has expired. Please request a new one.";
const RESET_OK = "Password has been reset successfully. You can now sign in.";
const RESET_OK_BODY = `{"message":"${RESET_OK}"}`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`password-changed-notice refuses a non-local database (${host ?? "unknown host"})`);
}

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

function setAllow(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = value;
}

const fixtureIds: string[] = [];
const fixtureEmails: string[] = [];

function freshEmail(label: string): string {
  return `pcn-${label}-${crypto.randomUUID()}@example.test`;
}

async function account(opts: { verified?: boolean; email?: string | null; firstName?: string | null } = {}) {
  const id = crypto.randomUUID();
  const email = opts.email === undefined ? freshEmail(opts.verified ? "yes" : "no") : opts.email;
  fixtureIds.push(id);
  if (email) fixtureEmails.push(email);
  await db.insert(users).values({
    id,
    email,
    firstName: opts.firstName === undefined ? "Nia" : opts.firstName,
    lastName: "Fixture",
    role: "user",
    password: "old-hash",
    emailVerified: opts.verified ? new Date() : null,
  } as any);
  return { id, email };
}

async function passwordOf(id: string) {
  const [u] = await db.select({ password: users.password }).from(users).where(eq(users.id, id));
  return u?.password ?? null;
}

async function unusedReset(userId: string) {
  const { isNull } = await import("drizzle-orm");
  return db.select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}

type NoticeRow = {
  toEmail: string;
  subject: string;
  html: string;
  textBody: string | null;
  status: string;
  expiresAt: Date | null;
  metadata: unknown;
};

async function notices(toEmail?: string): Promise<NoticeRow[]> {
  const where = toEmail
    ? and(eq(emailOutbox.emailType, "password_changed"), eq(emailOutbox.toEmail, toEmail))
    : eq(emailOutbox.emailType, "password_changed");
  return db.select({
    toEmail: emailOutbox.toEmail,
    subject: emailOutbox.subject,
    html: emailOutbox.html,
    textBody: emailOutbox.textBody,
    status: emailOutbox.status,
    expiresAt: emailOutbox.expiresAt,
    metadata: emailOutbox.metadata,
  }).from(emailOutbox).where(where);
}

function metaOf(row: NoticeRow): { dedupeKey?: string; authCritical?: boolean } {
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object") return metadata as { dedupeKey?: string; authCritical?: boolean };
  return {};
}

let server: http.Server;
let base = "";
async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, text };
}

describe("password_changed notice after a successful reset (row 172 slice b)", () => {
  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  beforeEach(() => {
    setSends(priorSends);
    setAllow(priorAllow);
    delete _passwordChangedNoticeTestHooks.enqueueEmail;
    delete _outboxTestHooks.sendEmailFn;
  });

  after(async () => {
    setSends(priorSends);
    setAllow(priorAllow);
    if (priorResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResend;
    delete _passwordChangedNoticeTestHooks.enqueueEmail;
    delete _outboxTestHooks.sendEmailFn;
    await new Promise<void>((r) => server?.close(() => r()));
    if (fixtureEmails.length) {
      const { inArray } = await import("drizzle-orm");
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, fixtureEmails));
    }
    for (const id of fixtureIds) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("PB1 a successful reset queues one password_changed row to the current email", async () => {
    setSends(undefined);
    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.text, RESET_OK_BODY);
    const rows = await notices(user.email!);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].toEmail, user.email);
    assert.equal(metaOf(rows[0]).authCritical, true);
    assert.equal(metaOf(rows[0]).dedupeKey, `password_changed:${hashAuthToken(issued.raw)}`);
  });

  it("PB2 a replayed token returns 400 and does not queue a second row", async () => {
    setSends(undefined);
    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    const first = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(first.status, 200, first.text);
    const replay = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough2" });
    assert.equal(replay.status, 400, replay.text);
    assert.deepEqual(replay.body, { message: INVALID });
    assert.equal((await notices(user.email!)).length, 1);
  });

  it("PB3 an invalid token and an expired token create no row and return the same 400", async () => {
    setSends(undefined);
    const before = (await notices()).length;
    const invalid = await post("/api/auth/reset-password", {
      token: crypto.randomBytes(32).toString("hex"),
      newPassword: "longenough1",
    });
    assert.equal(invalid.status, 400, invalid.text);
    assert.deepEqual(invalid.body, { message: INVALID });

    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    await db.update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(passwordResetTokens.userId, user.id));
    const expired = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(expired.status, 400, expired.text);
    assert.deepEqual(expired.body, { message: INVALID });
    assert.equal(await passwordOf(user.id), "old-hash");
    assert.equal((await unusedReset(user.id)).length, 1);
    assert.equal((await notices(user.email!)).length, 0);
    assert.equal((await notices()).length, before);
  });

  it("PB4 an unverified account is refused while sends are on, and no row is created", async () => {
    setSends("true");
    const user = await account({ verified: false });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 400, res.text);
    assert.deepEqual(res.body, { message: INVALID });
    assert.equal(await passwordOf(user.id), "old-hash");
    assert.equal((await unusedReset(user.id)).length, 1);
    assert.equal((await notices(user.email!)).length, 0);
  });

  it("PB5 the 200 body stays byte-identical when enqueueEmail throws", async () => {
    setSends(undefined);
    _passwordChangedNoticeTestHooks.enqueueEmail = async () => {
      throw new Error("enqueueEmail stub");
    };
    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.text, RESET_OK_BODY);
    assert.deepEqual(res.body, { message: RESET_OK });
    assert.notEqual(await passwordOf(user.id), "old-hash");
    assert.equal((await notices(user.email!)).length, 0);
  });

  it("PB6 the notice has no URL and no token, and its copy is the held block", async () => {
    setSends(undefined);
    const user = await account({ verified: true, firstName: "Nia" });
    const issued = await issuePasswordResetToken(user.id);
    const hash = hashAuthToken(issued.raw);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    const [row] = await notices(user.email!);
    const html = row.html;
    const text = row.textBody ?? "";
    assert.equal(html.includes("http"), false);
    assert.equal(text.includes("http"), false);
    assert.equal(html.includes(issued.raw), false);
    assert.equal(text.includes(issued.raw), false);
    assert.equal(html.includes(hash), false);
    assert.equal(text.includes(hash), false);
    assert.equal(row.subject, PASSWORD_CHANGED_COPY.subject);
    assert.match(html, new RegExp(`>${PASSWORD_CHANGED_COPY.heading}<`));
    assert.equal(text.split("\n")[0], PASSWORD_CHANGED_COPY.heading);
    const bodyLines = text.split("\n").filter((line) => line.length > 0 && line !== PASSWORD_CHANGED_COPY.heading && !line.startsWith("Hi "));
    assert.deepEqual(bodyLines, [...PASSWORD_CHANGED_COPY.body]);
    for (const line of PASSWORD_CHANGED_COPY.body) assert.equal(html.includes(line), true, line);
    assert.equal(text.includes("Hi Nia,"), true);
    assert.equal(html.includes("Hi Nia,"), true);
  });

  it("PB7 the row is held until password_changed is allowlisted, then the stub is called once", async () => {
    setSends("true");
    setAllow("password_reset");
    const sends: string[] = [];
    _outboxTestHooks.sendEmailFn = async (params) => {
      sends.push(String(params.to));
      return { ok: true, id: "stub-password-changed" };
    };
    const held = await account({ verified: true });
    const heldToken = await issuePasswordResetToken(held.id);
    const heldRes = await post("/api/auth/reset-password", { token: heldToken.raw, newPassword: "longenough1" });
    assert.equal(heldRes.status, 200, heldRes.text);
    const heldRows = await notices(held.email!);
    assert.equal(heldRows.length, 1);
    assert.equal(heldRows[0].status, "held");
    assert.equal(sends.length, 0);

    setAllow("password_changed");
    const sent = await account({ verified: true });
    const sentToken = await issuePasswordResetToken(sent.id);
    const sentRes = await post("/api/auth/reset-password", { token: sentToken.raw, newPassword: "longenough1" });
    assert.equal(sentRes.status, 200, sentRes.text);
    const sentRows = await notices(sent.email!);
    assert.equal(sentRows.length, 1);
    assert.equal(sentRows[0].status, "sent");
    assert.deepEqual(sends, [sent.email]);
  });

  it("PB8 expires_at is null", async () => {
    setSends(undefined);
    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    const [row] = await notices(user.email!);
    assert.equal(row.expiresAt, null);
  });

  it("PB9 an account with no email sends nothing and the reset still succeeds", async () => {
    setSends(undefined);
    const before = (await notices()).length;
    const user = await account({ verified: true, email: null });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.text, RESET_OK_BODY);
    assert.notEqual(await passwordOf(user.id), "old-hash");
    assert.equal((await notices()).length, before);
  });

  it("PB10 the notice is addressed to the email at reset time", async () => {
    setSends(undefined);
    const user = await account({ verified: true });
    const previous = user.email!;
    const issued = await issuePasswordResetToken(user.id);
    const next = freshEmail("current");
    fixtureEmails.push(next);
    await db.update(users).set({ email: next }).where(eq(users.id, user.id));
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.equal((await notices(previous)).length, 0);
    const rows = await notices(next);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].toEmail, next);
  });

  it("PB11 classifyOutboxEmail treats an authCritical password_changed row as security", async (t) => {
    let classify: ((emailType: string, metadata: { authCritical?: boolean }) => string) | undefined;
    try {
      const mod = await import("../services/email-outbox-classes.ts") as {
        classifyOutboxEmail?: (emailType: string, metadata: { authCritical?: boolean }) => string;
      };
      classify = mod.classifyOutboxEmail;
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      t.skip(`PB11 skipped: row 168's email-outbox-classes module is not on main (${message})`);
      return;
    }
    if (typeof classify !== "function") {
      t.skip("PB11 skipped: row 168's module does not export classifyOutboxEmail");
      return;
    }
    assert.equal(classify("password_changed", { authCritical: true }), "security");
  });
});
