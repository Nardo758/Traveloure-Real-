-- Migration 244: DB-level uniqueness guard on platform_revenue for PaymentIntent ids
-- Task 1573: prevents concurrent duplicate Stripe webhooks from writing two revenue rows.
--
-- The metadata JSONB column stores { paymentIntentId: "pi_xxx" } on rows written by the
-- payment_intent.succeeded webhook handler. Without a DB constraint the existing
-- read-then-write check (hasPaymentIntentRevenue → recordRevenueEvent) has a race window:
-- two copies of the same event delivered ~150 ms apart both pass the read before either
-- commits the write, yielding duplicate rows.
--
-- We use a partial unique expression index so the constraint applies only to rows that
-- carry a paymentIntentId; rows from other code paths (affiliate catalog syncs, manual
-- credits, reversal rows) are unaffected.
--
-- NO rows are deleted here. Removing financial ledger rows without first reversing the
-- corresponding daily_revenue_summary increments and auditing related expert/provider
-- earnings would create silent accounting inconsistencies. If PI-keyed duplicate rows
-- exist in a target database, this migration will fail loudly — the correct signal that
-- a manual reconciliation is required before the index can be applied. See follow-up
-- task #1579 for the production pre-flight audit procedure.

CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_payment_intent_uniq
  ON platform_revenue ((metadata->>'paymentIntentId'))
  WHERE metadata->>'paymentIntentId' IS NOT NULL
    AND metadata->>'paymentIntentId' <> '';
