-- Master Integration Brief — Phase 5.1: upsell engine tables.
--
-- The engine itself is a service file (no schema dependencies beyond what's
-- already in fee_bands / service_categories / service_offering_types / etc.
-- from Phases 1-3). What this migration adds:
--   1. upsell_slot_config — per-surface admin-tunable knobs
--   2. upsell_impressions — attribution log for ranking tuning + Year-1 model
--
-- Neither table is read by any user-facing surface yet. Phase 5.2+ wires them.

-- ─── upsell_slot_config ─────────────────────────────────────────────────────
-- One row per surface. maxItems / revenueWeight / revenueCap / frequencyCap.
-- revenueCap is the hard ceiling on revenue's influence — admin can lower the
-- effective weight but cannot exceed the cap. The relevance-dominance test
-- (in commit's companion service file) is what enforces "revenue never crosses
-- relevance bands" regardless of these values.
CREATE TABLE IF NOT EXISTS upsell_slot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface VARCHAR(50) NOT NULL UNIQUE,
  max_items INT NOT NULL DEFAULT 3,
  revenue_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.15,
  revenue_cap NUMERIC(5, 4) NOT NULL DEFAULT 0.15,
  frequency_cap_hours INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── upsell_impressions ─────────────────────────────────────────────────────
-- Logged every time the engine returns a candidate that gets rendered.
-- Conversion fields (clicked, added, booked) updated by client/server later.
CREATE TABLE IF NOT EXISTS upsell_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id VARCHAR(255),                           -- nullable: guest carts have no trip yet
  guest_session_id VARCHAR(255),                  -- alternative to trip_id
  user_id VARCHAR(255),                           -- nullable: pre-auth surfaces
  surface VARCHAR(50) NOT NULL,
  offering_id VARCHAR(255) NOT NULL,              -- could be service_offering_type / provider_service / etc.
  category_key VARCHAR(100),
  source_type VARCHAR(30),                        -- 'platform_provider' | 'affiliate'
  relevance_score NUMERIC(6, 4),
  revenue_score NUMERIC(6, 4),
  final_score NUMERIC(6, 4),
  rank_position INT,                              -- 1-indexed slot order on the surface
  shown_at TIMESTAMP NOT NULL DEFAULT NOW(),
  clicked BOOLEAN NOT NULL DEFAULT false,
  clicked_at TIMESTAMP,
  added BOOLEAN NOT NULL DEFAULT false,
  added_at TIMESTAMP,
  booked BOOLEAN NOT NULL DEFAULT false,
  booked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upsell_impressions_trip
  ON upsell_impressions(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_impressions_surface_shown
  ON upsell_impressions(surface, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_upsell_impressions_offering
  ON upsell_impressions(offering_id, shown_at DESC);

-- ─── Seed default slot configs for the 9 surfaces ───────────────────────────
-- Per brief §B5 — surface-specific intent + revenue ceiling.
-- Defaults pulled directly from §B6: revenueCap = 0.15 across the board (the
-- "revenue can move an item by at most ~15% of one band" rule). frequencyCap
-- is 48h on post_booking only (per §B5 "max 1 nudge per plan per 48h").
INSERT INTO upsell_slot_config (surface, max_items, revenue_weight, revenue_cap, frequency_cap_hours, enabled)
VALUES
  ('discover_location',  4, 0.15, 0.15,  0, true),
  ('discover_date',      4, 0.15, 0.15,  0, true),
  ('template_builder',   8, 0.10, 0.15,  0, true),    -- lower revenue weight: respecting template strength matters most
  ('cart',               3, 0.15, 0.15,  0, true),
  ('checkout',           2, 0.15, 0.15,  0, true),    -- §B5: ≤2 items, never blocks
  ('optimize_gate',      3, 0.10, 0.15,  0, true),    -- §B5: delta only, lower weight
  ('plancard_pretrip',   3, 0.15, 0.15,  0, true),
  ('plancard_ontrip',    3, 0.15, 0.15, 24, true),    -- live nudges throttled
  ('expert_review',     10, 0.05, 0.15,  0, true),    -- expert review = relevance-driven by design
  ('ai_concierge',       3, 0.15, 0.15,  0, true),
  ('post_booking',       2, 0.15, 0.15, 48, true)     -- §B5: max 1 nudge per plan per 48h
ON CONFLICT (surface) DO NOTHING;
