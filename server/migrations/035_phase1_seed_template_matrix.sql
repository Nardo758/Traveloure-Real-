-- Master Integration Brief — Phase 1.2d: seed template_category_matrix + completeness gate.
--
-- SEED_DATA §3: maps (templateKey, categoryKey) → strength.
-- Templates: travel, wedding, proposal, date_night, birthday, corporate, custom.
-- custom = OPT for every brief category (generated programmatically at end).
-- Strengths: REQ (required), REC (recommended), OPT (optional). Omitted (template, category) = not surfaced.
--
-- Ends with the completeness gate: every category_key referenced must resolve
-- to exactly one service_categories row. Migration RAISEs if not.

-- ─── travel ─────────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('travel', 'private_transportation', 'REC'),
  ('travel', 'tour_guide',             'REC'),
  ('travel', 'photography',            'OPT'),
  ('travel', 'accommodation',          'REC'),
  ('travel', 'dining_venue',           'REC'),
  ('travel', 'activity_provider',      'REC'),
  ('travel', 'private_chef',           'OPT'),
  ('travel', 'concierge_vip',          'OPT'),
  ('travel', 'childcare_family',       'OPT'),
  ('travel', 'accessibility_specialist','OPT'),
  ('travel', 'aff_activities',         'REC'),
  ('travel', 'aff_events',             'REC'),
  ('travel', 'aff_ground_transport',   'REC'),
  ('travel', 'aff_air_hotel',          'REC')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── wedding ────────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('wedding', 'private_transportation', 'REC'),
  ('wedding', 'photography',            'REQ'),
  ('wedding', 'accommodation',          'REC'),
  ('wedding', 'dining_venue',           'REQ'),
  ('wedding', 'activity_provider',      'OPT'),
  ('wedding', 'private_chef',           'OPT'),
  ('wedding', 'concierge_vip',          'OPT'),
  ('wedding', 'childcare_family',       'OPT'),
  ('wedding', 'event_coordinator',      'REQ'),
  ('wedding', 'caterer',                'REQ'),
  ('wedding', 'florist',                'REC'),
  ('wedding', 'entertainment',          'REC'),
  ('wedding', 'hair_makeup',            'REC'),
  ('wedding', 'videographer',           'REC'),
  ('wedding', 'av_tech',                'OPT'),
  ('wedding', 'rentals',                'REC'),
  ('wedding', 'officiant',              'OPT'),
  ('wedding', 'accessibility_specialist','OPT'),
  ('wedding', 'printing_materials',     'OPT'),
  ('wedding', 'aff_activities',         'OPT'),
  ('wedding', 'aff_ground_transport',   'OPT'),
  ('wedding', 'aff_air_hotel',          'OPT')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── proposal ───────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('proposal', 'private_transportation', 'REC'),
  ('proposal', 'tour_guide',             'OPT'),
  ('proposal', 'photography',            'REQ'),
  ('proposal', 'accommodation',          'OPT'),
  ('proposal', 'dining_venue',           'REQ'),
  ('proposal', 'activity_provider',      'REC'),
  ('proposal', 'private_chef',           'REC'),
  ('proposal', 'concierge_vip',          'OPT'),
  ('proposal', 'event_coordinator',      'REC'),
  ('proposal', 'florist',                'REC'),
  ('proposal', 'entertainment',          'OPT'),
  ('proposal', 'hair_makeup',            'OPT'),
  ('proposal', 'videographer',           'OPT'),
  ('proposal', 'rentals',                'OPT'),
  ('proposal', 'accessibility_specialist','OPT'),
  ('proposal', 'aff_activities',         'REC'),
  ('proposal', 'aff_events',             'OPT'),
  ('proposal', 'aff_ground_transport',   'OPT')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── date_night ─────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('date_night', 'private_transportation', 'OPT'),
  ('date_night', 'dining_venue',           'REQ'),
  ('date_night', 'activity_provider',      'REC'),
  ('date_night', 'private_chef',           'REC'),
  ('date_night', 'concierge_vip',          'OPT'),
  ('date_night', 'florist',                'OPT'),
  ('date_night', 'accessibility_specialist','OPT'),
  ('date_night', 'aff_activities',         'REC'),
  ('date_night', 'aff_events',             'REC')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── birthday ───────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('birthday', 'private_transportation', 'OPT'),
  ('birthday', 'tour_guide',             'OPT'),
  ('birthday', 'photography',            'REC'),
  ('birthday', 'accommodation',          'OPT'),
  ('birthday', 'dining_venue',           'REQ'),
  ('birthday', 'activity_provider',      'REC'),
  ('birthday', 'private_chef',           'OPT'),
  ('birthday', 'concierge_vip',          'OPT'),
  ('birthday', 'childcare_family',       'OPT'),
  ('birthday', 'event_coordinator',      'REC'),
  ('birthday', 'caterer',                'REC'),
  ('birthday', 'florist',                'OPT'),
  ('birthday', 'entertainment',          'REC'),
  ('birthday', 'videographer',           'OPT'),
  ('birthday', 'av_tech',                'OPT'),
  ('birthday', 'rentals',                'REC'),
  ('birthday', 'accessibility_specialist','OPT'),
  ('birthday', 'printing_materials',     'OPT'),
  ('birthday', 'aff_activities',         'REC'),
  ('birthday', 'aff_events',             'REC'),
  ('birthday', 'aff_ground_transport',   'OPT'),
  ('birthday', 'aff_air_hotel',          'OPT')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── corporate ──────────────────────────────────────────────────────────────
