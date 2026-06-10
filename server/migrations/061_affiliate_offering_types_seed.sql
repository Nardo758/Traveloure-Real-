-- Seed service_offering_types rows for affiliate categories so the upsell
-- engine's catalog-sourced branch fires for Viator, Fever, 12Go, and Amadeus.
--
-- Without these rows the gatherOfferingCandidates() gather loop never produces
-- affiliate candidates (no service_offering_types row → nothing to join).
--
-- All four affiliate category_keys come from migration 034:
--   aff_activities      (source_type='affiliate', partner='viator')
--   aff_events          (source_type='affiliate', partner='fever')
--   aff_ground_transport(source_type='affiliate', partner='12go')
--   aff_air_hotel       (source_type='affiliate', partner='amadeus')
--
-- Migration is idempotent: ON CONFLICT (offering_type_key) DO NOTHING.

-- ─── Viator: Activities & Tours (aff_activities) ─────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_viator_guided_tour',
   'aff_activities',
   'Guided Tour (Viator)',
   'Book a local expert-led tour — skip the research, straight to the good stuff.',
   false, 400),
  ('aff_viator_day_trip',
   'aff_activities',
   'Day Trip & Excursion (Viator)',
   'Full-day adventures from your base city, everything included.',
   false, 401),
  ('aff_viator_cooking_class',
   'aff_activities',
   'Cooking Class (Viator)',
   'Learn the dish, eat the dish — hands-on kitchen sessions.',
   false, 402),
  ('aff_viator_cultural_experience',
   'aff_activities',
   'Cultural Experience (Viator)',
   'Authentic rituals, crafts, and ceremonies with local context.',
   false, 403),
  ('aff_viator_outdoor_adventure',
   'aff_activities',
   'Outdoor Adventure (Viator)',
   'Hiking, kayaking, climbing — nature-led escapes.',
   false, 404),
  ('aff_viator_skip_line_ticket',
   'aff_activities',
   'Skip-the-Line Ticket (Viator)',
   'Pre-booked entry to top attractions — no queue required.',
   true,  405),
  ('aff_viator_private_tour',
   'aff_activities',
   'Private Tour (Viator)',
   'Your group, your pace, your questions — full guide attention.',
   false, 406),
  ('aff_viator_food_drink_tour',
   'aff_activities',
   'Food & Drink Tour (Viator)',
   'Eat and sip your way through a neighborhood with a guide.',
   false, 407),
  ('aff_viator_water_activity',
   'aff_activities',
   'Water Activity (Viator)',
   'Snorkeling, diving, boat trips, and more on the water.',
   false, 408)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── Fever: Events & Experiences (aff_events) ────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_fever_live_concert',
   'aff_events',
   'Live Concert & Music (Fever)',
   'From intimate gigs to stadium nights — find what''s on.',
   false, 420),
  ('aff_fever_immersive_experience',
   'aff_events',
   'Immersive Experience (Fever)',
   'Candlelight concerts, pop-up exhibitions, and one-night shows.',
   true,  421),
  ('aff_fever_local_event',
   'aff_events',
   'Local Event & Festival (Fever)',
   'City celebrations, markets, and neighbourhood happenings.',
   false, 422),
  ('aff_fever_food_event',
   'aff_events',
   'Food & Drink Event (Fever)',
   'Tastings, brunches, pop-ups, and chef dinners.',
   false, 423),
  ('aff_fever_art_culture',
   'aff_events',
   'Art & Culture Event (Fever)',
   'Gallery openings, theatre, comedy, and cultural showcases.',
   false, 424),
  ('aff_fever_outdoor_event',
   'aff_events',
   'Outdoor Event (Fever)',
   'Open-air cinema, rooftop parties, park festivals.',
   false, 425)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── 12Go: Ground Transport (aff_ground_transport) ───────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_12go_bus',
   'aff_ground_transport',
   'Bus Ticket (12Go)',
   'Intercity buses — comfortable, scheduled, and easy to book.',
   false, 440),
  ('aff_12go_train',
   'aff_ground_transport',
   'Train Ticket (12Go)',
   'Rail journeys across the region — book your seat in advance.',
   false, 441),
  ('aff_12go_ferry',
   'aff_ground_transport',
   'Ferry Ticket (12Go)',
   'Island hops and coastal crossings — tickets handled.',
   false, 442),
  ('aff_12go_minivan',
   'aff_ground_transport',
   'Shared Minivan Transfer (12Go)',
   'Door-to-door shared transfers for popular routes.',
   false, 443),
  ('aff_12go_airport_transfer',
   'aff_ground_transport',
   'Airport Transfer (12Go)',
   'Pre-booked ride from airport to hotel — no haggling.',
   true,  444),
  ('aff_12go_express_train',
   'aff_ground_transport',
   'Express / High-Speed Train (12Go)',
   'Fast intercity rail — the efficient way between cities.',
   false, 445)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─── Amadeus: Air & Hotel (aff_air_hotel) ────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('aff_amadeus_flight',
   'aff_air_hotel',
   'Flight Search (Amadeus)',
   'Compare fares and book flights for your trip.',
   false, 460),
  ('aff_amadeus_hotel',
   'aff_air_hotel',
   'Hotel Search (Amadeus)',
   'Find and compare hotels near your itinerary stops.',
   false, 461),
  ('aff_amadeus_hotel_boutique',
   'aff_air_hotel',
   'Boutique & Independent Hotel (Amadeus)',
   'Character hotels away from the big chains.',
   false, 462),
  ('aff_amadeus_airport_transfer',
   'aff_air_hotel',
   'Airport Transfer Booking (Amadeus)',
   'Pre-booked ground transfer confirmed with your flight details.',
   false, 463)
ON CONFLICT (offering_type_key) DO NOTHING;
