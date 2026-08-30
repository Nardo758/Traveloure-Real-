-- Coordination fee CAPTURE + paid-signal ledger (CLAUDE.md §7 "Quote-only → CAPTURED",
-- decision-maker ratified Jul 22, 2026).
--
-- Two pieces:
--   1. coordination_fee_credits — the paid-signal LEDGER. One row per PAID Event-branch
--      optimize fee (recorded by optimization-payments/confirm), applied ONCE against a
--      future coordination fee. This is what makes the "$19.99 credited-toward-coordination"
--      promise honest: the credit exists only when the optimize fee was actually paid, and
--      consumed_by_coordination_id (+ the atomic claim in the pay route) prevents double-credit.
--   2. coordination_states fee-payment columns — the fee CHARGE state (1:1 per engagement).
--
-- New table → its FKs/uniques are created with the table (no legacy rows). The new
-- coordination_states columns default 'unpaid'/0, so the fee_payment_status CHECK has no
-- existing row to violate → NO publish-time drizzle-push remap trap.

-- 1. Paid-signal ledger --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coordination_fee_credits (
  id                          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  user_id                     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The paid optimize-fee PaymentIntent. UNIQUE → one credit per real payment (idempotent
  -- insert from optimization-payments/confirm via ON CONFLICT DO NOTHING).
  source_payment_intent_id    VARCHAR NOT NULL UNIQUE,
  amount_cents                INTEGER NOT NULL,
  currency                    VARCHAR(10) NOT NULL DEFAULT 'USD',
  event_type                  VARCHAR(50),
  -- NULL = available; set (atomically, WHERE ... IS NULL) when consumed by a coordination charge.
  consumed_by_coordination_id VARCHAR REFERENCES coordination_states(id) ON DELETE SET NULL,
  consumed_at                 TIMESTAMP,
  created_at                  TIMESTAMP DEFAULT NOW()
);

-- Pay route claims the newest AVAILABLE credit for a user; index that lookup.
CREATE INDEX IF NOT EXISTS idx_coord_fee_credits_available
  ON coordination_fee_credits (user_id, created_at DESC)
  WHERE consumed_by_coordination_id IS NULL;

-- 2. Coordination fee-payment columns (the charge state, 1:1 per engagement) ----------
ALTER TABLE coordination_states
  ADD COLUMN IF NOT EXISTS fee_payment_status    VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fee_payment_intent_id VARCHAR,
  ADD COLUMN IF NOT EXISTS fee_amount_cents      INTEGER,   -- NET charged (after credit)
  ADD COLUMN IF NOT EXISTS fee_credit_cents      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_paid_at           TIMESTAMP;

-- Money state machine at the DB (§10 decision 3=A). New column defaults 'unpaid' → every
-- existing row satisfies the CHECK, so this is safe to add atomically with no remap step.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coordination_states_fee_payment_status_check'
  ) THEN
    ALTER TABLE coordination_states
      ADD CONSTRAINT coordination_states_fee_payment_status_check
      CHECK (fee_payment_status IN ('unpaid', 'pending', 'paid'));
  END IF;
END $$;
