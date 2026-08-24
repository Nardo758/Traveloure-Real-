-- Migration 013: Drop deprecated expert service tables and columns
--
-- Consolidation complete: provider_services is now the canonical service source.
-- All expert_custom_services data has been migrated to provider_services (migration 012).
-- expert_service_offerings workflow columns are deprecated and no longer written to.
-- expert_selected_services is no longer populated at signup (migration 012 auto-promotes
-- offerings to provider_services instead).
--
-- Safe to drop these after confirming in prod that no code still reads from them.
-- Migrations 010-012 must have run successfully before dropping.

-- 1. Remove workflow columns from expert_service_offerings (they're never written to)
ALTER TABLE expert_service_offerings
  DROP COLUMN IF EXISTS expert_id,
  DROP COLUMN IF EXISTS external_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS duration,
  DROP COLUMN IF EXISTS deliverables,
  DROP COLUMN IF EXISTS cancellation_policy,
  DROP COLUMN IF EXISTS lead_time,
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS gallery_images,
  DROP COLUMN IF EXISTS experience_types,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS category_name,
  DROP COLUMN IF EXISTS updated_at;

-- 2. Drop expert_selected_services table (no longer populated; replaced by auto-promotion)
DROP TABLE IF EXISTS expert_selected_services CASCADE;

-- 3. Drop expert_custom_services table (all data migrated to provider_services)
DROP TABLE IF EXISTS expert_custom_services CASCADE;

-- 4. expert_service_categories: intentionally NOT dropped here.
-- Migration 026 recreates it with its seed rows and restores the FK from
-- expert_service_offerings.category_id so orphaned rows are resolved.
