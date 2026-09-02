/**
 * DB-ROLE AUTHORIZATION GATE — audit findings 8 and 14.
 *
 * The class: an authorization decision made from the role string carried on the SESSION.
 * That string is wrong in both directions —
 *   - STALE: the login paths stamp `claims.role` once and the session lives 7 days, so a
 *     demoted admin kept the admin tier (finding 8: `GET /api/bookings/:id` returned the
 *     full row, `stripePaymentIntentId` included, and drove sanitizeBookingForExpert).
 *   - ABSENT: the Replit OIDC session shape has no `role` anywhere, so a
 *     `req.user?.role !== 'admin'` check 403'd real admins (finding 14: the Fever cache
 *     refresh routes).
 * The fix is `getDbRole`/`requireDbAdmin` (server/utils/auth.ts) — CLAUDE.md §2's ratified
 * default-deny posture: role read from the DB on every request, least privilege when the
 * user or the role is missing.
 *
 * Transport: the REAL handlers (the `/api/bookings` router and the real `requireDbAdmin`
 * middleware) mounted on a bare express app; `../storage` and `../db` are mocked so the
 * suite needs no database.
 *
 *   R1 — session claim says admin, DB says traveler ⇒ NO admin tier on GET /api/bookings/:id
 *        (no stripePaymentIntentId in the body) and the row is sanitized as a non-admin.
 *   R2 — DB admin on an OIDC-shaped session (no role claim at all) ⇒ passes the fever-refresh
 *        admin gate (no 403).
 *   R3 — non-admin on the fever-refresh gate ⇒ 403.
 *   R4 — no user row for the session id ⇒ least privilege on both surfaces.
 *
 * Run: npx vitest run --root . server/__tests__/db-role-authorization.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

// ── The "users" table this suite's DB lookups answer from ────────────────────────────
const userRows = new Map<string, { id: string; role: string | null }>();
// The single booking row the mocked drizzle query returns.
let bookingRow: Record<string, any> | null = null;

vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => userRows.get(id),
  },
}));

vi.mock("../db", () => {
  // Minimal chainable stand-in for `db.select().from(t).where(c).limit(n)`.
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => (bookingRow ? [bookingRow] : []),
  };
  return { db: chain, pool: { query: async () => ({ rows: [] }) } };
});

// Auth middleware: the session is planted by the test app itself.
vi.mock("../replit_integrations/auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) =>
    req.user ? next() : res.status(401).json({ message: "Unauthorized" }),
  setupAuth: async () => {},
}));

// Heavy service dependencies of the bookings router — never reached by GET /:id.
vi.mock("../services/booking.service", () => ({ bookingService: {} }));
vi.mock("../services/stripe-payment.service", () => ({ stripePaymentService: {} }));
vi.mock("../services/availability.service", () => ({ availabilityService: {} }));
vi.mock("../services/pricing.service", () => ({ pricingService: {} }));
vi.mock("../services/item-routing.service", () => ({
  revertPurchasedItemsForBooking: async () => {},
}));

const bookingsRouter = (await import("../routes/bookings")).default;
const { requireDbAdmin, getDbRole } = await import("../utils/auth");

const TRAVELER = "user-traveler";
const PROVIDER = "user-provider";
const ADMIN = "user-admin";
const GHOST = "user-with-no-row";

const STRIPE_PI = "pi_secret_marker_should_never_leak";

function makeBooking() {
  return {
    id: "bk-1",
    travelerId: TRAVELER,
    providerId: PROVIDER,
    totalAmount: "100.00",
    status: "confirmed",
    stripePaymentIntentId: STRIPE_PI,
    idempotencyKey: "idem_marker_should_never_leak",
  };
}

/**
 * Builds the app under test. `session` is planted verbatim as req.user, so each test can
 * use the real shape of the auth flow it is exercising (email-auth `{claims:{sub,role}}`
 * vs Replit OIDC `{claims:{sub}}` with no role anywhere).
 */
function appWith(session: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = session;
    req.isAuthenticated = () => !!session;
    next();
  });
  app.use("/api/bookings", bookingsRouter);
  // The real middleware the Fever cache-refresh routes now carry (see the source-wiring
  // assertions at the bottom of this file).
  app.post("/api/fever/cache/refresh/:cityCode", requireDbAdmin, (_req, res) =>
    res.json({ refreshed: 1 })
  );
  return app;
}

async function request(app: express.Express, method: "get" | "post", url: string) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method: method.toUpperCase() });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, raw: text };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  userRows.clear();
  userRows.set(TRAVELER, { id: TRAVELER, role: "traveler" });
  userRows.set(PROVIDER, { id: PROVIDER, role: "service_provider" });
  userRows.set(ADMIN, { id: ADMIN, role: "admin" });
  bookingRow = makeBooking();
});

