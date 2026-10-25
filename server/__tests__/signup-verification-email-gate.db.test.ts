/**
 * Row 148 — sign-up verification mail follows EMAIL_SENDS_ENABLED.
 *
 * POST /api/auth/register issues the auth.verification_email producer after the
 * account commits. That producer writes one email_verification outbox row.
 * With the flag unset the row is held and the provider is not called. With the
 * flag exactly "true" the same row is sent. The register answer stays 202.
 *
 * Disposable database only. Transport is the outbox test seam, so no provider
 * call leaves the process. Fixture addresses are letter-only so they cannot
 * contain eight consecutive digits.
 *
 *   NODE_ENV=test npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/signup-verification-email-gate.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { users, emailVerificationTokens } from "../../shared/models/auth";
import { emailOutbox, funnelEvents, platformSettingsTable as platformSettings } from "../../shared/schema";
import { _outboxTestHooks } from "../services/email-outbox.service";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { getSession } from "../replit_integrations/auth/replitAuth";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth";
import {
  REGISTRATION_NEUTRAL_CODE,
  REGISTRATION_NEUTRAL_MESSAGE,
  REGISTRATION_NEUTRAL_STATUS,
} from "../../shared/registration-neutral";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const HANDLE_ALPHABET = "abcdefghij";
const VERIFY_SUBJECT = "Confirm your Traveloure email";
const PASSWORD = "gatepass";

async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has((addr ?? "").split("/")[0]);
  if (!ok) throw new Error(`signup-verification-email-gate refuses a non-local database (${host ?? "unknown host"})`);
}

/** A sign-up address whose local part cannot match an 8-digit bank-number run. */
function fixtureEmail(): string {
  const bytes = crypto.randomBytes(16);
  const local = `sveg${Array.from(bytes, (b) => HANDLE_ALPHABET[b % HANDLE_ALPHABET.length]).join("")}`;
  const email = `${local}@traveloure-qa.test`;
  if (/\d/.test(local) || /\d{8,}/.test(email)) {
    throw new Error("fixture handle must not contain digits");
  }
  return email;
}

describe("signup verification email follows EMAIL_SENDS_ENABLED", () => {
  const emails: string[] = [];
  let server: http.Server;
  let base = "";
  let priorSends: string | undefined;
  let priorHook: typeof _outboxTestHooks.sendEmailFn;
  let savedMode: string | null = null;
  let savedRegistration: string | null = null;
  let providerCalls = 0;

  async function readSetting(key: string): Promise<string | null> {
    const [row] = await db.select({ value: platformSettings.settingValue })
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, key));
    return row?.value ?? null;
  }

  async function writeSetting(key: string, value: string): Promise<void> {
    await db.insert(platformSettings).values({ settingKey: key, settingValue: value })
      .onConflictDoUpdate({ target: platformSettings.settingKey, set: { settingValue: value } });
  }

  async function restoreSetting(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await db.delete(platformSettings).where(eq(platformSettings.settingKey, key));
    } else {
      await writeSetting(key, value);
    }
  }

  function installTransport() {
    providerCalls = 0;
    _outboxTestHooks.sendEmailFn = async (params) => {
      providerCalls += 1;
      assert.equal(params.subject, VERIFY_SUBJECT);
      assert.equal(params.authCritical, true);
      return { ok: true, id: "signup-verification-intercepted" };
    };
  }

  async function register(email: string) {
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, firstName: "Ada", lastName: "Gate" }),
    });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) as { code?: string; message?: string } };
  }

  /** issueEmailVerification is fire-and-forget after the 202. Wait until every row for this address has left processing. */
  async function awaitVerificationRow(email: string) {
    for (let i = 0; i < 200; i += 1) {
      const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, email));
      const verification = rows.filter((row) => row.emailType === "email_verification");
      if (rows.length > 0 && verification.length === 1 && rows.every((row) => row.status !== "processing")) {
        return verification[0];
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail("verification outbox row did not settle");
  }

  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    priorSends = process.env.EMAIL_SENDS_ENABLED;
    priorHook = _outboxTestHooks.sendEmailFn;
    savedMode = await readSetting("traveler_signup_mode");
    savedRegistration = await readSetting("new_user_registration_enabled");
    await writeSetting("traveler_signup_mode", "open");
    await writeSetting("new_user_registration_enabled", "true");
    invalidatePlatformFlagCache();

    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));
    setupEmailAuth(app);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    if (priorSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = priorSends;
    _outboxTestHooks.sendEmailFn = priorHook;
    await new Promise((r) => setTimeout(r, 300));
    await new Promise<void>((r) => server?.close(() => r()));
    if (emails.length) {
      const accounts = await db.select({ id: users.id }).from(users).where(inArray(users.email, emails));
      const ids = accounts.map((row) => row.id);
      if (ids.length) {
        await db.delete(funnelEvents).where(inArray(funnelEvents.userId, ids));
        await db.delete(emailVerificationTokens).where(inArray(emailVerificationTokens.userId, ids));
      }
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, emails));
      if (ids.length) {
        await db.delete(emailOutbox).where(sql`${emailOutbox.metadata}->>'signupAccountId' IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
        await db.delete(users).where(inArray(users.id, ids));
      }
    }
    await restoreSetting("traveler_signup_mode", savedMode);
    await restoreSetting("new_user_registration_enabled", savedRegistration);
    invalidatePlatformFlagCache();
  });

  it("holds auth.verification_email and does not call the provider when EMAIL_SENDS_ENABLED is unset", async () => {
    delete process.env.EMAIL_SENDS_ENABLED;
    installTransport();
    const email = fixtureEmail();
    emails.push(email);

    const created = await register(email);
    assert.equal(created.status, REGISTRATION_NEUTRAL_STATUS, created.text);
    assert.deepEqual(created.body, {
      code: REGISTRATION_NEUTRAL_CODE,
      message: REGISTRATION_NEUTRAL_MESSAGE,
    });

    const row = await awaitVerificationRow(email);
    assert.equal(row.status, "held");
    assert.equal(row.attemptCount, 0);
    assert.equal(row.resendId, null);
    assert.equal(row.sentAt, null);
    assert.equal(row.retryAfter, null);
    assert.match(String(row.lastError), /EMAIL_SENDS_ENABLED is not true/);
    assert.equal(row.subject, VERIFY_SUBJECT);
    assert.equal(providerCalls, 0);
  });

  it("sends auth.verification_email when EMAIL_SENDS_ENABLED is exactly true", async () => {
    process.env.EMAIL_SENDS_ENABLED = "true";
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "email_verification";
    installTransport();
    const email = fixtureEmail();
    emails.push(email);

    const created = await register(email);
    assert.equal(created.status, REGISTRATION_NEUTRAL_STATUS, created.text);
    assert.deepEqual(created.body, {
      code: REGISTRATION_NEUTRAL_CODE,
      message: REGISTRATION_NEUTRAL_MESSAGE,
    });

    const row = await awaitVerificationRow(email);
    assert.equal(row.status, "sent");
    assert.equal(row.resendId, "signup-verification-intercepted");
    assert.equal(row.attemptCount, 1);
    assert.ok(row.sentAt);
    assert.equal(providerCalls, 1);
    const metadata = row.metadata as { dedupeKey?: string; authCritical?: boolean };
    assert.equal(metadata.authCritical, true);
    assert.match(String(metadata.dedupeKey), /^email_verification:/);
  });
});
