# DECISIONS.md — TravelPulse Trend + Crowd Engine Lane

Running record of bindings, rulings, and confirmed answers. Append-only; date-stamp each entry.

---

## Phase 2 new rulings — 2026-08-16

**R7 — Backfill ruling.** The fabrication ban covers *manufacturing* history, not *retrieving* it. A historical observation fetched from a source's archive, or deterministically reconstructed from existing platform rows, is legitimate: `observed_at` = the real historical date, `ingested_at` = now. What remains banned: manufacturing rows for periods a source has no record of, and — explicitly — **ingesting Grok's historical pulse/trending/crowd/traveler-estimate outputs as signals.** Those are outputs of the fabrication this lane replaces. They never enter `trend_signals`, ever.

**R8 — Calibration window starts at real traffic.** Reconstructed internal signals from before public launch measure the dev team, not demand. The backfill still ingests them (they're real observations), but a `pre_launch` flag or config cutoff date excludes them from any future calibration fit. Config, not literal.

**FU-12 amendment.** Blocking condition changes from "≥1 full season of collected signals" to "backfill ingestion complete + entity resolution complete + docomo MSS quote answered." Market-level Kyoto calibration is expected to be viable weeks after Phase 2 ships.

**Process ruling — full-domain coverage queries required for seeded calendar/range tables.** Boundary spot-checks are insufficient. The 366-day leap-year scan used in Phase 1 close-out is the standard gate for any seeded calendar or range table going forward. Record it here; apply it to any future phase that inserts rows of this type.

---

## Phase 0 → Phase 1 conditional approval — 2026-08-16

**Source:** Leon's stop-resolution message, Phase 0 findings review.

### Schema naming fix (L1 amendment)
FKs target **`city_neighborhoods`** as-is. No rename. Brief schema block amended to read `city_neighborhoods` wherever it previously said `neighborhoods`. `trend_entities.internal_id` for `entity_type='neighborhood'` FKs `city_neighborhoods.id`.

### Cost-tracking enforcement scope (L5 scope clarification)
Ceiling + halt + alert logic is **in-lane Phase 2 scope, net-new**, sized in that phase. Not a hookup to existing infrastructure; `apiUsageService.logApiCall` has zero live callers today — this lane's adapters are its first real consumers.

### Slip-add signal emission choke point (Phase 3 constraint)
Signal must be emitted **at the shared storage choke point** (`server/storage.ts`), not per-route. Phase 3 gate tests all six-plus `itinerary_items` insert paths individually.

### Booking rail tagging (Phase 3 constraint)
Both booking rails emit (`service_bookings` canonical + legacy `bookings`), **tagged by rail** so downstream can weight or filter by provenance.

### R5 resolution — SerpAPI/Google Trends DROPPED (2026-08-16)
SerpAPI/Google Trends is **dropped**. Wikimedia Pageviews (`open_license`) is the substitute. The SerpAPI call dies in Phase 2.3 with the Grok scoring path removal. Grep gate in Phase 2.3 extends to cover `SERP_API_KEY` as well.

*Immediate consequence:* R4 hotfix also removes the SerpAPI block from `gatherProxySignals` (done, `server/services/travelpulse.service.ts` + `grok.service.ts`).

### FOLLOWUPS #11 added
Gem geo-backfill lane: 81% of `travel_pulse_hidden_gems` globally have null coordinates. Caps all non-Kyoto trend/crowd/spine ambitions until addressed.

### 25-vs-8 city scope — confirmed 2026-08-16
The 17 extra `travel_pulse_cities` rows (Paris, Tokyo, Singapore, Prague, Dubai, New York, Bali, Cape Town, Lisbon, Barcelona, Bangkok, London, Rome, Marrakech, Los Angeles, Sydney, San Jose) are **non-operating markets** — not in the Phase 1 season calendar. Daily refresh scope drops to the 8 operating markets **in the same PR that removes the Grok scoring call** (Phase 2.3) — no separate lane, it's config (an allowlist or `enabled` flag on the cities to refresh, consistent with `trend_source_config`'s per-source ceiling pattern).

