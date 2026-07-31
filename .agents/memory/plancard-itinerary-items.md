---
name: PlanCard item source & routing actions
description: Dashboard Trip Card reads itinerary_items (not trip_items); what a row needs to show routing actions
---
The traveler dashboard Trip Card (PlanCard) is fed by `GET /api/trips/:id/plancard` → `assembleTripPlan`, which reads **itinerary_items**, NOT the older `trip_items` table. Seeding `trip_items` does nothing for the card.

**How to apply (QA seeding):** insert into `itinerary_items` with `trip_id`, `title`, `day_number`, and — for routing actions ("Send to expert" / "Add to checkout") to render — a non-null `provider_service_id` (a real `provider_services.id`) plus `routing_status` (default `in_planning`). Transport counts come from `transport_legs` with `proposal_status='confirmed'`.

**Why:** discovered during Trip-Canon deploy verification when seeded trip_items rows showed "Activities 0" on the card.

Related: cart→trip convert endpoint `POST /api/cart/convert-to-itinerary` supports service rows server-side, but the cart UI only exposes the dialog when the cart has Discover/content items (contentId+contentType) — service-only carts have no convert control (task #970). Share creation `POST /api/trips/:id/share` did not exist server-side (task #969). The `trip_empty_convert_cart` 409 gate only fires on the comparisons POST, after payment setup (task #971).

**Cart context switcher wrong-trip bug (July 2026):** switching the active trip context on /cart updates the displayed trip strip (title/dates) but getTripContext() can still return a stale tripId (observed: Nara displayed, Kyoto tripId sent to /api/optimization-payments). Any payment/optimize targeting from cart context must be verified against the actual request body, not the visible strip. Also: "Plan a Trip" auto-generates a full itinerary (~17 items), so UI-created trips are never empty — seed/empty via DB for empty-trip gates.
