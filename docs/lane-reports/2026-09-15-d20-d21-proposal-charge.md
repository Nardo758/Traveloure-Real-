# Lane report — D-20 / D-21: the AI proposal apply is charged flat from `fee_bands`, once per distinct proposal

Branch `task-d20-d21-proposal-charge`, off `origin/main` @ `5d5f7ccc3` (PR #932, migration 299).
Ledger row: `2026-09-15-d20-d21-proposal-charge`. Migration **300**.

## The two rulings this lane executes

- **D-20 = A — FLAT, FROM `fee_bands`.** The `concierge:ai_task` band (`flat_cents`), resolved
  through the EXISTING fail-loud `requireFlatCentsBand`. No literal and no fallback default (§8):
  a charge path that cannot price itself REFUSES. `optimization_fees` is untouched — a second
  tiered fee table for a second AI product is how the platform ends up with two fee homes nobody
  can reconcile, and folding them is an older question and its own lane.
- **D-21 = A — ONE CHARGE PER DISTINCT PROPOSAL APPLIED.** Asking is free; reading and discarding
  are free. The §15b CLAIM sits on the `plan_proposals` row; the Stripe idempotency key is
  `ai-apply-<proposalId>`; a double-click, a retry or a resumed sheet is one charge.

## What landed

| Thing | Where |
|---|---|
| Migration 300 — four additive-nullable columns on `plan_proposals`, NO CHECK, NO DEFAULT, NO index, NO backfill | `server/migrations/300_plan_proposals_charge.sql`, registered in `migration-files.ts` |
| The same four **declared in `shared/schema.ts`** (deploy-push durability rule) and **absent from the pick-based `planProposalCreateSchema`** (§19) | `shared/schema.ts` |
| The charge-basis vocabulary (`trip_pass` \| `paid`) and the idempotency-key derivation, each stated ONCE | `shared/plan-proposals.ts` |
| The ONE pure authorization predicate — injected reads, no `db`/`storage`/Stripe import | `server/services/proposal-apply-authorization.ts` |
| The band read, the atomic claim, the §19a single writer of the payment identity, the wallet-bearing PaymentIntent (LD 43 (c)), the one-transaction apply, the ledger call | `server/services/proposal-charge.service.ts` |
| `POST /api/trips/:tripId/proposals/:id/pay` and `…/apply`, behind the SAME §12 WRITE gate the D-19 routes run | `server/routes/trips.routes.ts` |
| `discardPlanProposal` refuses a row carrying a PaymentIntent — one more clause in the SAME atomic conditional | `server/services/plan-proposals.service.ts` |
| The `concierge:ai_task` band's `owner` amended so V-5's deactivation warning names the charge path | `server/services/fee-band-requirements.ts` |
| `ai_task_fee` revenue source on the 100%-platform `'ai'` tier | `server/services/revenue-tracking.service.ts` |
| Copy: "charged only when you apply a proposal", never "per question" | `client/src/pages/pricing.tsx`, `client/src/components/landing/how-it-works.tsx` |
| A1–A9 pure proofs, C1–C7 DB proofs, both wired into the existing `plan-proposals` CI job | `server/__tests__/`, `.github/workflows/build.yml` |

## Decisions this lane took inside the rulings, stated

1. **`charge_basis` gets a COLUMN, unlike the optimizer's basis.** LD 41 (a) could not pin the
   optimizer's basis to a row because `itinerary_comparisons` carries only a payment-IDENTITY
   column and a `"trip_pass"` sentinel there would be a fabricated payment identity (§19a). D-21
   ratifies the proposal row as the claim's home, so the basis gets a column of its own and the two
   facts are never written into each other.
2. **`charged_amount_cents` is NULL for a covered apply, never `0`** — "no charge was made", not
   "we charged them nothing" (§13; `fee_ledger`'s own `amount <> 0` CHECK is that rule one table
   over). A covered apply also writes **no ledger row at all**.
3. **A `replaces` naming protected work is REFUSED with the reason** (409 + the item ids), never
   skipped — a silent skip would apply a proposal the traveler read as replacing something and
   leave that something standing. The class test is the ONE existing row-level predicate
   `itineraryItemIsExpertWork`, with `itineraryItemRebuildDeletable()` ANDed into the delete as the
   second layer. No third expression of the class.
4. **C6's ruled answer: a CLAIM alone does not block a discard; a PaymentIntent does.** A claim with
   no PaymentIntent is a pay attempt whose Stripe call never landed, and discard is its recovery;
   once an intent exists, money may yet move and discarding the row underneath it would take a
   charge with nothing to apply it to.
5. **Stated liveness limit (§15b).** Nothing releases a claim — a thrown Stripe error is exactly the
   case where a PaymentIntent cannot be proven absent — so a claimed row whose intent exists and is
   never confirmed stays un-applied and un-discardable. A TTL reclaim is a later lane, not a
   compensating rollback.
6. **The apply's additions are placed on day 1 when the proposal names no day**, because
   `itinerary_items.day_number` is NOT NULL. That is a PLACEMENT the traveler can move, said out
   loud in the code, not a claim that the AI scheduled it.
7. **D-19's P1 "no money column" pin was REPAIRED, not deleted** (the operating procedure's own
   rule): it now asserts the money columns are EXACTLY the four D-20/D-21 ratified, so a fifth
   fails until a human names it.

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **129** errors = `TSC_BASELINE` 129 (exact; the gate fails on UNDER too) |
| `npm run build` | PASS |
| `node scripts/check-decision-guards.cjs` | OK (0 deferred warnings) |
| `node scripts/check-money-endpoints.cjs --self-test` | OK (37 predicate fixtures) |
| `node scripts/check-money-endpoints.cjs` | exit 0 — the new `stripePaymentIntentId` passes the payment-identity pass by construction (the admission schema is a PICK, parsed from no body) |
| `bash scripts/phase2-fee-gate.sh` | PASS (1 tracked `fee-literal-debt:#PS2`, pre-existing) |
| `node scripts/check-test-files-wired.cjs` | exit 0 — 479/509 reachable; both new suites counted |
| `node scripts/check-traveler-fee-coverage.cjs` (+ `--self-test`) | OK (4 charge paths wired, 0 exempt) / OK (5 fixtures) |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK (305 files, 300 registry entries, 3 grandfathered) |
| migration chain-integrity | 2/2 |
| `node scripts/check-unmounted-routers.cjs` | 58 imported, 58 mounted, 0 dark |
| `grep -c replit.local package-lock.json` | **0** |
| All **300** migrations from an EMPTY local Postgres 16 | 300 newly applied, 300/300 in ledger |
| `proposal-apply-authorization.test.ts` | **9/9** |
| `plan-proposal-charge.db.test.ts` | **7/7** |
| `plan-proposals.db.test.ts` (D-19, P1 repaired) | **7/7** |
| `fee-band-admin-guards.test.ts` (the `owner`/`required` derivation) | **14/14** |

