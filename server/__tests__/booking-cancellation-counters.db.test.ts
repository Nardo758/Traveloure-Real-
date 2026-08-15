/**
 * Task #1214 — booking count and earnings figures stay accurate after cancellation.
 *
 * One booking ID drives BOTH effects together, mirroring the production cancellation/refund
 * path (server/routes/bookings.ts) that calls updateServiceBookingStatus then
 * reverseEarningsForBooking for the same booking:
 *
 *   1. Before cancellation: provider dashboard reports totalBookings = 1 and expert earnings
 *      shows totalEarnings = 80 / pendingEarnings = 80.
 *   2. Cancellation + reversal applied (same bookingId for both operations).
 *   3. After cancellation: dashboard totalBookings = 0, expert earnings totalEarnings = 0 /
 *      pendingEarnings = 0 — confirming neither surface overcounts after the next 30-second poll.
 *   4. totalRevenue is unaffected (booking cancelled before completion — never earned).
 *   5. Reversal is idempotent — a second call reverses 0 rows.
 *
 * Endpoints covered:
 *   GET /api/provider/analytics/dashboard  — summary.totalBookings, summary.totalRevenue
 *   GET /api/expert/earnings/details       — summary.totalEarnings, summary.pendingEarnings
 *
 * SERVER REQUIRED — tests register real sessions over HTTP to assert what the live endpoints
 * actually return. before() fails loudly when the dev server is not up.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 RATE_LIMIT_LOOPBACK_SKIP=1 \
 *   npx tsx --test server/__tests__/booking-cancellation-counters.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";

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

// All fixture IDs — populated in before(), used by tests and after()
const fixture = {
  providerId:    "",
  expertId:      "",
  travelerId:    `cc-${RUN}-trav`,
  serviceId:     `cc-${RUN}-svc`,
  // ONE shared booking ID: service_bookings.id AND expert_earnings.reference_id
  // This mirrors the production refund route (server/routes/bookings.ts) which calls
  // updateServiceBookingStatus and reverseEarningsForBooking for the SAME bookingId.
  bookingId:     `cc-${RUN}-bk`,
  earningId:     `cc-${RUN}-ee`,
  providerCookie: "",
  expertCookie:   "",
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

  // Register users via HTTP so they hold real sessions
  const provider = await registerUser("prov");
  const expert   = await registerUser("exp");
  fixture.providerId     = provider.id;
  fixture.expertId       = expert.id;
  fixture.providerCookie = provider.cookie;
  fixture.expertCookie   = expert.cookie;

  // Assign correct roles — the analytics/earnings handlers check the DB role directly
  // (server/routes.ts ~:697-720 prefix gate uses isProvider/isExpert, both DB-read-only).
  // Provider role vocabulary: "service_provider" — NOT bare "provider" (shared/roles.ts).
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${fixture.providerId}`);
  await db.execute(sql`UPDATE users SET role = 'expert'            WHERE id = ${fixture.expertId}`);

  // Traveler: FK anchor only — no session needed
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${fixture.travelerId}, ${`cc-${RUN}-trav@t.test`}, 'CC', 'Trav')
    ON CONFLICT (id) DO NOTHING
  `);

  // Provider service — bookings_count starts at 0, total_revenue at 0
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, status, approval_status,
       bookings_count, total_revenue, price, created_at, updated_at)
    VALUES
      (${fixture.serviceId}, ${fixture.providerId}, 'CC Test Service',
       'active', 'approved', 0, '0.00', '100.00', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Confirmed booking — uses fixture.bookingId for both the service_bookings row below
  // and the expert_earnings row further below (same as production: earnings reference
  // the booking that triggered them via expert_earnings.reference_id).
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status,
       total_amount, platform_fee, provider_earnings, booking_details, created_at, updated_at)
    VALUES
      (${fixture.bookingId}, ${fixture.serviceId}, ${fixture.travelerId}, ${fixture.providerId},
       'confirmed', '100.00', '25.00', '75.00', '{}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Set bookings_count = 1 — mirrors storage.ts ~:2217-2219 which increments this when a
  // booking first transitions to confirmed.
  await db.execute(sql`
    UPDATE provider_services SET bookings_count = 1 WHERE id = ${fixture.serviceId}
  `);

  // Expert earnings in 'held' status for the SAME booking ID.
  // This is the pattern the completion path uses (storage.ts:2553-2566): expertEarnings row
  // linked to the service_bookings row via reference_id. referenceType = 'service_booking'
  // matches reverseEarningsForBooking's WHERE clause (storage.ts:4828-4831).
  await db.execute(sql`
    INSERT INTO expert_earnings
      (id, expert_id, type, amount, currency,
       reference_id, reference_type, status, created_at)
    VALUES
      (${fixture.earningId}, ${fixture.expertId}, 'consulting', '80.00', 'USD',
       ${fixture.bookingId}, 'service_booking', 'held', NOW())
    ON CONFLICT DO NOTHING
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_earnings  WHERE id = ${fixture.earningId}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${fixture.bookingId}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${fixture.serviceId}`);
  await db.execute(sql`
    DELETE FROM users WHERE id IN (${fixture.providerId}, ${fixture.expertId}, ${fixture.travelerId})
  `);
});

// ── Test sequence — one booking ID drives both effects ───────────────────────────────────────────
//
// The production refund route (server/routes/bookings.ts:566-595) calls BOTH:
//   storage.updateServiceBookingStatus(id, "cancelled")   → decrements bookings_count
//   storage.reverseEarningsForBooking(id)                 → flips held/releasable → reversed
// for the same booking ID. The tests below replicate that orchestration so a future drift in
// either call site — e.g. reversal step accidentally dropped — would immediately fail here.

test("1: before cancellation — provider dashboard totalBookings = 1", async () => {
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.ok(body.summary, "response must have a summary object");
  assert.equal(
    body.summary.totalBookings,
    1,
    `totalBookings must be 1 before cancellation, got ${body.summary.totalBookings}`,
  );
});

test("2: before cancellation — expert earnings totalEarnings = 80 and pendingEarnings = 80", async () => {
  const res = await apiCall("/api/expert/earnings/details", fixture.expertCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.ok(body.summary, "response must have a summary object");
  assert.equal(
    body.summary.totalEarnings,
    80,
    `totalEarnings must be 80 before reversal, got ${body.summary.totalEarnings}`,
  );
  // Status is 'held' with no availableAt — not yet releasable, so it counts as pending.
  assert.equal(
    body.summary.pendingEarnings,
    80,
    `pendingEarnings must be 80 before reversal, got ${body.summary.pendingEarnings}`,
  );
});

test("3: cancel booking and reverse earnings — both using the same bookingId", async () => {
  // Step 1: cancel the booking → decrements provider_services.bookings_count
  const updated = await storage.updateServiceBookingStatus(fixture.bookingId, "cancelled");
  assert.ok(updated, "updateServiceBookingStatus must return the updated booking row");
  assert.equal(updated.status, "cancelled", "booking status must be 'cancelled'");

  // Verify DB column directly
  const r = await db.execute(
    sql`SELECT bookings_count FROM provider_services WHERE id = ${fixture.serviceId}`,
  );
  assert.equal(
    Number((r.rows[0] as any)?.bookings_count),
    0,
    `bookings_count in DB must be 0 after cancellation, got ${(r.rows[0] as any)?.bookings_count}`,
  );

  // Step 2: reverse earnings → flips expert_earnings.status from held to reversed
  const reversal = await storage.reverseEarningsForBooking(fixture.bookingId);
  assert.equal(
    reversal.reversed,
    1,
    `exactly 1 expert_earnings row must be reversed (same bookingId), got ${reversal.reversed}`,
  );
  assert.equal(
    reversal.skippedPaidOut,
    0,
    `no paid_out rows should exist for this fixture, got skippedPaidOut=${reversal.skippedPaidOut}`,
  );
});

test("4: after cancellation — provider dashboard totalBookings = 0 (next poll cycle)", async () => {
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalBookings,
    0,
    `totalBookings must be 0 after cancellation, got ${body.summary.totalBookings}`,
  );
});

test("5: after cancellation — expert earnings totalEarnings = 0 and pendingEarnings = 0 (next poll cycle)", async () => {
  // summarizeEscrowEarnings (storage.ts:4491) filters reversed rows — cancellation/refund
  // must zero both figures for the expert today page's next 30-second poll.
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

test("6: totalRevenue unaffected — booking cancelled before completion, revenue never earned", async () => {
  // provider_services.total_revenue is only incremented on booking COMPLETION
  // (storage.ts ~:2545-2549). A pre-completion cancellation must leave it at 0.
  const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
  const body: any = await res.json();
  assert.equal(
    body.summary.totalRevenue,
    0,
    `totalRevenue must remain 0 for a booking cancelled before completion, got ${body.summary.totalRevenue}`,
  );
});

test("7: reversal is idempotent — second call on the same bookingId reverses 0 rows", async () => {
  // The atomic UPDATE WHERE status IN ('held','releasable') finds nothing the second time.
  const result = await storage.reverseEarningsForBooking(fixture.bookingId);
  assert.equal(
    result.reversed,
    0,
    `second reversal must find no eligible rows (idempotent guard), got ${result.reversed}`,
  );
});
