# Action → Effect Graph Audit — Phase 0 Inventory (Traveler Surfaces)

**Mode:** read-only. No code changed. **Base:** `main` @ `858d28f`.
**Status:** Phase 0 complete. **HARD STOP — waiting for GO** before Phase 1 tracing and Phase 2 journeys.

**How this was built:** routes were read from the mounted router (`client/src/App.tsx`). Triggers were
enumerated per surface by static reading and cited `file:line`, following each handler one hop.
**No claim here is behaviourally proven (R-4).** The "early signals" in §5 are static readings that
Phase 1 and Phase 2 must confirm or refute. None of them is a finding yet.

---

## 1. Surfaces (traveler scope, from the mounted router)

All routes live in one `<Switch>` in `Router()` at `App.tsx:352`. Global providers wrap the router:
`App.tsx:1318-1338`.

### 1a. Public and marketplace

| Route | Component | Mount `App.tsx:` | Shell |
|---|---|---|---|
| `/` | LandingPage | 363 | Layout |
| `/how-it-works` | HowItWorks | 369 | Layout |
| `/pricing` | Pricing | 372 | Layout |
| `/concierge` (`/optimize` redirects here with `?tier=ai`, :387) | ConciergePage | 384 | own |
| `/experts` | ExpertsPage | 399 | BrowseShell |
| `/experts/:id`, `/s/:handle`, `/p/:handle`, `/local-experts/:id` | StorefrontPage | 404, 417, 420, 431 | own |
| `/local-experts` | ExpertsPage | 428 | Layout |
| `/ready-made/:id` | ReadyMadeDetailPage | 412 | own |
| `/destinations`, `/ready-made`, `/events`, `/services` | DiscoverPage (`surface` prop) | 451, 454, 457, 460 | BrowseShell |
| `/discover` | DiscoverRedirect (maps `?tab=` to a surface) | 465 | — |
| `/discover/location/:city` (`/city/:slug` redirects here, :473) | DiscoverLocationPage | 469 | BrowseShell (self) |
| `/services/:id` | ServiceDetailPage | 477 | own |
| `/cart` | CartPage | 482 | BrowseShell |
| `/experiences` | ExperiencesPage | 573 | own |
| `/experiences/:slug`, `/experiences/:slug/new` | ExperienceTemplatePage | 576, 579 | own |
| `/hidden-gems`, `/deals`, `/transportation` | — | 599, 587, 533 | Layout |
| `/invite/:token` | GuestInvitePage | 497 | Layout |
| `/trips/shared/:token` | SharedTripPage | 493 | own |
| `/itinerary-view/:token` | ItineraryViewPage | 488 | own |
| `/login`, `/signup`, `/accept-terms` | LoginRoute, SignupPage, AcceptTermsPage | 390, 1252, 570 | — |
| `/booking/confirmation` | BookingConfirmationPage | 1255 | own |

### 1b. Signed-in console (ProtectedRoute)

| Route | Component | Mount `App.tsx:` | Shell |
|---|---|---|---|
| `/dashboard` | Dashboard (Home) | 682 | own DashboardLayout |
| `/my-trips` ("My Plans"; **there is no `/plans` index route**) | MyTrips | 685 | own |
| `/plans/:tripId` | SlipViewPage | 673 | DashboardLayout |
| `/plans/:tripId/guests` | PlanGuestsPage | 666 | DashboardLayout |
| `/trip/:id` (`/itinerary/:id` and `/my-itinerary/:id` redirect here, :651/:654) | TripDetails | 644 | DashboardLayout |
| `/itinerary-comparison/:id` | ItineraryComparisonPage | 657 | DashboardLayout |
| `/ai-assistant` | AIAssistant | 1241 | DashboardLayout |
| `/bookings` (`/my-bookings` redirects here, :505) | MyBookingsPage | 500 | — |
| `/my-events`, `/inbox`, `/chat`, `/profile`, `/plus/occasions` | — | 513, 516, 1235, 688, 519 | — |

### 1c. Pages that exist but are not mounted

