-- Migration 057: Add expert_offering_type_id FK to provider_services
-- Links an expert listing to its canonical 5-tier offering type row.

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS expert_offering_type_id uuid
    REFERENCES expert_offering_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provider_services_expert_offering_type
  ON provider_services (expert_offering_type_id)
  WHERE expert_offering_type_id IS NOT NULL;
