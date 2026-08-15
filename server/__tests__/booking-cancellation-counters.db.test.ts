/**
 * Task #1214 — booking count and earnings figures stay accurate after cancellation.
 *
 * The production refund path (POST /api/bookings/:id/cancel and POST /api/bookings/refund)
 * calls stripePaymentService.refundServiceBooking which sets service_bookings.status via
 * raw SQL — it does NOT go through storage.updateServiceBookingStatus, so the
 * provider_services.bookings_count decrement only happens via the fix in that service.
 * The expert earnings reversal also fires inside refundServiceBooking for full refunds
 * (storage.reverseEarningsForBooking at line ~1002).
 *
 * This test exercises stripePaymentService.refundServiceBooking directly (Stripe client
 * replaced via the _stripeOverride test seam so no real card charge occurs) and asserts
 * both live poll surfaces before and after:
 *
 *   1. GET /api/provider/analytics/dashboard — summary.totalBookings / summary.totalRevenue
 *   2. GET /api/expert/earnings/details      — summary.totalEarnings / summary.pendingEarnings
 *
 * One booking ID is used throughout, matching the production orchestration where the
 * bookings_count decrement and the earnings reversal both reference the same row.
 *
 * SERVER REQUIRED — tests register real sessions over HTTP to assert what the live
 * endpoints return. before() fails loudly when the dev server is not up.
 *
 * DISPOSABLE DB ONLY.  All rows written here are deleted in after().
 *
 * Run solo (requires a sk_test_ Stripe key — the import validates key prefix):
 *   STRIPE_SECRET_KEY="$(node scripts/dev-stripe-key.cjs)" \
 *   JOURNEY_DB_WRITES_OK=1 RATE_LIMIT_LOOPBACK_SKIP=1 \
 *   npx tsx --test server/__tests__/booking-cancellation-counters.db.test.ts
 *
 * In CI (Stripe calls are mocked so a stub key is sufficient):
 *   STRIPE_SECRET_KEY=sk_test_ci_stub_no_real_calls \
 *   JOURNEY_DB_WRITES_OK=1 RATE_LIMIT_LOOPBACK_SKIP=1 \
 *   npx tsx --test server/__tests__/booking-cancellation-counters.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { stripePaymentService } from "../services/stripe-payment.service.js";

// ── Disposable-DB guard ──────────────────────────────────────────────────────────────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ NULL ⇒ disposable signal */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[booking-cancellation-counters] REFUSING to write fixtures: DATABASE_URL host ` +
      `'${host ?? "<none>"}' is not a recognized disposable dev/CI database. ` +
      `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";

// All fixture IDs — populated in before(), consumed by tests and after()
const fixture = {
  providerId:     "",
  expertId:       "",
  travelerId:     `cc-${RUN}-trav`,
  serviceId:      `cc-${RUN}-svc`,
  /** ONE shared booking ID for service_bookings AND expert_earnings.reference_id. */
  bookingId:      `cc-${RUN}-bk`,
  earningId:      `cc-${RUN}-ee`,
  providerCookie: "",
  expertCookie:   "",
};

