---
name: Two coexisting cart/trip add paths
description: Why "does this card write cart_items or an itinerary item" has no single answer — it depends on entry point, not content type.
---

The codebase has TWO live, working "add to my trip" mechanisms that coexist, and which one runs
depends on which UI entry point the user clicked, not on the content type:

1. **Direct-add-to-cart**: `POST /api/cart` writes a `cart_items` row directly (no itinerary item
   at all). This is `AddToExperienceDialog`'s primary/default button ("Add to my trip cart") for
   feed content, and it is the *only* path for provider-service/hotel-room "Book now" (service
   detail page, discover.tsx, cart.tsx, trip-details.tsx all post `serviceId` straight to
   `/api/cart`).
2. **Itinerary-item-first**: `POST /api/trips/:tripId/itinerary-items` creates an item that lands
   on the schema default `routing_status = "in_planning"`. `cart-projection.service.ts`'s
   `syncItemProjection` only ever projects `ready_for_checkout` items into `cart_items` — an
   `in_planning` item is invisible to the cart until a later, separate routing-status transition.
   This is only reachable today via the dialog's secondary "or add to a specific trip" list.

**Why this matters:** any audit/ruling that assumes "the cart is the view of ready-for-checkout
trip items" needs to know path 1 is still the majority real-world path (production has zero
`cart_items` rows with a non-null `itinerary_item_id` as of Aug 2026 — the projection mechanism
exists and is correctly built but has never actually fired in production). Don't assume the
newer mechanism is load-bearing just because it exists and is documented.

**How to apply:** before changing any "add to trip" surface, check which of the two paths it
currently uses (grep for `/api/cart` with `serviceId`/`contentType` vs. `/api/trips/:id/itinerary-items`)
rather than assuming a card's content type determines its write path. Full delta is in
`docs/findings/CART_SLIP_DELTA.md`.
