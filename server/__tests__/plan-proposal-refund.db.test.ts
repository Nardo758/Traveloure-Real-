/**
 * plan-proposal-refund.db.test.ts — D-50's RE-VALIDATION IS PROVEN, AND A PAID, REFUSED APPLY IS
 * REFUNDED EXACTLY ONCE.
 *
 * (review fixes on the L16 lane-1 create rail; decision-maker ruling 2026-09-16 OPTION B — refund
 *  the fee on a refused apply — WIDENED 2026-09-17 to every refusal of a PAID proposal, with the
 *  audit `reason` recording the refusal rather than the call; ledger
 *  `2026-09-16-l16-lane1-review-fixes`. R9/R10 add ledger `2026-09-19-proposal-refund-race-reason`
 *  — a caller that loses the race to a concurrent refund claim is told `refunded`, never
 *  `not_applicable`. CLAUDE.md Locked Decision 45 (3),
 *  Locked Decision 41 (a), §8, §13, §14, §15, §15b, §18 rule 1.)
 *
 *   R1  A STALE proposal is refused by PAY before the claim: 409 `stale_catalog_price`,
 *       `charge_claimed_at IS NULL`, `stripe_payment_intent_id IS NULL` — no Stripe call.
 *   R2  A STALE proposal on a Trip-Pass-covered plan is refused by APPLY: 409, the plan's items are
 *       untouched, the row stays `proposed`, and there is NO `refund` block — nothing was charged,
 *       and an absent block is that truth, not a refund of nothing (§13).
 *   R3  THE RE-VALIDATION IS BY ID (review finding 1): with 101 live decoy listings inserted BEFORE
 *       the named one in the same destination, the named listing is still found live and the apply
 *       lands; a PAUSED named listing is refused `listing_unavailable` naming it, items untouched.
 *       (The first cut checked membership in a `.limit(100)` page with no `ORDER BY`.)
 *   R4  PAID + STALE ⇒ APPLY 409 `stale_catalog_price` WITH `refund.issued = true`: ONE
 *       `refunds.create`, under `ai-task-refund-<proposalId>`, for the PaymentIntent's own amount;
 *       the row flips to `refunded` carrying that amount and basis `paid`; ONE `refunds` audit row
 *       (`booking_id` NULL) naming the refusal; items untouched.
 *   R5  A RETRY of the refunded proposal is 409 `refunded` with the SAME refund id and NO second
 *       Stripe call; discard and pay are closed on the terminal row.
 *   R6  TWO CONCURRENT applies of a paid+stale proposal produce ONE refund (§15b — the claim is the
 *       status flip, one statement).
 *   R7  A FAILED Stripe call leaves the CLAIM (row `refunded`), answers `pending`, and the retry
 *       re-drives the SAME key, succeeds, and records once. Never a compensating rollback. Its
 *       audit row records an UNKNOWABLE prior refusal as exactly that (ruling 2026-09-17) — never
 *       `retry`, which named the call and not the reason, and never a re-derived guess (§13).
 *   R8  PAID + PROTECTED WORK (LD 42 D3) ⇒ APPLY 409 `protected_item` WITH `refund.issued = true`
 *       (ruling 2026-09-17, OPTION B widened to EVERY apply refusal of a paid proposal). Before it,
 *       such a row was STUCK: unappliable for good, and undiscardable because discard refuses a row
 *       carrying a PaymentIntent. ONE Stripe call on the SAME shared path under the SAME key, the
 *       audit row names `protected_item`, the plan is untouched, and the retry adds no Stripe call.
 *   R9  TWO CONCURRENT applies, forced DETERMINISTICALLY (ledger
 *       `2026-09-19-proposal-refund-race-reason`): caller B's OWN internal status read is made to
 *       land AFTER caller A's refund claim has fully committed, via the test-only
 *       `deps.beforeStatusRead` seam on `applyPlanProposal`. Before the fix, B's internal check saw
 *       the row already `refunded` and, seeing anything other than `proposed`, reported the generic
 *       `not_applicable` — a true-sounding but wrong answer (§13): the row's fee WAS already
 *       refunded, B just did not say so. B now throws `ProposalApplyRefused("refunded", …)`, and
 *       the SAME shared refund-lookup path (`refusal: null`, exactly what the route's new
 *       concurrent-loser branch calls) reports the SAME refund with NO second Stripe call. Money
 *       safety was never at risk — this fixes the LOSING caller's response honesty.
 *   R10 `not_applicable` still covers every OTHER terminal state — applied, discarded — so the R9
 *       carve-out is exactly one code, not a general softening of the guard.
 *
 * ── HOW STRIPE IS HANDLED, STATED (§18d) ─────────────────────────────────────────────────────
 * `paymentIntents.retrieve` and `refunds.create` are stubbed on the shared Stripe prototype (the
 * bundle-settlement precedent). The refund stub EMULATES Stripe's idempotency — the same key
 * returns the same refund object — because that is the property the design leans on and the
 * property R6 asserts; a stub that minted a fresh id per call would make R6 prove nothing. NO
 * network is touched. The verification leg's own semantics are proven one layer up in
 * `proposal-apply-authorization.test.ts`.
 *
 * NO FEE LITERALS (§8): every amount here is `resolveAiTaskChargeCents()` — the band's own value —
 * and the assertions are EQUALITIES against it.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 DATABASE_URL=... npx tsx --test --test-concurrency=1 \
 *     server/__tests__/plan-proposal-refund.db.test.ts
 */
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import {
  PLAN_PROPOSAL_STATUS_PROPOSED,
  PLAN_PROPOSAL_STATUS_REFUNDED,
  PLAN_PROPOSAL_CHARGE_BASIS_PAID,
  planProposalRefundIdempotencyKey,
  planProposalRefundReason,
  PLAN_PROPOSAL_REFUND_UNKNOWN_REFUSAL,
  type PlanProposalChangeSet,
} from "@shared/plan-proposals";
import { createPlanProposal, discardPlanProposal } from "../services/plan-proposals.service";
import {
  PROPOSAL_PAYMENT_METADATA_TYPE,
  claimProposalCharge,
  resolveAiTaskChargeCents,
  stampProposalPaymentIntent,
  applyPlanProposal,
  ProposalApplyRefused,
  refundRefusedProposalCharge,
  type ProposalRefundOutcome,
} from "../services/proposal-charge.service";
import { AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR } from "../config/proposal-staleness.config";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);

