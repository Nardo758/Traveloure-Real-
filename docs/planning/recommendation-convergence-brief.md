# Recommendation convergence brief — one engine for the Trip Slip and the marketplace feeds

**Status:** DESIGN ONLY — no code. HARD STOP after this document; nothing below is authorized to build until the
decision-maker ratifies it and answers §G.
**Base:** every citation is code on `origin/main` @ `519ee6c4a` (2026-09-26). Where a thing exists only in a spec or
comment, it is marked **SPEC-ONLY**. Where the repo differs from the prompt's model, it is marked **DEVIATION**.
**Rule carried throughout:** extend the existing upsell engine; do not design a parallel ranker.

---

## 0. The problem, in one paragraph

Traveloure ranks the same kinds of content (provider listings, experts, Gems, affiliate products) in at least six
different ways on six surfaces, and the one surface where a traveler actually builds a plan — the Trip Slip
(`/plans/:tripId`) — renders **no recommendations at all**. The one principled ranker in the codebase, the upsell engine,
is contract-tested but ranks *offering types* rather than items, scores "profile match" as a constant, and silently
returns an empty slate for the platform's most common trip type. Spatial context, template semantics, trend signal and
native-first intent each exist in partial form in separate places. This brief proposes one candidate → eligibility →
score → rank → render pipeline, built on the upsell engine, that both the Slip and the marketplace feeds call with a
different context.

---

## A. Inventory

State key: **built** = wired and reachable in production · **partial** = code exists, coverage or wiring incomplete ·
**dormant** = code exists, no live caller or flag-gated off · **SPEC-ONLY** = named in docs/comments, absent from code.

### A0. The upsell engine (the host for everything below)

| Piece | Where | State |
|---|---|---|
| Pure ranker `rankCandidates(ctx, candidates, slotConfig, policy)` | `server/services/upsell-engine.service.ts:300-364` | built |
| `UpsellContext` (surface, tripId, templateKey, location, dateRange, cartItems, userProfile, neighborhoodIds, tripIsPostOptimize) | `upsell-engine.service.ts:54-72` | built |
| `UserProfile` (budgetTier, mobilityLevel, partySize, familyKids, interests, dietary) | `upsell-engine.service.ts:44-52` | built as a type; **never populated** (below) |
| `SlotConfig` (maxItems, revenueWeight, revenueCap, frequencyCapHours, enabled) + `upsell_slot_config` rows | `upsell-engine.service.ts:74-81`; `shared/schema.ts:9564`; seed `server/migrations/049_*.sql:67-79` | built; no admin UI |
| `DEFAULT_POLICY`: relevance = 0.40·templateStrength + 0.25·profileMatch + 0.20·proximity + 0.15·expertEndorsed; final = relevance + min(revenueWeight, cap)·normalizedRevenue | `upsell-engine.service.ts:133-146, 160, 189-196` | built |
| Relevance-dominance trust contract (band 0.15) | `upsell-engine.service.ts:211`; test `server/services/__tests__/upsell-engine.test.ts:106-160`; CI `.github/workflows/upsell-trust-contract.yml` | built, CI-gated |
| Hard filters: not in matrix · already in plan · transport before optimize · risk×mobility / kids · unverified background check | `upsell-engine.service.ts:313-336` | built |
| Candidate gatherer `gatherOfferingCandidates` (offering types ⋈ categories ⋈ `template_category_matrix` ⋈ `fee_bands`, + covering inventory from `provider_neighborhood_coverage`) | `server/services/upsell-query.service.ts:42-131, 154-249` | built |
| `profileMatchScore` | `upsell-query.service.ts:232` — hard-coded `0.5` | **stub** — 25% of relevance is a constant |
| Proximity | neighborhood-match tier 1/0.7/0.4 (`upsell-query.service.ts:135, 233`) | partial — tier match, not travel time |
| Surfaces (routes) | `server/routes/upsell.routes.ts`: cart :161, discover-location :231, discover-date :276, optimize-gate :379, plancard-pretrip :441, plancard-ontrip :507, expert-review :641, checkout :781, post-booking :833, ai-concierge :887 | built server-side; **4 have no client caller** (optimize-gate, expert-review, post-booking, ai-concierge); `template_builder` seeded, no route |
| Client | `client/src/components/UpsellSlot.tsx:103-155`; `cart.tsx:2349, 2894`; `discover-location.tsx:1789`; `PlanCardUpsellSlot.tsx:61` via `PlanCard.tsx:1253-1273` | partial |
| Impressions | `upsell_impressions` (`shared/schema.ts:9580`) via `logImpressions` (`upsell-engine.service.ts:409`) **and** client POST `/impression` (`upsell-query.service.ts:585`) | partial — **double-logged** (no unique key); `clicked_at`/`added`/`booked` never written; `suppressed[]` reasons not persisted |
| Server cache / precompute | none (client react-query `staleTime` 5 min only) | missing |
| `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC`, SEED_DATA §3 | cited in comments (`upsell-engine.service.ts:22`), not in repo | **SPEC-ONLY** |

