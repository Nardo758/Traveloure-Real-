-- Migration 166 — Content logistics envelope (QA_PUNCH_LIST item 20, decision-maker directive
-- Aug 1, 2026: tag every piece of content with location, time available/start, duration,
-- transport-provided incl. pickup + dropoff).
--
-- Ground truth (docs/planning/QA_PUNCH_LIST.md item 20): most homes for the envelope already
-- exist on provider_services (coords/city — migration 129/162, meetingPoint, transportProvided,
-- pickupAvailable, availability jsonb + vendor_availability_slots real windows, the
-- deliveryTimeframe "duration" field ServiceForm writes). The ONE gap on provider_services is a
-- structured DROP-OFF point — meetingPoint/pickupAddress cover arrival, nothing covers departure.
-- itinerary_items already carries durationMinutes (no gap there) but has no transport fields at
-- all, so a plan item built from a source that DID know transport-provided/pickup/drop-off loses
-- that fact the moment it lands on the plan.
--
-- Governing rules (CLAUDE.md Coordination Prevention — schema/migration change):
--   * ADDITIVE NULLABLE ONLY. No CHECK, no NOT NULL, no DEFAULT on any of the four columns below
--     -> no publish-time drizzle-push CHECK-failure trap (the migration-129/152 additive posture).
--     transport_provided deliberately mirrors provider_services.transport_provided's vocabulary
--     (yes|no|not_applicable) at the APP layer only (server/shared/content-logistics.ts) — no DB
--     CHECK, matching how provider_services' own transport_provided column carries its CHECK in a
--     LATER migration (119), not this one; adding one here for a brand-new nullable column with no
--     existing rows would be safe but is deliberately deferred until the vocabulary is proven in
--     use, per the additive-first posture used throughout this migration set.
--   * NO BACKFILL. NULL = honest "this source never captured that fact" (§13) — never fabricated.
--   * All four columns are ALSO declared on the providerServices / itineraryItems pgTables in
--     shared/schema.ts in the same commit (deploy-push durability rule — an undeclared column is
--     not itself dropped by the publish push, but the rule is recorded here for consistency with
--     every other additive-column migration in this file).

-- 1. provider_services: the one missing logistics field — a structured drop-off point.
--    meetingPoint / pickupAddress already cover "where does the client meet/get picked up";
--    nothing on this table structurally captures "where does the client get dropped off".
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS drop_off_point TEXT;

-- 2. itinerary_items: the plan-item side of the envelope. durationMinutes already exists
--    (migration 003x's original itinerary_items definition) — only transport fields are new, so
--    a plan item built from a source with known transport facts (e.g. the Platform-services
--    picker's provider_services row) retains them once it lands on the trip, instead of losing
--    them at the itinerary-item boundary.
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS transport_provided VARCHAR(20);
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS pickup_point TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS drop_off_point TEXT;
