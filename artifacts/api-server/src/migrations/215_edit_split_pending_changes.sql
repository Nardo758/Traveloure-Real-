-- Migration 215: edit-split pending-changes rail (ruling 112 Q8 — CLAUDE.md §23, DECISIONS.md
-- ledger row 112; the mock's gap #17 RATIFIED).
--
-- WHAT + WHY. An APPROVED listing is never taken down for an edit. Safe edits (price, photos,
-- availability, wording, pin position…) apply to the live row immediately; IDENTITY edits
-- (service name, category/offering, delivery method, product shape) land here instead and the
-- approved version stays live and bookable while they wait for review:
--
--   pending_changes:    jsonb — the identity-field patch awaiting review, exactly as it will be
--                       applied on approval. NULL = no edit in review. Merged (not replaced) if
--                       the owner edits again while one is pending.
--   edit_review_status: varchar — NULL = nothing pending; 'pending' = an identity edit awaits
--                       review. App-enforced vocabulary, NO DB CHECK (publish-trap posture).
--
-- WRITE RAIL (§19): NEITHER column is ever client-settable — both are .omit()'d from
-- insertProviderServiceSchema, stripped in storage.create/updateProviderService (so the internal
-- `as any` callers are covered), and written ONLY by the PATCH handler's server-side field split
-- and the admin apply/discard writers (atomic conditionals on edit_review_status='pending').
--
-- PUBLISH-TRAP: additive nullable, no CHECK, both columns DECLARED in shared/schema.ts in the
-- same commit. Idempotent.

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS pending_changes jsonb;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS edit_review_status varchar;