// ── Disposable-DB guard (the plan-proposals shape; never defaults open) ──────────────────────────
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
      `[plan-proposal-refund] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// The destination is unique to this run so the liveness predicate's `location ILIKE` scope sees
// exactly the listings this file seeds and nothing another suite left behind.
const DESTINATION = `Kyoto-${RUN}`;
const ids = {
  owner: `ppr-${RUN}-owner`,
  covered: `ppr-${RUN}-covered`,
  paid: `ppr-${RUN}-paid`,
  listing: `ppr-${RUN}-listing`,
};

// ── Stripe stubs on the shared prototypes (every `new Stripe()` shares them) ─────────────────────
const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const intentsProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalIntentRetrieve = intentsProto.retrieve;

/** PaymentIntents this file "charged": id → the proposal it is bound to, and Stripe's amount. */
const intents = new Map<string, { proposalId: string; amount: number }>();
intentsProto.retrieve = async (id: string) => {
  const bound = intents.get(id);
  if (!bound) throw new Error(`No such PaymentIntent (stub): ${id}`);
  return {
    id,
    status: "succeeded",
    amount: bound.amount,
    currency: "usd",
    // The server-written binding `verifyProposalPayment` checks — the constant, never a literal.
    metadata: { type: PROPOSAL_PAYMENT_METADATA_TYPE, proposalId: bound.proposalId },
  };
};

type RefundCall = { params: any; options: any };
let refundCalls: RefundCall[] = [];
/** Emulated Stripe idempotency: the same key returns the SAME refund. */
const refundsByKey = new Map<string, any>();
let failNextRefunds = 0;
refundsProto.create = async (params: any, options: any) => {
  refundCalls.push({ params, options });
  if (failNextRefunds > 0) {
    failNextRefunds -= 1;
    throw new Error("stripe_down (stub)");
  }
  const key: string | undefined = options?.idempotencyKey;
  if (key && refundsByKey.has(key)) return refundsByKey.get(key);
  const refund = {
    id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`,
    status: "succeeded",
    amount: params.amount,
    metadata: params.metadata,
  };
  if (key) refundsByKey.set(key, refund);
  return refund;
};
afterEach(() => {
  refundCalls = [];
  failNextRefunds = 0;
});

