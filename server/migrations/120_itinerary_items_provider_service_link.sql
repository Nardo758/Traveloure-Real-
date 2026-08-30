-- Migration 120 — link itinerary items to a bookable platform service (provider-hub Phase 3).
--
-- Experts can now browse ALL approved platform services in the Workstation and drop one onto the
-- trip's itinerary ("experts should have access to all the services in their Workstation"). To keep
-- the added item traceable back to the real, bookable listing, itinerary_items gets a nullable
-- provider_service_id FK. Free-text / external-place items simply leave it NULL.
--
-- ON DELETE SET NULL: removing the underlying service must not cascade-delete the plan item — the
-- expert's itinerary structure survives, the link just clears.
--
-- Additive nullable column, no default, no backfill, no CHECK → no publish-time push trap.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded FK add.

ALTER TABLE "itinerary_items"
  ADD COLUMN IF NOT EXISTS "provider_service_id" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_items_provider_service_id_fkey'
  ) THEN
    ALTER TABLE "itinerary_items"
      ADD CONSTRAINT "itinerary_items_provider_service_id_fkey"
      FOREIGN KEY ("provider_service_id") REFERENCES "provider_services"("id") ON DELETE SET NULL;
  END IF;
END $$;
