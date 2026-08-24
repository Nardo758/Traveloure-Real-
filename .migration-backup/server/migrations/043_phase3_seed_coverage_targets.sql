-- Master Integration Brief — Phase 3.3: apply coverage-target default per SEED_DATA §7.
--
-- For every seeded neighborhood in the 8 launch-market cities, insert targets
-- for the four universal categories (tour_guide, photography,
-- private_transportation, dining_venue) + city-specific additions.
--
-- The "lead expert" slot lives on city_neighborhoods.lead_expert_target (default 1),
-- not in this table — keeps category_key NOT NULL so the PK works cleanly.
--
-- Per-market additions per SEED_DATA §7:
--   kyoto / edinburgh / porto → activity_provider 1
--   goa                       → concierge_vip 1
--
-- ON CONFLICT (neighborhood_id, category_key) DO NOTHING — never overwrite
-- admin's tuning of target counts.

-- ─── Universal defaults: 4 categories × every seeded brief-market neighborhood ─
WITH brief_neighborhoods AS (
  SELECT id FROM city_neighborhoods
  WHERE city IN ('Kyoto', 'Edinburgh', 'Bogotá', 'Cartagena', 'Porto', 'Mumbai', 'Goa', 'Jaipur')
),
universal_targets AS (
  SELECT 'tour_guide'              AS category_key, 1 AS target_count
  UNION ALL SELECT 'photography',             1
  UNION ALL SELECT 'private_transportation',  1
  UNION ALL SELECT 'dining_venue',            1
)
INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
SELECT bn.id, ut.category_key, ut.target_count
FROM brief_neighborhoods bn
CROSS JOIN universal_targets ut
ON CONFLICT (neighborhood_id, category_key) DO NOTHING;

-- ─── Kyoto, Edinburgh, Porto: + activity_provider ───────────────────────────
INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
SELECT id, 'activity_provider', 1
FROM city_neighborhoods
WHERE city IN ('Kyoto', 'Edinburgh', 'Porto')
ON CONFLICT (neighborhood_id, category_key) DO NOTHING;

-- ─── Goa: + concierge_vip ───────────────────────────────────────────────────
INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
SELECT id, 'concierge_vip', 1
FROM city_neighborhoods
WHERE city = 'Goa'
ON CONFLICT (neighborhood_id, category_key) DO NOTHING;
