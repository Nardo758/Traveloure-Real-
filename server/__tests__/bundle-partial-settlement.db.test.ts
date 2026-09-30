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
 *   S9  failed vs cancelled: a `cancelled` row with NO pinned policy outcome refuses the settlement (`cancel_terms_missing`)
 *  S10  a pre-307 row (NULL allocations) still mints by snapshot pro-rata but cannot settle (`allocation_missing`)
 *
 * Locked Decision 50, SECOND HALF — the traveler-cancelled component (ledger
 * `2026-09-16-bundle-component-traveler-cancel`; migration 309):
 *  S11  the cancel is ONE flip under a concurrent double call, pins `cancel_refund_percent` and `cancelled_at`
 *       in that flip, hands the loser the PINNED terms; a non-pending component, a non-traveler and an unknown
 *       component are refused by name; the body is a `.strict()` pick reading no amount, percent or status
 *  S12  flexible, cancelled before the deadline ⇒ 100% of the allocation + the same share of every fee
 *  S13  moderate, cancelled inside the 48h–120h window ⇒ 50%; the seller keeps the rest, minted as delivered
 *       value and NAMED in the mint's basis; ONE Stripe refund of the half + half the fee share
 *  S14  strict, cancelled late ⇒ 0%: the settlement records the outcome set, makes NO Stripe call, promotes
 *       with a NULL refund id, stamps no `refunded_at`; the seller minted the full figures
 *  S15  mixed: one component FAILED (full allocation) + one CANCELLED at 50% ⇒ ONE settlement, ONE Stripe
 *       call, the right sum; the outcome set names both outcomes distinctly
 *  S16  no purchase-time policy snapshot on the row ⇒ the cancel is REFUSED (`policy_snapshot_missing`),
 *       the component stays pending, nothing moves — the live listing's policy is never read
 *  S17  a policy edit on the listing AFTER purchase, and a reschedule AFTER the cancel, move nothing: the
 *       snapshot decides the tier and the pin decides the settlement
 *
 * LD 50 REMAINDER (ledger `2026-09-17-ld50-remainder-and-artifact-refund`):
 *  S18  `refunded` finally has a WRITER — the promote stamps every component it refunded in the SAME
 *       statement as the refund columns, a DELIVERED one is never stamped, who ended each component and
 *       why survives the stamp, and a retry is answered from the SETTLED ROW rather than re-derived
 *       (a re-derivation would now refuse `component_already_refunded`); the sweep skips a promoted row
 *  S19  exactly-once: two further promotes match zero rows, never re-stamp and never re-point the refund
 *       id; the stamp and the refund columns are ONE statement with the from-state inside it (§18b)
 *  S20  CAPACITY: a failed or cancelled component releases NOTHING, says so, and names what the BOOKING
 *       reserved instead — and the reason is structural (no per-component slot record exists anywhere),
 *       pinned against the schema and the checkout composer
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
  recordBundleComponentCancellation,
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
  /** The BUNDLE listing's cancellation policy at birth — what OC-B1's snapshot records (S11–S17). */
  policy?: string | null;
} = {}): Promise<string> {
  if (opts.policy !== undefined) {
    await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = ${opts.policy} WHERE id = ${ids.bundle}`);
  }
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

  // The failed component carries its refund; the delivered ones do not. LD 50 remainder (ledger
  // `2026-09-17-ld50-remainder-and-artifact-refund`): its STATUS is now `refunded` — stamped by the
  // promote in the SAME statement as the refund columns — and `failed_at` / `failure_reason` are what
  // keep WHO ended it and WHY on the row. Before this lane `refunded` had no writer at all.
  const rows = await readBundleComponentRows(db, id);
  const c = rows.find((x) => x.componentServiceId === ids.compC)!;
  assert.equal(c.status, "refunded");
  assert.ok(c.failedAt, "the seller's answer survives the settlement");
  assert.equal(c.failureReason, "venue closed");
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

test("S9 — FAILED vs CANCELLED: a `cancelled` row with NO pinned policy outcome refuses the flip AND the settlement (`cancel_terms_missing`); no Stripe call", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  // A `cancelled` row that NO writer of the rail produced: no `cancel_refund_percent`. Set it directly.
  await db.execute(sql`UPDATE booking_component_states SET status = 'cancelled', cancelled_at = NOW() WHERE booking_id = ${id} AND component_service_id = ${ids.compC}`);
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  // The parent derivation still reads cancelled as undelivered, but the D-35 mint cannot state the
  // seller's kept share without the pin — so the FLIP is refused and the parent stays `confirmed` for
  // a human (§13), rather than minting a guessed share.
  assert.equal(last.partiallyCompleted, false);
  assert.equal(last.reason, "component_prices_unknown");
  assert.equal((last.evidence as any).reducedFiguresRefused, "cancel_terms_missing");
  assert.equal((await readBooking(id)).status, "confirmed");
  assert.equal(calls.length, 0);
  assert.equal((await settlementRows(id)).length, 0);
  // The money leg, driven directly on a row someone forced to `partially_completed`, refuses by the SAME name.
  await db.execute(sql`UPDATE service_bookings SET status = ${PARTIALLY_COMPLETED_STATUS} WHERE id = ${id}`);
  const direct = await issueBundlePartialSettlement({ bookingId: id });
  assert.equal(direct.settled, false);
  assert.equal((direct as any).reason, "cancel_terms_missing");
  assert.equal((direct as any).detail, ids.compC);
  const swept = await sweepUnsettledBundlePartials({ onlyBookingIds: [id] });
  assert.equal(swept.refused.cancel_terms_missing, 1, "the sweep says so too, every night, and never guesses a tier");
  assert.equal(calls.length, 0);
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Locked Decision 50, SECOND HALF — the traveler-cancelled component.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const HOUR = 3600_000;
/** A scheduled start `hours` from now, as the checkout writes `booking_details.scheduledDate`. */
const startIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
async function componentRow(bookingId: string, componentServiceId: string) {
  return (await readBundleComponentRows(db, bookingId)).find((r) => r.componentServiceId === componentServiceId)!;
}
async function mintDescription(bookingId: string): Promise<string> {
  const r = await db.execute(sql`SELECT description FROM platform_revenue WHERE source_id = ${bookingId}`);
  return String((r.rows[0] as any)?.description ?? "");
}

test("S11 — the cancel is ONE flip under a concurrent double call, pins the policy outcome, and refuses a non-pending component, a non-traveler and an unknown component by name", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  const b = await readBooking(id);
  assert.ok(b.booking_details?.scheduledDate, "the fixture carries the deadline");
  const snap = await db.execute(sql`SELECT offering_contract_snapshot -> 'policy' ->> 'cancellationPolicyType' AS tier FROM service_bookings WHERE id = ${id}`);
  assert.equal((snap.rows[0] as any).tier, "flexible", "OC-B1 snapshotted the BUNDLE listing's policy at birth");

  // Two concurrent cancels of the same component: exactly ONE flip; the loser is handed the PINNED terms.
  const [x, y] = await Promise.all([
    recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler, reason: "  change of plans  " }),
    recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler, reason: "double click" }),
  ]);
  assert.ok(x.recorded && y.recorded, JSON.stringify([x, y]));
  const fresh = [x, y].filter((r) => r.recorded && !r.alreadyRecorded);
  const replay = [x, y].filter((r) => r.recorded && r.alreadyRecorded);
  assert.equal(fresh.length, 1, "one flip");
  assert.equal(replay.length, 1, "one replay");
  assert.deepEqual((replay[0] as any).terms, (fresh[0] as any).terms, "the replay states the PINNED terms, not a re-resolution");
  const t = (fresh[0] as any).terms;
  assert.equal(t.policyType, "flexible");
  assert.equal(t.policyDefaulted, false);
  assert.equal(t.refundPercent, 100);
  assert.equal(t.allocationCents, 2000);
  assert.equal(t.refundCents, 2000);
  assert.equal(t.retainedCents, 0);
  assert.ok(t.hoursUntilStart > 200 && t.hoursUntilStart <= 240);
  assert.equal(x.recorded && (x as any).partiallyCompleted, false, "A and B are still pending — nothing settles yet");
  assert.equal((x as any).settlement, null);
  assert.equal(calls.length, 0);

  // The row: status, instant, PIN and the traveler's words (trimmed) — written by the one UPDATE.
  const row = await componentRow(id, ids.compC);
  assert.equal(row.status, "cancelled");
  assert.ok(row.cancelledAt);
  assert.equal(row.cancelRefundPercent, 100);
  assert.ok(["change of plans", "double click"].includes(row.cancelReason ?? ""), "whichever caller won, its reason is stored verbatim (trimmed)");
  assert.equal(row.refundedAt, null, "nothing refunded until the bundle settles");

  // Refusals, by name. A delivered component cannot be cancelled …
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  const delivered = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compA, travelerUserId: ids.traveler });
  assert.equal(delivered.recorded, false);
  assert.equal((delivered as any).reason, "component_not_pending");
  assert.equal((delivered as any).currentStatus, "completed");
  // … the PROVIDER is not the traveler (the route turns this into an undifferentiated 404) …
  const notMine = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compB, travelerUserId: ids.provider });
  assert.equal(notMine.recorded, false);
  assert.equal((notMine as any).reason, "not_traveler");
  // … a service that is not one of the bundle's components …
  const unknown = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: "not-a-component", travelerUserId: ids.traveler });
  assert.equal((unknown as any).reason, "unknown_component");
  assert.equal((await componentRow(id, ids.compB)).status, "pending", "B is untouched by every refusal");

  // The route's body is a `.strict()` pick and reads no amount, percent or status (comments-stripped pin).
  const routes = code("server/routes.ts");
  const start = routes.indexOf("/api/bookings/:id/components/:componentServiceId/cancel");
  const handler = routes.slice(routes.lastIndexOf("const componentCancelBody", start), routes.indexOf("visa-status", start));
  assert.match(handler, /reason:\s*z\.string\(\)/);
  assert.match(handler, /\.strict\(\)/);
  assert.doesNotMatch(handler, /req\.body\.(amount|price|percent|refund|status|userId|travelerId)/);
  assert.match(handler, /travelerUserId:\s*userId/, "the principal is the SESSION user (§14)");
});

test("S12 — FLEXIBLE, cancelled before the deadline: 100% of the allocation + the same share of every fee; settles once", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(c.recorded);
  assert.equal(c.partiallyCompleted, true, "the cancel was the last answer outstanding");
  assert.equal(c.terms.refundPercent, 100);
  assert.ok(c.settlement && c.settlement.settled);
  assert.equal(c.settlement!.travelerRefundCents, 2300, "2000 allocation + 20% of 5.00 + 20% of 10.00 — the S2 amounts, by a different door");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 2300);
  assert.equal(calls[0].options.idempotencyKey, `bundle-settle-${id}`);
  const s = (await settlementRows(id))[0];
  assert.ok(s.settled_at);
  assert.equal(s.settled_amount_cents, 8000);
  assert.equal(s.seller_earning_cents, 6000);
  const outcomes = s.component_outcomes.components as any[];
  assert.deepEqual(outcomes.map((o) => [o.componentServiceId, o.outcome, o.refundCents, o.retainedCents, o.refundPercent]), [
    [ids.compA, "delivered", 0, 4000, null],
    [ids.compB, "delivered", 0, 4000, null],
    [ids.compC, "cancelled", 2000, 0, 100],
  ]);
  const row = await componentRow(id, ids.compC);
  // LD 50 remainder: the status says the MONEY IS SETTLED; `cancelled_at` and the pinned percent say the
  // traveler ended it and on what terms, so the two facts are still both on the row.
  assert.equal(row.status, "refunded");
  assert.ok(row.cancelledAt);
  assert.equal(row.cancelRefundPercent, 100);
  assert.equal(row.refundAmountCents, 2000);
  assert.ok(row.refundedAt);
  assert.equal(row.stripeRefundId, s.stripe_refund_id);
  const l = await ledger(id);
  assert.equal(l.providerEarnings[0].amount, "60.00");
  assert.equal(l.platformRevenue[0].platform_fee, "20.00");
  assert.doesNotMatch(await mintDescription(id), /retained/, "nothing was retained under a 100% policy — the basis does not claim otherwise");
  assert.equal((await readBooking(id)).status, PARTIALLY_COMPLETED_STATUS);
  // A retry converges.
  const again = await settleBundlePartially({ bookingId: id, actor: "traveler_bundle_component_cancel" });
  assert.equal((again.settlement as any).alreadySettled, true);
  assert.equal(calls.length, 1);
});

test("S13 — MODERATE, cancelled inside the 48h–120h window: 50% back; the seller keeps the rest, minted and NAMED", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler, reason: "can't make it" });
  assert.ok(c.recorded);
  assert.equal(c.terms.policyType, "moderate");
  assert.equal(c.terms.refundPercent, 50);
  assert.equal(c.terms.refundCents, 1000);
  assert.equal(c.terms.retainedCents, 1000);
  assert.equal(c.partiallyCompleted, true);
  assert.equal(c.settlement!.settled, true);
  // ONE Stripe refund: half the allocation + half of THIS component's share of the fees (10% of each).
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 1150, "1000 + 10% of 5.00 + 10% of 10.00");
  const s = (await settlementRows(id))[0];
  assert.equal(s.traveler_refund_cents, 1150);
  assert.equal(s.settled_amount_cents, 9000, "delivered 8000 + retained 1000");
  assert.equal(s.seller_earning_cents, 6750);
  assert.equal(s.platform_revenue_cents, 2250);
  assert.equal(s.component_outcomes.refundedFraction, 0.1);
  // The D-35 mint kept the retained half as delivered value and NAMED it.
  const l = await ledger(id);
  assert.equal(l.platformRevenue[0].gross_amount, "90.00");
  assert.equal(l.platformRevenue[0].platform_fee, "22.50", "the purchase-time commission × 0.9 — never re-resolved");
  assert.equal(l.providerEarnings[0].amount, "67.50");
  const desc = await mintDescription(id);
  assert.match(desc, /basis allocation/);
  assert.match(desc, /1 traveler-cancelled component\(s\) retained 1000 cents under the snapshotted cancellation policy/);
  // The component carries what was refunded — half. LD 50 remainder: its status is now `refunded` (the
  // money is settled), and `cancelled_at` + the pinned 50% are what still say WHO ended it and on what
  // terms. Before this lane `refunded` had no writer and a settled component read `cancelled` forever.
  const row = await componentRow(id, ids.compC);
  assert.equal(row.status, "refunded");
  assert.ok(row.cancelledAt);
  assert.equal(row.cancelRefundPercent, 50);
  assert.equal(row.cancelReason, "can't make it");
  assert.equal(row.refundAmountCents, 1000);
  assert.equal((await refundRows(id))[0].amount, "11.50");
});

test("S14 — STRICT, cancelled late: 0% back; the settlement records the outcome set with NO Stripe call and a NULL refund id; the seller minted the full figures", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "strict", details: { scheduledDate: startIn(24) } });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(c.recorded);
  assert.equal(c.terms.policyType, "strict");
  assert.equal(c.terms.refundPercent, 0);
  assert.equal(c.terms.refundCents, 0);
  assert.equal(c.terms.retainedCents, 2000);
  assert.equal(c.partiallyCompleted, true, "the component is still NOT delivered — the parent is partial, not complete");
  assert.ok(c.settlement && c.settlement.settled, JSON.stringify(c.settlement));
  assert.equal(c.settlement!.travelerRefundCents, 0);
  assert.equal(c.settlement!.stripeRefundId, null, "nothing was refunded, so no refund id is claimed");
  assert.equal(calls.length, 0, "NO Stripe call");
  const s = (await settlementRows(id))[0];
  assert.ok(s.settled_at, "promoted at once — the outcome set is the record");
  assert.equal(s.stripe_refund_id, null);
  assert.equal(s.traveler_refund_cents, 0);
  assert.equal(s.settled_amount_cents, 10000);
  assert.equal((await refundRows(id)).length, 0, "no refund audit row for a refund that did not happen");
  const row = await componentRow(id, ids.compC);
  assert.equal(row.status, "cancelled");
  assert.equal(row.cancelRefundPercent, 0);
  assert.equal(row.refundedAt, null, "a 0 refund is NOT stamped as refunded (§13)");
  assert.equal(row.refundAmountCents, null);
  const l = await ledger(id);
  assert.equal(l.platformRevenue[0].gross_amount, "100.00");
  assert.equal(l.providerEarnings[0].amount, "75.00");
  assert.match(await mintDescription(id), /retained 2000 cents/);
  assert.equal((await readBooking(id)).status, PARTIALLY_COMPLETED_STATUS, "never `completed` — one component was not delivered");
  // The sweep finds nothing to do; a retry converges; still no Stripe call.
  assert.equal((await sweepUnsettledBundlePartials({ onlyBookingIds: [id] })).scanned, 0);
  assert.equal(((await issueBundlePartialSettlement({ bookingId: id })) as any).alreadySettled, true);
  assert.equal(calls.length, 0);
});

test("S15 — MIXED: one component FAILED (full allocation) + one CANCELLED at 50% ⇒ ONE settlement, ONE Stripe call, the right sum", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  const f = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compB, actor, reason: "venue closed" });
  assert.equal(f.recorded, true);
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(c.recorded);
  assert.equal(c.partiallyCompleted, false, "A is still pending");
  assert.equal(calls.length, 0);
  const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  assert.equal(last.partiallyCompleted, true);
  assert.equal(last.settlement!.settled, true);
  // B's whole 4000 (nonperformance, no policy) + C's 1000 (50% under the policy) = 5000 ⇒ fees at 50%.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 5000 + 250 + 500);
  const s = (await settlementRows(id))[0];
  assert.equal(s.settled_amount_cents, 5000, "A's 4000 + C's retained 1000");
  assert.equal(s.seller_earning_cents, 3750);
  assert.equal(s.component_outcomes.refundedFraction, 0.5);
  const outcomes = s.component_outcomes.components as any[];
  assert.deepEqual(outcomes.map((o) => [o.componentServiceId, o.outcome, o.refundCents, o.refundPercent]), [
    [ids.compA, "delivered", 0, null],
    [ids.compB, "failed", 4000, null],
    [ids.compC, "cancelled", 1000, 50],
  ]);
  for (const [cid, cents] of [[ids.compB, 4000], [ids.compC, 1000]] as const) {
    const row = await componentRow(id, cid);
    assert.equal(row.refundAmountCents, cents);
    assert.equal(row.stripeRefundId, s.stripe_refund_id);
  }
  const l = await ledger(id);
  assert.equal(l.platformRevenue[0].gross_amount, "50.00");
  assert.equal(l.providerEarnings[0].amount, "37.50");
  assert.match(await mintDescription(id), /2 undelivered component\(s\) deducted; basis allocation; 1 traveler-cancelled component\(s\) retained 1000 cents/);
  assert.equal((await refundRows(id)).length, 1);
});

test("S16 — no purchase-time policy snapshot ⇒ the cancel is REFUSED by name, the component stays pending, nothing moves; the live listing is never read", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  // A booking committed without OC-B1's snapshot (pre-291, or a composition that failed and stamped nothing).
  await db.execute(sql`UPDATE service_bookings SET offering_contract_snapshot = NULL WHERE id = ${id}`);
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.equal(c.recorded, false);
  assert.equal((c as any).reason, "policy_snapshot_missing");
  const row = await componentRow(id, ids.compC);
  assert.equal(row.status, "pending");
  assert.equal(row.cancelledAt, null);
  assert.equal(row.cancelRefundPercent, null);
  assert.equal((await readBooking(id)).status, "confirmed");
  assert.equal(calls.length, 0);
  // The listing's LIVE policy is flexible and would have said 100% — and it is deliberately not consulted.
  assert.doesNotMatch(
    code("server/services/booking-completion.service.ts").slice(
      code("server/services/booking-completion.service.ts").indexOf("export async function recordBundleComponentCancellation"),
      code("server/services/booking-completion.service.ts").indexOf("export interface SettleBundlePartialResult"),
    ),
    /cancellationPolicyType|providerServices|quoteCancellationForBooking/,
    "the recorder reads the SNAPSHOT's terms only — never the live listing",
  );
  // A snapshot that recorded NO policy is a different fact: the listing declared none ⇒ the ONE
  // normalizer's stance (flexible, defaulted), exactly as a whole-row cancel of the same booking.
  const none = await bornBundleBooking({ policy: null, details: { scheduledDate: startIn(240) } });
  const d = await recordBundleComponentCancellation({ bookingId: none, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(d.recorded, JSON.stringify(d));
  assert.equal(d.terms.policyType, "flexible");
  assert.equal(d.terms.policyDefaulted, true);
  assert.equal(d.terms.refundPercent, 100);
  // A pre-307 row (no allocation) cannot be traveler-cancelled per component: nothing to apply a percent to.
  const legacy = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  await db.execute(sql`UPDATE booking_component_states SET allocation_cents = NULL WHERE booking_id = ${legacy}`);
  const e = await recordBundleComponentCancellation({ bookingId: legacy, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.equal(e.recorded, false);
  assert.equal((e as any).reason, "allocation_missing");
  assert.equal((await componentRow(legacy, ids.compC)).status, "pending");
});

test("S17 — HISTORICAL SNAPSHOT: a policy edit after purchase and a reschedule after the cancel move NOTHING", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240) } });
  // The seller tightens the listing to non-refundable AFTER the sale …
  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'non_refundable' WHERE id = ${ids.bundle}`);
  try {
    const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
    assert.ok(c.recorded);
    assert.equal(c.terms.policyType, "flexible", "… and the traveler is still under the policy they bought");
    assert.equal(c.terms.refundPercent, 100);
    // … then the booking is rescheduled to tomorrow AFTER the cancel (which would read 0% under flexible if re-resolved) …
    await db.execute(sql`
      UPDATE service_bookings
         SET booking_details = booking_details || ${JSON.stringify({ scheduledDate: startIn(1) })}::jsonb
       WHERE id = ${id}
    `);
    await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
    const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
    assert.equal(last.settlement!.settled, true);
    // … and the settlement reads the PIN, not the clock: the same 2300 the un-edited S12 refunded.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.amount, 2300);
    const s = (await settlementRows(id))[0];
    assert.equal(s.settled_amount_cents, 8000);
    assert.equal((s.component_outcomes.components as any[])[2].refundPercent, 100);
    assert.equal((await componentRow(id, ids.compC)).cancelRefundPercent, 100, "the pin never moved");
  } finally {
    await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = NULL WHERE id = ${ids.bundle}`);
  }
});

// ═══ LD 50 REMAINDER (ledger `2026-09-17-ld50-remainder-and-artifact-refund`) ═══════════════════

test("S18 — `refunded` finally has a WRITER: the promote stamps every refunded component in the SAME statement, exactly once, and a retry does NOT re-derive over it", async () => {
  stubSucceed();
  const id = await bornBundleBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  // One FAILED (full allocation) and one CANCELLED at 50% — the two shapes the promote stamps.
  await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compB, actor, reason: "guide ill" });
  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  const c = await recordBundleComponentCancellation({ bookingId: id, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(c.recorded && c.partiallyCompleted, JSON.stringify(c));
  assert.equal(calls.length, 1, "ONE Stripe refund");

  const b = await componentRow(id, ids.compB);
  const cc = await componentRow(id, ids.compC);
  const a = await componentRow(id, ids.compA);
  assert.equal(b.status, "refunded", "a failed component whose allocation came back is settled");
  assert.equal(cc.status, "refunded", "so is a cancelled one refunded at the pinned 50%");
  assert.equal(a.status, "completed", "a DELIVERED component is never stamped — nothing was refunded for it");
  assert.equal(a.refundedAt, null);
  // WHO ended each component, and why, survives the stamp — the two facts still both live on the row.
  assert.equal(b.failureReason, "guide ill");
  assert.ok(b.failedAt);
  assert.equal(b.cancelRefundPercent, null);
  assert.ok(cc.cancelledAt);
  assert.equal(cc.cancelRefundPercent, 50);
  assert.equal(b.refundAmountCents, 4000);
  assert.equal(cc.refundAmountCents, 1000);

  // A RETRY is answered from the SETTLED ROW, not from a re-derivation — which would now hit
  // `component_already_refunded` and turn a plain retry into a refusal.
  const again = await issueBundlePartialSettlement({ bookingId: id, actor: "retry" });
  assert.equal(again.settled, true, JSON.stringify(again));
  assert.equal((again as any).alreadySettled, true);
  assert.equal((again as any).stripeRefundId, (await settlementRows(id))[0].stripe_refund_id);
  assert.equal(calls.length, 1, "no second Stripe call");
  assert.equal((await refundRows(id)).length, 1, "no second audit row");

  // And the NIGHTLY SWEEP does not pick a promoted row back up.
  const swept = await sweepUnsettledBundlePartials({ onlyBookingIds: [id] });
  assert.equal(swept.scanned, 0, "a promoted settlement is not a sweep candidate");
  assert.equal(calls.length, 1);
});

test("S19 — the stamp is exactly-once under a concurrent promote, and a second promote (the webhook's redelivery) changes nothing", async () => {
  stubSucceed();
  const id = await bornBundleBooking();
  const last = await failCDeliverAB(id);
  assert.equal(last.partiallyCompleted, true);
  const settlement = (await settlementRows(id))[0];
  const stampedAt = (await componentRow(id, ids.compC)).refundedAt;
  assert.equal((await componentRow(id, ids.compC)).status, "refunded");

  // Two more promotes, concurrently, with a DIFFERENT refund id: `settled_at IS NULL` matches nothing,
  // so neither re-stamps and nothing about the component moves (§15c's one-promotion shape).
  const [p1, p2] = await Promise.all([
    promoteBundlePartialSettlement({ bookingId: id, stripeRefundId: "re_intruder_1" }),
    promoteBundlePartialSettlement({ bookingId: id, stripeRefundId: "re_intruder_2" }),
  ]);
  assert.equal(p1.promoted, false);
  assert.equal(p2.promoted, false);
  const after = await componentRow(id, ids.compC);
  assert.equal(after.status, "refunded");
  assert.equal(after.stripeRefundId, settlement.stripe_refund_id, "never re-pointed at another refund");
  assert.deepEqual(after.refundedAt, stampedAt, "the instant is the one the winning promote wrote");
  assert.equal(after.refundAmountCents, 2000);
  assert.equal((await refundRows(id)).length, 1);

  // The stamp and the refund columns are ONE statement, and the from-state is IN it (§18b) — pinned
  // comments-stripped, so a later "tidy-up" cannot split them into a second pass.
  const svc = code("server/services/bundle-partial-settlement.service.ts");
  const promote = svc.slice(svc.indexOf("export async function promoteBundlePartialSettlement"));
  assert.match(promote, /\.set\(\{[^}]*status:\s*BUNDLE_COMPONENT_STATUS\.refunded/s);
  assert.match(promote, /isNull\(bookingComponentStates\.refundedAt\)/);
  assert.match(promote, /inArray\(\s*bookingComponentStates\.status/s);
  assert.equal((promote.match(/\.update\(bookingComponentStates\)/g) ?? []).length, 1, "ONE component writer in the promote");
});

test("S20 — CAPACITY: a failed or cancelled component releases NOTHING and says so, and names what the BOOKING reserved instead", async () => {
  stubSucceed();
  // A slot-bound bundle: the checkout claims capacity PER CART LINE, and a bundle is ONE line.
  const slotId = `bps-${RUN}-slot`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${slotId}, ${ids.bundle}, ${ids.provider}, CURRENT_DATE + 30, '09:00', '17:00', 4, 3, 'available')
  `);
  const id = await bornBundleBooking({ details: { claimedSlotIds: [slotId], claimedSlotUnits: 3 } });
  await db.execute(sql`UPDATE service_bookings SET slot_id = ${slotId} WHERE id = ${id}`);

  const f = await recordBundleComponentFailure({ bookingId: id, componentServiceId: ids.compC, actor, reason: "venue closed" });
  assert.equal(f.recorded, true);
  const cap = (f as any).evidence.componentCapacity;
  assert.equal(cap.released, 0, "a component outcome releases no capacity");
  assert.equal(cap.reason, "no_component_capacity_reserved");
  assert.deepEqual(cap.bookingReservedSlotIds, [slotId], "what the BOOKING holds is NAMED, not silence (§13)");
  assert.equal(cap.bookingReservedUnitsPerSlot, 3, "read through the ONE decider, never restated");

  // The slot itself is untouched by the component outcome.
  const readSlot = async () =>
    (await db.execute(sql`SELECT booked_count, status FROM vendor_availability_slots WHERE id = ${slotId}`)).rows[0] as any;
  assert.equal(Number((await readSlot()).booked_count), 3);

  // A traveler's cancel states the same fact, and the settlement that follows releases nothing:
  // D-51 rules that a partial settlement "must not ... release all reserved capacity".
  const cancelId = await bornBundleBooking({ policy: "flexible", details: { scheduledDate: startIn(240), claimedSlotIds: [slotId], claimedSlotUnits: 3 } });
  await db.execute(sql`UPDATE service_bookings SET slot_id = ${slotId} WHERE id = ${cancelId}`);
  const cancelled = await recordBundleComponentCancellation({ bookingId: cancelId, componentServiceId: ids.compC, travelerUserId: ids.traveler });
  assert.ok(cancelled.recorded);
  assert.equal((cancelled as any).evidence.componentCapacity.released, 0);
  assert.equal((cancelled as any).evidence.componentCapacity.bookingReservedUnitsPerSlot, 3);

  await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compA, actor });
  const last = await recordBundleComponentCompletion({ bookingId: id, componentServiceId: ids.compB, actor });
  assert.equal(last.partiallyCompleted, true);
  assert.equal(Number((await readSlot()).booked_count), 3, "the partial settlement released no capacity");
  // The statement rides the two UNDELIVERED answers (failed above, cancelled below) — a DELIVERY has no
  // capacity question to answer, so the completion rail carries none.

  // AND THE REASON IT IS ZERO IS STRUCTURAL, not a gate: nothing reserves capacity per component.
  // `booking_component_states` has no slot column, and the purchase-time snapshot carries no slot —
  // pinned here so a later lane that adds one has to come back and read this rule (§13/§18c).
  const schema = code("shared/schema.ts");
  const table = schema.slice(
    schema.indexOf('pgTable("booking_component_states"'),
    schema.indexOf("export type BookingComponentState"),
  );
  assert.doesNotMatch(table, /slot/i, "no per-component slot record exists — so there is nothing to release");
  const composer = code("server/routes/payments.routes.ts");
  const setAt = composer.indexOf("bundleSnapshots.set(");
  assert.ok(setAt > 0, "the checkout composer still builds the component snapshot");
  assert.doesNotMatch(
    composer.slice(setAt, setAt + 600),
    /slotId/,
    "the component snapshot carries id, name and price — never a slot",
  );

  await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${slotId}`).catch(() => {});
});
