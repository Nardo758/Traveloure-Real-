# Lane report — D-51: a partially fulfilled bundle settles ONCE by its purchase-time component allocation

**Ledger row:** `2026-09-16-bundle-partial-settlement` (the ruling recorded verbatim, in its own commit, before code)
**Punchlist:** D-51 ANSWERED (same commit)
**Migration:** `307_bundle_partial_settlements.sql` — additive nullable `booking_component_states.allocation_cents`
and ONE new table `bundle_partial_settlements` (UNIQUE (booking_id)); NO DEFAULT on any decision-bearing column,
NO CHECK, NO BACKFILL; column + table + UNIQUE declared in `shared/schema.ts`; registered in
`server/migrations/migration-files.ts`.
**Predecessor:** `2026-09-16-d32-d35-bundle-components` (migration 306), which STOPPED on the component refund
and recorded the owed share on the row. This lane pays it.
**CLAUDE.md:** deliberately NOT edited — the coordinator lands the ruling as Locked Decision 50 in a parallel doc PR.

---

## 1 · The ruling (decision-maker text, locked — recorded verbatim in the ledger row and D-51)

> A PARTIALLY FULFILLED BUNDLE SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT ALLOCATION. Every Traveloure-custody bundle must snapshot a nonnegative gross allocation for each required component when purchased, and those allocations must sum exactly to the bundle's pre-fee purchase price. A component's current catalog price, seller tier, or later configuration must never change that snapshot.
>
> When final bundle fulfillment establishes that some required components were delivered and others will not be delivered, Traveloure records one partial settlement. The seller earns only the purchase-time allocated value of the delivered components, less the commission applicable to the original purchase. The traveler is refunded the allocated value of the undelivered components plus the same proportional share of traveler-paid Traveloure fees and surcharges. Stripe processing costs are not deducted from the traveler's refund; Traveloure absorbs any nonrecoverable processing cost.
>
> A listing's traveler-cancellation policy does not excuse seller nonperformance. When the seller or provider fails to deliver a component, that component's allocated amount is refundable even if the bundle was labeled non-refundable. When the traveler voluntarily cancels an outstanding component, the component's allocated amount follows the snapshotted cancellation policy and deadline.
>
> Partial settlement is not whole-row cancellation. The booking remains fulfilled in part, records component-level outcomes, and must not use the terminal whole-row `refunded` state or release all reserved capacity. The settlement creates reduced seller earnings, proportional platform revenue, an amount-specific refund audit record, and a Stripe refund to the original payment method as one retry-safe operation.
>
> The settlement amount and component outcome set are immutable after successful settlement. Repeated requests, concurrent requests, Stripe retries, and webhook redelivery must converge on one seller earning, one platform-revenue result, and at most one Stripe refund for the settled amount. Historical purchases always use their stored component, fee, commission, custody, and cancellation snapshots.
>
> Traveloure may issue refunds only for components whose payment custody belongs to Traveloure. Affiliate or partner-custody components retain the external partner's cancellation and refund process and must not produce a Traveloure Stripe refund.

## 2 · As built

```
checkout composer ──> component rows born WITH allocation_cents      (allocateBundleCents: pro-rata of total_amount,
                                                                      largest-remainder, Σ == price EXACTLY; NULL if unpriced)
        │
 component recorders (owner rails) ── last conclusive answer, ≥1 delivered, ≥1 failed
        ▼
 settleBundlePartially(bookingId)                ← the ONE entry (booking-completion.service.ts)
   ├─ leg 1  settleBundlePartialCompletion       confirmed → partially_completed + the D-35 mint (UNCHANGED; now
   │                                             reads allocation_cents first, basis NAMED in the ledger description)
   └─ leg 2  issueBundlePartialSettlement        (bundle-partial-settlement.service.ts)
              deriveBundlePartialSettlement      pure: custody → allocation → outcomes → amounts
              CLAIM     INSERT bundle_partial_settlements … ON CONFLICT (booking_id) DO NOTHING   (amounts PINNED)
              STRIPE    stripePaymentService.refundBundlePartialSettlement  → the ONE call site, key bundle-settle-<id>
              PROMOTE   UPDATE … SET settled_at, stripe_refund_id WHERE booking_id=? AND settled_at IS NULL
                        + failed components' refunded_at / refund_amount_cents / stripe_refund_id
 nightly sweep  sweepUnsettledBundlePartials     partially_completed rows with no row / unpromoted row → leg 2 (TTL reclaim)
 webhook        charge.refunded (metadata.source = bundle_partial_settlement) → promoteBundlePartialSettlement (2nd promoter)
```

