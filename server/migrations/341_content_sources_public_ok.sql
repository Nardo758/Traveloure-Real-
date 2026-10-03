-- Ledger 2026-10-03-official-facts-public-ok (R?). Ruling R-p, 2026-10-03.
-- ADDITIVE ONLY. Three nullable columns on content_sources. No DEFAULT, no CHECK, no index, no FK,
-- no backfill. Declared in shared/schema.ts (deploy-push durability rule).
--
--   public_ok             TRUE = an admin, at terms check, said this OFFICIAL source's facts may
--                         appear on public pages. NULL = never answered; FALSE = answered no.
--                         Both NULL and FALSE keep its facts plan-only.
--   public_ok_checked_at  when that answer was recorded (the database's now(), never a body field).
--   public_ok_checked_by  the session user who recorded it. No FK, by ruling (a new column on an
--                         existing table carries none); the id is history, not a grant.
--
-- The ONE writer is setContentSourcePublicOk (server/services/content-sources.service.ts), which
-- admits the answer only when license_class = 'official' AND terms_checked_at IS NOT NULL. A
-- general edit cannot set it, and an edit that clears the terms check clears it too.
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS public_ok boolean;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS public_ok_checked_at timestamp;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS public_ok_checked_by varchar;
