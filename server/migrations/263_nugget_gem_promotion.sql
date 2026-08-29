-- 262: Nugget → gem promotion candidate path (2026-08-29-replit-gem-audit ruling 4).
-- Additive-nullable columns on local_knowledge_nuggets; declared in shared/schema.ts
-- (deploy-push rule). No DB CHECK on the status vocabulary (migration-181 publish-trap
-- posture — app-enforced: NULL | 'submitted' | 'approved' | 'rejected').
-- All columns are server-authored only (§19): omitted from the insert schema, stripped
-- by the storage writer, absent from the PATCH allowlist.
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promotion_status varchar(20);
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promotion_submitted_at timestamp;
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promotion_reviewed_by varchar(255);
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promotion_reviewed_at timestamp;
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promotion_review_note text;
ALTER TABLE local_knowledge_nuggets ADD COLUMN IF NOT EXISTS promoted_gem_id varchar;
