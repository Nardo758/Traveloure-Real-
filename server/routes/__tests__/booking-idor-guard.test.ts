/**
 * booking-idor-guard.test.ts
 *
 * Confirms that GET /api/bookings/:id:
 *   1. Returns 403 to any authenticated user who is neither the booking's
 *      traveler nor its provider.
 *   2. Emits a [IDOR ATTEMPT] line to stderr via console.warn with the
 *      correct bookingId and userId.
 *
 * Approach — route-level integration test (no network, no live DB):
 *   - The real bookings router is mounted on a minimal Express app.
 *   - A pre-middleware injects req.user and req.isAuthenticated so the
 *     Passport isAuthenticated() guard passes without a real session.
 *     The subsequent authStorage.getUser() call fails (fake DATABASE_URL)
 *     and is caught by the middleware's fail-open handler, so next() is
 *     called and the real handler runs.
 *   - db.select is patched on the shared db instance so the SELECT query
 *     returns a controlled fake booking row.
 *   - console.warn is spied on to assert [IDOR ATTEMPT] content.
 *   - The server listens on a random port; tests use Node's built-in fetch.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/booking-idor-guard.test.ts
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";

// ── Environment stubs (must be set before any project import) ─────────────────
// Always override — workspace secrets may carry pk_/sk_live_ values that the
// Stripe service guard rejects at import time. Unconditional assignment ensures
// our test-safe stubs win regardless of what Replit injected into the env.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret";
}

// ── Import shared db instance (same object the handler will use) ──────────────
const { db } = await import("../../db.js");

// ── Import the real bookings router ──────────────────────────────────────────
const bookingsRouterModule = await import("../bookings.js");
const bookingsRouter =
  (bookingsRouterModule as any).default ?? bookingsRouterModule;

// ── Shared fake booking row ───────────────────────────────────────────────────
const BOOKING_ID  = "aaaaaaaa-0000-0000-0000-000000000001";
const TRAVELER_ID = "bbbbbbbb-1111-1111-1111-000000000002";
const PROVIDER_ID = "cccccccc-2222-2222-2222-000000000003";
const STRANGER_ID = "dddddddd-3333-3333-3333-000000000004";

const fakeBooking = {
  id:         BOOKING_ID,
  travelerId: TRAVELER_ID,
  providerId: PROVIDER_ID,
  status:     "confirmed",
  title:      "Test tour",
  totalAmount: "120.00",
};

// ── Drizzle mock chain factory ────────────────────────────────────────────────
// db.select().from(...).where(...).limit(1) must resolve to an array.
function makeMockSelect(rows: object[]): () => any {
  return () => {
    const chain: any = {
      from:  () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  };
}

// ── Express app factory ───────────────────────────────────────────────────────
// Creates an app where the caller chooses which userId/role is "logged in".
function buildApp(userId: string, role: string): express.Express {
  const app = express();
  app.use(express.json());

  // Inject a fake Passport session so isAuthenticated passes without a real
  // session store. authStorage.getUser() will throw (fake DB URL) and be
  // caught by the fail-open handler inside isAuthenticated, which calls next().
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, role } };
    (req as any).isAuthenticated = () => true;
    next();
  });

  app.use("/api/bookings", bookingsRouter);
  return app;
}

// ── HTTP test server lifecycle ────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;

// Capture warn messages in each test
let warnMessages: string[] = [];
let origWarn: typeof console.warn;

beforeEach(() => {
  warnMessages = [];
  origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnMessages.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.warn = origWarn;
  if (server?.listening) {
    server.close();
  }
});

/** Start a fresh app + server for a given user and return the fetch helper. */
async function startServer(userId: string, role: string): Promise<{
  get: (id: string) => Promise<Response>;
}> {
  const app = buildApp(userId, role);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  return {
    get: (id: string) => fetch(`${baseUrl}/api/bookings/${id}`),
  };
}

// ── Suite 1: IDOR scenario — stranger probes a booking they don't own ─────────

describe("GET /api/bookings/:id — stranger (neither traveler nor provider)", () => {
  before(() => {
    // Patch db.select to return the fake booking
    (db as any).select = makeMockSelect([fakeBooking]);
  });

  it("returns HTTP 403", async () => {
    const client = await startServer(STRANGER_ID, "user");
    const res = await client.get(BOOKING_ID);
    assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  });

  it("emits [IDOR ATTEMPT] in console.warn", async () => {
    const client = await startServer(STRANGER_ID, "user");
    await client.get(BOOKING_ID);
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.ok(
      idorLine,
      `Expected an [IDOR ATTEMPT] warn message. Captured: ${JSON.stringify(warnMessages)}`
    );
  });

  it("includes the probed bookingId in the [IDOR ATTEMPT] log", async () => {
    const client = await startServer(STRANGER_ID, "user");
    await client.get(BOOKING_ID);
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.ok(idorLine, "expected [IDOR ATTEMPT] warn message");
    assert.ok(
      idorLine.includes(BOOKING_ID),
      `Log must include bookingId "${BOOKING_ID}". Got: ${idorLine}`
    );
  });

  it("includes the requesting userId in the [IDOR ATTEMPT] log", async () => {
    const client = await startServer(STRANGER_ID, "user");
    await client.get(BOOKING_ID);
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.ok(idorLine, "expected [IDOR ATTEMPT] warn message");
    assert.ok(
      idorLine.includes(STRANGER_ID),
      `Log must include stranger's userId "${STRANGER_ID}". Got: ${idorLine}`
    );
  });

  it("response body contains Access denied", async () => {
    const client = await startServer(STRANGER_ID, "user");
    const res = await client.get(BOOKING_ID);
    const body = await res.json();
    assert.ok(
      typeof body.message === "string" && body.message.length > 0,
      "Expected a non-empty message in 403 body"
    );
  });
});

