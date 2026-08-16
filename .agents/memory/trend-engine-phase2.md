---
name: Trend Engine Phase 2 dispatch
description: Phase 2.1 cost enforcement, Phase 2.2a adapters, Phase 2.3 Grok removal — conventions and constraints
---

## Architecture

All trend-engine server code lives under `server/services/trend-engine/`:
- `operating-markets.ts` — single source of truth for 8 markets (cityName, lat/lng, QID, countryCode).
- `cost-enforcement.ts` — `TrendEngineCostEnforcer.recordAndCheck()` must be called before every external API call; halts the *source* (not the run) at ceiling; writes health_status to trend_source_config.
- `entity-resolver.ts` — resolves market seeds, Kyoto neighborhoods, Kyoto gems against Wikidata/Wikipedia; null when unconfident.
- `adapters/base.adapter.ts` — interface + `PRE_LAUNCH_CUTOFF` constant (2024-01-01); all adapters implement `daily()` and `backfill(from, to)`.
- `ingestion-runner.ts` — per-source isolation; skips disabled sources; `runDaily()` and `runBackfill(source, from, to)`.

## Adapter conventions (enforced at code review)

1. Every external call: `await trendEngineCostEnforcer.recordAndCheck(...)` before fetch.
2. Every insert: `.onConflictDoNothing()` — idempotency index `trend_signals_idempotency_idx` on (entity, source, metric, observed_at).
3. `resaleClass` declared explicitly per row — never inferred.
4. `preLaunch = true` for internal-reconstruction signals before `PRE_LAUNCH_CUTOFF` (internal_trips only currently).

## Credential status (Aug 2026)

- **BestTime `BESTTIME_API_KEY`**: 36-char `pri_` key IS the valid private key (assumption of 64+ chars was wrong). Both APIs confirmed working: `POST /api/v1/forecasts` (200) and `POST /api/v1/forecasts/live` (200). Adapter is fully built. Enable in trend_source_config when ceiling confirmed.
- **PredictHQ `PREDICTHQ_API_KEY`**: 403 on `/v1/accounts/self/` — missing `account:read` scope or wrong token type. Adapter disabled stub.
- **X API `X_BEARER_TOKEN`**: 116-char Bearer Token, Basic plan confirmed working. `GET /2/tweets/counts/recent` → 200, 300 req/15min limit. Adapter fully built. Enable in trend_source_config when 30-day ToS purge job is also in place.
- **xAI `XAI_API_KEY`**: No longer needed for X signals — native X API v2 used directly. xAI key still present for other potential uses.

## BestTime API quirks

- `POST /api/v1/forecasts` with `venue_name` + `venue_address` — idempotent create/update, returns `analysis[0..6]` (days, 0=Monday) each with `day_raw` (24-hr array, 0-100), `day_mean`, `day_max`.
- `POST /api/v1/forecasts/live` with `venue_id` — returns `venue_live_busyness` + `venue_forecasted_busyness` for current hour.
- `GET /api/v1/forecasts/day/raw` and `week/raw` return 400 "Missing api_key_private" even when it's passed — may require a different auth format; not needed since create endpoint returns all data.
- No historical time-series; backfill not supported (rolling weekly pattern only).

## Phase 2.3 — Grok removal

**HUMAN READ REQUIRED before merge to main.**

`travelpulse-scheduler.service.ts`: `updateCityWithAI` removed from daily loop; `getCitiesNeedingRefresh` scoped to 8 markets. Grep gate: both references in scheduler are comments only. `crowdLevel` remains static (option b) until Phase 4 resolver.

**Why:** R2 (Grok not a scoring source), R7 (no AI-fabricated history), scope limiter (8 markets only).

## tsc baseline

171 server errors post-Phase-2 rebase + implementation (Aug 2026). Pre-existing. Never go above this without justification.

## Migration 235

Adds: `health_status / halted_at / halted_reason` on `trend_source_config`; `pre_launch` boolean on `trend_signals`; idempotency UNIQUE index; 8 market `trend_entities` seed rows with confirmed QIDs.
