-- 253: Concierge dispute columns on ready_made_purchases (ledger 2026-08-22-concierge-p3).
-- The buyer's post-purchase recourse after self-serve refund removal: a concern reviewed by an
-- admin (refund = the escape hatch), never an automatic refund.
-- Additive-nullable, NO CHECK (publish-trap rule — vocabulary is app-enforced):
--   dispute_status: NULL = none | 'open' | 'resolved_refunded' | 'resolved_dismissed'
-- Resolver identity is kept (dispute_resolved_by/at) — provenance posture: decisions are
-- superseded, never erased. Declared in shared/schema.ts (deploy-push rule).

ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS dispute_status varchar(24);
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS disputed_at timestamp;
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamp;
ALTER TABLE ready_made_purchases ADD COLUMN IF NOT EXISTS dispute_resolved_by varchar REFERENCES users(id) ON DELETE SET NULL;
