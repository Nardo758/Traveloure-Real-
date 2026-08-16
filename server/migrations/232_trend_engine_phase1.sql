-- 231_trend_engine_phase1.sql
-- Trend + Crowd Engine — Phase 1: schema + config tables.
-- No ingestion code, no adapter, no scoring logic — structure only.
-- Append-only rule for trend_signals enforced by application convention; see comments.

-- ---------------------------------------------------------------------------
-- trend_entities — resolution layer mapping internal PKs to external IDs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_entities (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type         varchar(30) NOT NULL,     -- market|neighborhood|gem|place_type|offering_type
  internal_id         text        NOT NULL,     -- FK to the relevant entity table (polymorphic; no DB FK)
  wikidata_qid        text,                     -- e.g. "Q34600"
  google_place_id     text,
  wikipedia_title     text,
  besttime_venue_id   text,                     -- v1.1 crowd anchor mapping
  x_handle_or_query   text,                     -- X/Twitter resolution key
  created_at          timestamp   NOT NULL DEFAULT now(),
  updated_at          timestamp   NOT NULL DEFAULT now(),
  CONSTRAINT trend_entities_type_internal_unique UNIQUE (entity_type, internal_id)
);

CREATE INDEX IF NOT EXISTS trend_entities_entity_type_idx ON trend_entities (entity_type);
CREATE INDEX IF NOT EXISTS trend_entities_internal_id_idx ON trend_entities (internal_id);

-- ---------------------------------------------------------------------------
-- trend_signals — append-only. NEVER UPDATE. NEVER DELETE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_signals (
  id                text        PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_entity_id   text        NOT NULL REFERENCES trend_entities(id) ON DELETE CASCADE,
  source            text        NOT NULL,   -- references trend_source_config.source
  metric            varchar(60) NOT NULL,
  value             numeric     NOT NULL,
  observed_at       timestamp   NOT NULL,
  ingested_at       timestamp   NOT NULL DEFAULT now(),
  resale_class      varchar(30) NOT NULL,   -- first_party|licensed_no_resale|open_license — NO DEFAULT; adapter declares explicitly
  surface_origin    text,                  -- non-null only when signal originates from a scored surface (L8 exclusion)
  raw_ref           jsonb
);

CREATE INDEX IF NOT EXISTS trend_signals_entity_idx       ON trend_signals (trend_entity_id);
CREATE INDEX IF NOT EXISTS trend_signals_source_idx       ON trend_signals (source);
CREATE INDEX IF NOT EXISTS trend_signals_observed_at_idx  ON trend_signals (observed_at);
CREATE INDEX IF NOT EXISTS trend_signals_entity_metric_idx ON trend_signals (trend_entity_id, metric, observed_at DESC);

-- ---------------------------------------------------------------------------
-- trend_source_config — admin-editable, one row per source, no deploy needed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_source_config (
  source                  text        PRIMARY KEY,
  enabled                 boolean     NOT NULL DEFAULT false,
  decay_half_life_days    numeric(6,2),
  weight                  numeric(6,4),
  monthly_cost_ceiling    numeric(10,2),
  resale_class            varchar(30) NOT NULL,   -- NO DEFAULT; each source declares explicitly
  notes                   text,
  created_at              timestamp   NOT NULL DEFAULT now(),
  updated_at              timestamp   NOT NULL DEFAULT now()
);

