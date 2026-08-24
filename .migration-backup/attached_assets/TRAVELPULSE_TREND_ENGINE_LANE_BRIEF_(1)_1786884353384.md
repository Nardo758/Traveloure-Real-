# Traveloure — TravelPulse Trend + Crowd Engine Lane Brief (v1.1)

**Status:** Dispatch-ready. One lane, one branch (`lane/trend-engine`), one agent.
**v1.1 delta:** (a) Crowd Index added as a co-output of the same pipeline; (b) BestTime.app added as Tier-1 anchor source, PredictHQ as the sanctioned Tier-3 exception; (c) Reconciliation ruling R1–R6 for the existing Grok daily-city-refresh pipeline — this lane **absorbs and re-plumbs** that pipeline, it does not run beside it; (d) L4 visibility split: trend score stays admin-only, crowd index has a separate, source-gated path to traveler exposure.
**Depends on:** Neighborhood Spine (`neighborhoods`, `provider_neighborhood_coverage`, `expert_neighborhoods` seeded for Kyoto before Phase 2). Demand-side catalog brief (`service_demand_requests` is a consumer of this lane's output, not a dependency).
**Related open decision:** Amadeus replacement (deadline passed July 2026, decision pending). Any flight-demand signal source remains **out of scope** until it lands. Do not wire Amadeus anything.

---

## RECONCILIATION RULING — existing Grok daily city refresh (R1–R6, binding)

The repo already contains a Grok-in-the-loop TravelPulse refresh: per-city gathering of on-platform trips (word-boundary city matching, timezone-aware dates), 7-day trend-score history, previous traveler estimate, Google Trends via SERP API — passed to Grok, which returns pulse score, trending score, crowd level, and a traveler-count estimate (bounded integer, ≤5M).

| # | Ruling |
|---|---|
| R1 | **The signal-gathering plumbing is kept.** City-matched trip counts, the daily scheduler, per-source failure isolation are real Phase-3 work already done. It is repointed to write `trend_signals` rows (`first_party`). |
| R2 | **Grok is removed from the scoring path.** All scores (pulse, trending, crowd) come from the deterministic resolver only. LLMs may generate `why_text` prose from the resolver's structured output — narration, never math. |
| R3 | **The absolute traveler-count estimate is killed.** It is self-anchored fabrication (each estimate's dominant input is the previous estimate). It must not survive to any traveler-facing surface at republish. It may persist only as an admin-tab illustration explicitly labeled *model illustration — not a measurement*, and nothing downstream may consume it. |
| R4 | **The trend-history feedback input is severed immediately** — pre-lane hotfix, do not wait for Phase 4. A score's own prior values are never a scoring input (L8 by construction). |
| R5 | **SERP/Google Trends adapter:** either moves behind External API Cost Tracking with `resale_class = licensed_no_resale` and *loud* failure (source-health visible, never silent-skip), or is dropped in favor of Wikimedia Pageviews. Agent proposes in Phase 0 findings; Leon decides. |
| R6 | **Guardrail code (bounds validation, city matching, tz handling) migrates** into the new ingestion adapters rather than being reimplemented. |

---

## LOCKED DECISIONS (agents may not relitigate)

| # | Decision | Ruling |
|---|---|---|
| L1 | Entity granularity v1 | `market`, `neighborhood`, `gem`, `place_type`, `offering_type`. Neighborhood resolution via centroid + radiusKm (per Neighborhood Spine §1 — polygons are a later upgrade, not this lane). |
| L2 | Baseline | 90-day trailing baseline per entity per metric. Source-specific decay half-lives (config table, not literals). |
| L3 | Seasonality | Per-market season calendars as **static seeded data** (`market_season_calendars`), aligned to each location's actual seasons — not months, not hemispheres. Seasonal-expected multiplier applied in the scorer from day one. Weather-anomaly adjustment is deferred (column stubbed, logic later). |
| L4 | Visibility — split | **Trend score:** admin-only in v1; dark run against Kyoto; exposure is a follow-up lane gated on validation. **Crowd index:** admin-first, but eligible for traveler exposure in the follow-up lane as soon as its gate passes — the gate is *source-anchored accuracy* (BestTime coverage + spot-check), not the trend dark run, because its anchor input is externally validated rather than self-referential. |
| L5 | Cost | Every external source call routes through the existing External API Cost Tracking. Per-source monthly cost ceiling in config; ingestion halts (and alerts) at ceiling. No untracked spend. No silent skips (see R5). |
| L6 | Single resolver | `trend-score.service.ts` is the only place trend **and crowd** math lives. No weights, half-lives, thresholds, band cutoffs, or season multipliers as literals anywhere else. Same discipline as `fee_bands`. Grep-gated every phase. **No LLM call anywhere in the scoring path** (R2). |
| L7 | Resale provenance | `resale_class` (`first_party` \| `licensed_no_resale` \| `open_license`) NOT NULL on `trend_signals` from row one. No default; each adapter declares its class explicitly from config. |
| L8 | Feedback hygiene | Internal engagement signals carry `surface_origin`. Signals originating from trend/crowd surfaces are excluded from score computation in v1. A score's own history is never an input (R4). Control holdout designed in, not bolted on. |
| L9 | Confidence floor | Every score (trend and crowd) carries confidence. Below floor → entity does not surface anywhere, including admin lists (raw-data tab only). Empty is better than wrong. |
| L10 | Social platforms | First-party consented business-account data only (Instagram Business integration; TikTok Display API when a provider connects). No scraping, no unofficial endpoints in production code. |
| L11 | **Crowd is an index, never a count.** | Traveler-facing crowd output is a four-band relative index — `low` \| `moderate` \| `high` \| `peak` — per gem and neighborhood (market-level derived), with `crowd_why`. **No absolute headcount, footfall figure, or visitor estimate is ever rendered to travelers.** Band cutoffs are per-entity relative to that entity's own baseline, stored in config. |
| L12 | **Crowd anchor sources.** | BestTime.app (licensed venue foot-traffic forecasts + live busyness) is the anchor, mapped per-gem. PredictHQ predicted event attendance is the sanctioned Tier-3 exception, justified by this feature alone — event load is what turns a normal day into `peak`. Official visitor statistics (e.g. Kyoto city monthly) calibrate bands; lagged but true. Both external sources: `licensed_no_resale`, cost-ceilinged. |

---

## WHAT NOT TO DO

- **Do not** build a per-source scorer or per-source tables. One `trend_signals` table, one resolver, two outputs (trend, crowd).
- **Do not** hardcode any weight, half-life, threshold, band cutoff, ceiling, or season multiplier. Config tables, admin-editable, no deploy.
- **Do not** call any LLM in the scoring path. Grok/Claude are permitted only for `why_text` narration from structured resolver output (R2).
- **Do not** render, store for rendering, or pass downstream any absolute traveler/visitor count (L11, R3).
- **Do not** feed any score's own history back in as an input (R4).
- **Do not** wire Amadeus or any flight-demand source. Blocked on the replacement decision.
- **Do not** ship traveler-facing trend UI in this lane. Crowd exposure also lives in the follow-up lane — this lane builds admin-first for both (L4).
- **Do not** cache/store Google Places, Google Trends/SERP, Similarweb, BestTime, or PredictHQ data beyond each ToS window, and never mark any of it resellable. When in doubt: `licensed_no_resale`.
- **Do not** create a parallel entity-ID system. Existing PKs; external keys (`wikidata_qid`, `google_place_id`, `besttime_venue_id`) are columns on the resolution table.
- **Do not** invent backfill. Thin history = thin baseline = low confidence. Null is honest.
- **Do not** reimplement the Grok pipeline's guardrail/matching code — migrate it (R6). Do not leave the old Grok scoring call alive in parallel "just in case."
- **Do not** write to production. Dev DB ("helium") only. Test seeds never touch prod.
- **Do not** absorb the exposure lane, resale/aggregation lane, or weather-anomaly logic. FOLLOWUPS.md.

---

## PHASE 0 — READ-ONLY AUDIT. **HARD STOP AFTER. NO WRITES UNTIL LEON APPROVES FINDINGS.**

*(Exception: the R4 hotfix — severing the trend-history feedback input — is pre-approved and may ship as a one-line PR before or during Phase 0, human-read before merge.)*

Produce `TREND_ENGINE_PHASE0_FINDINGS.md` (`audited@<main-sha>`), file:line evidence throughout:

0.1 **Grok pipeline map (now the primary audit target).** Every file in the daily city refresh: signal gatherers, the Grok call site, the scheduler entry, guardrail/validation code, where pulse/trending/crowd/traveler-estimate are written, and — critically — **every surface that renders any of those numbers today** (the republish question: what would go traveler-visible). Inventory what R1/R6 keeps vs what R2/R3 removes.
0.2 **SERP/Google Trends adapter:** call path, key location, whether cost tracking touches it, failure behavior. Recommendation per R5.
0.3 **Neighborhood spine state.** Kyoto `neighborhoods` rows with centroids + radii populated? Null-rate. If null, Phase 2 geo-resolution is blocked — flag as prerequisite gap.
0.4 **Gem geo-quality.** Fraction of gems with usable lat/lng; fraction resolving to a neighborhood under centroid+radius; orphan rate. Additionally: how many Kyoto gems are venue-type entities plausibly matchable to BestTime venues (restaurants, temples, attractions) vs unmatchable (viewpoints, streets)?
0.5 **Internal signal availability.** Where site-search queries, gem views, slip-adds, saves, bookings are logged today. If site search isn't logged, size the Phase 3 build.
0.6 **Existing external integration surface.** Which of Google Places, Similarweb, Eventbrite, Viator/GYG/Klook catalogs, Instagram Business are live with credentials; the External API Cost Tracking entry point (file:line) this lane must call.
0.7 **Entity resolution collisions.** Existing place-dedup or external-ID columns on gems — grep, don't assume.
0.8 **Schema/DB default drift check** via `information_schema` on any table this lane touches (standing rule).

**HARD STOP. Await approval.**

---

## PHASE 1 — Schema + config (no ingestion yet)

New tables (push-canonical, `shared/schema.ts`):

```
trend_entities            -- resolution layer
  id, entity_type ('market'|'neighborhood'|'gem'|'place_type'|'offering_type'),
  internal_id,
  wikidata_qid (nullable), google_place_id (nullable),
  wikipedia_title (nullable),
  besttime_venue_id (nullable),        -- v1.1: crowd anchor mapping
  UNIQUE(entity_type, internal_id)

trend_signals             -- append-only. Never UPDATE, never DELETE.
  id, trend_entity_id, source, metric, value numeric,
  observed_at, ingested_at default now(),
  resale_class NOT NULL,
  surface_origin (nullable),
  raw_ref (nullable jsonb)

trend_source_config       -- admin-editable, no deploy
  source PK, enabled bool, decay_half_life_days numeric,
  weight numeric, monthly_cost_ceiling numeric,
  resale_class NOT NULL, notes

market_season_calendars   -- static seed per L3
  id, market_key, season_key, display_name,
  start_month_day, end_month_day,          -- 'MM-DD', wraps year-end
  expected_demand_multiplier numeric,
  weather_anomaly_adjust numeric nullable  -- STUB, no logic reads it

crowd_band_config         -- v1.1: per-entity-type band cutoffs, admin-editable
  entity_type, band ('low'|'moderate'|'high'|'peak'),
  lower_bound_vs_baseline numeric,         -- relative to entity's own baseline
  UNIQUE(entity_type, band)

trend_scores              -- materialized, rewritten per scoring run
  trend_entity_id,
  trend_score numeric, trend_confidence numeric,
  crowd_band text nullable, crowd_confidence numeric nullable,  -- v1.1 co-output
  contributing_sources jsonb, why_text text, crowd_why text nullable,
  seasonal_expected numeric, computed_at, scoring_run_id
```

Season calendar seed (Leon-reviewed before insert): Kyoto (sakura / tsuyu / summer / momiji / winter), Goa & Mumbai (monsoon / post-monsoon / dry), Jaipur (summer / monsoon / winter-peak), Edinburgh (festival-August as its own season / summer / winter), Porto (high / shoulder / low), Bogotá (near-flat, two mild rainy periods), Cartagena (dry-peak / rainy).

**Gates:** `tsc` green delta vs main; grep for trend/crowd literals outside resolver/config → none; `information_schema` defaults check; season seed row counts match reviewed list; duplicate `trend_entities` insert fails; `crowd_band_config` seeded with the four bands per entity type. Commit.

---

## PHASE 2 — Entity resolution + external ingestion

2.1 Resolution pass: `trend_entities` for all 8 markets, Kyoto neighborhoods, Kyoto gems. Wikidata/Wikipedia matching by name + geo distance, null when unconfident (never fuzzy-force). **BestTime venue matching for Kyoto gems** flagged matchable in 0.4 — match by name + coordinates, store `besttime_venue_id`, report match rate.
2.2 Ingestion adapters, one file per source under `server/trend-sources/`, each reading its `resale_class` from config:
- **Wikimedia Pageviews** (open_license) — daily views per resolved entity.
- **GDELT** (open_license) — geo-filtered event counts per market, themed.
- **Nager.Date holidays** (open_license) — origin set US/UK/JP/IN/DE/AU → calendar-pressure signal.
- **Open-Meteo** (open_license) — daily anomaly-vs-normal per market centroid; stored, scorer ignores in v1 (L3).
- **BestTime.app** (licensed_no_resale) — per-matched-gem busyness forecast + live where available. Anchor for crowd. Cost-ceilinged.
- **PredictHQ** (licensed_no_resale) — predicted event attendance per market/geo. Cost-ceilinged. Scope the minimum plan that covers the 8 markets before contracting; Leon signs the contract, not the agent.
- **SERP/Google Trends** — per R5 outcome from Phase 0 (behind cost tracking + loud failure, or dropped).
2.3 **Grok-pipeline migration (R1/R6):** repoint its trip-count gatherers to write `trend_signals` (`first_party`; metrics `trips_active_today`, `trips_upcoming_30d`), carrying over the word-boundary matching, tz handling, and bounds guardrails. Remove the Grok scoring call and the traveler-estimate write path (R2/R3) — grep gate: no Grok/LLM invocation reachable from the refresh scheduler.
2.4 Scheduler: daily batch, idempotent (same-day re-run = no duplicate rows per source/entity/metric), per-adapter failure isolation with **visible** source-health status (no silent skips).

**Gates:** cost-tracking rows exist for every external call after a run (DB read); idempotency re-run test; a BestTime-matched Kyoto gem shows real busyness rows (screenshot + DB read); Grok scoring call gone (grep + scheduler trace); adapters write only their config-declared `resale_class` (test). Commit. **Human read before merge** (external spend + removal of live pipeline behavior).

---

## PHASE 3 — Internal signals

3.1 Site-search capture (build if 0.5 found it missing): query text, market context, result count, zero-result flag → `trend_signals` (`internal_search`, `first_party`). Zero-result queries also increment a demand-gap metric.
3.2 Engagement events: gem view, save, slip-add (`in_planning` transition), booking → signals with `surface_origin` from the emitting surface. Extend existing event paths, never fork (single-canonical-component rule).
3.3 `service_demand_requests` rows (where shipped) ingest as demand-gap signals.

**Gates:** dev search produces a signal row (behavioral proof); slip-add carries correct `surface_origin`; zero-result search increments demand-gap; PII check — nothing beyond an opaque hashed session key in `trend_signals` (grep + row inspection). Commit.

---

## PHASE 4 — Resolver (trend + crowd, one service, two outputs)

4.1 **Trend:** per entity/metric — 90-day trailing baseline → deviation → source-weighted, decay-adjusted composite → divided by seasonal-expected → `trend_score` + `trend_confidence` (source count, density, baseline depth).
4.2 **Crowd:** per gem/neighborhood — composite of BestTime busyness (anchor), PredictHQ event load, holiday-pressure, season multiplier, own-platform same-day density → position vs the entity's own baseline → mapped through `crowd_band_config` → `crowd_band` + `crowd_confidence` + `crowd_why`. Neighborhood band aggregates member gems (coverage-weighted); market band derived from neighborhoods. Gems with no BestTime match and thin other sources fall below confidence floor and emit **no band** (L9) — never a guessed band.
4.3 Exclusions: `surface_origin`-tagged trend/crowd-surface signals excluded (L8); no score-history inputs exist by construction (R4) — add a regression test that fails if `trend_scores` is ever read by the resolver as input.
4.4 Confidence floors from config (L9). `why_text`/`crowd_why` name top contributors in plain language. (Optional, flag-gated: LLM prose-polish of why-text from structured output only — R2.)
4.5 Nightly scoring run → `trend_scores`, `scoring_run_id` for reproducibility; identical inputs must reproduce identical outputs (determinism test).

**Gates:** flat input ≈ 0 trend; synthetic spike scores high; identical spike in high season scores materially lower than off-season (the seasonal gate); thin entity below floor emits nothing; surface-origin exclusion test; **determinism test**; **no-LLM-in-path grep**; **no-score-history-input regression test**; band mapping honors config edit without deploy. Commit.

---

## PHASE 5 — Admin surface (dark run)

Admin console view: per market/neighborhood/gem — trend score, crowd band, confidences, why-texts, contributing sources, sparkline; raw-data tab for below-floor entities (clearly marked); the legacy traveler-estimate, if retained at all, lives here only, labeled *model illustration — not a measurement* (R3); source-health panel (last run, rows, cost vs ceiling, failure state per source); config editors for `trend_source_config`, season calendars, `crowd_band_config`.

**Gates:** below-floor entity absent from lists (behavioral proof); config edit changes next run without deploy; no traveler-facing route renders any of this yet (route audit); no absolute count renders anywhere outside the labeled admin tab (grep + screenshot); Kyoto dark-run screenshot set. Commit. **Human read before merge.**

---

## VALIDATION

**Trend (gates exposure follow-up):** ≥2 weeks on Kyoto — (a) run-to-run stability absent input change; (b) ≥1 known-true event detected with sane why-text; (c) no high-confidence score Leon can't explain from sources; (d) cost within ceilings. Sign-off in DECISIONS.md.

**Crowd (separate, source-anchored gate per L4):** (a) BestTime match rate over Kyoto gems ≥ a Leon-set threshold (proposed after 0.4's matchability count); (b) spot-check — expert or ground-truth comparison on ~10 gems across a week finds bands directionally right (no `low` during an observed peak); (c) `peak` fires on a known festival/holiday date via PredictHQ/holiday inputs. Passing this unlocks crowd-index traveler exposure in the follow-up lane **independently of** the trend dark run.

---

## FOLLOWUPS.md (deferred, never absorbed)

1. **Exposure lane** — traveler-facing crowd index (first, on its gate) + trending (after dark-run sign-off) + Grow-station provider nudges + supply-matched surfacing rule (trend/crowd surfaces with bookable match or as recruitment signal, mirroring demand-side brief).
2. **Weather-anomaly adjustment** — logic behind the stubbed column; also feeds crowd (rain suppresses outdoor-gem crowding).
3. **Resale/aggregation lane** — k-anonymity aggregation over `first_party` only; blocked on counsel's data-resale ToS/provider-agreement language (parked with 10DLC). Demand-gap reports, lead-time curves, trend→outcome validation exports.
4. **Neighborhood polygons** — upgrade centroid+radius when the spine adds geometries; improves crowd aggregation.
5. **Travelpayouts hotel-price + popular-destinations signals** — unblocks with the Amadeus-replacement decision.
6. **TikTok Display API adapter** — when provider onboarding adds account connection.
7. **Origin-market school-vacation calendar table.**
8. **Feedback down-weighting + formal control-holdout experiment** (v2).
9. **Intraday crowd refresh** — v1 crowd is daily (forecast-led); live BestTime polling for a hot subset of gems is a costed follow-up, not v1.
10. **LLM why-text narration** — productionize the flag-gated prose polish (R2-compliant) if the dark run shows admin value.