// ── Minimal Stripe refund mock ───────────────────────────────────────────────────────────────────
//
// The real stripe.refunds.create would charge a card.  We replace it with a mock that returns a
// fake succeeded refund so that refundServiceBooking's post-Stripe logic (bookings_count decrement
// + earnings reversal) is exercised against the real database without touching the live Stripe API.
//
// This is exactly what "Stripe safely stubbed" means in this context: all storage/DB paths are
// real; only the remote Stripe RPC is replaced by a deterministic in-process stub.
const mockStripeRefunds = {
  create: async (_params: unknown, _opts?: unknown) => ({
    id: `rf_test_${RUN}`,
    status: "succeeded",
    amount: 10000,
    currency: "usd",
    payment_intent: `pi_test_${RUN}`,
    object: "refund" as const,
  }),
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────────────────────────

async function apiCall(
  path: string,
  cookie: string | undefined,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function registerUser(tag: string): Promise<{ id: string; cookie: string }> {
  const email = `cc-${RUN}-${tag}@t.test`;
  const res = await apiCall("/api/auth/register", undefined, "POST", {
    email, password: "Sup3rSecret!23", firstName: "CC", lastName: tag,
  });
  const raw = await res.text();
  assert.ok(res.ok, `register(${tag}) must succeed: ${res.status} ${raw}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body: any = JSON.parse(raw);
  return { id: body.user.id, cookie: setCookie.split(";")[0] };
}

// ── Fixture setup ────────────────────────────────────────────────────────────────────────────────

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(
    health && health.ok,
    `Dev server must be running at ${BASE_URL} — start it with 'npm run dev'`,
  );

  await assertDisposableDb();

  // Register real HTTP sessions so the analytics/earnings endpoints can identify the callers.
  const provider = await registerUser("prov");
  const expert   = await registerUser("exp");
  fixture.providerId     = provider.id;
  fixture.expertId       = expert.id;
  fixture.providerCookie = provider.cookie;
  fixture.expertCookie   = expert.cookie;

  // Role vocabulary: "service_provider" (NOT bare "provider") for the analytics prefix gate.
  // Both checks are DB-read (server/routes.ts:697-720 PROVIDER_SELF_SERVICE_PREFIXES).
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${fixture.providerId}`);
  await db.execute(sql`UPDATE users SET role = 'expert'            WHERE id = ${fixture.expertId}`);

  // Traveler row: FK anchor for service_bookings.traveler_id.
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${fixture.travelerId}, ${`cc-${RUN}-trav@t.test`}, 'CC', 'Trav')
    ON CONFLICT (id) DO NOTHING
  `);

  // Provider service — bookings_count will be set to 1 below.
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, status, approval_status,
       bookings_count, total_revenue, price, created_at, updated_at)
    VALUES
      (${fixture.serviceId}, ${fixture.providerId}, 'CC Test Service',
       'active', 'approved', 0, '0.00', '100.00', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Confirmed booking with a fake payment-intent ID.  stripe_payment_intent_id must be
  // non-null for refundServiceBooking to proceed past its "no intent to refund" guard.
  // The real Stripe RPC is replaced by mockStripeRefunds in the test body.
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status,
       total_amount, platform_fee, insurance_fee, provider_earnings,
       stripe_payment_intent_id, booking_details, created_at, updated_at)
    VALUES
      (${fixture.bookingId}, ${fixture.serviceId}, ${fixture.travelerId}, ${fixture.providerId},
       'confirmed', '75.00', '25.00', '0.00', '75.00',
       ${`pi_test_${RUN}`}, '{}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Simulate the bookings_count increment that fires when a booking is first confirmed.
  await db.execute(sql`
    UPDATE provider_services SET bookings_count = 1 WHERE id = ${fixture.serviceId}
  `);

  // Expert earnings in 'held' status linked to the SAME booking ID.
  // referenceType = 'service_booking' matches storage.reverseEarningsForBooking's WHERE clause
  // (storage.ts ~:4828-4831).  refundServiceBooking calls reverseEarningsForBooking internally
  // for full refunds (storage.ts ~:1001-1003), so we do NOT call it separately in the test.
  await db.execute(sql`
    INSERT INTO expert_earnings
      (id, expert_id, type, amount, currency,
       reference_id, reference_type, status, created_at)
    VALUES
      (${fixture.earningId}, ${fixture.expertId}, 'consulting', '80.00', 'USD',
       ${fixture.bookingId}, 'service_booking', 'held', NOW())
    ON CONFLICT DO NOTHING
  `);

  // Install the Stripe mock — no real card charges during this test.
  stripePaymentService._stripeOverride = { refunds: mockStripeRefunds } as any;
});

after(async () => {
  // Remove the Stripe mock so subsequent tests in this process use the live client.
  stripePaymentService._stripeOverride = null;

  await db.execute(sql`DELETE FROM expert_earnings   WHERE id = ${fixture.earningId}`);
  await db.execute(sql`DELETE FROM service_bookings  WHERE id = ${fixture.bookingId}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${fixture.serviceId}`);
  await db.execute(sql`
    DELETE FROM users WHERE id IN (${fixture.providerId}, ${fixture.expertId}, ${fixture.travelerId})
  `);
});

// ── Test sequence ────────────────────────────────────────────────────────────────────────────────
//
// The critical invariant: stripePaymentService.refundServiceBooking (the production paid-refund
// path) must both decrement provider_services.bookings_count (via the fix added to that service)
// AND reverse expert_earnings rows (which it already calls via storage.reverseEarningsForBooking).
// Both effects must be visible on the next poll cycle of the two live dashboard surfaces.

test("1: before refund — provider dashboard totalBookings = 1", async () => {
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.ok(body.summary, "response must include a summary object");
  assert.equal(
    body.summary.totalBookings,
    1,
    `totalBookings must be 1 before refund, got ${body.summary.totalBookings}`,
  );
});

test("2: before refund — expert earnings totalEarnings = 80, pendingEarnings = 80", async () => {
  const res = await apiCall("/api/expert/earnings/details", fixture.expertCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.ok(body.summary, "response must include a summary object");
  assert.equal(
    body.summary.totalEarnings,
    80,
    `totalEarnings must be 80 before reversal, got ${body.summary.totalEarnings}`,
  );
  assert.equal(
    body.summary.pendingEarnings,
    80,
    `pendingEarnings must be 80 before reversal, got ${body.summary.pendingEarnings}`,
  );
});

test("3: refundServiceBooking — Stripe mocked, both bookings_count and earnings reversed for the same bookingId", async () => {
  // This is the exact production paid-refund code path (server/services/stripe-payment.service.ts).
  // It sets status = 'refunded' via raw SQL (bypassing storage.updateServiceBookingStatus), then —
  // after the fix in task #1214 — decrements bookings_count and calls reverseEarningsForBooking,
  // all for the same bookingId.
  const result = await stripePaymentService.refundServiceBooking(
    fixture.bookingId,
    "test_cancellation",
  );

  // Stripe mock must have been called and returned the fake refund.
  assert.ok(result && !("alreadyRefunded" in result) || (result as any).alreadyRefunded === undefined,
    `refundServiceBooking must not return alreadyRefunded on the first call, got: ${JSON.stringify(result)}`);

  // DB: status must be 'refunded'.
  const bk = await db.execute(
    sql`SELECT status, bookings_count_check FROM (
      SELECT sb.status,
             ps.bookings_count AS bookings_count_check
      FROM service_bookings sb
      JOIN provider_services ps ON ps.id = sb.service_id
      WHERE sb.id = ${fixture.bookingId}
    ) t`,
  );
  const row = bk.rows[0] as any;
  assert.equal(row?.status, "refunded", `booking status must be 'refunded' after refundServiceBooking`);
  assert.equal(
    Number(row?.bookings_count_check),
    0,
    `bookings_count must be 0 immediately after refundServiceBooking (fix: raw-SQL refund path now decrements the counter), got ${row?.bookings_count_check}`,
  );

  // DB: earnings must be 'reversed'.
  const ee = await db.execute(
    sql`SELECT status FROM expert_earnings WHERE id = ${fixture.earningId}`,
  );
  assert.equal(
    (ee.rows[0] as any)?.status,
    "reversed",
    "expert_earnings status must be 'reversed' — refundServiceBooking calls reverseEarningsForBooking internally",
  );
});

test("4: after refund — provider dashboard totalBookings = 0 (simulates next 30-second poll)", async () => {
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalBookings,
    0,
    `totalBookings must be 0 after refund, got ${body.summary.totalBookings} — ` +
    `indicates bookings_count was not decremented by the refund path`,
  );
});

test("5: after refund — expert earnings totalEarnings = 0 and pendingEarnings = 0 (simulates next 30-second poll)", async () => {
  // summarizeEscrowEarnings (storage.ts ~:4491) excludes reversed rows — the expert today
  // page's next refetchInterval=30_000 poll must show zero.
  const res = await apiCall("/api/expert/earnings/details", fixture.expertCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalEarnings,
    0,
    `totalEarnings must be 0 after reversal (reversed rows excluded from summary), got ${body.summary.totalEarnings}`,
  );
  assert.equal(
    body.summary.pendingEarnings,
    0,
    `pendingEarnings must be 0 after reversal, got ${body.summary.pendingEarnings}`,
  );
});

test("6: totalRevenue unaffected — booking cancelled before completion so revenue was never minted", async () => {
  // provider_services.total_revenue is only incremented at booking COMPLETION
  // (storage.ts ~:2545-2549). A pre-completion refund leaves it at 0.
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalRevenue,
    0,
    `totalRevenue must remain 0 for a booking refunded before completion, got ${body.summary.totalRevenue}`,
  );
});

test("7: refundServiceBooking idempotent — second call returns alreadyRefunded, counters unchanged", async () => {
  // The atomic claim (WHERE status <> 'refunded') fires zero rows on retry.
  // bookings_count guard (priorStatus check) also fires zero rows: booking is already 'refunded'.
  // Earnings reversal idempotency is handled by status IN ('held','releasable') WHERE clause.
  const result = await stripePaymentService.refundServiceBooking(
    fixture.bookingId,
    "test_cancellation_retry",
  );
  assert.equal(
    (result as any).alreadyRefunded,
    true,
    `second call must return { alreadyRefunded: true }, got ${JSON.stringify(result)}`,
  );

  // Dashboard counter must still be 0 (not double-decremented).
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalBookings,
    0,
    `totalBookings must remain 0 after idempotent retry — must not double-decrement`,
  );
});