| Page file | Status |
|---|---|
| `pages/my-itinerary.tsx` | **Lazily imported (`App.tsx:190`) and never rendered.** `/my-itinerary/:id` redirects to `/trip/:id`. |
| `pages/quick-start-itinerary.tsx` | Not imported by `App.tsx`. `/quick-start` redirects to `/destinations` (:602). It still contains a `POST /api/trips` mint (`:219`). |
| `pages/itinerary.tsx`, `pages/expert-detail.tsx`, `pages/service-providers.tsx`, `pages/spontaneous.tsx` | Not imported by `App.tsx`. Their routes are redirects or absent. `itinerary.tsx` is the only mount of the travelpayouts cards and `useAgentBooking`, apart from experience-template and an expert picker. |

No other module in `client/src` imports any of these (grep checked). Only `my-itinerary` is imported, and only by the unused lazy import in `App.tsx`.
**Out of scope:** `artifacts/traveloure/` is a reference app that is not shipped (its README says so). Expert,
provider, EA and admin routes are also out of scope and are logged for pass two.

---

## 2. Trigger counts

A trigger is anything that changes state: a click, link, navigate or submit; a modal lifecycle event; an
effect that writes on mount; a URL/query-param consumer; or an auth-resume. Groups of purely local UI
toggles count as **1 per component**. Components shared across routes are counted once per mounting surface.

| Group | Surface | Triggers |
|---|---|---|
| **Global shell** (mounted above the router) | `App.tsx` (acquisition ref, GuestCartMigrator, AuthReturnToRestorer, claim hooks, ProtectedRoute, LoginRoute) | 8 |
| | claim-guest-trips / claim-guest-concierge hooks | 2 |
| | MaintenanceGate | 2 |
| | GuestTripContext / TripQueueContext / SignInModalContext / ActiveConsoleContext | 5 / 3 / 3 / 1 |
| | PlanningContext (open, close, mintPlan, runBranch ×5, wiring) | 13 |
| | **PlanModal** `components/trip/plan-modal.tsx` (5 inline steps and the finish CTAs) | 43 |
| | `lib/trip-context.ts` (sync effect, debounced PUT) | 2 |
| | Public `Layout` header/nav/footer | 30 |
| | **Landing** (`pages/landing.tsx` and `components/landing/*`) | 21 |
| | *subtotal* | *133* |
| **Marketplace** | DiscoverPage, shared across the 4 surfaces | 23 |
| | /services only / /ready-made only / /events only / /destinations only | 18 / 5 / 7 / 16 |
| | /discover/location/:city | 38 |
| | /services/:id | 19 |
| | /ready-made/:id | 11 |
| | /hidden-gems, /deals, /transportation | 2, 2, 3 |
| | *subtotal* | *144* |
| **Entry and commerce** | /experiences (with IntakePanel) | 9 |
| | /experiences/:slug[/new] | 31 |
| | /concierge | 11 |
| | /pricing, /how-it-works | 9, 3 |
| | /experts, storefront | 10, 11 |
| | /cart | 33 |
| | /booking/confirmation, /bookings, /my-events | 5, 12, 5 |
| | /inbox, /chat, /profile, /plus/occasions | 8, 9, 4, 3 |
| | /invite/:token, /trips/shared/:token, /itinerary-view/:token | 5, 2, 10 |
| | /login and auth plumbing, /signup, /accept-terms | 9, 3, 4 |
| | *subtotal* | *196* |
| **Console** | Shell (DashboardLayout, sidebar, ProtectedRoute) | 15 |
| | /dashboard, IntakePanel (shared), /my-trips | 10, 13, 14 |
| | /plans/:tripId (page, body, rail) | ~124 |
| | /plans/:tripId/guests | 17 |
| | /trip/:id (page, PlanCard, TripCardRail) | ~95 |
| | /itinerary-comparison/:id | ~41 |
| | /ai-assistant (with the draft panel) | 13 |
| | *subtotal* | *~342* |
| | **TOTAL (raw)** | **~815** |

About 20 rows are double-counted: the auth plumbing appears in both the global and entry groups, and
IntakePanel appears on /experiences, /dashboard and /my-trips. **About 795 triggers are unique.**
Some things were not inventoried past one hop and are left for Phase 1: `TripLogisticsDashboard`,
`VariantActionButtons` internals, the anchor managers in `SlipLogisticsSection`, `StripeCheckout`,
`LanguageMenu`, `NotificationBell` and `UserMenu`.

