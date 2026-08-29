-- 262_trip_entitlements.sql — Trip Pass per-trip entitlement (ruling 2026-08-29-trip-pass).
-- Additive; no CHECK constraints (publish-trap posture — status/plan_key validated app-side).
-- Declared in shared/schema.ts including BOTH partial unique indexes (deploy-push durability
-- rule: an index only in migration SQL is dropped by the publish push and never recreated).
-- Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS trip_entitlements (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  plan_key varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  granted_at timestamp NOT NULL DEFAULT now(),
  source_payment_id varchar(255),
  allowances_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- One ACTIVE pass per trip: the second purchase is rejected before any PaymentIntent,
-- and this index is the last line if a race slips past the pre-check.
CREATE UNIQUE INDEX IF NOT EXISTS trip_entitlements_active_trip_uniq
  ON trip_entitlements (trip_id) WHERE status = 'active';

-- Idempotent grant: one entitlement per PaymentIntent, so a double confirm/webhook
-- inserts nothing the second time.
CREATE UNIQUE INDEX IF NOT EXISTS trip_entitlements_source_payment_uniq
  ON trip_entitlements (source_payment_id) WHERE source_payment_id IS NOT NULL;
