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
-- ────────────────────────────────────────────────────────────────────────────
-- CATEGORYKEY → LEGACY-ROW MAPPING (sanity-check this diff before 1.3)
-- ────────────────────────────────────────────────────────────────────────────
-- 15 UPSERTs (assign categoryKey + billing attrs to existing legacy rows):
--   private_transportation     ← transportation-logistics
--   tour_guide                 ← tours-experiences
--   photography                ← photography-videography      (split: videographer becomes new row)
--   accommodation              ← lodging-accommodation
--   dining_venue               ← restaurants-dining           (judgment call)
--   activity_provider          ← arts-crafts-instruction      (judgment call — closest semantic match: workshops, classes, instruction)
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
--   officiant                  (cultural-educational kept as legacy; officiant is its own row per brief §4)
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

-- ─── UPSERTS: assign categoryKey + billing attrs to legacy rows ──────────────
UPDATE service_categories SET
  category_key = 'private_transportation',
  source_type = 'platform_provider', launch_tier = 'core',
  commission_band_key = 'commercial', insurance_band = 3,
  risk_profile = 'high', requires_background_check = true
WHERE slug = 'transportation-logistics';

UPDATE service_categories SET
  category_key = 'tour_guide',
  source_type = 'platform_provider', launch_tier = 'core',
  commission_band_key = 'limited', insurance_band = 1,
  risk_profile = 'low', requires_background_check = true
WHERE slug = 'tours-experiences';

UPDATE service_categories SET
  category_key = 'photography',
  source_type = 'platform_provider', launch_tier = 'core',
  commission_band_key = 'limited', insurance_band = 1,
  risk_profile = 'low', requires_background_check = false
WHERE slug = 'photography-videography';

UPDATE service_categories SET
  category_key = 'accommodation',
  source_type = 'platform_provider', launch_tier = 'secondary',
  commission_band_key = 'commercial', insurance_band = 3,
  risk_profile = 'high', requires_background_check = false
WHERE slug = 'lodging-accommodation';

UPDATE service_categories SET
  category_key = 'dining_venue',
  source_type = 'platform_provider', launch_tier = 'secondary',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'restaurants-dining';

-- activity_provider: corrected per user direction. Workshops / classes / cultural
-- experiences default to moderate risk; adventure/sport escalate at offering level.
UPDATE service_categories SET
  category_key = 'activity_provider',
  source_type = 'platform_provider', launch_tier = 'secondary',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'arts-crafts-instruction';

UPDATE service_categories SET
  category_key = 'private_chef',
  source_type = 'platform_provider', launch_tier = 'secondary',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = true
WHERE slug = 'food-culinary';

UPDATE service_categories SET
  category_key = 'concierge_vip',
  source_type = 'platform_provider', launch_tier = 'secondary',
  commission_band_key = 'limited', insurance_band = 1,
  risk_profile = 'low', requires_background_check = false
WHERE slug = 'personal-assistance';

UPDATE service_categories SET
  category_key = 'childcare_family',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = true
WHERE slug = 'childcare-family';

UPDATE service_categories SET
  category_key = 'event_coordinator',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'events-celebrations';

UPDATE service_categories SET
  category_key = 'florist',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'limited', insurance_band = 1,
  risk_profile = 'low', requires_background_check = false
WHERE slug = 'floral-decoration';

UPDATE service_categories SET
  category_key = 'entertainment',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'entertainment';

UPDATE service_categories SET
  category_key = 'hair_makeup',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'limited', insurance_band = 1,
  risk_profile = 'low', requires_background_check = false
WHERE slug = 'beauty-styling';

UPDATE service_categories SET
  category_key = 'av_tech',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'technical-services';

UPDATE service_categories SET
  category_key = 'rentals',
  source_type = 'platform_provider', launch_tier = 'segment',
  commission_band_key = 'moderate', insurance_band = 2,
  risk_profile = 'moderate', requires_background_check = false
WHERE slug = 'rental-services';

-- ─── INSERTS: new rows for categoryKeys without a legacy equivalent ──────────
INSERT INTO service_categories
  (name, slug, description, category_type, verification_required, is_active, sort_order,
   category_key, source_type, launch_tier, commission_band_key, insurance_band, risk_profile, requires_background_check)
VALUES
  ('Videographer', 'videographer', 'Videography for travel content, weddings, and events.',
   'service_provider', false, true, 100,
   'videographer', 'platform_provider', 'segment', 'limited', 1, 'low', false),
  ('Caterer', 'caterer', 'Catering for celebrations, events, private dinners.',
   'service_provider', false, true, 101,
   'caterer', 'platform_provider', 'segment', 'moderate', 2, 'moderate', false),
  ('Officiant', 'officiant', 'Wedding officiants — making it official.',
   'service_provider', true, true, 102,
   'officiant', 'platform_provider', 'segment', 'limited', 1, 'low', false),
  ('Accessibility Specialist', 'accessibility-specialist', 'Mobility & accessibility-aware guides and companions.',
   'service_provider', true, true, 103,
   'accessibility_specialist', 'platform_provider', 'segment', 'limited', 1, 'low', true),
  ('Printing & Materials', 'printing-materials', 'Calligrapher, print & signage for events.',
   'service_provider', false, true, 104,
   'printing_materials', 'platform_provider', 'segment', 'limited', 1, 'low', false),
  ('Affiliate: Activities', 'aff-activities', 'Affiliate inventory: activities & tours (Viator).',
   'service_provider', false, true, 200,
   'aff_activities', 'affiliate', 'core', NULL, NULL, 'low', false),
  ('Affiliate: Events', 'aff-events', 'Affiliate inventory: events (Fever).',
   'service_provider', false, true, 201,
   'aff_events', 'affiliate', 'secondary', NULL, NULL, 'low', false),
  ('Affiliate: Ground Transport', 'aff-ground-transport', 'Affiliate inventory: ground transport (12Go).',
   'service_provider', false, true, 202,
   'aff_ground_transport', 'affiliate', 'secondary', NULL, NULL, 'low', false),
  ('Affiliate: Air & Hotel', 'aff-air-hotel', 'Affiliate inventory: air + hotel (Amadeus).',
   'service_provider', false, true, 203,
   'aff_air_hotel', 'affiliate', 'secondary', NULL, NULL, 'low', false)
ON CONFLICT (slug) DO NOTHING;

UPDATE service_categories SET affiliate_partner_key = 'viator'  WHERE category_key = 'aff_activities';
UPDATE service_categories SET affiliate_partner_key = 'fever'   WHERE category_key = 'aff_events';
UPDATE service_categories SET affiliate_partner_key = '12go'    WHERE category_key = 'aff_ground_transport';
UPDATE service_categories SET affiliate_partner_key = 'amadeus' WHERE category_key = 'aff_air_hotel';
