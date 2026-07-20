-- Migration 119 — provider service transport-provided disclosure (provider-hub Phase 2).
--
-- "If the traveler meets the provider at the meeting point, the provider must let the platform
-- know whether transport is provided." (decision-maker directive, Jul 19, 2026). A 3-value field
-- so an explicit "no transport" is distinct from "not applicable" (a remote/self-guided service
-- where the question is meaningless). Surfaced to the traveler on the service-detail page.
--
-- New column with a DEFAULT → every existing row is born 'not_applicable', so the CHECK cannot be
-- violated by grandfathered data (no publish-time push trap: the CHECK lives only in this migration,
-- not in shared/schema.ts, mirroring the migration-109 delivery_method pattern).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the CHECK is added guarded so a re-run is a no-op.

ALTER TABLE "provider_services"
  ADD COLUMN IF NOT EXISTS "transport_provided" varchar(20) DEFAULT 'not_applicable';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_services_transport_provided_check'
  ) THEN
    ALTER TABLE "provider_services"
      ADD CONSTRAINT "provider_services_transport_provided_check"
      CHECK ("transport_provided" IS NULL OR "transport_provided" IN ('yes', 'no', 'not_applicable'));
  END IF;
END $$;