### Republish gate — held (2026-08-16)
Republish held until:
1. R3 confirmed landed: `activeTravelers` absolute count removed from all four traveler-facing render surfaces (see render map below).
2. Render map shows no absolute count reaching a traveler surface.

**R3 render map — surfaces that must be suppressed before republish:**

| File | Line | What renders | R3 verdict |
|---|---|---|---|
| `client/src/components/travelpulse/CityCard.tsx` | 141–142 | `activeTravelers.toLocaleString()` — absolute count on every city card | **BLOCK** |
| `client/src/components/travelpulse/CityGrid.tsx` | 377 | `cities.reduce(…activeTravelers…).toLocaleString()` — summed worldwide count in header | **BLOCK** |
| `client/src/components/travelpulse/CityDetailView.tsx` | 880 | `city.activeTravelers.toLocaleString()` — in city detail, `data-testid="value-active-travelers"` | **BLOCK** |
| `client/src/components/TrendingCities.tsx` | 74 | `data?.cities.reduce(…activeTravelers…)` — summed in panel header | **BLOCK** |
| `crowdLevel` string (multiple) | various | Band label ("moderate", "busy") — not a count | Not R3-blocked; band label is L11-compliant in form, but source is still Grok. Traveler exposure is Leon's call per L4. |

R3 removal work is **pre-republish, not in this lane** — it is a direct suppression of those four render lines, no schema change needed.

---

## R4 hotfix — shipped 2026-08-16

**Pre-approved per brief v1.1, pre-lane.**

Removed from `gatherProxySignals` (`server/services/travelpulse.service.ts`) and `CityProxySignals` interface + `formatProxySignals` (`server/services/grok.service.ts`):
- `recentTrendScores` — trend-score history read-back (R4: score history must never be a scoring input)
- `previousActiveTravelers` — self-anchored estimate smoothing (R3/R4)
- SerpAPI/Google Trends block (R5: dropped per Leon ruling above)

First-party platform trip counts (`platformTravelersNow`, `platformUpcomingTrips30d`) are **kept** per R1/R6 — real Phase-3 work already done, to be repointed to write `trend_signals` rows in Phase 2.3.

---

## Locked decisions (L1–L12) from brief v1.1

Fully binding; not reproduced here — source of truth is the brief. Key additions in v1.1 vs v1.0:
- **L11:** Crowd is an index, never a count. Four-band relative index only on traveler surfaces.
- **L12:** BestTime.app anchor (licensed_no_resale, cost-ceilinged); PredictHQ sanctioned Tier-3 exception for event load; official visitor stats for band calibration.
- **R1–R6:** Grok pipeline absorption rulings (see brief §RECONCILIATION RULING).

---

## Operating markets v1 (Phase 1 season calendar scope)

Kyoto (Japan), Goa (India), Mumbai (India), Jaipur (India), Edinburgh (United Kingdom), Porto (Portugal), Bogotá (Colombia), Cartagena (Colombia).

8 cities. Season calendar seed must be Leon-reviewed before insert (per Phase 1 gate).

---

## Phase 1 close-out ledger entries — 2026-08-16

### L-CLS-1 — Season seed approved with two additions

26 agent-seeded rows approved as-inserted by Leon with multiplier bases labeled (see corrective dispatch evidence). Two gap rows added per Leon approval (close-out dispatch 2026-08-16):

| market_key | season_key | start_month_day | end_month_day | multiplier | basis |
|---|---|---|---|---|---|
| kyoto | spring_shoulder | 04-21 | 06-06 | 1.100 | Leon-approved estimate — Golden Week (late Apr–early May) sits inside the window |
| edinburgh | autumn_shoulder | 09-01 | 10-31 | 0.900 | Leon-approved estimate — post-Festival cooldown above winter floor |

Three residual calendar gaps closed via migration 234 (Leon-approved 2026-08-16):