**DEVIATION A0-1 — the engine is not yet "one engine, many surfaces."** It serves six client surfaces, but these rank
on their own: `/services` (`storage.unifiedSearch`, `server/storage.ts:3976-3988`), the Discover location feed
(`location-view.service.ts:555` via `featured-sort.ts`), `/api/content/discover` (pinned → placed → ILIKE,
`content.routes.ts:8941-9142`), `/api/catalog/*` (upstream order, `experience-catalog.service.ts:278-284`),
`/ready-made` (badge tier, `ready-made.routes.ts:1060-1072`), `/api/experts` (no ORDER BY; non-transitive client
comparator, `client/src/pages/experts.tsx:347-364`), the optimizer (`itinerary-optimizer.ts:768-856`), and the orphaned
`recommendation.service.ts` (`getUserRecommendations` :1046+). `feed-composition.ts` places engine output into Discover
but does not re-rank organic items.

**DEVIATION A0-2 — the engine ranks offering *types*, not items.** Its candidate is a `service_offering_types` row
(`RankInputCandidate`, `upsell-engine.service.ts:84-98`). A slip needs to rank *bookable things* — a specific listing, a
Gem, an affiliate product — and to prompt for a *category* when a required slot is empty. Both grains are needed.

### A1. Editable surface — the Trip Slip (SOLVED as host; one leak)

| Piece | Where | State |
|---|---|---|
| Slip page | `/plans/:tripId` → `SlipView` (`client/src/App.tsx:680`) | built |
| Slip-only actions | `SlipRail.tsx` (Optimize gate, `BuildAroundDialog` :618, Finalize, hire picker); `client/src/lib/slip-plan-actions.ts:66,134`; `client/src/lib/slip-rail.ts` | built; gated by `.github/workflows/slip-rail-actions-gate.yml` |
| Trip Card is read-out only | `TripCardRail.tsx:184` ("the Trip Card is not a planning surface") | built |
| Recommendation surface on the Slip | none — `SlipView`/`SlipRail` mount no `UpsellSlot` and call no `/api/upsell/*` | **missing** |
| "Browse services for this trip" | builds a link only (`slip-rail.ts:232`); ranking then happens in unpersonalised `unifiedSearch` | partial |
| Role chips | `SlipView.tsx:840-864`, server order preserved (`slip-event-roles.ts:90-93`) | built; **no covered/missing state** |

**FINDING (verify before build, not fixed here):** per-item `RoutingActions`
(`client/src/components/plancard/ActivitiesSection.tsx:235-252`) is rendered from `ActivitiesSection` (:828), which
`PlanCard` mounts with `isOwner` (`PlanCard.tsx:1217`), and snapshot items carry live `routingStatus`
(`trip-plan.service.ts:94`). The owner may still be able to route items from the Trip Card — a conflict with LD 42
D8/D16. Code-read only; not reproduced at runtime.

### A2. Spatial context

