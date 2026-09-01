# Phase 0 — traveler-fee-collection: payment-path classification (READ-ONLY)

**Lane:** `claude/traveler-fee-collection` · **Ruling:** `2026-09-02-traveler-fee-applies-everywhere`
**Branch base:** `origin/main` @ `4644af6` · **as-of** this SHA · **Status:** HARD STOP — awaiting Leon's ratification.
**Nothing charged has been changed.** This is the read-only classification the dispatch requires before any charge edit.

> The traveler service fee is **computed but never charged on any path today** (finding
> `fee-not-billed-on-direct-path`). `resolveTravelerServiceFee` (`server/services/fee-resolution.service.ts:271`)
> is the sole band-driven calculator (rate + cap from `fee_bands` band `traveler_service_fee`); it is called
> today ONLY in the *informational* waiver counterfactual (`resolveTripPassFeeWaiver`) and the fee-preview
> display. No Stripe `amount` on any path includes a traveler-fee term.

---

## Classification legend

- **(a) traveler-pays-Traveloure for a provider/third-party service** → **fee APPLIES** (ruling scope).
- **(b) provider payout / transfer** (money leaving Traveloure to a provider) → **no fee** (not a traveler charge).
- **(c) Traveloure's own product** (Trip Pass, optimizer run, concierge task, itinerary template) → **fee does NOT apply** per the dispatch's own carve-out, unless Phase 0 ratifies otherwise.
- **(?)** = classification I cannot settle from the code alone; flagged for Leon below.

---

## The table

| # | Path (route → charge site) | file:line | Class | Fee applies? | Where the fee would be added | Ledger row | Trip-Pass suppression path |
|---|---|---|---|---|---|---|---|
| 1 | **Cart / direct checkout** `POST /api/checkout` → `authorizeAndPromote` → `createPaymentIntent` | `payments.routes.ts:493` (total composed `:478`); helper `stripe-payment.service.ts:426` | **(a)** | **YES — primary path the finding names** | `fullTotal` at `payments.routes.ts:478` (`subtotal+platformFee+conciergeFee+surchargeTotal` — add `travelerFee` term); server-derived via `resolveTravelerServiceFee(subtotal)` | new `traveler_service_fee` row, `borneBy:"traveler"`, written at the authorization stamp beside `recordRailsFeeLedger` (`payments.routes.ts:560`) | already wired: `coversAction(tripId,"traveler_service_fee")` + `resolveTripPassFeeWaiver` pre-pass at `payments.routes.ts:1269-1284`; snapshot on row (`:1541`). Today it only records a counterfactual — must become a real `{waived:true}` resolve + `covered_by` event. |
| 2 | **Deposit-balance checkout** `POST /api/bookings/:id/pay-balance` → `createPaymentIntent` | `payments.routes.ts:1748` | **(a) — but see flag D** | **once per booking, NOT twice** | If the fee is billed at DEPOSIT time on the full subtotal, the balance leg adds **nothing** (would be a double fee). | none on the balance leg (fee row belongs to the deposit leg) | inherits the booking's deposit-leg decision; no separate suppression. |
| 3 | **Legacy `bookings` rail** `POST /api/bookings/process-cart` (`/booking-demo`, `/itinerary-comparison/:id`) → `processCart` → `createPaymentIntent` | `booking.service.ts:472` (total `:456`) | **(a)** | **YES (parity) — see flag E** | `totalAmount` accumulation at `booking.service.ts:456` (`finalPrice + platformFee`) — add traveler fee | new `traveler_service_fee` row, `sourceType:"booking"` (legacy rail) | this rail has NO Trip-Pass pre-pass today; would need the same `coversAction` gate wired in, OR be declared out-of-scope (legacy/demo). |
| 4 | **Transport booking** `stripe.checkout.sessions.create` (transport-commerce) | `stripe.service.ts:136` | **(?)** flag A | **UNDECIDED** | line item is `priceCents × travelers` with **no platform fee at all** today; a fee would be a new line/`line_item` | `traveler_service_fee`, `sourceType:"service_booking"` (transport rows are `service_bookings` w/ NULL `service_id`) — IF ratified | none today. |
| 5 | **Expert review service** `POST /api/expert-requests/payment-intent` → `createExpertServicePaymentIntent` | `booking-actions.ts:131` → `stripe-payment.service.ts:1103` | **(?)** flag B | **UNDECIDED** (review / review_and_book / **full_concierge**) | `amount` from `resolveExpertReviewAmount(serviceType, totalCost)` at `booking-actions.ts:128` | `traveler_service_fee` if (a); or treated as concierge product (c) | none today. |
| 6 | **Coordination fee** `stripe.paymentIntents.create` (`type:"coordination_fee"`) | `routes.ts:9819` | **(c) platform fee itself** | **NO — do not stack** | n/a — coordination IS a Traveloure fee (`fee_bands` `coordination_floor`/`coordination_percent`, §8) | n/a (its own ledger story, separate) | n/a |
| 7 | **Optimizer run** `stripe.paymentIntents.create` (`type:"optimization_fee"`) | `optimization.routes.ts:356` | **(c)** | **NO** | n/a — Traveloure's own product | n/a | n/a |
| 8 | **Ready-made trip purchase** `stripe.paymentIntents.create` (`type:"ready_made_purchase"`) | `ready-made.routes.ts:1273` | **(c) — but see flag C** | **NO (per ruling carve-out)** | n/a | n/a | n/a |
| 9 | **Itinerary template purchase** `stripe.paymentIntents.create` (`type` via metadata `templateId`) | `routes.ts:5314` | **(c) — but see flag C** | **NO (ruling names "itinerary template" explicitly)** | n/a | n/a | n/a |
| 10 | **Trip Pass purchase** `stripe.paymentIntents.create` (`type:"trip_pass_purchase"`) | `trip-pass.routes.ts:88` | **(c)** | **NO** | n/a — Traveloure's own product (and the thing that SUPPRESSES the fee elsewhere) | n/a | n/a |
| 11 | **Provider payout** `stripe.transfers.create` | `stripe-connect.service.ts:120` | **(b)** | **NO** | n/a — money leaving Traveloure to a provider | n/a | n/a |
| — | `createExpertServiceCheckout` (hosted) | `stripe-payment.service.ts:1167` | **dead** | — | grep finds **no route caller** — unmounted; no decision needed, noted for completeness. | — | — |

