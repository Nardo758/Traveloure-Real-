-- Master Integration Brief — Phase 3.1: Neighborhood spine scaffold.
--
-- Extends existing city_neighborhoods (per user direction: don't create a
-- parallel `neighborhoods` table — re-seeding when substantive fields
-- already exist would be waste). Adds three new join/target tables,
-- and the two trip columns the brief expects.

-- ─── Extend city_neighborhoods ──────────────────────────────────────────────
-- adjacent_keys: slugs of neighboring neighborhoods (for adjacency proximity
-- in upsell ranking). NULL = unknown / no graph yet (Deferred per brief —
-- market managers fill in later).
-- lead_expert_target: how many lead experts this neighborhood should have.
-- Default 1 per SEED_DATA §7 "Featured-lead slot: 1". Admin can tune in Phase 8.
ALTER TABLE city_neighborhoods
  ADD COLUMN IF NOT EXISTS adjacent_keys TEXT[];

ALTER TABLE city_neighborhoods
  ADD COLUMN IF NOT EXISTS lead_expert_target INT NOT NULL DEFAULT 1;

-- ─── expert_neighborhoods ───────────────────────────────────────────────────
-- Soft-exclusive lead constraint: one is_lead=true per neighborhood, enforced
-- by a partial unique index. Non-lead expert↔neighborhood links are unbounded
-- (multiple experts can serve a neighborhood; only one is the featured lead).
CREATE TABLE IF NOT EXISTS expert_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id VARCHAR NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  is_lead BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (expert_id, neighborhood_id)
);

-- Brief Phase 3 gate condition: a second is_lead=true insert on the same
-- neighborhood must fail. Partial unique index enforces this.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expert_neighborhoods_one_lead_per
  ON expert_neighborhoods(neighborhood_id)
  WHERE is_lead = true;

CREATE INDEX IF NOT EXISTS idx_expert_neighborhoods_expert
  ON expert_neighborhoods(expert_id);

-- ─── provider_neighborhood_coverage ─────────────────────────────────────────
-- Which providers serve which neighborhood × category. Powers the "category ×
-- neighborhood" upsell query (brief Phase 3 gate).
-- category_key: soft FK into service_categories.category_key. Phase 4 (or
-- onboarding) wires the validation; here we just rely on the completeness gate.
CREATE TABLE IF NOT EXISTS provider_neighborhood_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id VARCHAR NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  category_key VARCHAR(100) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, neighborhood_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_pnc_neighborhood_category
  ON provider_neighborhood_coverage(neighborhood_id, category_key);
CREATE INDEX IF NOT EXISTS idx_pnc_provider
  ON provider_neighborhood_coverage(provider_id);

-- ─── neighborhood_coverage_target ───────────────────────────────────────────
-- Per (neighborhood, category) target count for supply-side filling.
-- The "lead expert" target lives on city_neighborhoods.lead_expert_target,
-- not here — keeps category_key NOT NULL so the PK works cleanly.
CREATE TABLE IF NOT EXISTS neighborhood_coverage_target (
  neighborhood_id VARCHAR NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  category_key VARCHAR(100) NOT NULL,
  target_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (neighborhood_id, category_key)
);

-- ─── trips extensions ───────────────────────────────────────────────────────
-- primaryExpertId: the neighborhood-lead expert assigned to this trip
-- (distinct from existing trips.expert_id which is the generic handler).
-- neighborhood_ids: derived from itinerary items at write time; used by
-- the upsell engine's neighborhood-context branch.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS primary_expert_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS neighborhood_ids TEXT[];
