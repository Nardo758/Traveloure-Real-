# DECISIONS.md — TravelPulse Trend + Crowd Engine Lane

Running record of bindings, rulings, and confirmed answers. Append-only; date-stamp each entry.

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
