-- Migration 113 — Escrow spine Phase 2b (docs/design/escrow-spine.md): unstick the held-NULL earnings.
--
-- Phase 1 (112) mapped the old stuck 'pending' earnings to 'held' but WITHOUT an available_at, so the
-- Phase-2 release job never clears them (it only releases rows whose available_at has passed). The
-- Phase-2 determination confirmed every such earning is REAL captured money (optimization_fee is
-- post-PaymentIntent-confirm, webhook path is payment_intent.succeeded, template earnings gate on a
-- completed purchase; coordination never creates an earning) — they are simply owed money that lost
-- its clearance date.
--
-- This backfills a RETROACTIVE clearance date: available_at = created_at + the per-surface window
-- (matching server/config/earnings-hold.config.ts — bookings/optimization/affiliate/consulting 7d,
-- template 14d, tip/referral 0d). An earning stuck for longer than its window therefore lands with an
-- available_at in the past → the release job flips it to 'releasable' on its next run. A recently
-- stuck one waits out its remaining window.
--
-- SAFETY: this makes owed earnings ELIGIBLE for release; it does NOT move money — payout is
-- admin-initiated, so an admin still explicitly initiates any transfer. Guarded/idempotent: touches
-- only status='held' AND available_at IS NULL; a second run matches nothing. Disputed rows
-- (dispute_state='open') are skipped so a dispute isn't overridden.
--
-- To size the effect before/after, run:
--   SELECT 'expert' l, count(*), coalesce(sum(amount::numeric),0) FROM expert_earnings   WHERE status='held' AND available_at IS NULL
--   UNION ALL
--   SELECT 'provider', count(*), coalesce(sum(amount::numeric),0) FROM provider_earnings WHERE status='held' AND available_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expert_earnings') THEN
    UPDATE expert_earnings
      SET available_at = created_at + (CASE
        WHEN type IN ('template_sale','template_commission') THEN interval '14 days'
        WHEN type IN ('tip','referral_bonus')                THEN interval '0 days'
        ELSE interval '7 days'
      END)
      WHERE status = 'held' AND available_at IS NULL AND dispute_state IS DISTINCT FROM 'open';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_earnings') THEN
    UPDATE provider_earnings
      SET available_at = created_at + (CASE
        WHEN type IN ('template_sale','template_commission') THEN interval '14 days'
        WHEN type IN ('tip','referral_bonus')                THEN interval '0 days'
        ELSE interval '7 days'
      END)
      WHERE status = 'held' AND available_at IS NULL AND dispute_state IS DISTINCT FROM 'open';
  END IF;
END $$;
