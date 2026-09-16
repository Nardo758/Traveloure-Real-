# Lane report — the TRAVELER-CANCELLED component follows the snapshotted policy and deadline (Locked Decision 50, second half)

**Ledger row:** `2026-09-16-bundle-component-traveler-cancel`
**Punchlist:** D-51's recorded remainder ("the traveler-CANCEL component path") STRUCK; the settlement surfaces remain
**Migration:** `308_bundle_component_cancel_terms.sql` — two additive nullable columns on `booking_component_states`:
`cancel_refund_percent` (INTEGER) and `cancel_reason` (TEXT). NO DEFAULT, NO CHECK, NO BACKFILL; both declared in
`shared/schema.ts`; registered in `server/migrations/migration-files.ts`.
**Predecessor:** `2026-09-16-bundle-partial-settlement` (migration 307), which built the seller-FAILURE half of LD 50
and REFUSED a `cancelled` component by name (`traveler_cancel_path_not_built`) because no writer existed. This lane
is that writer and the policy-tiered settlement it feeds.
**CLAUDE.md:** deliberately NOT edited — the sentence is proposed in §6.

---

## 1 · The ruling clause this lane executes (LD 50, third paragraph — verbatim)

> A listing's traveler-cancellation policy does not excuse seller nonperformance: when the seller or provider fails
> to deliver a component, that component's allocated amount is refundable even if the bundle was labeled
> non-refundable; **when the traveler voluntarily cancels an outstanding component, the component's allocated amount
> follows the snapshotted cancellation policy and deadline.**

And from the same ruling: *"Historical purchases always use their stored component, fee, commission, custody, and
cancellation snapshots."*

## 2 · Where the snapshot lives — and why migration 308 pins an OUTCOME, not inputs (brief item 2)

The brief asked this lane to find where the purchase-time policy tier and the component's service instant live, and
to add `policy_tier` + `service_at` only if no per-component snapshot exists. Both inputs already live on the parent
row and need no copy:

| fact | where it already is | why it is the right snapshot |
|---|---|---|
| the policy TIER | `service_bookings.offering_contract_snapshot.policy.cancellationPolicyType` (migration 291, OC-B1), composed at birth from the **bundle** listing | the bundle listing is the ONE listing the traveler contracted with; a component listing's own `cancellation_policy_type` was never shown to them and is not an input. Reading the live `provider_services` row would be exactly the retroactive tightening OC-B1 exists to stop. |
| the DEADLINE | `booking_details.scheduledDate`, read through `hoursUntilScheduledStart` — the SAME parse the whole-row cancel quote uses (extracted in place from `computeCancellationRefund`) | a bundle is ONE booking under ONE service window, so its components share the deadline; and a component cancelled at instant T must resolve the same tier a whole-booking cancel at T would, or the answer depends on which button was pressed (§18 rule 1). |

What NO row held was the policy's **outcome at the cancel instant** — and the policy is a function of that instant.
So 308 adds `cancel_refund_percent`: the ONE resolver's output (`refundPercentFor`, the terms §8.1 schedule) pinned in
the SAME atomic UPDATE that moves the row `pending → cancelled`. A cancelled row can therefore never lack the terms
it was cancelled under; the D-35 mint and the D-51 settlement READ the pin and never re-resolve. The percent is pinned
rather than the cents because a percent cannot disagree with the allocation it applies to — the cents are DERIVED by
ONE pure function, `cancelledComponentRefundCents(allocation, percent)` (`Math.round(allocation × pct / 100)`, the
same half-up rounding the whole-row quote uses), which the mint and the settlement both call.

**§13 — the absences are answers:**
- **NO snapshot on the row** (pre-291, or a composition that failed) ⇒ the cancel is **REFUSED** (`policy_snapshot_missing`):
  the tier the traveler bought under is unknown, and neither today's listing nor a default is substituted. The component
  stays `pending`; the whole-row cancel rail and support remain. Nothing is filed at 0% — "your policy gives 0" would be
  a claim nobody made.
- **A snapshot whose policy is NULL** is a DIFFERENT fact — the listing declared no policy at purchase — and takes the ONE
  normalizer's stance (`normalizeCancellationPolicy`, now exported: flexible, `policyDefaulted: true`), exactly as a
  whole-row cancel of the same booking would.
