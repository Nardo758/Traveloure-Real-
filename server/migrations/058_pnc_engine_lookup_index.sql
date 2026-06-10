-- Migration 058: engine-lookup index on provider_neighborhood_coverage.
--
-- The Engine Inventory-Sourcing brief makes the upsell candidate gather read
-- this table by (neighborhood_id, category_key). The existing unique
-- constraint (provider_id, neighborhood_id, category_key) leads with
-- provider_id, so it cannot serve that lookup. Add a covering index for the
-- engine's access path.
CREATE INDEX IF NOT EXISTS idx_pnc_neighborhood_category
  ON provider_neighborhood_coverage(neighborhood_id, category_key);
