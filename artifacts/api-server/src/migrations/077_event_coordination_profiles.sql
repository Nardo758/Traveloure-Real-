-- Migration 077: Event Coordination Profiles (Phase 4 / CON-A.P4)
-- Create the config-driven table and seed event-type profiles for wedding, proposal,
-- birthday, and corporate. The generic event-coordination.service.ts reads these
-- rows to build timelines, vendor matrices, and sequencing — no per-event-type code.

-- Create table
CREATE TABLE IF NOT EXISTS event_coordination_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,
  anchor_type TEXT NOT NULL,
  vendor_matrix JSONB DEFAULT '[]',
  sequencing_ruleset JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Wedding profile (generalized from wedding-coordination.service.ts)
INSERT INTO event_coordination_profiles (event_type, anchor_type, vendor_matrix, sequencing_ruleset) VALUES
('wedding', 'ceremony_time', '[
  {"category":"photographer",    "required":true,  "priority":"critical", "label":"Photographer",    "blocks":["first_look","bridal_portraits","ceremony","reception_start"]},
  {"category":"officiant",       "required":true,  "priority":"critical", "label":"Officiant",       "blocks":["ceremony"]},
  {"category":"caterer",         "required":true,  "priority":"critical", "label":"Caterer",         "blocks":["cocktail_hour","dinner"]},
  {"category":"coordinator",     "required":true,  "priority":"high",    "label":"Coordinator",     "blocks":["hair_makeup","ceremony","reception_start","send_off"]},
  {"category":"florist",         "required":false, "priority":"high",    "label":"Florist",         "blocks":["ceremony","reception_start"]},
  {"category":"dj_band",         "required":false, "priority":"high",    "label":"DJ / Band",       "blocks":["cocktail_hour","reception_start","dancing"]},
  {"category":"hair_makeup",     "required":false, "priority":"high",    "label":"Hair & Makeup",   "blocks":["hair_makeup"]},
  {"category":"videographer",    "required":false, "priority":"medium",  "label":"Videographer",    "blocks":["ceremony","reception_start","first_dance"]},
  {"category":"cake_bakery",     "required":false, "priority":"medium",  "label":"Cake Bakery",     "blocks":["cake_cutting"]},
  {"category":"transportation",  "required":false, "priority":"medium",  "label":"Transportation",  "blocks":["guest_arrival","send_off"]},
  {"category":"entertainment",   "required":false, "priority":"low",     "label":"Entertainment",   "blocks":["cocktail_hour","dancing"]},
  {"category":"av_tech",         "required":false, "priority":"low",     "label":"AV Tech",         "blocks":["ceremony","reception_start","speeches"]},
  {"category":"rental_company",  "required":false, "priority":"low",     "label":"Rental Company",  "blocks":["reception_start"]}
]'::jsonb, '[
  {"key":"hair_makeup",      "label":"Hair & Makeup",      "offset":-420, "duration":180, "isLocked":false},
  {"key":"getting_ready",    "label":"Getting Ready",        "offset":-240, "duration":60,  "isLocked":false},
  {"key":"first_look",       "label":"First Look Photos",    "offset":-180, "duration":30,  "isLocked":false},
  {"key":"bridal_portraits", "label":"Bridal Portraits",     "offset":-150, "duration":60,  "isLocked":false},
  {"key":"guest_arrival",    "label":"Guest Arrival",        "offset":-30,  "duration":30,  "isLocked":false},
  {"key":"ceremony",         "label":"Ceremony",             "offset":0,    "duration":30,  "isLocked":true},
  {"key":"cocktail_hour",    "label":"Cocktail Hour",        "offset":30,   "duration":60,  "isLocked":false},
  {"key":"reception_start",  "label":"Grand Entrance",       "offset":90,   "duration":30,  "isLocked":false},
  {"key":"dinner",           "label":"Dinner",               "offset":120,  "duration":90,  "isLocked":false},
  {"key":"speeches",         "label":"Speeches & Toasts",    "offset":210,  "duration":30,  "isLocked":false},
  {"key":"first_dance",      "label":"First Dance",          "offset":240,  "duration":15,  "isLocked":false},
  {"key":"cake_cutting",     "label":"Cake Cutting",         "offset":255,  "duration":15,  "isLocked":false},
  {"key":"dancing",          "label":"Dancing & Party",      "offset":270,  "duration":120, "isLocked":false},
  {"key":"send_off",         "label":"Send-off",             "offset":390,  "duration":15,  "isLocked":false}
]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
  anchor_type = EXCLUDED.anchor_type,
  vendor_matrix = EXCLUDED.vendor_matrix,
  sequencing_ruleset = EXCLUDED.sequencing_ruleset,
  is_active = true;

