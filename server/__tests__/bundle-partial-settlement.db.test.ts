/**
 * D-51 (ledger `2026-09-16-bundle-partial-settlement`; migration 307) — A PARTIALLY FULFILLED BUNDLE
 * SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT ALLOCATION, against a real Postgres and a stubbed
 * `Stripe.refunds.create` (no network).
 *
 *   S1  birth: the composer writes allocation_cents that sum EXACTLY to total_amount (discount, odd cents);
 *       an unpriced snapshot leaves it NULL
 *   S2  the settlement, end to end: flip + reduced mint, ONE Stripe refund (allocation + fee share, the
 *       `bundle-settle-<id>` key), ONE `refunds` row, the promote, the failed component's refund columns;
 *       the booking STAYS partially_completed; no earnings/platform-revenue reversal rows (the mint was
 *       already reduced); no slot released
 *   S3  retry: the same call again ⇒ alreadySettled, still one Stripe call, one row, one earning set
 *   S4  concurrency: two callers on the money leg ⇒ one winner, one Stripe call, one row
 *   S5  Stripe failure: the claim stays claimed-but-unpromoted; inside the TTL a retry makes NO Stripe
 *       call (`settlement_in_progress`); the sweep past the TTL reclaims and settles
 *   S6  webhook redelivery: a claimed-unpromoted row is promoted by `charge.refunded` ONCE; the second
 *       delivery matches zero rows
 *   S7  historical snapshot: repricing every listing after purchase moves nothing
 *   S8  custody: a bundle with no PaymentIntent is refused (`custody_unknown`), no Stripe, no row
 *   S9  failed vs cancelled: a `cancelled` component refuses the settlement (`traveler_cancel_path_not_built`)
 *  S10  a pre-307 row (NULL allocations) still mints by snapshot pro-rata but cannot settle (`allocation_missing`)
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  recordBundleComponentCompletion,
  recordBundleComponentFailure,
  settleBundlePartialCompletion,
  settleBundlePartially,
} from "../services/booking-completion.service";
import { readBundleComponentRows } from "../services/bundle-component-states.service";
import {
  BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES,
  issueBundlePartialSettlement,
  promoteBundlePartialSettlement,
  sweepUnsettledBundlePartials,
} from "../services/bundle-partial-settlement.service";
import { BUNDLE_SETTLEMENT_REFUND_SOURCE, stripePaymentService } from "../services/stripe-payment.service";
import { PARTIALLY_COMPLETED_STATUS } from "@shared/bundle-component-states";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `bps-${RUN}-prov`,
  traveler: `bps-${RUN}-trav`,
  bundle: `bps-${RUN}-bundle`,
  compA: `bps-${RUN}-a`,
  compB: `bps-${RUN}-b`,
  compC: `bps-${RUN}-c`,
};
const COMPONENTS = [
  { id: ids.compA, serviceName: `Settle comp A ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compB, serviceName: `Settle comp B ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compC, serviceName: `Settle comp C ${RUN}`, price: "20.00", priceCents: 2000 },
];
const createdBookingIds: string[] = [];
const actor = "provider_bundle_components" as const;

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── Disposable-DB guard (mirrors bundle-component-states.db.test.ts; never defaults open) ────────
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
      `[bundle-partial-settlement] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Stripe stub on the shared prototype (every `new Stripe()` shares it) ─────────────────────────
const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const originalCreate = refundsProto.create;
type Call = { params: any; options: any };
let calls: Call[] = [];
function stubSucceed() {
  calls = [];
  refundsProto.create = async (params: any, options: any) => {
    calls.push({ params, options });
    return { id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: params.amount, metadata: params.metadata };
  };
}
function stubFailOnce() {
  calls = [];
  let failed = false;
  refundsProto.create = async (params: any, options: any) => {
    calls.push({ params, options });
    if (!failed) {
      failed = true;
      throw new Error("stripe_down (stub)");
    }
    return { id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: params.amount, metadata: params.metadata };
  };
}
afterEach(() => {
  refundsProto.create = originalCreate;
});

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A CONFIRMED bundle booking born through the composer (so `allocation_cents` is derived at birth),
 * priced 100.00 (fee 25.00 / earnings 75.00), charged under A3 with a 5.00 concierge fee and a 10.00
 * traveler service fee, with a Stripe PaymentIntent (stamped by SQL — the composer strips it, §19a).
 */
