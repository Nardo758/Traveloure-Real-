# Pricing display bundle — Phase 1 design

## Goal

Expose a public, read-only pricing display bundle for `/pricing`. The browser
must receive values resolved from the active database configuration, not price
literals or raw configuration tables.

This phase deliberately excludes the `/pricing` rebuild, navigation link,
Stripe, checkout, subscriptions, and entitlement changes.

## Chosen approach

Add `GET /api/pricing` as one server-composed endpoint. It is the only client
read needed for the later public page.

This avoids a collection of client requests to `GET /api/fee-bands/:bandKey`,
which cannot supply plan rows or a safe generic optimizer price. It also keeps
the choice of optimizer source and provider-band ladder on the server.

## Response contract

```ts
type PricingDisplayBundle = {
  serviceFeePct: number; // whole percentage points, e.g. 7
  serviceFeeCapCents: number;
  optimizerRunDisplay: {
    priceCents: number;
    currency: string;
    complexityTier: "simple";
  };
  aiTaskCents: number;
  tripPass: { key: "trip_pass"; name: string; priceCents: number; interval: "trip" };
  plusAnnual: { key: "plus_annual"; name: string; priceCents: number; interval: "year" };
  proMonthly: {
    key: "pro_monthly";
    name: string;
    priceCents: number;
    interval: "month";
    betaFreeUntil: string | null;
  };
  doneForYouDepositPct: number; // whole percentage points
  proRateStandard: number; // whole percentage points, read from limited
  proRateStepped: number; // whole percentage points, read from moderate
  railsRate: number; // whole percentage points, read from provider_rails
  proBandStep: number; // count, read from provider:pro_band_step
};
```

`Plan with a local` intentionally has no dollar-value field. Expert
consultations are set by each expert and will be described by the future page
as expert-priced, linking to `/experts`.

## Server resolution

- Plans: `requirePlan` for `trip_pass`, `plus_annual`, and `pro_monthly`.
- Traveler service fee: the live `traveler_service_fee` percent row and its
  `max_amount` cap.
- AI Concierge task: `concierge:ai_task`, requiring `flat_cents`.
- Done-for-you deposit: `concierge:done_for_you_deposit_pct`, requiring
  `percent`.
- Optimizer display: `getFee(null, "simple")` from `optimization_fees`.
  `optimizer:run` is a legacy, inert database row and is never read here.
- Pro display ladder: `limited` → `moderate` is the approved one-step path;
  the endpoint also reads `provider:pro_band_step` and the independent
  `provider_rails` band.

All required inactive, missing, or mismatched-type fee-band reads fail loudly
with a server error rather than returning a fabricated price.

## Documentation and tests

- Update the pricing/feature map to say optimizer display is sourced from the
  live `optimization_fees` resolver, with no display-price literal.
- Add endpoint coverage that:
  1. verifies the contract is composed from live rows;
  2. updates a plan row, observes the changed response, and restores it;
  3. verifies the optimizer source is `getFee`, not the legacy fee-band key.

## Out of scope and later work

The frame-3 visual reference is still required before rebuilding `/pricing`.
When supplied, the subsequent page phase will consume this endpoint and add
the Pricing main-nav leaf beside Ways to Earn. No runtime code from that phase
is included here.