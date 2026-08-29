# Audit brief — Pricing Surfaces

**Mock:** `docs/design/pricing-surfaces-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-27-pricing-surfaces` (companion `PRICING_AND_FEATURE_MAP.md` §9 — not independently confirmed present in `docs/DECISIONS.md` at time of writing; treat `PRICING_AND_FEATURE_MAP.md` itself as the citation of record), plus the sibling rulings it depends on: `2026-08-27-pricing-map`, `2026-08-27-two-calendars`, `2026-08-27-plus-occasions`, `2026-08-27-pro-supply`, `2026-08-27-concierge-fees`, `2026-08-27-anchor-and-pass`, `2026-08-27-trip-pass-19`, `2026-08-27-pro-beta-free`, `2026-08-27-pricing-nav`, `2026-08-27-optimizer-pay-per-use`, `2026-08-27-plus-is-delivery`, `2026-08-27-plan-memberships`. Post-mock ratified divergence: `2026-08-29-trip-pass` (PR #621) — not yet found as its own row in `docs/DECISIONS.md`; treat the PR itself as the citation of record per the task brief.
**Status:** spec-of-record pairing, PLUS one ratified post-mock divergence. Companion specs `docs/design/PRICING_PAGE_SPEC.md` (layout/behavior contract) and `docs/design/PRICING_AND_FEATURE_MAP.md` (the pricing model + fee-row map this page reads) are authoritative on scope/data; the mock HTML is authoritative on appearance. The **"Get a Trip Pass" CTA** (`data-testid="button-plan-trip-pass"`) now routes an authed user to `/dashboard` with a pick-a-trip toast, and a guest to the sign-in modal (PR #621) — this is a RATIFIED DIVERGENCE from the mock/spec's original "stub or future purchase entry" language, not a bug to fix back.
**Live surfaces:**
- `client/src/pages/pricing.tsx`
- `client/src/lib/nav-config.ts` (Pricing as a plain main-nav leaf beside Ways to Earn)
- `client/src/components/plancard/TripPassCard.tsx`
- `client/src/pages/dashboard.tsx` (the pick-a-trip toast destination for the Trip Pass CTA)
- `GET /api/pricing` (public, server-resolved pricing bundle)
- `shared/schema.ts` (`plans`, `fee_bands` / `optimization_fees`)

## Behaviors the mock ratifies

1. Band header: teal-wash Palmtree tile, coral mono eyebrow `PLAN IT YOUR WAY`, Fraunces "Plan it your way," sub-line naming all four paths (yourself / AI / local / done for you) and stating every AI action is pay-per-use with no membership needed.
2. **Four-column ladder**, column 3 (Trip Pass) highlighted with a teal border/glow: (1) Plan it yourself — free, outline `Start planning`; (2) Plan with AI — price from `optimizerRunDisplay` + `aiTaskCents`, outline `Optimize a plan`; (3) Trip Pass — price from `tripPass`, **teal** `Get a Trip Pass` (see divergence below); (4) Plan with a local — **no price number** ("set by each expert"), outline `Find a local expert` → `/experts`.
3. **No price literal anywhere in `pricing.tsx`** — every number in the ladder, Plus band, and Pro band comes from the `GET /api/pricing` bundle (`serviceFeePct`, `serviceFeeCapCents`, `optimizerRunDisplay`, `aiTaskCents`, `tripPass`, `plusAnnual`, `proMonthly.{priceCents,betaFreeUntil}`, `proRateStandard`, `proRateStepped`, `railsRate`, `doneForYouDepositPct`). This is a hard grep-provable claim per the spec.
4. Column 2's price traces to `optimization_fees` via `getFee(eventType,tier)` — **NOT** a `fee_bands` row (a corrected fact per `PRICING_AND_FEATURE_MAP.md`'s own 2026-08-27 correction). Don't flag an `optimization_fees`-sourced value as "should be in `fee_bands`" — that correction is intentional.
5. Plus band: coral eyebrow, Fraunces headline, big mono `${plusAnnual}`/year, four benefit lines, coral `Join Plus` CTA — labeled explicitly "Not a discount club," no member pricing shown anywhere on the band (`2026-08-27-plus-no-discounts`... verify this exact slug's presence separately; the "not a discount club" copy itself is the checkable behavior regardless).
6. Pro band: gold `FREE DURING BETA · UNTIL {betaFreeUntil}` pill; price shown as `$29` struck through + `$0`/month during beta (from `proMonthly.priceCents` + `betaFreeUntil` — a real row read, not a hardcoded "$0"); rate table shows the provider's standard commission struck through with the **stepped** (lower) rate in green beside it.
7. **Coral count is exactly one per band**: `Get a Trip Pass` (ladder), `Join Plus`, `Turn on Pro` — three total across three distinct sections, never two corals in the same band.
8. Nav: `Pricing` ships as a **plain, no-icon main-nav leaf** beside `Ways to Earn` in `nav-config.ts`'s `navGroupsConfig` — NOT a dropdown, and NOT placed in the right-side utility cluster (that cluster does not hold `Ways to Earn`, so the original "beside Ways to Earn in the right cluster" framing was corrected to a main-nav leaf placement). Same `/pricing` route the footer link already used.
9. **Delete-scope**: the legacy hardcoded `Free`/`Power Pass`/`Enterprise` array, the hardcoded optimize/coordination price literals, the comparison table, and FAQs repeating retired claims are all removed — not left dormant alongside the new ladder.
10. Buttons in this lane **route or stub only** — no Stripe call, no purchase, no entitlement grant originates from `/pricing` itself (`Start planning`→planner, `Optimize a plan`→a trip, `Find a local expert`→`/experts`).
11. **Ratified divergence (PR #621, post-mock):** `Get a Trip Pass` (`button-plan-trip-pass`) is NOT a bare stub — it routes an authed user to `/dashboard` with a "pick a trip" toast (since a Trip Pass attaches to a specific trip, per `2026-08-27-trip-pass-19`'s per-trip framing and `plan_memberships`/`trip_entitlements` staying separate), and routes a guest to the sign-in modal. This is the correct, ratified behavior — do not report it as inconsistent with the "buttons route or stub only" rule; it is a routing decision, not a purchase flow.
12. Test condition named in the spec: changing a `plans` row changes the rendered page value — i.e., no client-side caching or literal shadowing the live row.

## Visual grammar

Same `--earn-*` tokens, Fraunces/Geist Mono/Inter split, and one-coral-per-panel rule as the marketplace/experts and landing mocks — see those briefs' Visual grammar sections for the shared token list. This mock adds no new tokens.

## How to audit

```bash
# No price literal remains in pricing.tsx
grep -n "\\$[0-9]\|[0-9]\\.[0-9][0-9]%" client/src/pages/pricing.tsx

# Every number sourced from the /api/pricing bundle
grep -n "useQuery.*pricing\|/api/pricing" client/src/pages/pricing.tsx

# Legacy hardcoded array + comparison table removed
grep -n "Power Pass\|Enterprise\|comparisonTable" client/src/pages/pricing.tsx

# Nav placement: plain leaf beside Ways to Earn, not a dropdown, not the right-side cluster
grep -n "Pricing" client/src/lib/nav-config.ts

# Coral count — exactly one per band (3 total: Trip Pass ladder col, Join Plus, Turn on Pro)
grep -n "earn-coral" client/src/pages/pricing.tsx

# Trip Pass CTA routing divergence (PR #621) — authed -> /dashboard toast, guest -> sign-in modal
grep -n "button-plan-trip-pass" client/src/pages/pricing.tsx
grep -n "pick.*trip\|pickATrip" client/src/pages/dashboard.tsx client/src/pages/pricing.tsx

# optimization_fees (not fee_bands) backs the AI-run price
grep -n "optimization_fees\|getFee(" server/services/*.ts | grep -i optim
```

Route to open: `/pricing`. As a guest, click "Get a Trip Pass" and confirm the sign-in modal opens (not a dead stub, not a purchase flow). As an authed user with at least one trip, click it and confirm the `/dashboard` redirect + pick-a-trip toast. Toggle a `plans` row value (or read two different environments) to confirm the rendered price actually moves.

## Known divergences / notes

- The Trip Pass CTA's `/dashboard` + toast routing (PR #621, ledger `2026-08-29-trip-pass`) is a **ratified improvement** over the original mock/spec's "stub or future purchase entry" language — do not report it as scope creep or as contradicting "buttons route or stub only." It is still true that no Stripe/purchase/entitlement call originates here.
- If `2026-08-29-trip-pass` is not yet a row in `docs/DECISIONS.md`, that is a documentation lag, not evidence the routing change is unratified — the task context and PR #621 are the citation of record.
- Column 4 ("Plan with a local") deliberately shows no price number — do not treat the absence of a number there as a missing-data bug; it's ratified ("set by each expert").
