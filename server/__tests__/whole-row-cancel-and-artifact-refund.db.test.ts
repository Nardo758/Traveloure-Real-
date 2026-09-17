/**
 * OC-B1's LAST GAP, AND LD 46 / D-27's MONEY OUTCOME (ledger
 * `2026-09-17-ld50-remainder-and-artifact-refund`), against a real Postgres and a stubbed
 * `Stripe.refunds.create` (no network).
 *
 * PART B — THE WHOLE-ROW CANCEL QUOTES THE SNAPSHOT.
 *   B1  a policy EDIT on the listing after purchase moves NOTHING on the whole-row quote: the tier, the
 *       percent and the refund amount are the ones the booking was sold under, and the quote says which
 *       record answered (`policySource: 'purchase_snapshot'`)
 *   B2  a snapshot that recorded NO policy is a DIFFERENT fact from no snapshot at all: it defaults to
 *       flexible through the ONE normalizer and is still `purchase_snapshot`
 *   B3  a row with NO snapshot (pre-291) falls back to the LIVE listing EXPLICITLY — named on the quote,
 *       announced in the log, never silent (§13)
 *   B4  the refund AMOUNT is the pinned percent of what the traveler was CHARGED, server-derived; the
 *       component-cancel rail and the whole-row quote resolve the SAME tier at the SAME instant through
 *       the SAME parse (§18 rule 1 — one policy resolver, and there is exactly one structural read)
 *
 * PART C — THE REFUND ON A REJECTED ARTIFACT.
 *   C1  a rejection ALONE moves no money: the D-27 escalation writes `disputed` and makes no Stripe call,
 *       no `refunds` row, no reversal — and the module that owns rejection touches no refund rail
 *   C2  the admin outcome: ONE Stripe refund of the full traveler charge under
 *       `artifact-reject-refund-<id>`, ONE `refunds` audit row, the booking AND its components moved to
 *       `refunded` in the claiming transaction, the ledger reversed
 *   C3  two concurrent resolutions ⇒ ONE refund, one audit row; the loser is refused by name
 *   C4  a retry after the resolution ⇒ `alreadyRefunded`, ZERO new Stripe calls, no second audit row
 *   C5  the from-states REFUSE: a `confirmed` (unresolved) booking and a booking with no PaymentIntent are
 *       both refused by name and nothing moves
 *   C6  THE SELLER IS NEVER PAID: the completion mint cannot fire for the refunded row — every from-state
 *       list that reaches a mint excludes `refunded`, and a completion attempt afterwards changes nothing
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
  quoteCancellationForBooking,
  resolveBookingCancellationPolicy,
  resolveSnapshottedCancellationTerms,
} from "../services/cancellation-policy.service";
import { refundRejectedArtifact } from "../services/artifact-rejection-refund.service";
import { completeBooking } from "../services/booking-completion.service";
import { readBundleComponentRows } from "../services/bundle-component-states.service";
import {
  advanceArtifactAcceptance,
  findArtifactAcceptanceCandidates,
} from "../services/artifact-acceptance-timer.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `arr-${RUN}-prov`,
  traveler: `arr-${RUN}-trav`,
  artifact: `arr-${RUN}-pdf`,
  bundle: `arr-${RUN}-bundle`,
  compA: `arr-${RUN}-a`,
  compB: `arr-${RUN}-b`,
};
const createdBookingIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const code = (rel: string) =>
  fs
    .readFileSync(path.join(REPO_ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── Disposable-DB guard (the bundle suites' shape; never defaults open) ─────────────────────────
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
      `[artifact-rejection-refund] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Stripe stub on the shared prototype (every `new Stripe()` shares it) ────────────────────────
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
afterEach(() => {
  refundsProto.create = originalCreate;
});

const HOUR = 3600_000;
const startIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/**
 * A booking on the ARTIFACT listing, priced 100.00 (fee 25.00 / earnings 75.00), charged under A3 with a
 * 5.00 concierge fee and a 10.00 traveler service fee, with a PaymentIntent (stamped by SQL — the
 * composer strips it, §19a).
 */