async function bornBundleBooking(opts: {
  snapshot?: unknown[];
  totalAmount?: string;
  paymentIntent?: string | null;
  details?: Record<string, unknown>;
} = {}): Promise<string> {
  const booking = await storage.createServiceBooking({
    serviceId: ids.bundle,
    travelerId: ids.traveler,
    providerId: ids.provider,
    status: "confirmed",
    totalAmount: opts.totalAmount ?? "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    bookingDetails: {
      bundleComponents: opts.snapshot ?? COMPONENTS.map((c) => ({ id: c.id, serviceName: c.serviceName, priceCents: c.priceCents })),
      travelerCharge: { conciergeFee: "5.00" },
      travelerServiceFee: { charged: 10, waived: false },
      ...(opts.details ?? {}),
    },
  } as any);
  createdBookingIds.push(booking.id);
  const pi = opts.paymentIntent === undefined ? `pi_${RUN}_${booking.id.slice(0, 8)}` : opts.paymentIntent;
  await db.execute(sql`
    UPDATE service_bookings
       SET stripe_payment_intent_id = ${pi}, confirmed_at = NOW() - interval '10 days'
     WHERE id = ${booking.id}
  `);
  return booking.id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completed_at, total_amount, platform_fee, provider_earnings, stripe_payment_intent_id, booking_details
      FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}
