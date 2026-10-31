/**
 * Sign in with Apple routes (row 282). The flag defaults off. With the flag on,
 * a locally signed id_token stands in for Apple. No Apple secret is embedded.
 *
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/apple-sign-in.http.test.ts
 */
import crypto from "crypto";
import http from "node:http";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "ci-test-secret-not-for-production";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.NODE_ENV ??= "test";
delete process.env.SIGN_IN_WITH_APPLE_ENABLED;

const { db, pool } = await import("../db");
const { users } = await import("../../shared/models/auth");
const { eq, sql } = await import("drizzle-orm");
const { setupAuth } = await import("../replit_integrations/auth/replitAuth");
const { registerAppleAuthRoutes, appleStrategyRegistered } = await import("../replit_integrations/auth/appleAuth");
const { APPLE_ISSUER } = await import("../replit_integrations/auth/apple-id-token");
const { SIGN_IN_WITH_APPLE_ENABLED } = await import("../replit_integrations/auth/apple-env");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING } = await import("../../shared/launch-signup");
const { EMAIL_SIGN_IN_REQUIRED_PARAM } = await import("../replit_integrations/auth/email-merge");

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://localhost/traveloure").hostname;
if (!DISPOSABLE.has(dbHost)) {
  throw new Error(`[apple-sign-in] refusing to write fixtures on non-local host ${dbHost}`);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
jwk.kid = "test-kid";
const keys = [jwk];

function setAppleEnv(): void {
  process.env.APPLE_TEAM_ID = crypto.randomBytes(6).toString("hex");
  process.env.APPLE_SERVICES_ID = `svc.${crypto.randomBytes(8).toString("hex")}`;
  process.env.APPLE_KEY_ID = crypto.randomBytes(5).toString("hex");
  process.env.APPLE_PRIVATE_KEY = crypto.randomBytes(48).toString("base64");
}

function sign(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-kid", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  return `${data}.${sig}`;
}

function idToken(nonce: string, extra: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  return sign({
    iss: APPLE_ISSUER,
    aud: process.env.APPLE_SERVICES_ID,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce,
    ...extra,
    ...overrides,
  });
}

interface Hit {
  status: number;
  location?: string;
  setCookie?: string;
  body: string;
}

function request(
  server: http.Server,
  method: string,
  path: string,
  opts: { form?: Record<string, string>; cookie?: string } = {},
): Promise<Hit> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = opts.form ? new URLSearchParams(opts.form).toString() : undefined;
    const headers: Record<string, string | number> = {};
    if (bodyStr) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    if (opts.cookie) headers.Cookie = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        const rawSet = res.headers["set-cookie"];
        const setCookie = rawSet?.find((cookie) => cookie.startsWith("connect.sid"))?.split(";")[0];
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location,
          setCookie,
          body: raw,
        });
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value, description)
    VALUES (${key}, ${value}, 'row 282 test')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = ${value}
  `);
  invalidatePlatformFlagCache(key);
}

const createdIds: string[] = [];
let server: http.Server;
let previousMode: string | null = null;
let hadModeRow = false;
let previousRegistration: string | null = null;
let hadRegistrationRow = false;

describe("flag off", () => {
  it("routes answer 404 and no Apple strategy is registered", async () => {
    setAppleEnv();
    delete process.env[SIGN_IN_WITH_APPLE_ENABLED];
    const off = express();
    registerAppleAuthRoutes(off);
    assert.equal(appleStrategyRegistered(), false);
    const offServer = http.createServer(off);
    await listen(offServer);
    const offGet = await request(offServer, "GET", "/api/auth/apple");
    const offPost = await request(offServer, "POST", "/api/auth/apple/callback", {
      form: { state: "x", id_token: "y" },
    });
    assert.equal(offGet.status, 404);
    assert.equal(offPost.status, 404);
    await close(offServer);
  });

  it("stays 404 when the flag is on but an Apple env name is unset", async () => {
    setAppleEnv();
    process.env[SIGN_IN_WITH_APPLE_ENABLED] = "true";
    delete process.env.APPLE_PRIVATE_KEY;
    const missing = express();
    registerAppleAuthRoutes(missing);
    assert.equal(appleStrategyRegistered(), false);
    const missingServer = http.createServer(missing);
    await listen(missingServer);
    const missingGet = await request(missingServer, "GET", "/api/auth/apple");
    const missingPost = await request(missingServer, "POST", "/api/auth/apple/callback", {
      form: { state: "x", id_token: "y" },
    });
    assert.equal(missingGet.status, 404);
    assert.equal(missingPost.status, 404);
    await close(missingServer);
    delete process.env[SIGN_IN_WITH_APPLE_ENABLED];
  });
});

describe("Sign in with Apple", () => {
  before(async () => {
    setAppleEnv();
    process.env[SIGN_IN_WITH_APPLE_ENABLED] = "true";

    const mode = await db.execute(sql`
      SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING} LIMIT 1
    `);
    hadModeRow = mode.rows.length > 0;
    previousMode = hadModeRow ? String((mode.rows[0] as { setting_value: string }).setting_value) : null;
    const registration = await db.execute(sql`
      SELECT setting_value FROM platform_settings WHERE setting_key = 'new_user_registration_enabled' LIMIT 1
    `);
    hadRegistrationRow = registration.rows.length > 0;
    previousRegistration = hadRegistrationRow
      ? String((registration.rows[0] as { setting_value: string }).setting_value)
      : null;
    await upsertSetting(TRAVELER_SIGNUP_MODE_SETTING, "open");
    await upsertSetting("new_user_registration_enabled", "true");

    const app = express();
    await setupAuth(app);
    app.use(express.urlencoded({ extended: false }));
    registerAppleAuthRoutes(app, { getJwks: async () => ({ keys }) });
    assert.equal(appleStrategyRegistered(), true);
    server = http.createServer(app);
    await listen(server);
  });

  after(async () => {
    if (server) await close(server);
    for (const id of createdIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    if (hadModeRow) {
      await upsertSetting(TRAVELER_SIGNUP_MODE_SETTING, previousMode ?? "waitlist");
    } else {
      await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
      invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
    }
    if (hadRegistrationRow) {
      await upsertSetting("new_user_registration_enabled", previousRegistration ?? "true");
    } else {
      await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'new_user_registration_enabled'`);
      invalidatePlatformFlagCache("new_user_registration_enabled");
    }
    delete process.env[SIGN_IN_WITH_APPLE_ENABLED];
    await pool.end();
  });

  async function start(path = "/api/auth/apple"): Promise<{ state: string; nonce: string; cookie: string; location: string }> {
    const hit = await request(server, "GET", path);
    assert.equal(hit.status, 302);
    assert.ok(hit.location);
    assert.ok(hit.setCookie);
    const loc = new URL(hit.location);
    assert.equal(loc.origin, "https://appleid.apple.com");
    assert.equal(loc.pathname, "/auth/authorize");
    assert.equal(loc.searchParams.get("response_mode"), "form_post");
    assert.equal(loc.searchParams.get("response_type"), "code id_token");
    assert.equal(loc.searchParams.get("client_id") === process.env.APPLE_SERVICES_ID, true);
    assert.equal(loc.searchParams.has("client_secret"), false);
    assert.equal(hit.location.includes(process.env.APPLE_PRIVATE_KEY ?? "missing-key"), false);
    const state = loc.searchParams.get("state");
    const nonce = loc.searchParams.get("nonce");
    assert.ok(state);
    assert.ok(nonce);
    return { state, nonce, cookie: hit.setCookie, location: hit.location };
  }

  async function finish(cookie: string, state: string, token: string, userField?: string): Promise<Hit> {
    const form: Record<string, string> = { state, id_token: token };
    if (userField) form.user = userField;
    return request(server, "POST", "/api/auth/apple/callback", { cookie, form });
  }

  it("creates an account from the subject and the token email, ignoring the form email", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-new-${tag}@t.test`;
    const sub = `sub-new-${tag}`;
    const begun = await start();
    const done = await finish(
      begun.cookie,
      begun.state,
      idToken(begun.nonce, { sub, email, email_verified: true }),
      JSON.stringify({ name: { firstName: "Aki", lastName: "Mori" }, email: "other@example.com" }),
    );
    assert.equal(done.status, 302);
    assert.equal(new URL(done.location ?? "/", "http://127.0.0.1").pathname, "/");
    const rows = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(rows.length, 1);
    createdIds.push(rows[0].id);
    assert.equal(rows[0].email, email);
    assert.equal(rows[0].firstName, "Aki");
    assert.equal(rows[0].lastName, "Mori");
    assert.equal(rows[0].authProvider, "apple");
    assert.equal(rows[0].role, "user");
    assert.ok(rows[0].emailVerified);
  });

  it("a traveler sign-up is allowed", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-traveler-${tag}@t.test`;
    const sub = `sub-traveler-${tag}`;
    const begun = await start("/api/auth/apple?intent=traveler");
    const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: true }));
    assert.equal(done.status, 302);
    assert.equal(new URL(done.location ?? "/", "http://127.0.0.1").pathname, "/");
    const rows = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(rows.length, 1);
    createdIds.push(rows[0].id);
    assert.equal(rows[0].role, "user");
    assert.equal(rows[0].email, email);
  });

  async function refusedSignup(path: string): Promise<void> {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-supply-${tag}@t.test`;
    const sub = `sub-supply-${tag}`;
    const begun = await start(path);
    const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: true }));
    assert.equal(done.status, 302);
    const loc = new URL(done.location ?? "/", "http://127.0.0.1");
    assert.equal(loc.pathname, "/login");
    assert.equal(loc.search, "");
    const bySub = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(bySub.length, 0);
    const byEmail = await db.select().from(users).where(eq(users.email, email));
    assert.equal(byEmail.length, 0);
  }

  it("a provider sign-up is refused with the generic auth redirect", async () => {
    await refusedSignup("/api/auth/apple?intent=supply&supplyRole=provider");
  });

  it("an expert sign-up is refused with the generic auth redirect", async () => {
    await refusedSignup("/api/auth/apple?intent=supply&supplyRole=expert");
  });

  it("an existing linked provider or expert account can still sign in", async () => {
    for (const role of ["service_provider", "local_expert"] as const) {
      const tag = crypto.randomBytes(4).toString("hex");
      const email = `apple-linked-${role}-${tag}@t.test`;
      const sub = `sub-linked-${role}-${tag}`;
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        email,
        firstName: "Linked",
        lastName: role,
        role,
        authProvider: "email",
        appleSub: sub,
        emailVerified: new Date(),
      });
      createdIds.push(id);
      const begun = await start("/api/auth/apple?intent=supply&supplyRole=provider");
      const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub }));
      assert.equal(done.status, 302);
      assert.equal(new URL(done.location ?? "/", "http://127.0.0.1").pathname, "/");
      const rows = await db.select().from(users).where(eq(users.appleSub, sub));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, id);
      assert.equal(rows[0].role, role);
    }
  });

  it("an unlinked provider or expert is not given an Apple subject", async () => {
    for (const role of ["service_provider", "travel_expert"] as const) {
      const tag = crypto.randomBytes(4).toString("hex");
      const email = `apple-unlinked-${role}-${tag}@t.test`;
      const sub = `sub-unlinked-${role}-${tag}`;
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        email,
        firstName: "Unlinked",
        lastName: role,
        role,
        authProvider: "email",
        emailVerified: new Date(),
      });
      createdIds.push(id);
      const begun = await start();
      const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: true }));
      assert.equal(done.status, 302);
      const loc = new URL(done.location ?? "/", "http://127.0.0.1");
      assert.equal(loc.pathname, "/login");
      assert.equal(loc.search, "");
      const [owner] = await db.select().from(users).where(eq(users.id, id));
      assert.equal(owner.appleSub, null);
      assert.equal(owner.role, role);
      const created = await db.select().from(users).where(eq(users.appleSub, sub));
      assert.equal(created.length, 0);
    }
  });

  it("a second sign-in with no email links the same account", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-again-${tag}@t.test`;
    const sub = `sub-again-${tag}`;
    const first = await start();
    const created = await finish(first.cookie, first.state, idToken(first.nonce, { sub, email, email_verified: true }));
    assert.equal(created.status, 302);
    const [row] = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.ok(row);
    createdIds.push(row.id);
    const second = await start();
    const again = await finish(second.cookie, second.state, idToken(second.nonce, { sub }));
    assert.equal(again.status, 302);
    const rows = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, row.id);
    assert.equal(rows[0].email, email);
  });

  it("a private-relay address merges through the email rule", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `relay-${tag}@privaterelay.appleid.com`;
    const sub = `sub-relay-${tag}`;
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email,
      firstName: "Relay",
      lastName: "Owner",
      role: "user",
      authProvider: "email",
    });
    createdIds.push(id);
    const begun = await start();
    const done = await finish(
      begun.cookie,
      begun.state,
      idToken(begun.nonce, { sub, email, email_verified: "true" }),
    );
    assert.equal(done.status, 302);
    const rows = await db.select().from(users).where(sql`lower(btrim(${users.email})) = ${email}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].appleSub, sub);
    assert.equal(rows[0].authProvider, "email");
  });

  it("an existing email account links instead of a second account", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-link-${tag}@t.test`;
    const sub = `sub-link-${tag}`;
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email,
      firstName: "Existing",
      lastName: "Owner",
      role: "user",
      authProvider: "email",
      emailVerified: new Date(),
    });
    createdIds.push(id);
    const begun = await start();
    const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: true }));
    assert.equal(done.status, 302);
    const rows = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
  });

  it("an unverified email does not merge and does not create a second account", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-unverified-${tag}@t.test`;
    const sub = `sub-unverified-${tag}`;
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email,
      firstName: "Unverified",
      lastName: "Owner",
      role: "user",
      authProvider: "email",
    });
    createdIds.push(id);
    const begun = await start();
    const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: false }));
    assert.equal(done.status, 302);
    assert.equal(new URL(done.location ?? "/", "http://127.0.0.1").searchParams.get("error"), EMAIL_SIGN_IN_REQUIRED_PARAM);
    const [owner] = await db.select().from(users).where(eq(users.id, id));
    assert.equal(owner.appleSub, null);
    const created = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(created.length, 0);
  });

  it("a verified email on a staff account does not merge", async () => {
    const tag = crypto.randomBytes(4).toString("hex");
    const email = `apple-admin-${tag}@t.test`;
    const sub = `sub-admin-${tag}`;
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email,
      firstName: "Staff",
      lastName: "Owner",
      role: "admin",
      authProvider: "email",
      emailVerified: new Date(),
    });
    createdIds.push(id);
    const begun = await start();
    const done = await finish(begun.cookie, begun.state, idToken(begun.nonce, { sub, email, email_verified: true }));
    assert.equal(done.status, 302);
    assert.equal(new URL(done.location ?? "/", "http://127.0.0.1").searchParams.get("error"), EMAIL_SIGN_IN_REQUIRED_PARAM);
    const [owner] = await db.select().from(users).where(eq(users.id, id));
    assert.equal(owner.appleSub, null);
    const created = await db.select().from(users).where(eq(users.appleSub, sub));
    assert.equal(created.length, 0);
  });
});
