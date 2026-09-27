/**
 * admin-kind-reflects-refunds.db.test.ts — R151 (ledger `2026-09-27-admin-kind-reflects-refunds`).
 *
 * The admin ready-made APPROVE snapshots `insideCounts.byKind` — how much of a plan is already
 * bought, bookable, partner-fulfilled or a recommendation — and the public store card renders it.
 * The count was derived from the item's RAW `booking_id`, and the refund path deliberately KEEPS
 * that column as history (`revertPurchasedItemsForBooking`), so a REFUNDED or CANCELLED item read
 * `included` — "already bought" — on the snapshot a buyer is shown.
 *
 *   K1  (HTTP, the real admin approve rail) a plan with one item whose booking is REFUNDED and one
 *       whose booking is CANCELLED snapshots NEITHER as `included`; a CONFIRMED booking still is.
 *       FAILS on the pre-R151 route: byKind = { included: 3 }.
 *   K2  (pure) the ONE input rule reads the ONE shared closed list — every `CLOSED_BOOKING_STATUSES`
 *       entry withholds rule 1, every other status (and an absent one) leaves `itemKind` unchanged.
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test --test-force-exit server/__tests__/admin-kind-reflects-refunds.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.RESEND_API_KEY ??= "re_test_dummy";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, trips, itineraryItems, serviceBookings, readyMadeTrips } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { CLOSED_BOOKING_STATUSES } = await import("../../shared/booking-visibility");
const { itemKind } = await import("../../shared/item-kind");
const adminRoutes = (await import("../routes/admin.routes")).default;

// ── Disposable-DB guard (house pattern; never defaults open) ──────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[admin-kind-reflects-refunds] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

// ── Password + HTTP harness (mirrors expert-note-separation.db.test.ts) ────────

const TEST_PASSWORD = "AdmKind1Test!";

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, dk) => {
      if (err) return reject(err);
      resolve(`${salt}:${dk.toString("hex")}`);
    });
  });
}

let server: http.Server | null = null;

async function getServer(): Promise<http.Server> {
  if (server) return server;
  const app = express();
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
  setupEmailAuth(app);
  // Production mount shape (server/routes.ts): app.use(adminRoutes) — full /api/admin paths.
  app.use(adminRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return server;
}

interface HttpResult {
  status: number;
  data: any;
  setCookie?: string;
}

function httpRequest(
  srv: http.Server,
  method: string,
  path: string,
  opts: { body?: object; cookie?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const addr = srv.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": bodyStr ? Buffer.byteLength(bodyStr) : 0,
    };
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => {
        raw += c;
      });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"]?.find((c) => c.startsWith("connect.sid"))?.split(";")[0];
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw), setCookie });
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

async function loginCookie(srv: http.Server, email: string): Promise<string> {
  const res = await httpRequest(srv, "POST", "/api/auth/login", { body: { email, password: TEST_PASSWORD } });
  assert.equal(res.status, 200, `login must succeed for ${email}`);
  assert.ok(res.setCookie, "login must set a session cookie");
  return res.setCookie!;
}

const RUN = crypto.randomUUID().slice(0, 8);
const adminId = crypto.randomUUID();
const authorId = crypto.randomUUID();
const emailOf = (id: string) => `adm-kind-${id.slice(0, 8)}@test.invalid`;
let tripId = "";
let listingId = "";
const bookingIds: Record<string, string> = {};

describe("R151 — the admin item-kind label treats a CLOSED (cancelled/refunded) booking as not booked", () => {
  before(async () => {
    await assertDisposableDb();
    const password = await hashPassword(TEST_PASSWORD);
    for (const [id, role, first] of [
      [adminId, "admin", "Admin"],
      [authorId, "local_expert", "Author"],
    ] as const) {
      await db.insert(users).values({ id, email: emailOf(id), firstName: first, lastName: `Kind${RUN}`, role, password } as any);
    }
    const [trip] = await db
      .insert(trips)
      .values({ userId: authorId, title: `Kind ${RUN}`, destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-01", status: "planning" } as any)
      .returning();
    tripId = trip.id;
    for (const status of ["refunded", "cancelled", "confirmed"]) {
      const [b] = await db.insert(serviceBookings).values({ travelerId: authorId, status, totalAmount: "50.00" } as any).returning();
      bookingIds[status] = b.id;
      await db.insert(itineraryItems).values({
        tripId,
        title: `Item booked then ${status}`,
        itemType: "activity",
        dayNumber: 1,
        bookingId: b.id,
      } as any);
    }
    const [listing] = await db
      .insert(readyMadeTrips)
      .values({
        authorId,
        sourceTripId: tripId,
        market: "Kyoto",
        title: `Kyoto in a day ${RUN}`,
        planType: "custom",
        heroImageUrl: "https://images.unsplash.com/photo-test",
        heroImageMeta: { photographer: "Test Photographer" },
        priceCents: 1500,
        durationDays: 1,
        status: "submitted",
      } as any)
      .returning();
    listingId = listing.id;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.execute(sql`DELETE FROM access_audit_logs WHERE resource_id = ${listingId}`).catch(() => {});
    await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, listingId)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    await db.delete(serviceBookings).where(inArray(serviceBookings.id, Object.values(bookingIds)));
    await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    await db.delete(users).where(inArray(users.id, [adminId, authorId])).catch(() => {});
    await pool.end();
  });

  it("K1: the approve snapshot never counts a refunded or cancelled item as included", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(adminId));
    const res = await httpRequest(srv, "POST", `/api/admin/ready-made/${listingId}/approve`, { body: {}, cookie });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const byKind = res.data.listing.insideCounts.byKind;
    assert.equal(byKind.included, 1, `only the CONFIRMED booking is bought — got ${JSON.stringify(byKind)}`);
    assert.equal(byKind.recommended, 2, "the refunded and the cancelled items name nothing else, so rule 4");
  });

  it("K2: the input rule reads the ONE shared booking vocabulary (R154) and nothing else", async () => {
    const { itemKindForLinkedBooking } = await import("../services/item-kind-counts.service");
    for (const status of CLOSED_BOOKING_STATUSES) {
      assert.equal(itemKindForLinkedBooking({ bookingId: "b", bookingStatus: status }), "recommended", status);
      assert.equal(
        itemKindForLinkedBooking({ bookingId: "b", bookingStatus: status, providerServiceId: "s" }),
        "bookable_separately",
        `${status}: a closed booking falls through to the listing it names`,
      );
    }
    // R154: a payment in flight, failed or expired is not a booking the item holds either.
    for (const status of ["payment_pending", "failed", "expired"]) {
      assert.equal(itemKindForLinkedBooking({ bookingId: "b", bookingStatus: status }), "recommended", status);
    }
    for (const status of ["confirmed", "completed", "deposit_paid", "disputed", null, undefined]) {
      assert.equal(
        itemKindForLinkedBooking({ bookingId: "b", bookingStatus: status as any }),
        itemKind({ bookingId: "b" }),
        `${String(status)}: unchanged from the one derivation`,
      );
    }
  });
});
