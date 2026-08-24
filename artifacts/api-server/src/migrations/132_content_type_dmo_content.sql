-- Migration 132 — DMO content in the central content system (approach A).
--
-- Adds 'dmo_content' to the content_type enum so DMO/scraped research content can be REGISTERED into
-- content_registry (one central content system) — while remaining EXPERT-WORKSPACE-ONLY and NEVER
-- surfaced to travelers (the 'sourced' origin; see shared/content-origin.ts + the resolver guard).
--
-- ADD VALUE is idempotent in PostgreSQL 9.6+ (guarded here anyway). Additive, no CHECK, no data
-- change → no publish-time drizzle-push trap. Mirrors migration 0009's 'affiliate_product' add.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'dmo_content'
      AND enumtypid = 'content_type'::regtype
  ) THEN
    ALTER TYPE content_type ADD VALUE 'dmo_content';
  END IF;
END$$;
