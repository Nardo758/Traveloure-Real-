/**
 * Row 101: a password reset needs a verified email while EMAIL_SENDS_ENABLED is
 * exactly "true". The flag is set in-process. No separate server step.
 *
 * Flag off (unset, "false", "TRUE"): an unverified account still receives a
 * reset token and a password_reset outbox row. Flag on: that account gets the
 * same neutral 200, no reset token, and a verification letter instead. A
 * pre-issued token for an unverified account is refused and left unused.
 * Verified accounts and unknown addresses keep today's answers.
 *
 * Grandfathering is not honored: a trip on the account (platform activity)
 * does not make a null users.email_verified count as verified.
 *
 * DISPOSABLE DB ONLY. Every row this file writes, it deletes. RESEND_API_KEY
 * is removed so nothing leaves the process. No payout handle is written.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit \
 *   server/__tests__/verified-email-password-reset.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const priorResend = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { and, eq, isNull } = await import("drizzle-orm");
const { users, passwordResetTokens, emailVerificationTokens } = await import("../../shared/models/auth");
const { emailOutbox, trips } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const {
  issuePasswordResetToken, peekPasswordResetTokenUser,
} = await import("../services/password-reset-tokens.service");
const { isEmailVerifiedForUser } = await import("../services/verified-email-action-gate");

const NEUTRAL = "If an account exists for that email, we've sent a reset link.";
const INVALID = "This reset link is invalid or has expired. Please request a new one.";
const RESET_OK = "Password has been reset successfully. You can now sign in.";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`verified-email-password-reset refuses a non-local database (${host ?? "unknown host"})`);
}

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

const fixtureIds: string[] = [];
const fixtureEmails: string[] = [];

function freshEmail(label: string): string {
  // UUID text can contain a digit run. It is an email, never a payout handle.
  return `vpr-${label}-${crypto.randomUUID()}@traveloure-qa.test`;
}

async function account(opts: { password?: string | null; verified?: boolean; withTrip?: boolean } = {}) {
  const id = crypto.randomUUID();
  const email = freshEmail(opts.verified ? "yes" : "no");
  fixtureIds.push(id);
  fixtureEmails.push(email);
  await db.insert(users).values({
    id,
    email,
    firstName: "Reset",
    lastName: "Fixture",
    role: "user",
    password: opts.password === undefined ? "old-hash" : opts.password,
    emailVerified: opts.verified ? new Date() : null,
  } as any);
  if (opts.withTrip) {
    await db.insert(trips).values({
      userId: id,
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      destination: "Kyoto",
    });
  }
  return { id, email };
}

async function unusedReset(userId: string) {
  return db.select({ id: passwordResetTokens.id, usedAt: passwordResetTokens.usedAt })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}

async function verifyTokens(userId: string) {
  return db.select({ id: emailVerificationTokens.id })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));
}

async function outboxTypes(toEmail: string): Promise<string[]> {
  const rows = await db.select({ emailType: emailOutbox.emailType })
    .from(emailOutbox)
    .where(eq(emailOutbox.toEmail, toEmail));
  return rows.map((r) => r.emailType);
}

async function passwordOf(id: string) {
  const [u] = await db.select({ password: users.password }).from(users).where(eq(users.id, id));
  return u?.password ?? null;
}

async function waitFor(pred: () => Promise<boolean>, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`timed out waiting for ${label}`);
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

describe("verified email required for password reset while sends are on", () => {
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

  after(async () => {
    setSends(priorSends);
    if (priorResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResend;
    await new Promise<void>((r) => server?.close(() => r()));
    if (fixtureEmails.length) {
      const { inArray } = await import("drizzle-orm");
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, fixtureEmails));
    }
    for (const id of fixtureIds) {
      await db.delete(trips).where(eq(trips.userId, id));
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("flag off: an unverified account still gets a reset token and a reset email", async () => {
    const user = await account({ withTrip: true });
    assert.equal(await isEmailVerifiedForUser(user.id), false);
    for (const value of [undefined, "false", "TRUE"] as const) {
      setSends(value);
      const res = await post("/api/auth/forgot-password", { email: user.email });
      assert.equal(res.status, 200, res.text);
      assert.deepEqual(res.body, { message: NEUTRAL });
    }
    assert.equal((await unusedReset(user.id)).length, 1);
    assert.equal((await verifyTokens(user.id)).length, 0);
    const types = await outboxTypes(user.email);
    assert.equal(types.filter((t) => t === "password_reset").length, 3);
    assert.equal(types.filter((t) => t === "email_verification").length, 0);
  });

  it("flag on: unverified forgot stays neutral, queues verification, and writes no reset token", async () => {
    setSends("true");
    const user = await account({ withTrip: true });
    const unknown = freshEmail("missing");
    fixtureEmails.push(unknown);
    const oauth = await account({ password: null, withTrip: true });
    const verified = await account({ verified: true });

    const unverifiedRes = await post("/api/auth/forgot-password", { email: user.email });
    const unknownRes = await post("/api/auth/forgot-password", { email: unknown });
    const oauthRes = await post("/api/auth/forgot-password", { email: oauth.email });
    const verifiedRes = await post("/api/auth/forgot-password", { email: verified.email });

    for (const res of [unverifiedRes, unknownRes, oauthRes, verifiedRes]) {
      assert.equal(res.status, 200, res.text);
      assert.deepEqual(res.body, { message: NEUTRAL });
    }

    await waitFor(
      async () => (await verifyTokens(user.id)).length === 1 && (await outboxTypes(user.email)).includes("email_verification"),
      "verification letter for unverified account",
    );
    assert.equal((await unusedReset(user.id)).length, 0);
    assert.equal((await outboxTypes(user.email)).filter((t) => t === "password_reset").length, 0);

    assert.equal((await unusedReset(oauth.id)).length, 0);
    assert.equal((await verifyTokens(oauth.id)).length, 0);
    assert.deepEqual(await outboxTypes(oauth.email), []);
    assert.deepEqual(await outboxTypes(unknown), []);

    assert.equal((await unusedReset(verified.id)).length, 1);
    assert.equal((await verifyTokens(verified.id)).length, 0);
    assert.deepEqual(await outboxTypes(verified.email), ["password_reset"]);
  });

  it("flag off: reset-password still consumes a token for an unverified account", async () => {
    setSends(undefined);
    const user = await account();
    const issued = await issuePasswordResetToken(user.id);
    const before = await peekPasswordResetTokenUser(issued.raw);
    assert.equal(before, user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body, { message: RESET_OK });
    assert.equal((await unusedReset(user.id)).length, 0);
    assert.notEqual(await passwordOf(user.id), "old-hash");
  });

  it("flag on: reset-password refuses an unverified token and leaves it unused", async () => {
    setSends("true");
    const user = await account({ withTrip: true });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 400, res.text);
    assert.deepEqual(res.body, { message: INVALID });
    assert.equal((await unusedReset(user.id)).length, 1);
    assert.equal(await passwordOf(user.id), "old-hash");
    assert.equal(await peekPasswordResetTokenUser(issued.raw), user.id);

    const unknown = await post("/api/auth/reset-password", {
      token: crypto.randomBytes(32).toString("hex"),
      newPassword: "longenough1",
    });
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.body, { message: INVALID });
  });

  it("flag on: reset-password still consumes a verified account's token", async () => {
    setSends("true");
    const user = await account({ verified: true });
    const issued = await issuePasswordResetToken(user.id);
    const res = await post("/api/auth/reset-password", { token: issued.raw, newPassword: "longenough1" });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body, { message: RESET_OK });
    assert.equal((await unusedReset(user.id)).length, 0);
    assert.notEqual(await passwordOf(user.id), "old-hash");
  });

  it("peekPasswordResetTokenUser reads the owner and writes nothing", async () => {
    const user = await account();
    const issued = await issuePasswordResetToken(user.id);
    assert.equal(await peekPasswordResetTokenUser(issued.raw), user.id);
    assert.equal(await peekPasswordResetTokenUser(crypto.randomBytes(32).toString("hex")), null);
    assert.equal((await unusedReset(user.id)).length, 1);
    assert.equal(await passwordOf(user.id), "old-hash");
  });
});
