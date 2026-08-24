-- Migration 112 — Escrow spine Phase 1: unify the earning ledger vocabulary
--
-- Design of record: docs/design/escrow-spine.md. One earning_status vocabulary across BOTH
-- expert_earnings and provider_earnings: held / releasable / paid_out / reversed.
--
-- Phase 1 is PURE UNIFICATION — zero money-behavior change. Releasability stays COMPUTED from
-- available_at in the summary functions (as today); this migration only renames the stored
-- vocabulary and adds the dispute column + CHECK. Concretely:
--   * All non-terminal statuses (pending / available / confirmed / anything not paid_out) → 'held'.
--     This preserves releasability because the summaries compute "releasable" as
--     status='releasable' OR (status='held' AND available_at <= now AND dispute_state <> 'open').
--     An 'available'+available_at<=now row (was releasable) → 'held'+available_at<=now → still
--     releasable. A 'pending' row (was stuck/non-releasable, no available_at) → 'held'+null → still
--     non-releasable. Balances are identical pre/post.
--   * 'paid_out' is preserved (terminal).
--   * 'releasable' / 'reversed' are CHECK-allowed forward-compat (physically set by Phase 2's release
--     job / Phase 4's reversal — a status CHECK's failure mode is asymmetric: allowing an unwritten
--     value never 500s; omitting a written one does).
--
-- The stuck-'pending' earnings stay non-releasable here on purpose — whether they represent real
-- captured money (and should clear) is a release-semantics call that belongs to Phase 2, not a silent
-- Phase-1 money change. The affiliate ledger (getAffiliateEarningsSummary / expertShare) is a SEPARATE
-- table and is intentionally untouched.
--
-- Guarded/idempotent. The status remap is a value rewrite (like migration 109's delivery_method remap),
-- not a destructive change; existing releasability is preserved by the companion summary rewrite.

DO $$
BEGIN
  -- ── expert_earnings ────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expert_earnings') THEN
    ALTER TABLE expert_earnings ADD COLUMN IF NOT EXISTS dispute_state varchar(20) DEFAULT 'none';
    -- Remap stored vocabulary, PRESERVING releasability (the old summaries computed "ready" as
    -- status='available' AND (available_at IS NULL OR available_at <= now)):
    --  ① was-releasable ('available' + null/past available_at) → 'releasable' (stays payable)
    UPDATE expert_earnings SET status = 'releasable'
      WHERE status = 'available' AND (available_at IS NULL OR available_at <= now());
    --  ② everything else non-terminal ('available'+future = still in hold window, 'pending' = stuck,
    --     NULL, 'confirmed', …) → 'held' (stays non-releasable until available_at clears)
    UPDATE expert_earnings SET status = 'held'
      WHERE status NOT IN ('held','releasable','paid_out','reversed');
    ALTER TABLE expert_earnings ALTER COLUMN status SET DEFAULT 'held';
    ALTER TABLE expert_earnings DROP CONSTRAINT IF EXISTS expert_earnings_status_check;
    ALTER TABLE expert_earnings ADD CONSTRAINT expert_earnings_status_check
      CHECK (status IN ('held','releasable','paid_out','reversed'));
  END IF;

  -- ── provider_earnings ──────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_earnings') THEN
    ALTER TABLE provider_earnings ADD COLUMN IF NOT EXISTS dispute_state varchar(20) DEFAULT 'none';
    UPDATE provider_earnings SET status = 'releasable'
      WHERE status = 'available' AND (available_at IS NULL OR available_at <= now());
    UPDATE provider_earnings SET status = 'held'
      WHERE status NOT IN ('held','releasable','paid_out','reversed');
    ALTER TABLE provider_earnings ALTER COLUMN status SET DEFAULT 'held';
    ALTER TABLE provider_earnings DROP CONSTRAINT IF EXISTS provider_earnings_status_check;
    ALTER TABLE provider_earnings ADD CONSTRAINT provider_earnings_status_check
      CHECK (status IN ('held','releasable','paid_out','reversed'));
  END IF;
END $$;
