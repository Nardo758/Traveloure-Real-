-- 136: users.handle — the public storefront identity (backoffice Phase 1a, mockup /p/{handle}).
-- ADDITIVE NULLABLE, no CHECK, no DEFAULT → no publish-time drizzle-push trap (129/130 posture).
-- Format/reserved-word validation lives at the app layer (storefront.routes.ts), NOT a DB CHECK —
-- a CHECK over a format regex is exactly the publish-push trap CLAUDE.md warns about.
-- UNIQUE constraint (not partial index) so drizzle push parity holds; Postgres UNIQUE permits
-- multiple NULLs, so all existing rows (handle NULL) are unaffected.

ALTER TABLE users ADD COLUMN IF NOT EXISTS handle VARCHAR(30);

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_handle_unique UNIQUE (handle);
EXCEPTION
  -- duplicate_object: constraint exists; duplicate_table: the UNIQUE's backing index relation
  -- exists (what PG actually raises on re-run — proven behaviorally). Both = already applied.
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
