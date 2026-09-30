-- 334 — Affiliate page extraction: product provenance and the per-partner terms gate (ledger
-- `2026-09-30-affiliate-extract-compliant`). HELD FOR RULING by the decision-maker's dispatch of
-- Sep 30, 2026 ("migration → hold for ruling").
--
-- THREE ADDITIVE, NULLABLE COLUMNS. NO DEFAULT, NO CHECK, NO INDEX, NO BACKFILL — the publish-trap
-- posture (migrations 181/195/273/…); every value set is app-enforced and stated ONCE in
-- shared/affiliate-extract.ts; all three are declared in shared/schema.ts (deploy-push durability).
-- A publish prompt offering these is inside §20's ADD COLUMN IF NOT EXISTS carve-out.
--
-- affiliate_products.source — which writer produced the row: 'travelpayouts_import' |
--   'partner_page_extract' | 'manual'. Stamped on INSERT by every writer. NULL = a row written
--   before this migration, whose writer is not recorded (§13) — never guessed, never backfilled.
-- affiliate_partners.page_extract_permitted — the admin's answer, after reading the partner
--   program's terms, to "does this program allow page extraction?". NULL = never answered, which
--   reads as NOT permitted: extraction runs only on an explicit TRUE (default off, with no DB
--   default, so "not answered" and "answered no" stay different facts).
-- affiliate_partners.terms_checked_at — when that answer was given. Written by the same one admin
--   rail that writes the flag; extraction also requires it to be set.

ALTER TABLE affiliate_products ADD COLUMN IF NOT EXISTS source varchar(30);
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS page_extract_permitted boolean;
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS terms_checked_at timestamp;