// ── Harness ──────────────────────────────────────────────────────────────────────────────────────
async function asUser<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const post = (base: string, path: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
const applyAs = (base: string, tripId: string, proposalId: string) =>
  post(base, `/api/trips/${tripId}/proposals/${proposalId}/apply`);

async function seedTrip(id: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${ids.owner}, ${`PPR ${RUN}`}, '2030-01-01', '2030-01-05', ${DESTINATION})
  `);
}

async function seedListing(id: string, status: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, location, status, approval_status)
    VALUES (${id}, ${ids.owner}, ${`Listing ${id}`}, ${`${DESTINATION}, Japan`}, ${status}, 'approved')
  `);
}

/** A proposal naming the run's listing — the shape whose price CAN go stale. */
function namingListing(title: string): PlanProposalChangeSet {
  return { additions: [{ title, providerServiceId: ids.listing }] };
}

async function stage(tripId: string, proposal: PlanProposalChangeSet) {
  return await createPlanProposal({ tripId, proposal: proposal as unknown });
}

/** Push the row past the window (the env knob is 1h below; two hours is past it). */
async function backdate(proposalId: string): Promise<void> {
  await db.execute(
    sql`UPDATE plan_proposals SET created_at = now() - interval '2 hours' WHERE id = ${proposalId}`,
  );
}

/**
 * A PAID proposal, exactly as the pay rail leaves one: claimed, then stamped with a PaymentIntent
 * the stub reports `succeeded` for THIS proposal at the band's amount.
 */
async function stagePaid(tripId: string, proposal: PlanProposalChangeSet) {
  const row = await stage(tripId, proposal);
  const pi = `pi_${RUN}_${row.id.slice(0, 8)}`;
  const amount = await resolveAiTaskChargeCents();
  intents.set(pi, { proposalId: row.id, amount });
  assert.ok(await claimProposalCharge(row.id, tripId), "fixture: the claim");
  assert.ok(await stampProposalPaymentIntent(row.id, pi), "fixture: the stamp");
  return { row, pi, amount };
}

async function proposalRow(id: string) {
  const [row] = (
    await db.execute(sql`
      SELECT status, charge_claimed_at, stripe_payment_intent_id, charged_amount_cents, charge_basis,
             applied_at, applied_item_ids
      FROM plan_proposals WHERE id = ${id}
    `)
  ).rows as any[];
  return row;
}

async function refundRowsFor(pi: string) {
  return (
    await db.execute(sql`
      SELECT booking_id, stripe_refund_id, stripe_payment_intent_id, amount, reason
      FROM refunds WHERE stripe_payment_intent_id = ${pi}
    `)
  ).rows as any[];
}

async function itemsOn(tripId: string) {
  return await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
}

