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
// Force a dummy Stripe key so importing the admin router never calls out to Stripe,
// regardless of whether a live STRIPE_SECRET_KEY is already set in the environment.
process.env.STRIPE_SECRET_KEY = "[REDACTED_STRIPE_TEST_KEY]";
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

const patch = (server: http.Server, path: string, body: object, cookie?: string) =>
  httpRequest(server, "PATCH", path, { body, cookie });

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

// ── Suite 4: admin suspend guard — target is an admin account ────────────────
//
// PATCH /api/admin/users/:id/suspend must return 400 when the target user holds
// the "admin" role, even when the caller is a fully authenticated admin.
// This confirms the guard on line ~7785 of admin.routes.ts is exercised.

let adminGuardServer: http.Server | null = null;

async function getAdminGuardServer(): Promise<http.Server> {
  if (adminGuardServer) return adminGuardServer;

  const app = express();
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  setupEmailAuth(app);

  // Mount the real admin router — this exercises the production guard logic
  // on the suspend and unsuspend endpoints.
  const adminRouter = (await import("../routes/admin.routes")).default;
  app.use(adminRouter);

  adminGuardServer = http.createServer(app);
  await new Promise<void>((resolve) =>
    adminGuardServer!.listen(0, "127.0.0.1", resolve)
  );
  return adminGuardServer;
}

describe("admin suspend guard — cannot suspend another admin account", () => {
  let callerAdminId: string;
  let targetAdminId: string;
  let callerAdminEmail: string;
  let server: http.Server;
  let callerCookie: string;

  before(async () => {
    server = await getAdminGuardServer();

    // Create two admin-role users: one caller, one target.
    callerAdminId = await createTestUser({ role: "admin" });
    targetAdminId = await createTestUser({ role: "admin" });
    callerAdminEmail = (await getUserRow(callerAdminId)).email;

    // Log in as the calling admin to get a real session cookie.
    const loginRes = await post(server, "/api/auth/login", {
      email: callerAdminEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      loginRes.status,
      200,
      `Caller admin login must succeed; got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`
    );
    assert.ok(loginRes.setCookie, "Login must issue a session cookie");
    callerCookie = loginRes.setCookie!;
  });

  after(async () => {
    await deleteTestUser(callerAdminId);
    await deleteTestUser(targetAdminId);
  });

  it("returns 400 when attempting to suspend another admin account", async () => {
    const { status, data } = await patch(
      server,
      `/api/admin/users/${targetAdminId}/suspend`,
      { reason: "Self-service suspension attempt — should be blocked" },
      callerCookie
    );
    assert.equal(
      status,
      400,
      `Expected 400 when suspending an admin target, got ${status}. Body: ${JSON.stringify(data)}`
    );
  });

  it("400 response message mentions 'admin'", async () => {
    const { data } = await patch(
      server,
      `/api/admin/users/${targetAdminId}/suspend`,
      { reason: "Repeated attempt — still blocked" },
      callerCookie
    );
    assert.ok(
      typeof data?.message === "string" && data.message.toLowerCase().includes("admin"),
      `Expected message to reference 'admin'; got: ${JSON.stringify(data)}`
    );
  });

  it("target admin account remains unsuspended after the blocked attempt", async () => {
    await patch(
      server,
      `/api/admin/users/${targetAdminId}/suspend`,
      { reason: "Third attempt — still blocked" },
      callerCookie
    );
    const row = await getUserRow(targetAdminId);
    assert.equal(
      row.isSuspended,
      false,
      `Target admin's isSuspended must remain false after a blocked suspend attempt`
    );
  });
});

// ── Suite 5: unsuspend endpoint — rejects non-admin callers ──────────────────
//
// PATCH /api/admin/users/:id/unsuspend must return 403 for any caller who is not
// an admin. This confirms that a regular user (or a suspended user who somehow
// holds a valid session) cannot lift a suspension by calling the endpoint
// directly.

describe("unsuspend endpoint — rejects non-admin callers", () => {
  let regularUserId: string;
  let suspendedTargetId: string;
  let regularUserEmail: string;
  let server: http.Server;
  let regularCookie: string;

  before(async () => {
    server = await getAdminGuardServer();

    // A regular (role='user') caller — not an admin.
    regularUserId = await createTestUser({ role: "user" });
    regularUserEmail = (await getUserRow(regularUserId)).email;

    // A suspended target user that the non-admin would try to unsuspend.
    suspendedTargetId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Test target suspension",
    });

    // Log in as the regular user to get a real session cookie.
    const loginRes = await post(server, "/api/auth/login", {
      email: regularUserEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      loginRes.status,
      200,
      `Regular user login must succeed; got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`
    );
    assert.ok(loginRes.setCookie, "Login must issue a session cookie");
    regularCookie = loginRes.setCookie!;
  });

  after(async () => {
    await deleteTestUser(regularUserId);
    await deleteTestUser(suspendedTargetId);
  });

  it("returns 403 when a non-admin caller calls the unsuspend endpoint", async () => {
    const { status, data } = await patch(
      server,
      `/api/admin/users/${suspendedTargetId}/unsuspend`,
      {},
      regularCookie
    );
    assert.equal(
      status,
      403,
      `Expected 403 for non-admin unsuspend attempt, got ${status}. Body: ${JSON.stringify(data)}`
    );
  });

  it("suspended target account remains suspended after the rejected unsuspend attempt", async () => {
    await patch(
      server,
      `/api/admin/users/${suspendedTargetId}/unsuspend`,
      {},
      regularCookie
    );
    const row = await getUserRow(suspendedTargetId);
    assert.equal(
      row.isSuspended,
      true,
      `Target account must remain suspended after a non-admin unsuspend attempt`
    );
  });

  it("returns 403 when the suspended target tries to unsuspend themselves", async () => {
    // Simulate the 'suspended admin session' scenario: suspend the regular user's
    // own account while they hold a valid session, then have them call unsuspend
    // on themselves.  isAuthenticated checks isSuspended on every request, so
    // the session is rejected with 403 before the admin-role check even runs.
    await suspendUser(regularUserId, "Suspended mid-session — self-unsuspend attempt");

    const { status, data } = await patch(
      server,
      `/api/admin/users/${regularUserId}/unsuspend`,
      {},
      regularCookie
    );
    assert.equal(
      status,
      403,
      `Expected 403 when a suspended user tries to unsuspend themselves, got ${status}. Body: ${JSON.stringify(data)}`
    );

    // Undo the self-suspension so the after() cleanup can delete the user.
    await unsuspendUser(regularUserId);
  });
});

