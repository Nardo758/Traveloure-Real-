-- Master Integration Brief — Phase 1.2a: categoryKey column on service_categories.
--
-- The brief's whole integration (service_offering_types, template_category_matrix,
-- neighborhood_coverage_target, fee resolver) joins on categoryKey — never on the
-- legacy `slug`. So we add categoryKey as a distinct column.
--
-- The existing 28 legacy slugs (photography-videography, transportation-logistics, …)
-- stay UNTOUCHED: every FK and string-literal reference keeps working. The 24
-- brief categoryKeys (photography, private_transportation, …) populate the new
-- column via UPSERT in migration 034.
--
-- Legacy rows that have no brief equivalent (taskrabbit-services, health-wellness,
-- pets-animals, etc.) keep categoryKey NULL. They're outside the integration
-- taxonomy until someone maps them; their providers continue to work via FK.

ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS category_key VARCHAR(100);

-- UNIQUE in Postgres permits multiple NULLs by default, so legacy rows without
-- a brief mapping coexist with the brief's canonical 24.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_category_key
  ON service_categories(category_key)
  WHERE category_key IS NOT NULL;
