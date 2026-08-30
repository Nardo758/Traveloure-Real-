-- Migration 195: D7 service-logistics capture on provider_services.
-- docs/DECISIONS.md ruling 62 (decision-maker ratified Aug 11, 2026), including the
-- ratification AMENDMENT: "ensure the service provider can set EITHER a pickup RADIUS or a
-- pickup ROUTE" — recorded by pickup_coverage_mode.
--
-- Additive nullable columns ONLY. NO DB CHECK on any of them (the migration-144 posture:
-- app-enforced vocabularies live in shared/schema.ts's transportProvisionEnum /
-- pickupCoverageModeEnum and are enforced by insertProviderServiceSchema) — a CHECK here is
-- exactly the publish-time deploy-push failure CLAUDE.md warns about. No backfill: NULL is the
-- honest "the provider never told us" state on every pre-195 row (§13), never a default claim.
--
-- Every column is ALSO declared in shared/schema.ts so the Replit deploy-push cannot drop it
-- (CLAUDE.md publish-trap rule). Idempotent.
--
-- DELIBERATELY NOT ADDED (already on the table — see the audit block in shared/schema.ts):
--   lead_time_hours, service_radius, meeting_point, pickup_available, pickup_address,
--   drop_off_point, max_concurrent_bookings, delivery_timeframe, latitude/longitude/
--   location_precision, price_type (per_person vs per-group), cancellation_policy_type.
-- transport_provided (migration 119, yes|no|not_applicable, WITH a CHECK) is left untouched:
-- widening its CHECK is a publish trap, and it answers a different question.

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS transport_provision   varchar(30),
  ADD COLUMN IF NOT EXISTS pickup_coverage_mode  varchar(20),
  ADD COLUMN IF NOT EXISTS duration_minutes      integer,
  ADD COLUMN IF NOT EXISTS buffer_minutes        integer,
  ADD COLUMN IF NOT EXISTS earliest_start_time   varchar(5),
  ADD COLUMN IF NOT EXISTS latest_start_time     varchar(5),
  ADD COLUMN IF NOT EXISTS service_timezone      varchar(64),
  ADD COLUMN IF NOT EXISTS party_size_min        integer,
  ADD COLUMN IF NOT EXISTS party_size_max        integer,
  ADD COLUMN IF NOT EXISTS change_cutoff_hours   integer,
  ADD COLUMN IF NOT EXISTS can_anchor            boolean;
