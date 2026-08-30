/**
 * Task: payout-parity — "You earn $X if you accept" must equal what actually mints.
 *
 * The accept cards (client/src/pages/expert/bookings.tsx, client/src/pages/provider/inbox.tsx)
 * display service_bookings.provider_earnings — the figure stamped at checkout by
 * server/routes/payments.routes.ts. The earnings mint path (updateServiceBookingStatus →
 * 'completed', server/storage.ts) must credit EXACTLY that figure to the provider_earnings and
 * expert_earnings ledgers — never a recomputation from live commission config, which may have
 * changed between checkout and completion.
 *
 * This suite books a service (stamping provider_earnings the same way checkout does, via the
 * SAME resolveCommissionRates/calcInsuranceFee the route imports), "accepts" it
 * (pending → confirmed), completes it (confirmed → completed), and asserts:
 *   P1 — expert-band service: pre-accept provider_earnings === minted ledger amount (both ledgers).
 *   P2 — provider-band service (provider-source resolution; historically beta_flat, now the
 *        ruling-49 category-band path): same parity.
 *   P3 — CONFIG DRIFT between checkout and completion (the exact dispute scenario): the service's
 *        revenueShareRate override changes after stamping; the mint must still pay the STAMPED
 *        figure, not a recomputation.
 *
 * NO FEE LITERALS (§8): expected amounts are derived through resolveCommissionRates at stamp
 * time, never hardcoded.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/payout-parity.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { resolveCommissionRates, calcInsuranceFee } from "../services/commission";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `pp-${RUN}-expert`,
  provider: `pp-${RUN}-prov`,
  traveler: `pp-${RUN}-trav`,
  trip: `pp-${RUN}-trip`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ────
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
      `[payout-parity] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

async function makeService(ownerId: string, price: string, revenueShareRate?: string): Promise<string> {
  const id = `pp-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, revenue_share_rate)
    VALUES (${id}, ${ownerId}, ${`Payout parity service ${RUN}`}, 'fixture', ${price}, 'active', 'approved', ${revenueShareRate ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

/** safeParseRate — verbatim behaviour of the checkout route's local helper. */
function safeParseRate(value: any, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/**
 * Stamp a booking the way checkout stamps it (payments.routes.ts create-bookings loop):
 * resolve rates through the SAME resolver, apply the per-service revenueShareRate override,
 * deduct insurance, and write provider_earnings/platform_fee onto the row.
 * Returns { bookingId, stampedEarnings } — stampedEarnings is the "You earn $X" figure.
 */
async function bookLikeCheckout(opts: {
  serviceId: string;
  ownerId: string;
  ownerIsProvider: boolean;
}): Promise<{ bookingId: string; stampedEarnings: string }> {
  const service = await storage.getProviderServiceById(opts.serviceId);
  assert.ok(service, "fixture service must exist");
  const price = Number(service!.price) || 0;
  const feeCategory = "default"; // fixture services carry no category, exactly the route's fallback
  const rates = await resolveCommissionRates(
    opts.ownerIsProvider
      ? { source: "provider", providerId: opts.ownerId }
      : { category: feeCategory, expertId: opts.ownerId },
  );
  const expertShareRate = safeParseRate((service as any).revenueShareRate, rates.expertShareRate);
  const baseExpertEarningsAmt = price * expertShareRate;
  const basePlatformFeeAmt = price - baseExpertEarningsAmt;
  const insuranceFeeAmt = calcInsuranceFee(price, rates, feeCategory);
  const totalPlatformFeeAmt = basePlatformFeeAmt + insuranceFeeAmt;
  const netExpertEarningsAmt = baseExpertEarningsAmt - insuranceFeeAmt;

  const booking = await storage.createServiceBooking({
    serviceId: opts.serviceId,
    travelerId: ids.traveler,
    providerId: opts.ownerId,
    tripId: ids.trip,
    totalAmount: price.toFixed(2),
    platformFee: totalPlatformFeeAmt.toFixed(2),
    insuranceFee: insuranceFeeAmt.toFixed(2),
    providerEarnings: netExpertEarningsAmt.toFixed(2),
  } as any);
  createdBookingIds.push(booking.id);
  return { bookingId: booking.id, stampedEarnings: netExpertEarningsAmt.toFixed(2) };
}

async function ledgerAmounts(bookingId: string): Promise<{ provider: string[]; expert: string[] }> {
  const p = await db.execute(sql`
    SELECT amount FROM provider_earnings WHERE source_id = ${bookingId}
  `);
  const e = await db.execute(sql`
    SELECT amount FROM expert_earnings WHERE reference_id = ${bookingId}
  `);
  return {
    provider: (p.rows as any[]).map((r) => String(r.amount)),
    expert: (e.rows as any[]).map((r) => String(r.amount)),
  };
}

/** The full lifecycle under test: read pre-accept figure → accept → complete → compare mint. */
async function runParityLifecycle(bookingId: string, stampedEarnings: string): Promise<void> {
  // Pre-accept: the figure the accept card displays IS the stamped column.
  const preAccept = await storage.getServiceBooking(bookingId);
  assert.equal(
    preAccept?.providerEarnings,
    stampedEarnings,
    "pre-accept 'You earn $X' figure must be the checkout-stamped provider_earnings",
  );

  // Accept (pending → confirmed): must NOT mint anything.
  const accepted = await storage.updateServiceBookingStatus(bookingId, "confirmed", undefined, ["pending"]);
  assert.ok(accepted, "accept transition must succeed from pending");
  const afterAccept = await ledgerAmounts(bookingId);
  assert.equal(afterAccept.provider.length, 0, "accepting must not mint provider earnings");
  assert.equal(afterAccept.expert.length, 0, "accepting must not mint expert earnings");

  // Complete (confirmed → completed): mints exactly once.
  const completed = await storage.updateServiceBookingStatus(bookingId, "completed", undefined, ["confirmed"]);
  assert.ok(completed, "complete transition must succeed from confirmed");

  const minted = await ledgerAmounts(bookingId);
  assert.equal(minted.provider.length, 1, "exactly one provider_earnings ledger row");
  assert.equal(minted.expert.length, 1, "exactly one expert_earnings ledger row");
  assert.equal(
    Number(minted.provider[0]).toFixed(2),
    stampedEarnings,
    "minted provider_earnings amount must equal the pre-accept promise",
  );
  assert.equal(
    Number(minted.expert[0]).toFixed(2),
    stampedEarnings,
    "minted expert_earnings amount must equal the pre-accept promise",
  );
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`pp-${RUN}-expert@t.test`}, 'PP', 'Expert', 'expert'),
           (${ids.provider}, ${`pp-${RUN}-prov@t.test`}, 'PP', 'Provider', 'service_provider'),
           (${ids.traveler}, ${`pp-${RUN}-trav@t.test`}, 'PP', 'Traveler', 'traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'PP fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db
    .execute(sql`DELETE FROM users WHERE id IN (${ids.expert}, ${ids.provider}, ${ids.traveler})`)
    .catch(() => {});
});

