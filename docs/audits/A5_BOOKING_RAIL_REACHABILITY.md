# A5: Reachability of the booking-agent rail

**Method:** static reachability. Each usage is walked up its import chain to a `<Route>` in `client/src/App.tsx`, or
to a dead end, with `file:line` at every hop. No booking was submitted, because this is a money-adjacent rail and
the ruling is observe-only. **Reachable** means "a mounted route renders it under a condition that the seed data
can satisfy". It does **not** mean the click was exercised (see NOT PROVEN).

## 1. `useAgentBooking` and the Travelpayouts cards

- `useAgentBooking` is at `components/travelpayouts/useAgentBooking.ts:24`. It sends POST `/api/affiliate-booking-requests` (`:32`).
  - It does nothing without `item.bookingToken` (`:60`).
  - For a guest it opens the sign-in modal (`:61-63`).
- The barrel `travelpayouts/index.ts` is **imported by nothing**.

| Card | Chain to route | Reachable? |
|---|---|---|
| HotelCard (`button-book-hotel-*`, `HotelCard.tsx:62`) | `experience-template.tsx:99` → `BookingComCatalogSection` (`:282`), only when the tab type is `hotels` and a destination is set → `/experiences/:slug` (`App.tsx:576`) | **Yes, conditional.** Signed-in only (`/api/catalog/booking` requires auth, `content.routes.ts:1573`), and only on templates that seed an accommodations tab. |
| ActivityCard (`button-book-activity-*`, `:97`) | `experience-template.tsx:98` → `TravelpayoutsActivities` (`:383`), tab type `activities` → `/experiences/:slug` | **Yes, conditional**, signed-in only (`content.routes.ts:1465`). |
| FlightCard (`button-book-flight-*`, `:80`) | `FlightPriceGrid.tsx:36,325` → `experience-template.tsx:90`, tab type `flights` | **Narrow.** Only the `travel` and `golf-trip` templates seed a flights tab (`server/seeds/experience-template-tabs.seed.ts:1972, 4796, 4919`). It also needs an origin city. |
| ESimCard | `ESimSidebarWidget` (`experience-template.tsx:326`), flights tab plus a likely-international destination | **Very narrow.** The second importer, `pages/itinerary.tsx`, is unmounted. |
| CarRental, Transfer, GroundTransport, Insurance, LuggageStorage, NomadRoute cards | Only through the unimported barrel | **DEAD** |
| `BookWithExpertButton` | — | It is a **navigation** to `/experts`, not an agent booking. |

## 2. `useContentAgentBooking`

- Defined at `hooks/use-content-agent-booking.ts:48`. It sends POST to the same endpoint (`:63`).
- It does nothing without a booking reference (`:54-59, :91`).

| Surface | Reachable? |
|---|---|
| `/deals` `button-book-*` (`deals.tsx:271`, only when the deal has a `bookingToken`) | **Yes.** Nav "Today's Deals" (`nav-config.ts:264`). |
| `/discover/location/:city` AddOnAgentCard (`discover-location.tsx:1578`, 12go `partnerRoute`) | **Yes** (default filter). |
| `/itinerary-comparison/:id` `button-partner-agent-book-*` (`itinerary-comparison.tsx:307`, details dialog, transport/event items) | **Yes, conditional.** |
| `/transportation` TwelveGoWidget (`widgets/TwelveGoWidget.tsx:34, :97`) | **URL-only.** No in-app link to `/transportation` exists. INVISIBLE surface. |
| Fever tickets on `/experiences/:slug` (`fever-events-section.tsx:40`) | **Mounted, but no seeded tab reaches it.** There is no `events` tab slug in the seed. |
| TransportHub, MultiDayPassCard, TransportBookingCard (under `my-itinerary` / `itinerary` pages), CityDetailView, TwelveGoTransport, `affiliate-transport-products.tsx` | **DEAD** (unmounted pages or no importer) |

## 3. The "concierge booking" flows

| Entry | Writes `affiliate_booking_requests`? | Reachable? |
|---|---|---|
| **Slip → Finish card → Finalize → "Booking agent"** (`FinalizeBookingModal.tsx:91-109`; path `App.tsx:673` → `slip-view.tsx:55` → `SlipView.tsx:1897` → `SlipRail.tsx:1336` FinishCard, owner-only `:1148`, `slip-action-finalize-plan` `:1206-1220`) | **Yes**, one row per item that carries a `bookingToken` | **Yes, conditional.** The option is disabled unless the server attached booking tokens, i.e. items linked to an `affiliate_bookable` product (`FinalizeBookingModal.tsx:44-46, 148-150`; `server/services/trip-plan.service.ts:723-757`). |
| Finalize → "Concierge" | No. It only navigates to `/concierge?intent=` (`FinalizeBookingModal.tsx:132-135`). | Yes |
| `/concierge` submit (POST `/api/concierge/quote`) and DoneForYouCard (PATCH tier `full`) | No: a lead or quote, and a `coordination_states` engagement | Yes |
| Trip Card `AffiliateBookButton` (`ActivitiesSection.tsx:845`, owner-only), `TransportSection` book-via-agent, `UpNextHero` book-ride (mobile, live day only) | Yes (single rows) | Yes, conditional (`/trip/:id`) |
| Booking Concierge **listing** (`booking_concierge`) | Yes, **server-side after checkout**: `createHandoffRequestsForBooking` (`server/services/concierge-handoff.service.ts:156`), called from `payments.routes.ts:848` and `checkout-claim.service.ts:1143` | Server path mounted. The client add-to-cart path for that listing was **not traced**. |
| `EscalationCTA`, AI-assistant "escalate to team" | No (expert request, escalation) | Yes |

**Verdict:** the concierge booking flow **is reachable** from a mounted traveler surface, but only one path creates
agent bookings in bulk: Slip → Finalize → "Booking agent". It is **enabled only when plan items carry
server-minted booking tokens**. Everything labelled "concierge" on `/concierge` produces leads or coordination
engagements, not agent bookings. That is an **INCONSISTENT_AFFORDANCE** (the word "concierge" names three different
products).

**Server:** POST `/api/affiliate-booking-requests` is defined at `server/routes/content.routes.ts:7638` and mounted by
`app.use(contentRoutes)` (`server/routes.ts:1167`). It requires auth and exactly one booking reference (400 otherwise,
`:7713`; 404 if the reference is unresolvable, `:7718`), and checks trip ownership (`:7652-7658`). It inserts into
`affiliate_booking_requests` with `status='pending'` and `expert_id=NULL` (pool-claimed). The `affiliate_url` is kept
server-side and stripped from the response (`:7751-7767`).

## NOT PROVEN

- No agent-booking click was exercised, so no DB row was diffed. A proof run needs a seeded `affiliate_bookable`
  product linked to a plan item, then the slip Finalize → "Booking agent", then a diff of `affiliate_booking_requests`.
- The client path that adds a Booking Concierge listing to the cart was not traced.
- The Travelpayouts catalog feeds need live partner APIs. With the stub keys in this environment, the cards render
  nothing (they return `null` when there are no items), so reachability on `/experiences/:slug` is static only.
