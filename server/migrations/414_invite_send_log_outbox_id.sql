-- 414 — invite_send_log.outbox_id (ledger `2026-10-28-invite-send-state-server`).
--
-- HELD for "Migration 414 SQL approved — Leon". Do not merge until approved.
--
-- Row 207 server half (Architect, 2026-10-28 20:50 ET): the organizer's send
-- state is derived from the outbox row. This column is the pointer from the
-- send log to that row. NULL = no outbox row was recorded (every existing log
-- row, and a failed enqueue). A null pointer is never read as sent.
--
-- Additive. One nullable bigint. No DEFAULT, no CHECK, no NOT NULL, no index,
-- no FK, no backfill. Declared in shared/guest-invites-schema.ts.
-- IF NOT EXISTS, so a second run is a no-op.

ALTER TABLE invite_send_log ADD COLUMN IF NOT EXISTS outbox_id bigint;

COMMENT ON COLUMN invite_send_log.outbox_id IS
  'email_outbox.id for this invite. NULL = none recorded. Organizer send state is derived from the outbox row; this column is not a status.';