---

## 3. State stores in play

### 3a. React context (all mounted once, `App.tsx:1318-1338`)

| Store | Holds | Persistence |
|---|---|---|
| `GuestTripContext` | `{tripId: shareToken}` | localStorage `guestTrips` |
| `TripQueueContext` | multi-city queue | memory only; mirrored to sessionStorage `tripQueueDestinations` by `TripQueueIndicator.tsx:32` |
| `SignInModalContext` | open state and `returnTo` option | memory |
| `ActiveConsoleContext` | console role | localStorage `traveloure_active_console` |
| `PlanningContext` | modal open state, `source`, `committed` plan, AI-modal open state | memory |
| Trip context ("the pen"), `lib/trip-context.ts` | destination, dates, party, occasion, **`tripId`**, pending events | sessionStorage `experienceContext` (guest) or `experienceContext:u:<userId>`, plus a debounced `PUT /api/trip-context` → `trip_contexts` |

There is no Zustand or Redux store.

### 3b. Web storage keys

- **localStorage:**
  - `guestTrips`
  - `traveloure_guest_session`. Two modules define it: `lib/guest-session.ts` and `lib/guestSession.ts`.
  - `traveloure_guest_cart_pending`, written by `discover.tsx:1251` and read by `cart.tsx:651`
  - `traveloure_active_console`, `traveloure_currency`, `traveloure_recently_viewed`, `traveloure_pending_handle`
  - `while-away-marker-<userId>`
  - `traveloure.savePaymentPrompt.dismissed:*`
  - `traveloure_visited_*`
  - the locale key
- **sessionStorage:**
  - `experienceContext[:u:<id>]`, `searchSettings_<slug>`, `externalCart_<slug>`
  - `traveloure_return_to`
  - `guestConciergeRequestId`, `guestConciergeClaimToken`
  - `tripQueueDestinations`, `optimizationPreview`, `comparison_baseline_<id>`
  - `acquisitionRef`, `traveloure_impression_session`
- **Cookie:** `sidebar_state`.

### 3c. react-query

Defaults are in `lib/queryClient.ts:92-99`: **`staleTime: Infinity`, `refetchOnWindowFocus: false`**, so a
cached list only moves when something invalidates it.

Trip-related keys:
- `["/api/trips"]`: the plan list. `useTrips`, My Plans and Dashboard use it.
- `["/api/trips/:id", id]`: `useTrip`. The key is the literal route pattern.
- `["/api/trips", id]`: `use-location-mismatch-gate`, CityGrid.
- `` [`/api/trips/${id}/plancard`] ``: the slip and the Trip Card.
- `` [`/api/trips/${id}/itinerary-items`] ``, and the **array** form `["/api/trips", id, "itinerary-items"]` (curated-content-section).
- `["/api/cart"]`, `["/api/user-experiences"]`, `["/api/saved-trips"]`, `` [`/api/trips/${id}/guests|proposals|expert-advisor|…`] ``.

### 3d. URL params consumed

- `?tripId` (discover, service-detail, experience-template, experts, storefront, chat)
- `?city`, `?country`, `?date`, `?neighborhood`, `?categoryKey`, `?q`, `?location`
- `?tier`, `?intent`, `?eventType` (concierge)
- `?intent=buy`, `?step` (cart)
- `?autoApply`, `?optimized`, `?item`
- `?returnTo`, `?redirect` (login)
- `?membership`, `?plan=1`, `?destination[s]`, `?multiCity`, `?conversation`, `?about`, `?ref`, `?source`

### 3e. Server tables on the traveler paths

- **Plan core:** `trips`, `trip_contexts`, `itinerary_items`, `user_experiences`, `trip_destinations`, `temporal_anchors`, `trip_participants`, `event_invites`
- **Cart and bookings:** `cart_items` (has `guest_session_id`), `service_bookings`, `affiliate_booking_requests`, `saved_trips`
- **AI and experts:** `itinerary_comparisons`, `plan_proposals`, `trip_expert_advisors`, `expert_requests`, `concierge_requests`, `conversations`, `trip_entitlements`

---

## 4. Contract sources (for the UI Contract Layer addendum)

