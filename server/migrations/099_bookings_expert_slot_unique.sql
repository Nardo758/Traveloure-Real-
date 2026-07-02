-- Migration 099: Prevent double-booking of the same expert time slot.
--
-- Adds a partial unique index on (expert_id, booking_date, booking_time).
-- Partial (WHERE all three NOT NULL) so that non-expert bookings — where
-- expert_id is NULL — are never incorrectly treated as conflicting.
--
-- This is the ultimate database-level safety net: even if application-level
-- transaction logic has a race condition, Postgres will reject the second
-- insert with error code 23505 (unique_violation) which the route handler
-- converts to a 409 Conflict response.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_expert_slot_unique_idx
  ON bookings (expert_id, booking_date, booking_time)
  WHERE expert_id   IS NOT NULL
    AND booking_date IS NOT NULL
    AND booking_time IS NOT NULL;
