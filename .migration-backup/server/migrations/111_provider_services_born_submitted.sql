-- Migration 111 — F2 born-approved fix (approval lifecycle D1a CLOSED)
--
-- Flips the provider_services.approval_status column DEFAULT from 'approved' to 'submitted'
-- so newly created listings are born 'submitted' (they enter the existing admin review queue
-- — GET /api/admin/custom-services/pending + approve/reject, which operate on provider_services)
-- instead of born-approved. Baseline (000) and migration 011 both set DEFAULT 'approved'; this
-- corrects that.
--
-- GRANDFATHER — CRITICAL: this changes the column DEFAULT only. It performs NO UPDATE over
-- existing rows. Existing provider_services keep their stored approval_status (the live catalog
-- is grandfathered 'approved' and stays publicly visible through the completed read-gate). A
-- backfill to 'submitted' would hide the entire live catalog behind the review queue — a
-- self-inflicted outage — and is intentionally NOT done here (ratified Jul 14, 2026).
--
-- Idempotent: ALTER COLUMN ... SET DEFAULT is naturally idempotent (re-running sets the same
-- default). Guarded so it only touches the default, never the data.

DO $$
BEGIN
  -- Only act if the column exists (defensive; it is created by 000/011).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_services'
      AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE provider_services ALTER COLUMN approval_status SET DEFAULT 'submitted';
  END IF;
END $$;