async function settlementRows(bookingId: string): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM bundle_partial_settlements WHERE booking_id = ${bookingId}`);
  return r.rows as any[];
}
async function refundRows(bookingId: string): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM refunds WHERE booking_id = ${bookingId} ORDER BY created_at`);
  return r.rows as any[];
}
async function ledger(bookingId: string) {
  const pe = await db.execute(sql`SELECT amount, status FROM provider_earnings WHERE source_id = ${bookingId}`);
  const pr = await db.execute(sql`SELECT gross_amount, platform_fee, provider_earnings, status FROM platform_revenue WHERE source_id = ${bookingId} ORDER BY gross_amount DESC`);
  const ee = await db.execute(sql`SELECT amount, status FROM expert_earnings WHERE reference_id = ${bookingId}`);
  return { providerEarnings: pe.rows as any[], platformRevenue: pr.rows as any[], expertEarnings: ee.rows as any[] };
}
/** Fail C, deliver A then B — the last delivery is what fires the settlement. */
async function failCDeliverAB(bookingId: string) {
  const f = await recordBundleComponentFailure({ bookingId, componentServiceId: ids.compC, actor, reason: "venue closed" });
  assert.equal(f.recorded, true);
  const a = await recordBundleComponentCompletion({ bookingId, componentServiceId: ids.compA, actor });
  assert.equal(a.recorded, true);
  return recordBundleComponentCompletion({ bookingId, componentServiceId: ids.compB, actor });
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`bps-${RUN}-prov@t.test`}, 'Bps', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`bps-${RUN}-trav@t.test`}, 'Bps', 'Traveler')
  `);
  for (const c of COMPONENTS) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                     approval_status, delivery_method)
      VALUES (${c.id}, ${ids.provider}, ${c.serviceName}, 'fixture component', ${c.price}, 'active',
              'approved', 'in_person')
    `);
  }
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, product_shape)
    VALUES (${ids.bundle}, ${ids.provider}, ${`Bps bundle ${RUN}`}, 'fixture bundle', '100.00', 'active',
            'approved', 'in_person', 'bundle')
  `);
  for (const [i, c] of COMPONENTS.entries()) {
    await db.execute(sql`
      INSERT INTO bundle_components (id, bundle_service_id, component_service_id, position)
      VALUES (${`bps-${RUN}-bc-${i}`}, ${ids.bundle}, ${c.id}, ${i})
    `);
  }
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE related_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {}); // component + settlement rows CASCADE
  }
  await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${ids.bundle}`).catch(() => {});
  for (const svc of [ids.bundle, ids.compA, ids.compB, ids.compC]) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
  await db.execute(sql`DELETE FROM daily_revenue_summary WHERE date = CURRENT_DATE::text AND transaction_count = 0`).catch(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════

test("S1 — birth: allocation_cents is the pro-rata share of total_amount and sums EXACTLY; an unpriced snapshot leaves it NULL", async () => {
  // Undiscounted 100.00 over 40/40/20 ⇒ the allocation IS the price.
  const plain = await bornBundleBooking();
  const rows = await readBundleComponentRows(db, plain);
  assert.deepEqual(rows.map((r) => r.allocationCents), [4000, 4000, 2000]);
  assert.deepEqual(rows.map((r) => r.snapshotPriceCents), [4000, 4000, 2000], "the catalog fact is untouched");

  // A DISCOUNTED bundle: 60 + 40 catalog, sold for 95.00 ⇒ 57.00 / 38.00.
  const discounted = await bornBundleBooking({
    totalAmount: "95.00",
    snapshot: [
      { id: ids.compA, serviceName: "A", priceCents: 6000 },
      { id: ids.compB, serviceName: "B", priceCents: 4000 },
    ],
  });
  const d = await readBundleComponentRows(db, discounted);
  assert.deepEqual(d.map((r) => r.allocationCents), [5700, 3800]);
  assert.equal(d.reduce((s, r) => s + (r.allocationCents ?? 0), 0), 9500);

  // ODD CENTS: 100.01 over 40/40/20 ⇒ one leftover cent to the first of the tied largest remainders.
  const odd = await bornBundleBooking({ totalAmount: "100.01" });
  const o = await readBundleComponentRows(db, odd);
  assert.deepEqual(o.map((r) => r.allocationCents), [4001, 4000, 2000]);
  assert.equal(o.reduce((s, r) => s + (r.allocationCents ?? 0), 0), 10001);

  // An UNPRICED component in the snapshot ⇒ every allocation NULL (not captured), the price still captured where it was.
  const unpriced = await bornBundleBooking({
    snapshot: [
      { id: ids.compA, serviceName: "A", priceCents: 4000 },
      { id: ids.compB, serviceName: "B" },
      { id: ids.compC, serviceName: "C", priceCents: 2000 },
    ],
  });
  const u = await readBundleComponentRows(db, unpriced);
  assert.deepEqual(u.map((r) => r.allocationCents), [null, null, null]);
  assert.deepEqual(u.map((r) => r.snapshotPriceCents), [4000, null, 2000]);

  // The birth reads the ROW's own total, never a request: pinned comments-stripped on the storage call.
  const st = code("server/storage.ts");
  assert.match(st, /bornBundleComponentRows\(tx,\s*row\.id,\s*bundleSnapshot,\s*Number\.isInteger\(totalCents\)/);
  assert.doesNotMatch(code("server/services/bundle-component-states.service.ts"), /req\.body/);
});

test("S2 — the settlement end to end: ONE reduced mint, ONE Stripe refund at the allocation + fee share, ONE refunds row, the promote; the booking STAYS partially_completed", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const last = await failCDeliverAB(id);
  assert.equal(last.partiallyCompleted, true, "the last delivery moved the parent");
  assert.ok(last.settlement, "the money leg's result is NAMED on the recorder's response");
  assert.equal(last.settlement!.settled, true);
  assert.equal((last.settlement as any).alreadySettled, false);

  const b = await readBooking(id);
  assert.equal(b.status, PARTIALLY_COMPLETED_STATUS, "never `refunded`");
  assert.equal(b.completed_at, null);
  assert.equal(b.total_amount, "100.00", "total_amount is never rewritten (§17)");

  // ONE Stripe refund: undelivered allocation 20.00 + 20% of the 5.00 concierge fee + 20% of the 10.00 traveler fee.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 2300);
  assert.equal(calls[0].params.payment_intent, b.stripe_payment_intent_id);
  assert.equal(calls[0].params.metadata.source, BUNDLE_SETTLEMENT_REFUND_SOURCE);
  assert.equal(calls[0].params.metadata.bookingId, id);
  assert.equal(calls[0].options.idempotencyKey, `bundle-settle-${id}`);

  // ONE settlement row, promoted, amounts pinned.
  const s = await settlementRows(id);
  assert.equal(s.length, 1);
  assert.ok(s[0].settled_at, "promoted");
  assert.equal(s[0].stripe_refund_id, (last.settlement as any).stripeRefundId);
  assert.equal(s[0].settled_amount_cents, 8000);
  assert.equal(s[0].traveler_refund_cents, 2300);
  assert.equal(s[0].seller_earning_cents, 6000);
  assert.equal(s[0].platform_revenue_cents, 2000);
  const outcomes = s[0].component_outcomes.components as any[];
  assert.deepEqual(outcomes.map((o) => [o.componentServiceId, o.outcome, o.refundCents]), [
    [ids.compA, "delivered", 0],
    [ids.compB, "delivered", 0],
    [ids.compC, "failed", 2000],
  ]);
  assert.equal(s[0].component_outcomes.feeRefundCents, 100);
  assert.equal(s[0].component_outcomes.travelerServiceFeeRefundCents, 200);

  // ONE amount-specific refund audit row, keyed to the booking.
  const r = await refundRows(id);
  assert.equal(r.length, 1);
  assert.equal(r[0].amount, "23.00");
  assert.equal(r[0].stripe_refund_id, s[0].stripe_refund_id);
  assert.equal(r[0].reason, "bundle_partial_settlement");

  // The failed component carries its refund; the delivered ones do not. Its STATUS stays `failed` — the
  // outcome and the refund are two facts.
  const rows = await readBundleComponentRows(db, id);
  const c = rows.find((x) => x.componentServiceId === ids.compC)!;
  assert.equal(c.status, "failed");
  assert.ok(c.refundedAt);
  assert.equal(c.refundAmountCents, 2000);
  assert.equal(c.stripeRefundId, s[0].stripe_refund_id);
  for (const x of rows.filter((x) => x.componentServiceId !== ids.compC)) {
    assert.equal(x.refundedAt, null);
    assert.equal(x.refundAmountCents, null);
  }

  // The ledger is the D-35 mint and NOTHING else: reduced figures, no reversal rows, earnings still held.
  const l = await ledger(id);
  assert.equal(l.platformRevenue.length, 1, "no compensating negative row — the mint was already reduced");
  assert.equal(l.platformRevenue[0].gross_amount, "80.00");
  assert.equal(l.platformRevenue[0].platform_fee, "20.00");
  assert.equal(l.platformRevenue[0].status, "recorded");
  assert.equal(l.providerEarnings.length, 1);
  assert.equal(l.providerEarnings[0].amount, "60.00");
  assert.equal(l.providerEarnings[0].status, "held", "never reversed");
  assert.equal(l.expertEarnings.length, 1);
  assert.equal(l.expertEarnings[0].amount, "60.00");

  // The mint NAMED its basis.
  const desc = await db.execute(sql`SELECT description FROM platform_revenue WHERE source_id = ${id}`);
  assert.match(String((desc.rows[0] as any).description), /basis allocation/);
});

test("S3 — retry: the same settlement again is alreadySettled — still one Stripe call, one row, one earning set", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  await failCDeliverAB(id);
  assert.equal(calls.length, 1);
  const s1 = (await settlementRows(id))[0];

  const again = await settleBundlePartially({ bookingId: id, actor });
  assert.equal(again.settled, true);
  assert.equal(again.flipped, false, "the flip did not happen twice");
  assert.equal(again.settlement!.settled, true);
  assert.equal((again.settlement as any).alreadySettled, true);
  assert.equal((again.settlement as any).stripeRefundId, s1.stripe_refund_id);

  const direct = await issueBundlePartialSettlement({ bookingId: id });
  assert.equal((direct as any).alreadySettled, true);

  assert.equal(calls.length, 1, "no second Stripe call");
  const s = await settlementRows(id);
  assert.equal(s.length, 1);
  assert.equal(String(s[0].settled_at), String(s1.settled_at), "settled_at never moves");
  assert.equal((await refundRows(id)).length, 1);
  const l = await ledger(id);
  assert.equal(l.providerEarnings.length + l.platformRevenue.length + l.expertEarnings.length, 3);
  // The whole-row flip is also refused a second time, as before.
  const flip = await settleBundlePartialCompletion({ bookingId: id, actor });
  assert.equal(flip.settled, false);
});

