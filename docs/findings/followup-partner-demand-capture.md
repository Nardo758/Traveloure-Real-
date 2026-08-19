# FOLLOWUP — Partner Demand attribution capture (coords + category)

**Filed:** 2026-08-18 (Partner Demand 3.1c) · **Spec:** the 3.1b-T trace
(`docs/findings/partner-demand-3.1b-T-coord-category-trace.md`) is this followup's specification.
**Why it exists:** the demand rollup's finer grains (neighborhood map, R23 category-matched verbs) are
**data-gated** — the unmet-demand cohort has structurally NULL coords/category (R25-final.3). R26 shipped the
two genuine coord copy-fixes in-lane; everything below is either absent at source or absent one interface-layer
up, so it is a real project, not a copy-fix. **Claimable between phases.**

## Items

### 1. Optimizer variant-producer coords (reclassified from R26 → here, 3.1c)
`itinerary-optimizer.ts:947` / `:1418`. The producer's input is typed `ItineraryItem` (`:167`), an interface
with **no `latitude`/`longitude`**, so nothing is in hand to copy at the insert. Fix = thread lat/lng through
the `ItineraryItem` interface and every constructor that builds a baseline/reordered item (from the trip/cart
source rows that DO have coords), then the existing `itinerary_variant_items` columns + the apply-to-trip
consumer (`plancard.routes.ts:174`) carry them the rest of the way. Sized: interface + N constructors + a
linkage-style assertion. NULL stays NULL (§13).

### 2. AI-generator coords (geocode pass)
`routes.ts:1495` / `:10185`, `content.routes.ts:4499`, `trips.routes.ts:517`. Grok output carries only a
free-text `location` string (`grok.service.ts:180`). Capture = a geocoding pass (`location`/`locationName` →
lat/lng) after generation, before the item write. Honest-null when geocoding fails — no city-center fallback.

### 3. AI-generator + DMO + affiliate/suggestion category
The category signal (`provider_services.categoryId` → `service_categories.categoryKey`) is absent for these
paths: Grok emits a `type` string only; DMO content isn't platform inventory; affiliate/suggestion carry no
service link. Capture = match each activity against the offered catalog (the optimizer already does this
validation at `itinerary-optimizer.ts:1280`; the generator does not) or add a source-side link. **This is the
half that gates R23 smart "add to <listing>" verbs** (R25-final.4) — until it lands, the Requested-Windows
verb stays "create a service here" only.

### 4. Unblock conditions (named, per R25-final.3/.4)
- **Neighborhood demand map** returns when item coords accrue (items 1–2) → a `city_neighborhoods` centroid
  match can attribute unmet demand, and the deferred neighborhood rollup grain activates against the ratified
  v1 row-grain design.
- **R23 smart verbs** turn on when item category accrues (item 3).

Nothing here is cancelled; each is data-gated with a named unblock condition. No fixes applied at filing time.

---

## Phase 3 close-out followups (added 2026-08-19, ledger `2026-08-19-partner-demand-phase3-complete`)

Surfaced while building 3.3–3.5; each is a real project with a named unblock, none is a bug in what shipped.

### 5. R21 forward calendar-pressure shading (Calendar)
Ships DARK behind `SHOW_PRESSURE_SHADING` in `client/src/pages/provider/calendar.tsx`. **Unblock:**
confirm `trend_scores` carries forward calendar-pressure rows for the caller's markets (written by
`server/services/trend-engine/trend-score.service.ts`; one-query check in
`docs/findings/partner-demand-3.3-ghost-fixture.md` Part B), then wire the decomposed calendar-pressure
read into `pressureShade()` and flip the flag. The composite `trend_score`/`crowd_band` must NEVER render (R21).

### 6. `getBenchmarkFacts` denorm read (business advisor)
`server/routes/demand.routes.ts` `getBenchmarkFacts` reads the banned `providerServices.totalRevenue`
denorm (Locked Decision 3) for a category benchmark — flagged at the `check-demand-rollup.cjs` HARD STOP as
legacy debt OUTSIDE the 2B module (not policed or laundered by that gate). **Fix:** compute the benchmark
from a `serviceBookings` SUM (the real number) instead of the denorm. Sized: one query swap + the gate can
then extend to scan that file.

### 7. Ghost-slot category scoping (Calendar 1.2)
Ghost slots are MARKET-LEVEL today ("requested in Kyoto"). **Unblock:** when the demand cohort accrues a
category link (item 3 above), a ghost can narrow to the caller's category with honest sub-cohort copy —
without it, market-level is the only honest framing (never "from you").

### 8. "Watch this area" threshold alerts
Named NOT-in-v1 by R24. A partner subscribes to a market/category and is alerted when unmet demand crosses a
threshold. Depends on the rollup (shipped) + a subscription table + a notify job. Between-phases.

### 9. PlanCard traveler-facing demand layer
The traveler PlanCard could surface an expert-curated demand/pressure hint. Deferred — traveler-surface
demand framing needs its own ratification (R24 anti-disintermediation boundaries apply).

### 10. Property $-valuation (stay demand)
`unmet_demand_stay` is count-only (R19 — NO $ until property-pricing data earns trust). **Unblock:** a
trusted property price source, at which point stay demand could carry a $ figure and the Today card / admin
strip could rank stays by value. Explicitly a Phase-4+ decision, not started.

### 11. One-pager generation (Phase 4)
The `/admin/fee-bands` recruitment one-pager control is wired but generation is R18-gated
(`/api/admin/demand-one-pager` stub). **Unblock:** Phase 4 authorization + the satori/template build.
