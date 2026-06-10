-- Master Integration Brief — Phase 5.4 (step 6): expert_review channel.
--
-- The endorsement loop is the structural reason your most defensible signal
-- can't be bought. Experts curate from the engine's ranked candidate list;
-- their endorsement writes back as a relevance boost (NEVER revenue) so it
-- compounds correctly across every other surface.
--
-- Two scopes:
--   - trip: expert endorses a specific offering for a specific trip
--     (the expert-review channel — feeds that trip's downstream surfaces).
--   - neighborhood: lead endorses an offering for their neighborhood
--     (NEIGHBORHOOD_SPINE.5 — feeds every trip touching the neighborhood).
--
-- A row is exactly one scope: a CHECK constraint enforces XOR on trip_id /
-- neighborhood_id so the resolver never has to disambiguate.

CREATE TABLE IF NOT EXISTS upsell_expert_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('trip', 'neighborhood')),
  trip_id VARCHAR(255),
  neighborhood_id VARCHAR,
  offering_id VARCHAR(255) NOT NULL,
  category_key VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT upsell_endorsement_scope_xor CHECK (
    (scope = 'trip' AND trip_id IS NOT NULL AND neighborhood_id IS NULL) OR
    (scope = 'neighborhood' AND neighborhood_id IS NOT NULL AND trip_id IS NULL)
  )
);

-- Uniqueness per scope: an expert can endorse a given offering at most once
-- within the same trip OR within the same neighborhood.
CREATE UNIQUE INDEX IF NOT EXISTS idx_upsell_endorsement_trip_uniq
  ON upsell_expert_endorsements (expert_id, trip_id, offering_id) WHERE scope = 'trip';
CREATE UNIQUE INDEX IF NOT EXISTS idx_upsell_endorsement_neighborhood_uniq
  ON upsell_expert_endorsements (expert_id, neighborhood_id, offering_id) WHERE scope = 'neighborhood';

-- Lookup indexes for context-load on every surface.
CREATE INDEX IF NOT EXISTS idx_upsell_endorsement_lookup_trip
  ON upsell_expert_endorsements (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_endorsement_lookup_neighborhood
  ON upsell_expert_endorsements (neighborhood_id) WHERE neighborhood_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_endorsement_expert
  ON upsell_expert_endorsements (expert_id, created_at DESC);
