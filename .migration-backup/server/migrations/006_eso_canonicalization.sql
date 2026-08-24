-- Migration 006: ESO Canonicalization
-- Makes expert_service_offerings the canonical service catalog.
-- Adds expert_id (nullable) to scope expert-owned offerings, and external_id
-- to link back to the originating service_templates / expert_custom_services row
-- for deterministic deduplication (replaces name-only matching).

ALTER TABLE expert_service_offerings
  ADD COLUMN IF NOT EXISTS expert_id  VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS external_id VARCHAR;

COMMENT ON COLUMN expert_service_offerings.expert_id IS
  'NULL = platform template; non-NULL = expert-owned service offering';

COMMENT ON COLUMN expert_service_offerings.external_id IS
  'Source row ID from service_templates or expert_custom_services (deduplication key)';

CREATE INDEX IF NOT EXISTS idx_eso_expert_id    ON expert_service_offerings(expert_id);
CREATE INDEX IF NOT EXISTS idx_eso_external_id  ON expert_service_offerings(external_id);
