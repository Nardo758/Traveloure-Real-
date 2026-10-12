-- 375 — an affiliate partner states its licence, its attribution and whether it may show publicly
-- (TC-2 Phase 1, decision 1; ledger `2026-10-12-tc2-affiliate-legs`). HELD — Migration 375 SQL awaits
-- the decision-maker's comment on its PR.
--
-- Three additive, NULLABLE columns on `affiliate_partners`, declared in `shared/schema.ts` (deploy-push
-- durability rule). NO DEFAULT, NO CHECK, NO INDEX, NO FK, NO BACKFILL (publish-trap posture).
--   · license      — the licence the partner's links and content are used under. NULL = not stated.
--   · attribution  — the words shown beside the partner's option. NULL = not stated.
--   · public_ok    — TRUE = the partner may appear on public pages. NULL = never answered, FALSE = no.
-- A partner whose licence or attribution is NULL does not render (decision 1): the leg resolver's
-- registry gate reads all three columns and refuses a row missing either of the first two.
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS license varchar(40);
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS attribution varchar(300);
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS public_ok boolean;
