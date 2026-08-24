-- Migration 062: Fill offering catalog gaps across all 4 earn roles.
--
-- Identified via full role audit (June 2026):
--   • Event Planner: 8 of 10 categories had only 1 catch-all row.
--   • Trip Planner: 3 missing planning-tier niches.
--   • Local Expert: 6 missing specialized-tier rows (incl. city-specific
--     planning — the only way a Local Expert can offer itinerary work
--     without colliding with the Trip Planner partition).
--
-- Idempotent: ON CONFLICT (offering_type_key) DO NOTHING throughout.
-- All category_key values resolve to existing service_categories rows
-- (verified by migration 040 gate on next startup).

-- ─── EVENT PLANNER gaps ──────────────────────────────────────────────────────
-- caterer: 3 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('cocktail_bar_service',   'caterer', 'Cocktail Bar Service',      'Craft cocktails poured at the event.',          false, 141),
  ('dessert_chef',           'caterer', 'Dessert Chef',              'Custom cake, patisserie, or sweet table.',      false, 142),
  ('food_truck_operator',    'caterer', 'Food Truck Operator',       'Casual catering with a crowd-pleasing menu.',   true,  143)
ON CONFLICT (offering_type_key) DO NOTHING;

-- entertainment: 3 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('comedian_host',          'entertainment', 'Comedian / MC',             'Keep the room laughing.',                   false, 161),
  ('magician',               'entertainment', 'Magician',                  'Close-up or stage — always a hit.',         true,  162),
  ('photo_booth_operator',   'entertainment', 'Photo Booth Operator',      'Instant memories for every guest.',         false, 163)
ON CONFLICT (offering_type_key) DO NOTHING;

-- hair_makeup: split into 2 specialist rows (was 1 combined)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('hair_stylist',           'hair_makeup', 'Hair Stylist',          'Bridal, occasion, and editorial looks.',        false, 171),
  ('makeup_artist',          'hair_makeup', 'Makeup Artist',         'From natural to full-glam.',                    false, 172)
ON CONFLICT (offering_type_key) DO NOTHING;

-- av_tech: split into 2 specialist rows (was 1 combined)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('lighting_technician',    'av_tech', 'Lighting Technician',   'Set the mood with the right light.',            false, 191),
  ('sound_engineer',         'av_tech', 'Sound Engineer',        'Crystal-clear audio, no feedback.',             false, 192)
ON CONFLICT (offering_type_key) DO NOTHING;

-- florist: 2 new specialist rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('floral_arch_designer',   'florist', 'Floral Arch & Backdrop Designer', 'The frame for the big moment.',         false, 151),
  ('centrepiece_creator',    'florist', 'Centrepiece Creator',             'Table arrangements that guests remember.', false, 152)
ON CONFLICT (offering_type_key) DO NOTHING;

-- rentals: 3 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('linens_tableware_rental', 'rentals', 'Linens & Tableware Rental', 'Dressed tables, not plastic.',              false, 201),
  ('furniture_rental',        'rentals', 'Furniture Rental',          'Chairs, lounges, bars — the full layout.',  false, 202),
  ('tent_marquee_rental',     'rentals', 'Tent & Marquee Rental',     'Outdoor events, weather-proofed.',          false, 203)
ON CONFLICT (offering_type_key) DO NOTHING;

-- officiant: 2 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('civil_celebrant',        'officiant', 'Civil Celebrant',       'Legally binding, personally meaningful.',     false, 211),
  ('multifaith_officiant',   'officiant', 'Multi-Faith Officiant', 'Ceremonies that honour both traditions.',     true,  212)
ON CONFLICT (offering_type_key) DO NOTHING;

-- printing_materials: 2 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('invitation_designer',    'printing_materials', 'Invitation Designer',    'Sets the tone before the day.',       false, 221),
  ('event_signage_creator',  'printing_materials', 'Event Signage Creator',  'Menus, seating charts, welcome boards.', false, 222)
ON CONFLICT (offering_type_key) DO NOTHING;

-- videographer: 2 new rows (was 1 catch-all)
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('highlight_reel_videographer', 'videographer', 'Highlight Reel Videographer', 'The 3-min film they''ll watch forever.', false, 181),
  ('livestream_operator',         'videographer', 'Livestream Operator',          'Broadcast the moment to loved ones away.', true, 182)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── TRIP PLANNER gaps (planning tier) ───────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('corporate_travel_plan',  'planning', 'Corporate & Offsite Trip Plan',  'Itineraries for company retreats and incentive travel.',   ARRAY['written','done_for_you'], false, 28),
  ('sports_event_travel',    'planning', 'Sports & Live-Event Travel Plan','Fan travel for matches, F1, concerts — built around the fixture.', ARRAY['written'],       true,  29),
  ('retreat_planning',       'planning', 'Retreat & Wellness Trip Plan',   'Yoga, surf, meditation — structured around the practice.', ARRAY['written','video'],        false, 30)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── LOCAL EXPERT gaps (specialized tier) ────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  -- City-specific planning (Local Expert equivalent of Trip Planner's full itinerary)
  ('local_city_itinerary',      'specialized', 'Local City Itinerary',           'Multi-day plan for one city, built by a resident.',          ARRAY['written'],               false, 86),
  ('local_perfect_day',         'specialized', 'Local Perfect Day',              'One curated day in their city — a local''s best picks.',     ARRAY['written','chat'],        false, 87),
  ('local_neighbourhood_plan',  'specialized', 'Neighbourhood Deep-Dive Plan',   'Area-level guide: Le Marais, Shimokitazawa, etc.',            ARRAY['written'],               true,  88),
  -- Niche advisory
  ('sustainable_travel_consult','specialized', 'Sustainable Travel Consult',     'Eco-stays, slow tourism, community-owned experiences.',      ARRAY['written','chat'],        false, 89),
  ('lgbtq_travel_consult',      'specialized', 'LGBTQ+ Travel Consult',          'Safe destinations, inclusive venues, local legal landscape.', ARRAY['chat','written'],        true,  90),
  ('slow_travel_consult',       'specialized', 'Slow Travel & Long-Stay Consult','Settling in vs. sightseeing — the when, where, and how.',    ARRAY['written','chat'],        false, 91)
ON CONFLICT (offering_type_key) DO NOTHING;
