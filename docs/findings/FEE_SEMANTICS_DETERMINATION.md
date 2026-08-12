# Determination: checkout fee semantics — fee on top AND commission deducted (Task 1092)

**Date:** 2026-08-11
**Question:** On a $200 service booking the traveler is charged $250 (price + 25% platform fee on
top) while the earner's ledger credit is $150 (price × 0.75). Platform keeps $100 (~50% of list
price / 40% of gross). Is the platform unintentionally taking its fee twice?

## Determination: INTENDED — no code change

The exact behavior observed by financial QA was independently found, escalated for a ruling, and
**explicitly ratified as the model of record** on Jul 26, 2026:

> **F1 = INTENDED BEHAVIOR, ratified.** Fee-on-top + commission-deducted is the model of record
> for cart checkout. Follow-up filed: disclose the service fee on /pricing and at checkout so the
> traveler-facing story matches the charge.
> — `docs/backoffice/REVENUE_MODEL.md`, "⛭ RULINGS — Jul 26, 2026 (decision-maker)"

The same file's Finding F1 describes the identical arithmetic ("$100 expert_standard item:
traveler pays $125, earner gets $75, platform keeps $50") — so the decision-maker ruled with full
knowledge of the effective take rate, not on an abstract description.

The mandated disclosure follow-up **landed** (Wave R3, commit `0505e13a`):
- `/pricing` shows the service-fee disclosure ("Service bookings include a platform service fee,
  shown as a separate line at checkout before you pay") — `client/src/pages/pricing.tsx` (R3/F1
  comment).
- The cart shows "Platform fee" as its own line item (`client/src/pages/cart.tsx`), so the
  traveler sees the exact surcharge before paying.
- The checkout response `commissionRate` is the real charged ratio (platformFee/subtotal), not a
  display literal (R3/F6, `server/routes/payments.routes.ts` ~line 424).

## How the model works (verified against code)

- **Buyer side** (`payments.routes.ts` checkout, ~860–930): Stripe total =
  `subtotal + platformFee (+ conciergeFee)`, where `platformFee = price × (1 − expertShare)`
  per item, resolved from `fee_bands`/`booking_fee_configs` via `resolveCommissionRates`
  (expert_standard default: platform take 0.25).
- **Seller side** (same file, ~960–975): `providerEarnings = price × expertShare − insuranceFee`
  — the earner is credited their share of the **list price**, never of the surcharged total.
- Net: on a $P expert_standard booking, traveler pays 1.25P, expert earns 0.75P, platform keeps
  0.50P (40% of gross). Refunds return the full 1.25P, consistent with the charge.

## Consistency check against fee documentation

- `fee_bands` seed descriptions (migrations 033/087/100/174): rates are stated as "platform
  take as a fraction (0.25 = platform keeps 25%, expert keeps 75%)". They define the **split**,
  not whether the buyer pays the fee on top — the F1 ruling supplies that.
- `docs/planning/business-plan-v1.3.md` §4.6/§4.8: the revenue-recognition journal example shows
  a commission-out-of-price model (buyer pays $10, expert $7.50, platform $2.50 — no surcharge).
  **This is documentation drift**: the business plan predates the Jul 26 F1 ruling and was never
  updated to reflect fee-on-top + commission-deducted. The ruling is the more recent, more
  specific, and explicitly decision-maker-issued authority, so it governs. (Flagged as a
  follow-up: align §4.6/§4.8 wording with the ratified model.)

## Conclusion

- The intended model is **genuinely both** (buyer-side fee on top AND seller-side commission),
  ratified with eyes open on Jul 26, 2026, with the required traveler-facing disclosure shipped.
- No fix to the checkout total or the ledger split is warranted. Any future change to this model
  must go back through a ruling (per the F1 note: "needs a RULING, not a silent fix").
