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

-- Step 1: remove any duplicates that exist today, keeping the oldest row per PI id.
-- Safe: only the newest duplicate is deleted; the oldest becomes the canonical row.
DELETE FROM platform_revenue
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      metadata->>'paymentIntentId' AS pi_id,
      ROW_NUMBER() OVER (
        PARTITION BY metadata->>'paymentIntentId'
        ORDER BY created_at ASC
      ) AS rn
    FROM platform_revenue
    WHERE metadata->>'paymentIntentId' IS NOT NULL
      AND metadata->>'paymentIntentId' <> ''
  ) ranked
  WHERE rn > 1
);

-- Step 2: create the partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_payment_intent_uniq
  ON platform_revenue ((metadata->>'paymentIntentId'))
  WHERE metadata->>'paymentIntentId' IS NOT NULL
    AND metadata->>'paymentIntentId' <> '';