test("S4 — concurrency: two callers on the money leg ⇒ one winner, one Stripe call, one row", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  // Reach `partially_completed` WITHOUT the money leg: fail C, deliver A, then flip directly.
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: null });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  // Deliver B through the raw claim so the recorder's own settlement does not run first.
  await db.execute(sql`UPDATE booking_component_states SET status = 'completed', completed_at = NOW() WHERE booking_id = ${id} AND component_service_id = ${ids.compB}`);
  const flip = await settleBundlePartialCompletion({ bookingId: id, actor });
  assert.equal(flip.settled, true);
  assert.equal(calls.length, 0);

  const [x, y] = await Promise.all([
    issueBundlePartialSettlement({ bookingId: id, actor: "caller-x" }),
    issueBundlePartialSettlement({ bookingId: id, actor: "caller-y" }),
  ]);
  const winners = [x, y].filter((r) => r.settled && !(r as any).alreadySettled);
  const others = [x, y].filter((r) => !(r.settled && !(r as any).alreadySettled));
  assert.equal(winners.length, 1, "exactly one caller issued the refund");
  assert.equal(others.length, 1);
  const o = others[0] as any;
  assert.ok(
    (o.settled === true && o.alreadySettled === true) || (o.settled === false && o.reason === "settlement_in_progress"),
    `the loser converges without a Stripe call: ${JSON.stringify(o)}`,
  );
  assert.equal(calls.length, 1);
  assert.equal((await settlementRows(id)).length, 1);
  assert.equal((await refundRows(id)).length, 1);
});

