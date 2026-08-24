-- Migration 211: property builder fields (S8, Gate G2 — docs/briefs/WAVE3_SCHEMA_PROPOSALS.md,
-- ratified ledger row 102).
--
-- WHAT + WHY. `provider_services` already carries the property/room LINKAGE (productShape,
-- pricingUnit, parentServiceId — migration 153) and the pin/photos/cancellation columns an
-- innkeeper needs are ALSO already there (latitude/longitude/locationPrecision, serviceImage,
-- galleryImages, cancellationPolicy, cancellationPolicyType, partySizeMin/Max). What is genuinely
-- missing (grep-clean across shared/schema.ts and server/ before this migration) is: check-in/out
-- time, house rules, amenities. This migration adds exactly those four columns and nothing else —
-- no new table (the S8 schema doc's own finding: "S8 is not starting from a blank table").
--
-- SHAPE.
--   check_in_time / check_out_time: varchar(5) "HH:MM", the same wall-clock shape already used by
--     provider_services.earliest_start_time / latest_start_time (migration 195).
--   house_rules: free text, property-level only (no per-room override — ratified absolute
--     inheritance, same posture as the pin).
--   amenities: jsonb string array, the delivery_languages precedent (migration 199/CLAUDE.md §13):
--     NULL = never captured (every pre-211 row), [] = the owner deliberately cleared the list — the
--     two states must never collapse into each other.
--
-- WRITE RAIL. All four ride the EXISTING POST/PATCH /api/provider/services and the EXISTING
-- .omit()-based insertProviderServiceSchema (shared/schema.ts) — none are money/identity/rate
-- fields (§14/§18/§19 do not apply), so ordinary inclusion is safe, exactly like
-- galleryImages/cancellationPolicy on the same table. No new endpoint.
--
-- PUBLISH-TRAP. Additive-nullable columns only, NO DB CHECK (app-enforced HH:MM regex + amenities
-- shape live in shared/schema.ts's insertProviderServiceSchema — the migration-195/199 posture), so
-- nothing for the preflight CONSTRAINT_MANIFEST and no publish-time deploy-push failure. All four
-- also DECLARED in shared/schema.ts in the same commit (publish-trap rule) so the Replit deploy-push
-- cannot drop them. Idempotent (IF NOT EXISTS).

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS check_in_time  varchar(5),
  ADD COLUMN IF NOT EXISTS check_out_time varchar(5),
  ADD COLUMN IF NOT EXISTS house_rules    text,
  ADD COLUMN IF NOT EXISTS amenities      jsonb;
