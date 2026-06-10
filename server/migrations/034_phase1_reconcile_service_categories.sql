-- Ensure id has a default so INSERTs below don't need explicit UUIDs.
ALTER TABLE service_categories ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Master Integration Brief — Phase 1.2c: reconcile service_categories with SEED_DATA §2.
--
-- activity_provider correction (user-flagged): commissionBand=moderate (not commercial),
-- insuranceBand=2 (not 3), riskProfile=moderate (not high). Pottery, tea ceremony,
-- cooking workshops are not high-risk; adventure/sport variants escalate at the
-- offering-type level per base taxonomy spec. Risk=high would suppress these for
-- family / low-mobility trips in the upsell engine — exactly backwards (a craft
-- workshop is the family-friendly option). Folded into 034 directly (no separate
-- fix migration) since 034 is recreated fresh.
--
-- IDEMPOTENCY NOTE: Original 034 used UPDATE WHERE slug for 15 legacy rows plus
-- INSERT for 9 new rows. On a fresh CI database (after drizzle-kit push) the
-- service_categories table is empty, so the UPDATEs were no-ops and the 15 legacy
-- category_keys were never assigned. Fixed to use a single UPSERT covering all 24
-- rows so the migration is correct on both pre-populated and fresh databases.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CATEGORYKEY → LEGACY-ROW MAPPING (sanity-check this diff before 1.3)
-- ────────────────────────────────────────────────────────────────────────────
-- 15 UPSERTs (assign categoryKey + billing attrs to existing legacy rows):
--   private_transportation     ← transportation-logistics
--   tour_guide                 ← tours-experiences
--   photography                ← photography-videography      (split: videographer becomes new row)
--   accommodation              ← lodging-accommodation
--   dining_venue               ← restaurants-dining           (judgment call)
--   activity_provider          ← arts-crafts-instruction      (judgment call)
--   private_chef               ← food-culinary                (split: caterer becomes new row)
--   concierge_vip              ← personal-assistance          (user-confirmed pairing)
--   childcare_family           ← childcare-family
--   event_coordinator          ← events-celebrations
--   florist                    ← floral-decoration
--   entertainment              ← entertainment                (exact match)
--   hair_makeup                ← beauty-styling
--   av_tech                    ← technical-services
--   rentals                    ← rental-services
--
-- 9 INSERTs (new rows for categoryKeys with no legacy equivalent):
--   videographer               (split from photography-videography)
--   caterer                    (split from food-culinary)
--   officiant
--   accessibility_specialist
--   printing_materials
--   aff_activities             affiliate / viator    / launchTier=core
--   aff_events                 affiliate / fever     / launchTier=secondary
--   aff_ground_transport       affiliate / 12go      / launchTier=secondary
--   aff_air_hotel              affiliate / amadeus   / launchTier=secondary
--
-- 14 legacy rows UNTOUCHED (categoryKey stays NULL — outside brief taxonomy):
--   taskrabbit-services, health-wellness, pets-animals, technology-connectivity,
--   language-translation, specialty-services, custom-other, music-performance,
--   cultural-educational, companionship-assistance, attire-fashion, safety-security,
--   business-professional.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── UPSERT: all 24 rows in one pass ─────────────────────────────────────────
-- INSERT creates the row when it doesn't exist (fresh CI DB after drizzle-kit push).
-- ON CONFLICT (slug) DO UPDATE assigns category_key + billing attrs on existing rows.
INSERT INTO service_categories
  (name, slug, description, category_type, verification_required, is_active, sort_order,
   category_key, source_type, launch_tier, commission_band_key, insurance_band,
   risk_profile, requires_background_check)
