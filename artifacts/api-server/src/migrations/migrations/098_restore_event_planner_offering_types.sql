-- Migration 098: Restore missing event_planner category rows in service_offering_types.
--
-- Root cause: a future migration may deactivate or delete event_planner category
-- rows that were originally seeded by migration 038. The live /earn page would
-- show "No offerings published yet." for the Event Planner track because the
-- table lost its event-category rows.
--
-- Strategy: re-insert every event_planner-category row from migration 038 using
-- ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true
-- so rows that exist but are deactivated are re-activated, and missing rows are
-- created fresh. Fully idempotent — safe to re-run.
--
-- Affected categories (EVENT_CATEGORY_KEYS):
--   event_coordinator, caterer, florist, officiant, videographer, hair_makeup,
--   av_tech, rentals, entertainment, printing_materials

INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  -- event_coordinator
  ('wedding_coordinator',   'event_coordinator',   'Wedding Planner / Coordinator',      'The whole day, handled.',                  false, 130),
  ('proposal_planner',      'event_coordinator',   'Proposal Planner',                   'Design the moment end to end.',            false, 131),
  ('proposal_stager',       'event_coordinator',   'Proposal Stager',                    'Set the scene before they arrive.',        true,  132),
  ('party_planner',         'event_coordinator',   'Birthday & Party Planner',           'Celebrations away from home.',             false, 133),
  ('date_night_designer',   'event_coordinator',   'Date-Night Designer',                'One unforgettable evening.',               false, 134),
  ('corporate_event_coord', 'event_coordinator',   'Corporate Event Coordinator',        'Offsites, dinners, launches.',             false, 135),
  -- caterer
  ('caterer',               'caterer',             'Caterer',                            'Feed the celebration.',                    false, 140),
  -- florist
  ('florist',               'florist',             'Florist',                            'Flowers for the moment.',                  false, 150),
  -- entertainment
  ('entertainer',           'entertainment',       'DJ / Band / Live Musician / Performer','Set the mood.',                          false, 160),
  -- hair_makeup
  ('hair_makeup_artist',    'hair_makeup',         'Hair & Makeup Artist',               'Camera-ready.',                            false, 170),
  -- videographer
  ('videographer',          'videographer',        'Videographer',                       'The film of the day.',                     false, 180),
  -- av_tech
  ('av_support',            'av_tech',             'AV & Tech Support',                  'Sound, screens, lights that work.',        false, 190),
  -- rentals
  ('event_rentals',         'rentals',             'Event Rentals',                      'Chairs, tables, tents, the kit.',          false, 200),
  -- officiant
  ('officiant',             'officiant',           'Officiant',                          'Make it official.',                        false, 210),
  -- printing_materials
  ('calligrapher_print',    'printing_materials',  'Calligrapher / Print & Signage',     'The paper details.',                       false, 220)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;