Shared helper `stripe-payment.service.ts:426` (`createPaymentIntent`) backs paths 1/2/3; it charges the `amount` its caller passes, so the fee is added by the **caller**, not inside the helper (keeps one calculator, one composition site per path).

---

## Preview-vs-charge divergence (the dispatch asks this be flagged explicitly)

**Only path 1 (cart) has a preview.** `GET /api/cart/fee-preview` (`payments.routes.ts:1823`) composes
`total = subtotal + platformFeeTotal + conciergeFeeTotal + travelSurcharge` at `:2024` — **no traveler-fee term**,
and stamps `tripPassFeeWaiver.billedOnDirectPathToday:false` at `:2036`.

⇒ **When path 1 starts billing, the preview MUST add the same fee in the same commit**, or the quoted total
(preview) and the charged total (checkout) diverge. This is not optional — it is the pair the dispatch names
("preview matches charge"). The existing tripwire test (`fee-preview-entitlement.http.test.ts` assertion C,
`total unchanged` with a pass) flips from tripwire to **expectation** in that commit, and `billedOnDirectPathToday`
becomes `true`. No other path (2–11) has a preview endpoint to keep in sync.

---

## Blockers & flags requiring Leon's decision BEFORE any charge change

**BLOCKER 1 — the ruling's "$0 `covered_by` ledger event" is structurally impossible in the current table.**
`fee_ledger` has `CONSTRAINT fee_ledger_amount_nonzero CHECK (amount <> 0)` (migration `179_fee_ledger.sql:77`),
and `appendFeeLedgerRows` (`fee-ledger.service.ts:65`) actively **skips zero-amount rows** with a warning. There
is also **no `covered_by` value** in `FEE_LEDGER_TYPES` (`shared/schema.ts:7004` — the 8 types are
`traveler_service_fee, provider_commission_full, provider_commission_rails, expert_commission, ai_concierge_fee,
affiliate_margin, credit_applied, reversal`). So a literal "$0 event tagged covered_by" cannot be written.
**Recommended shape (needs ratification):** represent suppression as **two non-zero rows that net to zero** —
a `traveler_service_fee` row (+amount, `borneBy:"traveler"`) plus a `credit_applied` row (−amount,
`metadata.reason:"covered_by:trip_pass|rails"`) — which satisfies both the CHECK and the migration-179 invariant
`traveler_paid − provider_credited = SUM(amount)`. This diverges from the ruling's literal wording (one $0 row)
and it is a **schema/representation decision** (CLAUDE.md: fee-ledger shape + any migration needs the
decision-maker). Alternative: a new migration relaxing the CHECK for a `covered_by`/`credit_applied` zero row —
heavier, and it re-opens the "zero row launders a resolution bug" concern migration 179 was written to prevent.