## Not done, deliberately

- **The L16 Ask-AI drawer UI.** This lane is server-only; the dispatch says the drawer is the next
  lane. Nothing client-side calls the two new rails yet.
- **The CREATE rail.** Nothing produces a proposal outside tests — that is still the L16 lane's, and
  it is not the §18c case (a ruled store and its ruled charge point landing ahead of one consumer,
  unreachable from any client by construction).
- **No Stripe network is exercised in CI.** Every leg the DB suite proves is reachable without one;
  the two that are not (verify, create) are proven at the pure layer through the injected seam and
  the asserted key. Stated as negative space in both test headers.
- **`expert_revision`** still has no charge site (LD 41 (f)'s other half, owned by the
  memberships-checkout lane). Untouched.

## Proposed CLAUDE.md sentence (NOT edited by this lane)

In Locked Decision **41 (f)**, after the sentence naming `ai_task` and `expert_revision` as having
no consumption or charge site:

> **`ai_task` NOW HAS ONE (ledger `2026-09-15-d20-d21-proposal-charge`, migration 300).** The AI
> proposal APPLY is the charge point: `coversAction(tripId, "ai_task")` is the FIRST basis of the
> one pure predicate `resolveProposalApplyAuthorization`, so a covered plan applies with
> `charge_basis='trip_pass'`, takes no claim, creates no PaymentIntent and writes no ledger row,
> while an uncovered one is charged FLAT from the `concierge:ai_task` `fee_bands` row — ONCE per
> distinct proposal, idempotent on the proposal id. **`expert_revision` is still unenforced** and
> its owner is unchanged; do not describe it as an enforced benefit.
