-- Migration 235: Trend Engine Phase 2 infrastructure
-- 1. Health-status columns on trend_source_config (Phase 2.1 halt/alert state)
-- 2. Idempotency unique constraint on trend_signals (Phase 2.2a gate requirement)
-- 3. trend_entities seed rows for 8 operating markets (deterministic QIDs, pre-confirmed)
-- 4. pre_launch column on trend_signals (R8 — backfill signals before public launch are
--    real observations but excluded from calibration fits; flagged via pre_launch = true)

-- ---------------------------------------------------------------------------
-- 1. Health status on trend_source_config
-- ---------------------------------------------------------------------------
ALTER TABLE trend_source_config
  ADD COLUMN IF NOT EXISTS health_status  varchar(30) NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS halted_at      timestamp,
  ADD COLUMN IF NOT EXISTS halted_reason  text;

-- Valid values: 'healthy' | 'halted_ceiling' | 'halted_error' | 'disabled'
-- Enforcement wrapper writes these; admin UI reads them. Not a DB CHECK so admin
-- can set custom values without a deploy.

-- ---------------------------------------------------------------------------
-- 2. Idempotency unique constraint on trend_signals
-- A (entity, source, metric, observed_at) tuple must be unique so re-runs and
-- backfill re-runs are safe to retry with ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS trend_signals_idempotency_idx
  ON trend_signals (trend_entity_id, source, metric, observed_at);

-- ---------------------------------------------------------------------------
-- 3. pre_launch flag on trend_signals (R8)
-- ---------------------------------------------------------------------------
ALTER TABLE trend_signals
  ADD COLUMN IF NOT EXISTS pre_launch boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. trend_entities seed: 8 operating markets
-- Wikidata QIDs pre-confirmed for major world cities; no inference.
-- internal_id = market_key (matches market_season_calendars.market_key).
-- ---------------------------------------------------------------------------
INSERT INTO trend_entities (entity_type, internal_id, wikidata_qid, wikipedia_title)
VALUES
  ('market', 'kyoto',     'Q34600',  'Kyoto'),
  ('market', 'goa',       'Q1171',   'Goa'),
  ('market', 'mumbai',    'Q1156',   'Mumbai'),
  ('market', 'jaipur',    'Q39443',  'Jaipur'),
  ('market', 'edinburgh', 'Q23436',  'Edinburgh'),
  ('market', 'porto',     'Q36433',  'Porto'),
  ('market', 'bogota',    'Q2841',   'Bogotá'),
  ('market', 'cartagena', 'Q28180',  'Cartagena, Colombia')
ON CONFLICT (entity_type, internal_id) DO NOTHING;