-- Seed Proposal profile
INSERT INTO event_coordination_profiles (event_type, anchor_type, vendor_matrix, sequencing_ruleset) VALUES
('proposal', 'proposal_moment', '[
  {"category":"photographer",    "required":true,  "priority":"critical", "label":"Photographer",    "blocks":["proposal_moment","post_proposal"]},
  {"category":"coordinator",     "required":true,  "priority":"high",    "label":"Coordinator",     "blocks":["scout","setup","proposal_moment"]},
  {"category":"florist",         "required":false, "priority":"high",    "label":"Florist",         "blocks":["setup","proposal_moment"]},
  {"category":"musician",        "required":false, "priority":"medium",  "label":"Musician",        "blocks":["proposal_moment"]},
  {"category":"caterer",         "required":false, "priority":"medium",  "label":"Caterer / Venue", "blocks":["dinner"]},
  {"category":"videographer",    "required":false, "priority":"low",     "label":"Videographer",    "blocks":["proposal_moment","post_proposal"]},
  {"category":"transportation",  "required":false, "priority":"low",     "label":"Transportation",  "blocks":["scout","send_off"]}
]'::jsonb, '[
  {"key":"scout",              "label":"Scout Location",       "offset":-180, "duration":60,  "isLocked":false},
  {"key":"setup",              "label":"Setup Décor",            "offset":-120, "duration":60,  "isLocked":false},
  {"key":"proposal_moment",    "label":"The Proposal",           "offset":0,    "duration":30,  "isLocked":true},
  {"key":"post_proposal",      "label":"Photos / Celebration",   "offset":30,   "duration":60,  "isLocked":false},
  {"key":"dinner",             "label":"Dinner / Celebration",   "offset":90,   "duration":120, "isLocked":false},
  {"key":"send_off",           "label":"Send-off",               "offset":240,  "duration":15,  "isLocked":false}
]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
  anchor_type = EXCLUDED.anchor_type,
  vendor_matrix = EXCLUDED.vendor_matrix,
  sequencing_ruleset = EXCLUDED.sequencing_ruleset,
  is_active = true;

-- Seed Birthday profile
INSERT INTO event_coordination_profiles (event_type, anchor_type, vendor_matrix, sequencing_ruleset) VALUES
('birthday', 'main_event', '[
  {"category":"caterer",         "required":true,  "priority":"critical", "label":"Caterer / Venue", "blocks":["setup","main_event"]},
  {"category":"coordinator",     "required":true,  "priority":"high",    "label":"Coordinator",     "blocks":["setup","main_event","cleanup"]},
  {"category":"dj_band",         "required":false, "priority":"high",    "label":"DJ / Band",       "blocks":["main_event"]},
  {"category":"florist",         "required":false, "priority":"medium",  "label":"Florist / Décor", "blocks":["setup"]},
  {"category":"photographer",    "required":false, "priority":"medium",  "label":"Photographer",    "blocks":["main_event"]},
  {"category":"cake_bakery",     "required":false, "priority":"medium",  "label":"Cake Bakery",     "blocks":["cake_moment"]},
  {"category":"entertainment",   "required":false, "priority":"low",     "label":"Entertainment",   "blocks":["main_event"]},
  {"category":"transportation",  "required":false, "priority":"low",     "label":"Transportation",  "blocks":["guest_arrival"]}
]'::jsonb, '[
  {"key":"setup",         "label":"Setup",            "offset":-120, "duration":90,  "isLocked":false},
  {"key":"guest_arrival", "label":"Guest Arrival",    "offset":-30,  "duration":30,  "isLocked":false},
  {"key":"main_event",    "label":"Main Event",       "offset":0,    "duration":180, "isLocked":true},
  {"key":"cake_moment",   "label":"Cake Moment",      "offset":210,  "duration":15,  "isLocked":false},
  {"key":"cleanup",       "label":"Cleanup",            "offset":240,  "duration":60,  "isLocked":false}
]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
  anchor_type = EXCLUDED.anchor_type,
  vendor_matrix = EXCLUDED.vendor_matrix,
  sequencing_ruleset = EXCLUDED.sequencing_ruleset,
  is_active = true;

-- Seed Corporate profile
INSERT INTO event_coordination_profiles (event_type, anchor_type, vendor_matrix, sequencing_ruleset) VALUES
('corporate', 'keynote_time', '[
  {"category":"av_tech",         "required":true,  "priority":"critical", "label":"AV Tech",         "blocks":["setup","keynote_time","presentations"]},
  {"category":"caterer",         "required":true,  "priority":"critical", "label":"Caterer",         "blocks":["breakfast","lunch","networking"]},
  {"category":"coordinator",     "required":true,  "priority":"high",    "label":"Coordinator",     "blocks":["setup","keynote_time","presentations","networking","cleanup"]},
  {"category":"photographer",    "required":false, "priority":"medium",  "label":"Photographer",    "blocks":["keynote_time","presentations"]},
  {"category":"videographer",    "required":false, "priority":"medium",  "label":"Videographer",    "blocks":["keynote_time","presentations"]},
  {"category":"transportation",  "required":false, "priority":"low",     "label":"Transportation",  "blocks":["guest_arrival"]},
  {"category":"entertainment",   "required":false, "priority":"low",     "label":"Entertainment",   "blocks":["networking"]}
]'::jsonb, '[
  {"key":"setup",          "label":"Setup / AV Check",   "offset":-120, "duration":90,  "isLocked":false},
  {"key":"guest_arrival",  "label":"Guest Arrival",      "offset":-30,  "duration":30,  "isLocked":false},
  {"key":"breakfast",      "label":"Breakfast",          "offset":0,    "duration":60,  "isLocked":false},
  {"key":"keynote_time",   "label":"Keynote",            "offset":60,   "duration":60,  "isLocked":true},
  {"key":"presentations",  "label":"Breakout Sessions",  "offset":120,  "duration":120, "isLocked":false},
  {"key":"lunch",          "label":"Lunch",              "offset":240,  "duration":60,  "isLocked":false},
  {"key":"networking",     "label":"Networking / Mixer", "offset":300,  "duration":120, "isLocked":false},
  {"key":"cleanup",        "label":"Cleanup",            "offset":420,  "duration":60,  "isLocked":false}
]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
  anchor_type = EXCLUDED.anchor_type,
  vendor_matrix = EXCLUDED.vendor_matrix,
  sequencing_ruleset = EXCLUDED.sequencing_ruleset,
  is_active = true;