VALUES
  -- ── 15 legacy rows ────────────────────────────────────────────────────────
  ('Transportation & Logistics',   'transportation-logistics',
   'Private drivers, airport transfers, day trips, specialty transport',
   'service_provider', true,  true, 2,
   'private_transportation', 'platform_provider', 'core',      'commercial', 3, 'high',     true),

  ('Tours & Experiences',          'tours-experiences',
   'Tour guides, walking tours, museum tours, adventure guides, cultural experiences',
   'hybrid',           true,  true, 5,
   'tour_guide',        'platform_provider', 'core',      'limited',    1, 'low',      true),

  ('Photography & Videography',    'photography-videography',
   'Portrait, event, engagement, family, architectural photography and travel videos, drone footage',
   'service_provider', true,  true, 1,
   'photography',       'platform_provider', 'core',      'limited',    1, 'low',      false),

  ('Lodging & Accommodation',      'lodging-accommodation',
   'Vacation rentals, B&Bs, homestays, glamping, houseboat rentals, room hosts',
   'service_provider', true,  true, 16,
   'accommodation',     'platform_provider', 'secondary', 'commercial', 3, 'high',     false),

  ('Restaurants & Dining',         'restaurants-dining',
   'Restaurants, dining experiences, private dining, food and drink venues',
   'service_provider', true,  true, 28,
   'dining_venue',      'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),

  ('Arts & Crafts Instruction',    'arts-crafts-instruction',
   'Painting, pottery, jewelry making, dance, calligraphy, woodworking, drawing, photography instruction',
   'service_provider', false, true, 20,
   'activity_provider', 'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),

  ('Food & Culinary',              'food-culinary',
   'Private chefs, cooking lessons, meal prep, sommelier services, food tours',
   'service_provider', true,  true, 3,
   'private_chef',      'platform_provider', 'secondary', 'moderate',   2, 'moderate', true),

  ('Personal Assistance',          'personal-assistance',
   'Travel companions, personal concierge, executive assistants',
   'service_provider', true,  true, 6,
   'concierge_vip',     'platform_provider', 'secondary', 'limited',    1, 'low',      false),

  ('Childcare & Family',           'childcare-family',
   'Babysitters, nannies, kids activity coordinators, family assistants',
   'service_provider', true,  true, 4,
   'childcare_family',  'platform_provider', 'segment',   'moderate',   2, 'moderate', true),

  ('Events & Celebrations',        'events-celebrations',
   'Event coordinators, florists, bakers, party planners',
   'service_provider', false, true, 11,
   'event_coordinator', 'platform_provider', 'segment',   'moderate',   2, 'moderate', false),

  ('Floral & Decoration',          'floral-decoration',
   'Florists, floral designers, balloon artists, event stylists, backdrop designers, centerpiece designers',
   'service_provider', false, true, 19,
   'florist',           'platform_provider', 'segment',   'limited',    1, 'low',      false),

  ('Entertainment',                'entertainment',
   'Comedians, magicians, acrobats, fire performers, caricature artists, game coordinators, kids entertainers',
   'service_provider', false, true, 18,
   'entertainment',     'platform_provider', 'segment',   'moderate',   2, 'moderate', false),

  ('Beauty & Styling',             'beauty-styling',
   'Hair stylists, makeup artists, personal stylists',
   'service_provider', false, true, 9,
   'hair_makeup',       'platform_provider', 'segment',   'limited',    1, 'low',      false),

  ('Technical Services',           'technical-services',
   'Audio engineers, lighting technicians, sound systems, LED screen operators, projection mapping, visual effects',
   'service_provider', false, true, 27,
   'av_tech',           'platform_provider', 'segment',   'moderate',   2, 'moderate', false),

  ('Rental Services',              'rental-services',
   'Bicycle, car, scooter, boat, camping, beach equipment, sports equipment, costume and baby equipment rentals',
   'service_provider', true,  true, 22,
   'rentals',           'platform_provider', 'segment',   'moderate',   2, 'moderate', false),

  -- ── 9 new rows ────────────────────────────────────────────────────────────
  ('Videographer',                 'videographer',
   'Videography for travel content, weddings, and events.',
   'service_provider', false, true, 100,
   'videographer',      'platform_provider', 'segment',   'limited',    1, 'low',      false),

  ('Caterer',                      'caterer',
   'Catering for celebrations, events, private dinners.',
   'service_provider', false, true, 101,
   'caterer',           'platform_provider', 'segment',   'moderate',   2, 'moderate', false),

  ('Officiant',                    'officiant',
   'Wedding officiants — making it official.',
   'service_provider', true,  true, 102,
   'officiant',         'platform_provider', 'segment',   'limited',    1, 'low',      false),

  ('Accessibility Specialist',     'accessibility-specialist',
   'Mobility & accessibility-aware guides and companions.',
   'service_provider', true,  true, 103,
   'accessibility_specialist', 'platform_provider', 'segment', 'limited', 1, 'low',   true),

  ('Printing & Materials',         'printing-materials',
   'Calligrapher, print & signage for events.',
   'service_provider', false, true, 104,
   'printing_materials', 'platform_provider', 'segment',  'limited',    1, 'low',      false),

  ('Affiliate: Activities',        'aff-activities',
   'Affiliate inventory: activities & tours (Viator).',
   'service_provider', false, true, 200,
   'aff_activities',    'affiliate',          'core',      NULL,         NULL, 'low',   false),

  ('Affiliate: Events',            'aff-events',
   'Affiliate inventory: events (Fever).',
   'service_provider', false, true, 201,
   'aff_events',        'affiliate',          'secondary', NULL,         NULL, 'low',   false),

  ('Affiliate: Ground Transport',  'aff-ground-transport',
   'Affiliate inventory: ground transport (12Go).',
   'service_provider', false, true, 202,
   'aff_ground_transport', 'affiliate',       'secondary', NULL,         NULL, 'low',   false),

  ('Affiliate: Air & Hotel',       'aff-air-hotel',
   'Affiliate inventory: air + hotel (Amadeus).',
   'service_provider', false, true, 203,
   'aff_air_hotel',     'affiliate',          'secondary', NULL,         NULL, 'low',   false)

ON CONFLICT (slug) DO UPDATE SET
  category_key              = EXCLUDED.category_key,
  source_type               = EXCLUDED.source_type,
  launch_tier               = EXCLUDED.launch_tier,
  commission_band_key       = EXCLUDED.commission_band_key,
  insurance_band            = EXCLUDED.insurance_band,
  risk_profile              = EXCLUDED.risk_profile,
  requires_background_check = EXCLUDED.requires_background_check;

UPDATE service_categories SET affiliate_partner_key = 'viator'  WHERE category_key = 'aff_activities';
UPDATE service_categories SET affiliate_partner_key = 'fever'   WHERE category_key = 'aff_events';
UPDATE service_categories SET affiliate_partner_key = '12go'    WHERE category_key = 'aff_ground_transport';
UPDATE service_categories SET affiliate_partner_key = 'amadeus' WHERE category_key = 'aff_air_hotel';
