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

## Credential issues (Aug 2026)

- **BestTime `BESTTIME_API_KEY`**: 36 chars — likely `api_key_public`. Private key (`api_key_private`) is 64+ chars from besttime.app dashboard. Adapter is a disabled stub until confirmed.
- **PredictHQ `PREDICTHQ_API_KEY`**: 403 on `/v1/accounts/self/` — missing `account:read` scope or wrong token type. Adapter disabled stub.
- **xAI `XAI_API_KEY`**: `live_search` endpoint HTTP 410 on Tier 1. Options: upgrade to Tier 2+ or add X API v2 Bearer Token. X adapter disabled stub.

## Phase 2.3 — Grok removal

**HUMAN READ REQUIRED before merge to main.**

`travelpulse-scheduler.service.ts`: `updateCityWithAI` removed from daily loop; `getCitiesNeedingRefresh` scoped to 8 markets. Grep gate: both references in scheduler are comments only. `crowdLevel` remains static (option b) until Phase 4 resolver.

**Why:** R2 (Grok not a scoring source), R7 (no AI-fabricated history), scope limiter (8 markets only).

## tsc baseline

171 server errors post-Phase-2 rebase + implementation (Aug 2026). Pre-existing. Never go above this without justification.

## Migration 235

Adds: `health_status / halted_at / halted_reason` on `trend_source_config`; `pre_launch` boolean on `trend_signals`; idempotency UNIQUE index; 8 market `trend_entities` seed rows with confirmed QIDs.
