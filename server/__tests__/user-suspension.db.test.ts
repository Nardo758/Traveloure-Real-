/**
 * user-suspension.db.test.ts
 *
 * Confirms end-to-end that account suspension is a real lockout:
 *   1. Email login for a suspended user returns 403 with a clear message +
 *      the stored suspension reason
 *   2. An already-authenticated user whose account is suspended is rejected on
 *      their next request by the isAuthenticated middleware (session gate)
 *   3. Wrong password still returns 401 even for suspended accounts (no short-circuit)
 *   4. After reactivation (unsuspend), isAuthenticated calls next() again
 *   5. After reactivation, email login is no longer blocked by suspension
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/user-suspension.db.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";

process.env.DATABASE_URL ??= "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { eq } = await import("drizzle-orm");
const { users } = await import("../../shared/schema");
const { isAuthenticated } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");

// ── Password helper — same algorithm as emailAuth.ts ──────────────────────────

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
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

async function deleteTestUser(id: string) {
  await db.delete(users).where(eq(users.id, id)).catch(() => {});
}

// ── Minimal Express app for email-login route tests ───────────────────────────
// setupEmailAuth registers POST /api/auth/login (and other routes) on the app.
// The suspended-user 403 is returned *before* any session/passport call, so we
// don't need session middleware to test that branch.

function buildApp() {
  const app = express();
  app.use(express.json());
  setupEmailAuth(app);
  return app;
}

function startServer(app: express.Express): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

function post(
  server: http.Server,
  path: string,
  body: object
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Suite 1: email login blocked for suspended user ──────────────────────────

describe("email login — suspended account", () => {
  let userId: string;
  let userEmail: string;
  let server: http.Server;

  before(async () => {
    userId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Policy violation — test",
    });
    userEmail = (await getUserRow(userId)).email;
    server = await startServer(buildApp());
  });

  after(async () => {
    await stopServer(server);
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
      `Expected message to mention suspension, got: ${JSON.stringify(data)}`
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

  it("wrong password still returns 401, not 403 (no short-circuit on suspension)", async () => {
    const { status } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: "CompletelyWrongPassword!",
    });
    assert.equal(
      status,
      401,
      `Expected 401 for wrong password (password check runs before suspension check), got ${status}`
    );
  });
});

// ── Suite 2: isAuthenticated middleware blocks active sessions after suspension

describe("isAuthenticated middleware — active session blocked post-suspension", () => {
  let userId: string;

  before(async () => {
    userId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Fraud — test",
    });
  });

  after(async () => {
    await deleteTestUser(userId);
  });

  it("returns 403 for an authenticated request from a suspended user", async () => {
    let capturedStatus: number | undefined;
    let capturedBody: any;
    let nextCalled = false;
    let logoutCalled = false;

    const req: any = {
      isAuthenticated: () => true,
      // email-auth sessions carry claims.sub (same shape as Replit OIDC sessions)
      user: { claims: { sub: userId } },
      logout: (_cb: () => void) => {
        logoutCalled = true;
        _cb();
      },
    };
    const res: any = {
      status(code: number) { capturedStatus = code; return this; },
      json(body: any) { capturedBody = body; return this; },
    };
    const next = () => { nextCalled = true; };

    await (isAuthenticated as any)(req, res, next);

    assert.equal(capturedStatus, 403, "Expected 403 status for suspended user");
    assert.ok(
      typeof capturedBody?.message === "string" &&
        capturedBody.message.toLowerCase().includes("suspended"),
      `Expected suspended message, got: ${JSON.stringify(capturedBody)}`
    );
    assert.ok(logoutCalled, "req.logout() must be called to terminate the session");
    assert.equal(nextCalled, false, "next() must not be called for a suspended user");
  });

  it("response includes the stored suspension reason", async () => {
    let capturedBody: any;

    const req: any = {
      isAuthenticated: () => true,
      user: { claims: { sub: userId } },
      logout: (cb: () => void) => { cb(); },
    };
    const res: any = {
      status(_: number) { return this; },
      json(body: any) { capturedBody = body; return this; },
    };

    await (isAuthenticated as any)(req, res, () => {});

    assert.equal(
      capturedBody?.reason,
      "Fraud — test",
      `Expected suspension reason in middleware response, got: ${JSON.stringify(capturedBody)}`
    );
  });
});

// ── Suite 3: reactivation (unsuspend) restores access ────────────────────────

describe("account reactivation — access restored after unsuspend", () => {
  let userId: string;
  let userEmail: string;
  let server: http.Server;

  before(async () => {
    // Create the user initially suspended, then unsuspend (simulates admin unsuspend)
    userId = await createTestUser({
      isSuspended: true,
      suspendedAt: new Date(),
      suspensionReason: "Temporary test block",
    });
    userEmail = (await getUserRow(userId)).email;

    // Unsuspend — same fields that admin PATCH /api/admin/users/:id/unsuspend writes
    await db
      .update(users)
      .set({ isSuspended: false, suspendedAt: null, suspensionReason: null } as any)
      .where(eq(users.id, userId));

    server = await startServer(buildApp());
  });

  after(async () => {
    await stopServer(server);
    await deleteTestUser(userId);
  });

  it("isAuthenticated calls next() (does not return 403) after the account is unsuspended", async () => {
    let nextCalled = false;
    let capturedStatus: number | undefined;

    const req: any = {
      isAuthenticated: () => true,
      user: { claims: { sub: userId } },
      logout: (cb: () => void) => { cb(); },
    };
    const res: any = {
      status(code: number) { capturedStatus = code; return this; },
      json() { return this; },
    };
    const next = () => { nextCalled = true; };

    await (isAuthenticated as any)(req, res, next);

    assert.equal(
      capturedStatus,
      undefined,
      `Middleware should not set an error status after unsuspend; got: ${capturedStatus}`
    );
    assert.equal(nextCalled, true, "next() must be called for a reactivated user");
  });

  it("email login is no longer blocked by suspension after reactivation", async () => {
    // After unsuspend the login route passes the suspension check.
    // In this minimal test app (no session middleware), the request proceeds
    // past the suspension gate and fails later when session.regenerate is
    // unavailable — producing a 500, not a 403.  A 403 here would mean the
    // suspension check is still firing incorrectly.
    const { status } = await post(server, "/api/auth/login", {
      email: userEmail,
      password: TEST_PASSWORD,
    });
    assert.notEqual(
      status,
      403,
      "Reactivated user must not receive a 403 (suspension gate must not fire)"
    );
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────

after(async () => {
  await pool.end().catch(() => {});
});