| market_key | season_key | start_month_day | end_month_day | multiplier | basis |
|---|---|---|---|---|---|
| bogota | dry_primary | 12-01 | **02-29** | 1.100 | UPDATE — extends existing row's end by 1 leap-year day; same season, same multiplier |
| kyoto | autumn_shoulder | 09-07 | 10-19 | 0.900 | Pre-foliage shoulder — above summer floor (0.80), well below momiji peak (1.80); conservative estimate pending BestTime.app calibration |
| porto | autumn | 10-01 | 10-31 | 1.000 | October shoulder — pleasant but below summer peak (1.65); neutral index pending BestTime.app calibration |

366-day leap-year coverage scan returns **0 gap_days** for all 8 operating markets after migration 234.
### L-CLS-2 — #1496 executed in-lane, expanded scope

6 render sites suppressed (not the audited 4; `discover-location.tsx:385` and `discover.tsx:652` found during grep-gate execution). The `discover.tsx` instance aliased `activeTravelers` into a displayed "review count" — noted as an instance of the fabrication class. `crowdLevel` band-string retained at all sites per option (b). Adjacent copy audit complete: "Real-time" / "Live Updates" language removed from all neighbouring sites (CityGrid header sub-text + badge text).

### L-CLS-3 — R3 amendment path recorded (not yet active)

Absolute crowd counts may return per-entity as *calibrated range estimates* only — fitted against external ground truth, rendered as ranges with "estimated" label, permitted only where fit quality passes a config threshold. Amendment activates when the Calibration Lane ships, not before. R3 stands as-is until then.

---


## TravelPulse field aliasing audit — 2026-08-16


### L-CLS-4 — Full field-to-display-slot audit; no active fabrication-class instances found

**Scope:** all components and pages consuming the `travelPulseCities` shape: `CityCard.tsx`, `CityGrid.tsx`, `CityDetailView.tsx`, `TrendingCities.tsx`, `TravelPulseCard.tsx`, `discover.tsx`, `discover-location.tsx`. Ground truth: `shared/schema.ts` `travelPulseCities` table.

**Active render site verdicts:**

| Field | Schema definition | Active render sites | Verdict |
|---|---|---|---|
| `pulseScore` | integer 0–100, "overall activity score" | CityCard stat footer "Pulse {n}"; discover-location hero badge labeled "pulse"; CityDetailView hero badge | ✅ label accurate |
| `activeTravelers` | integer, "Currently active travelers" | Suppressed at all sites per R3/L-CLS-2 | ✅ no render |
| `trendingScore` | integer 0–100, "how hot is it trending" | Drives "Hot" / "Trending" badge (`> 70` threshold) | ✅ semantically honest |
| `avgHotelPrice` | decimal, avg hotel price per night | CityCard body "${n}/night"; CityDetailView stat card "Avg Hotel/Night" | ✅ label accurate |
| `aiOptimalDuration` | varchar, e.g. "3–5 days" | CityDetailView "Recommended Duration" card | ✅ label accurate |
| `totalTrendingSpots` | integer | CityCard "{n} trending"; CityDetailView "Trending Spots" | ✅ label accurate |
| `totalHiddenGems` | integer | CityCard "{n} gems"; CityDetailView "Hidden Gems" | ✅ label accurate |

**Dead-code mismatches removed:**

`discover.tsx` contained a `trendingTrips` useMemo (lines 642–661 pre-fix) that mapped TravelPulse fields into a trip-package shape: `pulseScore/20` → `rating` (implied star rating), `trendingScore > 70` → `expertPick` (implied human curation), `avgHotelPrice × 5` → `price` (inflated per-night price presented as trip price). The downstream `filteredTrips` const was never rendered in JSX — these mismatches were in dead code. Removed the entire block (plus the associated `trendingCitiesData` query, `tripSearchQuery` state, and `selectedTripCategory` state) to eliminate the aliasing risk. `CityGrid` on the travelpulse tab already consumes TravelPulse data correctly without any remapping.

