-- 228_service_bring_access_notes.sql
--
-- Gap #13's last two unbacked rows (ledger 2026-08-16-bring-access).
--
-- The ratified mock's traveler read-out draws nine rows. Seven have columns and render today
-- (lane M3). Two — "Bring" and "Access" — have NO column anywhere on provider_services and no
-- wizard field, so the create flow never asks and nothing can render them. They are the inverse
-- of the class T-REP (ledger row 101) audited: collected-and-never-read became
-- DRAWN-AND-NEVER-COLLECTED.
--
-- (The `accessibility_needs` / `mobility_level` columns already in the schema belong to
-- `trip_participants` — a TRAVELER's stated needs, not a host's description of their venue.
-- Reusing them would conflate two different people's answers.)
--
-- BOTH COLUMNS ARE ADDITIVE-NULLABLE WITH NO DB CHECK — the migration-181/195 posture, chosen
-- deliberately to avoid the Replit publish-time CHECK trap documented in CLAUDE.md. NULL means
-- "the provider never told us" and the row is OMITTED from every traveler surface (§13); it never
-- becomes "nothing to bring" or "no access notes", both of which are claims a host must make for
-- themselves. Free text in the host's own words — no accessibility STANDARD is claimed on their
-- behalf, which is why this is a note column and not a checklist of certified attributes.
--
-- Declared in shared/schema.ts per the publish-trap rule (an object the code depends on must be
-- in the schema or the deploy push is authoritative and will remove it).

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS what_to_bring TEXT,
  ADD COLUMN IF NOT EXISTS access_notes TEXT;

COMMENT ON COLUMN provider_services.what_to_bring IS
  'Gap #13: what a traveler should bring, in the host''s own words. NULL = never asked/answered — omitted from traveler surfaces, never rendered as "nothing needed".';
COMMENT ON COLUMN provider_services.access_notes IS
  'Gap #13: access/mobility notes in the host''s own words. NULL = never answered. NOT an accessibility standard or certification — no claim is made on the host''s behalf.';
