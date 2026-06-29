-- Migration 095: Restore missing service_provider category rows in service_offering_types.
--
-- Root cause: task #666 deleted or deactivated service_provider rows that were
-- originally seeded by migration 038. The live /earn page showed "No offerings
-- published yet." for the Service Provider track because the table only retained
-- affiliate and event_planner rows.
--
-- Strategy: re-insert every service_provider-category row from migration 038 using
-- ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true
-- so rows that exist but are deactivated are re-activated, and missing rows are
-- created fresh. Fully idempotent — safe to re-run.

-- ─── CORE (private_transportation, tour_guide, photography) ─────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  -- private_transportation
  ('airport_driver',           'private_transportation', 'Airport Pickup & Drop-off Driver', 'A friendly face at arrivals, no taxi-line stress.',   false, 1),
  ('day_trip_driver',          'private_transportation', 'Day-Trip Driver',                  'Your car, your knowledge, a full day out.',           false, 2),
  ('multiday_driver',          'private_transportation', 'Multi-Day Tour Driver',            'Drive a whole itinerary, region to region.',          false, 3),
  ('luxury_chauffeur',         'private_transportation', 'Luxury Chauffeur',                 'Premium vehicle for special occasions.',              false, 4),
  ('late_night_driver',        'private_transportation', 'Late-Night Safe-Ride Driver',      'Get people home safely after dark.',                  false, 5),
  -- tour_guide
  ('hidden_gems_guide',        'tour_guide', 'Hidden-Gems Walking Guide',        'The spots that aren''t in the guidebook.',       false, 10),
  ('food_market_guide',        'tour_guide', 'Food Market Guide',                'Graze the stalls, order the good stuff.',        false, 11),
  ('history_guide',            'tour_guide', 'History & Story Guide',            'Bring the streets to life.',                     false, 12),
  ('sacred_site_guide',        'tour_guide', 'Temple / Cathedral Guide',         'Meaning, etiquette, and timing.',                false, 13),
  ('nightlife_guide',          'tour_guide', 'Pub & Nightlife Guide',            'The real local night out.',                      false, 14),
  ('nature_guide',             'tour_guide', 'Hiking & Nature Guide',            'Trails, timing, what to bring.',                 false, 15),
  ('photo_spot_guide',         'tour_guide', 'Photo-Spot Guide',                 'Walk them to the best angles.',                  false, 16),
  ('architecture_walk',        'tour_guide', 'Architecture & Design Walk',       'For the detail lovers.',                         false, 17),
  ('friend_for_a_day',         'tour_guide', 'Friend for a Day',                 'Unscripted, like a local friend.',               true,  18),
  ('etiquette_coach',          'tour_guide', 'Etiquette & Culture Coach',        'The unspoken rules.',                            true,  19),
  ('language_buddy',           'tour_guide', 'Language-Exchange Buddy',          'Conversation practice over coffee.',             true,  20),
  -- photography
  ('couples_photographer',     'photography', 'Vacation / Couples Photographer',  'Proper photos, not phone selfies.',             false, 30),
  ('solo_photographer',        'photography', 'Solo-Traveler Portrait Photographer','No more "can you take our photo?"',           false, 31),
  ('proposal_photographer',    'photography', 'Proposal Photographer',            'Catch the "yes" from a hidden spot.',           false, 32),
  ('family_photoshoot',        'photography', 'Family Photoshoot',                'Everyone in one frame, finally.',               false, 33),
  ('drone_photographer',       'photography', 'Drone Photographer',               'The aerial shot of the trip.',                  false, 34),
  ('golden_hour_photographer', 'photography', 'Sunrise / Golden-Hour Photographer','Crowd-free icons at dawn.',                    true,  35)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── SECONDARY (accommodation, dining_venue, activity_provider, private_chef, concierge_vip) ─
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  -- accommodation
  ('boutique_host',            'accommodation', 'Boutique / Independent Stay Host',       'Character over chains.',                   false, 50),
  ('heritage_stay_concierge',  'accommodation', 'Heritage / Traditional Stay Concierge',  'Ryokan, haveli, castle, machiya.',         false, 51),
  ('nomad_housing_helper',     'accommodation', 'Long-Stay & Nomad Housing Helper',       'Monthly stays, the practical setup.',      false, 52),
  -- dining_venue
  ('reservation_insider',      'dining_venue', 'Restaurant Reservation Insider',          'The table that''s "fully booked."',        false, 60),
  ('private_dinner_host',      'dining_venue', 'Private Dinner Host',                     'Open your home or a private room.',        false, 61),
  ('supper_club_host',         'dining_venue', 'Supper-Club Host',                        'A seat at a local table.',                 false, 62),
  -- activity_provider
  ('cooking_class_host',       'activity_provider', 'Cooking Class Host',                 'Make the dish, then eat it.',              false, 70),
  ('craft_workshop_host',      'activity_provider', 'Craft / Artisan Workshop Host',      'Pottery, calligraphy, weaving.',           false, 71),
  ('tea_ritual_host',          'activity_provider', 'Tea Ceremony / Coffee Ritual Host',  'The slow, local way.',                     false, 72),
  ('sport_instructor',         'activity_provider', 'Surf / Bike / Kayak / Climb Instructor','Get them moving.',                       false, 73),
  ('wellness_session',         'activity_provider', 'Wellness / Yoga / Breathwork Session','A reset on the road.',                    false, 74),
  -- private_chef
  ('in_home_chef',             'private_chef', 'In-Home Private Chef',                    'Restaurant-quality, their kitchen.',       false, 80),
  ('market_to_table_chef',     'private_chef', 'Market-to-Table Chef',                    'Shop the market, then cook it.',           false, 81),
  -- concierge_vip
  ('skip_line_fixer',          'concierge_vip', 'Skip-the-Line Fixer',                    'Priority access, no wait.',                false, 90),
  ('vip_access_concierge',     'concierge_vip', 'VIP Access Concierge',                   'The "unavailable" table or ticket.',       false, 91),
  ('personal_concierge',       'concierge_vip', '24/7 Personal Concierge',                'Anything, anytime, sorted.',               false, 92),
  ('errand_runner',            'concierge_vip', 'Errand & Logistics Runner',              'SIM, transit pass, the boring stuff.',     true,  93),
  ('bargaining_coach',         'concierge_vip', 'Bargaining Coach',                       'Pay the local price.',                     true,  94),
  ('safety_companion',         'concierge_vip', 'Solo-Traveler Safety Companion',         'Not alone after dark.',                    true,  95),
  ('translator_companion',     'concierge_vip', 'Real-Time Translator Companion',         'Be their voice for a day.',                true,  96),
  ('dietary_navigator',        'concierge_vip', 'Dietary Dining Navigator',               'Safe vegan/halal/kosher/allergy meals.',   true,  97)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── SEGMENT / FAMILY / ACCESSIBILITY ────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  -- childcare_family
  ('tourist_babysitter',       'childcare_family', 'Tourist Babysitter / Travel Nanny',   'Kid-free hours for parents abroad.',       true,  110),
  ('kids_day_out',             'childcare_family', 'Kids'' Day-Out Host',                 'Take the kids somewhere fun.',             false, 111),
  ('family_activity_coord',    'childcare_family', 'Family Activity Coordinator',         'Plan the day so nobody melts down.',       false, 112),
  -- accessibility_specialist
  ('mobility_guide',           'accessibility_specialist', 'Mobility & Accessibility Guide','Step-free routes, the city made reachable.', false, 120),
  ('senior_companion',         'accessibility_specialist', 'Senior-Travel Companion',     'Gentle pace, steady support.',             true,  121)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── Market-scoped provider offerings ────────────────────────────────────────
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, market_scoped, sort_order)
VALUES
  ('tea_ceremony_host',    'activity_provider', 'Tea Ceremony Host',           NULL, false, ARRAY['kyoto'],              300),
  ('kimono_styling',       'activity_provider', 'Kimono Dressing & Styling',   NULL, false, ARRAY['kyoto'],              301),
  ('cherry_blossom_photo', 'photography',       'Cherry-Blossom Photographer', NULL, false, ARRAY['kyoto'],              302),
  ('whisky_guide',         'tour_guide',        'Whisky Distillery Guide',     NULL, false, ARRAY['edinburgh'],          303),
  ('fringe_insider',       'concierge_vip',     'Fringe Festival Insider',     NULL, false, ARRAY['edinburgh'],          304),
  ('salsa_host',           'activity_provider', 'Salsa Lesson Host',           NULL, false, ARRAY['bogota','cartagena'], 305),
  ('coffee_farm_guide',    'tour_guide',        'Coffee-Farm Guide',           NULL, false, ARRAY['bogota'],             306),
  ('port_sommelier',       'activity_provider', 'Port Wine Sommelier',         NULL, false, ARRAY['porto'],              307),
  ('douro_guide',          'tour_guide',        'Douro Valley Guide',          NULL, false, ARRAY['porto'],              308),
  ('textile_access_guide', 'tour_guide',        'Textile & Artisan Access Guide', NULL, false, ARRAY['mumbai','jaipur'], 309),
  ('beach_coordinator',    'concierge_vip',     'Beach-Day Coordinator',       NULL, false, ARRAY['goa'],                310),
  ('palace_etiquette',     'tour_guide',        'Palace Etiquette Guide',      NULL, false, ARRAY['jaipur'],             311)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;
