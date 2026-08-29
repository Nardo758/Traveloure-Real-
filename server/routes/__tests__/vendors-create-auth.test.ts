/**
 * vendors-create-auth.test.ts
 *
 * CLAUDE.md §2/§19 endpoint-auth gap: `POST /api/vendors` (server/routes.ts) was gated by
 * `isAuthenticated` ONLY — no role check — while `vendors` is a fully public directory
 * (`GET /api/vendors` is unauthenticated, rows default `status: "active"` and are
 * immediately world-visible). Any signed-in traveler could POST a live vendor row directly.
 *
 * The fix role-scopes the route to planners: `isAuthenticated, isEarner` — matching the sole
 * client caller's UI gate (`client/src/pages/vendors.tsx` PLANNER_ROLES = admin + earner-family)
 * — NOT `requireAdmin`, which would break the legitimate expert/provider add-vendor flow.
 * `isEarner` (server/middleware/role-rbac.ts) allows `role === "admin" || isEarnerRole(role)`
 * (shared/roles.ts), read from a DB lookup on the SESSION-derived userId — never `req.body`.
 *
 * Approach — route-level HTTP test (no live DB, no live server registration):
 *   - The real `isEarner` middleware is mounted, unmodified, ahead of a minimal stand-in
 *     handler that mirrors the real POST /api/vendors body (parse with the real
 *     `insertVendorSchema`, call `storage.createVendor`) — the monolith's full
 *     `registerRoutes()` cannot be booted here: it attempts a real DB/session-store
 *     connection at startup and hangs indefinitely with no reachable Postgres (verified:
 *     a bare `registerRoutes(httpServer, express())` boot attempt was killed after 60s).
 *   - `db.select` is patched on the shared `db` singleton to return a controlled role row,
 *     keyed only by the injected session userId — `req.body` is never consulted for role.
 *   - The server listens on a random port; tests use the built-in `fetch`.
 *
 * A static assertion (`server/routes.ts` source) separately proves `isEarner` is actually
 * wired into the real route, not just that the middleware works in isolation.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/vendors-create-auth.test.ts
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret";
}

const { db } = await import("../../db.js");
const { isEarner } = await import("../../middleware/role-rbac.js");
const { insertVendorSchema } = await import("@shared/schema");
const { storage } = await import("../../storage.js");

// ── db.select(...).from(...).where(...) chain used by isEarner's role lookup ──────────────
function makeMockSelect(rowsByUserId: Record<string, { role: string }>): () => any {
  return () => {
    const chain: any = {
      from: () => chain,
      where: (cond: any) => {
        // drizzle `eq(users.id, userId)` compiles to a SQL chunk list whose bound Param
        // carries the compared value — pull it out rather than re-deriving it, so the mock
        // stays a faithful stand-in for "whichever userId isEarner actually queried for".
        const param = (cond?.queryChunks ?? []).find((c: any) => c && "value" in c && "encoder" in c);
        const rhs = param?.value;
        const row = rhs ? rowsByUserId[rhs] : undefined;
        return Promise.resolve(row ? [row] : []);
      },
    };
    return chain;
  };
}

// ── Express app factory — mirrors the real route's middleware chain ───────────────────────
function buildApp(userId: string): express.Express {
  const app = express();
  app.use(express.json());

  // Stand in for Passport's isAuthenticated() — real session machinery isn't under test here.
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });

  let createVendorCalled = false;
  (buildApp as any)._lastCreateVendorCalled = () => createVendorCalled;

  // Real middleware, then a stand-in for the route body (same shape as
  // server/routes.ts's POST /api/vendors handler: parse with the real insertVendorSchema,
  // call storage.createVendor). Reconstructed here only because the handler is an inline
  // closure in the monolith with no exported factory — the middleware chain (the actual
  // fix under test) is the real, unmodified export.
  app.post("/api/vendors", isEarner, async (req, res) => {
    try {
      const input = insertVendorSchema.parse(req.body);
      createVendorCalled = true;
      const vendor = await (storage as any).createVendor(input);
      res.status(201).json(vendor);
    } catch (err) {
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  return app;
}

let server: http.Server;
let baseUrl: string;
let createVendorCalls: any[] = [];

beforeEach(() => {
  createVendorCalls = [];
  (storage as any).createVendor = async (input: any) => {
    createVendorCalls.push(input);
    return { id: "vendor-1", ...input };
  };
});

afterEach(() => {
  if (server?.listening) server.close();
});

async function startServer(userId: string): Promise<(body: object) => Promise<Response>> {
  const app = buildApp(userId);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  return (body: object) =>
    fetch(`${baseUrl}/api/vendors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
}

const VALID_VENDOR = { name: "Kyoto Tea House", category: "food_and_drink" };

describe("POST /api/vendors — role gate (CLAUDE.md §2/§19)", () => {
  it("(a) authenticated traveler (role 'user') → 403, storage.createVendor NOT called", async () => {
    (db as any).select = makeMockSelect({ "traveler-1": { role: "user" } });
    const post = await startServer("traveler-1");

    const res = await post(VALID_VENDOR);

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.ok(typeof body.message === "string" && body.message.length > 0);
    assert.deepEqual(createVendorCalls, [], "createVendor must not run for a denied role");
  });

  it("(a) a body-supplied role does not override the session role (§14 posture)", async () => {
    // Session says 'user'; the request body claims 'admin'. The gate must read the DB row
    // keyed on the session userId only — req.body must never reach the role decision.
    (db as any).select = makeMockSelect({ "traveler-1": { role: "user" } });
    const post = await startServer("traveler-1");

    const res = await post({ ...VALID_VENDOR, role: "admin" });

    assert.equal(res.status, 403, "a client-supplied body role must be ignored");
    assert.deepEqual(createVendorCalls, []);
  });

  for (const role of ["expert", "local_expert", "travel_expert", "event_planner", "service_provider"]) {
    it(`(b) authenticated ${role} → passes the gate, storage.createVendor IS called`, async () => {
      (db as any).select = makeMockSelect({ "earner-1": { role } });
      const post = await startServer("earner-1");

      const res = await post(VALID_VENDOR);

      assert.equal(res.status, 201, `expected 201 for role=${role}, got ${res.status}`);
      assert.equal(createVendorCalls.length, 1);
      assert.equal(createVendorCalls[0].name, VALID_VENDOR.name);
    });
  }

  it("(c) admin → passes the gate, storage.createVendor IS called", async () => {
    (db as any).select = makeMockSelect({ "admin-1": { role: "admin" } });
    const post = await startServer("admin-1");

    const res = await post(VALID_VENDOR);

    assert.equal(res.status, 201);
    assert.equal(createVendorCalls.length, 1);
  });

  it("unauthenticated request never reaches the role lookup or the handler", async () => {
    const app = express();
    app.use(express.json());
    // No fake-session middleware here — isEarner's own 401 branch must fire first.
    app.post("/api/vendors", isEarner, async (_req, res) => {
      res.status(201).json({ unreachable: true });
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/vendors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_VENDOR),
    });
    assert.equal(res.status, 401);
  });
});

describe("POST /api/vendors — route wiring (static source check)", () => {
  it("server/routes.ts actually applies isEarner to POST /api/vendors", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "server/routes.ts"),
      "utf8",
    );
    assert.match(
      source,
      /app\.post\(\s*"\/api\/vendors"\s*,\s*isAuthenticated\s*,\s*isEarner\s*,/,
      "POST /api/vendors must be wired as app.post(\"/api/vendors\", isAuthenticated, isEarner, ...) — " +
        "a passing isEarner unit test alone would not prove the fix is actually applied to this route.",
    );
  });
});
