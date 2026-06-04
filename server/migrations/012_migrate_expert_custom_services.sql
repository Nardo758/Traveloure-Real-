-- Migration 012: Consolidate expert_custom_services → provider_services (data migration)
--
-- Migrate expert service data into the canonical provider_services table.
-- Schema changes (approval_status, deliverables, etc.) already applied by migration 011.
--
-- Category mapping (NON-NEGOTIABLE):
--   expert_custom_services.existing_category_id → service_categories by name-match.
--   Without this, migrated rows become uncategorized and invisible to feeds/matching.
--
-- Draft/rejected handling:
--   - draft|submitted|approved → migrate with approval_status preserved
--   - rejected → discard (failed review; expert resubmits as new draft if needed)

-- 1. Migrate expert_custom_services → provider_services
--
-- Idempotency: INSERT ... WHERE NOT EXISTS prevents re-runs from duplicating rows.

INSERT INTO provider_services (
  id,
  user_id,
  service_name,
  description,
  service_type,
  category_id,
  price,
  price_type,
  duration,
  delivery_method,
  cancellation_policy,
  lead_time,
  deliverables,
  experience_types,
  gallery_images,
  service_image,
  what_included,
  requirements,
  approval_status,
  submitted_at,
  reviewed_at,
  reviewed_by,
  rejection_reason,
  status,
  bookings_count,
  average_rating,
  revenue_share_rate,
  created_at,
  updated_at
)
SELECT
  ecs.id,
  ecs.expert_id,
  ecs.title,
  ecs.description,
  'planning',
  sc.id,
  ecs.price,
  'fixed',
  ecs.duration,
  'async_messaging',
  ecs.cancellation_policy,
  ecs.lead_time,
  COALESCE(ecs.deliverables, '[]'::jsonb),
  COALESCE(ecs.experience_types, '[]'::jsonb),
  COALESCE(ecs.gallery_images, '[]'::jsonb),
  ecs.image_url,
  COALESCE(ecs.deliverables, '[]'::jsonb),
  jsonb_build_object('__migrated_from', 'expert_custom_services'),
  ecs.status,
  ecs.submitted_at,
  ecs.reviewed_at,
  ecs.reviewed_by,
  ecs.rejection_reason,
  CASE ecs.status WHEN 'approved' THEN 'active' ELSE 'draft' END,
  COALESCE(ecs.bookings_count, 0),
  ecs.average_rating,
  '0.75',
  ecs.created_at,
  ecs.updated_at
FROM expert_custom_services ecs
LEFT JOIN expert_service_categories esc
  ON ecs.existing_category_id = esc.id
LEFT JOIN service_categories sc
  ON LOWER(TRIM(sc.name)) = LOWER(TRIM(COALESCE(esc.name, ecs.category_name)))
WHERE ecs.status IN ('draft', 'submitted', 'approved')
  AND NOT EXISTS (
    SELECT 1 FROM provider_services ps WHERE ps.id = ecs.id
  );

-- 2. Auto-promote signup-time expert_selected_services
--
-- Create approved provider_services rows for offerings selected during signup.
-- expert_selected_services links an expert to an offering they picked during
-- application. Those should become approved provider_services rows so the
-- expert's catalog is non-empty post-approval.

INSERT INTO provider_services (
  user_id,
  service_name,
  description,
  service_type,
  category_id,
  price,
  price_type,
  delivery_method,
  approval_status,
  status,
  revenue_share_rate,
  created_at,
  updated_at
)
SELECT
  ess.expert_id,
  eso.name,
  eso.description,
  'planning',
  sc.id,
  COALESCE(ess.custom_price, eso.price),
  'fixed',
  'async_messaging',
  'approved',
  CASE WHEN ess.is_active THEN 'active' ELSE 'paused' END,
  '0.75',
  ess.created_at,
  ess.created_at
FROM expert_selected_services ess
JOIN expert_service_offerings eso ON ess.service_offering_id = eso.id
LEFT JOIN expert_service_categories esc ON eso.category_id = esc.id
LEFT JOIN service_categories sc ON LOWER(TRIM(sc.name)) = LOWER(TRIM(esc.name))
WHERE NOT EXISTS (
  SELECT 1 FROM provider_services ps
  WHERE ps.user_id = ess.expert_id
    AND ps.service_name = eso.name
);