- **No scheduled date** ⇒ NULL hours ⇒ the most generous tier — the resolver's documented edge case, never a deduction we
  cannot justify.
- **No allocation** (a pre-307 row, an unpriced snapshot) ⇒ the cancel is refused (`allocation_missing`): there is nothing
  to apply a percent to, and the traveler is never shown a share the settlement would later refuse.
- **A `cancelled` row with NO pin** (a row no writer of this rail produced) ⇒ the flip is refused
  (`reducedFiguresRefused: cancel_terms_missing`, the parent stays `confirmed` for a human) AND the money leg refuses by
  the same name. `traveler_cancel_path_not_built` is gone; `cancel_terms_missing` is what replaced it.

## 3 · As built

```
POST /api/bookings/:id/components/:componentServiceId/cancel     (server/routes.ts — traveler-gated, .strict() { reason? })
  └─ recordBundleComponentCancellation                            (booking-completion.service.ts — the third recorder)
       1. principal = the SESSION user, matched to service_bookings.traveler_id (§14); mismatch ⇒ undifferentiated 404
       2. bundle_components rule, component ROWS, known component (as the seller rails)
       3. allocation present AND the bundle's allocations sum to the price (allocationsAreComplete)
       4. resolveSnapshottedCancellationTerms (cancellation-policy.service.ts — PURE):
            tier ← offering_contract_snapshot.policy ; hours ← hoursUntilScheduledStart(scheduledDate, now)
            percent ← refundPercentFor(tier, hours)        (the ONE resolver, reused — never restated)
       5. claimComponentCancelled: UPDATE … SET status='cancelled', cancelled_at, cancel_refund_percent, cancel_reason
            WHERE status='pending' AND parent IN ('confirmed')      ← ONE statement, the guard (§15/§18b)
          loser: currentStatus='cancelled' ⇒ alreadyRecorded with the PINNED terms; anything else ⇒ component_not_pending
       6. re-derive the parent (the ONE derivation): every component conclusive, ≥1 delivered ⇒
            settleBundlePartially(actor: traveler_bundle_component_cancel)
                 leg 1  D-34 flip + D-35 mint   — reducedBundleFigures now keeps Σ delivered allocations + Σ RETAINED
                                                  cancelled remainders; the basis NAMES the retained cents
                 leg 2  issueBundlePartialSettlement — deriveBundlePartialSettlement refunds allocation × pin per
                                                  cancelled component, fees at the REFUNDED fraction; CLAIM → Stripe →
                                                  PROMOTE unchanged, PLUS: traveler_refund_cents == 0 ⇒ NO Stripe call,
                                                  promote with stripe_refund_id NULL
```

**Item 3 of the brief — the money, stated once.** Per cancelled component: `refund = round(allocation × pct / 100)`;
`retained = allocation − refund` stays with the seller and is **minted as delivered value** at the flip
(`reducedBundleFigures`: kept gross = price − Σ failed allocations − Σ cancelled refunds). The mint's `mintBasis` names it:
`basis allocation; N traveler-cancelled component(s) retained X cents under the snapshotted cancellation policy`. The
traveler-paid fees (`travelerChargeForRow(row) − price`, + the traveler service fee) are refunded at the **refunded
fraction** (Σ refunds ÷ price) — terms §8.1 says the percent applies to the fees too, and this is that clause applied
per component. A `failed` component still refunds its FULL allocation with no policy input (nonperformance), and its
outcome states `refundPercent: null` — no policy was applied, and "100" would claim one was.

**Item 4 — `settleBundlePartially` learns `cancelled`.** `ComponentOutcome.outcome` is now
`delivered | failed | cancelled`, each carrying `refundCents`, `retainedCents` and `refundPercent` (pinned percent for
cancelled, NULL otherwise). `nothing_undelivered` now means "no failed AND no cancelled". `undeliveredFraction` /
`undeliveredAllocationCents` were renamed `refundedFraction` / `refundedAllocationCents` because with cancellations the
undelivered share and the refunded share are different numbers; the claim row's `component_outcomes` carries the new
key (no promoted 307 rows exist yet to read the old one).

