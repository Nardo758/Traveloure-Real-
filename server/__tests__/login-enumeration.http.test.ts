/**
 * Login enumeration — the email login route (ledger `2026-10-21-login-enumeration`).
 *
 * Two clean loops, each with fresh randomized accounts on a disposable local database.
 * Unknown email, wrong password, and provider-only accounts get the same 401 body and
 * no authenticated session. Each valid attempt makes one default-parameter scrypt.
 * A correct password still logs in and regenerates the session. Deleted and suspended
 * checks still run after the credential check. Signup, reset, and logout stay as they are.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/login-enumeration.http.test.ts
 */
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
delete process.env.RESEND_API_KEY;

const { db, pool } = await import("../db");
const { users } = await import("../../shared/models/auth");
const { eq } = await import("drizzle-orm");
const { getSession, isAuthenticated } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { DUMMY_PASSWORD_HASH, LOGIN_SCRYPT_KEYLEN } = await import("../services/login-credentials.service");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING } = await import("../../shared/launch-signup");
const { REGISTRATION_NEUTRAL_CODE, REGISTRATION_NEUTRAL_MESSAGE } = await import("../../shared/registration-neutral");

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://localhost/traveloure").hostname;
if (!DISPOSABLE.has(dbHost)) {
  throw new Error(`[login-enumeration] refusing to write fixtures on non-local host ${dbHost}`);
}

const INVALID = { message: "Invalid email or password" };
const DUMMY_SALT = DUMMY_PASSWORD_HASH.split(":")[0];
const FORGOT = "If an account exists for that email, we've sent a reset link.";

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

interface ScryptCall { password: string; salt: string; keylen: number; hasOptions: boolean }

function spyScrypt(): { calls: ScryptCall[]; restore: () => void } {
  const calls: ScryptCall[] = [];
  const original = crypto.scrypt;
  crypto.scrypt = ((password: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, optionsOrCb: any, maybeCb?: any) => {
    const hasOptions = typeof optionsOrCb !== "function";
    calls.push({ password: String(password), salt: String(salt), keylen, hasOptions });
    if (hasOptions) return original(password, salt, keylen, optionsOrCb, maybeCb);
    return original(password, salt, keylen, optionsOrCb);
  }) as typeof crypto.scrypt;
  return { calls, restore: () => { crypto.scrypt = original; } };
}

