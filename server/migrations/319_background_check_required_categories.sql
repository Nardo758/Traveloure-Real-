-- 319 — Approved data-only migration: require background checks for the four
-- service-category keys whose providers work directly with travelers.
-- Idempotent: already-true rows are not rewritten.
UPDATE service_categories
SET requires_background_check = TRUE
WHERE category_key IN (
  'tour_guide',
  'private_chef',
  'childcare_family',
  'private_transportation'
)
  AND requires_background_check IS DISTINCT FROM TRUE;