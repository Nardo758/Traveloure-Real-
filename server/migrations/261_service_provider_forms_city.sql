-- 261: additive-nullable city on service_provider_forms (intake-fixes C4, decision-maker
-- ratified Aug 27 2026; audit docs/audits/marketplace-surface-audit.md Part 5).
-- The provider intake ALREADY collects a discrete city (services-provider.tsx) but
-- concatenated it into the free-text address and lost it, which is why the storefront's
-- resolveEarnerLocation returns null for providers. Nullable, no CHECK (publish-trap
-- posture, migrations 181/195); no backfill — existing providers stay honestly
-- location-less (§13) until they resubmit/edit. Declared in shared/schema.ts per the
-- deploy-push rule (an undeclared column would be dropped by the publish push).
ALTER TABLE service_provider_forms ADD COLUMN IF NOT EXISTS city varchar(100);
