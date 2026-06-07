# Master Integration Brief — Phase 0 Audit

**Branch:** `claude/laughing-bardeen-KyTUY` synced to `3bc4d7a`.
**Source specs read:** `MASTER_INTEGRATION_BRIEF.md` + `SEED_DATA.md` only (the four other source specs are not yet in `/docs/specs/` — Phases 5–8 audit is therefore brief-only; engine internals will need the specs uploaded before Phase 5 builds).
**Method:** Read-only. file:line evidence. No code changed.

Decisions applied (per your direction):
- **FEE-2 flat-10%** is preserved as a config row (`fee_bands.beta_flat = 0.10`), tiered bands seeded dormant, switched via `active_provider_commission_policy` setting.
- **EXP-OVR** keeps override-wins precedence above the band.
- **`booking_fee_configs` → `fee_bands`** is a clean migration preserving live values.
- **`expert_offering_types`** is catalog-only (no conflict with CLAUDE.md's canonical `provider_services`).

---

## PHASE 1 — Taxonomy + fee_bands

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `service_categories` table | ✅ Exists (lean shape) | `shared/schema.ts:450-466` |
| `fee_bands` (rateType, defaultRate, minRate, maxRate, bandKey) | ❌ Absent — current `booking_fee_configs` (category-keyed) is the live equivalent | `shared/schema.ts:5505-5521` |
| `template_category_matrix` | ❌ Absent | (no match) |
| Fee resolver pointing at the new band | ⚠ Partial — `resolveCommissionRates` already routes through `booking_fee_configs` for Tier 4; needs to learn `fee_bands` | `server/services/commission.ts:153-179` |
| Checkout reads `expert_standard` | ⚠ Reads category rows; needs the band-key indirection | `server/routes/payments.routes.ts:320,355` |
| Zero numeric fee literals (gate) | ⚠ Mostly clean | See literal recheck below |

### What's missing

- **`fee_bands` table.** New table per SEED_DATA §1. Field shape: `bandKey TEXT UNIQUE`, `rateType ENUM('percent'|'flat')`, `defaultRate NUMERIC`, `minRate NUMERIC NULL`, `maxRate NUMERIC NULL`, `isActive BOOL`. The brief's policy-flag layer (your direction): one row in a new `platform_settings` (key/value) — `active_provider_commission_policy = 'beta_flat'`.
- **`template_category_matrix` table.** Per SEED_DATA §3. Field shape: `templateKey`, `categoryKey`, `strength ENUM('REQ'|'REC'|'OPT')`. Compound PK on `(templateKey, categoryKey)`.
- **`service_categories` columns to add (per SEED_DATA §2):** `sourceType` (`'platform_provider'|'affiliate'`), `launchTier` (`'core'|'secondary'|'segment'`), `commissionBand` (FK to `fee_bands.bandKey`), `insuranceBand` (`int 1|2|3` nullable), `riskProfile`, `requiresBackgroundCheck`, `affiliatePartnerKey` (nullable). These don't exist on the current `service_categories` row (`shared/schema.ts:450-466` is much leaner — `categoryType`, `verificationRequired`, etc.).
- **Resolver branch for the policy flag.** For `source='provider'` items, read `active_provider_commission_policy` → `beta_flat` returns the flat band; `tiered` reads `service_categories.commissionBand` → `fee_bands` row.

### Fee-literal recheck (Phase 1 gate condition)

| File | Result |
|---|---|
| `client/src/pages/itinerary.tsx` | ✅ Clean (LB-P2 holds — `grep -E "0\\.(10\|12\|15\|25\|30\|70\|75\|85)\\b"` returns 0 fee matches) |
| `server/services/commission.ts:24-30` | ⚠ Constants intentional fallbacks (`EXPERT_SHARE_RATE`, `PLATFORM_FEE_RATE`, `AI_PLATFORM_FEE`, `AFFILIATE_PLATFORM_FEE`, `AFFILIATE_EXPERT_SHARE`, `PROCESSING_FEE_RATE`). Per your direction: these stay as safe DB-unavailable fallbacks; they're not the live source. |
| **`client/src/pages/optimize.tsx:154`** | ❌ **Fee literal: `price: 49.99` in the static product tile.** This is the AI+Expert Review tier. Should read from `optimization_fees` (or its `fee_bands` successor) when this surface is touched in Phase 1. Likely cosmetic ($49.99 IS the configured default), but it's still a literal. Flagging. |
| `server/services/optimization-fee.service.ts:22-26` | ⚠ `DEFAULT_FEE_CENTS` constants (`{simple:999, standard:999, complex:999}`) are documented fallbacks — pattern matches commission.ts; stays. |

### Conflicts

- `booking_fee_configs.platformFeePercent` default is `"12.00"` (`shared/schema.ts:5508`) — legacy from pre-LB-P2 days. Live rows have been backfilled to `25/75` (`routes.ts` seed block). Migration to `fee_bands` should not propagate this default.
- `service_categories` (`shared/schema.ts:450-466`) is a much leaner shape than the brief expects — it's currently a UI/identity row, not a billing-aware row. Adding the Phase 1 columns is additive (no rename, no drop).
- The brief's `commissionBand` FK conflicts with **your beta-flat decision** if naively wired — the resolver must read the policy flag FIRST and only consult `commissionBand` when policy is `tiered`. This is the central design point of Phase 1.

---

## PHASE 2 — Offering types

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `service_offering_types` table | ❌ Absent | (no match) |
| `expert_offering_types` table | ❌ Absent | (no match) |
| Close cousins (writable) | `provider_services` (canonical bookings), `expert_service_offerings` (read-only template catalog, post-mig-013) | `shared/schema.ts:486,1039` |

### What's missing

- **Both tables are greenfield.** SEED_DATA §4 and §5 provide the row data. Field shape:
  - `service_offering_types`: `offeringTypeKey TEXT UNIQUE`, `categoryKey FK→service_categories.slug`, `displayName`, `tagline`, `isSurprising BOOL`, `marketScoped TEXT[]` (city slugs; null = universal).
  - `expert_offering_types`: `offeringTypeKey TEXT UNIQUE`, `serviceTier ENUM('advisory'|'planning'|'coordination'|'live_support'|'specialized')`, `displayName`, `tagline`, `deliveryFormats TEXT[]` (`chat|written|video|live_text|done_for_you`), `isSurprising BOOL`.

### Conflicts

- **None with CLAUDE.md.** Your confirmation that `expert_offering_types` is catalog-only (no booking writes) means it sits alongside `expert_service_offerings` as another read-only menu source. Both feed traveler-facing pickers; neither writes booking rows.
- One naming risk: there will be three "expert offering" concepts (`expertServiceOfferings`, `expertSelectedServices`, `expertOfferingTypes`). Phase 2 should add a header comment to the new table clarifying its purpose vs. the legacy ESO catalog.

---

## PHASE 3 — Neighborhood spine

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `neighborhoods` table | ✅ As `cityNeighborhoods` (different name, similar shape) | `shared/schema.ts:2451-2470` |
| `expert_neighborhoods` join | ❌ Absent | (no match) |
| `provider_neighborhood_coverage` join | ❌ Absent | (no match) |
| `neighborhood_coverage_target` | ❌ Absent | (no match) |
| `trips.primaryExpertId` | ❌ Absent | (no match) |
| `trips.neighborhoodIds` (derived) | ❌ Absent | (no match) |

### What's missing

- **The three join/target tables are greenfield.**
- **The partial unique index** the brief calls out (`UNIQUE on neighborhoodId WHERE isLead=true`) is a Postgres partial index — needs to be in the migration's `CREATE TABLE` companion.
- **Trips schema additions:** `primaryExpertId` (nullable FK→users), `neighborhoodIds` (text[] derived from itinerary items).

### Conflicts

- **Table-name reconciliation.** Existing `cityNeighborhoods` has the substantive fields (`city`, `country`, `name`, `slug`, `centroidLat/Lng`, `radiusKm`, `isFeatured`). The brief uses `neighborhoods`. **Recommendation:** keep `city_neighborhoods` as the canonical table; add the brief's expected columns (`marketKey` if we want a market-scoped naming layer separate from `city`+`country`; `adjacentKeys TEXT[]` — deferred per brief). Rename internally if you prefer; functionally the data is here.
- The brief seeds neighborhoods for 8 markets (kyoto, edinburgh, bogota, cartagena, porto, mumbai, goa, jaipur). Current rows TBD — needs `SELECT COUNT(*) FROM city_neighborhoods` at staging to know if Phase 3 is mostly seeding or also schema-shaping.

---

## PHASE 4 — Platform prereqs (G1, G5)

### G1: tripId FK on user_experiences populated at cart creation

**✅ SHIPPED.**

- `user_experiences.tripId` FK exists: `shared/schema.ts:1133` (`tripId varchar references trips.id on delete set null`).
- POST `/api/user-experiences` (`server/routes/content.routes.ts:1395-1422`) auto-creates a linked trip when `experience.tripId` is missing and writes `tripId` back to the experience row. This is exactly the G1 acceptance criterion.

### G5: Discover item → cart "add to plan"

**✅ SHIPPED.**

- `discover-location.tsx:5` imports `AddToExperienceDialog`. Component fires at the `onAdd` callback chain (lines 436, 442, 452, 464, 475, 501, 506, 554, 587).
- `AddToExperienceDialog` (`client/src/components/add-to-experience-dialog.tsx:79`) POSTs to `/api/trips/${tripId}/itinerary-items` (line 109). Invalidates `/api/trips` query on success (line 126).
- G5 acceptance ("A Discover item can be added to a plan") is met.

### Other G-items (deferred to Phase 6 per the brief's own sequencing)

- G2 guest cart, G3/G4 optimize fee+preview (note: G3/G4 already shipped via LB-P3 and CON-A.P2; verify before assuming open), G6 trip auto-create, G7 push-to-PlanCard, G8 expert CTA — these aren't Phase 4 gates per the brief. Don't pre-build.

---

## PHASE 5 — Upsell engine core

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `upsell-engine.service.ts` (eligibility/suppression, two-score, blend, cap, frequency) | ⚠ Inline approximation only | `server/itinerary-optimizer.ts:1309-1421` |
| `upsell_slot_config` table | ❌ Absent | (no match) |
| `upsell_impressions` table | ❌ Absent | (no match) |
| `UpsellContext` shape with neighborhood | ❌ Absent (current `UpsellSuggestion` is shape-only) | `server/itinerary-optimizer.ts:1309-1319` |

### What's missing

- **Greenfield service file** at `server/services/upsell-engine.service.ts`.
- **Greenfield tables.**
- **Engine internals (score formulas, suppression rules, frequency-cap mechanics).** These live in `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` (Part B). **Not in this audit's read scope.** Cannot build Phase 5 without it.

### Conflicts

- The current `generateUpsellSuggestions()` in `itinerary-optimizer.ts:1374` is a single-pass query — no eligibility filter, no relevance/revenue score split, no impressions logging. It will be replaced wholesale by the new service. Pure deletion is safe.
- `cross_sell_events` table (`shared/schema.ts:5852-5867`) is a separate, distantly related concern — it's a click/event log, not an upsell engine config. Leave it alone.

---

## PHASE 6 — Upsell surfaces

### What exists

- `itinerary-comparison.tsx:172, 1407` already consumes an `upsellSuggestions` array. That's the optimize-gate surface, partially wired.
- No surfaces for cart / discover / expert-review / checkout / post-booking / ai-concierge currently render upsell slots from a config.

### What's missing

- **All 9 surfaces** the brief enumerates (`cart`, `discover_location`, `discover_date`, `optimize_gate`, `plancard`, `expert_review`, `checkout`, `post_booking`, `ai_concierge`) need slot-renderer wiring once Phase 5 lands.
- The brief's surface order ("safest first") is fine — but specific suppression rules ("transport suppressed pre-optimize except `plancard_ontrip`") sit in the source spec, not the brief. Same blocker as Phase 5.

### Conflicts

- The existing `itinerary-comparison.tsx:1407` block hard-codes how it renders suggestions. Phase 6.2 (optimize_gate) will need to swap that for the engine's response shape.

---

## PHASE 7 — `/earn` page + traveler menus

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `/earn` page with provider + expert tracks | ❌ Absent | (no match) |
| Existing provider/expert earnings pages | ✅ But these are dashboard earnings ($, payouts) — different surface | `client/src/pages/provider/earnings.tsx`, `client/src/pages/expert/earnings.tsx`, `client/src/components/shared/earnings-card.tsx` |
| `ai_plan_polish` = the $49.99 expert-review tier | ⚠ Currently a hard-coded product tile (literal $49.99) | `client/src/pages/optimize.tsx:151-157` |

### What's missing

- Greenfield `/earn` route + page.
- "Surprising row" component that reads from `*_offering_types WHERE isSurprising=true`.
- Wiring expert offerings into expert profile pages + the "ask/book an expert" picker.
- Replacing the optimize.tsx static `$49.99` tile with a row read from `expert_offering_types` for `ai_plan_polish`.

### Conflicts

- Naming collision risk: existing `/provider/earnings` and `/expert/earnings` are dashboard pages. The brief's `/earn` is a traveler-facing acquisition page. **Use `/earn` (singular, top-level) to avoid the collision.**

---

## PHASE 8 — Admin surfaces

### What exists

| Brief expects | Repo has | Evidence |
|---|---|---|
| `fee_bands` CRUD | ⚠ As `/admin/fee-config` (per-category) + `/admin/optimization-fees` | `client/src/pages/admin/fee-config.tsx:356-360` |
| `service_categories` CRUD | ✅ `/admin/categories` | `server/routes/admin.routes.ts:721,740,755,807` |
| `template_category_matrix` CRUD | ❌ Absent | (no match) |
| `upsell_slot_config` CRUD | ❌ Absent | (no match) |
| `neighborhood_coverage_target` CRUD | ❌ Absent | (no match) |
| `*_offering_types` CRUD | ❌ Absent (would need new admin pages) | (no match) |
| `expert_neighborhoods` lead assignment | ❌ Absent | (no match) |

### What's missing

- Once Phases 1–3 land, Phase 8 needs UIs for: `fee_bands` (replaces or extends fee-config.tsx), `template_category_matrix`, `upsell_slot_config`, `neighborhood_coverage_target`, both `*_offering_types`, `expert_neighborhoods` lead-assignment.
- A `platform_settings` (key/value) editor is a one-control fee-config addition for the `active_provider_commission_policy` toggle.

### Conflicts

- `/admin/fee-config` is currently a per-category iteration. When `booking_fee_configs` → `fee_bands` migrates, the page swaps its data source. **The cosmetic CATEGORY_LABELS gap I flagged earlier becomes moot once `fee_bands.bandKey` is the iteration key** — labels can be derived from `bandKey` directly or from a separate `fee_bands.displayName` column.

---

## CROSS-CUTTING

### Decisions register status

All 7 decisions in the brief's register are honored by the audit:
- Expert split 25/75 → matches `commission.ts:24-25` and existing seed.
- New/beta expert 15/85 → not yet in code; Phase 1 will add as `expert_new` band.
- Provider bands 12/8/6/4 → Phase 1 will seed dormant per your direction.
- Neighborhood lead via `isLead` flag → confirmed by your "no new role" direction; brief partial-unique-index lands in Phase 3.
- AI-Plan Polish = $49.99 expert-review tier → today it's a static literal in `optimize.tsx:154`; needs to become a row in Phase 7.
- Upsell revenue cap 0.15 → not in code; Phase 5 seed.
- Expert vs provider supply separation → already structurally true (`provider_services` canonical, ESO catalog-only).

### Schema refinement called out in the brief

- `rateType: 'percent' | 'flat'` on fee_bands → confirmed as a Phase 1 column.

### Deferred items (build the column/flag, leave the value)

- Neighborhood `adjacentKeys`, per-neighborhood `coverage_target` tuning, affiliate per-partner exact margins → all add the columns/rows, defer the values. None block Phase 1–4.

---

## SUMMARY

| Phase | Verdict |
|---|---|
| **1** — Taxonomy + fee_bands | **Executable now.** Mostly greenfield (new table + columns); resolver edit composes with existing tiers. One literal ($49.99 in optimize.tsx) flagged but doesn't block. |
| **2** — Offering types | **Executable now.** Pure greenfield; seed data ready; no conflicts. |
| **3** — Neighborhood spine | **Executable now.** Confirm with you whether to add to existing `city_neighborhoods` or create new `neighborhoods` table (recommend: extend existing). Three new join tables + trip columns. |
| **4** — G1 + G5 | **Already shipped.** No work. |
| **5** — Upsell engine | **BLOCKED on `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` (Part B).** Cannot build score formulas/suppression rules from brief alone. |
| **6** — Surfaces | **BLOCKED on Phase 5** (and on its spec). |
| **7** — `/earn` + menus | **Executable after Phase 2.** Greenfield page; depends on `*_offering_types` rows existing. |
| **8** — Admin CRUD | **Executable per-phase.** Each preceding phase produces a table; Phase 8 builds its admin UI. Can be folded into 1–7 if you want fewer commits, or kept as a tidy final batch. |

## REQUESTED FROM YOU BEFORE PHASE 1

1. **Confirm: Phase 3 uses existing `city_neighborhoods`** (add columns), not a brand-new `neighborhoods` table. (Recommended — preserves seed rows.)
2. **Drop into `/docs/specs/` before Phase 5:**
   - `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` (Part A + Part B)
   - `NEIGHBORHOOD_SPINE_ADDENDUM.md`
   - `WAYS_TO_EARN_SERVICE_CATALOG.md`
   - `EXPERT_OFFERING_CATALOG.md`
   - `UNIFIED_PLANNING_FLOW_SPEC_v2`
3. **Confirm the $49.99 literal in `optimize.tsx:154`** can be deferred to Phase 7 (not retro-fixed in Phase 1).
4. **Go signal to start Phase 1.**

No code changes pending. Awaiting your decisions.