### 2a · The allocation derivation (brief item 1)

`allocateBundleCents(priceCents[], totalCents)` in `shared/bundle-component-states.ts`: each component's exact share is
`price × total / Σprice`; every share is FLOORED; the leftover cents (always fewer than the component count) go one each
to the largest fractional remainders, ties broken by snapshot POSITION (earlier first). Result: nonnegative integers
summing EXACTLY to `total_amount` in cents, deterministic for a given snapshot. 60/40 sold for 95.00 ⇒ 57.00/38.00;
40/40/20 sold for 100.01 ⇒ 40.01/40.00/20.00; 3×10 sold for 100.00 ⇒ 33.34/33.33/33.33. Returns NULL (NOT CAPTURED, §13)
for any missing/negative price, a zero-priced snapshot, or a non-integer/negative total — never an equal split. Derived
ONCE in `bornBundleComponentRows` from the ROW's own `total_amount` as just written (`storage.createServiceBooking`),
over the DEDUPED component list so a duplicate id cannot break the exact sum. `snapshot_price_cents` stays the catalog
fact; `allocation_cents` is the contract fact. `allocationsAreComplete(rows, totalCents)` is the ONE test of "may the
allocation be read as the contract": every row carries one AND they sum to the price.

### 2b · The refund service extension (brief item 3)

`refundServiceBooking` was split IN PLACE into two private halves that it still drives verbatim:

- `createStripeRefundForBooking({paymentIntentId, amountCents, stripeReason, idempotencyKey, metadata})` — the ONE
  `stripe.refunds.create` call site for service bookings (the literal now appears once in the module). Takes NO claim,
  flips NO status, throws the RAW Stripe error so each caller applies its own posture.
- `recordIssuedRefund({bookingId, paymentIntentId, refund, amount, internalReason, feeRefund, feeReversalActor})` — the
  `refunds` audit row + the traveler-service-fee `reversal` ledger row (best-effort, as before).

The whole-row rail is behaviourally unchanged: same status claim, same revert-on-Stripe-failure, same audit row, same
earnings/platform-revenue sweep, same slot release (`traveler-fee-refund` 5/5 and `refund-retry-convergence` 6/6 re-run
green). The NEW public `refundBundlePartialSettlement({bookingId, paymentIntentId, amountCents,
travelerServiceFeeRefund, internalReason})` drives both halves with the CLAIM ROW's pinned cents, key
`bundle-settle-<bookingId>` (the brief's literal — unambiguous because the pinned amount never changes; a retry re-reads
the same cents), `metadata.source = 'bundle_partial_settlement'` (so the webhook can tell it from `service_booking`),
and does NOT sweep earnings, revenue or slots. The settlement's §15b posture: a Stripe failure leaves the claim
CLAIMED-BUT-UNPROMOTED (never a compensating rollback); inside `BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES` a second caller is
told `settlement_in_progress` and makes NO Stripe call; the sweep past the TTL re-stamps `claimed_at` and re-drives.

### 2c · What the settlement does NOT reverse, and why (brief items 4 and 5 — stated)

