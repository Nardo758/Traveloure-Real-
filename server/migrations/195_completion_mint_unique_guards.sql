-- Migration 195: partial unique indexes making the completion-mint race-proof (task 1091 review).
-- The completion mint (storage.mintCompletionEarningsForBooking) creates one provider_earnings,
-- one expert_earnings, and one platform_revenue row per completed service booking. Its
-- SELECT-then-INSERT guards are not atomic under concurrent callers (traveler confirm vs the
-- hourly auto-complete scheduler vs reconciliation), so the DB must be the guard: the mint now
-- uses INSERT ... ON CONFLICT DO NOTHING against these indexes, and exactly one caller wins each
-- row. Partial indexes scoped to the booking-completion identity only — refund/adjustment rows
-- and other source types are untouched. Pre-existing duplicates (possible via repeated admin
-- dispute-reject, the old sole completion path) are deduped first, keeping the EARLIEST row —
-- preferring any paid_out row so a recorded payout is never orphaned.
-- Indexes are ALSO declared in shared/schema.ts (publish-trap rule).

-- Dedupe provider_earnings booking-mint rows: keep paid_out first, then earliest created.
DELETE FROM provider_earnings pe
USING provider_earnings keep
WHERE pe.source_type = 'booking'
  AND keep.source_type = 'booking'
  AND pe.source_id = keep.source_id
  AND pe.id <> keep.id
  AND (
    (keep.status = 'paid_out' AND pe.status <> 'paid_out')
    OR (
      (keep.status = 'paid_out') = (pe.status = 'paid_out')
      AND (keep.created_at, keep.id) < (pe.created_at, pe.id)
    )
  );

DELETE FROM expert_earnings ee
USING expert_earnings keep
WHERE ee.reference_type = 'service_booking'
  AND keep.reference_type = 'service_booking'
  AND ee.reference_id = keep.reference_id
  AND ee.id <> keep.id
  AND (
    (keep.status = 'paid_out' AND ee.status <> 'paid_out')
    OR (
      (keep.status = 'paid_out') = (ee.status = 'paid_out')
      AND (keep.created_at, keep.id) < (ee.created_at, ee.id)
    )
  );

-- Only POSITIVE rows are deduped/uniqued for platform_revenue: refund/dispute reversals
-- (reversePlatformRevenueForBooking) deliberately insert NEGATIVE compensation rows with the
-- SAME source_type/source_id, and those must remain unrestricted (partial refunds can add
-- several). The unique identity is "the one original completion-mint row" = gross_amount >= 0.
DELETE FROM platform_revenue pr
USING platform_revenue keep
WHERE pr.source_type = 'booking_commission'
  AND keep.source_type = 'booking_commission'
  AND pr.source_id = keep.source_id
  AND pr.id <> keep.id
  AND pr.gross_amount >= 0
  AND keep.gross_amount >= 0
  AND (keep.created_at, keep.id) < (pr.created_at, pr.id);

CREATE UNIQUE INDEX IF NOT EXISTS provider_earnings_booking_mint_uniq
  ON provider_earnings (source_id)
  WHERE source_type = 'booking';

CREATE UNIQUE INDEX IF NOT EXISTS expert_earnings_booking_mint_uniq
  ON expert_earnings (reference_id)
  WHERE reference_type = 'service_booking';

CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_booking_mint_uniq
  ON platform_revenue (source_id)
  WHERE source_type = 'booking_commission' AND gross_amount >= 0;
