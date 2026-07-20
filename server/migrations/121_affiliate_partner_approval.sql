-- Migration 121 — partner-level admin approval for affiliate content (provider-hub Phase 4).
--
-- "All affiliate content needs admin approval" gated ONCE at the partner level (ratified: Partner
-- Level once) — every affiliate product inherits its partner's approval, so approving a partner
-- clears its whole catalog. The D1a lesson applied to affiliate content: a partner is born
-- 'submitted' (never self-approved) and an admin approves/rejects it; public reads gate on
-- 'approved', admin reads stay ungated (the F2 provider_services pattern).
--
-- Columns mirror the provider_services / expert_templates approval set.
--
-- Grandfather (F2 pattern, no outage): after the ADD COLUMN default lands every existing row on
-- 'submitted', flip existing ACTIVE partners to 'approved' — they are already live today, so they
-- keep surfacing. Inactive partners stay 'submitted' (they were not public anyway). Future inserts
-- are born 'submitted' via the column DEFAULT.
--
-- The CHECK lives only here (not in shared/schema.ts) so drizzle-push can't enforce it against a
-- legacy value mid-deploy — and because every existing row is set to a valid value in this same
-- migration, the CHECK can never be violated (no publish-time push trap). Guarded/idempotent.

ALTER TABLE "affiliate_partners"
  ADD COLUMN IF NOT EXISTS "approval_status" varchar(20) DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reviewed_by" varchar,
  ADD COLUMN IF NOT EXISTS "rejection_reason" text;

-- Grandfather existing live partners so the catalog stays visible after the read-gate lands.
UPDATE "affiliate_partners" SET "approval_status" = 'approved'
  WHERE "is_active" = true AND "approval_status" = 'submitted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_partners_approval_status_check'
  ) THEN
    ALTER TABLE "affiliate_partners"
      ADD CONSTRAINT "affiliate_partners_approval_status_check"
      CHECK ("approval_status" IS NULL OR "approval_status" IN ('draft', 'submitted', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_partners_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "affiliate_partners"
      ADD CONSTRAINT "affiliate_partners_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