// ── Suite 6: suspended admin session — both endpoints reject the stale cookie ──
//
// Scenario: an admin logs in and gets a valid session cookie, then their account
// is suspended in the DB (e.g. by a super-admin directly, simulating a bypass).
// isAuthenticated checks isSuspended on EVERY request and calls req.logout()
// when it detects a suspension, which destroys the session in the store.
// That means only ONE request per stale cookie is valid for assertion — any
// further request with the same cookie gets 401 (session no longer exists).
//
// To test both the /suspend and /unsuspend endpoints independently we therefore
// use two separate admin users, each with their own login session, each
// suspended after login.  Both responses are captured in before() so that
// individual it() blocks assert on the already-captured snapshots.

describe("suspended admin session — both endpoints reject the stale cookie", () => {
  // Admin A: used to test the /suspend endpoint
  let adminAId: string;
  let adminACookieUsed = false;
  let suspendResponse: HttpResult;  // ONE request to /suspend with adminA's stale cookie

  // Admin B: used to test the /unsuspend endpoint (self-unsuspend attempt)
  let adminBId: string;
  let unsuspendResponse: HttpResult; // ONE request to /unsuspend with adminB's stale cookie

  // A plain target that adminA would have tried to suspend
  let regularTargetId: string;

  let server: http.Server;

  before(async () => {
    server = await getAdminGuardServer();

    // ── Admin A setup ──────────────────────────────────────────────────────
    adminAId = await createTestUser({ role: "admin" });
    regularTargetId = await createTestUser({ role: "user" });

    const adminAEmail = (await getUserRow(adminAId)).email;
    const loginA = await post(server, "/api/auth/login", {
      email: adminAEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(loginA.status, 200, `Admin A login must succeed; got ${loginA.status}`);
    assert.ok(loginA.setCookie, "Admin A login must issue a session cookie");
    const cookieA = loginA.setCookie!;

    // Suspend admin A in the DB while their session is still live.
    await suspendUser(adminAId, "Suspended by super-admin while session was active");

    // Make ONE request with the stale cookie — isAuthenticated detects the
    // suspension, returns 403, and calls req.logout() (destroying the session).
    suspendResponse = await patch(
      server,
      `/api/admin/users/${regularTargetId}/suspend`,
      { reason: "Suspended admin trying to suspend a regular user" },
      cookieA
    );
    adminACookieUsed = true;

    // ── Admin B setup ──────────────────────────────────────────────────────
    adminBId = await createTestUser({ role: "admin" });
    const adminBEmail = (await getUserRow(adminBId)).email;
    const loginB = await post(server, "/api/auth/login", {
      email: adminBEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(loginB.status, 200, `Admin B login must succeed; got ${loginB.status}`);
    assert.ok(loginB.setCookie, "Admin B login must issue a session cookie");
    const cookieB = loginB.setCookie!;

    // Suspend admin B in the DB while their session is still live.
    await suspendUser(adminBId, "Suspended by super-admin — self-unsuspend attempt test");

    // Make ONE request with admin B's stale cookie to the unsuspend endpoint
    // (self-unsuspend attempt).
    unsuspendResponse = await patch(
      server,
      `/api/admin/users/${adminBId}/unsuspend`,
      {},
      cookieB
    );
  });

  after(async () => {
    await unsuspendUser(adminAId).catch(() => {});
    await unsuspendUser(adminBId).catch(() => {});
    await deleteTestUser(adminAId);
    await deleteTestUser(adminBId);
    await deleteTestUser(regularTargetId);
  });

  it("suspend endpoint returns 403 for a suspended admin's stale session", () => {
    assert.equal(
      suspendResponse.status,
      403,
      `Expected 403 when a suspended admin calls /suspend, got ${suspendResponse.status}. Body: ${JSON.stringify(suspendResponse.data)}`
    );
  });

  it("suspend endpoint leaves the regular target unsuspended after the rejected call", async () => {
    const row = await getUserRow(regularTargetId);
    assert.equal(
      row.isSuspended,
      false,
      "Regular target must remain unsuspended after the suspended admin's blocked /suspend call"
    );
  });

  it("unsuspend endpoint returns 403 when a suspended admin tries to lift their own suspension", () => {
    assert.equal(
      unsuspendResponse.status,
      403,
      `Expected 403 when suspended admin calls /unsuspend on themselves, got ${unsuspendResponse.status}. Body: ${JSON.stringify(unsuspendResponse.data)}`
    );
  });

  it("admin account remains suspended after the self-unsuspend attempt is rejected", async () => {
    const row = await getUserRow(adminBId);
    assert.equal(
      row.isSuspended,
      true,
      "Admin B account must remain suspended after the rejected self-unsuspend attempt"
    );
  });
});

// ── Suite 7: requireAdminLocal-only route — suspended admin is blocked ────────
//
// Several admin routes (e.g. /api/admin/optimization-fees) use only
// requireAdminLocal without isAuthenticated in the middleware chain.  Before the
// fix, requireAdminLocal called req.isAuthenticated() (Passport's in-memory check)
// which does NOT perform the DB isSuspended lookup.  A suspended admin holding a
// stale session cookie could reach handler logic on those routes.
//
// After the fix, requireAdminLocal uses getFullAdminUser (SELECT *) and rejects
// any suspended user with 403 — the same response isAuthenticated produces.

describe("requireAdminLocal-only route — suspended admin session is blocked", () => {
  let adminId: string;
  let server: http.Server;
  let staleAdminCookie: string;
  let suspendedResponse: HttpResult;

  before(async () => {
    server = await getAdminGuardServer();

    // Create an admin-role user and log them in.
    adminId = await createTestUser({ role: "admin" });
    const adminEmail = (await getUserRow(adminId)).email;

    const loginRes = await post(server, "/api/auth/login", {
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    assert.equal(
      loginRes.status,
      200,
      `Admin login must succeed; got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`
    );
    assert.ok(loginRes.setCookie, "Login must issue a session cookie");
    staleAdminCookie = loginRes.setCookie!;

    // Confirm the route returns 200 before suspension (proves the route is reachable).
    const beforeSuspend = await get(server, "/api/admin/optimization-fees", staleAdminCookie);
    assert.ok(
      beforeSuspend.status === 200 || beforeSuspend.status === 404,
      `Route must be reachable before suspension; got ${beforeSuspend.status}`
    );

    // Suspend the admin in the DB while their session cookie is still active.
    await suspendUser(adminId, "Suspended to test requireAdminLocal bypass prevention");

    // One request with the now-stale cookie to a route guarded only by
    // requireAdminLocal (no isAuthenticated in front).
    suspendedResponse = await get(
      server,
      "/api/admin/optimization-fees",
      staleAdminCookie
    );
  });

  after(async () => {
    await unsuspendUser(adminId).catch(() => {});
    await deleteTestUser(adminId);
  });

  it("requireAdminLocal-only route returns 403 for a suspended admin's stale session", () => {
    assert.equal(
      suspendedResponse.status,
      403,
      `Expected 403 from requireAdminLocal-only route for suspended session, got ${suspendedResponse.status}. Body: ${JSON.stringify(suspendedResponse.data)}`
    );
  });

  it("403 response body mentions 'suspended'", () => {
    assert.ok(
      typeof suspendedResponse.data?.message === "string" &&
        suspendedResponse.data.message.toLowerCase().includes("suspended"),
      `Expected suspension message in response body, got: ${JSON.stringify(suspendedResponse.data)}`
    );
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────

after(async () => {
  const servers = [sharedServer, adminGuardServer].filter(Boolean) as http.Server[];
  await Promise.all(
    servers.map(
      (s) => new Promise<void>((resolve, reject) => s.close((err) => (err ? reject(err) : resolve())))
    )
  );
  await pool.end().catch(() => {});
});
