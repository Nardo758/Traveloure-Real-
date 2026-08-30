---
name: Trend Engine Phase 0 decisions
description: Key rulings, hotfix, render map, and city scope from Phase 0 audit and Leon's approval — governs all Phase 1+ work on the Trend Engine lane.
---

## R4 hotfix (shipped 2026-08-16)
Removed `recentTrendScores`, `previousActiveTravelers`, and SerpAPI block from `gatherProxySignals` in `travelpulse.service.ts` and `grok.service.ts` (`CityProxySignals` interface + `formatProxySignals`). First-party trip counts kept per R1.

**Why:** Score history feeding back into scoring (L8/R4) was live. Self-anchored traveler estimate (R3) was live. SerpAPI dropped per Leon's R5 ruling (Wikimedia Pageviews replaces in Phase 2).

## Republish gate
`activeTravelers` absolute count must be suppressed at four surfaces before republish. These are all traveler-facing render lines, no schema change:
- `client/src/components/travelpulse/CityCard.tsx:141-142`
- `client/src/components/travelpulse/CityGrid.tsx:377`
- `client/src/components/travelpulse/CityDetailView.tsx:880`
- `client/src/components/TrendingCities.tsx:74`
`crowdLevel` band string is not R3-blocked; traveler exposure is Leon's call per L4.

## 8 operating markets
Kyoto, Goa, Mumbai, Jaipur, Edinburgh, Porto, Bogotá, Cartagena. The other 17 dev `travel_pulse_cities` rows are non-operating markets. Scope drop to 8 is a Phase 2.3 config item (same PR as Grok removal).

## Spine naming
`city_neighborhoods` (not `neighborhoods`) is the physical table. All Phase 1+ FKs target `city_neighborhoods.id`.

## Cost tracking
`apiUsageService.logApiCall` (`server/services/api-usage.service.ts:62`) is the entry point. Zero live callers today — this lane's adapters are first consumers. Ceiling/halt/alert logic is net-new in Phase 2.

## Source of truth
`DECISIONS.md` at repo root is the running ruling ledger for this lane.