| Source | Located | Note |
|---|---|---|
| UNIFIED_PLANNING_FLOW_SPEC_v2 | `attached_assets/UNIFIED_PLANNING_FLOW_SPEC_v2_1780522062317.md` | §2 G1 and §4 G2 are cited by R-1 |
| TRAVELOURE_WIREFRAMES_COMPLETE_v2 | `attached_assets/TRAVELOURE_WIREFRAMES_COMPLETE_v2_(1)_1767163742891.md` | the `(2)` copy is byte-identical |
| TRAVELOURE_COMMERCE_WIREFRAMES_v4 | `attached_assets/TRAVELOURE_COMMERCE_WIREFRAMES_v4_1767389773873.md` | |
| **SELECTION_CONTROL_MODEL_SPEC_v2** | **NOT FOUND in the repo or its git history** | Only its code artifact exists: `shared/selection-control-seed.ts`. **The document is needed to cite it.** |

---

## 5. Early signals: static readings that Phase 1 and 2 must prove or refute

None of these has been run yet. They are listed so Phase 1 can arm hypotheses against them.

**J1-relevant**

- **S1: the landing CTA only opens the modal.** `landing-hero.tsx:250` → `landing.tsx:32` → `PlanningContext.tsx:240`.
  It makes no API call. A trip is minted only by the finish CTAs "Build it myself", or "Get a local expert"
  when signed in (`plan-steps.ts:77/97`, `plan-modal.tsx:1179-1215`). **"Plan with AI", "For an occasion",
  Save, Continue and dismissal mint nothing.** Bears on H1 and H6.
- **S2: completion and dismissal are separate paths.** Dismissal is `onOpenChange(false)` → `close()`
  (`plan-modal.tsx:1380`, `PlanningContext.tsx:251`) and commits nothing. Completion is
  `finish()` → `commitPlan` → `runBranch`, which calls `setModalOpen(false)` directly. Save runs
  `commitPlan` and then the dismissal path. Bears on H6.
- **S3: a guest cannot mint.** The server returns 401 on `POST /api/trips` (`server/routes.ts:1401-1406`). The
  client also refuses first (`PlanningContext.tsx:281-284`), after `releasePendingEventsPen()` has already run
  (`plan-modal.tsx:1201`). It opens the sign-in modal with **no returnTo**, and `finish` returns before
  `commitPlan`. Bears on H4 and J5.
- **S4: the My Plans cache may be stale.** `mintTripSlip` (`lib/trip-slip.ts:151-176`) invalidates nothing,
  and `commitPlan` invalidates only the plancard, guests and user-experiences keys (`plan-modal.tsx:1133-1135`).
  With `staleTime: Infinity`, a My Plans list that is already cached (`["/api/trips"]`) would not show the new plan
  until a full reload. The same applies to the concierge, experience-template and quick-start mints and to
  cart `convert-to-itinerary`. Bears on H3.
- **S5: Discover's add target comes from the pen, not the trip list.** `discover.tsx:1298` →
  `lib/trip-target.ts:42`: `?tripId`, else the pen's `tripId`, else **the cart** (`POST /api/cart`, no trip). The
  number of trips the user has is never consulted, and a pen-derived target shows no banner (`:1550` renders only for a URL
  `?tripId`). There are **four different add paths** that target trips differently: the /services grid, the
  curated picker, the city-feed dialog and service-detail. Bears on H5 and J2.

**Other signals**

- `CityGrid.tsx:294` navigates to `/auth`, which is not a registered route.
- The sign-in gates on the add paths do not resume the add after sign-in.
- `/signup` ignores return-to, cart migration and concierge claim.
- The profile photo toast says "updated" but nothing is saved.
- The cart's comparison fills in dates (`cart.tsx:1738`).
- 3DS return lands on `/booking/confirmation`, which never calls confirm-payment. **This is a money path; observe only.**
- A deleted Trip Card stays on `/trip/:id`.
- `setLocation("/api/login")` is called during render (`itinerary-comparison.tsx:1219`).
- `GuestTripContext.claimTrips` ignores `res.ok` and removes the trip from `guestTrips` either way.

---

## 6. Branch note

The dispatch names `claude/audit-action-effect-graph`. This session is bound to
`claude/lucid-galileo-hu7vgw` and may not push elsewhere without permission, so this doc is on the bound branch.
