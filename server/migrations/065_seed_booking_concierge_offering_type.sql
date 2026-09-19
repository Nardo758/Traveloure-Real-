-- Phase 3.2.1: Booking Concierge expert offering type (Paid Booking Concierge).
--
-- ONE coordination-tier offering type: an expert facilitates an OFF-SITE /
-- affiliate (deeplink) booking and logs it onto the traveler's Trip — the act
-- this brief monetizes. Distinct from `done_for_you_booking` ("book
-- everything"): this is a per-item facilitation, opt-in by the expert creating
-- an APPROVED provider_services row that references it via expert_offering_type_id,
-- market-scoped via expert_neighborhoods. Mirrors the 039 coordination seed.
--
-- ANNOTATION (superseded, ledger `2026-09-18-platform-concierge-listing`): the "market-scoped via
-- expert_neighborhoods" clause above describes this migration's STATED INTENT at the time, never
-- a live code path — no route or service that surfaces or ranks a `booking_concierge` listing has
-- ever read `expert_neighborhoods`. The two live surfaces (`GET /api/experts`'s location filter,
-- `lead-routing.service.ts`'s scorer) both read `local_expert_forms.destinations` instead, and
-- `expert_neighborhoods` (Locked Decision 27's ratified-claim-only table) gates a DIFFERENT
-- feature entirely (the city-page "one local expert per neighborhood" card and upsell
-- endorsements). See `docs/design/PLATFORM_CONCIERGE_LISTING_BRIEF.md` §1 for the finding and
-- migration 313 for the mechanism that actually surfaces a Booking Concierge listing per market.
-- Left in place per §13/ledger posture on a superseded comment — annotated, not rewritten.
--
-- service_tier='coordination' and delivery_formats=['done_for_you'] satisfy the
-- migration-040 completeness gate. Idempotent: ON CONFLICT (offering_type_key)
-- DO NOTHING. Adds catalog vocabulary only — no rate/data change to anything else.
INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('booking_concierge', 'coordination', 'Booking Concierge', 'I''ll book this off-site item and add it to your trip.', ARRAY['done_for_you'], false, 45)
ON CONFLICT (offering_type_key) DO NOTHING;
