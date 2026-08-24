-- 254: Creation provenance on provider_services (ledger 2026-08-23-provenance-creation).
-- WHICH rail created a listing — the #1 gap the provenance audit named. Additive-nullable,
-- NO CHECK (publish-trap rule; vocabulary is app-enforced):
--   created_via: 'wizard' | 'catalog' | 'template' | 'bundle' | 'property' | 'property_room'
--              | 'listing' | 'admin' | 'seed' | 'migration'  (NULL = created before this column)
--   source_ref: free-text origin id when one exists (offering/template id, seed name, migration file)
-- Declared in shared/schema.ts (deploy-push rule). No backfill — NULL is an honest unknown (§13).

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS created_via varchar(24);
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS source_ref varchar(128);
