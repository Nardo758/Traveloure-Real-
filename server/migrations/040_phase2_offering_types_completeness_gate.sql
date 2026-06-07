-- Master Integration Brief — Phase 2 completeness gate.
--
-- Asserts:
--   1. Every service_offering_types.category_key resolves to exactly one
--      service_categories row by category_key.
--   2. Every expert_offering_types.service_tier is one of the 5 brief tiers.
--   3. Every expert_offering_types.delivery_formats entry is a valid format.
--
-- RAISEs on any failure — migration aborts; server fail-fasts on startup.

DO $$
DECLARE
  missing_cat_keys TEXT;
  bad_tier_count   INT;
  bad_format_keys  TEXT;
BEGIN
  -- 1. service_offering_types.category_key must resolve in service_categories.
  SELECT string_agg(DISTINCT s.category_key, ', ' ORDER BY s.category_key)
    INTO missing_cat_keys
    FROM service_offering_types s
    LEFT JOIN service_categories c ON c.category_key = s.category_key
    WHERE c.id IS NULL;

  IF missing_cat_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 2 completeness gate FAILED: service_offering_types references unresolved category_key(s): %', missing_cat_keys;
  END IF;

  -- 2. expert_offering_types.service_tier already CHECK-constrained at table
  -- create time, but verify nothing slipped through (paranoia is cheap).
  SELECT COUNT(*) INTO bad_tier_count
    FROM expert_offering_types
    WHERE service_tier NOT IN ('advisory','planning','coordination','live_support','specialized');

  IF bad_tier_count > 0 THEN
    RAISE EXCEPTION
      'Phase 2 completeness gate FAILED: % expert_offering_types row(s) have an invalid service_tier', bad_tier_count;
  END IF;

  -- 3. Every delivery_formats element must be one of the 5 valid formats.
  SELECT string_agg(DISTINCT offering_type_key, ', ' ORDER BY offering_type_key)
    INTO bad_format_keys
    FROM expert_offering_types
    WHERE EXISTS (
      SELECT 1 FROM unnest(delivery_formats) f
      WHERE f NOT IN ('chat','written','video','live_text','done_for_you')
    );

  IF bad_format_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 2 completeness gate FAILED: expert_offering_types has invalid delivery_formats in: %', bad_format_keys;
  END IF;
END$$;
