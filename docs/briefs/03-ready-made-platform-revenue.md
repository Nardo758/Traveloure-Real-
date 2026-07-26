# Brief 03 — Record `platform_revenue` on ready-made sales (+ reverse on refund)

**Tier:** Sonnet. **Migration:** none expected (`platform_revenue` exists and has no CHECK on
source types — verify before assuming). **Money-path: YES — HARD STOP for human read before
merge.** **Est. size:** ~80 LOC + gate assertions.

## Problem

`fulfillReadyMadePurchase` (`server/services/ready-made-purchase.service.ts`) records the
author's earning (born `held`, band-resolved ~75%) but never records the **platform's share**
(`pricePaidCents − expertEarnings`) as a `platform_revenue` row. Revenue reporting undercounts
every ready-made sale. (The template marketplace has the same historical gap — do NOT fix it
here; log it in your report.)

## Scope

### 1. Record at fulfilment

Inside `fulfillReadyMadePurchase`, in the SAME branch that inserts the expert earning (i.e. only
when the atomic `paid → cloned` claim actually flipped the row — this is what makes the revenue
write ride the existing §15 idempotency; a re-fulfil that hits `alreadyFulfilled` must not write
revenue):
- Find the existing revenue-recording helper by reading how other sources record
  (`grep -rn "platform_revenue\|recordRevenue" server/ --include=*.ts` — the coordination-fee
  confirm and the marketplace template confirm are the reference patterns). Use the SAME helper/
  insert shape; do not invent a new one.
- Row: source/sourceType for ready-made sales (pick the vocabulary the existing rows use, e.g.
  `ready_made_sale`), `sourceId = purchase.id`, amount = platform share **derived from the same
  numbers already computed in the function** (price minus the band-resolved expert share — no
  re-derivation, no literals; §8: the rate came from `fee_bands` upstream).
- Idempotency belt-and-braces: before inserting, check no `platform_revenue` row exists for this
  `sourceId` + source (mirrors how the confirm endpoints guard).

### 2. Reverse at refund

In `refundReadyMadePurchaseLedger`, in the SAME branch that reverses the earning (row actually
flipped to `refunded`): reverse the revenue using the documented double-entry pattern
(CLAUDE.md §15 Phase 4): insert a **compensating negative** `platform_revenue` row and flip the
original row's status to `reversed` as the idempotency guard (find and reuse
`reversePlatformRevenueForBooking`'s shape — it is booking-scoped, so you will likely add a
sibling scoped to the purchase sourceId rather than forcing bookings semantics; reuse its
internals if the storage layer allows).
- The duplicate-refund path (`alreadyRefunded`) must not produce a second negative row.

## Traps

- §14: every amount comes from the stored purchase row / already-computed split. Nothing from
  request bodies (these are service functions — keep it that way).
- §8: no rate literals. The 25% seed exists in `fee_bands` (`ready_made_trip` band); the split
  is already computed with `getBand` + fallback in the service — consume its output.
- Do NOT change the earning logic, the clone logic, or the atomic claims. You are adding two
  writes inside existing guarded branches.
- If `platform_revenue` has a constrained source-type vocabulary (CHECK or enum), STOP and
  report rather than adding a migration on your own authority.

## Gate

Extend `scripts/verify-ready-made-phase2.ts`:
- 5d: after fulfil — exactly one `platform_revenue` row for the purchase, amount =
  `9900 − earning` (use the same band-perturbation-safe arithmetic the section already uses);
  after the duplicate re-fulfil — still exactly one.
- 5e: after refund — original row `reversed` + one negative row netting to zero; after duplicate
  refund — still exactly one negative row.
Also run `scripts/flush-store-loop.ts` (25 checks, must stay green) + the standard four gates.

## HARD STOP

Money-path: after gates pass, push the branch and STOP for the decision-maker's read of the
diff before any merge. State plainly in your report which rows are written where.
