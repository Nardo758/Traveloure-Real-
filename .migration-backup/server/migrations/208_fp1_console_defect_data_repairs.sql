-- Migration 208 — FP-1 provider-console defect fix pack: the DATA half.
--
-- Evidence: docs/testing/PROVIDER_BATCH_EXERCISE.md (findings A1, B2, B4). This migration carries
-- ONLY data repairs — no new columns, no CHECK constraints, no indexes, no table creation. There is
-- therefore NOTHING for the Replit deploy-push to drop or reject (CLAUDE.md publish-trap rule), and
-- `node scripts/preflight-prod-constraints.cjs` is N/A for it (no declared CHECK is added).
--
-- Every statement is idempotent and predicate-guarded: re-running changes nothing, and a row an
-- admin has already corrected by hand is never clobbered.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 (A1, P0) — the "Custom / Other" service_categories row carries its category_key.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Migration 189 already ran this UPDATE. It is repeated here because on a FRESH database the order
-- of events defeats it: runMigrations() runs BEFORE runDatabaseSeeding() (server/index.ts), and the
-- "Custom / Other" row does not exist at migration time — it is created afterwards by
-- seedCategories() (server/seed-categories.ts), which projects an explicit column list that did not
-- include categoryKey, so the row was born with category_key = NULL. 189's UPDATE matched nothing.
--
-- Result on every database created since 189: service_offering_types.custom_other_offering points at
-- category_key='custom_other' while no service_categories row carries that key, so the provider
-- wizard's derived-category lock renders "—", formData.categoryId stays empty and Publish can never
-- enable (the S8 dead end in the batch exercise).
--
-- The durable fix is in the SEEDER (it now emits the key, so a fresh DB is born correct). This
-- statement repairs every database that already has the NULL row.
--
-- Guarded three ways: only a NULL/empty key is touched (an admin-assigned key is never overwritten);
-- the row is matched on the stable slug OR the display name; and the whole statement no-ops if any
-- row already holds 'custom_other' (idx_service_categories_category_key is UNIQUE where NOT NULL —
-- a blind UPDATE could otherwise fail the migration).
UPDATE service_categories
   SET category_key = 'custom_other', updated_at = now()
 WHERE (slug = 'custom-other' OR name = 'Custom / Other')
   AND (category_key IS NULL OR category_key = '')
   AND NOT EXISTS (SELECT 1 FROM service_categories c2 WHERE c2.category_key = 'custom_other');

-- Same seed as 189 — re-asserted so a database whose service_offering_types row is missing (or was
-- inserted before the category row carried its key) still has the picker's catch-all landing option.
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('custom_other_offering', 'custom_other', 'Something else / not listed',
   'Tell us what you do — request a new type', false, 999)
ON CONFLICT (offering_type_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 (B2, P1) — honest delivery_method on rows the Workstation builders created.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- provider_services.delivery_method DEFAULTs to 'pdf' (shared/schema.ts:731). The property, room
-- and bundle builders (server/routes/provider.routes.ts) never set the column, so every one of
-- those rows took the default — and the traveler-facing storefront card for a 1912 machiya guest
-- room read "PDF guide". The writers now set an honest value at create; this repairs the rows
-- already on disk.
--
-- THE PREDICATE, STATED (§13). Only rows that (a) carry one of the three Workstation-owned product
-- shapes AND (b) still hold the literal column DEFAULT 'pdf' are touched. A property or bundle whose
-- owner deliberately edited the method to something else is not in the set; nothing outside those
-- three shapes is in the set (an ordinary pdf service listing is a real pdf listing and is left
-- alone). Values come from the canonical 7 only (CLAUDE.md §3, deliveryMethodEnum).
--
-- 2a. Property + room: an accommodation is consumed at the place it is (place-anchored stay).
UPDATE provider_services
   SET delivery_method = 'in_person', updated_at = now()
 WHERE product_shape IN ('property', 'property_room')
   AND delivery_method = 'pdf';

-- 2b. Bundle: DERIVED from the components it actually contains — the uniform method when every
-- component agrees, otherwise 'hybrid' (a mixed bundle is genuinely mixed; the canonical vocabulary
-- has exactly one word for that). A bundle whose components carry no method at all is NOT derivable
-- and is deliberately left as-is rather than guessed (§13); bundle_components requires ≥2 approved
-- components at create, so that case is theoretical.
UPDATE provider_services b
   SET delivery_method = d.derived, updated_at = now()
  FROM (
    SELECT bc.bundle_service_id AS bundle_id,
           CASE WHEN COUNT(DISTINCT c.delivery_method) = 1
                THEN MIN(c.delivery_method)
                ELSE 'hybrid'
           END AS derived
      FROM bundle_components bc
      JOIN provider_services c ON c.id = bc.component_service_id
     WHERE c.delivery_method IS NOT NULL
     GROUP BY bc.bundle_service_id
  ) d
 WHERE b.id = d.bundle_id
   AND b.product_shape = 'bundle'
   AND b.delivery_method = 'pdf';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 (B4, P1) — provider_services.city from the ONE structured source that exists.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Migration 129 added `city` and backfilled it from a city_neighborhoods match, but guarded the
-- whole UPDATE on `ps.latitude IS NULL` (it was primarily a COORDINATE backfill), and nothing on
-- the write path has ever set the column since. So every listing created after 129 carries
-- city = NULL, and the market page's city scoping falls back to substring-matching the free-text
-- `location` column — which is the literal default 'Unknown' for any delivery method whose form
-- never renders a service-area input.
--
-- THE RULE, STATED (§13 — no fuzzy backfill). A row's city is derived ONLY from
-- provider_services.neighborhood, which is a soft reference into city_neighborhoods.slug, and ONLY
-- when that slug resolves to exactly ONE city. Note city_neighborhoods' uniqueness constraint is
-- (city, country, slug) — slug is NOT globally unique by schema — so the `n = 1` guard below is
-- load-bearing: a slug used by two cities is AMBIGUOUS and the row keeps its honest NULL. Free-text
-- `location` is NEVER parsed here; no name matching, no substring matching, no city-centre default.
-- A row with no neighborhood keeps city = NULL and is honestly absent from every city payload
-- rather than being guessed into the wrong one.
UPDATE provider_services ps
   SET city = m.city, updated_at = now()
  FROM (
    SELECT src.id AS ps_id, u.city
      FROM provider_services src
      JOIN (
        SELECT LOWER(TRIM(slug)) AS slug_key,
               MIN(city) AS city,
               COUNT(DISTINCT city) AS n
          FROM city_neighborhoods
         GROUP BY LOWER(TRIM(slug))
      ) u ON u.slug_key = LOWER(TRIM(src.neighborhood)) AND u.n = 1
     WHERE src.neighborhood IS NOT NULL
       AND TRIM(src.neighborhood) <> ''
       AND src.city IS NULL
  ) m
 WHERE ps.id = m.ps_id
   AND ps.city IS NULL;  -- idempotent: a second run finds nothing to do