-- Seed rows: 4 open-license sources (enabled), 3 licensed (disabled until contracts/credentials)
-- No serpapi row — dropped per R5 ruling (DECISIONS.md).
INSERT INTO trend_source_config (source, enabled, decay_half_life_days, weight, monthly_cost_ceiling, resale_class, notes)
VALUES
  ('wikimedia_pageviews', true,  14.0, 0.20, NULL,    'open_license',        'Daily Wikipedia page views per resolved entity via Wikimedia REST API. Open license, no cost ceiling needed.'),
  ('gdelt',               true,  7.0,  0.15, NULL,    'open_license',        'GDELT geo-filtered event/mention counts per market. Open license.'),
  ('nager_date',          true,  3.0,  0.10, NULL,    'open_license',        'Public holiday calendar pressure (US/UK/JP/IN/DE/AU origin set). Open license.'),
  ('open_meteo',          true,  1.0,  0.05, NULL,    'open_license',        'Daily weather anomaly vs normal per market centroid. Stored; scorer ignores in v1 per L3 (weather_anomaly_adjust stubbed).'),
  ('besttime',            false, 3.0,  0.30, 500.00,  'licensed_no_resale',  'BestTime.app busyness forecasts + live foot-traffic per matched gem. Crowd anchor per L12. Enable after Leon signs contract.'),
  ('predicthq',           false, 2.0,  0.20, 300.00,  'licensed_no_resale',  'Predicted event attendance per market/geo. Sanctioned Tier-3 exception per L12. Enable after Leon signs contract.'),
  ('x_api',               false, 1.0,  0.15, 200.00,  'licensed_no_resale',  'X (Twitter) API v2 or xAI live-search: post/mention counts + velocity per market and resolvable gems. Writes trend_signals only — no LLM summarization (R2). Enable after credential confirmation.')
ON CONFLICT (source) DO NOTHING;

-- ---------------------------------------------------------------------------
-- market_season_calendars — static seed per L3, Leon-reviewed season sets only
-- start_month_day / end_month_day = 'MM-DD'; wraps year-end when end < start
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_season_calendars (
  id                          text        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_key                  varchar(40) NOT NULL,
  season_key                  varchar(40) NOT NULL,
  display_name                varchar(100) NOT NULL,
  start_month_day             varchar(5)  NOT NULL,   -- 'MM-DD'
  end_month_day               varchar(5)  NOT NULL,   -- 'MM-DD'; wraps year-end when end < start
  expected_demand_multiplier  numeric(5,3) NOT NULL,
  weather_anomaly_adjust      numeric(5,3),            -- STUB — no logic reads this column in v1
  CONSTRAINT market_season_calendars_market_season_unique UNIQUE (market_key, season_key)
);

CREATE INDEX IF NOT EXISTS market_season_calendars_market_idx ON market_season_calendars (market_key);

-- Seed: exactly the 8 markets and season sets Leon reviewed in brief §Phase 1.
-- Date ranges are approximations for the first dark run; Leon may adjust via admin.
INSERT INTO market_season_calendars (market_key, season_key, display_name, start_month_day, end_month_day, expected_demand_multiplier)
VALUES
  -- Kyoto: sakura / tsuyu / summer / momiji / winter
  ('kyoto', 'sakura',  'Cherry Blossom',    '03-20', '04-20', 1.90),
  ('kyoto', 'tsuyu',   'Rainy Season',      '06-07', '07-20', 0.70),
  ('kyoto', 'summer',  'Summer',            '07-21', '09-06', 0.80),
  ('kyoto', 'momiji',  'Autumn Leaves',     '10-20', '12-01', 1.80),
  ('kyoto', 'winter',  'Winter',            '12-02', '03-19', 0.85),
  -- Goa: monsoon / post-monsoon / dry
  ('goa',   'monsoon',      'Monsoon',       '06-01', '09-30', 0.45),
  ('goa',   'post_monsoon', 'Post-Monsoon',  '10-01', '11-30', 0.95),
  ('goa',   'dry',          'Dry Peak',      '12-01', '05-31', 1.50),
  -- Mumbai: monsoon / post-monsoon / dry
  ('mumbai','monsoon',      'Monsoon',       '06-01', '09-30', 0.55),
  ('mumbai','post_monsoon', 'Post-Monsoon',  '10-01', '11-30', 1.00),
  ('mumbai','dry',          'Dry Season',    '12-01', '05-31', 1.30),
  -- Jaipur: summer / monsoon / winter-peak
  ('jaipur','summer',       'Summer',        '04-01', '06-30', 0.55),
  ('jaipur','monsoon',      'Monsoon',       '07-01', '09-15', 0.80),
  ('jaipur','winter_peak',  'Winter Peak',   '09-16', '03-31', 1.55),
  -- Edinburgh: festival-August as its own season / summer / winter
  ('edinburgh','festival_august', 'Festival Season', '08-01', '08-31', 2.20),
  ('edinburgh','summer',          'Summer',          '05-01', '07-31', 1.35),
  ('edinburgh','winter',          'Winter',          '11-01', '04-30', 0.65),
  -- Porto: high / shoulder / low
  ('porto', 'high',     'High Season',    '07-01', '09-30', 1.65),
  ('porto', 'shoulder', 'Shoulder',       '04-01', '06-30', 1.10),
  ('porto', 'low',      'Low Season',     '11-01', '03-31', 0.70),
  -- Bogotá: near-flat, two mild rainy periods
  ('bogota','dry_primary',   'Dry (Jan–Feb)',      '12-01', '02-28', 1.10),
  ('bogota','rainy_first',   'First Rains',        '03-01', '05-31', 0.90),
  ('bogota','dry_secondary', 'Dry (Jun–Aug)',      '06-01', '08-31', 1.05),
  ('bogota','rainy_second',  'Second Rains',       '09-01', '11-30', 0.90),
  -- Cartagena: dry-peak / rainy
  ('cartagena','dry_peak', 'Dry Peak',   '12-01', '04-30', 1.55),
  ('cartagena','rainy',    'Rainy',      '05-01', '11-30', 0.75)
