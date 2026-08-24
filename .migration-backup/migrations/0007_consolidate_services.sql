-- 0007_consolidate_services.sql
--
-- Service Model Consolidation: collapse expert_custom_services (approval workflow)
-- into the canonical provider_services table.
--
-- Why one table:
--   service_bookings.service_id and service_reviews.service_id already FK to
--   provider_services. The wizard already posts to /api/provider/services. The
--   user_id column is role-agnostic. Forcing a split would fragment the
--   booking/review/payment path for no real gain.
--
-- Strategy: PARALLEL-RUN.
--   This migration adds columns + copies data, but leaves the legacy tables
--   (expert_custom_services, expert_selected_services, expert_service_offerings)
--   in place. A follow-up migration (0008) drops them once we've verified in
--   prod that nothing reads from them.
--
-- Category mapping (NON-NEGOTIABLE):
--   expert_custom_services.existing_category_id points at expert_service_categories,
--   a separate taxonomy from service_categories. Without an explicit name-match
--   step, migrated rows land with NULL category_id and become invisible to
--   category-filtered browse, the gem feed, and the matching system.
--
-- Draft / rejected handling:
--   - draft     -> migrate as approval_status='draft', status='draft'
--   - submitted -> migrate as approval_status='submitted', status='draft'
--   - approved  -> migrate as approval_status='approved', status='active'
--   - rejected  -> DROP. These failed admin review. The expert can resubmit as
--                  a new draft if they want to try again.

-- 1. Schema additions to provider_services -----------------------------------

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS cancellation_policy text;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS lead_time varchar(50);
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS deliverables jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS experience_types jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS gallery_images jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS submitted_at timestamp;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS reviewed_by varchar
    REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS rejection_reason text;
--> statement-breakpoint

-- Backfill existing rows: they pre-date the approval workflow, treat as approved.
UPDATE provider_services
  SET approval_status = 'approved'
  WHERE approval_status IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_provider_services_approval_status
  ON provider_services(approval_status)
  WHERE approval_status IN ('draft', 'submitted', 'rejected');
--> statement-breakpoint

-- 2. Migrate expert_custom_services -> provider_services ---------------------
--
-- Idempotency guard: skip rows that already have a matching migrated copy.
-- We tag migrated rows via a marker in the `requirements` jsonb because there
-- isn't a dedicated migration_source column. The marker is removed when the
-- legacy tables are dropped in 0008.

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
  sc.id,                                   -- category mapping (may be NULL if no match)
  ecs.price,
  'fixed',
  ecs.duration,
  'async_messaging',                       -- safe default; experts can edit in the form
  ecs.cancellation_policy,
  ecs.lead_time,
  COALESCE(ecs.deliverables, '[]'::jsonb),
  COALESCE(ecs.experience_types, '[]'::jsonb),
  COALESCE(ecs.gallery_images, '[]'::jsonb),
  ecs.image_url,
  COALESCE(ecs.deliverables, '[]'::jsonb), -- mirror deliverables into what_included
  jsonb_build_object('__migrated_from', 'expert_custom_services'),
  ecs.status,                              -- draft|submitted|approved
  ecs.submitted_at,
  ecs.reviewed_at,
  ecs.reviewed_by,
  ecs.rejection_reason,
  CASE ecs.status WHEN 'approved' THEN 'active' ELSE 'draft' END,
  COALESCE(ecs.bookings_count, 0),
  ecs.average_rating,
  '0.75',                                  -- default revenue share floor
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
--> statement-breakpoint

-- 3. Auto-promote signup-time expert_selected_services -----------------------
--
-- expert_selected_services links an expert to an offering they picked during
-- application. Those should become approved provider_services rows so the
-- expert's catalog is non-empty post-approval. Custom-priced rows win; if no
-- override, fall back to the offering's price.

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
