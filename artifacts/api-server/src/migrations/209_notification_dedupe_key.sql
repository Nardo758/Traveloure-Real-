-- Migration 209 (QA-2 lane): notifications.dedupe_key — the durability fix for Finding A
-- (booking status commits first, the traveler notification is written separately — a crash in the
-- gap leaves a status change with no notification, and a retry cannot repair it because the
-- status-flip's own atomic conditional now 409s on the retry).
--
-- SHAPE CHOSEN: the notification write moves INTO the same transaction as the status flip in the
-- canonical writer (storage.updateServiceBookingStatus — the ruling-80 completion-mint precedent:
-- "flip-and-mint in ONE transaction"), plus an idempotent dedupe so a retried/duplicated attempt at
-- the SAME event inserts zero extra rows. Key shape: `booking:<id>:<event>` (e.g.
-- `booking:abc123:accepted`, `booking:abc123:cancelled`).
--
-- Nullable, additive, NO CHECK constraint (CLAUDE.md publish-trap rule) — legacy rows and every
-- caller that has not opted in (message/review/etc. notifications) keep dedupe_key NULL forever and
-- are completely unaffected. Index is PARTIAL (`WHERE dedupe_key IS NOT NULL`, the migration-155/203
-- precedent) so NULL rows never collide with each other — only two ACTUAL dedupe keys colliding is a
-- conflict, and INSERT ... ON CONFLICT DO NOTHING against this index is what makes the write
-- idempotent under a crash-retry or a concurrent duplicate call.
--
-- Column AND index are ALSO declared in shared/schema.ts (publish-trap rule — an index the code
-- depends on must be declared there or the Replit deploy-push authoritatively drops it, the
-- sb_idempotency_key_idx lesson).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uniq
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
