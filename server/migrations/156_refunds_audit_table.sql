-- 156: create the `refunds` audit table — the table BOTH refund writers already INSERT into
-- but which has NEVER existed in ANY environment (`SELECT to_regclass('public.refunds')`
-- returns NULL in production AND development; confirmed by the decision-maker on both).
--
-- The live consequence: `stripePaymentService.refundServiceBooking` (the §14/§15 money-safe
-- service-booking refund used by POST /api/bookings/refund and the admin dispute-uphold
-- terminal) moves REAL money in Stripe, reverses the escrow ledger, and then throws on the
-- audit-row insert — a 500 on a refund that actually happened. Same for the
-- `charge.refunded` webhook handler. This migration creates the table so the audit row is
-- written; it changes NO refund logic (ledger-first ordering, server-derived amount,
-- deterministic Stripe idempotency key, and the atomic status claim are all untouched).
--
-- SHAPE DERIVATION — from what the code ACTUALLY writes (the code is authoritative; the
-- SQLite block in BOOKING_SYSTEM_SETUP.md is stale and targets a different DB):
--   W1 = stripe-payment.service.ts handleRefund()          (webhook `charge.refunded`)
--        writes: stripe_charge_id, stripe_payment_intent_id, amount, currency, status, created_at
--   W2 = stripe-payment.service.ts refundServiceBooking()  (the escrow refund terminal)
--        writes: booking_id, stripe_refund_id, stripe_payment_intent_id, amount, currency,
--                status, reason, created_at
--   Readers: NONE anywhere in the repo (the admin "Refunds" tab reads reversed
--            `platform_revenue` rows, not this table). Append-only audit log today.
--   Every column either writer omits is therefore NULLABLE; only the columns BOTH writers
--   always supply are NOT NULL (amount, currency).
--
-- Publish-trap posture: brand-new table, so its constraints have no legacy rows to violate.
-- Deliberately NO CHECK on `status`: W1 writes the literal 'completed' but W2 writes Stripe's
-- `refund.status`, typed `string | null` by the Stripe SDK — an EXTERNAL, open value set that
-- cannot be enumerated from our code. A CHECK (or NOT NULL) there would recreate the exact bug
-- this migration fixes: money out the door, then the audit insert throws. Nothing added to
-- scripts/preflight-prod-constraints.cjs because no CHECK is introduced.
--
-- Deliberately NO UNIQUE on stripe_refund_id / stripe_charge_id: W1 (the webhook) is not
-- idempotent on its audit write, so a Stripe webhook retry would raise a duplicate-key error
-- → a 500 back to Stripe → infinite webhook retries. An append-only log with duplicate rows is
-- strictly safer than a webhook that can never succeed. (Filed observation, not fixed here.)
--
-- FKs / ON DELETE posture:
--   booking_id → service_bookings(id) ON DELETE SET NULL. Real referential integrity against
--   the canonical booking rail (W2 refunds service_bookings, never the legacy `bookings`
--   table), but a financial audit row must OUTLIVE the booking it describes — CASCADE would
--   silently delete money-movement history. SET NULL keeps the Stripe refund/PI ids + amount.
--   No FK on the Stripe id columns (external identifiers) and no user FK (neither writer
--   records an acting user; the acting user is already audited on the booking/dispute path).

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- W2 only (W1 is a charge-level webhook with no booking context).
  -- The constraint is named EXPLICITLY with drizzle's generated FK name
  -- (<table>_<column>_<reftable>_<refcolumn>_fk) instead of Postgres's default
  -- `refunds_booking_id_fkey`: drizzle-kit push matches foreign keys by NAME, so the
  -- default name reads as "FK missing" and the deploy push would ADD a second, duplicate
  -- FK on this table. Verified with a scoped push against a freshly-migrated DB.
  booking_id VARCHAR CONSTRAINT refunds_booking_id_service_bookings_id_fk
    REFERENCES service_bookings(id) ON DELETE SET NULL,
  -- W2 writes the Stripe refund id; W1 writes the charge id. Each leaves the other NULL.
  stripe_refund_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  -- Both writers set this, but Stripe's `charge.payment_intent` is nullable → stays nullable.
  stripe_payment_intent_id VARCHAR(255),
  -- DOLLARS (both writers pass a dollar amount: charge.amount_refunded/100 and
  -- parseFloat(service_bookings.total_amount)) — same precision/scale as
  -- service_bookings.total_amount so the refund audit matches the booking it reverses.
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  -- Open value set: 'completed' (W1) or Stripe's refund.status (W2) — see note above.
  status VARCHAR(50),
  -- W2 only ('dispute_upheld', 'requested_by_customer', or the caller's reason).
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lookup by booking: the audit read any reconciliation/support query starts from, and the
-- scan Postgres must perform on every service_bookings delete to satisfy ON DELETE SET NULL
-- (PG does not auto-index the referencing side of an FK).
CREATE INDEX IF NOT EXISTS idx_refunds_booking_id ON refunds(booking_id);
-- The only handle shared with Stripe that BOTH writers record — the natural key for
-- Stripe-vs-DB reconciliation.
CREATE INDEX IF NOT EXISTS idx_refunds_payment_intent ON refunds(stripe_payment_intent_id);
