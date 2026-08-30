# Traveloure — TravelPulse Trend Engine Lane Brief (v1.0)

**Status:** Dispatch-ready. One lane, one branch (`lane/trend-engine`), one agent.
**Depends on:** Neighborhood Spine (`neighborhoods`, `provider_neighborhood_coverage`, `expert_neighborhoods` must exist and be seeded for Kyoto before Phase 2 of this lane). Demand-side catalog brief (`service_demand_requests` is a consumer of this lane's output, not a dependency).
**Related open decision:** Amadeus replacement (July 2026 deadline, decision pending). Any flight-demand signal source is **explicitly out of scope for v1** until that decision lands. Do not wire Amadeus anything.

---

## LOCKED DECISIONS (agents may not relitigate)

| # | Decision | Ruling |
|---|---|---|
| L1 | Entity granularity v1 | `market`, `neighborhood`, `gem`, `place_type`, `offering_type`. Neighborhood resolution via centroid + radiusKm (per Neighborhood Spine §1 — polygons are a later upgrade, not this lane). |
| L2 | Baseline | 90-day trailing baseline per entity per metric. Source-specific decay half-lives (config table, not literals). |
| L3 | Seasonality | Per-market season calendars as **static seeded data** (`market_season_calendars`), aligned to each location's actual seasons — not months, not hemispheres. Seasonal-expected multiplier applied in the scorer from day one. Weather-anomaly adjustment is v1.1 (column stubbed, logic deferred). |
| L4 | Visibility | Trend scores are **admin-only in v1**. No traveler- or partner-facing surface ships in this lane. Dark run against Kyoto for one full cycle; exposure is a separate follow-up lane gated on validation. |
| L5 | Cost | Every external source call routes through the existing External API Cost Tracking. Per-source monthly cost ceiling stored in config; ingestion for a source halts (and alerts) at ceiling. No untracked API spend. |
| L6 | Single resolver | `trend-score.service.ts` is the only place trend math lives. No trend weights, half-lives, thresholds, or season multipliers as literals anywhere else. Same discipline as `fee_bands`. Grep-gated every phase. |
| L7 | Resale provenance | `resale_class` (`first_party` \| `licensed_no_resale` \| `open_license`) is NOT NULL on `trend_signals` from row one. No default that silently misclassifies: each ingestion adapter declares its class explicitly. |
| L8 | Feedback hygiene | Internal engagement signals carry `surface_origin`. Signals originating from the trend surface itself are excluded from score computation in v1 (down-weighting is a v2 refinement). A control holdout is designed in, not bolted on. |
| L9 | Confidence floor | Score output includes a confidence value. Below floor → entity does not surface anywhere, including admin "trending" lists (it appears only in the raw-data view). Empty is better than wrong. |
| L10 | TikTok / Instagram | First-party consented business-account data only (provider-connected accounts via existing Instagram Business integration; TikTok Display API when provider connects). **No scraping, no unofficial endpoints, no pytrends-style ToS-gray access to any platform in production code.** |

---

## WHAT NOT TO DO

- **Do not** build a per-source scorer or per-source tables. One `trend_signals` table, one resolver. External and internal signals share the same shape.
- **Do not** hardcode any weight, half-life, threshold, ceiling, or season multiplier. All live in config tables (admin-editable, no deploy).
- **Do not** wire Amadeus, or any flight-demand source. Blocked on the replacement decision.
- **Do not** ship any traveler-facing UI. Admin console only (L4).
- **Do not** cache or store Google Places / Google Trends / Similarweb data beyond each source's ToS-permitted window, and never mark any of it as resellable. When in doubt: `licensed_no_resale`.
- **Do not** let trend-surface engagement feed back into the score (L8).
- **Do not** create a parallel entity-ID system. Gems, neighborhoods, markets use their existing PKs; external resolution keys (`wikidata_qid`, `google_place_id`) are columns on the resolution table, not new identity.
- **Do not** invent backfill. If a source has no history, the baseline starts thin and confidence reflects it. Null is honest.
- **Do not** write to production. Dev DB ("helium") only. Test seeds never touch prod (standing rule).
- **Do not** absorb the exposure lane, the resale/aggregation lane, or the weather-anomaly logic into this lane. FOLLOWUPS.md.

---

## PHASE 0 — READ-ONLY AUDIT. **HARD STOP AFTER. NO WRITES OF ANY KIND UNTIL LEON APPROVES FINDINGS.**

Produce `TREND_ENGINE_PHASE0_FINDINGS.md` (`audited@<main-sha>`), answering with file:line evidence:

0.1 **TravelPulse today.** What does `GET /api/travelpulse/cities` actually return, from where? Static seed, cached external call, or live? Table(s) behind it, row counts. The architecture doc claims "trending destinations / crowd predictions" — verify what's real vs aspirational.
0.2 **Neighborhood spine state.** Do `neighborhoods` rows exist for Kyoto with centroids + radii populated? Row count, null-rate on `centroidLat/Lng/radiusKm`. If centroids are null, Phase 2 geo-resolution is blocked — flag as prerequisite gap.
0.3 **Gem geo-quality.** What fraction of gems have usable lat/lng? What fraction resolve to a neighborhood under centroid+radius? Report the orphan rate.
0.4 **Internal signal availability.** Where do site-search queries, gem views, slip-adds, saves, and bookings currently get logged, if anywhere? Table names, retention, whether a query string is captured verbatim. If site search is not logged, that is a Phase 3 build item — size it.
0.5 **Existing external integration surface.** Confirm which of Google Places, Similarweb, Eventbrite, Viator/GYG/Klook catalog access, Instagram Business are live with credentials in the environment, and where the External API Cost Tracking hooks are. File:line for the cost-tracking entry point this lane must call.
0.6 **Entity resolution collisions.** Any existing place-dedup or external-ID columns on gems (place_id? wikidata?). Don't assume absence — grep.
0.7 **Schema/DB default drift check** on any table this lane touches (standing rule: verify via `information_schema`, ORM and DB defaults can silently disagree).

**HARD STOP. Await approval.**

---

## PHASE 1 — Schema + config (no ingestion yet)

New tables (push-canonical, `shared/schema.ts`):

```
trend_entities            -- resolution layer
  id, entity_type ('market'|'neighborhood'|'gem'|'place_type'|'offering_type'),
  internal_id,            -- FK into the existing table for that type
  wikidata_qid (nullable), google_place_id (nullable),
  wikipedia_title (nullable),  -- for pageviews API
  UNIQUE(entity_type, internal_id)

trend_signals             -- append-only. Never UPDATE, never DELETE.
  id, trend_entity_id, source, metric, value numeric,
  observed_at, ingested_at default now(),
  resale_class NOT NULL,           -- L7, no default
  surface_origin (nullable),       -- L8, internal signals only
  raw_ref (nullable jsonb)         -- source payload pointer, ToS-permitting

trend_source_config       -- admin-editable, no deploy
  source PK, enabled bool, decay_half_life_days numeric,
  weight numeric, monthly_cost_ceiling numeric,
  resale_class NOT NULL,           -- declared per source, adapters read it
  notes

market_season_calendars   -- static seed per L3
  id, market_key, season_key, display_name,
  start_month_day, end_month_day,        -- 'MM-DD', wraps year-end
  expected_demand_multiplier numeric,
  weather_anomaly_adjust numeric nullable  -- STUB, v1.1, no logic reads it

trend_scores              -- materialized output, rewritten per scoring run
  trend_entity_id, score numeric, confidence numeric,
  contributing_sources jsonb, why_text text,
  seasonal_expected numeric, computed_at, scoring_run_id
```

Season calendar seed content (Leon-reviewed before insert): Kyoto (sakura / tsuyu / summer / momiji / winter), Goa & Mumbai (monsoon / post-monsoon / dry), Jaipur (summer / monsoon / winter-peak), Edinburgh (festival-August as its own season / summer / winter), Porto (high / shoulder / low), Bogotá (near-flat, two mild rainy periods), Cartagena (dry-peak / rainy).

**Gates:** `tsc` green delta vs main; grep for trend literals outside the resolver/config → none; `information_schema` check on all new columns' defaults; season seed row counts per market match the reviewed list; second insert into `trend_entities` with same (entity_type, internal_id) fails. Commit.

---

## PHASE 2 — Entity resolution + Tier-0 ingestion (open/free sources only)

2.1 Resolution pass: populate `trend_entities` for all 8 markets, Kyoto neighborhoods, Kyoto gems. Match gems → wikidata/wikipedia where confidently possible (name + geo distance); leave null otherwise (never fuzzy-force — orphan rate from 0.3 is the honest denominator).
2.2 Ingestion adapters, one file per source under `server/trend-sources/`, each declaring its `resale_class` from config:
- **Wikimedia Pageviews** (open_license) — daily views for resolved entities.
- **GDELT** (open_license) — geo-filtered event counts per market; tag theme so it doubles as a risk signal later.
- **Nager.Date public holidays** (open_license) — per origin market (US, UK, JP, IN, DE, AU as v1 origin set) → calendar-pressure signal on destinations.
- **Open-Meteo** (open_license) — daily anomaly-vs-climate-normal per market centroid. Stored as a signal; scorer ignores it in v1 (L3).
2.3 Scheduler: daily batch, idempotent (re-run same day = no duplicate `observed_at` rows per source/entity/metric), each adapter individually failable without killing the run.

**Gates:** cost-tracking entries exist for every external call (behavioral proof: DB read showing tracked calls after a run); re-run idempotency test; a Kyoto gem with a Wikipedia page shows real pageview rows (screenshot + DB read); no adapter writes `resale_class` other than its config-declared value (test). Commit.

---

## PHASE 3 — Internal signals

3.1 Site-search capture (build if Phase 0 found it missing): query text, market context, result count, zero-result flag → `trend_signals` (source `internal_search`, `first_party`). Zero-result queries additionally increment a demand-gap metric.
3.2 Engagement events: gem view, save, slip-add (`in_planning` transition), booking → signals with `surface_origin` from the emitting surface. **Existing event paths are extended, not forked** — single-canonical-component rule.
3.3 `service_demand_requests` rows (where the demand-side lane has shipped them) ingest as demand-gap signals.

**Gates:** a search performed in dev produces a signal row (behavioral proof); a slip-add produces a signal with correct `surface_origin`; zero-result search visibly increments demand-gap; PII check — no traveler identifier beyond an opaque hashed session key lands in `trend_signals` (grep + row inspection). Commit.

---## PHASE 4 — Scorer

4.1 `trend-score.service.ts`: per entity/metric — 90-day trailing baseline → deviation → source-weighted, decay-adjusted composite → divided by seasonal-expected (from `market_season_calendars`, inherited by the entity's market) → score + confidence (function of source count, signal density, baseline depth).
4.2 Exclude `surface_origin`-tagged trend-surface signals (L8; none exist yet in v1, but the exclusion is coded and tested now, not later).
4.3 Confidence floor from config (L9).
4.4 `why_text` names top contributing sources in plain language ("Wikipedia views 3.1× baseline; 2 zero-result searches for 'gion tea ceremony'").
4.5 Nightly scoring run writing `trend_scores`, `scoring_run_id` for reproducibility.

**Gates:** unit tests — flat input scores ~0; synthetic spike scores high; identical spike during high-season window scores materially lower than off-season (the seasonal test is the gate that matters); thin-source entity lands below confidence floor; surface-origin exclusion test. Grep gate for literals. Commit.

---

## PHASE 5 — Admin surface (dark run)

One admin console view: trending list per market/neighborhood/gem with score, confidence, why-text, contributing sources, sparkline; below-floor entities visible only in a raw-data tab clearly marked; source-health panel (last run, rows ingested, cost vs ceiling per source); config editors for `trend_source_config` and season calendars (edit → next run reflects it, no deploy).

**Gates:** below-floor entity absent from trending list (behavioral proof); config edit changes next run's output without deploy; screenshot set of the Kyoto dark-run view. Commit. **Human read required before merge** (external-spend-adjacent).

---

## VALIDATION (defines "dark run passed" — gate for the exposure follow-up lane)

Two weeks minimum on Kyoto: (a) scores stable run-to-run absent input change; (b) at least one known-true event (real festival, viral spot, closure) detected with sane why-text; (c) no high-confidence score Leon can't explain from contributing sources; (d) cost within ceilings. Leon signs off in DECISIONS.md → unlocks exposure lane.

---

## FOLLOWUPS.md (explicitly deferred, never absorbed)

1. **Exposure lane** — traveler-facing trending + Grow-station provider nudges + supply-matched surfacing rule (trend surfaces with bookable match or as recruitment signal, mirroring demand-side brief).
2. **Weather-anomaly adjustment** (v1.1) — logic behind the stubbed column.
3. **Resale/aggregation lane** — k-anonymity aggregation views over `first_party` signals only; blocked on counsel adding data-resale language to traveler ToS + provider agreements (park with 10DLC item). Demand-gap reports, booking lead-time curves, trend→outcome validation exports.
4. **Neighborhood polygons** — upgrade centroid+radius when spine adds geometries.
5. **Travelpayouts hotel-price + popular-destinations signals** — unblocks when the Amadeus-replacement decision lands.
6. **TikTok Display API adapter** — when provider onboarding adds account connection.
7. **Origin-market school-vacation calendar table.**
8. **Down-weighting (vs excluding) trend-surface feedback + formal control-holdout experiment design** (v2).
