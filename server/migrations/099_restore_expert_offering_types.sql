-- Migration 099: Restore missing expert offering rows in expert_offering_types.
--
-- Root cause: a future migration may deactivate or delete expert offering rows
-- that were originally seeded by migration 039. The live /earn page would show
-- "No offerings published yet." for the Trip Planner or Local Expert tracks
-- because the table lost its planning/coordination/advisory/live_support/
-- specialized tier rows.
--
-- Strategy: re-insert every row from migration 039 using
-- ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true
-- so rows that exist but are deactivated are re-activated, and missing rows are
-- created fresh. Fully idempotent — safe to re-run.
--
-- Affected tiers:
--   TRIP_PLANNER_TIERS : planning, coordination
--   LOCAL_EXPERT_TIERS : advisory, live_support, specialized

-- ─── ADVISORY ────────────────────────────────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('ask_me_anything',       'advisory', 'Ask-Me-Anything Session',        '30-min Q&A about the destination.',                       ARRAY['chat','video'],          false, 1),
  ('reality_check',         'advisory', 'Destination Reality Check',      '"Is this realistic for my time/budget?"',                  ARRAY['chat','video'],          false, 2),
  ('itinerary_2nd_opinion', 'advisory', 'Itinerary Second Opinion',       'Review a plan they already have.',                         ARRAY['chat','written','video'], true,  3),
  ('ai_plan_polish',        'advisory', 'AI-Plan Polish',                 'Upgrade an AI-generated draft (the $49.99 review).',       ARRAY['written','video'],       true,  4),
  ('neighborhood_picker',   'advisory', 'Neighborhood Picker',            '"Which area should I stay in?"',                           ARRAY['chat','written'],        false, 5),
  ('budget_optimizer',      'advisory', 'Budget Optimizer',               '"How do I do this for less?"',                             ARRAY['chat','written'],        false, 6),
  ('restaurant_hitlist',    'advisory', 'Restaurant & Reservation Hit-List','Just the food, curated.',                                ARRAY['written'],               false, 7),
  ('hidden_gems_shortlist', 'advisory', 'Hidden-Gems Shortlist',          'Off-guidebook spots for their taste.',                     ARRAY['written'],               false, 8),
  ('tourist_trap_audit',    'advisory', 'Tourist-Trap Audit',             '"What''s overrated, what do I skip?"',                     ARRAY['chat','written'],        false, 9),
  ('packing_brief',         'advisory', 'Packing & Prep Brief',           'What to bring, what to skip.',                             ARRAY['written'],               false, 10),
  ('practicalities_brief',  'advisory', 'Practicalities Brief',           'Visa, SIM, transit, money, safety.',                       ARRAY['written'],               false, 11),
  ('first_timer_orient',    'advisory', 'First-Timer Orientation',        'What to know before you land.',                            ARRAY['written','video'],       false, 12)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── PLANNING ────────────────────────────────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('full_itinerary',        'planning', 'Full Custom Itinerary',          'The classic day-by-day plan.',                             ARRAY['written','done_for_you'], false, 20),
  ('perfect_day',           'planning', 'Single Perfect Day Design',      'One day, done right.',                                     ARRAY['written'],                true,  21),
  ('multicity_route',       'planning', 'Multi-City Route Plan',          'How to sequence several stops.',                           ARRAY['written'],                false, 22),
  ('family_plan',           'planning', 'Family-Trip Plan',               'Kid-friendly pacing and picks.',                           ARRAY['written'],                false, 23),
  ('accessibility_plan',    'planning', 'Accessibility-Aware Plan',       'Built around real mobility needs.',                        ARRAY['written'],                false, 24),
  ('solo_plan',             'planning', 'Solo-Traveler Plan',             'Safe, social, well-paced for one.',                        ARRAY['written'],                false, 25),
  ('nomad_plan',            'planning', 'Workation / Nomad-Month Plan',   'Work + explore over a long stay.',                         ARRAY['written'],                false, 26),
  ('special_occasion_trip', 'planning', 'Special-Occasion Trip Designer', 'Honeymoon / proposal trip / milestone.',                   ARRAY['written','video'],        true,  27)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── COORDINATION ────────────────────────────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('done_for_you_booking',  'coordination', 'Done-for-You Booking',       'They approve, you book everything.',                       ARRAY['done_for_you'],                false, 40),
  ('group_trip_coord',      'coordination', 'Group-Trip Coordinator',     'Wrangle a whole group''s logistics.',                      ARRAY['done_for_you','video'],         false, 41),
  ('reservation_lifeline',  'coordination', 'Reservation Lifeline',       'Secure the "impossible" table tonight.',                   ARRAY['done_for_you','live_text'],     true,  42),
  ('vendor_wrangler',       'coordination', 'Vendor Wrangler',            'Line up and brief the on-ground providers.',               ARRAY['done_for_you'],                false, 43),
  ('occasion_coordination', 'coordination', 'Special-Occasion Coordination','Execute the proposal/anniversary moment.',               ARRAY['done_for_you'],                false, 44)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── LIVE SUPPORT ────────────────────────────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('text_a_local',          'live_support', '"Text a Local" Live',        'On-call by text during the trip.',                          ARRAY['live_text'],                  true,  60),
  ('same_day_rescue',       'live_support', 'Same-Day Rescue / Re-Plan',  'Fix the day when something breaks.',                        ARRAY['live_text','video'],          true,  61),
  ('what_now_suggestions',  'live_support', 'Spontaneous "What Now?"',    '"Free afternoon — what''s good?"',                          ARRAY['live_text'],                  false, 62),
  ('realtime_translation',  'live_support', 'Real-Time Translation by Text','Be their voice for a tricky moment.',                    ARRAY['live_text'],                  false, 63),
  ('reservation_on_fly',    'live_support', 'Reservation-on-the-Fly',     'Book it while they''re standing there.',                    ARRAY['live_text'],                  false, 64),
  ('trip_emergency',        'live_support', 'Trip Emergency Support',     'Lost docs, medical navigation.',                            ARRAY['live_text','video'],          false, 65)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;

-- ─── SPECIALIZED ─────────────────────────────────────────────────────────────
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('themed_deep_dive',      'specialized', 'Themed Deep-Dive Expert',     'Monetize the obsession (whisky/vegan/film...).',            ARRAY['chat','written','video'],     true,  80),
  ('relocation_consult',    'specialized', 'Move-Here / Relocation Consult','For people moving in, not visiting.',                     ARRAY['video','written'],            true,  81),
  ('content_scout',         'specialized', 'Content-Creator Location Scout','Where to shoot, when, how to get in.',                    ARRAY['written','video'],            false, 82),
  ('corporate_consult',     'specialized', 'Corporate / Incentive-Trip Consultant','Advise on offsites and reward trips.',             ARRAY['video','written'],            false, 83),
  ('location_scout',        'specialized', 'Wedding / Proposal Location Scout','Find and vet the spot.',                                ARRAY['written','video'],            false, 84),
  ('culture_crash_course',  'specialized', 'Culture & Language Crash Course','Pre-arrival prep.',                                       ARRAY['video','written'],            false, 85),
  ('personal_shopper',      'specialized', 'Personal-Shopper Consult',    'What to buy, where it''s real.',                            ARRAY['chat','video'],               false, 86),
  ('pet_travel_consult',    'specialized', 'Pet-Travel Planning Consult', 'Bringing the dog, done right.',                             ARRAY['written'],                    false, 87)
ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true;
