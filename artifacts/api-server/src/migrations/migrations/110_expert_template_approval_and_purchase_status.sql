-- Migration 110: Expert-template approval workflow + template_purchases status CHECK
-- (Marketplace activation, Phase A — shared approval queue = Phase 4's queue.
--  Decisions locked by the decision-maker: 1A shared-queue, 2A USD-now, 3A DB CHECK.)
--
-- ── PART 1: expert_templates approval workflow ───────────────────────────────
-- expert_templates had NO approval concept — only isPublished (expert-controlled).
-- Add the SAME approval column set provider_services already carries (consolidated
-- there from expert_custom_services in migration 0007) so ONE shared admin queue
-- can draw from both tables:
--   approval_status varchar(20)  (draft → submitted → approved / rejected)
--   submitted_at / reviewed_at   timestamps
--   reviewed_by                  FK → users (ON DELETE SET NULL)
--   rejection_reason             text (captured on reject)
--
-- BACKFILL — nothing marketplace-side is grandfathered (the marketplace is new and
-- was never surfaced; the purchase UI is orphaned). Existing rows:
--   is_published = true  → 'submitted'  (they intended to go live → enter the queue
--                                         for admin review; NOT auto-approved)
--   is_published = false → 'draft'      (the ADD COLUMN default)
-- ⚠️ EFFECT TO NOTE (recorded, not silent): templates that were is_published=true were
-- "live/purchasable" under the old !isPublished gate. After this migration + the new
-- approved-AND-published purchase gate, they are NOT purchasable until an admin approves
-- them. ZERO live impact today (the purchase UI is orphaned — nothing can reach checkout),
-- but anyone tracking "these were published" must know they now need admin approval to sell.
-- The backfill is guarded on approval_status='draft' so a re-run never reverts an
-- admin-approved row back to 'submitted'.
--
-- ── PART 2: template_purchases.status CHECK + default flip (decision 3A) ──────
-- Enforce the money state machine at the DB (the migration-109 lesson), not just app code.
-- ENUMERATED status set — every write to template_purchases.status in the codebase:
--   'pending_payment'  routes.ts (Stripe create; also the resting state of an abandoned
--                      checkout — the /confirm failure branch returns 402 and writes nothing)
--   'completed'        routes.ts (Stripe /confirm success) + experts.routes.ts (DARK/unmounted
--                      legacy create — never executes; value already in-set regardless)
--   'refunded'         NEVER written today — documented in the column comment; included as
--                      forward-compat (allowing an unwritten value cannot cause a 500; only
--                      OMITTING a written value can). No 'failed'/'cancelled'/'processing'
--                      is ever written, so none is needed.
-- Default flips 'completed' → 'pending_payment' so a purchase row can never be born completed.
--
-- provider_services is intentionally NOT touched here — it already has the full approval
-- column set, grandfathered to 'approved'. Wiring its read-gate + deciding its born-approved
-- default flip is PHASE 4's reduced scope (the queue itself is built here — Phase 4 wires, not rebuilds).
--
-- Guarded/idempotent per the 107–109 pattern: ADD COLUMN IF NOT EXISTS, pg_constraint probes,
-- backfill guarded to be re-run-safe, refusal guard on any pre-existing out-of-set status.

DO $$
BEGIN
  IF to_regclass('expert_templates') IS NULL OR to_regclass('template_purchases') IS NULL THEN
    RAISE EXCEPTION 'Migration 110 REFUSED: expert_templates / template_purchases missing';
  END IF;
END $$;

-- ── PART 1: expert_templates columns ─────────────────────────────────────────
ALTER TABLE expert_templates ADD COLUMN IF NOT EXISTS approval_status  varchar(20) DEFAULT 'draft';
ALTER TABLE expert_templates ADD COLUMN IF NOT EXISTS submitted_at     timestamp;
ALTER TABLE expert_templates ADD COLUMN IF NOT EXISTS reviewed_at      timestamp;
ALTER TABLE expert_templates ADD COLUMN IF NOT EXISTS reviewed_by      varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expert_templates ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Backfill (guarded on approval_status='draft' → re-run-safe, never reverts an approved row):
UPDATE expert_templates
   SET approval_status = 'submitted'
 WHERE is_published = true
   AND approval_status = 'draft';

-- approval_status CHECK (idempotent via pg_constraint probe):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'expert_templates'::regclass AND conname = 'expert_templates_approval_status_check'
  ) THEN
    ALTER TABLE expert_templates
      ADD CONSTRAINT expert_templates_approval_status_check
      CHECK (approval_status IS NULL OR approval_status IN ('draft','submitted','approved','rejected'));
  END IF;
END $$;

-- ── PART 2: template_purchases.status ────────────────────────────────────────
-- Refusal guard: refuse rather than half-apply if any existing row holds an out-of-set status.
DO $$
DECLARE
  bad_tp TEXT;
BEGIN
  SELECT string_agg(DISTINCT status, ', ')
    INTO bad_tp
    FROM template_purchases
    WHERE status IS NOT NULL
      AND status NOT IN ('pending_payment','completed','refunded');
  IF bad_tp IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 110 REFUSED: template_purchases.status holds out-of-set value(s) [%]. Extend the enumerated set before running.',
      bad_tp;
  END IF;
END $$;

-- Flip the default off 'completed' so a purchase row is never born completed:
ALTER TABLE template_purchases ALTER COLUMN status SET DEFAULT 'pending_payment';

-- status CHECK (idempotent via pg_constraint probe):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'template_purchases'::regclass AND conname = 'template_purchases_status_check'
  ) THEN
    ALTER TABLE template_purchases
      ADD CONSTRAINT template_purchases_status_check
      CHECK (status IS NULL OR status IN ('pending_payment','completed','refunded'));
  END IF;
END $$;

-- Reversal (manual):
--   ALTER TABLE expert_templates  DROP CONSTRAINT IF EXISTS expert_templates_approval_status_check;
--   ALTER TABLE template_purchases DROP CONSTRAINT IF EXISTS template_purchases_status_check;
--   ALTER TABLE template_purchases ALTER COLUMN status SET DEFAULT 'completed';
--   (the expert_templates columns + backfill are additive; drop columns only if fully reverting the feature)