The D-35 mint at the `partially_completed` flip ALREADY records only the kept share: `platform_revenue.platform_fee`
= the row's purchase-time `platform_fee` × keptFraction, `provider_earnings` = `provider_earnings` × keptFraction.
That IS "reduced seller earnings, proportional platform revenue" and "the commission applicable to the original
purchase" (the resolver's output at purchase, SCALED — never re-resolved). So this lane does **not** call
`reversePlatformRevenueForBooking` on the commission row — the only `platform_revenue` row keyed to a booking —
because a second proportional reversal would deduct the undelivered share TWICE; and `reverseEarningsForBooking`
stays 100%-only and uncalled. The D-9 punchlist row's older sentence ("reverses only that component's share through
the proportional reversal") predates D-35's choice and is superseded by it. The mint now reads `allocation_cents`
first (`basis: 'allocation'`, gross = Σ delivered allocations exactly) and falls back to the D-35 snapshot pro-rata
(`basis: 'snapshot_pro_rata'`) for a pre-307 row; `mintBasis` NAMES which in every minted description (S2/S10 pin it).

The traveler's side is what this lane settles: refund = undelivered allocation + `undeliveredFraction ×
(travelerChargeForRow(row) − total_amount)` (A3: the concierge fee; pre-A3: the platform fee + insurance that row was
really charged) + `undeliveredFraction × booking_details.travelerServiceFee.charged` (0 when waived) — composed through
the ONE `travelerChargeForRow`, never recomposed (§18 rule 1). No processing cost is subtracted anywhere. The
traveler-service-fee share is reversed on `fee_ledger` through the EXISTING `recordTravelerServiceFeeReversal`.

### 2d · Custody (brief item 6)

No per-component custody column exists on `main`. The existing marker is the one `docs/audits/booking-custody-map.md`
names: TABLE IDENTITY + the row's own `stripe_payment_intent_id`. Every component of a `service_bookings` bundle is a
`provider_services` row (`bundle_components` FK) bought under that PaymentIntent, so its custody is Traveloure's by
construction; affiliate/partner purchases live in other tables and never become bundle components. The pure derivation
therefore refuses `custody_unknown` when the parent has no PaymentIntent (never assumes), and refuses
`component_custody_not_traveloure` for a component view carrying an explicit non-Traveloure marker (the hook a later
lane's column would use). Each settlement row's `component_outcomes` records `custody` per component.

### 2e · Path (7): seller-failure ONLY; the traveler-cancel path is recorded as the next lane

Built: a `failed` component refunds its FULL allocation with no policy input at all — `deriveBundlePartialSettlement`
has no parameter through which a cancellation tier could arrive, which is the point (SP8). NOT built: the traveler's
voluntary cancel. Reason: `cancelled` has no component-level WRITER on `main` (the D-32 report said so — "declared so the
derivation reads it, no writer"). Rather than settle under a guessed tier, a bundle carrying a `cancelled` component is
REFUSED (`traveler_cancel_path_not_built`, S9/SP8) while the parent still flips and mints (the derivation of the parent
is unchanged). The resolver the next lane reuses is `refundPercentFor` in `server/services/cancellation-policy.service.ts`
(the `terms.tsx` §8 percentages, already the ONE resolver); the snapshot it will read is the listing's policy AT
PURCHASE, which today lives on no component row — that lane decides where.

### 2f · Trigger (brief item 8)

`settleBundlePartially` is called from the two component recorders exactly where `settleBundlePartialCompletion` fired
before — after the ONE derivation says every component is conclusive and at least one failed — and from nowhere else.
No Stripe call happens inside a single component's atomic flip. A recorder that LOSES the flip race to a concurrent
recorder re-reads the row and, if it is now `partially_completed`, still runs the idempotent money leg so both callers
converge on the one settlement. The nightly sweep (`server/index.ts`, daily beside the reconciliation job) drives leg 2
for `partially_completed` rows with no settlement row or an unpromoted one; it decides nothing of its own.

## 3 · Proofs

`server/__tests__/bundle-partial-settlement.db.test.ts` (wired into `acceptance-rails`, 10/10; `Stripe.refunds.create`
stubbed on the shared prototype — no network):

| | proves |
|---|---|
| S1 | birth writes `allocation_cents` summing EXACTLY to `total_amount` (undiscounted, discounted 95.00 ⇒ 57/38, odd-cent 100.01 ⇒ 40.01/40/20); an unpriced snapshot leaves it NULL; the storage call passes the ROW's total (comments-stripped pin) |
| S2 | end to end: flip + reduced mint (80/20/60), ONE Stripe refund of 23.00 (20.00 allocation + 20% of 5.00 concierge + 20% of 10.00 traveler fee) under `bundle-settle-<id>` with the settlement source in metadata; ONE settlement row promoted with pinned amounts and the outcome set; ONE `refunds` row (23.00, keyed to the booking); the failed component's refund columns stamped, its status still `failed`; delivered components untouched; status STAYS `partially_completed`, `total_amount` unchanged; ONE positive `platform_revenue` row, NO negative reversal row, earnings `held`; the mint description names `basis allocation` |
| S3 | retry ⇒ `alreadySettled`, `flipped: false`; still one Stripe call, one row, one `refunds` row, three ledger rows; `settled_at` never moves; the whole-row flip still refuses a second time |
| S4 | two CONCURRENT money-leg callers ⇒ one winner, one Stripe call, one row; the loser converges (`alreadySettled` or `settlement_in_progress`) with no Stripe call |
| S5 | Stripe throws ⇒ flip + mint stand, claim left claimed-but-unpromoted with the amount PINNED, no `refunds` row; inside the TTL a retry AND the sweep make NO Stripe call (`settlement_in_progress`); past the TTL the sweep reclaims, refunds the SAME cents under the SAME key, promotes; a further sweep scans nothing |
| S6 | webhook redelivery: a claimed-unpromoted row is promoted by `charge.refunded` ONCE (component stamped), the second delivery matches zero rows; the direct promoter and a late settlement both converge; a `service_booking`-sourced webhook touches no settlement |
| S7 | HISTORICAL SNAPSHOT: repricing every listing tenfold after purchase moves nothing — same 23.00, same 8000/6000/2000, same ledger |
| S8 | CUSTODY: no PaymentIntent ⇒ `custody_unknown`; no Stripe call, no row; the sweep refuses it for the same named reason |
| S9 | FAILED vs CANCELLED: a `cancelled` component ⇒ parent flips (derivation unchanged) but the settlement refuses `traveler_cancel_path_not_built` naming the component; no Stripe call |
| S10 | a pre-307 row (NULL allocations) mints by `snapshot_pro_rata` (named) and cannot settle: `allocation_missing`, no Stripe call; the sweep says so too |

`shared/__tests__/bundle-partial-settlement.test.ts` (same job, 8/8): SP1 discount allocation; SP2 odd cents /
determinism / property sweep; SP3 not-captured cases; SP4 `reducedBundleFigures` basis (allocation first, snapshot
fallback, drifted total ⇒ snapshot, NULL snapshot sums never 0); SP5 the derivation's figures; SP6 catalog price is not
an input; SP7 custody; SP8 the failed/cancelled asymmetry and every named refusal (custody checked before allocation).

**Neighbour re-pinned, never deleted:** `bundle-component-states.db.test.ts` C4b nulled only `snapshot_price_cents`
to simulate a pre-D-33 row; under 307 such a row has no allocation either, so it now nulls both (a row whose allocation
survives is settled on the contract fact BY DESIGN — SP4). The same suite gained the Stripe prototype stub, because
reaching `partially_completed` now runs the money leg and a test must never dial out.

## 4 · Validation

| Check | Result |
|---|---|
| tsc `error TS` count | 129 (baseline) |
| `npm run build` | green |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + run | 37 fixtures OK / exit 0 (no body-sourced amount anywhere — every settlement amount is derived from rows) |
| `phase2-fee-gate.sh` | exit 0 |
| `check-test-files-wired.cjs --self-test` + run | 12/12; `test-orphan-ratchet: OK` (both new suites wired into `acceptance-rails`) |
| `check-duplicate-migration-prefixes.cjs` | OK (307 registry entries) |
| `check-undeclared-tables.cjs` (local DB) | no undeclared tables |
| chain-integrity | 2/2 |
| migrations from EMPTY (local Postgres 55530) | 307 applied; second run 0 applied / 307 skipped; `allocation_cents` and `bundle_partial_settlements_booking_unique` present |
| new suites | 10/10 DB, 8/8 pure |
| neighbours | bundle-component-states 10/10 (C4b re-pinned), bundle derivation 6/6, traveler-fee-refund 5/5, refund-retry-convergence 6/6, booking-birth-provenance 12/12, declared-completion 16/16, acceptance-rails 20/20 |
| `grep -c replit.local package-lock.json` | 0 |
| mutation-auth manifest | untouched — no route added or removed (the two rails gained a response field only) |

## 5 · Deliberately left, named

- **The traveler-CANCEL component path** (ruling paragraph 3, second sentence): no `cancelled` writer exists; a bundle
  carrying one is refused, never guessed. Next lane; reuses `refundPercentFor`; must decide where the per-component
  policy snapshot lives.
- **Surfaces**: the seller's and traveler's read-out of a settlement (LD 42 D9 audience for the traveler). The rails
  expose `settlement` on their responses; nothing renders it yet.
- **A `refunded` component status** still has no writer; a row already reading it refuses (`component_already_refunded`).
- **The `refunds` audit row is keyed to the booking**, as for every refund; a settlement-keyed read (join through
  `bundle_partial_settlements.stripe_refund_id`) is available but no reader uses it yet.
- **The webhook's pre-existing charge-level `refunds` insert** (no `booking_id`, not deduped) is untouched — outside
  this lane; the settlement's own audit row is the promoted one the issuer writes.
- **Nothing releases capacity** on a partial settlement (ruling paragraph 4); a per-component slot model does not exist.

## 6 · Proposed CLAUDE.md sentence (NOT applied — the coordinator lands the ruling as Locked Decision 50)

> **A PARTIALLY FULFILLED BUNDLE SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT ALLOCATION (decision-maker ratified
> Sep 16, 2026 — ledger `2026-09-16-bundle-partial-settlement`; migration 307).** `booking_component_states.
> allocation_cents` is the CONTRACT fact beside D-33's catalog fact: derived ONCE at birth as the pro-rata share of
> `total_amount` with deterministic largest-remainder rounding so the allocations SUM EXACTLY (`allocateBundleCents`),
> NULL = not captured and blocks settlement (§13), never re-read from the listing. `bundle_partial_settlements`
> (UNIQUE (booking_id) — the §15 claim; amounts PINNED at claim; `settled_at IS NULL` = reclaimable, §15b) is the ONE
> non-terminal settlement record: the booking STAYS `partially_completed`, never `refunded`, and no capacity is
> released. The seller's reduced earning and the proportional platform revenue ARE the D-35 mint (now reading the
> allocation, basis NAMED), so the settlement reverses neither; it refunds the traveler the undelivered allocation plus
> the same share of every traveler-paid fee (`travelerChargeForRow` − price, + the traveler service fee) through the
> ONE Stripe refund call site (`createStripeRefundForBooking`, two callers), key `bundle-settle-<bookingId>`, promoted by
> the settlement and by the `charge.refunded` webhook through one atomic conditional. Custody is the parent's
> PaymentIntent (no PI ⇒ unknown ⇒ refused). A `failed` component refunds its FULL allocation regardless of policy;
> the traveler-cancel path is NOT built and a `cancelled` component refuses the settlement by name.