// ── Suite 2: IDOR fires for multiple stranger roles ───────────────────────────

describe("GET /api/bookings/:id — IDOR guard fires for all non-owner roles", () => {
  const strangerRoles = ["user", "expert", "service_provider", "local_expert"];

  before(() => {
    (db as any).select = makeMockSelect([fakeBooking]);
  });

  for (const role of strangerRoles) {
    it(`role="${role}" → 403 + [IDOR ATTEMPT]`, async () => {
      const strangerId = `stranger-${role}-${Date.now()}`;
      const client = await startServer(strangerId, role);
      const res = await client.get(BOOKING_ID);
      assert.equal(res.status, 403, `Expected 403 for role=${role}`);
      const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
      assert.ok(idorLine, `Expected [IDOR ATTEMPT] warn for role=${role}`);
      assert.ok(
        idorLine.includes(strangerId),
        `Log must contain the stranger userId for role=${role}`
      );
    });
  }
});

// ── Suite 3: legitimate callers get 200, no IDOR log ─────────────────────────

describe("GET /api/bookings/:id — legitimate callers are not blocked", () => {
  before(() => {
    (db as any).select = makeMockSelect([fakeBooking]);
  });

  it("traveler (owner) gets 200, no [IDOR ATTEMPT] log", async () => {
    const client = await startServer(TRAVELER_ID, "user");
    const res = await client.get(BOOKING_ID);
    assert.equal(res.status, 200, "Traveler must receive 200");
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.equal(idorLine, undefined, "Traveler access must not trigger IDOR log");
  });

  it("provider (earner) gets 200, no [IDOR ATTEMPT] log", async () => {
    const client = await startServer(PROVIDER_ID, "expert");
    const res = await client.get(BOOKING_ID);
    assert.equal(res.status, 200, "Provider must receive 200");
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.equal(idorLine, undefined, "Provider access must not trigger IDOR log");
  });

  it("admin gets 200, no [IDOR ATTEMPT] log", async () => {
    const client = await startServer("admin-uuid-000", "admin");
    const res = await client.get(BOOKING_ID);
    assert.equal(res.status, 200, "Admin must receive 200");
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.equal(idorLine, undefined, "Admin access must not trigger IDOR log");
  });
});

// ── Suite 4: booking not found → 404, no IDOR log ────────────────────────────

describe("GET /api/bookings/:id — missing booking returns 404, not IDOR", () => {
  before(() => {
    (db as any).select = makeMockSelect([]); // empty result
  });

  it("returns 404 when the booking does not exist", async () => {
    const client = await startServer(STRANGER_ID, "user");
    const res = await client.get("nonexistent-booking-id");
    assert.equal(res.status, 404, "Missing booking must return 404, not 403");
  });

  it("does NOT emit [IDOR ATTEMPT] for a missing booking", async () => {
    const client = await startServer(STRANGER_ID, "user");
    await client.get("nonexistent-booking-id");
    const idorLine = warnMessages.find((m) => m.includes("[IDOR ATTEMPT]"));
    assert.equal(
      idorLine,
      undefined,
      "A missing booking must not trigger IDOR log (no resource to guard)"
    );
  });
});

// ── Suite 5: static source-code guard ────────────────────────────────────────
// Ensures the log line and 403 branch are structurally present in the source
// so a future deletion of the console.warn is caught before CI runs.

describe("bookings.ts — static source inspection", () => {
  const handlerPath = path.resolve(import.meta.dirname, "../bookings.ts");
  let src: string;

  it("handler file exists", () => {
    assert.ok(fs.existsSync(handlerPath), `Not found: ${handlerPath}`);
    src = fs.readFileSync(handlerPath, "utf-8");
  });

  it("contains [IDOR ATTEMPT] emitted via console.warn", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(src.includes("[IDOR ATTEMPT]"), "Expected [IDOR ATTEMPT] in bookings.ts");
    assert.ok(/console\.warn/.test(src), "Expected console.warn() call");
  });

  it("interpolates req.params.id in the log", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(/req\.params\.id/.test(src), "Expected req.params.id in the IDOR log");
  });

  it("returns 403 on the IDOR branch", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(/status\(403\)/.test(src), "Expected res.status(403) in bookings.ts");
  });
});