// ── R1 ────────────────────────────────────────────────────────────────────────────────
describe("R1 — a stale admin claim never grants the admin tier", () => {
  it("session claims admin, DB says traveler: GET /api/bookings/:id is 403 with no Stripe ref", async () => {
    // A demoted admin: the 7-day session still carries claims.role='admin'.
    const app = appWith({ claims: { sub: GHOST, role: "admin" } });
    userRows.set(GHOST, { id: GHOST, role: "traveler" });

    const res = await request(app, "get", "/api/bookings/bk-1");

    // Not the traveler, not the provider, and NOT an admin per the DB ⇒ the least tier.
    expect(res.status).toBe(403);
    expect(res.raw).not.toContain(STRIPE_PI);
  });

  it("the earning provider with a stale admin claim is sanitized as a provider", async () => {
    const app = appWith({ claims: { sub: PROVIDER, role: "admin" } });

    const res = await request(app, "get", "/api/bookings/bk-1");

    expect(res.status).toBe(200);
    // The stale claim used to select sanitizeBookingForExpert's canSeeFull branch.
    expect(res.body).not.toHaveProperty("stripePaymentIntentId");
    expect(res.body).not.toHaveProperty("idempotencyKey");
    expect(res.raw).not.toContain(STRIPE_PI);
    expect(res.body.id).toBe("bk-1");
  });

  it("a real DB admin still gets the full row (the gate did not over-strip)", async () => {
    const app = appWith({ claims: { sub: ADMIN } }); // no role claim at all — OIDC shape
    const res = await request(app, "get", "/api/bookings/bk-1");

    expect(res.status).toBe(200);
    expect(res.body.stripePaymentIntentId).toBe(STRIPE_PI);
  });

  it("the traveler owner still gets their own full row", async () => {
    const app = appWith({ claims: { sub: TRAVELER } });
    const res = await request(app, "get", "/api/bookings/bk-1");

    expect(res.status).toBe(200);
    expect(res.body.stripePaymentIntentId).toBe(STRIPE_PI);
  });
});

// ── R2 / R3 ───────────────────────────────────────────────────────────────────────────
describe("R2/R3 — the fever-refresh admin gate reads the DB, not the session", () => {
  it("R2: a DB admin on an OIDC session (no role claim anywhere) is NOT 403'd", async () => {
    const app = appWith({ claims: { sub: ADMIN } });
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ refreshed: 1 });
  });

  it("R2b: the same admin identity in the Replit `{id}` session shape also passes", async () => {
    const app = appWith({ id: ADMIN });
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");
    expect(res.status).toBe(200);
  });

  it("R3: a non-admin gets 403 even with an admin role claim on the session", async () => {
    const app = appWith({ claims: { sub: TRAVELER, role: "admin" } });
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");

    expect(res.status).toBe(403);
  });

  it("R3b: an unauthenticated request gets 401", async () => {
    const app = appWith(null);
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");

    expect(res.status).toBe(401);
  });
});

// ── R4 ────────────────────────────────────────────────────────────────────────────────
describe("R4 — a session with no user row falls to least privilege", () => {
  it("getDbRole returns null when the user row is absent", async () => {
    const role = await getDbRole({ user: { claims: { sub: GHOST, role: "admin" } } } as any);
    expect(role).toBeNull();
  });

  it("getDbRole returns null when there is no session at all", async () => {
    expect(await getDbRole({} as any)).toBeNull();
  });

  it("getDbRole returns null (never throws) when the lookup fails", async () => {
    const { storage } = await import("../storage");
    const spy = vi.spyOn(storage, "getUser").mockRejectedValueOnce(new Error("db down"));
    expect(await getDbRole({ user: { claims: { sub: ADMIN } } } as any)).toBeNull();
    spy.mockRestore();
  });

  it("no user row ⇒ no admin tier on the booking route", async () => {
    const app = appWith({ claims: { sub: GHOST, role: "admin" } });
    const res = await request(app, "get", "/api/bookings/bk-1");

    expect(res.status).toBe(403);
    expect(res.raw).not.toContain(STRIPE_PI);
  });

  it("no user row ⇒ 403 on the admin gate", async () => {
    const app = appWith({ claims: { sub: GHOST, role: "admin" } });
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");

    expect(res.status).toBe(403);
  });

  it("a lookup ERROR on the admin gate fails closed with 500, never next()", async () => {
    const { storage } = await import("../storage");
    const spy = vi.spyOn(storage, "getUser").mockRejectedValueOnce(new Error("db down"));
    const app = appWith({ claims: { sub: ADMIN } });
    const res = await request(app, "post", "/api/fever/cache/refresh/PAR");

    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

// ── Source wiring: the real routes carry the real guard ───────────────────────────────
describe("source wiring — the audited call sites use the DB helper", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.resolve(import.meta.dirname, "..", rel), "utf-8");

  it("finding 14: both fever refresh routes are mounted behind requireDbAdmin", () => {
    const src = read("routes/content.routes.ts");
    expect(src).toContain(
      'router.post("/api/fever/cache/refresh/:cityCode", isAuthenticated, requireDbAdmin,'
    );
    expect(src).toContain(
      'router.post("/api/fever/cache/refresh-all", isAuthenticated, requireDbAdmin,'
    );
    // and no longer read the session role there
    const feverSection = src.slice(
      src.indexOf('router.post("/api/fever/cache/refresh/:cityCode"'),
      src.indexOf("travelPulseScheduler.start()")
    );
    expect(feverSection).not.toMatch(/req\.user\s+as\s+any/);
    expect(feverSection).not.toMatch(/role\s*!==\s*'admin'/);
  });

  it("finding 8: the bookings route no longer imports getSessionRole", () => {
    const src = read("routes/bookings.ts");
    expect(src).not.toContain("getSessionRole");
    expect(src).toContain("await getDbRole(req)");
  });

  it("getSessionRole has no remaining server callers", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          files.push(full);
        }
      }
    };
    walk(path.resolve(import.meta.dirname, ".."));
    const callers = files.filter((f) => {
      if (f.endsWith(path.join("utils", "auth.ts")) || f.includes("__tests__")) return false;
      return /getSessionRole\s*\(/.test(fs.readFileSync(f, "utf-8"));
    });
    expect(callers).toEqual([]);
  });
});
