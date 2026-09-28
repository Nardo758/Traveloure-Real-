/**
 * NO PAYMENT, NO EARNINGS (ledger `2026-09-28-no-payment-no-earnings`) — one failing-on-main proof per
 * part of the lane. Every assertion is a DB fact or an HTTP answer from the real route.
 *
 *   NP1 (part 1) the earnings step refuses a `confirmed` booking with no payment on record: the status
 *       writer refuses the flip, nothing is minted, and the mint refuses on its own (the
 *       reconciliation caller). A stamped twin completes.
 *   NP2 (part 2) the earnings-by-source SQL predicate counts only the stamped row.
 *   NP3 (part 3) dispute open and admin dispute-reject refuse an unpaid row with `no_payment_on_record`.
 *   NP4 (part 4, narrowed by the decision-maker Sep 28, 2026) the "provider hasn't responded" notice
 *       is NOT gated on payment: an unpaid `pending` request (a real request awaiting acceptance) is
 *       told once, and a second pass sends nothing — the notification dedupe key is the cap.
 *   NP5 (part 5) the drift job's no-PaymentIntent rule scans every row, not a 24h window: of seven
 *       seeded legacy rows (five `pending`, two `confirmed`, none with a PaymentIntent, all created
 *       months before the window), it flags exactly the two `confirmed` ones.
 *   NP6 the paid flip stamps, and the funnel revenue row is derived from the stamp.
 *
 * Legacy rows are inert BY PREDICATE, not by mutation: no test here expects a status to change.
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
const { inArray, sql, and, eq } = await import("drizzle-orm");
const { users, serviceBookings } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { storage } = await import("../storage");
const adminRoutes = (await import("../routes/admin.routes")).default;
const bookingsRoutes = (await import("../routes/bookings")).default;
const { paymentOnRecordSql } = await import("../services/payment-on-record");
const { runEarnerNoResponseNotices } = await import("../services/earner-no-response.service");
const { runStripeReconciliation } = await import("../jobs/stripeReconciliation");

if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("[no-payment-no-earnings] refusing to write fixtures to a non-disposable database");
  }
}

const TEST_PASSWORD = "NoPayNoEarn1!";
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, dk) => (err ? reject(err) : resolve(`${salt}:${dk.toString("hex")}`)));
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
  app.use("/api/bookings", bookingsRoutes);
  app.use(adminRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return server;
}

function httpRequest(srv: http.Server, method: string, path: string, opts: { body?: object; cookie?: string } = {}) {
  return new Promise<{ status: number; data: any; setCookie?: string }>((resolve, reject) => {
    const addr = srv.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": bodyStr ? Buffer.byteLength(bodyStr) : 0,
    };
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"]?.find((c) => c.startsWith("connect.sid"))?.split(";")[0];
        let data: any = raw;
        try { data = JSON.parse(raw); } catch { /* raw */ }
        resolve({ status: res.statusCode ?? 0, data, setCookie });
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
  return res.setCookie!;
}

const RUN = crypto.randomUUID().slice(0, 8);
const travelerId = crypto.randomUUID();
const providerId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const emailOf = (id: string) => `npe-${id.slice(0, 8)}@test.invalid`;
const seeded: string[] = [];
const STAMP = { status: "confirmed", amount: 100, at: "2026-01-01T00:00:00.000Z" };

