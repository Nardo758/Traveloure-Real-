-- Migration 212: S9 (Wave 3, Gate G3) session/async fields on provider_services.
-- docs/DECISIONS.md ledger row 102 (decision-maker ratified Aug 13, 2026, in session) —
-- ratifying docs/briefs/WAVE3_SCHEMA_PROPOSALS.md's S9 section in full.
--
-- Three additive-nullable columns, NO DB CHECK (app-enforced where a shape floor is needed —
-- insertProviderServiceSchema — the migration-195/181 posture). No backfill: NULL is the honest
-- "the provider never told us" state on every pre-212 row (§13), never a default claim.
--
--   join_link              — the provider's OWN meeting link for a scheduled remote session
--                             (call/video, SESSION_END_METHODS in shared/service-fundamentals.ts).
--                             SENSITIVE: this is NOT a public-read field like meetingPoint — it is
--                             stripped on every public/pre-booking surface and revealed only to the
--                             CONFIRMED traveler + the owning provider (never a PENDING advisor,
--                             §12's read grant does not extend to this field by ballot ruling).
--                             App-enforced basic URL-shape check (https?://) in
--                             insertProviderServiceSchema, matching the free-text posture of
--                             meetingPoint/pickupAddress elsewhere on this table.
--   response_window_hours  — async (async_messaging/voice_notes): the promised response time.
--                             Public pre-purchase info, app-enforced positive integer.
--   scope_statement        — async: what's in/out of scope — an SLA/promise statement, distinct
--                             from `whatIncluded` (marketing copy). Public pre-purchase info.
--
-- Both response_window_hours/scope_statement are DESCRIPTIVE ONLY: they do not feed
-- shared/service-fundamentals.ts's completionRuleFor (unchanged — async_messaging/voice_notes
-- already route to the 'provider_declared' rule) or any other completion/payout machinery
-- (server/services/booking-completion.service.ts is untouched by this migration).
--
-- remote_capacity is deliberately NOT added — a booked vendor_availability_slots row's own
-- `capacity` is the number for a scheduled call/video session (ledger row 102, S9-Q1).
--
-- Declared in shared/schema.ts in this same commit (publish-trap rule). Idempotent.

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS join_link              text,
  ADD COLUMN IF NOT EXISTS response_window_hours   integer,
  ADD COLUMN IF NOT EXISTS scope_statement         text;
