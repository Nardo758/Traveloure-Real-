# Tier-1 action→effect coverage by the supply-demand e2e harness

**As of** Pass 3 batch 1 (run `p3f2130`, build `3304c1d`). Regenerate with `npx tsx scripts/e2e/coverage.ts` from the repo root (`--json` gives per-row data). The tables below are that script's output, pasted verbatim.

## Method

- **Denominator.** Every row of `docs/audits/action-effect.json` with `tier === 1`. That is **351 rows: traveler 321, expert 17, provider 13**, which matches the baseline. Persona is the row's `persona` field. A row without one is a traveler row, because the base audit covered traveler surfaces only and never set the field.
- **Buckets.** Each row lands in exactly one bucket, first match wins:
  1. **proven.** The row's `verdict.evidence` is `behavioral` **and** its `evidenceRef` names a spec under `e2e/supply-demand/`. This is the only bucket meaning "a harness run drove this trigger and asserted its DB effect". Pass 3 set it on the 15 rows it proved (8 expert, 7 traveler).
  2. **referenced.** A static match: the row's testid appears in a string literal in the spec, or in a `lib/flows.ts` helper the spec calls. For an expert or provider row, the spec's own source must also name that persona's console (`'/expert/'`, `'/provider/'`, or `role: '<persona>'`). This shows the harness touches the control. It does **not** show that the row's effect was asserted.
  3. **not proven.** The row's API route is a Stripe rail (**HELD:stripe**), or its behavioural evidence comes only from an earlier audit pass (the J-/U- journeys), which this harness does not re-run.
  4. **uncovered.** Everything else.
- **Negative space.** The 125 Tier-1 rows with no testid (effects, auth-resume, url-consumer triggers) can never be *referenced*; they can only be *proven*. A runtime-built testid is matched on its static prefix. The Stripe predicate is a route regex, so a money row whose route does not look like one lands in *uncovered*. Pass 2 set no row-level evidence for its own specs, so Pass 2's journeys show up only as *referenced*.

## Headline