async function bornBooking(opts: {
  serviceId?: string;
  status?: string;
  policy?: string | null;
  paymentIntent?: string | null;
  details?: Record<string, unknown>;
  snapshot?: unknown[];
} = {}): Promise<string> {
  const serviceId = opts.serviceId ?? ids.artifact;
  if (opts.policy !== undefined) {
    await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = ${opts.policy} WHERE id = ${serviceId}`);
  }
  const booking = await storage.createServiceBooking({
    serviceId,
    travelerId: ids.traveler,
    providerId: ids.provider,
    status: opts.status ?? "confirmed",
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    bookingDetails: {
      travelerCharge: { conciergeFee: "5.00" },
      travelerServiceFee: { charged: 10, waived: false },
      ...(opts.snapshot ? { bundleComponents: opts.snapshot } : {}),
      ...(opts.details ?? {}),
    },
  } as any);
  createdBookingIds.push(booking.id);
  const pi = opts.paymentIntent === undefined ? `pi_${RUN}_${booking.id.slice(0, 8)}` : opts.paymentIntent;
  await db.execute(sql`
    UPDATE service_bookings SET stripe_payment_intent_id = ${pi}, confirmed_at = NOW() - interval '30 days'
     WHERE id = ${booking.id}
  `);
  return booking.id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completed_at, cancelled_at, cancellation_reason, booking_details, booking_metadata
      FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}
async function refundRows(bookingId: string): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM refunds WHERE booking_id = ${bookingId} ORDER BY created_at`);
  return r.rows as any[];
}
async function ledger(bookingId: string) {
  const pe = await db.execute(sql`SELECT amount, status FROM provider_earnings WHERE source_id = ${bookingId}`);
  const pr = await db.execute(sql`SELECT gross_amount, status FROM platform_revenue WHERE source_id = ${bookingId}`);
  return { providerEarnings: pe.rows as any[], platformRevenue: pr.rows as any[] };
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`arr-${RUN}-prov@t.test`}, 'Arr', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`arr-${RUN}-trav@t.test`}, 'Arr', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, cancellation_policy_type)
    VALUES (${ids.artifact}, ${ids.provider}, ${`Arr artifact ${RUN}`}, 'fixture artifact', '100.00', 'active',
            'approved', 'pdf', 'moderate')
  `);
  for (const c of [ids.compA, ids.compB]) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                     approval_status, delivery_method)
      VALUES (${c}, ${ids.provider}, ${`Arr comp ${c}`}, 'fixture component', '50.00', 'active',
              'approved', 'in_person')
    `);
  }
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, product_shape, cancellation_policy_type)
    VALUES (${ids.bundle}, ${ids.provider}, ${`Arr bundle ${RUN}`}, 'fixture bundle', '100.00', 'active',
            'approved', 'in_person', 'bundle', 'moderate')
  `);
  for (const [i, c] of [ids.compA, ids.compB].entries()) {
    await db.execute(sql`
      INSERT INTO bundle_components (id, bundle_service_id, component_service_id, position)
      VALUES (${`arr-${RUN}-bc-${i}`}, ${ids.bundle}, ${c}, ${i})
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
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${ids.bundle}`).catch(() => {});
  for (const svc of [ids.artifact, ids.bundle, ids.compA, ids.compB]) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
  await db.execute(sql`DELETE FROM daily_revenue_summary WHERE date = CURRENT_DATE::text AND transaction_count = 0`).catch(() => {});
});

// ═══ PART B — THE WHOLE-ROW CANCEL QUOTES THE SNAPSHOT ══════════════════════════════════════════

test("B1 — a policy EDIT after purchase moves NOTHING on the whole-row quote; the quote names the record that answered", async () => {
  // Sold under MODERATE, 72h out ⇒ the 48h–120h tier, 50%.
  const id = await bornBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  const snap = await db.execute(sql`SELECT offering_contract_snapshot -> 'policy' ->> 'cancellationPolicyType' AS tier FROM service_bookings WHERE id = ${id}`);
  assert.equal((snap.rows[0] as any).tier, "moderate", "OC-B1 snapshotted the listing's policy at birth");

  const before = (await quoteCancellationForBooking(id))!;
  assert.equal(before.policyType, "moderate");
  assert.equal(before.policySource, "purchase_snapshot");
  assert.equal(before.refundPercent, 50);

  // The seller now tightens the listing to non_refundable. On `main` this moved the traveler's quote
  // from 50% to 0% — the retroactive tightening the snapshot exists to stop.
  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'non_refundable' WHERE id = ${ids.artifact}`);
  const after = (await quoteCancellationForBooking(id))!;
  assert.equal(after.policyType, "moderate", "the tier is the one the booking was SOLD under");
  assert.equal(after.policySource, "purchase_snapshot");
  assert.equal(after.refundPercent, 50);
  assert.equal(after.automaticRefundAllowed, true, "a later non_refundable edit cannot retroactively refuse the refund");
  assert.equal(after.refundAmount, before.refundAmount);

  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'moderate' WHERE id = ${ids.artifact}`);
});

test("B2 — a snapshot that recorded NO policy is a different fact from no snapshot: it defaults through the ONE normalizer and is still the snapshot's answer", async () => {
  const id = await bornBooking({ policy: null, details: { scheduledDate: startIn(72) } });
  const snapRow = await db.execute(sql`SELECT offering_contract_snapshot -> 'policy' AS policy FROM service_bookings WHERE id = ${id}`);
  assert.deepEqual((snapRow.rows[0] as any).policy, { cancellationPolicyType: null }, "the key is PRESENT and null");

  // The listing is edited to strict afterwards — irrelevant, because the snapshot answered.
  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'strict' WHERE id = ${ids.artifact}`);
  const q = (await quoteCancellationForBooking(id))!;
  assert.equal(q.policySource, "purchase_snapshot");
  assert.equal(q.policyType, "flexible", "the listing declared none at purchase ⇒ the normalizer's flexible");
  assert.equal(q.policyDefaulted, true, "and it says it defaulted — never presented as a chosen tier (§13)");
  assert.equal(q.refundPercent, 100);

  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'moderate' WHERE id = ${ids.artifact}`);
});

test("B3 — a pre-291 row with NO snapshot falls back to the LIVE listing EXPLICITLY, and the quote SAYS so", async () => {
  const id = await bornBooking({ policy: "moderate", details: { scheduledDate: startIn(72) } });
  await db.execute(sql`UPDATE service_bookings SET offering_contract_snapshot = NULL WHERE id = ${id}`);

  const q = (await quoteCancellationForBooking(id))!;
  assert.equal(q.policySource, "live_listing", "the fallback is NAMED on the response, never silent");
  assert.equal(q.policyType, "moderate");
  assert.equal(q.refundPercent, 50);

  // A live edit DOES move a fallback quote — that is the honest behaviour for a row whose terms were
  // never recorded, and it is exactly why the source is stated rather than assumed.
  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'flexible' WHERE id = ${ids.artifact}`);
  const q2 = (await quoteCancellationForBooking(id))!;
  assert.equal(q2.policySource, "live_listing");
  assert.equal(q2.policyType, "flexible");
  await db.execute(sql`UPDATE provider_services SET cancellation_policy_type = 'moderate' WHERE id = ${ids.artifact}`);

  // And the fallback announces itself (§13) — the resolver logs a notice rather than answering quietly.
  const svc = code("server/services/cancellation-policy.service.ts");
  const resolver = svc.slice(svc.indexOf("export function resolveBookingCancellationPolicy"));
  assert.match(resolver, /logger\.info\(/, "the live-listing fallback is logged, never silent");
});

