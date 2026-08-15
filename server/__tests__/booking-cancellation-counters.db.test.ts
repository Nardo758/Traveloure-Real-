/**
 * Task #1214 — booking count and earnings figures stay accurate after cancellation.
 *
 * Two API surfaces are under test:
 *   A. GET /api/provider/analytics/dashboard — `summary.totalBookings` is the SUM of
 *      `provider_services.bookings_count`; cancellation must decrement that counter back
 *      to baseline via storage.updateServiceBookingStatus.
 *   B. GET /api/expert/earnings/details — `summary.totalEarnings` / `summary.pendingEarnings`
 *      exclude `reversed` rows; storage.reverseEarningsForBooking must flip held → reversed
 *      so figures return to baseline after a full cancellation/refund.
 *
 * SERVER REQUIRED — tests register real sessions over HTTP to assert what the live endpoints
 * actually return. `before()` fails loudly when the dev server is not up.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 RATE_LIMIT_LOOPBACK_SKIP=1 \
 *   npx tsx --test server/__tests__/booking-cancellation-counters.db.test.ts
 */
import { test, before, after, describe } from "node:test";
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

// Actual IDs assigned during fixture setup — populated in before(), used in after()
const fixture = {
  providerId: "",
  expertId:   "",
  travelerId: `cc-${RUN}-trav`,   // raw-SQL insert; id is deterministic
  serviceId:  `cc-${RUN}-svc`,
  bookingId:  `cc-${RUN}-bk`,
  expertEarningId: `cc-${RUN}-ee`,
  // Synthetic booking ID used as the reversal reference for expert_earnings
  expertBookingRef: `cc-${RUN}-ebk`,
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

/**
 * Register a user via the auth API and return their { id, cookie }.
 * Uses the same pattern as booking-completion-machinery.db.test.ts.
 */
async function registerUser(tag: string): Promise<{ id: string; cookie: string }> {
  const email = `cc-${RUN}-${tag}@t.test`;
  const res = await apiCall("/api/auth/register", undefined, "POST", {
    email,
    password: "Sup3rSecret!23",
    firstName: "CC",
    lastName: tag,
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

  // Register provider and expert users via HTTP so they hold real sessions
  const provider = await registerUser("prov");
  const expert   = await registerUser("exp");
  fixture.providerId    = provider.id;
  fixture.expertId      = expert.id;
  fixture.providerCookie = provider.cookie;
  fixture.expertCookie   = expert.cookie;

  // Assign correct roles — the analytics/earnings handlers inline-check the DB role, so no
  // re-login is needed; the next request will hit the updated row.
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${fixture.providerId}`);
  await db.execute(sql`UPDATE users SET role = 'expert'   WHERE id = ${fixture.expertId}`);

  // Traveler: FK anchor only — no session needed
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${fixture.travelerId}, ${`cc-${RUN}-trav@t.test`}, 'CC', 'Trav')
    ON CONFLICT (id) DO NOTHING
  `);

  // Provider service — bookings_count starts at 0
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, status, approval_status,
       bookings_count, total_revenue, price, created_at, updated_at)
    VALUES
      (${fixture.serviceId}, ${fixture.providerId}, 'CC Test Service',
       'active', 'approved', 0, '0.00', '100.00', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Confirmed booking on that service
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status,
       total_amount, platform_fee, provider_earnings, booking_details, created_at, updated_at)
    VALUES
      (${fixture.bookingId}, ${fixture.serviceId}, ${fixture.travelerId}, ${fixture.providerId},
       'confirmed', '100.00', '25.00', '75.00', '{}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Manually set bookings_count = 1 — mirrors what the normal booking-creation path does in
  // storage.ts ~:2217-2219 when a booking transitions to confirmed for the first time.
  await db.execute(sql`
    UPDATE provider_services SET bookings_count = 1 WHERE id = ${fixture.serviceId}
  `);

  // Expert earnings row in 'held' status — simulates a completed booking's earnings mint.
  // referenceId = fixture.expertBookingRef so reverseEarningsForBooking can target it by
  // the same bookingId key the real refund path uses (storage.ts:4828-4831).
  await db.execute(sql`
    INSERT INTO expert_earnings
      (id, expert_id, type, amount, currency,
       reference_id, reference_type, status, created_at)
    VALUES
      (${fixture.expertEarningId}, ${fixture.expertId}, 'consulting', '80.00', 'USD',
       ${fixture.expertBookingRef}, 'service_booking', 'held', NOW())
    ON CONFLICT DO NOTHING
  `);
});

after(async () => {
  // Reverse insertion order so FKs don't bite
  await db.execute(sql`
    DELETE FROM expert_earnings WHERE id = ${fixture.expertEarningId}
  `);
  await db.execute(sql`
    DELETE FROM service_bookings WHERE id = ${fixture.bookingId}
  `);
  await db.execute(sql`
    DELETE FROM provider_services WHERE id = ${fixture.serviceId}
  `);
  await db.execute(sql`
    DELETE FROM users
    WHERE id IN (${fixture.providerId}, ${fixture.expertId}, ${fixture.travelerId})
  `);
});

// ── Part A: provider dashboard booking count ─────────────────────────────────────────────────────

describe("A — /api/provider/analytics/dashboard booking count after cancellation", () => {
  test("A1: dashboard reports totalBookings = 1 before cancellation", async () => {
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

  test("A2: storage.updateServiceBookingStatus('cancelled') decrements bookings_count to 0", async () => {
    const updated = await storage.updateServiceBookingStatus(fixture.bookingId, "cancelled");
    assert.ok(updated, "updateServiceBookingStatus must return the updated booking row");
    assert.equal(updated.status, "cancelled", "booking status must be 'cancelled'");

    // Confirm the counter column in the DB — this is the source the dashboard sums over.
    const r = await db.execute(
      sql`SELECT bookings_count FROM provider_services WHERE id = ${fixture.serviceId}`,
    );
    const dbCount = Number((r.rows[0] as any)?.bookings_count ?? -1);
    assert.equal(dbCount, 0, `bookings_count in DB must be 0 after cancellation, got ${dbCount}`);
  });

  test("A3: dashboard reports totalBookings = 0 after cancellation (next poll cycle)", async () => {
    const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    const body: any = await res.json();
    assert.equal(
      body.summary.totalBookings,
      0,
      `totalBookings must be 0 after cancellation, got ${body.summary.totalBookings}`,
    );
  });

  test("A4: dashboard totalRevenue is unaffected — booking cancelled before completion", async () => {
    // provider_services.total_revenue is only incremented on booking COMPLETION
    // (storage.ts ~:2545-2549); a pre-completion cancellation must leave it at 0.
    const res = await apiCall("/api/provider/analytics/dashboard", fixture.providerCookie);
    const body: any = await res.json();
    assert.equal(
      body.summary.totalRevenue,
      0,
      `totalRevenue must remain 0 for a booking cancelled before completion, got ${body.summary.totalRevenue}`,
    );
  });
});

// ── Part B: expert earnings figures after earnings reversal ──────────────────────────────────────

describe("B — /api/expert/earnings/details figures after earnings reversal", () => {
  test("B1: earnings details show totalEarnings = 80 and pendingEarnings = 80 before reversal", async () => {
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

  test("B2: reverseEarningsForBooking flips held → reversed (returns reversed = 1)", async () => {
    const result = await storage.reverseEarningsForBooking(fixture.expertBookingRef);
    assert.equal(
      result.reversed,
      1,
      `exactly 1 expert_earnings row must be reversed, got ${result.reversed}`,
    );
    assert.equal(
      result.skippedPaidOut,
      0,
      `no paid_out rows should exist for this fixture, got skippedPaidOut=${result.skippedPaidOut}`,
    );
  });

  test("B3: earnings details return totalEarnings = 0 and pendingEarnings = 0 after reversal", async () => {
    // summarizeEscrowEarnings (storage.ts:4491) filters out reversed rows — so the full
    // cancellation/refund path correctly zeros both figures for the next 30-second poll.
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

  test("B4: reverseEarningsForBooking is idempotent — second call reverses 0 rows", async () => {
    // The atomic UPDATE WHERE status IN ('held','releasable') finds nothing the second time.
    const result = await storage.reverseEarningsForBooking(fixture.expertBookingRef);
    assert.equal(
      result.reversed,
      0,
      `second reversal must find no eligible rows (idempotent guard), got ${result.reversed}`,
    );
  });
});
