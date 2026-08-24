-- 164: plan-approval handshake on trip_expert_advisors — QA_PUNCH_LIST W2-A (items 11 + 13 +
-- 14b), the ratified "planning object vs final product" mode-flip (decision-maker, Aug 1 2026:
-- "ok sounds good"). (Renumbered from 163 → 164: lane W2-B claimed 163
-- (163_ready_made_withdraw_status.sql) on its own branch first.)
--
-- Three additive NULLABLE columns, no DB CHECK, no DEFAULT, no NOT NULL, no backfill — the
-- migration-159/129 posture: the canonical value set (`approved | changes_requested`) lives in
-- shared/schema.ts as `PLAN_APPROVAL_STATUSES`, not a DB CHECK, so the publish-time drizzle push
-- has nothing to enforce against un-remapped rows (no CONSTRAINT_MANIFEST entry needed). NULL is
-- the honest state for every existing row — no customer has ever seen this handshake, so nothing
-- is backfilled.
--
--   plan_approval_status — NULL (no decision yet) | 'approved' | 'changes_requested'.
--   plan_approved_at     — set only on 'approved'; NULL otherwise.
--   plan_review_note     — the customer's request-changes note; NULL when never requested (or
--                          overwritten by the next decision — this is a single "latest note"
--                          field, not a thread; see QA_PUNCH_LIST item 12 for the separate
--                          per-item comments lane).
--
-- Both columns are declared in shared/schema.ts on the tripExpertAdvisors pgTable in the same
-- commit (deploy-push durability rule — CLAUDE.md "Replit deploy-push vs. our migrations").
ALTER TABLE trip_expert_advisors ADD COLUMN IF NOT EXISTS plan_approval_status VARCHAR(20);
ALTER TABLE trip_expert_advisors ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMP;
ALTER TABLE trip_expert_advisors ADD COLUMN IF NOT EXISTS plan_review_note TEXT;