| Piece | Where | State |
|---|---|---|
| Trip-level anchor | nothing persisted | **missing** |
| Optimizer variant anchor (hotel / neighborhood / activity; median haversine, 80 m/min walk estimate) | `itinerary_variants.anchor_*` (`shared/schema.ts:2303-2311`); `server/services/anchor-candidates.ts:42-100`; `anchor-scoring.ts:79-96`; `shared/geo.ts:37-40`; UI `BuildAroundDialog` | built, **per comparison, not per trip** |
| Expert stay-anchor (centroid + nearest neighborhood) | `server/routes/advisor.routes.ts:198-255` | built, computed not stored |
| Booked stay as anchor | `itinerary_items.check_in/check_out` (`schema.ts:5714-5715`), projected only for `per_night` (`cart-projection.service.ts:332-333`); `provider_services.can_anchor` "CAPTURE ONLY" (`schema.ts:1321-1323`) | partial — nothing reads it as the anchor |
| `trips.neighborhood_ids` | `schema.ts:131` | **dormant** — no reader |
| Item coordinates | `itinerary_items.latitude/longitude` (`schema.ts:5623-5625`), resolved on write, 12/request, no city-centre fallback (`trip-plan.service.ts:335-365`); partner picks now carry their own pair (PR #1107) | built |
| Listing coordinates + precision | `provider_services.latitude/longitude/location_precision` (`schema.ts:1405-1413`) — often `neighborhood_centroid`; **not inherited by plan items, precision not in DTO** | partial |
| Neighborhood spine | `city_neighborhoods` centroid NOT NULL, `radius_km`, `adjacent_keys`, `default_daypart` (`schema.ts:4879-4911`); `provider_neighborhood_coverage` (:5114); no polygons; `radius_km` unread | partial |
| Routing provider | Google Routes v2 `computeRoutes` only (`server/services/routes.service.ts:157, 284-390`) — TRANSIT and DRIVE; **no WALK, no matrix** | partial |
| `/api/routes/transit-multi` | `content.routes.ts:4221, 4257` — auth-only, **unbounded destinations, no rate limit, no cache, no cost log** | built, **cost risk** |
| Transport legs | `transport-leg-calculator.ts:259-311` drive-only; `scoreModeForUser` (:313) dead; `alternativeModes: []` so mode switch is inert | partial |
| Travel-time cache | none (only `optimizer_geocode_cache` for geocodes, `schema.ts:4206`) | **missing** |
| Cost control for routing | none (geocoding is capped; routing is not) | **missing** |
| Routes API on the production key | `.env.example:12` lists Places, Maps JS, Geocoding — not Routes | **unverified** |

### A3. AI optimization, profiling, metrics

| Piece | Where | State |
|---|---|---|
| Optimizer catalog | `loadOptimizerCatalog` `.limit(100)` **with no ORDER BY** (`optimizer-baseline.service.ts:262-268`), top-20 cut after a trending/profile sort (`itinerary-optimizer.ts:768-856, ~1216`) | partial — candidate recall is effectively arbitrary |
| Optimizer constraints | budget, traveler profile, `temporal_anchors` as immovable (`itinerary-optimizer.ts:892-901, 991, 1255-1265, 1304`) | built |
| Ask-AI proposals scope | `AiTaskPromptScope` (`server/services/ai-task-prompt.ts:200`) — no budget/pace/interests/dietary | partial |
| Traveler profile | `users.preferences` jsonb with three namespaces: `settings`, `travelPreferences` (`storefront.routes.ts:50, 395-416`), `travelerProfile` (`traveler-profile.service.ts:60-100`; route has no client caller) | partial — three stores, one reader (optimizer) |
| Trip preferences | `trips.preferences` jsonb, `budget`, `adults/kids`, `eventType` (`schema.ts:107-133`); `trip_contexts` (destination/dates/party/experience only, `trip-context.routes.ts:94-150`) | partial |
| Interests | request bodies only (`content.routes.ts:4886` defaults) | **missing as stored data** |
| Metrics | `upsell_impressions`; `content_impressions` (`schema.ts:7440`); `affiliate_clicks` (:6712) with `sourceImpressionId`; `recommendation_conversions` (:7629) | built as capture; **no reader feeds any ranker** |

### A4. Trend signal (TravelPulse)

| Piece | Where | State |
|---|---|---|
| Daily ingestion | `travelpulse-scheduler.service.ts:16-80` (timer from `server/routes.ts:12286`); adapters `trend-engine/ingestion-runner.ts:25-34`: wikimedia, gdelt, nager_date, open_meteo, internal_trips, besttime, predicthq, x_api | built (runner comment calling three adapters "disabled skeleton" is stale — migration `236_*.sql` enables all 8) |
| X adapter | `/2/tweets/counts/recent`, per market, 7-day window; `raw_ref` forced NULL by CHECK `chk_x_api_raw_ref_null` (`adapters/x-api.adapter.ts:1-56, 138, 176-197`; migration 236) | built, live **only if `X_BEARER_TOKEN` set**; cost logged as 0¢ |
| Signals | `trend_signals` append-only with `source`, `metric`, `value`, `observed_at`, `ingested_at`, `resale_class`, `surface_origin` (excluded from scoring — feedback-loop guard), `pre_launch` (`shared/schema.ts:11673-11690`) | built; **no sample-size / n column** |
| Scores | `trend_scores` one row per entity, overwritten each run, `why_text` top-3 (`schema.ts:11787-11802`; `trend-score.service.ts:138-184`) | built; **no history** |
| Decay / noise floor | `weight × 2^(−age/halfLife)` (:148-153); `CONFIDENCE_FLOOR = 0.30` breadth/density blend (:38, 168-177) | built; floor is not a per-signal minimum count |
| Grain | 8 hard-coded markets (`235_*.sql:39-48`); entity types neighborhood/gem/offering_type declared but unpopulated | partial |
| Crowd Engine | `crowdBand: null // Phase 4` (`trend-score.service.ts:292`) | **SPEC-ONLY** |
| Consumers | `getTrendingCities` (`travelpulse.service.ts:573-643`) for /destinations; trend-lens string (`location-view.service.ts:637-662`) | built; **no recommender uses `trend_scores`** |
| Legacy Grok trend | `travel_pulse_trending` (LLM-generated, 30-min expiry; `travelpulse.service.ts:66-94`) still read by `recommendation.service.ts:604`; `content_placement_rules.min_pulse_score` gates on static `pulseScore` (`content.routes.ts:8974-8996`) | built but contradicts the no-LLM trend rule |
| Creation-burst risk | `internal_trips` is a first-party source at weight 0.25, half-life 30d (migration `236_*.sql`) — trip creation counts as demand | **live risk** (the artifact the prompt names) |
| Source ToS storage / retention | X `raw_ref` is kept NULL by CHECK; retention obligations for stored X-derived counts | **unverified — a risk to confirm, not a settled fact** |

### A5. Platform-native content

| Piece | Where | State |
|---|---|---|
| Native read gates | `provider_services` approved+active (`location-view.service.ts:526-533`; `upsell-query.service.ts:92-95`); ready-made (`ready-made.routes.ts:1046-1048`); affiliate partner approval (`content-query.service.ts:640`) | built |
| Existing bounded boost | `FEATURED_BOOST = 10` on a 0–100 quality scale, `FEATURED_MIN_QUALITY = 30` (`server/services/featured-sort.ts:29, 36, 62-72`) on two surfaces | built; **silent (not disclosed), unmeasured items still boosted** |
| Native-vs-affiliate term in the engine | `sourceType` exists (`platform_provider | affiliate | expert_package`) but **no scoring term**; cart drops affiliates entirely (`upsell.routes.ts:190`) | missing |
| Affiliate-first ordering | `/api/content/discover` orders affiliate before registry in every tier, no cap, no native `provider_services` (`content.routes.ts:9127-9140`) | built — **the opposite of goal 5** |
| Gems | `local_knowledge_nuggets` (no coordinates; `schema.ts:9876-9929`) → admin-approved `travel_pulse_hidden_gems` with lat/lng and manual `gem_score` 1–100 (`gem-promotion.service.ts:26-158`; `schema.ts:4821-4872`); ordered `gem_score DESC` only | partial |
| Disclosure | "Paid partner" on affiliate items (`shared/content-origin.ts:43-47`); feed-composition "Recommended"/"Paid partner" (`client/src/lib/feed-composition.ts:57-63`); "Why recommended" modal (`city-feed-card-recommendation.tsx:274-302`) | partial — **no "Traveloure pick"/"Featured" label; featured boost is silent** |
| Why-shown log | `upsell_impressions` stores scores+rank, no reason/policy/boost; `content_impressions` stores position only | partial |

### A6. Experience-aware

| Piece | Where | State |
|---|---|---|
| `template_category_matrix` (REQ/REC/OPT; absence = "—") | `000_baseline_schema.sql:3176`, CHECK :3181; `shared/schema.ts:9495-9502`; seed `035_phase1_seed_template_matrix.sql` (travel, wedding, proposal, date_night, birthday, corporate; custom = all OPT) | built; **no admin UI, no change log** |
| Second copy of the matrix | `content-gap-taxonomy.ts:201+` with separate weights 3/2/1 (`server/config/trailhead.config.ts:77`) | **drift risk** |
| Template vocabularies | matrix: underscore keys (`date_night`, `corporate`); `experience_types.slug`: ~28 hyphenated slugs (`server/seeds/experience-template-tabs.seed.ts:4788-4920`); `trips.event_type`: `eventTypeEnum` default `"vacation"` (`shared/schema.ts:46, 112`); `shared/occasions.ts:40` maps slugs → eventType; **nothing maps either to a matrix key** | **DEVIATION — broken**: `resolveTemplateKey` (`upsell-query.service.ts:664-668`) only maps empty → `travel`, so a `vacation`/`honeymoon`/`anniversary`/`adventure`/`cultural`/`other` trip gets **zero matrix rows and an empty slate** |
| Occasion switches, `roles_needed` | `experience_types` (`schema.ts:2400-2406, 2427`), LD 28/31; read by slip role chips | built; **a second template→category map, never reconciled with the matrix** |
| Subcategory prefs (style, pace, mobility, attendees, formality) | pace/mobility/dietary per user (`traveler-profile.service.ts:92`); attendees via adults/kids / `user_experiences.guestCount`; formality **SPEC-ONLY** (no column) | partial |
| Template anchor presets | `logistics-presets.service.ts:1076-1131` (`TEMPLATE_PRESETS`), `trips.routes.ts:1822` | built; **not read by any ranker** |
| Temporal anchors | `temporal_anchors` typed (`schema.ts:53-58, 5876`) with nullable lat/lng; optimizer treats as immovable | built for the optimizer only |
| Group constraints | `trip_participants` dietary/accessibility/mobility/arrival/departure (`schema.ts:5447-5484`); `trips.accessibility_note` (:254) | built as data; **unread by any ranker**; (no `event_invites` table under that name in `shared/schema.ts` — invites live in `shared/guest-invites-schema.ts`) |
| Completeness | `computeEmptySlots` (`upsell.routes.ts:611`) + `derivePlanCardGapData` (:444-486) filter the pretrip slate only | partial — **not a slip checklist** |
| Per-template weights | none; `DEFAULT_POLICY` is global | missing |

---

## B. Framework — one pipeline on the upsell engine

```
            ┌──────────── CONTEXT ────────────┐
 surface ─► │ template · anchor · party · dates │
 (slip|feed)│ profile · plan items · location  │
            └───────────────┬─────────────────┘
                            ▼
 GATHER (per source, parallel) ──► ELIGIBILITY (hard, explainable) ──► SCORE (pure) ──► RANK + CONTRACTS ──► RENDER
  native listings │ experts │ Gems │ affiliate      matrix · availability ·          fit · proximity ·     dominance · boost   slip slots /
                                                     constraints · already-in-plan    trend · quality ·     band · diversity    feed tiles
                                                                                      (revenue) (boost)
                                    every stage writes one impression row: scores, terms, policy version, reasons
```

**Principle:** the engine's existing shape — gather in `upsell-query.service.ts`, rank purely in `rankCandidates`,
log in `logImpressions` — is kept. What changes is the candidate model, the term set, the policy per template, and who
calls it. `rankCandidates` stays pure and contract-tested; nothing about ranking moves into a route.

### B1. Candidate model (two grains)

- **Category candidate** — today's `RankInputCandidate` (an offering type / category key). Used for (a) REQ-slot gap
  prompts ("You still need a photographer") and (b) the existing upsell surfaces unchanged.
- **Item candidate** — new: one bookable or addable thing, with `{ sourceType: native_listing | expert_offering | gem |
  affiliate_product, sourceId, categoryKey, coords + precision, neighborhoodKey, price snapshot, quality inputs,
  availability facts }`. Every item candidate names its `categoryKey` so the matrix still governs it.

Both grains flow through the same eligibility → score → rank stages; a category candidate simply has no item-level
terms (no coords → proximity omitted, not zero).

### B2. Candidate sources (gatherers)

| Source | Gate (reuse, do not restate) | Notes |
|---|---|---|
| Native listings | `provider_services` approved + active (the F2 gate at `upsell-query.service.ts:92-95`) + `provider_neighborhood_coverage` | inherit listing coords + `location_precision` |
| Expert offerings | same `provider_services` gate on expert-owned rows; expert endorsement keeps its existing term | |
| Gems | `travel_pulse_hidden_gems` (approved), with the consent gate for photos (`neighborhood-claims.service.ts:762-780`) | nuggets have no coords → only promoted gems are candidates |
| Affiliate | `affiliate_products` behind the partner approval gate (`content-query.service.ts:640`); `content_registry` published | partner URL never leaves the server (§16) |

Recall is **ordered and bounded** at the gatherer (by neighborhood coverage then a cheap prior), never the arbitrary
`.limit(100)` without ORDER BY the optimizer uses today.

### B3. Eligibility (hard filters — each suppression logged with a reason)

1. **Template matrix** — category must have a REQ/REC/OPT row for the resolved template key (absence = "—" = never).
   Requires the vocabulary fix (§F phase 0): one mapping module from `experience_types.slug` / `eventType` → matrix key.
2. **Already in plan** — existing filter, extended to item identity (sourceType + sourceId), not only category.
3. **Availability** — date window intersects the trip; listing active; slot capacity where known; `request_only`
   listings are eligible but rendered with their own action (LD 56 / #1101 behaviour), never as instant.
4. **Constraints** — existing risk×mobility, kids opt-in, background check; **plus** group constraints
   (`trip_participants.accessibility_needs/mobility_level/dietary`, `trips.accessibility_note`) and temporal anchors
   (a candidate that cannot fit around an immovable anchor window is ineligible, not down-ranked).
5. **Honesty** — a candidate with no stated price is never shown as free (V-11); a candidate with only a
   neighborhood-centroid pin is eligible but carries `precision: centroid` into proximity (B4).

### B4. Scoring terms

All terms are normalised to [0, 1]; an absent input **omits** the term and re-normalises the remaining weights for that
candidate (§13 — never a fabricated 0.5, which is what `profileMatchScore` does today).

| Term | Definition | Data source |
|---|---|---|
| **fit** | template strength (REQ 1 / REC 0.7 / OPT 0.4, existing) × profile match (budget band vs price snapshot, interests vs category tags, pace, dietary, party-size fit, formality when it exists) | `template_category_matrix`; ONE profile reader merging `users.preferences.travelerProfile`, `travelPreferences`, `trips.preferences`, `trip_contexts`, `trip_participants` (§F phase 1) |
| **proximity** | expected travel time from the plan anchor, mode-aware; decays with a template-specific half-time (a date night tolerates ~15 min, a travel day ~40) | precomputed neighborhood→neighborhood matrix (B7) + item's neighborhood; per-item routed time only for items already on the plan's map |
| **trend** | decayed, confidence-floored score for the candidate's entity (market today; neighborhood / gem / offering-type when those entities are populated), **capped**, never the sort key | `trend_scores` (not the Grok-era `travel_pulse_trending`); provenance = `scoring_run_id` + contributing sources |
| **quality** | shrunk rating (Bayesian average toward a category prior, so 1 review at 5★ ≠ 200 at 4.8★), review count, expert endorsement (existing term), verified provider, gem score (admin-assigned), coordinate precision | `provider_services` rating/reviews; `travel_pulse_hidden_gems.gem_score`; `affiliate_products.rating/reviewCount` |
| **platform boost** | §C — tiebreaker by default | `sourceType` |
| *(revenue — existing)* | `min(revenueWeight, cap) · normalizedRevenue`, kept only where the slot config sets `revenueWeight > 0` | `fee_bands` (existing) |

**Trend hardening (the creation-burst artifact).** Trend enters as one term and is protected by:
1. **Exclude self-generated signal** — `surface_origin` rows are already excluded; extend to exclude `internal_trips`
   rows created by test/e2e accounts and to count distinct users, not trips.
2. **Corroboration** — a trend term is non-zero only when ≥2 independent source families agree (first-party alone
   cannot lift an entity).
3. **Minimum n** — add a per-signal sample-size field (schema, ratification needed) and a floor per source, the pattern
   `server/config/demand-floors.config.ts:32-37` already uses.
4. **Entity-age guard** — an entity created within the last N days earns no trend credit (a burst at birth is creation,
   not demand).
5. **Score history** — keep a history table (or append-only runs) so a spike can be seen as a spike; today
   `trend_scores` is overwritten.
6. **ToS risk** — whether X-derived counts may be stored and for how long is a risk to verify before widening
   retention; nothing here assumes it is settled.

### B5. Per-template weight profiles and anchor resolution

Weights replace the global `DEFAULT_POLICY` with a **named, versioned profile per template**; the profile version is
written on every impression row. Illustrative starting values (to be tuned, not ratified):

| Template | fit | proximity | trend | quality | anchor resolution order |
|---|---|---|---|---|---|
| travel | 0.40 | 0.25 | 0.10 | 0.25 | booked stay → user pin → chosen neighborhood → none |
| wedding / corporate | 0.50 | 0.20 | 0.00–0.05 | 0.30 | venue (event `location` / `custom_venues`) → booked stay → none |
| date_night / proposal | 0.35 | 0.25 | 0.15 | 0.25 | restaurant / proposal-moment `temporal_anchors` location → user pin → none |
| birthday | 0.40 | 0.20 | 0.15 | 0.25 | party venue → user pin → none |
| custom | 0.40 | 0.25 | 0.10 | 0.25 | user pin → neighborhood → none |

"none" is honest: with no anchor, proximity is omitted (not zero) and the Slip says "Set a base to rank by distance".
Temporal anchors constrain eligibility (B3) and supply the anchor *time* for time-bucketed travel-time lookups.

### B6. REQ slots vs ranked suggestions

- **REQ** categories for the plan's template are **slots**. The Slip renders each as filled (an item of that category is
  on the plan) or **empty — a gap with a prompt**, and the prompt opens the ranked item list for that category. This
  reuses `computeEmptySlots` / `derivePlanCardGapData` logic, moved to one shared derivation both the slot list and the
  pretrip slate read.
- **REC / OPT** are ranked suggestions, never gaps.
- `experience_types.roles_needed` (the role chips) and the matrix's REQ rows describe the same thing twice. Proposed:
  the matrix is the authority for eligibility and REQ; `roles_needed` becomes a projection of it (see §G-2), so a role
  chip shows covered/missing from the same derivation.

### B7. Slip vs marketplace context (same engine, different `UpsellContext` / `SlotConfig`)

| | Slip (`/plans/:tripId`) | Marketplace feeds |
|---|---|---|
| Template | the plan's resolved key | the page's occasion if any, else `travel` |
| Anchor / proximity | plan anchor (B5) | the browsed neighborhood / city centre of *the feed*, used only to sort, never shown as a distance; omitted when absent |
| Profile | full (user + trip + participants) | user profile only (signed-in) or none |
| Plan items | exclude already-added; drive REQ gaps | n/a |
| Revenue term | **0 by default** (planning surface — best fit) | existing capped value per slot config |
| Platform boost | tiebreaker | tiebreaker |
| Slot config | `slip_gaps`, `slip_suggestions` (new rows) | existing surfaces + `/services` default sort, Discover organic, curated section (migrated in phase 6) |

### B8. Request-time vs precomputed, and cost

| Precomputed (scheduled) | Request-time |
|---|---|
| Neighborhood→neighborhood travel-time matrix **per market × mode × time bucket** (walk ≤ 2 km pairs, transit, drive only in drive markets); built from `city_neighborhoods` centroids + `adjacent_keys`, refreshed monthly | eligibility, fit, final ranking (pure, cheap) |
| Item → neighborhood assignment (nearest centroid within `radius_km`, else unassigned) | proximity lookup = item neighborhood × anchor neighborhood from the matrix (no API call) |
| Trend scores (existing daily) | per-item routed times **only** for the ≤ N items on the plan's map, cached |
| Quality priors per category | impression logging |

**Cost arithmetic (the reason for the matrix).** Kyoto has on the order of 20–30 spine neighborhoods → ~400–900
ordered pairs × 2–3 modes × a few time buckets ≈ a few thousand Routes calls per market per refresh, bounded and
schedulable. Per-request fan-out (today's `transit-multi` pattern) is (candidates × modes) per page view and unbounded.
Required regardless of phase: a `travel_time_cache` keyed (origin, destination, mode, time bucket) with TTL; a monthly
cost ceiling logged to `api_usage_logs` (the trend engine's `cost-enforcement.ts:48-105` pattern); a destination cap and
rate limit on `/api/routes/transit-multi`. **Walk mode needs the Routes API WALK travel mode, which the code does not
call today, and the Routes API must be confirmed enabled on the production key.** Market mode policy (Kyoto =
walk + transit, no drive) is market config, not code.

---

## C. Platform boost

Goal 5 (native first) and goal 3 (best fit for this traveler) conflict whenever a native item is not the best item.
This section makes the conflict explicit rather than resolving it silently.

### Option 1 — Tiebreaker (proposed launch default)

Rank by the non-commercial score. Within any group of candidates whose scores differ by less than ε (proposed 0.03 on a
[0, 1] scale), native sorts before affiliate. Outside that band, the boost does nothing.

- **Weak native vs clearly better affiliate:** fit 0.55 vs 0.80 → difference 0.25 ≫ ε → affiliate first. Guaranteed.
- **Near-equal:** 0.78 vs 0.80 → native first; the traveler loses at most ε of score.
- **Pros:** cannot surface a worse item by more than ε; trivially testable (a CI contract like the existing dominance
  test); easy to explain ("when options are about equally good, we show Traveloure's own first").
- **Cons:** a small lift — native rarely moves unless it is already competitive; ε is a judgment call.

### Option 2 — Capped weighted term

`final = relevance + min(b, cap) · isNative`, with cap (e.g. 0.08) and the existing dominance contract extended so no
item with lower relevance than another by more than the band can outrank it.

- **Weak native vs clearly better affiliate:** relevance 0.55 + 0.08 = 0.63 < 0.80 → affiliate first. Holds only while
  cap < the gap; with cap 0.08, any native within 0.08 of a better affiliate outranks it.
- **Pros:** a stronger, smoother lift; the same shape as the existing revenue blend.
- **Cons:** it trades up to `cap` of fit for platform preference on every list; two commercial terms (revenue +
  native) would then share one dominance band, and the combined effect is harder to reason about.

### Both options require

- **Bound:** ε or cap is config, logged per impression with the policy version.
- **Log:** every impression row records `boost_applied` (bool), the pre-boost rank and the post-boost rank.
- **Disclose:** a native item that moved because of the boost carries a visible "Traveloure pick" label with a
  "Why am I seeing this?" line (reusing the "Why recommended" modal, `city-feed-card-recommendation.tsx:274-302`); the
  existing silent `FEATURED_BOOST` is folded into this term and gets the same disclosure.
- **Contract:** a CI test that a native item with fit lower by more than ε (or cap) never outranks.

### Conflicts flagged, not resolved

1. **Native first vs best fit.** Either option spends some fit on platform preference; the tiebreaker spends ≤ ε, the
   weighted term ≤ cap. Which is acceptable is a business decision (§G-4).
2. **The revenue term already exists.** `DEFAULT_POLICY.revenueWeight = 0.15` is a commercial term inside the same
   score. This brief proposes revenue = 0 on the Slip (a planning surface) and unchanged on the marketplace slots; if
   the decision-maker wants revenue on the Slip too, the boost and revenue must share one bounded commercial budget.
3. **`/api/content/discover` orders affiliate ahead of registry today** (`content.routes.ts:9127-9140`) — the inverse
   of goal 5, on a live surface. Migrating that surface (phase 6) changes what travelers see there.

---

## D. Map

**Reuse, do not build a new map.** The Slip and the Trip Card already mount the same component,
`MapControlCenter` (`client/src/components/plancard/MapControlCenter.tsx`; Slip `SlipView.tsx:1785`, Card
`PlanCard.tsx:1311`), with the shared `isLocated` predicate (:67-80), the "X of Y located" line, and the Slip's
disable-when-none-located rule (`SlipView.tsx:1415-1418`). The planning additions are **Slip-only layers and actions**
passed in as props; the Card keeps the component read-only.

**What the Slip map adds**

- **Anchor marker** — the resolved plan anchor (B5), labeled with its source ("Your hotel", "Your pin",
  "Gion (neighborhood)"). No anchor → no marker and a "Set a base" action.
- **Travel-time labels** on plan items: "12 min walk", "25 min transit" from the anchor, mode per market policy; an
  item whose time came from the neighborhood matrix is labeled approximate ("~15 min"), a routed one exact. Items with a
  centroid-precision pin say so.
- **Suggestion layer** (off by default on travel, on for REQ gaps): ranked candidates for the selected category or gap,
  drawn as secondary pins, never mixed visually with plan items.
- **Unlocated list** — unchanged honesty: unlocated items are listed, never guessed onto the map (LD 22).

**Slip-only actions on the map:** set/move the anchor pin (explicit user placement, the LD 22 confirm posture); add a
suggestion to the plan (the existing `POST /api/trips/:tripId/itinerary-items` rail — no new write path); open an
item's detail. Routing actions (checkout / expert / finalize) stay in `SlipRail` and the item row — **not** on the map.

**Trip Card map:** unchanged — plan pins, transport polylines, "open in Maps", no anchor editing, no suggestions, no
routing. (Separately: verify and close the `RoutingActions` leak in §A1.)

**Default visible layers per template**

| Template | Default on | Off by default |
|---|---|---|
| travel | plan items, anchor, travel-time labels | suggestions, transport polylines |
| wedding / corporate | plan items, venue anchor, event timeline order | suggestions (on per REQ gap) |
| date_night / proposal | plan items, anchor, walking times | trend-hot suggestions (toggle) |
| birthday | plan items, venue anchor | suggestions |
| custom | plan items, anchor if set | everything else |

`ExperienceMap` (`client/src/components/experience-map.tsx`) — the only anchor→item travel-time map today — is on the
pre-plan experience-template page; it keeps working and is **not** the Slip map. Converging it onto
`MapControlCenter` is a later cleanup, not part of this programme.

---

## E. Rejected alternatives and trade-offs

1. **A new ranker beside the upsell engine.** Rejected by the prompt and by §18 rule 1: the engine already has the
   gather/rank/log split and the only CI-gated trust contract. Cost: the engine must grow an item grain.
2. **LLM ranking (send candidates to a model, take its order).** Rejected for ranking: non-deterministic, uncontract-
   able, costly per page view, and the trend engine's own rule already refuses LLM-generated trend. The optimizer and
   Ask-AI keep using a model *to compose plans*, but they draw candidates from this pipeline (fixing today's arbitrary
   100-row catalog).
3. **Per-request distance-matrix calls for every candidate.** Rejected on cost (B8); kept only for the few items on
   the plan's map, cached.
4. **Trend as the sort key / a "Trending" rail that sorts purely by trend.** Rejected: trend is one capped term with a
   noise floor. A trending *label* may render; it never decides order alone.
5. **A hard native-first tier (ready-made-style badge tier).** Rejected: it lets any native item beat any affiliate
   item, which breaks goal 3 outright. §C's bounded options replace it.
6. **Isochrone polygons from a mapping vendor.** Deferred: a second vendor, and labels + ranked lists meet the need.
7. **Learned ranking from click data now.** Deferred: impressions are double-logged and `clicked_at`/`added`/`booked`
   are never written, so there is no clean training signal yet. Phase 0 fixes the logging; learning is a later lane.
8. **Keep `roles_needed` and the matrix as parallel maps.** Rejected: two maps of "what this occasion needs" will
   disagree; §G-2 proposes one authority.

---

## F. Phased build plan (HARD STOP between phases)

Each phase ships behind its own flag, appends its own ledger row, and waits for the decision-maker before the next.

**Phase 0 — Make the engine honest (no new features).**
Ships: one template-key mapping module (slug / eventType → matrix key) so `vacation` et al. stop returning empty slates;
fix impression double-logging and write `clicked_at`/`added`/`booked`; persist `suppressed[]` reasons and a policy
version; replace `profileMatchScore: 0.5` with "omit + re-normalise" (no profile yet ≠ half a match); remove the
`content-gap-taxonomy.ts` matrix copy in favour of the table; verify the Trip Card `RoutingActions` leak.
Depends on: nothing. Verify: existing `upsell-trust-contract` green; new unit tests for the mapping and the omit rule;
a DB test that one server call writes exactly one impression row.
**HARD STOP.**

**Phase 1 — Item grain + one profile reader.**
Ships: item candidates from the four gatherers (B2) with ordered recall; one profile reader merging the three profile
stores + trip + participants; group-constraint and temporal-anchor eligibility. Engine returns items for a context;
no new surface yet.
Depends on: 0. Verify: pure tests per eligibility rule; a fixture trip per template returns a non-empty, explainable
slate; dominance contract extended to items.
**HARD STOP.**

**Phase 2 — Anchor + proximity.**
Ships: anchor resolution (B5) read-time from existing data; a user-set anchor pin (needs one nullable column — schema
decision, §G-3); item→neighborhood assignment; the precomputed travel-time matrix with `travel_time_cache`, cost
ceiling and rate limits; `transit-multi` capped.
Depends on: 1; Routes API (incl. WALK) confirmed on the production key. Verify: matrix build stays under the ceiling
for one market; proximity term omitted (not zero) with no anchor; no call made per page view.
**HARD STOP.**

**Phase 3 — The Slip surface.**
Ships: REQ gap slots and ranked suggestions on `/plans/:tripId` (`slip_gaps`, `slip_suggestions` slot configs); Slip map
anchor marker, travel-time labels, suggestion layer, set-anchor action; role chips show covered/missing.
Depends on: 1, 2. Verify: Playwright on the slip for three templates (travel, wedding, date_night); the slip-rail-actions
gate stays green; Card map unchanged.
**HARD STOP.**

**Phase 4 — Trend term.**
Ships: trend term from `trend_scores` with corroboration, minimum-n (schema field), entity-age guard, score history,
cap; retire the Grok-era `travel_pulse_trending` read in `recommendation.service.ts` and the static `pulseScore` gate.
Depends on: 1; ToS retention check done. Verify: a synthetic creation burst from one source family produces a zero trend
term; weights per template respected.
**HARD STOP.**

**Phase 5 — Platform boost + disclosure.**
Ships: the §C option chosen in §G-4, the "Traveloure pick" label + why-line, boost logged per impression, CI contract;
`FEATURED_BOOST` folded in.
Depends on: 1. Verify: contract test (no native outranks by more than ε/cap); label present iff boost applied.
**HARD STOP.**

**Phase 6 — Marketplace convergence.**
Ships: Discover organic feed, `/services` default sort, curated section, `/api/experts` default order and the optimizer's
catalog recall move onto the engine (each its own lane, one at a time); `recommendation.service.ts` retired.
Depends on: 1, 5. Verify: per surface, before/after ordering diff reviewed; each old ranker deleted, not left beside.
**HARD STOP.**

**Phase 7 (later) — Outcome loop.** Weight tuning from clean impression/outcome data; admin-editable profiles if §G-1
chooses config. Not scheduled.

---

## G. Open questions (only those that change the design)

1. **Per-template weight profiles — admin-editable config or hardcoded?**
   *Proposed default:* **hardcoded, versioned code module** until outcome data exists (phase 7). Every impression logs
   the profile version, so a later move to a config table (the `template_category_matrix` pattern, with a change log)
   is a data migration, not a redesign. Admin-editable now would invite tuning without evidence.

2. **One authority for "what this occasion needs": the matrix or `roles_needed`?**
   *Proposed default:* **the matrix** (it already has REQ/REC/OPT and feeds the engine); `roles_needed` becomes its
   REQ/REC projection for the role chips, and the template-key mapping module (phase 0) joins the two vocabularies.
   The alternative — keep both — guarantees drift.

3. **Where does a user-set anchor live?**
   *Proposed default:* resolve the anchor **at read time** from existing data (booked stay, event location, temporal
   anchor location), and add **one nullable column pair on `trips`** only for an explicit user pin (additive, no CHECK,
   declared in `shared/schema.ts`). A full `trip_anchors` child table (per-stay anchors for multi-city plans) is the
   alternative if multi-stop plans need an anchor per stop — that is the case the default does not cover.

4. **Platform boost: tiebreaker or capped term, and is revenue allowed on the Slip?**
   *Proposed default:* **tiebreaker, ε = 0.03**, disclosed; **revenue weight 0 on the Slip**, unchanged on marketplace
   slots. The capped term is a stronger lift that trades up to `cap` of fit on every list.

5. **Travel-time provider and budget.**
   *Proposed default:* **Google Routes (already integrated) for a precomputed neighborhood matrix**, WALK + TRANSIT for
   transit markets (Kyoto) and DRIVE only where market config says so, with a per-market monthly ceiling logged to
   `api_usage_logs`. The alternative (self-hosted OSRM/GTFS) removes per-call cost but adds infrastructure and still
   needs transit data per market.

---

*End of brief. HARD STOP — no implementation until ratified.*