ON CONFLICT (market_key, season_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- crowd_band_config — per-entity-type band cutoffs, admin-editable (v1.1)
-- lower_bound_vs_baseline: entity's own-baseline multiple at which this band begins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crowd_band_config (
  entity_type               varchar(30) NOT NULL,
  band                      varchar(10) NOT NULL CHECK (band IN ('low','moderate','high','peak')),
  lower_bound_vs_baseline   numeric(6,3) NOT NULL,
  CONSTRAINT crowd_band_config_type_band_unique UNIQUE (entity_type, band)
);

-- Seed: 4 bands × 5 entity types = 20 rows.
-- Cutoffs are relative to each entity's own 90-day baseline (L2/L9).
-- Phase 4 config edits replace these without a deploy.
INSERT INTO crowd_band_config (entity_type, band, lower_bound_vs_baseline)
VALUES
  ('market',        'low',      0.000),
  ('market',        'moderate', 0.700),
  ('market',        'high',     1.300),
  ('market',        'peak',     2.000),
  ('neighborhood',  'low',      0.000),
  ('neighborhood',  'moderate', 0.700),
  ('neighborhood',  'high',     1.300),
  ('neighborhood',  'peak',     2.000),
  ('gem',           'low',      0.000),
  ('gem',           'moderate', 0.650),
  ('gem',           'high',     1.250),
  ('gem',           'peak',     1.900),
  ('place_type',    'low',      0.000),
  ('place_type',    'moderate', 0.700),
  ('place_type',    'high',     1.300),
  ('place_type',    'peak',     2.000),
  ('offering_type', 'low',      0.000),
  ('offering_type', 'moderate', 0.700),
  ('offering_type', 'high',     1.300),
  ('offering_type', 'peak',     2.000)
ON CONFLICT (entity_type, band) DO NOTHING;

-- ---------------------------------------------------------------------------
-- trend_scores — materialized output, one row per entity, rewritten each run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_scores (
  trend_entity_id     text        PRIMARY KEY REFERENCES trend_entities(id) ON DELETE CASCADE,
  trend_score         numeric(6,3),
  trend_confidence    numeric(5,4),
  crowd_band          text,        -- low|moderate|high|peak|null (null = below confidence floor)
  crowd_confidence    numeric(5,4),
  contributing_sources jsonb       NOT NULL DEFAULT '[]'::jsonb,
  why_text            text,
  crowd_why           text,
  seasonal_expected   numeric(6,3),
  computed_at         timestamp   NOT NULL DEFAULT now(),
  scoring_run_id      text        NOT NULL
);

CREATE INDEX IF NOT EXISTS trend_scores_computed_at_idx ON trend_scores (computed_at DESC);
CREATE INDEX IF NOT EXISTS trend_scores_run_idx ON trend_scores (scoring_run_id);
