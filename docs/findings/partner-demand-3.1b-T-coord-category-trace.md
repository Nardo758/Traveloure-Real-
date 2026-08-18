# 3.1b-T — Why item coords & category are absent (read-only trace)

**Ledger:** `2026-08-18-partner-demand-grain` (R25b) · **Lane:** `lane/partner-demand-data` · **As-of:** lane tip.
**Mandate (dispatch 3.1b-T):** for each `itinerary_items` creation path, does the SOURCE carry lat/lng and category,
and does the write PERSIST them? Verdict per field: **CHEAP FIX** (dropped in-hand) vs **REAL PROJECT** (absent at
source). **No fixes applied here — findings only.**

The generic writers `storage.createItineraryItem` (`server/storage.ts:6764`) and `replaceItineraryItems`
(`storage.ts:7202`) insert the object verbatim — they drop nothing; fidelity is decided by each **caller's mapping**.
`insertItineraryItemSchema` (`shared/schema.ts:4417`) omits only id/createdAt/updatedAt/origin, so lat/lng/googlePlaceId/
providerServiceId flow through when the caller supplies them.

## Per-path audit

| Path | insert @ | source has lat/lng? | write persists lat/lng? | source has serviceId/category? | write persists it? |
|---|---|---|---|---|---|
| Manual/search add (POST) | `storage.ts:6764` (via `trips.routes.ts:1439`, `routes.ts:11188`) | client-dependent (Google search-add sends them: `workspace.tsx:3311`) | **YES** (schema passthrough) | search-add sends `providerServiceId` (`workspace.tsx:3325`) | **YES** |
| Expert service picker | same POST | YES when service has coords (`service-picker-modal.tsx:109`) | **YES** | **YES** (`service-picker-modal.tsx:111`) | **YES** |
| DMO → ready-made draft | `expert-workspace.routes.ts:680` | **YES** — `dmo_raw_content.latitude/longitude` (`schema.ts:7843`) | **NO** — object sets only title/desc/locationName | no serviceId (DMO isn't inventory) | N/A |
| AI generate | `routes.ts:1495` | **NO** — Grok emits free-text `location` only (`grok.service.ts:180`) | NO | NO (only `type`→itemType) | NO |
| AI generate+optimize | `content.routes.ts:4499` | NO (same source) | NO | NO | NO |
| AI quick-start | `routes.ts:10185` | NO | NO | NO | NO |
| AI trips regenerate | `storage.ts:7208` (`trips.routes.ts:517`) | NO | NO | NO | NO |
| Optimizer variant apply | `plancard.routes.ts:158` | source = `itinerary_variant_items` (has cols, **producer leaves NULL**) | consumer maps them (`:174`) but reads NULL | YES | **YES** (`:160`) |
| └ variant producer (baseline) | `itinerary-optimizer.ts:947` | **YES upstream** (`baselineItems` coords, used for clustering `:1072`) | **NO** — insert omits lat/lng | YES | YES (`:952`) |
| └ variant producer (AI variants) | `itinerary-optimizer.ts:1418` | coords available upstream | **NO** — insert omits lat/lng | YES | YES (`:1427`) |
| Cart → convert-to-itinerary | `routes.ts:8281` | **YES** — fetched `provider_services` row has coords (`schema.ts:979`) | **NO** — reads only `service.location` string | YES (`cartItem.serviceId`) | **YES** (`:8283`) |
| Affiliate confirm → item | `content.routes.ts:7165` | **NO** — `affiliate_booking_requests` has no coords | NO | **NO** (only `partnerCategory` free text) | NO |
| Suggestion approve → item | `booking-actions.ts:1030` | **NO** — `trip_suggestions` has no coords | NO | **NO** | NO |
| Ready-made purchase → clone | `ready-made-purchase.service.ts:100` | inherits (spread `...rest`) | **YES** | inherits | **YES** |

## Verdict — COORDINATES

**CHEAP FIX** (source carries coords, write drops them — the fix is copying a field already in hand; R11: every week
lost is neighborhood history lost):
1. **DMO store draft** — `expert-workspace.routes.ts:680`. `dmo_raw_content.latitude/longitude` exist; add
   `latitude: row.latitude ?? null, longitude: row.longitude ?? null` to the insert.
2. **Cart convert-to-itinerary** — `routes.ts:8281`. The already-fetched `service` row has coords; add
   `latitude: service?.latitude ?? null, longitude: service?.longitude ?? null`.
3. **Optimizer variant-item PRODUCER** — `itinerary-optimizer.ts:947` and `:1418`. `baselineItems`/`reorderedItems`
   carry coords (proven by the geo-clustering reads at `:1072`, `:1629`); both inserts omit them. Add the two lat/lng
   fields; coords then flow producer → `itinerary_variant_items` → apply automatically (the consumer at
   `plancard.routes.ts:174` already maps them). This is the H9-family producer-side loss, for coordinates.

**REAL PROJECT** (genuinely absent at source — needs a geocoding/place-resolution step, priced honestly):
- **All AI-generator paths** (`routes.ts:1495`, `:10185`, `content.routes.ts:4499`, `trips.routes.ts:517`) — Grok
  output has only a free-text `location`. Capture = a geocode pass after generation.
- **Affiliate confirm** and **suggestion approve** — the source tables carry no coordinate columns at all.

## Verdict — CATEGORY (providerServiceId)

**CHEAP FIX: none outstanding.** The two structurally-lossy bridges (cart-convert H1, apply-to-trip H5/H9) are already
closed — `routes.ts:8283`, `plancard.routes.ts:160`, `itinerary-optimizer.ts:952/:1427` all persist `providerServiceId`;
the picker and ready-made clone were always faithful.

**REAL PROJECT** (category signal genuinely absent at source):
- **AI-generator paths** — Grok emits a `type` string only, never a catalog id. A category would require matching each
  AI activity against the offered catalog (the optimizer already does this validation at `itinerary-optimizer.ts:1280`;
  the generator does not).
- **DMO drafts** — not platform inventory; a category needs a jsonb-categories → `service_categories.categoryKey`
  mapping project (or making these bookable).
- **Affiliate / suggestion** — need a source-side catalog link added first.

## Routing (for Leon)

- **Coordinates cheap-fix → small IN-LANE item** (or a tight standalone PR): 3 inserts, ~2 fields each, no schema
  change, mirrors the closed providerServiceId H-fixes. Sized: ~1 file-touch per path + one linkage-style assertion.
  R11 urgency (history accrues from the fix date forward). This is what unblocks the **neighborhood map** (R25c) once
  coords start landing and a `city_neighborhoods` centroid match can attribute them.
- **Coordinates real-project + all category work → FOLLOWUP**, this trace as its spec. The category half is what gates
  **R23 smart verbs**; neither the AI-geocode pass nor the catalog-match is a copy-a-field fix.

One caveat: for manual-add / picker the write is faithful, so any NULL on those rows is **client-side** (e.g.
`curated-content-section.tsx:96` sends neither) — investigate the calling component, not the server write.
