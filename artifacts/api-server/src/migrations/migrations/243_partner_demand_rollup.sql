-- 243_partner_demand_rollup.sql
--
-- Partner Demand 2B (ledger 2026-08-18-partner-demand-2b). The L6 single-computation home for every
-- demand figure: one row per (market_slug, date, metric, partner_id?, service_id?).
--
--   market_slug       real operating-market slug, or the reserved '__unmapped__' bucket (R13).
--   date              MARKET-LOCAL date (computed in the market's timezone, not UTC).
--   metric            'unmet_demand_slip' | 'slip_funnel' (app-enforced; no DB CHECK, house posture).
--   partner_id        nullable — market-level rows carry NULL; per-partner rows set it.
--   service_id        nullable — per-service rows only (when a service clears the partner floor).
--   value             jsonb — a scalar figure or a structured funnel share one column.
--   source_row_count  the N behind the figure (read-path floor gate + show-the-N honesty).
--   computed_at       when the nightly job wrote this row.
--
-- The nightly job is REPLACE-BY-DATE (delete a market-local date's rows, insert fresh) so recompute
-- is idempotent. The unique index is hygiene; NULL partner/service are distinct in a plain unique,
-- but delete-first prevents market-level dupes. Additive table, NO CHECK (publish-safe); declared in
-- shared/schema.ts per the publish-trap rule (table + indexes must survive the deploy push).

CREATE TABLE IF NOT EXISTS partner_demand_rollup (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug      VARCHAR(40) NOT NULL,
  date             DATE        NOT NULL,
  metric           VARCHAR(40) NOT NULL,
  partner_id       VARCHAR,
  service_id       VARCHAR,
  value            JSONB       NOT NULL,
  source_row_count INTEGER     NOT NULL,
  computed_at      TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pdr_scope_unique
  ON partner_demand_rollup (market_slug, date, metric, partner_id, service_id);

CREATE INDEX IF NOT EXISTS pdr_market_date_idx
  ON partner_demand_rollup (market_slug, date);

COMMENT ON TABLE partner_demand_rollup IS
  'Partner Demand 2B skeleton rollup (ledger 2026-08-18-partner-demand-2b). L6 single-computation home; admin/internal, floor-enforced on read.';