async function seedBooking(opts: {
  status: string;
  pi?: string | null;
  stamped?: boolean;
  createdAt?: string;
  confirmedAt?: string | null;
}): Promise<string> {
  const id = `npe-${RUN}-${seeded.length}`;
  const details = opts.stamped ? { paidCharge: STAMP } : {};
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, traveler_id, provider_id, total_amount, platform_fee, provider_earnings, status,
       stripe_payment_intent_id, booking_details, created_at, confirmed_at)
    VALUES (${id}, ${travelerId}, ${providerId}, 100, 10, 90, ${opts.status}, ${opts.pi ?? null},
            ${JSON.stringify(details)}::jsonb, ${opts.createdAt ?? new Date().toISOString()}::timestamp,
            ${opts.confirmedAt === undefined ? null : opts.confirmedAt}::timestamp)
  `);
  seeded.push(id);
  return id;
}

const statusOf = async (id: string) =>
  ((await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)).rows[0] as any)?.status;

describe("no payment, no earnings", () => {
  before(async () => {
    const password = await hashPassword(TEST_PASSWORD);
    for (const [id, role] of [
      [travelerId, "user"],
      [providerId, "service_provider"],
      [adminId, "admin"],
    ] as const) {
      await db.insert(users).values({ id, email: emailOf(id), firstName: "Npe", lastName: RUN, role, password } as any);
    }
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.execute(sql`DELETE FROM reconciliation_exceptions WHERE booking_id IN (${sql.join(seeded.map((s) => sql`${s}`), sql`, `)})`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${travelerId}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id IN (${sql.join(seeded.map((s) => sql`${s}`), sql`, `)})`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${sql.join(seeded.map((s) => sql`${s}`), sql`, `)})`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${sql.join(seeded.map((s) => sql`${s}`), sql`, `)})`).catch(() => {});
    await db.delete(serviceBookings).where(inArray(serviceBookings.id, seeded)).catch(() => {});
    await db.delete(users).where(inArray(users.id, [travelerId, providerId, adminId])).catch(() => {});
    await pool.end();
  });

  it("NP1: the earnings step refuses a confirmed booking with no payment on record; a stamped twin completes", async () => {
    const unpaid = await seedBooking({ status: "confirmed", pi: `pi_npe_${RUN}_a` });
    const refused = await storage.updateServiceBookingStatus(unpaid, "completed", undefined, ["confirmed"]);
    assert.equal(refused, undefined, "the writer must refuse the minting flip without a payment on record");
    assert.equal(await statusOf(unpaid), "confirmed", "no status change — legacy rows are inert by predicate");
    const row = await storage.getServiceBooking(unpaid);
    assert.equal(await storage.mintCompletionEarningsForBooking(row!), false, "the mint refuses on its own too");
    const earn = await db.execute(sql`SELECT count(*)::int AS n FROM provider_earnings WHERE source_id = ${unpaid}`);
    assert.equal((earn.rows[0] as any).n, 0, "nothing minted");

    const paid = await seedBooking({ status: "confirmed", pi: `pi_npe_${RUN}_b`, stamped: true });
    const done = await storage.updateServiceBookingStatus(paid, "completed", undefined, ["confirmed"]);
    assert.equal(done?.status, "completed", "a stamped booking completes as before");
  });

  it("NP2: the earnings-by-source predicate counts only the stamped row", async () => {
    const a = await seedBooking({ status: "confirmed", pi: `pi_npe_${RUN}_c` });
    const b = await seedBooking({ status: "confirmed", pi: `pi_npe_${RUN}_d`, stamped: true });
    const rows = await db
      .select({ id: serviceBookings.id })
      .from(serviceBookings)
      .where(and(inArray(serviceBookings.id, [a, b]), paymentOnRecordSql(serviceBookings.bookingDetails)));
    assert.deepEqual(rows.map((r) => r.id), [b]);
  });

  it("NP3: dispute open and admin dispute-reject refuse a row with no payment on record", async () => {
    const srv = await getServer();
    const confirmed = await seedBooking({ status: "confirmed", pi: null });
    const traveler = await loginCookie(srv, emailOf(travelerId));
    const d = await httpRequest(srv, "POST", `/api/bookings/${confirmed}/dispute`, { body: { reason: "x" }, cookie: traveler });
    assert.equal(d.status, 409, JSON.stringify(d.data));
    assert.equal(d.data.error, "no_payment_on_record");
    assert.equal(await statusOf(confirmed), "confirmed");

    const disputed = await seedBooking({ status: "disputed", pi: null });
    const admin = await loginCookie(srv, emailOf(adminId));
    const r = await httpRequest(srv, "POST", `/api/admin/disputes/${disputed}/reject`, { body: {}, cookie: admin });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.error, "no_payment_on_record");
    assert.equal(await statusOf(disputed), "disputed", "not re-completed, nothing minted");
  });

  it("NP4: an unpaid pending request still gets the no-response notice, exactly once", async () => {
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const pending = await seedBooking({ status: "pending", pi: null, createdAt: old });
    await runEarnerNoResponseNotices();
    await runEarnerNoResponseNotices();
    const n = await db.execute(
      sql`SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = ${`booking:${pending}:earner_no_response`}`,
    );
    assert.equal((n.rows[0] as any).n, 1, "the notice keys on status, not payment, and is sent once");
  });

  it("NP5: the no-PaymentIntent rule scans every row — exactly the two confirmed legacy rows are flagged", async () => {
    const legacy: string[] = [];
    const dates = ["2026-01-08", "2026-01-20", "2026-02-02", "2026-02-15", "2026-03-01", "2026-03-18", "2026-04-04"];
    for (let i = 0; i < 7; i++) {
      const status = i < 5 ? "pending" : "confirmed";
      legacy.push(
        await seedBooking({ status, pi: null, createdAt: `${dates[i]}T12:00:00Z`, confirmedAt: status === "confirmed" ? `${dates[i]}T13:00:00Z` : null }),
      );
    }
    const result: any = await runStripeReconciliation({
      triggeredBy: "test",
      stripeReader: {
        listPaymentIntents: async () => [],
        listCharges: async () => [],
        listRefunds: async () => [],
        listSubscriptions: async () => [],
      } as any,
      onlyBookingIds: legacy,
      onlyPurchaseIds: [],
    });
    assert.ok(result, "the pass ran");
    const flagged = await db.execute(sql`
      SELECT booking_id FROM reconciliation_exceptions
      WHERE kind = 'booking_confirmed_no_pi'
        AND booking_id IN (${sql.join(legacy.map((s) => sql`${s}`), sql`, `)})
      ORDER BY booking_id
    `);
    assert.deepEqual(
      (flagged.rows as any[]).map((r) => r.booking_id),
      [legacy[5], legacy[6]],
      "exactly the two confirmed rows, though both were born months before the scan window",
    );
    for (const id of legacy) {
      const s = await statusOf(id);
      assert.ok(s === "pending" || s === "confirmed", "detect only — no status changed");
    }
  });

  it("NP6: the paid flip stamps the row, and the revenue event is derived from that stamp", async () => {
    const { promotePaidCheckout } = await import("../services/checkout-claim.service");
    const pi = `pi_npe_${RUN}_promo`;
    const id = await seedBooking({ status: "payment_pending", pi });
    const out: any = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook" } as any);
    assert.ok(out, "promotion ran");
    const row = await storage.getServiceBooking(id);
    assert.equal(row?.status, "confirmed");
    const stamp = (row?.bookingDetails as any)?.paidCharge;
    assert.equal(stamp?.status, "confirmed", "the flip wrote the stamp in its own transaction");
    const ev = await db.execute(sql`
      SELECT properties FROM funnel_events
      WHERE event_type = 'revenue' AND properties->>'bookingId' = ${id}
    `);
    assert.equal(ev.rows.length, 1, "one revenue event per paid transition");
    const props = (ev.rows[0] as any).properties;
    assert.equal(props.paidStatus, stamp.status);
    assert.equal(props.amount ?? null, stamp.amount ?? null, "the event's amount IS the stamp's amount");
    await db.execute(sql`DELETE FROM funnel_events WHERE properties->>'bookingId' = ${id}`);
  });
});