**FLAG A — transport (path 4):** transport-commerce is a partner pass-through priced `priceCents × travelers`
with **no platform fee today**. Does the 7%/$25 traveler service fee apply to transport? (§16 affiliate-outbound
posture suggests partner content may be treated differently.)

**FLAG B — expert review service (path 5):** is `full_concierge`/`review_and_book`/`review` a **provider service
(a, fee applies)** or a **concierge product (c, no fee)**? The ruling lists "concierge task" under (c); this
surface is expert-fulfilled and traveler-paid, so it straddles the line.

**FLAG C — marketplace itinerary products (paths 8 & 9):** ready-made purchase and template purchase both carry
**author/expert earnings splits** (they are not pure platform products like Trip Pass/optimizer — the seller
earns). The ruling explicitly names "itinerary template" as a no-fee product; please confirm that stands
**and** that ready-made rides with it, given the traveler is paying for third-party-authored content.

**FLAG D — deposit balance (path 2):** confirm the fee is charged **once, at deposit time, on the full subtotal**,
with the balance leg fee-free (the alternative — splitting the fee across deposit+balance — is more code and a
worse audit story). Ratify "once at deposit."

**FLAG E — legacy `bookings` rail (path 3):** it is still live (§15c, `/booking-demo`, `/itinerary-comparison`).
Bill it for parity (it needs a fresh `coversAction` gate wired in, which it lacks today), or declare it
out-of-scope as legacy/demo? A path that charges travelers for provider services without the fee is exactly the
revenue hole the finding names — but wiring a legacy rail is effort that may be better spent on its retirement.

**Scope note (not a blocker):** `fee_ledger` is **rails-slice-only today** — the direct/legacy checkout paths
write *no* commission rows there yet (`fee-ledger.service.ts` header). The final CI invariant the dispatch names
("every traveler-charging path produces a `traveler_service_fee` row OR a `covered_by` event") is scoped to the
**traveler fee only**, so it does not require back-filling the provider-commission rows — but it does mean the
new `traveler_service_fee` writer on paths 1/3 is the first non-rails writer of this table.

---

## Build order (proposed, only after ratification — one path per commit, highest-traffic first)

1. **Path 1 (cart)** + its **fee-preview** in the SAME commit (they are a pair). Flip test assertion C to expectation; `billedOnDirectPathToday → true`. Suppression → the ratified `covered_by` shape.
2. **Path 2 (balance)** — no-op beyond ensuring the deposit leg carried the fee (per flag D).
3. **Paths 3/4/5** — each only if ratified (flags A/B/E).
4. **Final commit** — the CI-gated invariant (every traveler-charging path ⇒ fee row OR `covered_by` event), ledger row + FOLLOWUPS retiring `fee-not-billed-on-direct-path`.

**Per-path tests (as dispatched):** fee present & correct at band rate; cap applied above threshold; covered → the ratified suppression event + **no charge delta**; preview == charge (path 1 only).
