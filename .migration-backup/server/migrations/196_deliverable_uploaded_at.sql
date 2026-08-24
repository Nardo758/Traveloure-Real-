-- 196: provider_services.deliverable_uploaded_at — D8 artifact-timer delivery timestamp
-- (docs/DECISIONS.md ruling 63, decision-maker ratified Aug 11 2026; executed by ruling 66).
--
-- WHY THIS COLUMN EXISTS. Ruling 63's pdf row auto-completes "7 days UNDOWNLOADED POST-DELIVERY".
-- The downloaded arm needs no new state (deliverable_downloads, migration 194, carries the first
-- download). The UNDOWNLOADED arm needs the moment the entitlement actually became satisfiable —
-- which is max(booking.confirmed_at, the moment the provider's file existed). Nothing recorded the
-- second half: `service_file` is a bare text column and `updated_at` moves on ANY listing edit, so
-- it cannot answer "when did the deliverable land". Without this, a provider who uploads 30 days
-- after purchase would have had the timer fire at day 7 on a booking where NOTHING was delivered.
--
-- §13: NULL means "we never recorded an upload for this row" — never read as a value. A pre-196
-- listing (or a legacy pasted-URL deliverable) is simply INELIGIBLE for the undownloaded arm and
-- is skipped with a stated reason; its DOWNLOADED arm still works, because that arm needs only
-- deliverable_downloads and therefore covers every row regardless of age.
--
-- Additive, nullable, no backfill, NO CHECK (publish-trap avoidance — CLAUDE.md deploy-push note).
-- Declared in shared/schema.ts so the deploy push does not drop it.

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS deliverable_uploaded_at TIMESTAMP;
