-- Migration 288: affiliate attribution links — the sub_id seam goes live.
-- Ledger `2026-09-05-affiliate-subid-live`; MONEY_MAP F-5 (was DORMANT, now LIVE).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate attribution is per REQUEST. Every outbound partner link built for an
-- `affiliate_booking_requests` row now carries that row's id in the partner's own attribution
-- parameter (`sub_id` / `marker`, Travelpayouts' documented `<marker>.<SubID>` convention —
-- server/services/affiliate-attribution.service.ts is the ONE builder). Two things then need a
-- home on disk:
--
--   (a) `affiliate_clicks.booking_request_id` — WHICH request an outbound click was recorded for.
--       The tracked-open route writes it beside the click it already records.
--   (b) `affiliate_earnings.booking_request_id` / `.trip_id` — the link the reconciliation matcher
--       writes when a partner report row's sub_id parses to a request id. Until now that linkage
--       lived only inside the `external_report_data` jsonb blob, so no query could join a
--       partner-reported commission to the plan it belongs to.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DETECTION ONLY — no amount, no rate, no money movement (§14/§15/§17)
-- ─────────────────────────────────────────────────────────────────────────────
-- These three columns are ATTRIBUTION, not money. Nothing here changes an amount, a commission
-- rate, a payout or a status; `resolveCommissionRates` and every earnings/payout path are
-- untouched. The reconciliation job stays a DETECTOR (§17): it links, it never repairs.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE, NULLABLE, NO CHECK, NO BACKFILL — deliberately
-- ─────────────────────────────────────────────────────────────────────────────
-- All three are additive nullable FKs with ON DELETE SET NULL and NO CHECK constraint — the
-- publish-trap posture (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280 / 281 / 282 /
-- 284 / 287): a CHECK added over columns holding legacy values is exactly the publish-time
-- drizzle-push failure CLAUDE.md's Coordination Prevention notes warn about, and when it fires it
-- offers the DESTRUCTIVE "copy dev database over production" option.
--
-- ON DELETE SET NULL, not CASCADE: deleting a booking request must never delete the click that
-- recorded an outbound open, nor a commission a partner actually reported and paid.
--
-- NO BACKFILL. Every row that exists today gets NULL, and that is a finished answer (§13): a
-- pre-existing click is honestly "not recorded against a request", and a pre-existing earning is
-- honestly "never matched by token". Guessing a request id from a date-and-amount neighbourhood
-- would turn "we never stamped it" into "the partner reported this against that request" — a
-- different claim, and precisely the estimate the exact-token design exists to refuse.
--
-- The COLUMNS are ALSO declared in `shared/schema.ts` in this same commit — the deploy-push
-- durability rule: an object that file does not declare is dropped by Replit's publish-time push
-- and never recreated, because this migration is stamped by then.
--
-- Idempotent; safe to re-run.

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS booking_request_id varchar
    REFERENCES affiliate_booking_requests(id) ON DELETE SET NULL;

ALTER TABLE affiliate_earnings
  ADD COLUMN IF NOT EXISTS booking_request_id varchar
    REFERENCES affiliate_booking_requests(id) ON DELETE SET NULL;

ALTER TABLE affiliate_earnings
  ADD COLUMN IF NOT EXISTS trip_id varchar
    REFERENCES trips(id) ON DELETE SET NULL;

COMMENT ON COLUMN affiliate_clicks.booking_request_id IS
  'The affiliate_booking_requests row this outbound click was recorded for (migration 288, ledger 2026-09-05-affiliate-subid-live) — the same id the partner attribution parameter carries. NULL = not an agent-booking open.';

COMMENT ON COLUMN affiliate_earnings.booking_request_id IS
  'Set by affiliate-reconciliation.service.ts on an EXACT sub_id token match (migration 288). Detection only — never a guess, never an amount change. NULL = never matched by token.';

COMMENT ON COLUMN affiliate_earnings.trip_id IS
  'The plan the token-matched booking request belongs to (migration 288). Copied from affiliate_booking_requests.trip_id at match time; NULL when the request had no trip or was never token-matched.';