test("B4 — ONE policy resolver: the whole-row quote and the component-cancel rail read the SAME pinned tier through the SAME structural parse", async () => {
  const id = await bornBooking({ policy: "strict", details: { scheduledDate: startIn(240) } });
  const row = await db.execute(sql`SELECT offering_contract_snapshot, booking_details ->> 'scheduledDate' AS d FROM service_bookings WHERE id = ${id}`);
  const r = row.rows[0] as any;

  const whole = (await quoteCancellationForBooking(id))!;
  const component = resolveSnapshottedCancellationTerms({
    offeringContractSnapshot: r.offering_contract_snapshot,
    scheduledDate: r.d,
    now: new Date(),
  });
  assert.ok(component.ok);
  assert.equal(whole.policyType, component.policyType, "the same tier by either door");
  assert.equal(whole.refundPercent, component.refundPercent, "strict ≥7 days ⇒ 50% on BOTH rails");

  // The AMOUNT is the percent of what the traveler was CHARGED — price + concierge + traveler fee
  // (105.00 + 10.00 under A3), server-derived through the ONE composition. 50% of 115.00.
  // The quote's basis is `travelerChargeForRow`'s composition — price + concierge (105.00). The traveler
  // SERVICE FEE rides the refund separately, at the same tier %, in `refundServiceBooking` (ruling
  // `2026-09-02-traveler-fee-refundability`), which is why it is not in this number.
  assert.equal(whole.totalAmount, 105);
  assert.equal(whole.refundAmount, 52.5);

  // §18 rule 1: exactly ONE structural read of the snapshot's policy in the module, and the whole-row
  // resolver delegates to it (pinned comments-stripped, so a second parse cannot appear quietly).
  const svc = code("server/services/cancellation-policy.service.ts");
  assert.equal(
    (svc.match(/cancellationPolicyType['"]\s*in\s*\(policy as object\)/g) ?? []).length,
    1,
    "one structural parse of the snapshot policy, shared by both rails",
  );
  assert.match(svc.slice(svc.indexOf("export function resolveBookingCancellationPolicy")), /readSnapshotPolicyType\(/);
  assert.match(svc.slice(svc.indexOf("export function resolveSnapshottedCancellationTerms")), /readSnapshotPolicyType\(/);
  // And the pure resolver takes no amount and no identity from anywhere but its arguments (§14).
  assert.deepEqual(
    resolveBookingCancellationPolicy({ offeringContractSnapshot: null, liveListingPolicyType: "strict" }),
    { policyType: "strict", source: "live_listing" },
  );
  assert.deepEqual(
    resolveBookingCancellationPolicy({ offeringContractSnapshot: { policy: { cancellationPolicyType: "flexible" } }, liveListingPolicyType: "strict" }),
    { policyType: "flexible", source: "purchase_snapshot" },
  );
});

// ═══ PART C — THE REFUND ON A REJECTED ARTIFACT ════════════════════════════════════════════════

test("C1 — a rejection ALONE moves no money: the D-27 escalation writes `disputed` and touches no refund rail", async () => {
  stubSucceed();
  const id = await bornBooking({ status: "awaiting_acceptance", details: { deliveredAt: new Date(Date.now() - 40 * 24 * HOUR).toISOString() } });
  await db.execute(sql`UPDATE service_bookings SET delivered_at = NOW() - interval '40 days' WHERE id = ${id}`);

  // Driven on THIS booking only — the same candidate row and the same transition the nightly pass takes.
  const candidates = await findArtifactAcceptanceCandidates(new Date());
  const mine = candidates.find((c) => c.id === id);
  assert.ok(mine, "the delivered, unanswered artifact booking is a candidate");
  const outcome = await advanceArtifactAcceptance({ booking: mine!, now: new Date(), verifyPi: async () => true });
  assert.equal(outcome.moved, true, JSON.stringify(outcome));
  assert.equal((outcome as any).to, "disputed");
  const b = await readBooking(id);
  assert.equal(b.status, "disputed", "the rejection ESCALATES into the existing admin queue");
  assert.equal(b.booking_metadata?.systemDisputeReason, "acceptance_window_elapsed");
  assert.equal(calls.length, 0, "no Stripe call anywhere on the rejection path");
  assert.equal((await refundRows(id)).length, 0, "no refund audit row");
  const l = await ledger(id);
  assert.equal(l.providerEarnings.length, 0, "nothing was minted, so nothing was reversed");

  // And the acceptance module says so structurally: it imports no refund rail and calls none.
  const acc = code("server/services/booking-acceptance.service.ts");
  assert.doesNotMatch(acc, /refundServiceBooking|refundRejectedArtifact|refunds\.create|stripePaymentService/);
  const timer = code("server/services/artifact-acceptance-timer.service.ts");
  assert.doesNotMatch(timer, /refundServiceBooking|refundRejectedArtifact|refunds\.create/);
});

test("C2 — the ADMIN outcome: ONE Stripe refund of the full charge under `artifact-reject-refund-<id>`, ONE audit row, booking AND components moved to `refunded`, ledger reversed", async () => {
  stubSucceed();
  const id = await bornBooking({
    serviceId: ids.bundle,
    status: "disputed",
    snapshot: [
      { id: ids.compA, serviceName: "A", priceCents: 5000 },
      { id: ids.compB, serviceName: "B", priceCents: 5000 },
    ],
  });
  // A minted earning to prove the reversal runs (the escrow shape a completed-then-disputed row carries).
  await db.execute(sql`
    INSERT INTO provider_earnings (id, provider_id, type, source_type, source_id, amount, status)
    VALUES (${`arr-${RUN}-pe-${id.slice(0, 6)}`}, ${ids.provider}, 'booking', 'booking', ${id}, '75.00', 'held')
  `);

  const out = await refundRejectedArtifact({ bookingId: id, actorUserId: "admin-fixture" });
  assert.equal(out.refunded, true, JSON.stringify(out));
  assert.equal((out as any).alreadyRefunded, false);
  assert.ok((out as any).stripeRefundId, "§13 — `refunded: true` only with a refund id in hand");

  // The amount is the FULL traveler charge, server-derived: 100.00 + 5.00 concierge + 10.00 fee.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.amount, 11500);
  assert.equal(calls[0].options.idempotencyKey, `artifact-reject-refund-${id}`);
  assert.equal(calls[0].params.metadata.source, "artifact_rejection_refund");
  assert.equal((out as any).amountCents, 11500);
  assert.equal((out as any).travelerServiceFeeRefundCents, 1000);

  const r = await refundRows(id);
  assert.equal(r.length, 1, "ONE audit row through the ONE recorder");
  assert.equal(r[0].amount, "115.00");
  assert.equal(r[0].reason, "artifact_rejected_resolved_for_traveler");
  assert.equal(r[0].stripe_refund_id, (out as any).stripeRefundId);

  const b = await readBooking(id);
  assert.equal(b.status, "refunded");
  assert.ok(b.cancelled_at);
  assert.match(String(b.cancellation_reason), /^artifact_rejected:admin-fixture$/);

  const comps = await readBundleComponentRows(db, id);
  assert.equal(comps.length, 2);
  assert.equal((out as any).componentsRefunded, 2);
  for (const c of comps) {
    assert.equal(c.status, "refunded", "the whole allocation came back, so every component is settled");
    assert.ok(c.refundedAt);
  }

  const l = await ledger(id);
  assert.equal(l.providerEarnings[0].status, "reversed", "the seller's held earning is reversed");
  assert.equal((out as any).reversedEarnings, 1);
});

test("C3 — two concurrent resolutions ⇒ ONE refund and ONE audit row; the loser is refused by name", async () => {
  stubSucceed();
  const id = await bornBooking({ status: "disputed" });
  const [x, y] = await Promise.all([
    refundRejectedArtifact({ bookingId: id, actorUserId: "admin-a" }),
    refundRejectedArtifact({ bookingId: id, actorUserId: "admin-b" }),
  ]);
  const won = [x, y].filter((o) => o.refunded && !(o as any).alreadyRefunded);
  const lost = [x, y].filter((o) => !o.refunded || (o as any).alreadyRefunded);
  assert.equal(won.length, 1, `exactly one resolution moved the row: ${JSON.stringify([x, y])}`);
  assert.equal(lost.length, 1);
  const loser = lost[0] as any;
  if (loser.refunded) {
    assert.equal(loser.alreadyRefunded, true, "the loser saw the row already refunded");
  } else {
    assert.equal(loser.reason, "wrong_status", "or was refused by the from-state, with the state stated");
  }
  assert.equal(calls.length, 1, "ONE Stripe call");
  assert.equal((await refundRows(id)).length, 1, "ONE audit row");
  assert.equal((await readBooking(id)).status, "refunded");
});

test("C4 — a retry after the resolution is `alreadyRefunded`: zero new Stripe calls, no second audit row", async () => {
  stubSucceed();
  const id = await bornBooking({ status: "disputed" });
  const first = await refundRejectedArtifact({ bookingId: id, actorUserId: "admin-fixture" });
  assert.equal(first.refunded, true);
  assert.equal(calls.length, 1);

  const again = await refundRejectedArtifact({ bookingId: id, actorUserId: "admin-fixture" });
  assert.equal(again.refunded, true);
  assert.equal((again as any).alreadyRefunded, true);
  assert.equal((again as any).stripeRefundId, null, "this call issued none, so it claims none (§13)");
  assert.equal(calls.length, 1, "no second Stripe call");
  assert.equal((await refundRows(id)).length, 1, "no second audit row");
});

test("C5 — the from-state and custody REFUSE by name, and nothing moves", async () => {
  stubSucceed();
  // A booking no dispute ever reached.
  const confirmed = await bornBooking({ status: "confirmed" });
  const a = await refundRejectedArtifact({ bookingId: confirmed, actorUserId: "admin-fixture" });
  assert.equal(a.refunded, false);
  assert.equal((a as any).reason, "wrong_status");
  assert.equal((a as any).currentStatus, "confirmed");
  assert.equal((await readBooking(confirmed)).status, "confirmed");

  // A disputed booking with NO PaymentIntent — custody UNKNOWN, refused rather than assumed.
  const noPi = await bornBooking({ status: "disputed", paymentIntent: null });
  const c = await refundRejectedArtifact({ bookingId: noPi, actorUserId: "admin-fixture" });
  assert.equal(c.refunded, false);
  assert.equal((c as any).reason, "no_payment_intent");
  assert.equal((await readBooking(noPi)).status, "disputed", "the row is left where the dispute put it");

  const missing = await refundRejectedArtifact({ bookingId: `arr-${RUN}-nope`, actorUserId: "admin-fixture" });
  assert.equal((missing as any).reason, "booking_not_found");
  assert.equal(calls.length, 0, "no Stripe call on any refusal");
  assert.equal((await refundRows(confirmed)).length, 0);
});

test("C6 — THE SELLER IS NEVER PAID: no mint can fire for a refunded row, and every mint from-state excludes `refunded`", async () => {
  stubSucceed();
  const id = await bornBooking({ status: "disputed" });
  const out = await refundRejectedArtifact({ bookingId: id, actorUserId: "admin-fixture" });
  assert.equal(out.refunded, true);
  assert.equal((await ledger(id)).providerEarnings.length, 0, "nothing was minted before, and nothing after");

  // A completion attempt afterwards changes nothing: the flip's from-state list refuses the row.
  const attempt = await completeBooking({ bookingId: id, actor: "traveler_accepted" as any });
  assert.equal(attempt.completed, false, JSON.stringify(attempt));
  assert.equal((await readBooking(id)).status, "refunded");
  assert.equal((await ledger(id)).providerEarnings.length, 0);

  // STRUCTURAL, not incidental: the mint runs only inside `updateServiceBookingStatus` for `completed` /
  // `partially_completed`, and no from-state list that reaches either admits `refunded`.
  const st = code("server/storage.ts");
  assert.match(st, /if \(status === "completed" \|\| status === PARTIALLY_COMPLETED_STATUS\) \{\s*await this\.mintCompletionEarningsForBooking/);
  const fromStates = code("server/utils/booking-from-states.ts");
  for (const listName of [
    "COMPLETION_DECLARABLE_FROM_STATUSES",
    "DECLARED_WINDOW_CLOSE_FROM_STATUSES",
    "TRAVELER_CONFIRMABLE_FROM_STATUSES",
    "ACCEPTANCE_FROM_STATUSES",
    "PARTIAL_COMPLETION_FROM_STATUSES",
    "DISPUTE_REJECT_FROM_STATUSES",
  ]) {
    const decl = fromStates.slice(fromStates.indexOf(`export const ${listName}`));
    const list = decl.slice(0, decl.indexOf(";"));
    assert.doesNotMatch(list, /"refunded"/, `${listName} must never admit a refunded row into a mint`);
  }
  // The rail itself takes no amount or identity from a body, and the Stripe site count is unchanged.
  const svc = code("server/services/artifact-rejection-refund.service.ts");
  assert.doesNotMatch(svc, /req\.body|req\.query|req\.params/);
  assert.doesNotMatch(svc, /refunds\.create/);
  assert.match(svc, /travelerChargeForRow\(/, "the amount is composed from the ROW through the ONE composition");
});
