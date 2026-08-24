-- 222: One-time backfill of bookings_count and total_revenue on provider_services.
--
-- The live code keeps these counters in sync for NEW bookings, but any bookings
-- created before that fix still show zero on the service row. This migration
-- recalculates both counters from the existing service_bookings rows.
--
-- bookings_count: count of non-cancelled / non-refunded bookings per service,
--   matching the increment (+1 on create) / decrement (-1 on cancelled|refunded)
--   logic in storage.incrementServiceBookings / updateServiceBookingStatus.
--
-- total_revenue: sum of provider_earnings for completed bookings per service,
--   matching the addend written by storage.mintCompletionEarningsForBooking.
--
-- Fully idempotent: re-running this UPDATE just re-derives the same values from
-- the authoritative service_bookings rows; safe to run again if needed.
-- Only touches services that actually have at least one booking row.

UPDATE provider_services ps
SET
  bookings_count = COALESCE((
    SELECT COUNT(*)
    FROM service_bookings sb
    WHERE sb.service_id = ps.id
      AND sb.status NOT IN ('cancelled', 'refunded')
  ), 0),
  total_revenue = COALESCE((
    SELECT SUM(sb.provider_earnings::numeric)
    FROM service_bookings sb
    WHERE sb.service_id = ps.id
      AND sb.status = 'completed'
      AND sb.provider_earnings IS NOT NULL
  ), 0),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM service_bookings sb WHERE sb.service_id = ps.id
);
