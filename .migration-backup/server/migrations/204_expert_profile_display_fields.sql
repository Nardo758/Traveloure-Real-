-- 196: expert profile display fields (task: expert profile editor persistence).
-- Adds display_name + headline to local_expert_forms so the expert profile editor
-- can persist the public-facing name/tagline it already exposes. Additive,
-- nullable, idempotent. Declared in shared/schema.ts (publish-trap rule).
ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS display_name varchar(100);
ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS headline varchar(150);