test("S5 — Stripe failure leaves a reclaimable claim; inside the TTL a retry makes NO Stripe call; the sweep past the TTL reclaims and settles", async () => {
  stubFailOnce();
  const t0 = new Date("2026-09-16T10:00:00Z");
  const id = await bornBundleBooking();
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: null, now: t0 });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor, now: t0 });
  const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor, now: t0 });
  assert.equal(last.partiallyCompleted, true, "the flip + mint landed regardless");
  assert.equal(last.settlement!.settled, false);
  assert.equal((last.settlement as any).reason, "stripe_refund_failed");
  assert.equal(calls.length, 1);

  // The claim is CLAIMED-BUT-UNPROMOTED — no compensating rollback of any money fact.
  let s = await settlementRows(id);
  assert.equal(s.length, 1);
  assert.equal(s[0].settled_at, null);
  assert.equal(s[0].stripe_refund_id, null);
  assert.equal(s[0].traveler_refund_cents, 2300, "the amount is pinned");
  assert.equal((await refundRows(id)).length, 0);
  const l = await ledger(id);
  assert.equal(l.providerEarnings[0].amount, "60.00", "the reduced mint stands");
  assert.equal((await readBooking(id)).status, PARTIALLY_COMPLETED_STATUS);

  // Inside the TTL: told `settlement_in_progress`, NO Stripe call.
  const inside = await issueBundlePartialSettlement({ bookingId: id, now: new Date(t0.getTime() + 60_000) });
  assert.equal(inside.settled, false);
  assert.equal((inside as any).reason, "settlement_in_progress");
  assert.equal(calls.length, 1);
  const sweepInside = await sweepUnsettledBundlePartials({ now: new Date(t0.getTime() + 60_000), onlyBookingIds: [id] });
  assert.equal(sweepInside.scanned, 1);
  assert.equal(sweepInside.refused.settlement_in_progress, 1);
  assert.equal(calls.length, 1);

  // Past the TTL: the sweep reclaims, Stripe (now up) refunds the SAME pinned cents under the SAME key, promote.
  const later = new Date(t0.getTime() + (BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES + 1) * 60_000);
  const swept = await sweepUnsettledBundlePartials({ now: later, onlyBookingIds: [id] });
  assert.equal(swept.settled, 1);
  assert.deepEqual(swept.settledBookingIds, [id]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.amount, 2300);
  assert.equal(calls[1].options.idempotencyKey, `bundle-settle-${id}`, "the same key — a Stripe retry returns the same refund");
  s = await settlementRows(id);
  assert.ok(s[0].settled_at);
  assert.ok(s[0].stripe_refund_id);
  assert.equal((await refundRows(id)).length, 1);
  assert.equal(s[0].component_outcomes.initiatedBy, actor, "the claim's own record is not rewritten by the reclaim");

  // A second sweep finds nothing to do.
  const again = await sweepUnsettledBundlePartials({ now: later, onlyBookingIds: [id] });
  assert.equal(again.scanned, 0);
  assert.equal(calls.length, 2);
});

