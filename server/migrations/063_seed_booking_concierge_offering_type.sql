-- Phase 3.2.1: Booking Concierge expert offering type (Paid Booking Concierge).
--
-- ONE coordination-tier offering type: an expert facilitates an OFF-SITE /
-- affiliate (deeplink) booking and logs it onto the traveler's Trip — the act
-- this brief monetizes. Distinct from `done_for_you_booking` ("book
-- everything"): this is a per-item facilitation, opt-in by the expert creating
-- an APPROVED provider_services row that references it via expert_offering_type_id,
-- market-scoped via expert_neighborhoods. Mirrors the 039 coordination seed.
--
-- service_tier='coordination' and delivery_formats=['done_for_you'] satisfy the
-- migration-040 completeness gate. Idempotent: ON CONFLICT (offering_type_key)
-- DO NOTHING. Adds catalog vocabulary only — no rate/data change to anything else.
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('booking_concierge', 'coordination', 'Booking Concierge', 'I''ll book this off-site item and add it to your trip.', ARRAY['done_for_you'], false, 45)
ON CONFLICT (offering_type_key) DO NOTHING;
