-- 268: Provider application lifecycle uniqueness.
--
-- A provider may have multiple rejected/deleted/deactivated rows because those rows are
-- legitimate review/account history. At most one current application (pending, approved, or
-- another non-history status) may exist for a user. Keep the deterministic earliest current row
-- when repairing legacy duplicates; do not delete review history.

WITH ranked_current AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at ASC NULLS FIRST, id ASC
    ) AS row_number
  FROM service_provider_forms
  WHERE status IS NULL
     OR status NOT IN ('rejected', 'deleted', 'deactivated')
)
DELETE FROM service_provider_forms
WHERE id IN (
  SELECT id
  FROM ranked_current
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS service_provider_forms_one_current_per_user_uniq
  ON service_provider_forms (user_id)
  WHERE status IS NULL OR status NOT IN ('rejected', 'deleted', 'deactivated');