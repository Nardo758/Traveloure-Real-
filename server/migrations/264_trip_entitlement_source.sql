-- 264_trip_entitlement_source.sql — trip_entitlements provenance (ledger
-- 2026-08-29-trip-pass-provenance). Additive, NO CHECK constraint (publish-trap posture —
-- source vocabulary ('stripe' | 'manual' | 'beta') is validated service-side in
-- grantTripPass, mirroring plan_memberships.source). Idempotent: IF NOT EXISTS.
--
-- The DEFAULT 'stripe' auto-backfills every existing row on apply, which is correct:
-- every trip_entitlements row that predates this migration was granted through the
-- Stripe-verified confirm path (migration 262 / trip-pass.routes.ts) — there was no
-- other writer. Any Trip Pass sold on prod between migration 262 landing and this one
-- applying is guaranteed to land as 'stripe' by the same DEFAULT, so it can never be
-- silently mislabeled by this backfill.

ALTER TABLE trip_entitlements ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'stripe';
