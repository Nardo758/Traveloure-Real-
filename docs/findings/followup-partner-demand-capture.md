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
