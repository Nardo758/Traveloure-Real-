/**
 * S-09 email verification gate (ledger `2026-10-21-email-verification-gate`).
 *
 * A correct password still signs in. While the hold is not enforced
 * (ledger `2026-10-23-drop-check-email`), that session can open the product
 * and email_verified stays null. Wrong passwords keep the shared 401. Resend
 * answers one sentence and the 6th call in the window is 429.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/email-verification-gate.http.test.ts
 */
import { SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";
import { sql } from "drizzle-orm";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "ci-test-secret-not-for-production";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.NODE_ENV ??= "test";
delete process.env.RESEND_API_KEY;
delete process.env.RATE_LIMIT_LOOPBACK_SKIP;

const { db, pool } = await import("../db");
const { users, emailVerificationTokens } = await import("../../shared/models/auth");
const { eq } = await import("drizzle-orm");
const { setupAuth, isAuthenticated } = await import("../replit_integrations/auth/replitAuth");
const { registerAuthRoutes } = await import("../replit_integrations/auth/routes");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { emailVerificationGate } = await import("../middleware/email-verification-gate");
const { LOGIN_SCRYPT_KEYLEN } = await import("../services/login-credentials.service");
const { mintEmailVerificationToken, changeUnverifiedEmail } = await import("../services/email-verification.service");
const { resetRateLimitKeysForTests } = await import("../infrastructure/rate-limiter");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING, TRAVELER_WAITLIST } = await import("../../shared/launch-signup");
const { REGISTRATION_NEUTRAL_CODE } = await import("../../shared/registration-neutral");
const {
  VERIFICATION_RESEND_MESSAGE,
  VERIFICATION_EMAIL_CHANGE_MESSAGE,
  VERIFY_EMAIL_SUCCESS_MESSAGE,
  VERIFY_EMAIL_INVALID_MESSAGE,
} = await import("../../shared/email-verification-gate");

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://localhost/traveloure").hostname;
if (!DISPOSABLE.has(dbHost)) {
  throw new Error(`[email-verification-gate] refusing to write fixtures on non-local host ${dbHost}`);
}

const INVALID = { message: "Invalid email or password" };
const RESEND = { message: VERIFICATION_RESEND_MESSAGE };
const CHANGE = { message: VERIFICATION_EMAIL_CHANGE_MESSAGE };

function scryptHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, LOGIN_SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${(key as Buffer).toString("hex")}`);
    });
  });
}

interface Hit {
  status: number;
  data: any;
  setCookie?: string;
}

function request(server: http.Server, method: string, path: string, opts: { body?: object; cookie?: string } = {}): Promise<Hit> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {};
    if (bodyStr) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    if (opts.cookie) headers.Cookie = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        const rawSet = res.headers["set-cookie"];
        const setCookie = rawSet?.find((c) => c.startsWith("connect.sid"))?.split(";")[0];
        try {
          resolve({ status: res.statusCode ?? 0, data: raw ? JSON.parse(raw) : null, setCookie });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw, setCookie });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let server: http.Server;
const createdIds: string[] = [];

before(async () => {
  const app = express();
  app.use(express.json());
  await setupAuth(app);
  app.use(emailVerificationGate);
  registerAuthRoutes(app);
  setupEmailAuth(app);
  app.get("/api/probe", isAuthenticated, (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/verify-email", (_req, res) => {
    res.type("html").send("<main>verify</main>");
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const id of createdIds) await deleteUser(id);
  await pool.end();
});

async function insertUser(opts: {
  email: string;
  password: string | null;
  isDeleted?: boolean;
  isSuspended?: boolean;
  emailVerified?: Date | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: opts.email,
    password: opts.password,
    firstName: "Verify",
    lastName: "Gate",
    role: "user",
    authProvider: "email",
    isDeleted: opts.isDeleted ?? false,
    isSuspended: opts.isSuspended ?? false,
    emailVerified: opts.emailVerified ?? null,
    termsAcceptedAt: new Date(),
    privacyAcceptedAt: new Date(),
  });
  createdIds.push(id);
  return id;
}

async function deleteUser(id: string) {
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'signupAccountId' = ${id}`);
  await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM trips WHERE user_id = ${id}`);
  await db.delete(users).where(eq(users.id, id));
}

async function tokenCount(userId: string): Promise<number> {
  const rows = await db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));
  return rows.length;
}

async function userEmail(id: string): Promise<{ email: string | null; emailVerified: Date | null }> {
  const [row] = await db.select({ email: users.email, emailVerified: users.emailVerified }).from(users).where(eq(users.id, id));
  return row;
}

describe("held sign-in", () => {
  const tag = crypto.randomBytes(4).toString("hex");
  const email = `s09-supply-${tag}@t.test`;
  const password = `supply-${tag}-ok`;
  let userId = "";
  let cookie = "";

  it("a supply sign-up can sign in and open the product", async () => {
    const reg = await request(server, "POST", "/api/auth/register", {
      body: { email, password, firstName: "Supply", lastName: "Scout", ...SUPPLY_PROVIDER_SIGNUP_EXTRA },
    });
    assert.equal(reg.status, 202);
    assert.equal(reg.data.code, REGISTRATION_NEUTRAL_CODE);
    const [row] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email));
    assert.ok(row);
    userId = row.id;
    createdIds.push(userId);
    assert.equal(row.emailVerified, null);

    const bad = await request(server, "POST", "/api/auth/login", { body: { email, password: "not-the-password" } });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.data, INVALID);
    assert.equal("emailVerificationRequired" in (bad.data ?? {}), false);

    const login = await request(server, "POST", "/api/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.message, "Logged in successfully");
    assert.equal(login.data.emailVerificationRequired, false);
    assert.equal(login.data.nextStep, null);
    cookie = login.setCookie ?? "";
    assert.ok(cookie);

    const me = await request(server, "GET", "/api/auth/user", { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.emailVerificationRequired, false);
    assert.equal(me.data.nextStep, null);

    const probe = await request(server, "GET", "/api/probe", { cookie });
    assert.equal(probe.status, 200);
    assert.equal(probe.data.ok, true);

    const page = await request(server, "GET", "/verify-email", { cookie });
    assert.equal(page.status, 200);
    assert.equal(page.data, "<main>verify</main>");
  });

  it("a deleted account with the right password is still refused as deleted", async () => {
    const deletedEmail = `s09-deleted-${tag}@t.test`;
    const hash = await scryptHash(password);
    await insertUser({ email: deletedEmail, password: hash, isDeleted: true });
    const hit = await request(server, "POST", "/api/auth/login", { body: { email: deletedEmail, password } });
    assert.equal(hit.status, 403);
    assert.equal(hit.data.code, undefined);
    assert.match(hit.data.message, /deleted/i);
  });
});

describe("grandfathered activity", () => {
  it("a trip keeps the product open and leaves email_verified null", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `s09-active-${tag}@t.test`;
    const password = `active-${tag}-ok`;
    const hash = await scryptHash(password);
    const id = await insertUser({ email, password: hash });
    await db.execute(sql`
      INSERT INTO trips (id, user_id, destination, start_date, end_date)
      VALUES (${crypto.randomUUID()}, ${id}, 'Kyoto', '2026-11-01', '2026-11-03')
    `);
    const login = await request(server, "POST", "/api/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.emailVerificationRequired, false);
    assert.equal(login.data.nextStep, null);
    const cookie = login.setCookie ?? "";
    const probe = await request(server, "GET", "/api/probe", { cookie });
    assert.equal(probe.status, 200);
    assert.equal(probe.data.ok, true);
    await db.execute(sql`DELETE FROM trips WHERE user_id = ${id}`);
    const again = await request(server, "GET", "/api/probe", { cookie });
    assert.equal(again.status, 200, "the session remembers activity so a later request does not re-hold");
    const row = await userEmail(id);
    assert.equal(row.emailVerified, null);
  });
});

describe("verification links", () => {
  it("is single-use, expiring, and idempotent once the address is verified", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const id = await insertUser({
      email: `s09-token-${tag}@t.test`,
      password: await scryptHash(`token-${tag}-ok`),
    });
    const first = await mintEmailVerificationToken(id);
    const second = await mintEmailVerificationToken(id);
    const revoked = await request(server, "POST", "/api/auth/verify-email", { body: { token: first.raw } });
    assert.equal(revoked.status, 400);
    assert.equal(revoked.data.message, VERIFY_EMAIL_INVALID_MESSAGE);

    const ok = await request(server, "POST", "/api/auth/verify-email", { body: { token: second.raw } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { message: VERIFY_EMAIL_SUCCESS_MESSAGE });
    const again = await request(server, "POST", "/api/auth/verify-email", { body: { token: second.raw } });
    assert.equal(again.status, 200);
    assert.deepEqual(again.data, { message: VERIFY_EMAIL_SUCCESS_MESSAGE });
    assert.ok((await userEmail(id)).emailVerified);

    const expiredId = await insertUser({
      email: `s09-expired-${tag}@t.test`,
      password: await scryptHash(`exp-${tag}-ok`),
    });
    const expired = await mintEmailVerificationToken(expiredId);
    await db.execute(sql`
      UPDATE email_verification_tokens
         SET expires_at = NOW() - interval '1 hour'
       WHERE user_id = ${expiredId} AND used_at IS NULL
    `);
    const stale = await request(server, "POST", "/api/auth/verify-email", { body: { token: expired.raw } });
    assert.equal(stale.status, 400);
    assert.equal(stale.data.message, VERIFY_EMAIL_INVALID_MESSAGE);
    assert.equal((await userEmail(expiredId)).emailVerified, null);
  });
});

describe("resend does not reveal an address", () => {
  it("answers one sentence five times and then 429", async () => {
    resetRateLimitKeysForTests("verify-email:");
    const tag = crypto.randomBytes(4).toString("hex");
    const unverified = await insertUser({
      email: `s09-resend-${tag}@t.test`,
      password: await scryptHash(`resend-${tag}-ok`),
    });
    const verified = await insertUser({
      email: `s09-verified-${tag}@t.test`,
      password: await scryptHash(`resend-${tag}-ok`),
      emailVerified: new Date(),
    });
    const deleted = await insertUser({
      email: `s09-resend-del-${tag}@t.test`,
      password: await scryptHash(`resend-${tag}-ok`),
      isDeleted: true,
    });
    const suspended = await insertUser({
      email: `s09-resend-sus-${tag}@t.test`,
      password: await scryptHash(`resend-${tag}-ok`),
      isSuspended: true,
    });
    const beforeUnverified = await tokenCount(unverified);
    const beforeVerified = await tokenCount(verified);

    const calls: { body: object; email?: string }[] = [
      { body: { email: "not-an-email" } },
      { body: { email: `nobody-${tag}@t.test` } },
      { body: { email: `s09-resend-${tag}@t.test` }, email: `s09-resend-${tag}@t.test` },
      { body: { email: `s09-verified-${tag}@t.test` } },
      { body: { email: `s09-resend-del-${tag}@t.test` } },
    ];
    const bodies: unknown[] = [];
    for (const call of calls) {
      const hit = await request(server, "POST", "/api/auth/resend-verification", { body: call.body });
      assert.equal(hit.status, 200, JSON.stringify(hit.data));
      bodies.push(hit.data);
      if (call.email) assert.equal(JSON.stringify(hit.data).includes(call.email), false);
    }
    for (const body of bodies) assert.deepEqual(body, RESEND);
    assert.equal(await tokenCount(unverified), beforeUnverified + 1);
    assert.equal(await tokenCount(verified), beforeVerified);
    assert.equal(await tokenCount(deleted), 0);
    assert.equal(await tokenCount(suspended), 0);

    const blocked = await request(server, "POST", "/api/auth/resend-verification", {
      body: { email: `s09-resend-sus-${tag}@t.test` },
    });
    assert.equal(blocked.status, 429);
    assert.equal(JSON.stringify(blocked.data).includes(`s09-resend-sus-${tag}@t.test`), false);
    assert.notDeepEqual(blocked.data, RESEND);
    assert.equal(await tokenCount(suspended), 0);
  });
});

describe("change unverified email", () => {
  it("keeps one sentence for a free, taken, same, verified, and grandfathered address", async () => {
    resetRateLimitKeysForTests("verify-email:");
    const tag = crypto.randomBytes(4).toString("hex");
    const password = `change-${tag}-ok`;
    const hash = await scryptHash(password);
    const heldEmail = `s09-held-${tag}@t.test`;
    const held = await insertUser({ email: heldEmail, password: hash });
    const takenEmail = `s09-taken-${tag}@t.test`;
    await insertUser({ email: takenEmail, password: hash, emailVerified: new Date() });
    const grandfatherEmail = `s09-gf-${tag}@t.test`;
    const grandfather = await insertUser({ email: grandfatherEmail, password: hash });
    await db.execute(sql`
      INSERT INTO trips (id, user_id, destination, start_date, end_date)
      VALUES (${crypto.randomUUID()}, ${grandfather}, 'Kyoto', '2026-11-01', '2026-11-03')
    `);
    const verifiedEmail = `s09-already-${tag}@t.test`;
    const verified = await insertUser({ email: verifiedEmail, password: hash, emailVerified: new Date() });
    await changeUnverifiedEmail(verified, `s09-should-not-${tag}@t.test`, null);
    assert.equal((await userEmail(verified)).email, verifiedEmail);

    const heldLogin = await request(server, "POST", "/api/auth/login", { body: { email: heldEmail, password } });
    const heldCookie = heldLogin.setCookie ?? "";
    const gfLogin = await request(server, "POST", "/api/auth/login", { body: { email: grandfatherEmail, password } });
    const gfCookie = gfLogin.setCookie ?? "";

    const invalid = await request(server, "POST", "/api/auth/change-unverified-email", {
      cookie: heldCookie,
      body: { email: "nope", extra: true },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.message, "Validation failed");

    const gfHit = await request(server, "POST", "/api/auth/change-unverified-email", {
      cookie: gfCookie,
      body: { email: `s09-gf-new-${tag}@t.test` },
    });
    assert.equal(gfHit.status, 200);
    assert.deepEqual(gfHit.data, CHANGE);
    assert.equal((await userEmail(grandfather)).email, grandfatherEmail);

    const takenHit = await request(server, "POST", "/api/auth/change-unverified-email", {
      cookie: heldCookie,
      body: { email: takenEmail },
    });
    assert.equal(takenHit.status, 200);
    assert.deepEqual(takenHit.data, CHANGE);
    assert.equal((await userEmail(held)).email, heldEmail);

    const before = await tokenCount(held);
    const same = await request(server, "POST", "/api/auth/change-unverified-email", {
      cookie: heldCookie,
      body: { email: heldEmail },
    });
    assert.equal(same.status, 200);
    assert.deepEqual(same.data, CHANGE);
    assert.equal(await tokenCount(held), before + 1);
    assert.equal((await userEmail(held)).email, heldEmail);

    const free = `s09-free-${tag}@t.test`;
    const moved = await request(server, "POST", "/api/auth/change-unverified-email", {
      cookie: heldCookie,
      body: { email: free },
    });
    assert.equal(moved.status, 200);
    assert.deepEqual(moved.data, CHANGE);
    assert.equal(JSON.stringify(moved.data).includes(free), false);
    assert.equal((await userEmail(held)).email, free);
  });
});

describe("traveler sign-up", () => {
  let previousMode: string | null = null;
  let hadModeRow = false;

  before(async () => {
    const existing = await db.execute(sql`
      SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING} LIMIT 1
    `);
    hadModeRow = existing.rows.length > 0;
    previousMode = hadModeRow ? String((existing.rows[0] as { setting_value: string }).setting_value) : null;
  });

  after(async () => {
    if (hadModeRow) {
      await db.execute(sql`
        UPDATE platform_settings SET setting_value = ${previousMode}
        WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}
      `);
    } else {
      await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
    }
    invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
  });

  it("waitlist refuses a traveler before an account exists, and open mode lets the new account sign in", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    await db.execute(sql`
      INSERT INTO platform_settings (setting_key, setting_value, description)
      VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, 'waitlist', 's09 test')
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'
    `);
    invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
    const waitEmail = `s09-wait-${tag}@t.test`;
    const refused = await request(server, "POST", "/api/auth/register", {
      body: { email: waitEmail, password: `wait-${tag}-ok`, firstName: "Wait", lastName: "List" },
    });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, TRAVELER_WAITLIST);
    const [absent] = await db.select({ id: users.id }).from(users).where(eq(users.email, waitEmail));
    assert.equal(absent, undefined);

    await db.execute(sql`
      UPDATE platform_settings SET setting_value = 'open' WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}
    `);
    invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
    const openEmail = `s09-open-${tag}@t.test`;
    const password = `open-${tag}-ok`;
    const created = await request(server, "POST", "/api/auth/register", {
      body: { email: openEmail, password, firstName: "Open", lastName: "Mode" },
    });
    assert.equal(created.status, 202);
    const [row] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, openEmail));
    assert.ok(row);
    createdIds.push(row.id);
    assert.equal(row.emailVerified, null);
    const login = await request(server, "POST", "/api/auth/login", { body: { email: openEmail, password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.emailVerificationRequired, false);
    const probe = await request(server, "GET", "/api/probe", { cookie: login.setCookie });
    assert.equal(probe.status, 200);
    assert.equal(probe.data.ok, true);
  });
});