---

## Phase 2 dispatch — 2026-08-16

### Phase 2.0 — Credential verification findings

| Secret | Length | Status | Action required |
|---|---|---|---|
| `XAI_API_KEY` | — | ⚠️ Tier 1 — `live_search` endpoint HTTP 410 deprecated | Upgrade to Tier 2+ or add X API v2 Bearer Token |
| `BESTTIME_API_KEY` | 36 chars | ❌ Likely public key (api_key_public) not private key | Paste `api_key_private` from besttime.app dashboard (64+ chars) |
| `PREDICTHQ_API_KEY` | 40 chars | ❌ 403 on /v1/accounts/self/ — missing account:read scope | Confirm correct token type and scope |

### Phase 2.1 — Cost enforcement

Migration 235 adds `health_status`, `halted_at`, `halted_reason` to `trend_source_config`.
`server/services/trend-engine/cost-enforcement.ts` implements `TrendEngineCostEnforcer`:
- `recordAndCheck()` logs every call to `api_usage_logs` and halts source (not run) at ceiling.
- Halt writes `health_status = 'halted_ceiling'` and `halted_at` / `halted_reason` to DB.
- Other sources unaffected when one halts.

### Phase 2.2a — Entity resolution + open-license adapters

Migration 235 also:
- Adds `pre_launch` boolean to `trend_signals` (R8).
- Adds UNIQUE idempotency index `(trend_entity_id, source, metric, observed_at)`.
- Seeds 8 market `trend_entities` rows with pre-confirmed Wikidata QIDs.

`server/services/trend-engine/entity-resolver.ts` resolves:
- 8 operating markets (pre-seeded with known QIDs; enriches Wikipedia title via Wikipedia API).
- Kyoto neighborhoods (FK → city_neighborhoods; Wikidata name+geo search, null when unconfident).
- Kyoto gems (FK → travel_pulse_hidden_gems; Wikidata name search).

Adapters built (`server/services/trend-engine/adapters/`):
| Adapter | Source key | resale_class | Cost | Status |
|---|---|---|---|---|
| wikimedia-pageviews | wikimedia_pageviews | open_license | $0 | ✅ ready |
| gdelt | gdelt | open_license | $0 | ✅ ready |
| nager-date | nager_date | open_license | $0 | ✅ ready |
| open-meteo | open_meteo | open_license | $0 | ✅ ready |
| internal-trips | internal_trips | first_party | $0 | ✅ ready |
| besttime | besttime | licensed_no_resale | $500/mo ceiling | ❌ DISABLED — key issue |
| predicthq | predicthq | licensed_no_resale | $300/mo ceiling | ❌ DISABLED — 403 |
| x-api | x_api | licensed_no_resale | $200/mo ceiling | ❌ DISABLED — 410 |

`server/services/trend-engine/ingestion-runner.ts` orchestrates per-source isolation.

### Phase 2.2b — BLOCKED

All three licensed adapters are stubs. Enable only after:
- BestTime: private key (64+ chars) confirmed in `BESTTIME_API_KEY`.
- PredictHQ: token with `account:read` scope confirmed.
- X: credential path resolved (xAI Tier 2 or X v2 Bearer Token).

### Phase 2.3 — Grok scoring removal (**REQUIRES HUMAN READ BEFORE MERGE**)

`server/services/travelpulse-scheduler.service.ts`:
- `updateCityWithAI()` call removed from daily scheduler loop.
- Scope changed from "all stale cities" to `OPERATING_MARKETS` (8 configured markets only).
- Demand-signal refresh retained; destination trends computation retained.
- `triggerManualRefresh()` AI branch removed; now demand-signal only.
- `getCitiesNeedingRefresh()` in travelpulse.service.ts scoped to 8 operating markets.

Grep gate: `updateCityWithAI` / `grokService` appear in scheduler only as comments (2 occurrences, both comments).

tsc: 171 (no new errors vs post-rebase baseline).
