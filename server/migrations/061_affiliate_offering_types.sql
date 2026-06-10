-- Phase 5.8: Seed service_offering_types for affiliate categories.
--
-- The upsell engine's catalog-sourced path fires only when a matching
-- service_offering_types row exists for the candidate's category_key.
-- All four affiliate categories (aff_activities, aff_events,
-- aff_ground_transport, aff_air_hotel) previously had zero rows, so
-- affiliates were silently excluded from every recommendation surface.
--
-- Idempotent: ON CONFLICT (offering_type_key) DO NOTHING.

-- ─── aff_activities (Viator) ─────────────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_guided_tour',       'aff_activities', 'Guided City Tour',           'A local expert shows the highlights.',            false, 100),
  ('aff_cultural_class',    'aff_activities', 'Cultural Class or Workshop',  'Cook, craft, or create with a local.',            false, 101),
  ('aff_day_trip',          'aff_activities', 'Day Trip or Excursion',       'Venture beyond the city for a day.',              false, 102),
  ('aff_adventure_activity','aff_activities', 'Adventure Activity',          'Hike, dive, climb — the active option.',          false, 103),
  ('aff_food_drink_tour',   'aff_activities', 'Food & Drink Tour',           'Eat your way through the best spots.',            false, 104),
  ('aff_skip_line_entry',   'aff_activities', 'Skip-the-Line Entry',         'The landmark without the queue.',                 true,  105)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── aff_events (Fever) ──────────────────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_live_music',        'aff_events', 'Live Music or Concert',        'A night of real performance.',                    false, 110),
  ('aff_cultural_show',     'aff_events', 'Cultural Show or Performance',  'Theatre, dance, or traditional arts.',            false, 111),
  ('aff_nightlife_event',   'aff_events', 'Nightlife Event',               'The party worth putting in the itinerary.',       false, 112),
  ('aff_popup_experience',  'aff_events', 'Pop-up or Immersive Experience','Limited-run event you won''t find twice.',        true,  113)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── aff_ground_transport (12Go) ─────────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_bus_ticket',        'aff_ground_transport', 'Bus Ticket',               'Intercity or regional bus.',                  false, 120),
  ('aff_train_ticket',      'aff_ground_transport', 'Train Ticket',             'Fast, scenic, or overnight rail.',            false, 121),
  ('aff_ferry_ticket',      'aff_ground_transport', 'Ferry or Boat Ticket',     'Island hops and coastal crossings.',          false, 122),
  ('aff_airport_transfer',  'aff_ground_transport', 'Airport Transfer',         'Shared or private ride to the terminal.',     false, 123),
  ('aff_multi_day_pass',    'aff_ground_transport', 'Multi-Day Transport Pass', 'Unlimited travel for a stretch of days.',     true,  124)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── aff_air_hotel (Amadeus) ─────────────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_flight',            'aff_air_hotel', 'Flight',                    'One-way or return — search live fares.',          false, 130),
  ('aff_hotel_stay',        'aff_air_hotel', 'Hotel Stay',                'Curated picks near where the action is.',         false, 131),
  ('aff_flight_hotel',      'aff_air_hotel', 'Flight + Hotel Package',    'Book both and usually save.',                     false, 132)
ON CONFLICT (offering_type_key) DO NOTHING;
