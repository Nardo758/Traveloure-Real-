-- 252: Concierge revision entitlement on ready_made_purchases (ledger 2026-08-22-concierge-revision).
-- Every ready-made purchase includes ONE consultation + ONE revision from the selling expert.
-- Additive-nullable, app-enforced vocabulary, NO CHECK (publish-trap rule; same posture as the
-- existing `status` column). NULL revision_status = available (never requested). Behavior-neutral
-- on apply. All three columns declared in shared/schema.ts. Idempotent (IF NOT EXISTS).
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS revision_status varchar(20);
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS revision_request_note text;
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS revision_requested_at timestamp;
