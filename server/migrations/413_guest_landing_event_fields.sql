-- 413 — user_experiences.host_note, venue_address, rsvp_by (ledger `2026-10-28-guest-landing-fields`).
--
-- HELD for "Migration 413 SQL approved — Leon". Do not merge until approved.
--
-- Row 277 (Architect, 2026-10-28 01:45 ET, pt847u): the guest invite landing shows the host's
-- note and an RSVP-by date before RSVP, and the street address only after the guest accepts.
-- None of the three had a column.
--   host_note      text          the host's note to guests. NULL = not set.
--   venue_address  varchar(255)  the street address, released to a guest only at rsvpStatus
--                                "accepted" (server/services/guest-invite-landing.ts). NULL = not set.
--   rsvp_by        date          "YYYY-MM-DD", like event_date. NULL = not set.
--
-- Additive. Three nullable columns. No DEFAULT, no CHECK, no NOT NULL, no index, no backfill.
-- Declared in shared/schema.ts (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.

ALTER TABLE user_experiences ADD COLUMN IF NOT EXISTS host_note text;
ALTER TABLE user_experiences ADD COLUMN IF NOT EXISTS venue_address varchar(255);
ALTER TABLE user_experiences ADD COLUMN IF NOT EXISTS rsvp_by date;
