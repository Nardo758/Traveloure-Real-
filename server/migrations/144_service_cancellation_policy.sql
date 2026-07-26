-- Migration 144: provider_services.cancellation_policy_type — closes the §13 hardcoded-copy arm.
--
-- Ground truth (recorded, deviation from the roadmap brief): `provider_services.cancellation_policy`
-- (free-text TEXT) ALREADY EXISTS (migration 011) and is already wired end-to-end — ServiceForm's
-- "Booking Terms" card writes it, and city-feed-card.tsx renders it when present. So the brief's
-- literal column name/type (`cancellation_policy` VARCHAR(30)) would collide with that live column.
-- This migration instead adds a SEPARATE structured field: `cancellation_policy_type`, a short
-- app-enforced vocabulary (flexible | moderate | strict | non_refundable — shared/schema.ts
-- CANCELLATION_POLICY_TYPES) that lets surfaces render a real trust badge/label instead of relying
-- on a free-text paragraph. The existing `cancellation_policy` free-text column is untouched and
-- keeps its role as the human-readable detail (e.g. "Full refund if cancelled 48h before").
--
-- ADDITIVE NULLABLE, NO CHECK (vocabulary is app-enforced — the publish-time drizzle-push
-- CHECK-failure trap CLAUDE.md warns about), NO DEFAULT, NO BACKFILL: NULL = the owner hasn't
-- declared a policy type yet — the honest state (§13), never a fabricated blanket claim.

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS cancellation_policy_type VARCHAR(30);