**Zero-refund settlement (a late strict cancel, a non-refundable bundle).** A VALID settlement that moves no money: the
claim row records the immutable outcome set, no Stripe call is made (there is no amount, and Stripe refuses a zero
refund), `stripe_refund_id` stays NULL — honestly, nothing was refunded — and the row is promoted at once. Component
refund columns are stamped only where `refundCents > 0`: a cancelled row refunded 0 was NOT refunded, and `refunded_at`
on it would say it was. `promoteBundlePartialSettlement`'s `stripeRefundId` is therefore `string | null`; the webhook
promoter still passes a string.

**Item 5 — trigger unchanged.** Settlement fires only when every component is conclusive, from the recorder that
recorded the last answer (now three recorders) and from the sweep; never inside a single component's flip.

## 4 · Proofs

`server/__tests__/bundle-partial-settlement.db.test.ts` (wired into `acceptance-rails`; **17/17**, S1–S8 and S10
untouched):

| | proves |
|---|---|
| S9 (re-pinned) | a `cancelled` row with NO pin refuses the FLIP (`component_prices_unknown` / `reducedFiguresRefused: cancel_terms_missing`, parent stays `confirmed`) and the money leg + sweep refuse by the same name; no Stripe |
| S11 | OC-B1 snapshotted the BUNDLE listing's tier at birth; two concurrent cancels ⇒ ONE flip, the loser handed the PINNED terms; `cancelled_at`, `cancel_refund_percent` and the trimmed `cancel_reason` written by the one UPDATE; refusals by name — `component_not_pending` (current status stated), `not_traveler`, `unknown_component`; static pin: the route body is a `.strict()` pick reading no amount/percent/status and the principal is the SESSION user |
| S12 | flexible, cancelled 240h out ⇒ 100%: ONE Stripe refund of 23.00 (the S2 amounts by the traveler's door), outcome `cancelled/2000/retained 0/pct 100`, the component's refund columns stamped, the basis does NOT say "retained", a retry converges |
| S13 | moderate, 72h out ⇒ 50%: refund 11.50 (10.00 + 10% of each fee), settled 90.00, seller 67.50 / platform 22.50 (the purchase-time commission × 0.9), mint description names `retained 1000 cents under the snapshotted cancellation policy`, `refundedFraction` 0.1 |
| S14 | strict, 24h out ⇒ 0%: NO Stripe call, settlement promoted with NULL refund id, `traveler_refund_cents` 0, no `refunds` row, component `refunded_at` NULL, full mint (100/25/75) with `retained 2000 cents` named, parent `partially_completed` never `completed`, sweep scans nothing, retry converges |
| S15 | mixed: B failed (4000) + C cancelled at 50% (1000) ⇒ ONE settlement, ONE Stripe call of 57.50, settled 5000, both components stamped with their own cents, outcomes name `failed/null` and `cancelled/50` distinctly |
| S16 | NULL `offering_contract_snapshot` ⇒ `policy_snapshot_missing`, component stays `pending`, nothing moves; static pin that the recorder never reads the live listing; a snapshot with a NULL policy ⇒ flexible, `policyDefaulted: true`; a pre-307 row ⇒ `allocation_missing` |
| S17 | the listing tightened to `non_refundable` AFTER purchase ⇒ still flexible/100%; the booking rescheduled to tomorrow AFTER the cancel ⇒ the settlement reads the PIN (2300, pct 100), `cancel_refund_percent` never moved |

`shared/__tests__/bundle-partial-settlement.test.ts` (same job; **9/9**): SP5 renamed fields; SP8 re-pinned
(`cancel_terms_missing`; failed states `refundPercent: null`); **SP9** — the one arithmetic (half-up, deterministic),
pin validity, the mint's retained remainder at 50/0/100 and its refusal without a pin, the snapshot fallback stated,
the settlement's per-component outcomes, the fee share at the refunded fraction, a zero-refund settlement, mixed, and
"the pin is the input, never a re-resolution".

Neighbours re-run green: `bundle-component-states.db.test.ts` 10/10, `bundle-component-states.test.ts` 6/6.

## 5 · Validation

| Check | Result |
|---|---|
| tsc `error TS` count | 129 (baseline) |
| `npm run build` | green |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + run | 37 fixtures OK / exit 0 (the new route reads only `reason` off a `.strict()` body; every amount comes from rows) |
| `phase2-fee-gate.sh` | exit 0 |
| `check-test-files-wired.cjs --self-test` + run | 12/12; `test-orphan-ratchet: OK` (no new suite files — both suites extended in place) |
| `check-duplicate-migration-prefixes.cjs` | OK (308 registry entries) |
| `check-undeclared-tables.cjs` (local DB) | no undeclared tables |
| chain-integrity | 2/2 |
| migrations from EMPTY (local Postgres 55550) | 307 → 308 applied; second run 0 applied / 308 skipped; both columns present |
| mutation-auth manifest + coverage | regenerated for the ONE new rail (`POST /api/bookings/:id/components/:componentServiceId/cancel` — user-data, required auth, session-self, ownership-applies); `check:mutation-auth` and `check:mutation-auth-coverage` exit 0 |
| new/extended suites | 17/17 DB, 9/9 pure |
| `grep -c replit.local package-lock.json` | 0 |

## 6 · Proposed CLAUDE.md sentence (NOT applied — appended to Locked Decision 50)

> **THE TRAVELER-CANCEL HALF LANDED (ledger `2026-09-16-bundle-component-traveler-cancel`; migration 308).** The
> writer is `POST /api/bookings/:id/components/:componentServiceId/cancel` — traveler-gated (§14, undifferentiated
> 404), `.strict()` `{ reason? }` body, ONE atomic conditional `pending → cancelled` with the parent `confirmed` in the
> same WHERE. The SNAPSHOT is what the row already holds: the tier is the BUNDLE listing's
> `offering_contract_snapshot.policy.cancellationPolicyType` (migration 291 — never the live listing, never a
> component listing's own policy) and the deadline is `booking_details.scheduledDate` through the whole-row quote's
> SAME parse (`hoursUntilScheduledStart`); the ONE resolver `refundPercentFor` yields the percent, which is PINNED as
> `booking_component_states.cancel_refund_percent` in the flip itself, so the mint and the settlement READ it and never
> re-resolve — a later policy edit, reschedule or clock moves nothing. Refund = `allocation × percent` (ONE function,
> `cancelledComponentRefundCents`); the remainder is RETAINED by the seller and minted as delivered value, NAMED in the
> mint's basis; fees follow at the refunded fraction. A `failed` component still refunds in full with no policy input.
> §13: no snapshot ⇒ the cancel is REFUSED (`policy_snapshot_missing`), never today's listing or a default; no
> allocation ⇒ refused; a `cancelled` row with no pin refuses the flip AND the settlement (`cancel_terms_missing`); a
> policy that yields 0 settles with NO Stripe call and a NULL refund id, and stamps no `refunded_at`.

## 7 · Deliberately left, named

- **Surfaces**: no traveler or seller UI calls the new rail or renders a settlement yet (LD 42 D9 audience for the
  traveler). The rail returns the stated terms so a surface can show them before a confirm.
- **A pre-cancel PREVIEW endpoint** for a component (the `cancel-preview` twin) is not built; the response of the
  cancel itself states the terms. If a preview lands it must call `resolveSnapshottedCancellationTerms` — never the
  live-join `quoteCancellationForBooking`.
- **The whole-row cancel rail still reads the LIVE listing policy** (`quoteCancellationForBooking` joins
  `provider_services`) — OC-B1's stated gap, unchanged here; moving it onto the snapshot is its own lane and must reuse
  `resolveSnapshottedCancellationTerms`.
- **`refunded` component status** still has no writer; a row already reading it refuses (`component_already_refunded`).
- **Nothing releases capacity** on a component cancel (LD 50 paragraph 4); no per-component slot model exists.
- **The snapshot fallback** (`snapshot_pro_rata`, pre-307 rows) still reads `cancelled` as fully undelivered and
  retains nothing — stated in code; unreachable through this writer, which refuses `allocation_missing`.
