# TREND_ENGINE_PHASE0_FINDINGS.md

`audited@11dabbcb5b9c79c7d4c6408678f3356733e8c815` — Aug 16, 2026. Read-only audit per TravelPulse Trend Engine Lane Brief v1.0. **No writes performed.** All row counts are dev DB ("helium") unless marked prod.

---

## 0.1 TravelPulse today

**Verdict: real, live DB reads — not static, not aspirational — but the *data inside* is AI-generated (Grok), not measured.**

- Endpoint: `GET /api/travelpulse/cities` → `server/routes/content.routes.ts:4885-4894`. Parses `?limit=` (default 20), returns `{ cities, count }`.
- Backing read: `travelPulseService.getTrendingCities` → `server/services/travelpulse.service.ts:570-590`. Live Drizzle select from `travel_pulse_cities`, ordered by `pulseScore` DESC, deduped in memory by lowercased `cityName|country` (dedupe added by merged task #1487).
- Table: `travel_pulse_cities` (baseline DDL `server/migrations/000_baseline_schema.sql:3392-3435`). **Row counts: dev 25, prod 23 (prod last refreshed 2026-07-21 — stale until republish).** Supporting: `travel_pulse_hidden_gems` 710 rows, `destination_metrics_history` 6,711 rows.
- Data provenance: initial rows from bundled JSON seed (`server/seed-travelpulse.ts:12-17`, `seedTravelPulseData()` at `:111`, city insert `:222-245`; invoked at boot `server/index.ts:331-338`). Ongoing refresh is `updateCityWithAI` (`travelpulse.service.ts:1352+`) calling Grok (`grokService.generateCityIntelligence`), scheduled daily via `refreshStaleAICities` (`:1627-1656`, batches of 10, 24h staleness). As of Aug 16 the refresh also injects observed proxy signals (platform trips, trend history, SerpAPI Google Trends) via `gatherProxySignals` — see caveat in §Notes.
- "Crowd predictions" per architecture doc: `crowd_level` is a Grok-estimated enum, not a computed prediction. `activeTravelers` was hardcoded seed constants until Aug 16; now a bounded Grok estimate. **No measured trend math exists anywhere today** — this lane would be the first.

## 0.2 Neighborhood spine state

**Verdict: spine EXISTS and Kyoto is fully populated. One naming gap vs the brief.**

- ⚠️ **There is no `neighborhoods` table.** The spine's canonical table is **`city_neighborhoods`** (`shared/schema.ts:3422-3448`, Drizzle symbol `cityNeighborhoods`; physical DDL `000_baseline_schema.sql:612-627`). Migration `041_phase3_neighborhood_spine_scaffold.sql:3-6` explicitly rules out creating a parallel `neighborhoods` table. The brief's Phase 1/2 references to `neighborhoods` must read `city_neighborhoods`.
- `expert_neighborhoods`: exists (`shared/schema.ts:3479-3496`; DDL `041_...sql:24-33`; unique `(expert_id, neighborhood_id)` + partial unique lead index). 27 rows.
- `provider_neighborhood_coverage`: exists (`shared/schema.ts:3503-3515`; DDL `041_...sql:49-59`; unique `(provider_id, neighborhood_id, category_key)`). 1 row.
- **Kyoto: 10 neighborhoods, 0 null centroids, 0 null radii** (columns `centroid_lat`/`centroid_lng` decimal(10,7) NOT NULL, `radius_km` decimal(5,2) default 1.50). 238 neighborhoods total across all cities. **Phase 2 geo-resolution is NOT blocked.**

## 0.3 Gem geo-quality

**Verdict: global geo coverage is poor; Kyoto (the dark-run market) is excellent.**

- `travel_pulse_hidden_gems`: 710 rows total; **576 (81%) have null lat/lng**. 149 have a free-text `neighborhood` varchar (soft reference, `shared/schema.ts:3403-3405`); no FK to the spine.
- Kyoto: **16 gems with coordinates; 15 of 16 (94%) resolve to a Kyoto neighborhood under centroid+radius Haversine** (orphan rate 6%). This is consistent with the Phase-1b backfill having been proximity-based.
- Honest denominator for confidence math: for non-Kyoto markets, the 81% null-coordinate rate means gem-level entities will mostly start below the confidence floor. That is expected per L9/"null is honest".

## 0.4 Internal signal availability

**Verdict: tables exist, but the write paths the brief needs largely do NOT. Phase 3.1 is a build item; parts of 3.2 are too.**

- **Site search: NOT captured.** `search_analytics` exists with verbatim `query` text (`shared/schema.ts:6171-6193`) and a generic writer (`server/services/content-query.service.ts:805-808`) — but **no route ever calls it (0 rows)**. `destination_search_patterns` (`shared/schema.ts:5887-5903`, writer `server/storage.ts:6414-6416`) has 207 rows but no confirmed live route call site. → **Phase 3.1 must build capture end-to-end; size: small-medium** (one middleware/hook on the search endpoint(s) + zero-result flag; schema already adequate).
- **Gem views: NOT captured.** No view-event write path exists; `travel_pulse_hidden_gems` is a content table, `travel_pulse_live_activity` is seeded content (`server/seed-travelpulse.ts:145`), not an event log. → build item.
- **Saves: state, not events.** `saved_items` (`shared/schema.ts:7719-7730`; writes `server/routes/saved-items.routes.ts:31-64`) stores current saved state with unique `(user_id, content_type, content_id)` — no append-only history. 4 rows. Emitting a signal on save is a small extension of that route (single-canonical-component rule holds: one write path).
- **Slip-adds: rows exist, no event stream.** `itinerary_items` (`shared/schema.ts:3959-3988`) — 543 rows — written from *multiple* paths: `server/routes.ts:9939-9955`, `server/routes/content.routes.ts:4497`, `server/storage.ts:6626/:7038/:7469`, `server/services/itinerary-intelligence.service.ts:144`, `server/services/ready-made-purchase.service.ts:100`. ⚠️ **Signal emission must go in a shared storage helper, not per-route, or paths will diverge** (same lesson as message write-path convergence).
- **Bookings:** canonical create is `db.insert(serviceBookings)` at `server/storage.ts:2717-2719` (89 rows); legacy `bookings` rail still live (`shared/schema.ts:6500-6583`). Both must emit or the signal undercounts.
- Retention: no TTL/cleanup jobs found on any of these tables.
- PII note for the Phase 3 gate: `search_analytics` and `destination_search_patterns` both have user-id columns in schema — the brief's opaque-hashed-session-key rule will need explicit handling at capture time.

## 0.5 External integration surface

**Live with credentials in env:**
- Google Places / Maps: `server/utils/geocode.ts:13` (`GOOGLE_MAPS_API_KEY`); consumers `google-places-photos.service.ts:51`, `routes.service.ts:206`, `content.routes.ts:5895`.
- Viator: `server/services/viator.service.ts:3` (`VIATOR_API_KEY`); also `viator-commissions.service.ts:100`, `affiliate-reconciliation.service.ts:134`.
- GetYourGuide + Klook: via shared Travelpayouts token, `server/services/travelpayouts/travelpayouts-client.ts:6-8` (`TRAVELPAYOUTS_TOKEN`); routes `server/routes.ts:3777-3843`.
- Instagram Business: `server/routes/instagram.ts:84-85` (`INSTAGRAM_APP_ID/SECRET`); Meta-linked auth `server/replit_integrations/auth/facebookAuth.ts:175-176`.
- Also available though not in the brief's list: SerpAPI (`SERP_API_KEY`, used in `serp.service.ts:105`, `venue-search.service.ts:48`, and since Aug 16 in `travelpulse.service.ts` gatherProxySignals).

**NOT present:** Similarweb — no code, no credential. Eventbrite — no code, no credential. (Amadeus: fully decommissioned Aug 2026 per ledger ruling 34; brief already excludes it.)

**Cost-tracking entry point (L5):** `apiUsageService.logApiCall(params)` — `server/services/api-usage.service.ts:62` (row insert `:64-77`; singleton export `:253`; table `api_usage_logs`, `shared/schema.ts:5502-5518`). ⚠️ **Adoption reality: only the dead Amadeus wrapper (`logApiCall` via `logAmadeusCall` `:83-112`) ever called it — no live caller today.** The separate `reportProviderResult` (`provider-health.service.ts:61/:92`) is health-status, not cost. This lane's adapters would be the first real users of `logApiCall`; the brief's per-source monthly ceiling + halt-at-ceiling logic does **not** exist yet and belongs in `trend_source_config` + adapter guard.

## 0.6 Entity-resolution collisions

- `travel_pulse_hidden_gems` has **no** `google_place_id`, `place_id`, `wikidata`, or `external_id` column (`shared/schema.ts:3367-3415`) — clean slate for the `trend_entities` resolution layer.
- Existing external-ID columns elsewhere (must NOT be conflated): `googlePlaceId` on city media cache (`shared/schema.ts:3670`) and on `itinerary_items` (`:3981`); `externalId` at `:2876/:4270/:4706/:7795`; `placeId` at `:308`. None constitute a competing identity system; brief's rule (resolution keys live on `trend_entities` only) is satisfiable without collision.

## 0.7 Schema/DB default drift

Checked `information_schema.columns` for all spine + gems tables (this lane's touched surface; new tables don't exist yet):
- `city_neighborhoods`: DB defaults match ORM (`id gen_random_uuid()::text`, `radius_km 1.50`, `is_featured false`, `lead_expert_target 1`, timestamps `now()`). No drift.
- `expert_neighborhoods` / `provider_neighborhood_coverage`: `gen_random_uuid()`, `false`/`0` defaults, NOT NULL timestamps — match migration 041. No drift.
- `travel_pulse_hidden_gems`: ⚠️ `id` has **no DB default** (NOT NULL, application-supplied — same class of trap as the audit-table id bug fixed earlier); other defaults (`tourist_mentions 0`, `discovery_status 'hidden'`, `best_for '[]'::jsonb`, `ai_generated false`) present. Any Phase-1 table must set DB-side id defaults explicitly (standing rule).

---

## Prerequisite gaps & flags for Leon

1. **Brief naming fix:** spine table is `city_neighborhoods`, not `neighborhoods`. `trend_entities.internal_id` for `entity_type='neighborhood'` should FK to `city_neighborhoods.id`.
2. **Cost tracking exists but is unused** — ceiling/halt logic is net-new work inside this lane (Phase 1 `trend_source_config` + adapter guard), not a hookup.
3. **Phase 3.1 (site search) is a full build**, not an extension — no live capture today despite tables existing.
4. **Slip-add signal must be emitted from shared storage code** — 6+ insert paths exist for `itinerary_items`.
5. **Two booking rails** (`service_bookings` canonical + legacy `bookings`) both need signal emission.
6. **Similarweb & Eventbrite are greenfield** (no credentials); Tier-0 (Phase 2) is unaffected since its four sources are keyless/open.
7. **Overlap to reconcile:** since Aug 16 the TravelPulse card refresh feeds SerpAPI Google Trends + platform-trip counts directly into Grok prompts (`gatherProxySignals`). Different surface than this lane's scorer, but it is un-cost-tracked external spend (L5 spirit) and stores nothing (ToS-safe). Recommend: when this lane lands, migrate that call into a trend-source adapter or register it with `logApiCall`.
8. Kyoto dark-run preconditions are otherwise green: neighborhoods seeded (10/10 with centroids+radii), gem resolution 94%, durable Kyoto expert fixture exists in dev.

---

## Phase 0 → Phase 1 gate answers (2026-08-16)

**Leon's conditional approval received. Three outstanding items answered below. Phase 1 writes may begin.**

### R4 hotfix — SHIPPED (pre-approved, pre-lane)
The feedback loop was live: `gatherProxySignals` read the last 7 `trend_score` rows from `destinationMetricsHistory` (`travelpulse.service.ts:1299–1313`) and passed them as `recentTrendScores` to Grok, and read the previous `activeTravelers` (`travelpulse.service.ts:1315–1325`) for self-anchored smoothing. Both violate R4/L8. Also removed SerpAPI block (R5 ruling: dropped). Applied in commit at HEAD:
- `server/services/travelpulse.service.ts` — removed all three blocks from `gatherProxySignals`; updated JSDoc comment
- `server/services/grok.service.ts` — removed `recentTrendScores`, `previousActiveTravelers`, `searchInterest` from `CityProxySignals` interface + `formatProxySignals`
First-party trip counts (`platformTravelersNow`, `platformUpcomingTrips30d`) kept per R1.

### Republish render map
`activeTravelers` absolute count reaches **four traveler-facing surfaces** — republish is blocked by R3 until all four are suppressed:
1. `client/src/components/travelpulse/CityCard.tsx:142` — count on every city card
2. `client/src/components/travelpulse/CityGrid.tsx:377` — summed worldwide total in section header ("Real-time intelligence from X travelers worldwide")
3. `client/src/components/travelpulse/CityDetailView.tsx:880` — count in city detail (`data-testid="value-active-travelers"`)
4. `client/src/components/TrendingCities.tsx:74` — summed count in trending panel header
`crowdLevel` as a band label (string, e.g. "moderate") renders at additional components but is not an absolute count; per Leon's ruling it is not R3-blocked. Traveler exposure of `crowdLevel` is Leon's call per L4 — suppression of the four count surfaces above is the republish lever.

### 25-vs-8 city scope
**Confirmed: the 17 extra rows are non-operating markets.** The 8 operating markets matching the Phase 1 season calendar seed are: Kyoto, Goa, Mumbai, Jaipur, Edinburgh, Porto, Bogotá, Cartagena. The remaining 17 dev rows (Paris, Tokyo, Singapore, Prague, Dubai, New York, Bali, Cape Town, Lisbon, Barcelona, Bangkok, London, Rome, Marrakech, Los Angeles, Sydney, San Jose, Costa Rica) are not in the operating set. Scope drop to 8 is a Phase 2.3 config item in the same PR that removes the Grok scoring call — no separate lane.
