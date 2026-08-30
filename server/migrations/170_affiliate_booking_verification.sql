-- Migration 170 — AI booking copilot verification leg (decision-maker ratified).
--
-- Adds ONE additive nullable jsonb column `verification` to `affiliate_booking_requests` to hold
-- the AI-assisted pre-booking verification snapshot: {verifiedAt, price, currency, availability,
-- dateAvailable, cancellation, operatingHours, verdict, flags, agentNote, source}. Written by
-- server/services/booking-verification.service.ts (Tavily-extract + LLM-extract, key-gated,
-- §13 never-fabricates — no key ⇒ no write) at POST /api/affiliate-booking-requests/:id/verify.
--
-- §16 holds: the snapshot NEVER includes the partner affiliateUrl (that stays server-side per the
-- existing agent-booking rail contract) — enforced in the service layer, not the DB; there is
-- deliberately no separate URL column here to leak.
--
-- No CHECK, no DEFAULT, no backfill (every existing row has nothing to verify retroactively) ->
-- nothing for the preflight CONSTRAINT_MANIFEST, no publish-time drizzle-push trap. Declared on the
-- affiliateBookingRequests pgTable in shared/schema.ts in the same commit (deploy-push durability
-- rule).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
ALTER TABLE affiliate_booking_requests
  ADD COLUMN IF NOT EXISTS verification jsonb;
