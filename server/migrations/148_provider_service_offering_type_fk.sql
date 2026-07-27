-- 148: provider-side offering linkage (§17, ratified Jul 27 2026) — the mirror of migration 057.
--
-- The /earn page advertises ~96 in-person offerings (service_offering_types) but provider_services
-- had NO column recording which offering a listing IS — the earn-trace found every provider listing
-- "creatable but unlinked" (identity lost at create; the upsell engine could only match at category
-- granularity, so one listing "covered" every sibling offering). Experts got their linkage in 057
-- (expert_offering_type_id); this adds the provider analog.
--
-- Additive nullable + IF NOT EXISTS, ON DELETE SET NULL, no CHECK, no DEFAULT, no backfill →
-- no publish-time drizzle-push trap. Existing rows stay NULL (honest: their offering identity was
-- never captured); the offering-first ServiceForm (A4) writes it for new/edited listings.
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS service_offering_type_id uuid
    REFERENCES service_offering_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provider_services_service_offering_type
  ON provider_services (service_offering_type_id)
  WHERE service_offering_type_id IS NOT NULL;
