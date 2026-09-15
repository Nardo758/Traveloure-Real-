/**
 * proposal-apply-authorization.test.ts — WHY AN AI PROPOSAL MAY BE APPLIED, PROVEN WITHOUT A DATABASE.
 *
 * (decision-maker rulings 2026-09-15, punchlist **D-20** = A and **D-21** = A; ledger
 *  `2026-09-15-d20-d21-proposal-charge`; migration 300. CLAUDE.md Locked Decision 45 (3),
 *  Locked Decision 41 (a) and (f), §13, §14, §15, §18 rule 1.)
 *
 * WHY A PURE TEST IS THE RIGHT LAYER. The failure this class produces is SILENT — the exact shape
 * Locked Decision 41 (a) was written about, one product over: a pass holder was answered
 * "included" by the charge gate and "payment required" by the run gate, nothing threw, nothing
 * logged, and the traveler simply got a payment screen for something they had already paid for.
 * `resolveProposalApplyAuthorization` imports no `db`, no `storage` and no Stripe client for
 * exactly this reason: the decision can be exercised in CI with no database at all.
 *
 *   A1  ORDER — the trip pass is consulted FIRST, and a covered plan never reaches verification.
 *   A2  a Trip Pass takes NO claim and spends NO PaymentIntent, even when one is supplied.
 *   A3  the payment RECORDED on the row authorizes with `claimRequired: false`.
 *   A4  a FRESHLY supplied PaymentIntent authorizes with `claimRequired: true`.
 *   A5  a supplied PaymentIntent is NEVER trusted — a verifier refusal is a refusal, with the
 *       verifier's own reason carried verbatim (§13).
 *   A6  no pass and no payment ⇒ `payment_required`, and nothing was asked of Stripe.
 *   A7  empty-string ids are ABSENT ids and never reach an entitlement or Stripe lookup.
 *   A8  the predicate NEVER writes: it is a pure function of its injected reads.
 *   A9  the idempotency key is derived from the PROPOSAL and nothing else (D-21), and the basis
 *       vocabulary has exactly two members with no `free_rerun` among them.
 *
 * STATED NEGATIVE SPACE (§18d). These proofs cover the DECISION only. They say nothing about who
 * may touch the plan (the route's §12 WRITE gate, proven in the DB suite), nothing about the
 * atomic claim or the apply transaction (same place), and nothing about what Stripe actually does
 * — `verifyPayment` is injected here precisely so this layer never needs a network.
 *
 * NO FEE LITERALS (§8): no amount is asserted anywhere in this file except as a value handed in by
 * a stub and handed straight back out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resolveProposalApplyAuthorization,
  type ProposalApplyAuthorizationDeps,
} from "../services/proposal-apply-authorization";
import {
  PLAN_PROPOSAL_CHARGE_BASES,
  planProposalApplyIdempotencyKey,
} from "@shared/plan-proposals";

type Call = { kind: "pass" | "verify"; detail: string };

function deps(
  opts: { covered?: boolean; verify?: (id: string) => { ok: boolean; detail?: string } } = {},
): { deps: ProposalApplyAuthorizationDeps; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    deps: {
      tripPassCoversTask: async (tripId) => {
        calls.push({ kind: "pass", detail: tripId });
        return opts.covered === true;
      },
      verifyPayment: async ({ paymentIntentId }) => {
        calls.push({ kind: "verify", detail: paymentIntentId });
        const r = opts.verify ? opts.verify(paymentIntentId) : { ok: true };
        return r.ok
          ? ({ ok: true, amountCents: 1234 } as const)
          : ({ ok: false, detail: r.detail ?? "refused" } as const);
      },
    },
  };
}

const BASE = { proposalId: "prop-1", tripId: "trip-1" };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A1/A2 — THE PASS IS FIRST, AND IT COSTS NOTHING
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A1: a covered plan authorizes on `trip_pass` and never reaches payment verification", async () => {
  const { deps: d, calls } = deps({ covered: true });
  const result = await resolveProposalApplyAuthorization(
    { ...BASE, recordedPaymentIntentId: "pi_recorded" },
    d,
  );
  assert.deepEqual(result, { authorized: true, basis: "trip_pass" });
  // The ORDER is the point (LD 41 (a)): the charge gate and the apply gate both read the pass
  // first, so they can never disagree about a covered plan.
  assert.deepEqual(calls.map((c) => c.kind), ["pass"]);
});

test("A2: a Trip Pass takes NO claim and spends NO PaymentIntent, even when one is supplied", async () => {
  const { deps: d, calls } = deps({ covered: true });
  const result = await resolveProposalApplyAuthorization(
    { ...BASE, suppliedPaymentIntentId: "pi_client_supplied" },
    d,
  );
  assert.equal(result.authorized, true);
  assert.equal(result.authorized && result.basis, "trip_pass");
  // No `claimRequired` and no `paymentIntentId` on this branch AT ALL — `ai_task` coverage is
  // unlimited by ruling, so there is no counter to race on and nothing to record.
  assert.equal("claimRequired" in result, false);
  assert.equal("paymentIntentId" in result, false);
  assert.equal(calls.filter((c) => c.kind === "verify").length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A3/A4/A5 — PAID, AND WHO STILL OWES THE §15 CLAIM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A3: the payment RECORDED on the row authorizes with claimRequired false", async () => {
  const { deps: d, calls } = deps({ covered: false });
  const result = await resolveProposalApplyAuthorization(
    { ...BASE, recordedPaymentIntentId: "pi_recorded", suppliedPaymentIntentId: "pi_other" },
    d,
  );
  assert.equal(result.authorized, true);
  assert.equal(result.authorized && result.basis, "paid");
  assert.equal(result.authorized && result.basis === "paid" && result.claimRequired, false);
  assert.equal(result.authorized && result.basis === "paid" && result.paymentIntentId, "pi_recorded");
  // A STAMPED id still goes through Stripe: it proves a PaymentIntent was CREATED for this
  // proposal, never that it was PAID (the pay rail stamps before the traveler confirms the sheet).
  assert.deepEqual(calls.map((c) => c.detail), ["trip-1", "pi_recorded"]);
});

test("A4: a freshly supplied PaymentIntent authorizes and still owes the caller's §15 claim", async () => {
  const { deps: d } = deps({ covered: false });
  const result = await resolveProposalApplyAuthorization(
    { ...BASE, suppliedPaymentIntentId: "pi_fresh" },
    d,
  );
  assert.equal(result.authorized && result.basis === "paid" && result.claimRequired, true);
  assert.equal(result.authorized && result.basis === "paid" && result.paymentIntentId, "pi_fresh");
  assert.equal(result.authorized && result.basis === "paid" && result.amountCents, 1234);
});

test("A5: a client-supplied PaymentIntent is never trusted — a refusal carries the verifier's own reason", async () => {
  const { deps: d } = deps({
    covered: false,
    verify: () => ({ ok: false, detail: "payment_belongs_to_another_proposal" }),
  });
  const result = await resolveProposalApplyAuthorization(
    { ...BASE, suppliedPaymentIntentId: "pi_lifted_from_another_flow" },
    d,
  );
  assert.equal(result.authorized, false);
  assert.equal(!result.authorized && result.reason, "payment_rejected");
  // §13: the caller answers with WHICH check failed, not one collapsed message.
  assert.equal(
    !result.authorized && result.reason === "payment_rejected" && result.detail,
    "payment_belongs_to_another_proposal",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A6/A7 — THE ABSENCES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A6: no pass and no payment is `payment_required`, and Stripe was never asked", async () => {
  const { deps: d, calls } = deps({ covered: false });
  const result = await resolveProposalApplyAuthorization(BASE, d);
  assert.deepEqual(result, { authorized: false, reason: "payment_required" });
  assert.equal(calls.filter((c) => c.kind === "verify").length, 0);
});

test("A7: empty-string ids are ABSENT ids and reach no entitlement or Stripe lookup", async () => {
  const { deps: d, calls } = deps({ covered: true });
  const result = await resolveProposalApplyAuthorization(
    { proposalId: "  ", tripId: "   ", recordedPaymentIntentId: "  ", suppliedPaymentIntentId: "" },
    d,
  );
  assert.deepEqual(result, { authorized: false, reason: "payment_required" });
  // Not even the PASS read fires: a blank trip id is not a trip, and a covered-by-default stub
  // would otherwise have authorized an apply against nothing.
  assert.deepEqual(calls, []);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A8/A9 — THE PREDICATE WRITES NOTHING, AND THE VOCABULARY IS THE ONE HOME
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A8: the module imports no db, no storage and no Stripe client — the decision takes no claim", () => {
  // Derived from the FILE, not from a remembered fact: an import added tomorrow fails here. This is
  // what makes the pure layer real rather than a convention (the `optimizer-run-authorization`
  // precedent, LD 41 (a)).
  const src = fs.readFileSync(
    path.resolve(import.meta.dirname, "../services/proposal-apply-authorization.ts"),
    "utf8",
  );
  const imports = [...src.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(
    imports.filter((i) => /(^|\/)db$|storage|stripe/i.test(i)),
    [],
    "the predicate must stay dependency-free so it can be proven with no database",
  );
});

test("A9: D-21 — the idempotency key is the PROPOSAL's, and the basis set has no free_rerun", () => {
  // One charge per DISTINCT PROPOSAL APPLIED: the key carries the proposal id and NOTHING else —
  // no date (the optimizer's key is per-target-per-DAY because its unit of charge is a run) and no
  // user (the row already belongs to one plan). A double-click rebuilds the same key.
  assert.equal(planProposalApplyIdempotencyKey("prop-xyz"), "ai-apply-prop-xyz");
  assert.notEqual(
    planProposalApplyIdempotencyKey("prop-a"),
    planProposalApplyIdempotencyKey("prop-b"),
    "two distinct proposals are two distinct charges",
  );
  // §13: two ways to say one thing is how a reader guesses. An AI task has no free-re-run window,
  // so no basis names one.
  assert.deepEqual([...PLAN_PROPOSAL_CHARGE_BASES], ["trip_pass", "paid"]);
});
