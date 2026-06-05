-- 016_eso_target_roles.sql
-- Add target_roles text-array to expert_service_offerings.
-- NULL  → shown to all expert roles (global template)
-- array → scoped to listed roles (e.g. '{local_expert,travel_expert}')
ALTER TABLE expert_service_offerings
  ADD COLUMN IF NOT EXISTS target_roles text[];
