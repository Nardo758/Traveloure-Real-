/**
 * user-suspension.db.test.ts
 *
 * Confirms end-to-end that account suspension is a real lockout, not just a badge.
 * Uses a real Express app with the production session + Passport stack so cookies
 * behave exactly as they do at runtime.
 *
 * Scenarios covered:
 *   1. Suspended user's email login is blocked with 403 + reason
 *   2. Wrong password still returns 401 — suspension is not a short-circuit
 *   3. Active session is rejected on the NEXT request after the account is suspended
 *      (isAuthenticated DB-checks isSuspended on every request, so the live session
 *       is terminated without a re-login)
 *   4. After reactivation (unsuspend), the user can log in and get a working session
 *
 * Run with:
 *   SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test server/__tests__/user-suspension.db.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

// SESSION_COOKIE_INSECURE=1: allows the session cookie to be sent over plain
// HTTP so the test server (no TLS) can replay it on subsequent requests.
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.DATABASE_URL ??= "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { eq } = await import("drizzle-orm");
const { users } = await import("../../shared/schema");
const { getSession, isAuthenticated } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");

// ── Password helper — same scrypt algorithm as emailAuth.ts ───────────────────

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, dk) => {
      if (err) return reject(err);
      resolve(`${salt}:${dk.toString("hex")}`);
    });
  });
}

// ── DB fixture helpers ────────────────────────────────────────────────────────

const TEST_PASSWORD = "Suspend1Test!";

async function createTestUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const password = await hashPassword(TEST_PASSWORD);
  await db.insert(users).values({
    id,
    email: `suspension-${id.slice(0, 8)}@test.invalid`,
    password,
    firstName: "Suspended",
    lastName: "Tester",
    role: "user",
    ...overrides,
  } as any);
  return id;
}

async function getUserRow(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

async function suspendUser(id: string, reason = "Test suspension"): Promise<void> {
  await db.update(users).set({
    isSuspended: true,
    suspendedAt: new Date(),
    suspensionReason: reason,
  } as any).where(eq(users.id, id));
}

async function unsuspendUser(id: string): Promise<void> {
  await db.update(users).set({
    isSuspended: false,
    suspendedAt: null,
    suspensionReason: null,
  } as any).where(eq(users.id, id));
}

async function deleteTestUser(id: string) {
  await db.delete(users).where(eq(users.id, id)).catch(() => {});
}

// ── Express app with production-equivalent auth stack ────────────────────────
// Mirrors what server/routes.ts does:
//   app.use(getSession())         — PG-backed sessions, createTableIfMissing:true
//   app.use(passport.initialize())
//   app.use(passport.session())
//   passport.serializeUser / deserializeUser
//   setupEmailAuth(app)           — POST /api/auth/login + /api/auth/logout
// Plus a protected sentinel endpoint that exercises isAuthenticated end-to-end.

let sharedApp: express.Express | null = null;
let sharedServer: http.Server | null = null;

async function getSharedServer(): Promise<http.Server> {
  if (sharedServer) return sharedServer;

  const app = express();
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Identity serialize/deserialize — required for req.login() in emailAuth.ts
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  setupEmailAuth(app);

  // Protected sentinel endpoint: returns 200 for a valid session, delegates to
  // isAuthenticated which performs the DB suspension check on every call.
  app.get("/api/test/ping", isAuthenticated as any, (_req, res) =>
    res.json({ ok: true })
  );

  sharedApp = app;
  sharedServer = http.createServer(app);
  await new Promise<void>((resolve) =>
    sharedServer!.listen(0, "127.0.0.1", resolve)
  );
  return sharedServer;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

interface HttpResult {
  status: number;
  data: any;
  /** Raw Set-Cookie header value to replay on subsequent requests */
  setCookie?: string;
}

function httpRequest(
  server: http.Server,
  method: string,
  path: string,
  opts: { body?: object; cookie?: string } = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": bodyStr ? Buffer.byteLength(bodyStr) : 0,
    };
    if (opts.cookie) headers["Cookie"] = opts.cookie;

    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          // Capture only the session cookie (connect.sid) to replay
          const rawSetCookie = res.headers["set-cookie"];
          const setCookie = rawSetCookie
            ?.find((c) => c.startsWith("connect.sid"))
            ?.split(";")[0]; // e.g. "connect.sid=s%3A..."
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw), setCookie });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw, setCookie });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const post = (server: http.Server, path: string, body: object, cookie?: string) =>
  httpRequest(server, "POST", path, { body, cookie });

const get = (server: http.Server, path: string, cookie?: string) =>
  httpRequest(server, "GET", path, { cookie });

// ── Suite 1: email login blocked for suspended user ───────────────────────────