let server: http.Server;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
  setupEmailAuth(app);
  app.post("/api/test/touch-session", (req, res) => {
    (req.session as { marker?: string }).marker = "before-login";
    res.json({ ok: true });
  });
  app.get("/api/test/ping", isAuthenticated as express.RequestHandler, (_req, res) => {
    res.json({ ok: true });
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function insertUser(opts: {
  email: string;
  password: string | null;
  authProvider: string;
  isDeleted?: boolean;
  isSuspended?: boolean;
  suspensionReason?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: opts.email,
    password: opts.password,
    firstName: "Enum",
    lastName: "Test",
    role: "user",
    authProvider: opts.authProvider,
    isDeleted: opts.isDeleted ?? false,
    isSuspended: opts.isSuspended ?? false,
    suspensionReason: opts.suspensionReason ?? null,
    termsAcceptedAt: new Date(),
    privacyAcceptedAt: new Date(),
  });
  return id;
}

async function deleteUser(id: string) {
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'signupAccountId' = ${id}`);
  await db.delete(users).where(eq(users.id, id));
}

async function assertUniformFailure(body: { email: string; password: string }, passwordColumn: string | null) {
  const spy = spyScrypt();
  try {
    const hit = await request(server, "POST", "/api/auth/login", { body });
    assert.equal(hit.status, 401);
    assert.deepEqual(hit.data, INVALID);
    assert.equal(JSON.stringify(hit.data).includes("Replit"), false);
    assert.equal(JSON.stringify(hit.data).includes("Facebook"), false);
    assert.equal(JSON.stringify(hit.data).includes("Instagram"), false);
    assert.equal(JSON.stringify(hit.data).includes("provider"), false);
    const ping = await request(server, "GET", "/api/test/ping", { cookie: hit.setCookie });
    assert.equal(ping.status, 401);
    assert.equal(spy.calls.length, 1, `expected one scrypt, got ${spy.calls.length}`);
    assert.equal(spy.calls[0].keylen, LOGIN_SCRYPT_KEYLEN);
    assert.equal(spy.calls[0].hasOptions, false);
    assert.equal(spy.calls[0].password, body.password);
    const expectedSalt = passwordColumn && passwordColumn.includes(":") && /^[0-9a-f]{128}$/i.test(passwordColumn.split(":")[1] ?? "")
      && passwordColumn.split(":").length === 2
      ? passwordColumn.split(":")[0]
      : DUMMY_SALT;
    assert.equal(spy.calls[0].salt, expectedSalt);
  } finally {
    spy.restore();
  }
}

for (const loop of ["a", "b"]) {
  describe(`login enumeration loop ${loop}`, () => {
    const tag = `${loop}-${crypto.randomBytes(4).toString("hex")}`;
    const emailUser = `enum-${tag}-mail@t.test`;
    const providerFacebook = `enum-${tag}-fb@t.test`;
    const providerReplit = `enum-${tag}-replit@t.test`;
    const providerOther = `enum-${tag}-other@t.test`;
    const malformed = `enum-${tag}-bad@t.test`;
    const spacedEmail = `enum-${tag}-space@t.test`;
    const deletedEmail = `enum-${tag}-del@t.test`;
    const suspendedEmail = `enum-${tag}-sus@t.test`;
    const unknownEmail = `enum-${tag}-missing@t.test`;
    const password = `correct-${tag}`;
    const spacedPassword = `  spaced ${tag}  `;
    const ids: string[] = [];
    let storedHash = "";
    let spacedHash = "";

    before(async () => {
      storedHash = await scryptHash(password);
      spacedHash = await scryptHash(spacedPassword);
      ids.push(await insertUser({ email: emailUser, password: storedHash, authProvider: "email" }));
      ids.push(await insertUser({ email: providerFacebook, password: null, authProvider: "facebook" }));
      ids.push(await insertUser({ email: providerReplit, password: null, authProvider: "replit" }));
      ids.push(await insertUser({ email: providerOther, password: null, authProvider: "google" }));
      ids.push(await insertUser({ email: malformed, password: "not-a-hash", authProvider: "email" }));
      ids.push(await insertUser({ email: spacedEmail, password: spacedHash, authProvider: "email" }));
      ids.push(await insertUser({
        email: deletedEmail,
        password: storedHash,
        authProvider: "email",
        isDeleted: true,
      }));
      ids.push(await insertUser({
        email: suspendedEmail,
        password: storedHash,
        authProvider: "email",
        isSuspended: true,
        suspensionReason: "policy-test",
      }));
    });

    after(async () => {
      for (const id of ids) await deleteUser(id);
    });

    it("unknown email, wrong password, and provider-only accounts match", async () => {
      await assertUniformFailure({ email: unknownEmail, password: "not-the-password" }, null);
      await assertUniformFailure({ email: emailUser, password: "not-the-password" }, storedHash);
      await assertUniformFailure({ email: providerFacebook, password: password }, null);
      await assertUniformFailure({ email: providerReplit, password: "another-try" }, null);
      await assertUniformFailure({ email: providerOther, password: password }, null);
      await assertUniformFailure({ email: malformed, password: password }, "not-a-hash");
      await assertUniformFailure({ email: emailUser.toUpperCase(), password: "still-wrong" }, storedHash);
    });

    it("a correct password logs in and regenerates the session; whitespace stays significant", async () => {
      const touched = await request(server, "POST", "/api/test/touch-session", {});
      assert.ok(touched.setCookie, "a pre-login session cookie");
      const spy = spyScrypt();
      let hit: Hit;
      try {
        hit = await request(server, "POST", "/api/auth/login", {
          body: { email: emailUser, password },
          cookie: touched.setCookie,
        });
      } finally {
        spy.restore();
      }
      assert.equal(hit.status, 200);
      assert.equal(hit.data.message, "Logged in successfully");
      assert.equal(hit.data.user.email, emailUser);
      assert.equal(spy.calls.length, 1);
      assert.equal(spy.calls[0].keylen, LOGIN_SCRYPT_KEYLEN);
      assert.equal(spy.calls[0].hasOptions, false);
      assert.equal(spy.calls[0].salt, storedHash.split(":")[0]);
      assert.ok(hit.setCookie);
      assert.notEqual(hit.setCookie, touched.setCookie);
      const ping = await request(server, "GET", "/api/test/ping", { cookie: hit.setCookie });
      assert.equal(ping.status, 200);
      const old = await request(server, "GET", "/api/test/ping", { cookie: touched.setCookie });
      assert.equal(old.status, 401);

      const padded = await request(server, "POST", "/api/auth/login", {
        body: { email: spacedEmail, password: spacedPassword.trim() },
      });
      assert.equal(padded.status, 401);
      assert.deepEqual(padded.data, INVALID);
      const exact = await request(server, "POST", "/api/auth/login", {
        body: { email: spacedEmail, password: spacedPassword },
      });
      assert.equal(exact.status, 200);
      assert.equal(exact.data.user.email, spacedEmail);
    });

    it("deleted and suspended checks run after a matching password and not before", async () => {
      const wrongDeleted = await request(server, "POST", "/api/auth/login", {
        body: { email: deletedEmail, password: "not-the-password" },
      });
      assert.equal(wrongDeleted.status, 401);
      assert.deepEqual(wrongDeleted.data, INVALID);

      const deleted = await request(server, "POST", "/api/auth/login", {
        body: { email: deletedEmail, password },
      });
      assert.equal(deleted.status, 403);
      assert.match(deleted.data.message, /deleted/i);
      const deletedPing = await request(server, "GET", "/api/test/ping", { cookie: deleted.setCookie });
      assert.equal(deletedPing.status, 401);

      const wrongSuspended = await request(server, "POST", "/api/auth/login", {
        body: { email: suspendedEmail, password: "not-the-password" },
      });
      assert.equal(wrongSuspended.status, 401);
      assert.deepEqual(wrongSuspended.data, INVALID);

      const suspended = await request(server, "POST", "/api/auth/login", {
        body: { email: suspendedEmail, password },
      });
      assert.equal(suspended.status, 403);
      assert.match(suspended.data.message, /suspended/i);
      assert.equal(suspended.data.reason, "policy-test");
      const suspendedPing = await request(server, "GET", "/api/test/ping", { cookie: suspended.setCookie });
      assert.equal(suspendedPing.status, 401);
    });

    it("malformed bodies are rejected before any scrypt, for an existing email and an unknown one", async () => {
      for (const email of [emailUser, unknownEmail]) {
        for (const body of [
          { email: "not-an-email", password: "x" },
          { email, password: "" },
          { email },
          {},
        ]) {
          const spy = spyScrypt();
          try {
            const hit = await request(server, "POST", "/api/auth/login", { body: body as object });
            assert.equal(hit.status, 400);
            assert.equal(hit.data.message, "Validation failed");
            assert.equal(spy.calls.length, 0);
            const ping = await request(server, "GET", "/api/test/ping", { cookie: hit.setCookie });
            assert.equal(ping.status, 401);
          } finally {
            spy.restore();
          }
        }
      }
    });

    it("a scrypt error is a 500, not a credential failure", async () => {
      const original = crypto.scrypt;
      crypto.scrypt = ((...args: any[]) => {
        const cb = args[args.length - 1];
        cb(new Error("scrypt unavailable"));
      }) as typeof crypto.scrypt;
      try {
        const hit = await request(server, "POST", "/api/auth/login", {
          body: { email: unknownEmail, password: "whatever" },
        });
        assert.equal(hit.status, 500);
        assert.deepEqual(hit.data, { message: "Failed to log in" });
        const ping = await request(server, "GET", "/api/test/ping", { cookie: hit.setCookie });
        assert.equal(ping.status, 401);
      } finally {
        crypto.scrypt = original;
      }
    });
  });
}

describe("signup, reset, and session regression", () => {
  const tag = crypto.randomBytes(4).toString("hex");
  const email = `enum-reg-${tag}@t.test`;
  const password = `register-${tag}-ok`;
  let createdId: string | null = null;
  let previousMode: string | null = null;
  let hadModeRow = false;

  before(async () => {
    const existing = await db.execute(sql`
      SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING} LIMIT 1
    `);
    hadModeRow = existing.rows.length > 0;
    previousMode = hadModeRow ? String((existing.rows[0] as { setting_value: string }).setting_value) : null;
    await db.execute(sql`
      INSERT INTO platform_settings (setting_key, setting_value, description)
      VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, 'open', 'login-enumeration test')
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'open'
    `);
    invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
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
    if (createdId) await deleteUser(createdId);
  });

  it("a new address and a duplicate address get the same neutral signup, then the password signs in", async () => {
    const body = { email, password, firstName: "Enum", lastName: "Test" };
    const first = await request(server, "POST", "/api/auth/register", { body });
    assert.equal(first.status, 202);
    assert.equal(first.data.code, REGISTRATION_NEUTRAL_CODE);
    assert.equal(first.data.message, REGISTRATION_NEUTRAL_MESSAGE);
    const ping = await request(server, "GET", "/api/test/ping", { cookie: first.setCookie });
    assert.equal(ping.status, 401);

    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    assert.ok(row);
    createdId = row.id;

    const second = await request(server, "POST", "/api/auth/register", { body });
    assert.equal(second.status, 202);
    assert.deepEqual(second.data, first.data);

    const login = await request(server, "POST", "/api/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    const authed = await request(server, "GET", "/api/test/ping", { cookie: login.setCookie });
    assert.equal(authed.status, 200);
    const out = await request(server, "POST", "/api/auth/logout", { cookie: login.setCookie });
    assert.equal(out.status, 200);
    const afterLogout = await request(server, "GET", "/api/test/ping", { cookie: login.setCookie });
    assert.equal(afterLogout.status, 401);
  });

  it("forgot-password stays generic for an unknown address, a password account, and a provider-only account", async () => {
    const providerEmail = `enum-reg-${tag}-provider@t.test`;
    const providerId = await insertUser({ email: providerEmail, password: null, authProvider: "facebook" });
    try {
      const bodies = [];
      for (const address of [email, `enum-reg-${tag}-missing@t.test`, providerEmail]) {
        const hit = await request(server, "POST", "/api/auth/forgot-password", { body: { email: address } });
        assert.equal(hit.status, 200);
        bodies.push(hit.data);
      }
      assert.deepEqual(bodies[0], { message: FORGOT });
      assert.deepEqual(bodies[1], bodies[0]);
      assert.deepEqual(bodies[2], bodies[0]);
      const bad = await request(server, "POST", "/api/auth/reset-password", {
        body: { token: "x".repeat(32), newPassword: "a-new-password" },
      });
      assert.equal(bad.status, 400);
      assert.match(bad.data.message, /invalid or has expired/i);
    } finally {
      await deleteUser(providerId);
    }
  });
});
