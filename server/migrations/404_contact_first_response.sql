-- Ops gap 7 (ledger `2026-10-22-support-intake-queue`; fix queue row 107): the support inbox records when a
-- submission first got a response. Additive, nullable, NO DEFAULT, NO CHECK, NO index, NO backfill: NULL = no
-- response recorded (an older row was never stamped). Written only by the admin PATCH, on the first move out of
-- `new` or the first note. Declared in shared/schema.ts (deploy-push rule).
-- HELD for "Migration 404 SQL approved — Leon".
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS first_response_at timestamp;