test("P1: expert-band service — pre-accept figure equals minted earnings", async () => {
  const serviceId = await makeService(ids.expert, "180.00");
  const { bookingId, stampedEarnings } = await bookLikeCheckout({
    serviceId,
    ownerId: ids.expert,
    ownerIsProvider: false,
  });
  assert.ok(Number(stampedEarnings) > 0, "expert-band stamp must be a positive payout");
  await runParityLifecycle(bookingId, stampedEarnings);
});

test("P2: provider-band service (provider-source resolution) — pre-accept figure equals minted earnings", async () => {
  // The provider owner routes through resolveCommissionRates({ source: 'provider', providerId }).
  // Historically this was the beta_flat early-adopter band; under ruling 49 (beta_flat
  // deactivated) it resolves via the category-band path. Either way, whatever the resolver
  // says AT CHECKOUT is the promise — and the mint must honour it.
  const serviceId = await makeService(ids.provider, "240.00");
  const { bookingId, stampedEarnings } = await bookLikeCheckout({
    serviceId,
    ownerId: ids.provider,
    ownerIsProvider: true,
  });
  assert.ok(Number(stampedEarnings) > 0, "provider-band stamp must be a positive payout");
  await runParityLifecycle(bookingId, stampedEarnings);
});

test("P3: commission config changes between checkout and completion — mint still pays the STAMPED figure", async () => {
  const serviceId = await makeService(ids.expert, "100.00");
  const { bookingId, stampedEarnings } = await bookLikeCheckout({
    serviceId,
    ownerId: ids.expert,
    ownerIsProvider: false,
  });

  // Simulate a rate-config change AFTER checkout: the service's per-service override flips to a
  // dramatically different share. A mint that recomputed from live config would now disagree
  // with the pre-accept promise — the dispute this disclosure exists to prevent.
  await db.execute(sql`
    UPDATE provider_services SET revenue_share_rate = '0.01' WHERE id = ${serviceId}
  `);

  await runParityLifecycle(bookingId, stampedEarnings);

  // Belt-and-braces: the drifted config would have produced a DIFFERENT number, so this test
  // genuinely discriminates (guards against the override having no effect on a recompute path).
  const driftedFigure = (100 * 0.01).toFixed(2);
  assert.notEqual(stampedEarnings, driftedFigure, "fixture must make stamp and recompute distinguishable");
});
