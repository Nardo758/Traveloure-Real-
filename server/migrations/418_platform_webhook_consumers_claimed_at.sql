-- 418 — platform_webhook_consumers.claimed_at
-- (ledger `2026-10-30-row98-webhook-dedupe-replay`).
--
-- HELD for "Migration 418 SQL approved — Leon". Do not merge until approved.
--
-- Row 98 (option b, Leon, Oct 30, 2026): the per-event claim records when it was last taken. The
-- claim statement stamps it on insert and on re-take (server/services/webhook-claim.service.ts).
--   claimed_at  timestamp  the last claim of this (stripe_event_id, consumer). NULL = a row
--                          claimed before this column existed.
--
-- Additive. One nullable column. No default, no check, no not-null, no index, no backfill.
-- Declared in shared/schema.ts (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.

ALTER TABLE platform_webhook_consumers ADD COLUMN IF NOT EXISTS claimed_at timestamp;
