-- Smoke 13 #2 (ledger `2026-10-06-smoke13-handoff-money`). SQL HELD for the decision-maker's ruling
-- before merge. DATA ONLY: no table, column, index, CHECK, DEFAULT, function, trigger or DO block.
--
-- The `charge.refunded` webhook recorded a RELEASED HOLD as a `succeeded` refund: cancelling an
-- uncaptured manual-capture PaymentIntent (the handoff hold, the on-trip-support hold) makes Stripe
-- mark the charge refunded and attach a refund object, but nothing was ever taken. The webhook no
-- longer records those (stripe-payment.service.ts `handleRefund`, `charge.captured === false`).
-- The rows already written are MARKED, never deleted (§17: a money record is append-only in
-- spirit; a human may still need to read what was recorded): their status becomes
-- `voided_uncaptured`.
--
-- WHICH ROWS: a `refunds` row whose PaymentIntent is a handoff hold that was NEVER CAPTURED — the
-- request's `payment_intent_id` with `captured_at IS NULL`, or its
-- `on_trip_support_payment_intent_id` with `on_trip_support_accepted_at IS NULL` (on-trip support
-- is captured inside the same claim that stamps `accepted_at`, and the stamp is reverted when the
-- capture fails). Only these two PaymentIntents are manual-capture in this codebase; every other
-- PaymentIntent captures at confirmation, so its refunds are real and are not touched.
--
-- IDEMPOTENT: the WHERE excludes rows already marked, so a second run updates nothing.
UPDATE refunds r
   SET status = 'voided_uncaptured'
 WHERE r.status IS DISTINCT FROM 'voided_uncaptured'
   AND r.stripe_payment_intent_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM expert_requests er
      WHERE er.handoff_kind IS NOT NULL
        AND (
          (er.payment_intent_id = r.stripe_payment_intent_id AND er.captured_at IS NULL)
          OR (er.on_trip_support_payment_intent_id = r.stripe_payment_intent_id AND er.on_trip_support_accepted_at IS NULL)
        )
   );