INSERT INTO template_category_matrix (template_key, category_key, strength) VALUES
  ('corporate', 'private_transportation', 'REC'),
  ('corporate', 'tour_guide',             'OPT'),
  ('corporate', 'photography',            'REC'),
  ('corporate', 'accommodation',          'REC'),
  ('corporate', 'dining_venue',           'REQ'),
  ('corporate', 'activity_provider',      'REC'),
  ('corporate', 'private_chef',           'OPT'),
  ('corporate', 'concierge_vip',          'OPT'),
  ('corporate', 'childcare_family',       'OPT'),
  ('corporate', 'event_coordinator',      'REQ'),
  ('corporate', 'caterer',                'REQ'),
  ('corporate', 'florist',                'OPT'),
  ('corporate', 'entertainment',          'REC'),
  ('corporate', 'av_tech',                'REQ'),
  ('corporate', 'rentals',                'REC'),
  ('corporate', 'accessibility_specialist','OPT'),
  ('corporate', 'printing_materials',     'REC'),
  ('corporate', 'aff_activities',         'REC'),
  ('corporate', 'aff_ground_transport',   'OPT'),
  ('corporate', 'aff_air_hotel',          'OPT')
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── custom: OPT for every brief categoryKey (programmatic per SEED_DATA §3) ──
INSERT INTO template_category_matrix (template_key, category_key, strength)
SELECT 'custom', sc.category_key, 'OPT'
FROM service_categories sc
WHERE sc.category_key IS NOT NULL
ON CONFLICT (template_key, category_key) DO NOTHING;

-- ─── Completeness gate ──────────────────────────────────────────────────────
DO $$
DECLARE
  missing TEXT;
  duplicates TEXT;
BEGIN
  SELECT string_agg(DISTINCT m.category_key, ', ' ORDER BY m.category_key)
    INTO missing
    FROM template_category_matrix m
    LEFT JOIN service_categories c ON c.category_key = m.category_key
    WHERE c.id IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 1.2 completeness gate FAILED: template_category_matrix references unresolved category_key(s): %', missing;
  END IF;

  SELECT string_agg(category_key, ', ' ORDER BY category_key)
    INTO duplicates
    FROM (
      SELECT category_key
      FROM service_categories
      WHERE category_key IS NOT NULL
      GROUP BY category_key
      HAVING COUNT(*) > 1
    ) d;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 1.2 completeness gate FAILED: service_categories has duplicate category_key(s): %', duplicates;
  END IF;
END$$;
