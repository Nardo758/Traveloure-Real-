-- 289 — REPAIR of migration 034 on databases that ran its PRE-UPSERT form.
-- Ledger `2026-09-06-category-key-repair`; CLAUDE.md Locked Decision 31 (as amended by
-- `2026-09-04-venue-category`). Registry entry: `scripts/lib/taxonomy-registry.cjs`
-- `TAXONOMY_MIGRATIONS` + `TAXONOMY_REPAIRS` (repair-of: 034).
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- Migration 034's ORIGINAL form was `UPDATE … WHERE slug = …` for 15 legacy rows plus `INSERT`
-- for 9 new ones. It assigned NOTHING where a slug did not match and nothing where the legacy row
-- was absent. 034's own header records that it was later REPAIRED to a single UPSERT — but a
-- stamped migration NEVER RE-RUNS, so every database that applied the pre-repair form still carries
-- the pre-repair outcome. Production does: `GET /api/service-categories` returns 27 rows of which
-- exactly TWO carry a `category_key` (`custom_other`, from the 189/208 name-keyed backfills, and
-- `venue`, from migration 285). The other 25 are NULL, and there is no row at all behind
-- `florist` / `caterer` / `officiant`.
--
-- WHAT THAT BREAKS. `experience_types.roles_needed` (Locked Decision 31) names disciplines as
-- `service_categories.category_key` values, and the slip's event-header role chips (Locked
-- Decision 42 D6) link to `/services?categoryKey=<key>`. With the column NULL, every one of those
-- chips but `venue` resolves to no category — the browse honestly reports "this catalog has no
-- <key> category to filter by", which is the §13-correct rendering of a taxonomy that is not there.
-- The taxonomy is what is broken, not the reader.
--
-- WHAT THIS FILE IS NOT
-- ─────────────────────
--  • NOT a new taxonomy. It assigns EXACTLY the 24 keys migration 034 owns, with 034's own values.
--    It does NOT touch `venue` (migration 285's key) and introduces NO key of its own. The registry
--    refuses a key claimed by two migrations, which is why this file is registered as a REPAIR of
--    034 rather than as a second authority — see the registry module's header.
--  • NOT DDL. No ALTER, no CHECK, no index, no DEFAULT change, no new table. `preflight-prod-
--    constraints.cjs` is therefore unaffected and the Replit deploy-push has nothing to fail on
--    (CLAUDE.md "Coordination Prevention" → the publish-time CHECK-failure trap).
--  • NOT an overwrite. Every write is guarded by `category_key IS NULL`; an admin-tuned band, sort
--    order, copy or partner key is never clobbered (migration 285's posture, not 034's DO UPDATE).
--
-- HOW IT MATCHES, AND WHAT IT CANNOT MATCH (§13 — the negative space is part of the ruling)
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Production's slugs are UNKNOWN to the author of this file (the sandbox cannot reach production),
-- so the repair matches on two identifiers, in this order, and stops:
--   PASS A — `slug` (UNIQUE in `shared/schema.ts`).
--   PASS B — `lower(btrim(name))` (`name` is UNIQUE and NOT NULL in `shared/schema.ts`), for the
--            row whose slug drifted away from 034's expectation.
--   PASS C — INSERT, and ONLY where neither identifier is already on the table.
-- A row whose slug AND name have BOTH drifted is UNREACHABLE by this migration: pass C will create
-- 034's canonical row beside it rather than repair it. That case is NOT silently guessed at — it is
-- what `scripts/preview-category-key-repair.cjs` reports as `would-insert`, to be read by a human
-- against the real database BEFORE this migration is published. There is no fuzzy matching here and
-- none is wanted: a category the platform mis-identifies is worse than one it says it cannot find.
--
-- ONE DELIBERATE DELTA FROM 034: THE AFFILIATE ROWS' BAND (§8 — a band key, never a rate)
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 034 wrote `commission_band_key = NULL` for the four `aff_*` rows. Migration 180 later BACKFILLED
-- every unbanded category and then made the column NOT NULL, so re-writing 034's NULL here would
-- abort the migration (23502) — and, because NOT NULL is evaluated before ON CONFLICT arbitration,
-- it would abort even on a database where every row already exists. So the four carry `moderate`,
-- which is EXACTLY the value migration 180 gave them, for 180's own stated reason: the band is
-- INERT for affiliate rows (an affiliate booking resolves `affiliate_standard` via
-- `source="affiliate"`, never through this column) and exists only to satisfy that NOT NULL. This
-- is a band KEY into the existing `fee_bands` seed, not a rate literal, and it states nothing about
-- affiliate economics.
--
-- WHAT MAKES A DUPLICATE CATEGORY IMPOSSIBLE HERE (all three declared in `shared/schema.ts`)
-- ─────────────────────────────────────────────────────────────────────────────────────────
--   • `idx_service_categories_category_key` — UNIQUE on `category_key` WHERE NOT NULL. Two rows can
--     never carry one key, so the thing this file assigns can never be duplicated.
--   • `service_categories_name_unique` and `service_categories_slug_unique`.
-- Pass C's untargeted `ON CONFLICT DO NOTHING` arbitrates against all three. The residual case it
-- cannot repair is a row that carries 034's slug or name while ALREADY holding a DIFFERENT
-- `category_key`: passes A and B skip it (their guard is `category_key IS NULL`) and pass C is
-- skipped by that row's slug/name. Nothing duplicates, and nothing is repaired either — the
-- preview reports that row as a CONFLICT and exits non-zero, which is where it belongs.
--
-- IDEMPOTENT BY CONSTRUCTION. Every pass is a no-op once the key is assigned: A and B require
-- `category_key IS NULL` and that no row already carries the key; C conflicts on `name`/`slug`. On
-- a healthy database (CI, or any prod that got 034's repaired UPSERT) this file changes NOTHING.
--
-- ORDERING NOTE. A and B run BEFORE C so an existing row is REPAIRED rather than shadowed. The
-- passes are separate statements — not one `OR` — precisely so that a map entry whose slug matches
-- one row and whose name matches a DIFFERENT row can assign its key to exactly one of them (the
-- slug row) instead of both: pass B's `NOT EXISTS (… category_key = …)` guard sees pass A's result.

-- ─── PASS A — repair by SLUG ────────────────────────────────────────────────────────────────────
-- Billing attributes are COALESCEd, never assigned: `category_key` is the thing that was never
-- written; a band or risk profile an admin has since tuned is that admin's answer, not 034's.
UPDATE service_categories sc
SET category_key              = m.category_key,
    source_type               = COALESCE(sc.source_type, m.source_type),
    launch_tier               = COALESCE(sc.launch_tier, m.launch_tier),
    commission_band_key       = COALESCE(sc.commission_band_key, m.commission_band_key),
    insurance_band            = COALESCE(sc.insurance_band, m.insurance_band),
    risk_profile              = COALESCE(sc.risk_profile, m.risk_profile),
    requires_background_check = COALESCE(sc.requires_background_check, m.requires_background_check),
    updated_at                = NOW()
FROM (VALUES
  ('transportation-logistics',  'Transportation & Logistics',  'private_transportation',   'platform_provider'::varchar, 'core'::varchar,      'commercial'::varchar, 3::integer, 'high'::varchar,     true::boolean),
  ('tours-experiences',         'Tours & Experiences',         'tour_guide',               'platform_provider', 'core',      'limited',    1, 'low',      true),
  ('photography-videography',   'Photography & Videography',   'photography',              'platform_provider', 'core',      'limited',    1, 'low',      false),
  ('lodging-accommodation',     'Lodging & Accommodation',     'accommodation',            'platform_provider', 'secondary', 'commercial', 3, 'high',     false),
  ('restaurants-dining',        'Restaurants & Dining',        'dining_venue',             'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),
  ('arts-crafts-instruction',   'Arts & Crafts Instruction',   'activity_provider',        'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),
  ('food-culinary',             'Food & Culinary',             'private_chef',             'platform_provider', 'secondary', 'moderate',   2, 'moderate', true),
  ('personal-assistance',       'Personal Assistance',         'concierge_vip',            'platform_provider', 'secondary', 'limited',    1, 'low',      false),
  ('childcare-family',          'Childcare & Family',          'childcare_family',         'platform_provider', 'segment',   'moderate',   2, 'moderate', true),
  ('events-celebrations',       'Events & Celebrations',       'event_coordinator',        'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('floral-decoration',         'Floral & Decoration',         'florist',                  'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('entertainment',             'Entertainment',               'entertainment',            'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('beauty-styling',            'Beauty & Styling',            'hair_makeup',              'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('technical-services',        'Technical Services',          'av_tech',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('rental-services',           'Rental Services',             'rentals',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('videographer',              'Videographer',                'videographer',             'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('caterer',                   'Caterer',                     'caterer',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('officiant',                 'Officiant',                   'officiant',                'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('accessibility-specialist',  'Accessibility Specialist',    'accessibility_specialist', 'platform_provider', 'segment',   'limited',    1, 'low',      true),
  ('printing-materials',        'Printing & Materials',        'printing_materials',       'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('aff-activities',            'Affiliate: Activities',       'aff_activities',           'affiliate',         'core',      'moderate', NULL, 'low',      false),
  ('aff-events',                'Affiliate: Events',           'aff_events',               'affiliate',         'secondary', 'moderate', NULL, 'low',      false),
  ('aff-ground-transport',      'Affiliate: Ground Transport', 'aff_ground_transport',     'affiliate',         'secondary', 'moderate', NULL, 'low',      false),
  ('aff-air-hotel',             'Affiliate: Air & Hotel',      'aff_air_hotel',            'affiliate',         'secondary', 'moderate', NULL, 'low',      false)
) AS m(slug, name, category_key, source_type, launch_tier, commission_band_key,
       insurance_band, risk_profile, requires_background_check)
WHERE sc.slug = m.slug
  AND sc.category_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM service_categories x WHERE x.category_key = m.category_key);

-- ─── PASS B — repair by NAME (the row whose slug drifted) ───────────────────────────────────────
-- Same map, matched on `lower(btrim(name))`. `name` is UNIQUE NOT NULL, so this matches at most one
-- row per entry. The `NOT EXISTS` guard reads the table AFTER pass A, so a key pass A has already
-- placed is never placed a second time on another row.
UPDATE service_categories sc
SET category_key              = m.category_key,
    source_type               = COALESCE(sc.source_type, m.source_type),
    launch_tier               = COALESCE(sc.launch_tier, m.launch_tier),
    commission_band_key       = COALESCE(sc.commission_band_key, m.commission_band_key),
    insurance_band            = COALESCE(sc.insurance_band, m.insurance_band),
    risk_profile              = COALESCE(sc.risk_profile, m.risk_profile),
    requires_background_check = COALESCE(sc.requires_background_check, m.requires_background_check),
    updated_at                = NOW()
FROM (VALUES
  ('transportation-logistics',  'Transportation & Logistics',  'private_transportation',   'platform_provider'::varchar, 'core'::varchar,      'commercial'::varchar, 3::integer, 'high'::varchar,     true::boolean),
  ('tours-experiences',         'Tours & Experiences',         'tour_guide',               'platform_provider', 'core',      'limited',    1, 'low',      true),
  ('photography-videography',   'Photography & Videography',   'photography',              'platform_provider', 'core',      'limited',    1, 'low',      false),
  ('lodging-accommodation',     'Lodging & Accommodation',     'accommodation',            'platform_provider', 'secondary', 'commercial', 3, 'high',     false),
  ('restaurants-dining',        'Restaurants & Dining',        'dining_venue',             'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),
  ('arts-crafts-instruction',   'Arts & Crafts Instruction',   'activity_provider',        'platform_provider', 'secondary', 'moderate',   2, 'moderate', false),
  ('food-culinary',             'Food & Culinary',             'private_chef',             'platform_provider', 'secondary', 'moderate',   2, 'moderate', true),
  ('personal-assistance',       'Personal Assistance',         'concierge_vip',            'platform_provider', 'secondary', 'limited',    1, 'low',      false),
  ('childcare-family',          'Childcare & Family',          'childcare_family',         'platform_provider', 'segment',   'moderate',   2, 'moderate', true),
  ('events-celebrations',       'Events & Celebrations',       'event_coordinator',        'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('floral-decoration',         'Floral & Decoration',         'florist',                  'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('entertainment',             'Entertainment',               'entertainment',            'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('beauty-styling',            'Beauty & Styling',            'hair_makeup',              'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('technical-services',        'Technical Services',          'av_tech',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('rental-services',           'Rental Services',             'rentals',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('videographer',              'Videographer',                'videographer',             'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('caterer',                   'Caterer',                     'caterer',                  'platform_provider', 'segment',   'moderate',   2, 'moderate', false),
  ('officiant',                 'Officiant',                   'officiant',                'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('accessibility-specialist',  'Accessibility Specialist',    'accessibility_specialist', 'platform_provider', 'segment',   'limited',    1, 'low',      true),
  ('printing-materials',        'Printing & Materials',        'printing_materials',       'platform_provider', 'segment',   'limited',    1, 'low',      false),
  ('aff-activities',            'Affiliate: Activities',       'aff_activities',           'affiliate',         'core',      'moderate', NULL, 'low',      false),
  ('aff-events',                'Affiliate: Events',           'aff_events',               'affiliate',         'secondary', 'moderate', NULL, 'low',      false),
  ('aff-ground-transport',      'Affiliate: Ground Transport', 'aff_ground_transport',     'affiliate',         'secondary', 'moderate', NULL, 'low',      false),
  ('aff-air-hotel',             'Affiliate: Air & Hotel',      'aff_air_hotel',            'affiliate',         'secondary', 'moderate', NULL, 'low',      false)
) AS m(slug, name, category_key, source_type, launch_tier, commission_band_key,
       insurance_band, risk_profile, requires_background_check)
WHERE lower(btrim(sc.name)) = lower(m.name)
  AND sc.category_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM service_categories x WHERE x.category_key = m.category_key);

-- ─── PASS C — fill the rows that are ABSENT ─────────────────────────────────────────────────────
-- 034's own 24 tuples, byte-for-byte in copy and attributes, in 034's column order (the registry
-- parser is column-aware, but matching 034 keeps the two files readable side by side).
--
-- `ON CONFLICT DO NOTHING` is UNTARGETED on purpose. The obvious spelling — `ON CONFLICT (slug)` —
-- would still RAISE on the `name` UNIQUE that `shared/schema.ts:706` declares, and a raised
-- constraint at publish time is exactly the failure that offers the DESTRUCTIVE "copy dev database
-- over production" option (CLAUDE.md "Coordination Prevention"). The untargeted form covers every
-- unique constraint on the table, which is the whole point: after passes A and B, a conflict here
-- means "that category already exists under this identifier" and skipping is the correct answer.
INSERT INTO service_categories
  (name, slug, description, category_type, verification_required, is_active, sort_order,
   category_key, source_type, launch_tier, commission_band_key, insurance_band,
   risk_profile, requires_background_check)
VALUES
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
   'aff_activities',    'affiliate',          'core',      'moderate',   NULL, 'low',   false),

  ('Affiliate: Events',            'aff-events',
   'Affiliate inventory: events (Fever).',
   'service_provider', false, true, 201,
   'aff_events',        'affiliate',          'secondary', 'moderate',   NULL, 'low',   false),

  ('Affiliate: Ground Transport',  'aff-ground-transport',
   'Affiliate inventory: ground transport (12Go).',
   'service_provider', false, true, 202,
   'aff_ground_transport', 'affiliate',       'secondary', 'moderate',   NULL, 'low',   false),

  ('Affiliate: Air & Hotel',       'aff-air-hotel',
   'Affiliate inventory: air + hotel (Amadeus).',
   'service_provider', false, true, 203,
   'aff_air_hotel',     'affiliate',          'secondary', 'moderate',   NULL, 'low',   false)
ON CONFLICT DO NOTHING;

-- ─── Affiliate partner keys ────────────────────────────────────────────────────────────────────
-- 034 set these unconditionally; here they are written only where NOTHING has been recorded, so an
-- operator-corrected partner key survives the repair.
UPDATE service_categories SET affiliate_partner_key = 'viator'  WHERE category_key = 'aff_activities'       AND affiliate_partner_key IS NULL;
UPDATE service_categories SET affiliate_partner_key = 'fever'   WHERE category_key = 'aff_events'           AND affiliate_partner_key IS NULL;
UPDATE service_categories SET affiliate_partner_key = '12go'    WHERE category_key = 'aff_ground_transport' AND affiliate_partner_key IS NULL;
UPDATE service_categories SET affiliate_partner_key = 'amadeus' WHERE category_key = 'aff_air_hotel'        AND affiliate_partner_key IS NULL;