before(async () => {
  await assertDisposableDb();
  // The window is 1h for this run, so `backdate` (2h) is stale and a fresh row is not.
  process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR] = "1";
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (${ids.owner}, ${`ppr-${RUN}-owner@t.test`}, 'user')
  `);
  await seedTrip(ids.covered);
  await seedTrip(ids.paid);
  // An ACTIVE Trip Pass on one plan (the C2 fixture shape — written directly, a 'stripe' grant
  // would need a fabricated PaymentIntent id, §19a).
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source, allowances_snapshot)
    VALUES (${`ppr-${RUN}-ent`}, ${ids.covered}, 'trip_pass', 'active', 'beta', '{}'::jsonb)
  `);
  // R3's decoys FIRST, then the named listing — so under the old page-of-100 membership check the
  // named one would sit past the page in heap order. One INSERT, 101 rows.
  const decoys = Array.from({ length: 101 }, (_, i) => `ppr-${RUN}-decoy-${i}`);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, location, status, approval_status)
    VALUES ${sql.join(
      decoys.map((d) => sql`(${d}, ${ids.owner}, ${`Decoy ${d}`}, ${`${DESTINATION}, Japan`}, 'active', 'approved')`),
      sql`, `,
    )}
  `);
  await seedListing(ids.listing, "active");
  // Something on each plan, so "untouched" is a count of real rows and not of nothing.
  for (const tripId of [ids.covered, ids.paid]) {
    await db.execute(sql`
      INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, origin)
      VALUES (${crypto.randomUUID()}, ${tripId}, ${`Existing ${RUN}`}, 1, 1, 'traveler')
    `);
  }
});

after(async () => {
  delete process.env[AI_TASK_PROPOSAL_STALE_AFTER_HOURS_ENV_VAR];
  refundsProto.create = originalRefundCreate;
  intentsProto.retrieve = originalIntentRetrieve;
  await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id LIKE ${`pi_${RUN}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id IN (${ids.covered}, ${ids.paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.covered}, ${ids.paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.covered}, ${ids.paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.covered}, ${ids.paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${ids.owner}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R1 — PAY refuses a stale proposal BEFORE the claim
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R1: a stale proposal is refused by PAY with no claim taken and no PaymentIntent stamped", async () => {
  const staged = await stage(ids.paid, namingListing(`r1 ${RUN}`));
  await backdate(staged.id);

  const res = await asUser(ids.owner, async (base) => {
    const r = await post(base, `/api/trips/${ids.paid}/proposals/${staged.id}/pay`);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.reason, "stale_catalog_price", "refused for its OWN reason (§13)");

  const row = await proposalRow(staged.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_PROPOSED);
  assert.equal(row.charge_claimed_at, null, "refused BEFORE the §15b claim — nothing to reclaim");
  assert.equal(row.stripe_payment_intent_id, null, "and no PaymentIntent was created or stamped");
  assert.equal(refundCalls.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R2 — APPLY refuses a stale proposal on a covered plan: items untouched, no refund block
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R2: a stale proposal on a Trip-Pass plan is refused by APPLY, items untouched, no refund block", async () => {
  const staged = await stage(ids.covered, namingListing(`r2 ${RUN}`));
  await backdate(staged.id);
  const before = await itemsOn(ids.covered);

  const res = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.covered, staged.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.reason, "stale_catalog_price");
  assert.equal(
    "refund" in res.body,
    false,
    "§13: a covered apply charged nothing, so there is nothing to refund and NO block claims otherwise",
  );

  const after_ = await itemsOn(ids.covered);
  assert.deepEqual(
    after_.map((i) => i.id).sort(),
    before.map((i) => i.id).sort(),
    "the whole apply is one transaction — a refusal leaves the plan exactly as it was",
  );
  const row = await proposalRow(staged.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_PROPOSED, "still proposed — and discardable, since no PI exists");
  assert.equal(row.charge_basis, null);
  assert.equal(refundCalls.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R3 — the re-validation is BY ID under the ONE liveness predicate (review finding 1)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R3: a live listing behind 101 live decoys is still found; a PAUSED one is refused by id", async () => {
  // Positive: the named listing is the 102nd live row in this destination. A page-of-100
  // membership check would have called it unavailable; the by-id check finds it.
  const fresh = await stage(ids.covered, namingListing(`r3 live ${RUN}`));
  const ok = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.covered, fresh.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(ok.status, 200, `a live listing is live regardless of how many others are: ${JSON.stringify(ok.body)}`);
  assert.equal(ok.body.createdItemIds?.length, 1);
  const [created] = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.id, ok.body.createdItemIds[0]));
  assert.equal(created.providerServiceId, ids.listing, "the catalog link is carried onto the row");

  // Negative: pause the SAME listing. The same predicate the catalog reader pages over now says
  // it is not live, and the refusal names it (§13).
  await db.execute(sql`UPDATE provider_services SET status = 'paused' WHERE id = ${ids.listing}`);
  const paused = await stage(ids.covered, namingListing(`r3 paused ${RUN}`));
  const before = await itemsOn(ids.covered);
  const refused = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.covered, paused.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.reason, "listing_unavailable");
  assert.deepEqual(refused.body.itemIds, [ids.listing], "the refusal names the listing that is gone");
  assert.equal((await itemsOn(ids.covered)).length, before.length, "and wrote nothing");
  assert.equal("refund" in refused.body, false, "covered ⇒ nothing charged ⇒ no refund block");

  await db.execute(sql`UPDATE provider_services SET status = 'active' WHERE id = ${ids.listing}`);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R4 — OPTION B: PAID + STALE ⇒ refused AND refunded, exactly once
// ═══════════════════════════════════════════════════════════════════════════════════════════════

let r4: { row: { id: string }; pi: string; amount: number; refundId: string };

test("R4: a PAID proposal that went stale is refused by APPLY and its fee is REFUNDED — once, by key, for Stripe's amount", async () => {
  const paid = await stagePaid(ids.paid, namingListing(`r4 ${RUN}`));
  await backdate(paid.row.id);
  const before = await itemsOn(ids.paid);

  const res = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.paid, paid.row.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.reason, "stale_catalog_price", "the refusal keeps its own reason");
  assert.equal(res.body.refund?.issued, true, "§13: the response says what happened to the money");
  assert.match(res.body.refund.refundId, /^re_/);
  assert.equal(res.body.refund.amountCents, paid.amount, "the amount is Stripe's own report of the charge (§14)");

  // ONE Stripe call, under the proposal-derived key, for the PaymentIntent's amount.
  assert.equal(refundCalls.length, 1, "exactly one refunds.create");
  const [call] = refundCalls;
  assert.equal(call.options?.idempotencyKey, planProposalRefundIdempotencyKey(paid.row.id));
  assert.equal(call.params.payment_intent, paid.pi);
  assert.equal(call.params.amount, paid.amount);
  assert.equal(call.params.metadata?.proposalId, paid.row.id);

  // The row: terminal, carrying the charge it returned.
  const row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED);
  assert.equal(row.charged_amount_cents, paid.amount, "the recorded charge — what every retry refunds");
  assert.equal(row.charge_basis, "paid");
  assert.equal(row.applied_at, null, "never applied");
  assert.equal(row.applied_item_ids, null);
  assert.equal(row.stripe_payment_intent_id, paid.pi, "§19a: the payment identity is never rewritten");

  // The audit row: booking-less, naming the refusal.
  const audit = await refundRowsFor(paid.pi);
  assert.equal(audit.length, 1, "ONE refunds audit row");
  assert.equal(audit[0].booking_id, null, "no booking — the column is nullable by design");
  assert.equal(audit[0].stripe_refund_id, res.body.refund.refundId);
  assert.equal(audit[0].reason, planProposalRefundReason("stale_catalog_price", paid.row.id));
  assert.equal(Math.round(Number(audit[0].amount) * 100), paid.amount);

  // And the plan is exactly as it was.
  assert.deepEqual((await itemsOn(ids.paid)).map((i) => i.id).sort(), before.map((i) => i.id).sort());

  // No revenue row exists to reverse — the charge is ledgered only at a SUCCESSFUL apply.
  const rev = await db.execute(sql`SELECT count(*)::int AS n FROM platform_revenue WHERE source_id = ${paid.pi}`);
  assert.equal(Number((rev.rows[0] as any).n), 0, "nothing was recognised, so nothing is reversed (§13)");

  r4 = { row: paid.row, pi: paid.pi, amount: paid.amount, refundId: res.body.refund.refundId };
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R5 — the RETRY: same refund id, no second Stripe call, terminal row
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R5: retrying the refunded proposal reports the SAME refund with NO second Stripe call; discard and pay are closed", async () => {
  const res = await asUser(ids.owner, async (base) => {
    const apply = await applyAs(base, ids.paid, r4.row.id);
    const discard = await post(base, `/api/trips/${ids.paid}/proposals/${r4.row.id}/discard`);
    const pay = await post(base, `/api/trips/${ids.paid}/proposals/${r4.row.id}/pay`);
    return {
      apply: { status: apply.status, body: (await apply.json()) as any },
      discard: discard.status,
      pay: pay.status,
    };
  });
  assert.equal(res.apply.status, 409, JSON.stringify(res.apply.body));
  assert.equal(res.apply.body.reason, "refunded", "§13: the row's own state is the answer on a retry");
  assert.equal(res.apply.body.refund?.issued, true);
  assert.equal(res.apply.body.refund.refundId, r4.refundId, "the SAME refund");
  assert.equal(res.apply.body.refund.amountCents, r4.amount);
  assert.equal(refundCalls.length, 0, "the audit row answered — Stripe was not called again");

  assert.equal(res.discard, 404, "a refunded row is terminal: not the traveler's to discard");
  assert.equal(res.pay, 409, "and not open to pay");
  assert.equal((await refundRowsFor(r4.pi)).length, 1, "still one audit row");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R6 — two CONCURRENT applies ⇒ ONE refund (§15b — the claim is the status flip)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R6: two concurrent applies of a paid+stale proposal produce exactly ONE refund", async () => {
  const paid = await stagePaid(ids.paid, namingListing(`r6 ${RUN}`));
  await backdate(paid.row.id);

  const [a, b] = await asUser(ids.owner, async (base) =>
    Promise.all(
      [0, 1].map(async () => {
        const r = await applyAs(base, ids.paid, paid.row.id);
        return { status: r.status, body: (await r.json()) as any };
      }),
    ),
  );
  for (const res of [a, b]) {
    assert.equal(res.status, 409, JSON.stringify(res.body));
    // A caller that read the row BEFORE the other's claim reports the refusal; one that read it
    // AFTER reports the row's own terminal state. Both are true at the moment each was read (§13).
    assert.ok(
      res.body.reason === "stale_catalog_price" || res.body.reason === "refunded",
      `a true reason, never a guess: ${res.body.reason}`,
    );
    assert.ok(res.body.refund, "both callers are told what happened to the money");
  }

  // ONE refund at Stripe: whatever the call count (a loser that found no audit row yet re-drives
  // the same key), every returned refund is the same one. That is the property the key exists for.
  const issuedIds = new Set(
    [a, b].map((r) => r.body.refund).filter((x) => x?.issued).map((x) => x.refundId as string),
  );
  assert.ok(issuedIds.size >= 1, "at least one caller saw the refund issued");
  assert.equal(issuedIds.size, 1, "and there is only ONE refund id across both");
  for (const r of [a, b]) {
    if (!r.body.refund.issued) assert.equal(r.body.refund.state, "pending", "a loser mid-flight says so (§13)");
  }
  const distinctAtStripe = new Set(refundCalls.map((c) => c.options?.idempotencyKey));
  assert.deepEqual([...distinctAtStripe], [planProposalRefundIdempotencyKey(paid.row.id)], "one key, however many calls");

  const row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED);
  const audit = await refundRowsFor(paid.pi);
  assert.equal(new Set(audit.map((x) => x.stripe_refund_id)).size, 1, "one refund recorded, by id");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R7 — a FAILED Stripe call keeps the claim; the retry re-drives the SAME key
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R7: a failed Stripe refund leaves the CLAIM standing and answers pending; the retry completes it under the same key", async () => {
  const paid = await stagePaid(ids.paid, namingListing(`r7 ${RUN}`));
  await backdate(paid.row.id);

  failNextRefunds = 1;
  const first = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.paid, paid.row.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(first.status, 409, JSON.stringify(first.body));
  assert.equal(first.body.reason, "stale_catalog_price");
  assert.equal(first.body.refund?.issued, false);
  assert.equal(first.body.refund?.state, "pending", "§13: claimed, not yet issued — said out loud");
  assert.equal(refundCalls.length, 1);

  // THE CLAIM STANDS (§15b) — no compensating rollback to `proposed`, no audit row for a refund
  // Stripe may not hold.
  let row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED, "the claim is kept, never rolled back");
  assert.equal(row.charged_amount_cents, paid.amount);
  assert.equal((await refundRowsFor(paid.pi)).length, 0, "nothing recorded for a refund that did not happen");

  // The retry: the row is `refunded`, no audit row ⇒ re-drive the SAME key. Stripe (stub) succeeds.
  const second = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.paid, paid.row.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.reason, "refunded");
  assert.equal(second.body.refund?.issued, true);
  assert.equal(refundCalls.length, 2, "the retry re-drove Stripe");
  assert.equal(
    refundCalls[1].options?.idempotencyKey,
    refundCalls[0].options?.idempotencyKey,
    "under the SAME key — so a refund Stripe DID hold would have come back, not been doubled",
  );
  assert.equal(refundCalls[1].params.amount, paid.amount, "for the row's recorded charge");

  row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED);
  const audit = await refundRowsFor(paid.pi);
  assert.equal(audit.length, 1, "recorded once");
  assert.equal(audit[0].stripe_refund_id, second.body.refund.refundId);
  // RULING 2026-09-17: the audit row records the REFUSAL that caused the refund, never `retry` —
  // which described the CALL and told a reconciler nothing about why the fee went back. On THIS one
  // path the original refusal is not knowable (no column carries it; the audit row that would is
  // absent by construction here), so the row says so rather than guessing or re-deriving (§13).
  assert.equal(
    audit[0].reason,
    planProposalRefundReason(PLAN_PROPOSAL_REFUND_UNKNOWN_REFUSAL, paid.row.id),
    "the audit row names an unknowable prior refusal honestly, never the mechanics of the call",
  );
  assert.ok(
    !String(audit[0].reason).includes(":retry:"),
    "and never `retry`, which is not a reason",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R8 — OPTION B WIDENED: a PAID proposal refused `protected_item` is REFUNDED (the stuck case)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R8: a PAID proposal that names PROTECTED work is refused AND refunded; the retry adds no Stripe call", async () => {
  // A protected row, by LD 42 D3's own class: `origin='expert'`. Not stale, names no listing — so
  // the catalog re-validation passes and the refusal under test is the D3 one, not D-50's.
  const protectedId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, origin)
    VALUES (${protectedId}, ${ids.paid}, ${`Expert pick ${RUN}`}, 1, 9, 'expert')
  `);
  const paid = await stagePaid(ids.paid, {
    additions: [{ title: `r8 addition ${RUN}` }],
    replaces: [{ itemId: protectedId, reason: "the AI would swap this out" }],
  });
  const before = await itemsOn(ids.paid);

  const res = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.paid, paid.row.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.reason, "protected_item", "the refusal keeps its own reason");
  assert.deepEqual(res.body.itemIds, [protectedId], "and names the protected row");
  assert.equal(res.body.refund?.issued, true, "§13: the 409 says what happened to the money");
  assert.match(res.body.refund.refundId, /^re_/);
  assert.equal(res.body.refund.amountCents, paid.amount, "the amount is Stripe's own report (§14)");

  // ONE Stripe call, on the SAME shared refund path and the SAME proposal-derived key — never a
  // second refund site for a third refusal (§18 rule 1).
  assert.equal(refundCalls.length, 1, "exactly one refunds.create");
  assert.equal(refundCalls[0].options?.idempotencyKey, planProposalRefundIdempotencyKey(paid.row.id));
  assert.equal(refundCalls[0].params.payment_intent, paid.pi);
  assert.equal(refundCalls[0].params.amount, paid.amount);

  const row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED, "terminal, and no longer stuck");
  assert.equal(row.charged_amount_cents, paid.amount);
  assert.equal(row.charge_basis, "paid");
  assert.equal(row.applied_at, null, "never applied");
  assert.equal(row.stripe_payment_intent_id, paid.pi, "§19a: the payment identity is never rewritten");

  const audit = await refundRowsFor(paid.pi);
  assert.equal(audit.length, 1, "ONE refunds audit row");
  assert.equal(audit[0].booking_id, null);
  assert.equal(audit[0].stripe_refund_id, res.body.refund.refundId);
  assert.equal(
    audit[0].reason,
    planProposalRefundReason("protected_item", paid.row.id),
    "naming the refusal that caused it",
  );

  // NOTHING was written to the plan: the protected row is still there, unchanged, and the
  // proposal's addition was never created (the whole apply is one transaction).
  const after = await itemsOn(ids.paid);
  assert.deepEqual(after.map((i) => i.id).sort(), before.map((i) => i.id).sort(), "plan untouched");
  assert.ok(after.some((i) => i.id === protectedId), "the protected row survives");
  assert.ok(!after.some((i) => i.title === `r8 addition ${RUN}`), "and nothing was added");

  // THE RETRY: the row's own terminal state answers, the audit row is found, Stripe is not called.
  const retry = await asUser(ids.owner, async (base) => {
    const r = await applyAs(base, ids.paid, paid.row.id);
    return { status: r.status, body: (await r.json()) as any };
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.body.reason, "refunded", "§13: the row's own state is the answer on a retry");
  assert.equal(retry.body.refund?.issued, true);
  assert.equal(retry.body.refund.refundId, res.body.refund.refundId, "the SAME refund");
  assert.equal(refundCalls.length, 1, "no second Stripe call — the audit row answered");
  assert.equal((await refundRowsFor(paid.pi)).length, 1, "still one audit row");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R9 — THE INTERLEAVING, FORCED DETERMINISTICALLY: a caller whose OWN status read lands AFTER a
// concurrent caller's refund claim commits is told `refunded`, never `not_applicable`.
// (ledger `2026-09-19-proposal-refund-race-reason`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R9: caller B's status read forced to land after caller A's refund commit ⇒ ONE refund, B told 'refunded'", async () => {
  const paid = await stagePaid(ids.paid, namingListing(`r9 ${RUN}`));
  await backdate(paid.row.id);
  const before = await itemsOn(ids.paid);

  const applyParams = {
    proposalId: paid.row.id,
    tripId: ids.paid,
    basis: PLAN_PROPOSAL_CHARGE_BASIS_PAID,
    chargedAmountCents: paid.amount,
    paymentIntentId: paid.pi,
    actorId: ids.owner,
  } as const;

  let aOutcome: { code: string; refund: ProposalRefundOutcome } | null = null;

  // Caller B's internal status read (inside `applyPlanProposal`, right before its `tx.select()`)
  // is paused HERE and does not resume until caller A's ENTIRE request — refuse, then refund — has
  // committed. This is exactly the interleaving that made R6 flaky on GitHub's runner: B's route
  // reads the row while it is still `proposed`, but by the time B's OWN transaction reads the row,
  // A has already claimed and refunded it.
  const bPromise = applyPlanProposal(applyParams, {
    beforeStatusRead: async () => {
      try {
        await applyPlanProposal(applyParams);
        assert.fail("caller A should have been refused as stale");
      } catch (err: any) {
        if (!(err instanceof ProposalApplyRefused)) throw err;
        assert.equal(err.code, "stale_catalog_price", "A reads the row while it is still `proposed`");
        // Mirrors the ROUTE's own catch handler exactly (trips.routes.ts): the refusal IS known
        // here, so it is threaded through, never re-derived.
        const refund = await refundRefusedProposalCharge({
          proposalId: paid.row.id,
          tripId: ids.paid,
          paymentIntentId: paid.pi,
          amountCents: paid.amount,
          refusal: err.code,
        });
        aOutcome = { code: err.code, refund };
      }
    },
  });

  let bCode: string | undefined;
  try {
    await bPromise;
    assert.fail("caller B should have been refused too");
  } catch (err: any) {
    assert.ok(err instanceof ProposalApplyRefused, `B's refusal, not a crash: ${err?.stack ?? err}`);
    bCode = err.code;
  }
  assert.equal(
    bCode,
    "refunded",
    "B's OWN read landed on an already-refunded row — the row's real state, never `not_applicable`",
  );

  // Mirrors the ROUTE's NEW concurrent-loser branch exactly: `refusal: null` — the refusal is NOT
  // knowable to B (it never reached `assertProposalCatalogStillValid`), so it is never guessed.
  const bRefund = await refundRefusedProposalCharge({
    proposalId: paid.row.id,
    tripId: ids.paid,
    paymentIntentId: paid.pi,
    amountCents: paid.amount,
    refusal: null,
  });

  assert.ok(aOutcome, "A's hook ran to completion");
  assert.equal(aOutcome!.refund.issued, true);
  assert.equal(bRefund.issued, true);
  assert.equal(
    bRefund.issued && aOutcome!.refund.issued ? bRefund.refundId === aOutcome!.refund.refundId : false,
    true,
    "both callers are told about the SAME refund",
  );

  // Money safety: exactly ONE Stripe call — B found A's audit row already written and never
  // re-drove Stripe.
  assert.equal(refundCalls.length, 1, "exactly one refunds.create across both callers");
  assert.equal(refundCalls[0].options?.idempotencyKey, planProposalRefundIdempotencyKey(paid.row.id));

  const row = await proposalRow(paid.row.id);
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_REFUNDED);
  assert.equal(row.charged_amount_cents, paid.amount);

  const audit = await refundRowsFor(paid.pi);
  assert.equal(audit.length, 1, "ONE refunds audit row — the refusal that actually caused it");
  assert.equal(
    audit[0].reason,
    planProposalRefundReason("stale_catalog_price", paid.row.id),
    "the KNOWN refusal (A's), never a guess and never `retry`",
  );

  assert.deepEqual(
    (await itemsOn(ids.paid)).map((i) => i.id).sort(),
    before.map((i) => i.id).sort(),
    "the plan is untouched by either caller",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R10 — `not_applicable` still covers every OTHER terminal state. `refunded` is exactly one carve-
// out, not a general softening of the guard.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R10: not_applicable still covers an already-APPLIED or already-DISCARDED proposal", async () => {
  // Applied (trip-pass basis — no Stripe/refund plumbing needed to prove this).
  const applied = await stage(ids.covered, { additions: [{ title: `r10 applied ${RUN}` }] });
  const appliedParams = {
    proposalId: applied.id,
    tripId: ids.covered,
    basis: "trip_pass" as const,
    chargedAmountCents: null,
    paymentIntentId: null,
    actorId: ids.owner,
  };
  await applyPlanProposal(appliedParams);
  await assert.rejects(
    () => applyPlanProposal(appliedParams),
    (err: any) => {
      assert.ok(err instanceof ProposalApplyRefused);
      assert.equal(err.code, "not_applicable", "an APPLIED row is not_applicable, never refunded");
      return true;
    },
  );

  // Discarded.
  const discardable = await stage(ids.covered, { additions: [{ title: `r10 discarded ${RUN}` }] });
  const discarded = await discardPlanProposal(discardable.id, ids.covered);
  assert.ok(discarded, "fixture: the discard itself succeeded");
  await assert.rejects(
    () =>
      applyPlanProposal({
        proposalId: discardable.id,
        tripId: ids.covered,
        basis: "trip_pass" as const,
        chargedAmountCents: null,
        paymentIntentId: null,
        actorId: ids.owner,
      }),
    (err: any) => {
      assert.ok(err instanceof ProposalApplyRefused);
      assert.equal(err.code, "not_applicable", "a DISCARDED row is not_applicable, never refunded");
      return true;
    },
  );

  assert.equal(refundCalls.length, 0, "neither terminal state calls Stripe");
});