test("S6 — webhook redelivery: `charge.refunded` promotes a claimed-unpromoted settlement ONCE; the second delivery matches zero rows", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: null });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  await db.execute(sql`UPDATE booking_component_states SET status = 'completed', completed_at = NOW() WHERE booking_id = ${id} AND component_service_id = ${ids.compB}`);
  await settleBundlePartialCompletion({ bookingId: id, actor });
  // The process died between Stripe and the promote: a claim exists, Stripe holds the refund.
  await db.execute(sql`
    INSERT INTO bundle_partial_settlements (id, booking_id, settled_amount_cents, traveler_refund_cents, seller_earning_cents,
                                            platform_revenue_cents, component_outcomes, claimed_at)
    VALUES (${crypto.randomUUID()}, ${id}, 8000, 2300, 6000, 2000,
            ${JSON.stringify({ components: [{ componentServiceId: ids.compC, outcome: "failed", refundCents: 2000 }], initiatedBy: "test" })}::jsonb,
            NOW())
  `);
  const b = await readBooking(id);
  const refundId = `re_${RUN}_webhook`;
  const event = {
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${RUN}`,
        payment_intent: b.stripe_payment_intent_id,
        amount_refunded: 2300,
        currency: "usd",
        refunds: { data: [{ id: refundId, metadata: { source: BUNDLE_SETTLEMENT_REFUND_SOURCE, bookingId: id } }] },
      },
    },
  } as any;

  await stripePaymentService.handleWebhook(event);
  let s = await settlementRows(id);
  assert.ok(s[0].settled_at, "promoted by the webhook");
  assert.equal(s[0].stripe_refund_id, refundId);
  const firstSettledAt = String(s[0].settled_at);
  const c = (await readBundleComponentRows(db, id)).find((x) => x.componentServiceId === ids.compC)!;
  assert.equal(c.refundAmountCents, 2000);
  assert.equal(c.stripeRefundId, refundId);

  await stripePaymentService.handleWebhook(event); // REDELIVERY
  s = await settlementRows(id);
  assert.equal(s.length, 1);
  assert.equal(String(s[0].settled_at), firstSettledAt, "the second delivery matched zero rows");
  assert.equal(s[0].stripe_refund_id, refundId);
  // The direct promoter converges the same way.
  assert.deepEqual(await promoteBundlePartialSettlement({ bookingId: id, stripeRefundId: "re_other" }), { promoted: false });
  assert.equal((await settlementRows(id))[0].stripe_refund_id, refundId);
  // And the settlement itself, arriving after the webhook, issues nothing.
  const after = await issueBundlePartialSettlement({ bookingId: id });
  assert.equal((after as any).alreadySettled, true);
  assert.equal(calls.length, 0, "no Stripe call at all in this scenario");
  // A whole-row refund's webhook (source `service_booking`) touches no settlement.
  const other = await bornBundleBooking();
  await stripePaymentService.handleWebhook({
    type: "charge.refunded",
    data: { object: { id: `ch_${RUN}_2`, payment_intent: "pi_x", amount_refunded: 1, currency: "usd", refunds: { data: [{ id: "re_x", metadata: { source: "service_booking", bookingId: other } }] } } },
  } as any);
  assert.equal((await settlementRows(other)).length, 0);
});

test("S7 — HISTORICAL SNAPSHOT: repricing every listing after purchase moves nothing", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: null });
  // The seller reprices everything tenfold AFTER the sale …
  for (const svc of [ids.bundle, ids.compA, ids.compB, ids.compC]) {
    await db.execute(sql`UPDATE provider_services SET price = price * 10 WHERE id = ${svc}`);
  }
  try {
    await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
    const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
    assert.equal(last.settlement!.settled, true);
    // … and the settlement reads the stored allocation, the row's own figures and the row's own fee snapshots.
    assert.equal(calls[0].params.amount, 2300);
    const s = (await settlementRows(id))[0];
    assert.equal(s.settled_amount_cents, 8000);
    assert.equal(s.seller_earning_cents, 6000);
    assert.equal(s.platform_revenue_cents, 2000);
    const l = await ledger(id);
    assert.equal(l.providerEarnings[0].amount, "60.00");
    assert.equal(l.platformRevenue[0].platform_fee, "20.00");
  } finally {
    for (const svc of [ids.bundle, ids.compA, ids.compB, ids.compC]) {
      await db.execute(sql`UPDATE provider_services SET price = price / 10 WHERE id = ${svc}`);
    }
  }
});

test("S8 — CUSTODY: a bundle with no PaymentIntent is refused (`custody_unknown`) — no Stripe call, no settlement row", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ paymentIntent: null });
  const last = await failCDeliverAB(id);
  assert.equal(last.partiallyCompleted, true, "the flip and the reduced mint still record what happened");
  assert.equal(last.settlement!.settled, false);
  assert.equal((last.settlement as any).reason, "custody_unknown");
  assert.equal(calls.length, 0);
  assert.equal((await settlementRows(id)).length, 0);
  assert.equal((await refundRows(id)).length, 0);
  assert.equal((await readBooking(id)).status, PARTIALLY_COMPLETED_STATUS);
  // The sweep sees it and refuses it for the same NAMED reason, every night, never assuming custody.
  const swept = await sweepUnsettledBundlePartials({ onlyBookingIds: [id] });
  assert.equal(swept.scanned, 1);
  assert.equal(swept.refused.custody_unknown, 1);
  assert.equal(calls.length, 0);
});

test("S9 — FAILED vs CANCELLED: a `cancelled` component refuses the settlement (`traveler_cancel_path_not_built`); no Stripe call", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  // No writer exists for `cancelled` on main (the D-32 report) — set it directly to prove the asymmetry.
  await db.execute(sql`UPDATE booking_component_states SET status = 'cancelled', cancelled_at = NOW() WHERE booking_id = ${id} AND component_service_id = ${ids.compC}`);
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  assert.equal(last.partiallyCompleted, true, "the parent derivation treats cancelled as undelivered (unchanged)");
  assert.equal(last.settlement!.settled, false);
  assert.equal((last.settlement as any).reason, "traveler_cancel_path_not_built");
  assert.equal((last.settlement as any).detail, ids.compC);
  assert.equal(calls.length, 0);
  assert.equal((await settlementRows(id)).length, 0);
  // The failed path on the very same shape settles at the full allocation — S2 — so the asymmetry is
  // the presence of a policy question, not a different amount rule.
});

test("S10 — a pre-307 row (NULL allocations) still mints by snapshot pro-rata but CANNOT settle (`allocation_missing`)", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  await db.execute(sql`UPDATE booking_component_states SET allocation_cents = NULL WHERE booking_id = ${id}`);
  const last = await failCDeliverAB(id);
  assert.equal(last.partiallyCompleted, true);
  const l = await ledger(id);
  assert.equal(l.providerEarnings[0].amount, "60.00", "the D-35 mint is unchanged for a legacy row");
  const desc = await db.execute(sql`SELECT description FROM platform_revenue WHERE source_id = ${id}`);
  assert.match(String((desc.rows[0] as any).description), /basis snapshot_pro_rata/, "and it NAMES the basis it read");
  assert.equal(last.settlement!.settled, false);
  assert.equal((last.settlement as any).reason, "allocation_missing");
  assert.equal(calls.length, 0);
  assert.equal((await settlementRows(id)).length, 0);
  const swept = await sweepUnsettledBundlePartials({ onlyBookingIds: [id] });
  assert.equal(swept.refused.allocation_missing, 1, "the sweep says so too, and never guesses a split");
});