- **Expert:** 8 of 17 proven. Those 8 are the five previously-uncovered rows (withdraw quote, declare complete, claim handle, confirm decline, claim pooled request) plus issue quote, accept assignment and send suggestion. 3 are referenced (ServiceForm submit/save-draft, ready-made submit — S2). 3 are HELD:stripe (Connect, payouts banner, request payout). 3 are uncovered: `expert-inbox:button-accept-booking` (needs a paid request, so effectively HELD:stripe — an unpaid one is refused by design), `expert-readymade:button-withdraw-listing` and `expert-catalog:toggle-service-status`.
- **Provider:** 0 proven, 3 referenced, 2 HELD:stripe, 8 uncovered. The provider twins of the shared components (quotes, completion, handle card, inbox) were not driven from the provider console.
- **Traveler:** 7 proven (the slip's hire / approve-suggestion / confirm-reject / request-changes / approve-plan / finalize rows and service-detail request-to-book), 11 referenced, 49 not proven (28 earlier-pass evidence only, 21 HELD:stripe), 254 uncovered.

## Script output

Denominator: 351 Tier-1 rows in docs/audits/action-effect.json (baseSha 858d28f).
Specs scanned: d1-build-it-yourself.spec.ts, d2-ready-made.spec.ts, d3-with-an-expert.spec.ts, d4-ai-draft.spec.ts, d5-guest-to-auth.spec.ts, d6-checkout.spec.ts, d6b-join-link.spec.ts, d7-supply-change-propagation.spec.ts, p3-expert-lifecycle.spec.ts, p3-expert-tier1.spec.ts, s1-provider-publish.spec.ts, s2-expert-publish.spec.ts, s3-moderation.spec.ts.

### By persona

| persona | total | proven (behavioural, row-level) | referenced (static testid match) | not proven | uncovered |
|---|---:|---:|---:|---:|---:|
| traveler | 321 | 7 | 11 | 49 | 254 |
| expert | 17 | 8 | 3 | 3 | 3 |
| provider | 13 | 0 | 3 | 2 | 8 |
| **all** | **351** | **15** | **17** | **54** | **265** |

### By persona and surface

| persona | surface | total | proven | referenced | not proven | uncovered | specs |
|---|---|---:|---:|---:|---:|---:|---|
| traveler | accept-terms | 1 | 0 | 0 | 0 | 1 | — |
| traveler | active-console-context | 1 | 0 | 0 | 0 | 1 | — |
| traveler | ai-assistant | 7 | 0 | 1 | 2 | 4 | d3-with-an-expert.spec.ts |
| traveler | app-shell | 7 | 0 | 0 | 1 | 6 | — |
| traveler | app-shell-hooks | 2 | 0 | 0 | 0 | 2 | — |
| traveler | auth | 7 | 0 | 0 | 1 | 6 | — |
| traveler | booking-confirmation | 2 | 0 | 0 | 1 | 1 | — |
| traveler | bookings | 9 | 0 | 1 | 0 | 8 | d3-with-an-expert.spec.ts |
| traveler | cart | 24 | 0 | 0 | 6 | 18 | — |
| traveler | chat | 6 | 0 | 0 | 1 | 5 | — |
| traveler | concierge | 6 | 0 | 0 | 0 | 6 | — |
| traveler | console-shell | 3 | 0 | 0 | 0 | 3 | — |
| traveler | deals | 1 | 0 | 0 | 0 | 1 | — |
| traveler | destinations | 6 | 0 | 0 | 0 | 6 | — |
| traveler | discover-location | 18 | 0 | 0 | 1 | 17 | — |
| traveler | discover-shared | 7 | 0 | 0 | 0 | 7 | — |
| traveler | experience-template | 21 | 0 | 0 | 10 | 11 | — |
| traveler | experiences | 2 | 0 | 0 | 0 | 2 | — |
| traveler | experts | 1 | 0 | 0 | 0 | 1 | — |
| traveler | guest-trip-context | 5 | 0 | 0 | 0 | 5 | — |
| traveler | hidden-gems | 1 | 0 | 0 | 0 | 1 | — |
| traveler | home | 3 | 0 | 0 | 0 | 3 | — |
| traveler | how-it-works | 2 | 0 | 0 | 0 | 2 | — |
| traveler | inbox | 5 | 0 | 0 | 0 | 5 | — |
| traveler | intake-panel | 2 | 0 | 0 | 1 | 1 | — |
| traveler | invite | 3 | 0 | 0 | 0 | 3 | — |
| traveler | itinerary-comparison | 15 | 0 | 0 | 1 | 14 | — |
| traveler | itinerary-view | 3 | 0 | 1 | 0 | 2 | d1-build-it-yourself.spec.ts, d4-ai-draft.spec.ts, p3-expert-lifecycle.spec.ts |
| traveler | landing | 4 | 0 | 0 | 0 | 4 | — |
| traveler | layout-header | 4 | 0 | 0 | 1 | 3 | — |
| traveler | my-events | 3 | 0 | 0 | 0 | 3 | — |
| traveler | plan-guests | 5 | 0 | 0 | 0 | 5 | — |
| traveler | plan-modal | 4 | 0 | 1 | 2 | 1 | d1-build-it-yourself.spec.ts, d4-ai-draft.spec.ts, p3-expert-lifecycle.spec.ts |
| traveler | planning-provider | 7 | 0 | 0 | 5 | 2 | — |
| traveler | plus-occasions | 3 | 0 | 0 | 0 | 3 | — |
| traveler | pricing | 5 | 0 | 0 | 1 | 4 | — |
| traveler | profile | 1 | 0 | 0 | 0 | 1 | — |
| traveler | ready-made-detail | 3 | 0 | 1 | 0 | 2 | d2-ready-made.spec.ts |
| traveler | service-detail | 8 | 1 | 1 | 0 | 6 | d1-build-it-yourself.spec.ts, d5-guest-to-auth.spec.ts, p3-expert-tier1.spec.ts |
| traveler | services | 5 | 0 | 1 | 1 | 3 | d3-with-an-expert.spec.ts, d6b-join-link.spec.ts, p3-expert-lifecycle.spec.ts, p3-expert-tier1.spec.ts, s1-provider-publish.spec.ts, s2-expert-publish.spec.ts, s3-moderation.spec.ts |
| traveler | signup | 1 | 0 | 0 | 0 | 1 | — |
| traveler | slip | 50 | 6 | 1 | 9 | 34 | d4-ai-draft.spec.ts, p3-expert-lifecycle.spec.ts |
| traveler | storefront | 5 | 0 | 1 | 0 | 4 | d3-with-an-expert.spec.ts |
| traveler | transportation | 2 | 0 | 0 | 0 | 2 | — |
| traveler | trip-card | 37 | 0 | 2 | 4 | 31 | d4-ai-draft.spec.ts, p3-expert-lifecycle.spec.ts |
| traveler | trip-context | 1 | 0 | 0 | 1 | 0 | — |
| traveler | trip-queue-context | 3 | 0 | 0 | 0 | 3 | — |
| expert | expert-catalog | 1 | 0 | 0 | 0 | 1 | — |
| expert | expert-completion | 1 | 1 | 0 | 0 | 0 | p3-expert-tier1.spec.ts |
| expert | expert-earnings | 1 | 0 | 0 | 1 | 0 | — |
| expert | expert-handle | 1 | 1 | 0 | 0 | 0 | p3-expert-tier1.spec.ts |
| expert | expert-inbox | 4 | 3 | 0 | 0 | 1 | p3-expert-lifecycle.spec.ts, p3-expert-tier1.spec.ts |
| expert | expert-payoutbanner | 1 | 0 | 0 | 1 | 0 | — |
| expert | expert-quotes | 2 | 2 | 0 | 0 | 0 | p3-expert-tier1.spec.ts |
| expert | expert-readymade | 2 | 0 | 1 | 0 | 1 | s2-expert-publish.spec.ts |
| expert | expert-serviceform | 2 | 0 | 2 | 0 | 0 | p3-expert-tier1.spec.ts, s2-expert-publish.spec.ts |
| expert | expert-stripe-connect | 1 | 0 | 0 | 1 | 0 | — |
| expert | expert-workspace | 1 | 1 | 0 | 0 | 0 | p3-expert-lifecycle.spec.ts |
| provider | provider-availability | 2 | 0 | 0 | 0 | 2 | — |
| provider | provider-completion | 1 | 0 | 0 | 0 | 1 | — |
| provider | provider-handle | 1 | 0 | 0 | 0 | 1 | — |
| provider | provider-inbox | 2 | 0 | 0 | 0 | 2 | — |
| provider | provider-payoutbanner | 1 | 0 | 0 | 1 | 0 | — |
| provider | provider-quotes | 2 | 0 | 1 | 0 | 1 | d6-checkout.spec.ts |
| provider | provider-serviceform | 2 | 0 | 2 | 0 | 0 | d6b-join-link.spec.ts, d7-supply-change-propagation.spec.ts, s1-provider-publish.spec.ts, s3-moderation.spec.ts |
| provider | provider-services | 1 | 0 | 0 | 0 | 1 | — |
| provider | provider-stripe-connect | 1 | 0 | 0 | 1 | 0 | — |

### Expert and provider rows, one by one

| persona | row | bucket | spec / reason |
|---|---|---|---|
| provider | `provider-serviceform:button-publish-service` | referenced | d6b-join-link.spec.ts, d7-supply-change-propagation.spec.ts, s1-provider-publish.spec.ts, s3-moderation.spec.ts |
| expert | `expert-serviceform:button-submit-service` | referenced | p3-expert-tier1.spec.ts, s2-expert-publish.spec.ts |
| provider | `provider-serviceform:button-save-draft` | referenced | d6b-join-link.spec.ts, d7-supply-change-propagation.spec.ts, s1-provider-publish.spec.ts, s3-moderation.spec.ts |
| expert | `expert-serviceform:button-save-draft` | referenced | p3-expert-tier1.spec.ts, s2-expert-publish.spec.ts |
| provider | `provider-availability:button-add-slot` | uncovered | — |
| provider | `provider-availability:button-delete-slot` | uncovered | — |
| provider | `provider-quotes:button-issue-quote` | referenced | d6-checkout.spec.ts |
| provider | `provider-quotes:button-withdraw-quote` | uncovered | — |
| expert | `expert-quotes:button-issue-quote` | proven | p3-expert-tier1.spec.ts |
| expert | `expert-quotes:button-withdraw-quote` | proven | p3-expert-tier1.spec.ts |
| provider | `provider-completion:button-declare-complete` | uncovered | — |
| expert | `expert-completion:button-declare-complete` | proven | p3-expert-tier1.spec.ts |
| provider | `provider-handle:button-claim-handle` | uncovered | — |
| expert | `expert-handle:button-claim-handle` | proven | p3-expert-tier1.spec.ts |
| provider | `provider-stripe-connect:button-connect-stripe` | notProven | HELD:stripe |
| expert | `expert-stripe-connect:button-connect-stripe` | notProven | HELD:stripe |
| provider | `provider-payoutbanner:button-setup-payouts` | notProven | HELD:stripe |
| expert | `expert-payoutbanner:button-setup-payouts` | notProven | HELD:stripe |
| expert | `expert-earnings:button-request-payout` | notProven | HELD:stripe |
| expert | `expert-readymade:button-submit-listing` | referenced | s2-expert-publish.spec.ts |
| expert | `expert-readymade:button-withdraw-listing` | uncovered | — |
| provider | `provider-services:toggle-service-status` | uncovered | — |
| expert | `expert-catalog:toggle-service-status` | uncovered | — |
| provider | `provider-inbox:button-accept-booking` | uncovered | — |
| provider | `provider-inbox:button-decline-booking` | uncovered | — |
| expert | `expert-inbox:button-accept-booking` | uncovered | — |
| expert | `expert-inbox:button-confirm-decline` | proven | p3-expert-tier1.spec.ts |
| expert | `expert-inbox:button-claim-pooled-request` | proven | p3-expert-tier1.spec.ts |
| expert | `expert-inbox:button-accept-assignment` | proven | p3-expert-lifecycle.spec.ts |
| expert | `expert-workspace:button-submit-suggestion` | proven | p3-expert-lifecycle.spec.ts |

### NOT PROVEN, with reason

| reason | rows |
|---|---:|
| earlier-pass evidence only (J-/U- journeys, not re-run by this harness) | 28 |
| HELD:stripe | 26 |
