-- Marketing-only cancellation. No billing, payment, fee, or entitlement mutation.
-- Both BEFORE booking triggers and the sender lock the same users row. An accepted
-- send precedes the booking commit, or the committed booking cancels the unsent row.
CREATE OR REPLACE FUNCTION cancel_itinerary_followups_on_booking()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text; booking_trip text; booking_created timestamp;
BEGIN
  actor := COALESCE(to_jsonb(NEW)->>'traveler_id', to_jsonb(NEW)->>'user_id');
  booking_trip := to_jsonb(NEW)->>'trip_id';
  booking_created := (to_jsonb(NEW)->>'created_at')::timestamp;
  IF TG_TABLE_NAME = 'coordination_bookings' THEN
    SELECT user_id, trip_id INTO actor, booking_trip FROM coordination_states
      WHERE id = to_jsonb(NEW)->>'coordination_id';
  END IF;
  IF actor IS NULL OR COALESCE(to_jsonb(NEW)->>'status', 'pending')
      IN ('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed') THEN
    RETURN NEW;
  END IF;
  PERFORM id FROM users WHERE id = actor FOR UPDATE;
  UPDATE email_outbox SET status = 'cancelled', retry_after = NULL,
    last_error = 'Booking or payment started', updated_at = NOW()
  WHERE metadata->>'travelerFollowupVersion' = '1' AND metadata->>'travelerId' = actor
    AND status IN ('pending', 'failed', 'processing')
    AND EXISTS (SELECT 1 FROM itinerary_comparisons c WHERE c.id = metadata->>'itineraryId'
      AND (booking_created >= c.created_at OR booking_trip = c.trip_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS itinerary_followup_booking_guard ON service_bookings;
CREATE TRIGGER itinerary_followup_booking_guard
  BEFORE INSERT OR UPDATE ON service_bookings
  FOR EACH ROW EXECUTE FUNCTION cancel_itinerary_followups_on_booking();
DROP TRIGGER IF EXISTS itinerary_followup_booking_guard ON bookings;
CREATE TRIGGER itinerary_followup_booking_guard
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION cancel_itinerary_followups_on_booking();
DROP TRIGGER IF EXISTS itinerary_followup_booking_guard ON affiliate_booking_requests;
CREATE TRIGGER itinerary_followup_booking_guard
  BEFORE INSERT OR UPDATE ON affiliate_booking_requests
  FOR EACH ROW EXECUTE FUNCTION cancel_itinerary_followups_on_booking();
DROP TRIGGER IF EXISTS itinerary_followup_booking_guard ON coordination_bookings;
CREATE TRIGGER itinerary_followup_booking_guard
  BEFORE INSERT OR UPDATE ON coordination_bookings
  FOR EACH ROW EXECUTE FUNCTION cancel_itinerary_followups_on_booking();

CREATE OR REPLACE FUNCTION cancel_itinerary_followups_on_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE email_outbox SET status = 'cancelled', retry_after = NULL,
    last_error = 'Itinerary deleted', updated_at = NOW()
  WHERE metadata->>'travelerFollowupVersion' = '1' AND metadata->>'itineraryId' = OLD.id
    AND status IN ('pending', 'failed', 'processing');
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS itinerary_followup_delete_guard ON itinerary_comparisons;
CREATE TRIGGER itinerary_followup_delete_guard BEFORE DELETE ON itinerary_comparisons
  FOR EACH ROW EXECUTE FUNCTION cancel_itinerary_followups_on_delete();