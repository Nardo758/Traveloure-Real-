# DISPATCH — Trend + Crowd Engine, Phase 1 (schema + config)

**Lane:** `lane/trend-engine` · one agent, one branch, no direct-to-main
**Brief:** `TRAVELPULSE_TREND_ENGINE_LANE_BRIEF.md` v1.1 — read in full before any write
**Prereqs confirmed:** Phase 0 approved (`TREND_ENGINE_PHASE0_FINDINGS.md`, audited@11dabbcb). R4 hotfix shipped. R5 resolved (SerpAPI dropped). Lane `DECISIONS.md` active.

---

## LOCKED — do not relitigate

1. **FKs target `city_neighborhoods`** (existing table name). No rename of anything existing.
2. **crowdLevel ships interim (option b):** the existing Grok-produced band-string continues to render at republish as a placeholder, swapped when the resolver's crowd index passes its validation gate. Interim band renders as the band word only — no copy implying live/measured crowd data near it. **#1496 scope is now: suppress `activeTravelers` only**, on `CityCard.tsx:142`, `CityGrid.tsx:377`, `CityDetailView.tsx:880`, `TrendingCities.tsx:74`. #1496 blocks republish in the tracker — mark it blocking, not "related."
3. **X (Twitter) added as a Phase 2 ingestion source.** Official API only (X API v2 or xAI live-search endpoint — whichever credential exists; report which in the PR). Metrics: post/mention counts and velocity per market + resolvable gems. `resale_class = licensed_no_resale`. Cost-ceilinged like every source. **It writes `trend_signals` rows only — no LLM summarization or scoring of X content (R2 applies).** Phase 1 action: add `x_api` row to the `trend_source_config` seed; adapter itself is Phase 2.
4. Cost-tracking enforcement (ceiling + halt + alert) is in-lane, Phase 2 — currently zero live callers; treat as net-new build.
5. Slip-add signals emit from the shared storage choke point; all 6+ `itinerary_items` insert paths individually gate-tested (Phase 3).
6. Both booking rails (`service_bookings` + legacy `bookings`) emit, tagged by rail (Phase 3).
7. 8 operating markets only: kyoto, goa, mumbai, jaipur, edinburgh, porto, bogota, cartagena. The 17 extra `travel_pulse_cities` rows drop from refresh scope in Phase 2.3 (config, same PR as Grok-scoring removal).
8. FOLLOWUPS #11 recorded: gem geo-backfill lane (81% missing coords globally).

## PHASE 1 SCOPE — this dispatch only

Build exactly the Phase 1 schema + config from brief §Phase 1, with these amendments:
- `trend_entities.internal_id` FKs resolve against **`city_neighborhoods`** for entity_type `neighborhood`.
- `trend_entities` gains `x_handle_or_query text nullable` (X-source resolution key, same pattern as `besttime_venue_id`).
- `trend_source_config` seed rows: `wikimedia_pageviews`, `gdelt`, `nager_date`, `open_meteo` (open_license); `besttime`, `predicthq`, `x_api` (licensed_no_resale, enabled=false until Phase 2 credentials/contracts confirmed). **No `serpapi` row — dropped per R5.**
- `market_season_calendars` seeded from the Leon-reviewed list in brief §Phase 1 — exactly those 8 markets, those season sets. Do not invent additional seasons.
- `crowd_band_config` seeded with the four bands per entity type.
- Stub column `weather_anomaly_adjust` created, **no logic reads it**.

## WHAT NOT TO DO (Phase 1)

- No ingestion code, no adapters, no scheduler changes — Phase 2.
- No touching the live Grok refresh, TravelPulse routes, or any render surface except the four `activeTravelers` suppressions if #1496 is executed in this lane (it may also ship as its own small PR — either way, human read before merge).
- No trend/crowd/weight/threshold literals outside the new config tables and (future) resolver. Grep-gated.
- No writes to production. Dev DB only. push-canonical via drizzle-kit push; remember push does not alter existing column defaults — any default on an existing table needs explicit ALTER, verified via `information_schema`.
- No parallel agents from here forward — Phase 0's parallel explorers were read-only; writes are single-agent, single-branch.

## GATES (all must pass before commit; evidence = file:line + DB read + screenshot where applicable)

1. `tsc` — zero **new** errors vs main (254+ pre-existing on main; ratchet applies).
2. Grep: no trend/crowd literals outside `shared/schema.ts` seeds + config tables → clean.
3. Grep: no `serpapi` reference introduced; existing dead references (if any) flagged, not extended.
4. `information_schema` read: every new column's DB default matches the ORM default. Paste the query output.
5. Season seed: row counts per market match the brief list exactly; DB read pasted.
6. Duplicate insert into `trend_entities` (same entity_type, internal_id) fails — test output pasted.
7. `crowd_band_config`: 4 bands × entity types present — DB read pasted.
8. `trend_source_config`: 7 seed rows, correct `resale_class` each, licensed sources `enabled=false` — DB read pasted.
9. If #1496 executed here: screenshots of all four surfaces showing no `activeTravelers`, band-word-only crowd render intact.

## HARD STOP

Commit Phase 1 on the lane branch, post gate evidence, **stop**. Human read required before merge. Phase 2 does not start on the same approval — it gets its own dispatch (BestTime/PredictHQ/X credentials and contracts are Leon-side actions that gate it).