describe("email login — suspended account", () => {
  let userId: string;
  let userEmail: string;
  let server: http.Server;

  before(async () => {
    server = await getSharedServer();
    userId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Policy violation — test",
    });
    userEmail = (await getUserRow(userId)).email;
  });

  after(async () => {
    await deleteTestUser(userId);
  });

  it("returns 403 for correct credentials when account is suspended", async () => {
    const { status, data } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(status, 403, `Expected 403, got ${status}. Body: ${JSON.stringify(data)}`);
  });

  it("response message mentions 'suspended'", async () => {
    const { data } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.ok(
      typeof data?.message === "string" && data.message.toLowerCase().includes("suspended"),
      `Expected suspension message, got: ${JSON.stringify(data)}`
    );
  });

  it("response body includes the stored suspension reason", async () => {
    const { data } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      data?.reason,
      "Policy violation — test",
      `Expected suspension reason in response, got: ${JSON.stringify(data)}`
    );
  });

  it("wrong password returns 401 — suspension is not a short-circuit", async () => {
    // Password verification happens BEFORE the suspension check in emailAuth.ts.
    // A wrong password must still produce 401, not 403.
    const { status } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: "WrongPassword!",
    });
    assert.equal(
      status,
      401,
      `Expected 401 for wrong password (suspension check is after password check), got ${status}`
    );
  });
});

// ── Suite 2: active session rejected by isAuthenticated after suspension ───────

describe("active session — rejected on next request after suspension", () => {
  let userId: string;
  let userEmail: string;
  let server: http.Server;
  // Single response captured after suspension — isAuthenticated calls req.logout()
  // which invalidates the cookie, so we make exactly one post-suspension request
  // and assert all three properties from that one response.
  let suspendedResponse: HttpResult;

  before(async () => {
    server = await getSharedServer();
    userId = await createTestUser(); // starts unsuspended
    userEmail = (await getUserRow(userId)).email;

    // Step 1: Log in and obtain a real session cookie
    const loginRes = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      loginRes.status,
      200,
      `Login before suspension should succeed; got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`
    );
    assert.ok(loginRes.setCookie, "Login response must set a session cookie (connect.sid)");
    const sessionCookie = loginRes.setCookie!;

    // Step 2: Confirm the session works — protected endpoint returns 200
    const beforeSuspend = await get(server, "/api/test/ping", sessionCookie);
    assert.equal(
      beforeSuspend.status,
      200,
      `Protected endpoint should return 200 before suspension; got ${beforeSuspend.status}`
    );

    // Step 3: Suspend the user while the session is still active
    await suspendUser(userId, "Fraud — mid-session test");

    // Step 4: Make ONE request with the still-active cookie.  isAuthenticated
    // detects isSuspended via a fresh DB lookup and calls req.logout() before
    // returning 403 — that invalidates the cookie, so we capture all assertions
    // from this single response rather than making multiple requests.
    suspendedResponse = await get(server, "/api/test/ping", sessionCookie);
  });

  after(async () => {
    await deleteTestUser(userId);
  });

  it("protected endpoint returns 403 on the next request after account is suspended", () => {
    // isAuthenticated checks isSuspended from the DB on EVERY request, so even
    // a session that was valid seconds ago is immediately rejected.
    assert.equal(
      suspendedResponse.status,
      403,
      `Expected 403 after mid-session suspension; got ${suspendedResponse.status}. Body: ${JSON.stringify(suspendedResponse.data)}`
    );
  });

  it("403 response message mentions 'suspended'", () => {
    const { data } = suspendedResponse;
    assert.ok(
      typeof data?.message === "string" && data.message.toLowerCase().includes("suspended"),
      `Expected suspended message in session-gate response, got: ${JSON.stringify(data)}`
    );
  });

  it("403 response includes the suspension reason", () => {
    const { data } = suspendedResponse;
    assert.equal(
      data?.reason,
      "Fraud — mid-session test",
      `Expected suspension reason in session-gate response, got: ${JSON.stringify(data)}`
    );
  });
});

// ── Suite 3: reactivation — access restored after unsuspend ──────────────────

describe("account reactivation — full login succeeds after unsuspend", () => {
  let userId: string;
  let userEmail: string;
  let server: http.Server;

  before(async () => {
    server = await getSharedServer();
    userId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Temporary block",
    });
    userEmail = (await getUserRow(userId)).email;

    // Simulate admin unsuspend — same fields PATCH /api/admin/users/:id/unsuspend writes
    await unsuspendUser(userId);
  });

  after(async () => {
    await deleteTestUser(userId);
  });

  it("email login returns 200 after reactivation", async () => {
    const { status, data } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      status,
      200,
      `Expected 200 after reactivation, got ${status}: ${JSON.stringify(data)}`
    );
  });

  it("session obtained after reactivation reaches isAuthenticated-protected endpoints", async () => {
    const loginRes = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(loginRes.status, 200, "Login after reactivation must succeed");
    assert.ok(loginRes.setCookie, "Login must issue a session cookie after reactivation");

    const pingRes = await get(server, "/api/test/ping", loginRes.setCookie!);
    assert.equal(
      pingRes.status,
      200,
      `Protected endpoint must return 200 with reactivated session; got ${pingRes.status}: ${JSON.stringify(pingRes.data)}`
    );
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────

after(async () => {
  if (sharedServer) {
    await new Promise<void>((resolve, reject) =>
      sharedServer!.close((err) => (err ? reject(err) : resolve()))
    );
  }
  await pool.end().catch(() => {});
});
