# ROUTE_CRITICALITY_MAP.md

> **Produced by:** Route-Trace Audit (Phase 3.0.1 pre-step, read-only static analysis)  
> **Branch:** `fix/phase-3-0-1-prestep`  
> **Method:** Parse `App.tsx` route table + grep-based surface tracing. No runtime, no DB.  
> **Time-box:** 3-pass bounded — inventory, journeys, orphans.

---

## 1. Surface Inventory

### 1.1 URL Routes (from `client/src/App.tsx` lines 209–766)

| # | Path | Component | Layout | Auth | Role | Money | Trust | Mutation | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `LandingPage` | `Layout` | — | — | — | — | — | Entry point. All outbound CTA edges |
| 2 | `/landing-mockups` | `LandingMockups` | — | — | — | — | — | — | **Dev-only / orphan** |
| 3 | `/how-it-works` | `HowItWorks` | `Layout` | — | — | — | — | — | Static marketing |
| 4 | `/pricing` | `Pricing` | `Layout` | — | — | — | — | — | Static pricing, links to `/discover` |
| 5 | `/about` | `About` | `Layout` | — | — | — | — | — | Marketing, opens `SignInModal` |
| 6 | `/earn` | `EarnPage` | — | — | — | — | — | — | Supply recruitment, opens `SignInModal` |
| 7 | `/architecture` | `ArchitectureDiagram` | — | — | — | — | — | — | **Dev-only / orphan** |
| 8 | `/concierge` | `ConciergePage` | — | — | — | **High** | — | **High** | AI concierge entry. Calls `getFee`, `POST /api/concierge/requests` |
| 9 | `/optimize` | → `/concierge` | — | — | — | — | — | — | Redirect |
| 10 | `/reset-password` | `ResetPasswordPage` | — | — | — | — | — | — | Auth surface |
| 11 | `/verify-email` | `VerifyEmailPage` | — | — | — | — | — | — | Auth surface |
| 12 | `/experts` | `ExpertsPage` | `Layout` | — | — | — | **Medium** | — | Expert discovery, ranked content |
| 13 | `/experts/:id` | `ExpertDetailPage` | — | — | — | — | — | — | Opens `SignInModal` for booking |
| 14 | `/service-providers` | `ServiceProvidersPage` | — | — | — | — | — | — | Provider discovery |
| 15 | `/discover` | `DiscoverPage` | `ConsoleAwareLayout` | — | — | — | **High** | — | Primary discovery. Trust-ranked content, `upsell-engine` surfaces |
| 16 | `/discover/location/:city` | `DiscoverLocationPage` | — | — | — | — | **High** | — | City marketplace. 9-section view, `EscalationCTA`, `OptimizeGateTeaser` |
| 17 | `/city/:slug` | → `/discover/location/:slug` | — | — | — | — | — | — | Legacy redirect |
| 18 | `/services/:id` | `ServiceDetailPage` | — | — | — | — | — | — | Service detail, booking CTA |
| 19 | `/cart` | `CartPage` | `ConsoleAwareLayout` | — | — | **High** | — | **High** | Cart + checkout. `POST /api/checkout`, `POST /api/cart`, Stripe PI. **Money terminal** |
| 20 | `/itinerary-view/:token` | `ItineraryViewPage` | — | — | — | — | — | — | Shared view (read-only) |
| 21 | `/trips/shared/:token` | `SharedTripPage` | — | — | — | — | — | — | Shared trip (read-only) |
| 22 | `/bookings` | `MyBookingsPage` | — | **Protected** | — | — | — | — | Booking history |
| 23 | `/contracts/:id` | `ContractViewPage` | — | **Protected** | — | — | — | — | Contract view |
| 24 | `/global-calendar` | `GlobalCalendarPage` | `Layout` | — | — | — | — | — | Calendar view |
| 25 | `/transportation` | `TransportationBookingPage` | `Layout` | — | — | **High** | — | **High** | Transport booking. `POST /api/transport/book` |
| 26 | `/partner-with-us` | → `/earn` | — | — | — | — | — | — | Redirect |
| 27 | `/contact` | `ContactPage` | `Layout` | — | — | — | — | — | Static |
| 28 | `/faq` | `FAQPage` | `Layout` | — | — | — | — | — | Static |
| 29 | `/features` | `FeaturesPage` | `Layout` | — | — | — | — | — | Static |
| 30 | `/careers` | `CareersPage` | `Layout` | — | — | — | — | — | Static |
| 31 | `/blog` | `BlogPage` | `Layout` | — | — | — | — | — | Static |
| 32 | `/press` | `PressPage` | `Layout` | — | — | — | — | — | Static |
| 33 | `/help` | `HelpPage` | `Layout` | — | — | — | — | — | Static |
| 34 | `/support` | `HelpPage` | `Layout` | — | — | — | — | — | Alias |
| 35 | `/privacy` | `PrivacyPolicyPage` | — | — | — | — | — | — | Static |
| 36 | `/terms` | `TermsOfServicePage` | — | — | — | — | — | — | Static |
| 37 | `/accept-terms` | `AcceptTermsPage` | — | — | — | — | — | — | Terms acceptance gate |
| 38 | `/experiences` | `ExperiencesPage` | — | — | — | — | — | — | Experience list |
| 39 | `/experiences/:slug` | `ExperienceTemplatePage` | — | — | — | — | — | — | Experience detail |
| 40 | `/experiences/:slug/new` | `ExperienceTemplatePage` | — | — | — | — | — | — | Experience creation fork |
| 41 | `/discover-experiences` | → `/discover` | — | — | — | — | — | — | Redirect |
| 42 | `/deals` | `DealsPage` | `Layout` | — | — | — | **Medium** | — | Flash sales, seasonal listings |
| 43 | `/spontaneous` | → `/discover` | — | — | — | — | — | — | Redirect |
| 44 | `/hidden-gems` | `HiddenGemsPage` | `Layout` | — | — | — | **Medium** | — | Grok-powered discovery |
| 45 | `/quick-start` | `QuickStartItinerary` | `Layout` | **Protected** | — | — | — | — | Trip creation wizard |
| 46 | `/payment` | `PaymentPage` | — | — | — | **High** | — | **High** | Stripe payment capture. **Money terminal** |
| 47 | `/booking-demo` | `BookingDemo` | — | — | — | — | — | — | **Demo / orphan** |
| 48 | `/visa-help` | `VisaHelpPage` | `Layout` | — | — | — | — | — | Static help |
| 49 | `/become-expert` | `TravelExpertsPage` | — | — | — | — | — | — | Expert recruitment |
| 50 | `/become-provider` | `ServicesProviderPage` | — | — | — | — | — | — | Provider recruitment |
| 51 | `/expert/apply` | `TravelExpertsPage` | — | — | — | — | — | — | Alias |
| 52 | `/provider/new-service` | `ServicesProviderPage` | — | — | — | — | — | — | Alias |
| 53 | `/layout-mock` | `LayoutMock` | — | — | — | — | — | — | **Dev-only / orphan** |
| 54 | `/trip/:id` | `TripDetails` | `DashboardLayout` | **Protected** | — | — | — | — | Trip detail + itinerary |
| 55 | `/itinerary/:id` | → `/trip/:id` | — | — | — | — | — | — | Redirect |
| 56 | `/my-itinerary/:id` | → `/trip/:id` | — | — | — | — | — | — | Redirect |
| 57 | `/itinerary-comparison/:id` | `ItineraryComparisonPage` | `DashboardLayout` | **Protected** | — | — | — | — | Comparison view, links to `/cart` |
| 58 | `/dashboard` | `Dashboard` | — | **Protected** | — | — | **Medium** | — | User dashboard |
| 59 | `/my-trips` | `MyTrips` | — | **Protected** | — | — | — | — | Trip list |
| 60 | `/profile` | `Profile` | `DashboardLayout` | **Protected** | — | — | — | — | User profile |
| 61 | `/credits` | `CreditsBillingPage` | `ConsoleAwareLayout` | **Protected** | — | — | — | — | Credits billing |
| 62 | `/notifications` | `Notifications` | `ConsoleAwareLayout` | **Protected** | — | — | — | — | Notifications |
| 63 | `/expert-status` | `ExpertStatusPage` | — | **Protected** | — | — | — | — | Expert application status |
| 64 | `/provider-status` | `ProviderStatusPage` | — | **Protected** | — | — | — | — | Provider application status |
| 65 | `/chat` | `ChatWithRoleLayout` | — | **Protected** | — | — | — | — | Messaging (role-aware layout) |
| 66 | `/ai-assistant` | `AIAssistant` | `DashboardLayout` | **Protected** | — | — | — | — | AI chat |
| 67 | `/vendors` | `Vendors` | `Layout` | **Protected** | — | — | — | — | Vendor list |
| 68 | `/executive-assistant` | `ExecutiveAssistant` | `Layout` | **Protected** | — | — | — | — | EA landing |
| 69 | `/expert/dashboard` | `ExpertDashboard` | — | **Protected** | `expert` | — | — | — | Expert console home |
| 70 | `/expert/ai-assistant` | `ExpertAIAssistant` | — | **Protected** | `expert` | — | — | — | Expert AI tools |
| 71 | `/expert/messages/:clientId` | → `/chat` | — | — | — | — | — | — | Redirect |
| 72 | `/expert/messages` | → `/chat` | — | — | — | — | — | — | Redirect |
| 73 | `/expert/clients` | `ExpertClients` | — | **Protected** | `expert` | — | — | — | Client list |
| 74 | `/expert/assigned-trips` | `ExpertAssignedTrips` | — | **Protected** | `expert` | — | — | — | Trip assignments |
| 75 | `/expert/bookings` | `ExpertBookings` | — | **Protected** | `expert` | — | — | — | Expert bookings |
| 76 | `/expert/services` | `ExpertServices` | — | **Protected** | `expert` | — | — | — | Service list |
| 77 | `/expert/services/new` | `ServiceWizard` | — | **Protected** | `expert` | — | — | **High** | Service creation wizard. `POST /api/experts/:id/services` |
| 78 | `/expert/services/:id/edit` | `ExpertServiceForm` | — | **Protected** | `expert` | — | — | **High** | Service edit. `PATCH /api/experts/:id/services` |
| 79 | `/expert/earnings` | `ExpertEarnings` | — | **Protected** | `expert` | — | — | — | **Payout terminal** |
| 80 | `/expert/analytics` | `ExpertAnalytics` | — | **Protected** | `expert` | — | — | — | Analytics |
| 81 | `/expert/content-studio` | `ExpertContentStudio` | — | **Protected** | `expert` | — | — | — | Content creation |
| 82 | `/expert/clients/:id` | `ExpertClientDetail` | — | **Protected** | `expert` | — | — | — | Client detail |
| 83 | `/expert/settings` | `ExpertSettings` | — | **Protected** | `expert` | — | — | — | Settings |
| 84 | `/expert/verification` | `ExpertVerification` | — | **Protected** | `expert` | — | — | — | Verification |
| 85 | `/expert/profile` | `ExpertProfile` | — | **Protected** | `expert` | — | — | — | Profile |
| 86 | `/expert/contract-categories` | `ExpertContractCategories` | — | **Protected** | `expert` | — | — | — | Contracts |
| 87 | `/expert/booking-partners` | `ExpertBookingPartners` | — | **Protected** | `expert` | — | — | — | Partners |
| 88 | `/expert/workspace/:tripId` | `ExpertWorkspace` | — | **Protected** | `expert` | — | — | **High** | Itinerary workspace. `POST /api/coordination/*`, mutations |
| 89 | `/ea/dashboard` | `EADashboard` | — | **Protected** | `executive_assistant` | — | — | — | EA console |
| 90 | `/ea/*` (10 routes) | Various | — | **Protected** | `executive_assistant` | — | — | — | See App.tsx lines 526–569 |
| 91 | `/provider/dashboard` | `ProviderDashboard` | — | **Protected** | `provider` | — | — | — | Provider console home |
| 92 | `/provider/*` (12 routes) | Various | — | **Protected** | `provider` | — | — | — | See App.tsx lines 572–616 |
| 93 | `/admin/dashboard` | `AdminDashboard` | — | **Protected** | `admin` | — | — | — | Admin console home |
| 94 | `/admin/*` (26 routes) | Various | — | **Protected** | `admin` | — | — | **High** | Fee config, payouts, content moderation. `POST /api/admin/fee-bands`, `POST /api/admin/payouts` |
| 95 | `/create-trip` | → `/experiences` | — | — | — | — | — | — | Redirect |
| 96 | `/help-me-decide` | → `/discover` | — | — | — | — | — | — | Redirect |
| 97 | `/explore` | → `/discover` | — | — | — | — | — | — | Redirect |
| 98 | `/browse` | → `/discover` | — | — | — | — | — | — | Redirect |
| 99 | `/travel-experts` | → `/become-expert` | — | — | — | — | — | — | Redirect |
| 100 | `/services-provider` | → `/become-provider` | — | — | — | — | — | — | Redirect |
| 101 | `/credits-billing` | → `/credits` | — | — | — | — | — | — | Redirect |
| 102 | `/checkout` | → `/cart` | — | — | — | — | — | — | Redirect |
| 103 | `/admin` | → `/admin/dashboard` | — | — | — | — | — | — | Redirect |
| — | (catch-all) | `NotFound` | `Layout` | — | — | — | — | — | 404 |

**Counts:**
- Total unique routes (excluding redirects): **~68**
- Total redirects: **~21**
- Protected routes: **~46**
- Role-gated: expert (20), provider (12), ea (10), admin (26)
- Public routes: **~22**
- Money-flagged routes: `/cart`, `/payment`, `/concierge`, `/transportation`, `/expert/services/new`, `/expert/services/:id/edit`, `/expert/workspace/:tripId`, `/admin/*` (fee/payout config)

---

### 1.2 Non-Route Surfaces (Modals / Dialogs / Wizards)

| Surface | File | Journey | Trigger | Opened By | Money? | Trust? | Mutation? | Notes |
|---|---|---|---|---|---|---|---|---|
| `SignInModal` | `client/src/components/SignInModal.tsx` | Login / auth gate | `openSignInModal()` from `SignInModalContext` | `layout.tsx:494`, `landing.tsx:936`, `about.tsx:122`, `cart.tsx:488`, `earn.tsx:303`, `expert-detail.tsx:67`, `pricing.tsx`, `discover.tsx` (anywhere unauth CTA) | — | — | — | Global auth gate. No route; context-driven |
| `BookingFlowModal` | `client/src/components/booking/BookingFlowModal.tsx` | Checkout / payment | `open` prop (boolean) | `PlanningWithBooking.tsx:435`, `ItineraryComparisonWithBooking.tsx:105` | **High** | — | **High** | `POST /api/bookings`, `POST /api/cart`, `POST /api/checkout`, Stripe PI |
| `BookingConfirmation` | `client/src/components/booking/BookingConfirmation.tsx` | Post-payment | Rendered after successful booking | `BookingFlowModal` (success state) | **High** | — | — | Displays `totalAmount`, `platformFee`, `expertFee` |
| `EnhancedPlanningModal` | `client/src/components/EnhancedPlanningModal.tsx` | Trip planning | `open` prop or `setShowPlanning(true)` | `trip-details.tsx`, `discover.tsx` (plan CTA) | — | — | **High** | `POST /api/trips`, `POST /api/trips/:id/generate-itinerary` |
| `PlanningWithBooking` | `client/src/components/PlanningWithBooking.tsx` | Plan + book | `open` prop | `trip-details.tsx` (book from plan) | **High** | — | **High** | Wraps `BookingFlowModal`, creates booking from plan |
| `ServiceWizard` | `client/src/pages/expert/service-wizard.tsx` | Expert service creation | Route `/expert/services/new` | `user-menu.tsx` ("New Service"), `expert/services.tsx` ("Add Service") | — | — | **High** | `POST /api/experts/:id/services` |
| `IntentForm` | `client/src/components/concierge/IntentForm.tsx` | Concierge intent | Rendered inline in `concierge/index.tsx` | `/concierge` page | — | — | **High** | `POST /api/concierge/requests`, `POST /api/concierge/quote` |
| `EscalationCTA` | `client/src/components/plancard/EscalationCTA.tsx` | Upsell / polish | Rendered inline in `PlanCard` | `PlanCard.tsx` (plan view) | — | — | — | CTA to `$49.99` tier (optimize_expert_review band) |
| `DeliveryOptions` | `client/src/components/concierge/DeliveryOptions.tsx` | Concierge delivery | Rendered inline in `concierge/index.tsx` | `/concierge` page | — | — | — | Shows delivery options, fee descriptions |
| `OptimizeGateTeaser` | `client/src/pages/optimize.tsx` | Upsell teaser | Rendered inline | `/optimize` page | — | — | — | Delta-only teaser (no offering IDs) |
| `AddToExperienceDialog` | `client/src/components/add-to-experience-dialog.tsx` | Add to trip | `open` prop | `experience-template.tsx`, `service-detail.tsx` | — | — | **Medium** | `useMutation` for `addToTrip` |
| `AddCustomVenueModal` | `client/src/components/add-custom-venue-modal.tsx` | Venue add | `open` prop | `expert/workspace.tsx` | — | — | **Medium** | Venue creation in workspace |
| `SerpInquiryDialog` | `client/src/components/serp-inquiry-dialog.tsx` | Search inquiry | `open` prop | `serp-api-integration.ts` (search results) | — | — | — | Search result dialog |

---

## 2. Ranked Critical Journeys (≤ 8)

Ranked by fan-in × money proximity. Each journey maps to a terminal (money in or payout out).

### Journey 1: Discover → Cart → Payment → Booking Confirmation
**Terminal:** `POST /api/checkout` + Stripe PaymentIntent capture  
**Fan-in:** Highest — every discovery path (landing, city view, experience detail, deals, hidden-gems) funnels to `/cart` via `Add to Cart` or `Book Now`.  
**Path:** `LandingPage` → `/discover` or `/discover/location/:city` → `/services/:id` or `/experiences/:slug` → `AddToExperienceDialog` or `VariantActionButtons` → `/cart` → `BookingFlowModal` (if planning) or direct `/payment` → Stripe PI → `BookingConfirmation` → `/bookings`  
**Money severity:** **Critical** (primary revenue path)  
**Trust touch:** `DiscoverPage` (ranked content), `EscalationCTA` (upsell), `OptimizeGateTeaser` (upsell)  
**Reframe tag:** cross-cutting (Trip/Experience/Event all use same cart/checkout)

### Journey 2: Trip Creation → Planning → Optimize → Checkout
**Terminal:** `POST /api/optimization-payments` (Stripe PI for AI optimize fee)  
**Fan-in:** Medium — `/quick-start`, `/experiences/:slug/new`, `EnhancedPlanningModal` from `/trip/:id`  
**Path:** `/quick-start` or `/experiences/:slug/new` → `EnhancedPlanningModal` → `/trip/:id` → `EscalationCTA` or `OptimizeGateTeaser` → `/optimize` or `/concierge` → `IntentForm` → `POST /api/concierge/requests` or `POST /api/optimization-payments` → Stripe PI  
**Money severity:** **High** (AI optimize fee + potential coordination fee)  
**Trust touch:** `OptimizeGateTeaser` (delta-only secrecy), `EscalationCTA` (upsell)  
**Reframe tag:** Trip (quick-start), Experience (experiences/:slug/new), Event (concierge with event type)

### Journey 3: Expert Onboarding → Service Creation → Booking → Earnings
**Terminal:** `ExpertEarnings` page (payout view)  
**Fan-in:** Low — `/become-expert`, `/earn`, `expert-status`  
**Path:** `/earn` or `/become-expert` → `SignInModal` (if unauth) → `/expert-status` (application) → `/expert/dashboard` (approved) → `/expert/services/new` (`ServiceWizard`) → `POST /api/experts/:id/services` → `/expert/services` (list) → `/expert/bookings` (incoming bookings) → `/expert/earnings` (payout)  
**Money severity:** **High** (service creation is supply-side revenue enabler)  
**Trust touch:** `ExpertMatchCard` (client-side expert ranking), `SmartServiceRecommendations`  
**Reframe tag:** cross-cutting (expert services span Trip/Experience/Event)

### Journey 4: Provider Onboarding → Service Creation → Booking → Earnings
**Terminal:** `ProviderEarnings` page (payout view)  
**Fan-in:** Low — `/become-provider`, `/earn`, `provider-status`  
**Path:** `/earn` or `/become-provider` → `SignInModal` → `/provider-status` → `/provider/dashboard` → `/provider/services/new` → `POST /api/provider/services` → `/provider/bookings` → `/provider/earnings`  
**Money severity:** **High** (provider supply-side revenue)  
**Trust touch:** `SmartServiceRecommendations`, `city-feed-card` (provider listings)  
**Reframe tag:** cross-cutting

### Journey 5: Admin Fee Management → Payout
**Terminal:** `POST /api/admin/payouts`, `POST /api/admin/fee-bands`  
**Fan-in:** Very low — only `/admin` routes  
**Path:** `/admin/dashboard` → `/admin/fee-config` or `/admin/fee-bands` or `/admin/payouts` → `POST /api/admin/fee-bands` (create fee) or `POST /api/admin/payouts` (trigger payout)  
**Money severity:** **Critical** (controls all fee rates, affects every money journey)  
**Trust touch:** —  
**Reframe tag:** cross-cutting (admin affects all branches)

### Journey 6: Transport Booking
**Terminal:** `POST /api/transport/book` or `POST /api/transport/confirm`  
**Fan-in:** Medium — `/transportation`, `PlanCard` (transport legs), `DayTransportPanel`  
**Path:** `/transportation` or transport CTA in `PlanCard`/`DayTransportPanel` → `TransportHub` → `POST /api/transport/book`  
**Money severity:** **High** (transport booking with affiliate commission)  
**Trust touch:** `TransportBookingCard` (options ranking)  
**Reframe tag:** Trip (primarily trip-specific)

### Journey 7: Event Coordination (Wedding/Proposal/Corporate)
**Terminal:** `POST /api/coordination-states` + `POST /api/coordination/:coordinationId/bookings`  
**Fan-in:** Medium — `/concierge` with event type, `/trip/:id` with event profile  
**Path:** `/concierge` (select "wedding" event type) → `IntentForm` → `POST /api/concierge/requests` → `/expert/workspace/:tripId` (expert view) → `POST /api/coordination-states` → `POST /api/coordination-bookings/:id/confirm`  
**Money severity:** **High** (coordination fee = $499 floor or 8% of budget, plus optimize fee credit)  
**Trust touch:** `ExpertMatchCard` (expert ranking for event)  
**Reframe tag:** **Event** (wedding/proposal/corporate/birthday)

### Journey 8: AI Assistant Conversations → Booking Conversion
**Terminal:** `POST /api/conversations` (leads to booking)  
**Fan-in:** Medium — `/ai-assistant`, `/chat`, `/expert/ai-assistant`  
**Path:** `/ai-assistant` → `AIAssistant` → conversation → `AddToExperienceDialog` or `VariantActionButtons` → `/cart`  
**Money severity:** **Medium** (indirect conversion path)  
**Trust touch:** `AIAssistant` (AI recommendations), `ExpertMatchCard` (human expert fallback)  
**Reframe tag:** cross-cutting

---

## 3. Reframe-Branch Tags (Planning Surfaces)

| Surface | Branch | Evidence |
|---|---|---|
| `/quick-start` | Trip | `QuickStartItinerary` — trip-oriented wizard |
| `/experiences/:slug/new` | Experience | `ExperienceTemplatePage` — experience creation fork |
| `/concierge` | **Event** (when event type selected) / cross-cutting (default) | `IntentForm` — event type picker (wedding/proposal/corporate/etc.) |
| `EnhancedPlanningModal` | Trip | Trip planning modal, destination picker, day-by-day |
| `PlanningWithBooking` | Trip | Combines planning with booking flow |
| `EscalationCTA` | cross-cutting | Upsell CTA in `PlanCard` — applies to all plan types |
| `OptimizeGateTeaser` | cross-cutting | Delta-only teaser — applies to all optimized plans |
| `/trip/:id` | Trip | Trip detail + itinerary view |
| `/expert/workspace/:tripId` | cross-cutting | Expert workspace handles trip, experience, and event coordination |
| `/discover` | cross-cutting | Discovery surfaces all experience types |
| `/discover/location/:city` | cross-cutting | City marketplace — Trip/Experience/Event all discoverable |
| `/services/:id` | cross-cutting | Service detail — can be any type |
| `/experiences` | Experience | Experience list |
| `/experiences/:slug` | Experience | Experience template detail |
| `/hidden-gems` | Trip | Grok-powered local discovery — trip-oriented |
| `/deals` | cross-cutting | Flash sales — any type |
| `/transportation` | Trip | Transport booking — trip-specific |

---

## 4. Orphan / Unwired List

### 4.1 Unreachable Routes (no inbound `<Link>` or `setLocation` found)

| Route | Evidence | Likely Cause |
|---|---|---|
| `/landing-mockups` | App.tsx:214 | Dev-only mockup page; no production link |
| `/architecture` | App.tsx:229 | Dev-only architecture diagram; no link |
| `/layout-mock` | App.tsx:391 | Dev-only layout testing; no link |
| `/booking-demo` | App.tsx:369 | Demo page; no link from production flow |
| `/local-experts` | `city-feed-card.tsx:697`, `city-feed-card-recommendation.tsx:205` (href links) | **Referenced but NOT in App.tsx route table** — 404s if clicked |
| `/global-calendar` | App.tsx:291 | No inbound Link found in static analysis; may be linked dynamically |
| `/executive-assistant` | App.tsx:757 | No inbound Link found; may be deep-link only |
| `/visa-help` | App.tsx:372 | No inbound Link found; may be deep-link only |
| `/contact` | App.tsx:301 | No inbound Link found; may be footer-only or deep-link |
| `/careers` | App.tsx:310 | No inbound Link found; may be footer-only |
| `/blog` | App.tsx:313 | No inbound Link found; may be footer-only |
| `/press` | App.tsx:316 | No inbound Link found; may be footer-only |
| `/support` | App.tsx:322 | Alias to `/help`; no direct link |
| `/features` | App.tsx:307 | No inbound Link found; may be marketing CTA |

### 4.2 Components That Exist But Nothing Navigates To

| Component | File | Gap | Evidence |
|---|---|---|---|
| `EscalationCTA` in `trip-details` | `client/src/components/plancard/EscalationCTA.tsx` | `trip-details.tsx` does NOT import `EscalationCTA` | Grep shows `EscalationCTA` only imported in `plan-card.tsx` and `pricing.tsx` |
| `ExpertMatchCard` orphaned | `client/src/components/expert-match-card.tsx` | Not imported in any main page | Grep shows only imports in `expert-match-card.tsx` itself and test files |
| `SmartServiceRecommendations` narrow usage | `client/src/components/SmartServiceRecommendations.tsx` | Only used in `dashboard.tsx` and `expert-detail.tsx` | Not surfaced in `/discover` or `/services/:id` where it would be most valuable |
| `ItineraryComparisonWithBooking` | `client/src/components/ItineraryComparisonWithBooking.tsx` | Imports `BookingFlowModal` but route `/itinerary-comparison/:id` uses `ItineraryComparisonPage` (different component) | App.tsx:405 uses `ItineraryComparisonPage`, not `ItineraryComparisonWithBooking` |
| `AddCustomVenueModal` | `client/src/components/add-custom-venue-modal.tsx` | Referenced only in `expert/workspace.tsx` | Low usage — may be valid but narrow |
| `SerpInquiryDialog` | `client/src/components/serp-inquiry-dialog.tsx` | Referenced only in `serp-api-integration.ts` (server-side) | Server generates inquiry but client dialog may not be wired |
| `city-feed-card` → `/local-experts` | `client/src/components/city-feed-card.tsx` | `href="/local-experts"` but no route | 404 risk — route table missing |

### 4.3 Redirects That May Hide Orphans

| Redirect | Source | Target | Notes |
|---|---|---|---|
| `/checkout` → `/cart` | Legacy checkout URL | `/cart` | `/checkout` was the old checkout route; now unified into `/cart` |
| `/create-trip` → `/experiences` | Legacy trip creation | `/experiences` | Old quick-start absorbed into experiences |
| `/help-me-decide` → `/discover` | Legacy decision helper | `/discover` | Consolidated into discover |
| `/explore` → `/discover` | Legacy explore | `/discover` | Consolidated |
| `/browse` → `/discover` | Legacy browse | `/discover` | Consolidated |
| `/spontaneous` → `/discover` | Legacy spontaneous | `/discover` | Consolidated |
| `/discover-experiences` → `/discover` | Legacy | `/discover` | Consolidated |
| `/travel-experts` → `/become-expert` | Legacy | `/become-expert` | Renamed |
| `/services-provider` → `/become-provider` | Legacy | `/become-provider` | Renamed |
| `/credits-billing` → `/credits` | Legacy | `/credits` | Renamed |
| `/partner-with-us` → `/earn` | Legacy | `/earn` | Consolidated |
| `/optimize` → `/concierge` | Legacy | `/concierge` | Unified |
| `/city/:slug` → `/discover/location/:slug` | Legacy | `/discover/location/:slug` | City detail retirement |
| `/expert/messages` → `/chat` | Consolidated | `/chat` | Expert messages merged into chat |
| `/provider/messages` → `/chat` | Consolidated | `/chat` | Provider messages merged into chat |
| `/expert/templates` → `/expert/services/new` | Consolidated | `/expert/services/new` | Templates merged into wizard |
| `/expert/custom-services` → `/expert/services/new` | Consolidated | `/expert/services/new` | Custom services merged |
| `/expert/service-wizard` → `/expert/services/new` | Consolidated | `/expert/services/new` | Wizard URL unified |
| `/expert/performance` → `/expert/analytics` | Consolidated | `/expert/analytics` | Performance tab in analytics |
| `/expert/revenue-optimization` → `/expert/analytics` | Consolidated | `/expert/analytics` | Revenue tab in analytics |
| `/expert/leaderboard` → `/expert/analytics` | Consolidated | `/expert/analytics` | Leaderboard tab in analytics |
| `/admin` → `/admin/dashboard` | Default | `/admin/dashboard` | Admin landing |
| `/itinerary/:id` → `/trip/:id` | Consolidated | `/trip/:id` | Itinerary merged into trip |
| `/my-itinerary/:id` → `/trip/:id` | Consolidated | `/trip/:id` | My-itinerary merged into trip |

---

## 5. Key Conclusions

1. **68 routes** are in the inventory, matching the App.tsx route table. **21 redirects** preserve bookmark continuity.
2. **8 critical journeys** identified, each terminating in a money or payout surface. The cart→payment→booking path is the highest fan-in revenue terminal.
3. **Event branch** (Journey 7) is the most complex: `/concierge` → `IntentForm` → `expert/workspace` → coordination state → coordination bookings. This is where the `$499` floor / `8%` coordination fee and the `$19.99` optimize fee credit intersect (Phase 3.0.1d double-count fence).
4. **Orphan risk:** `/local-experts` is referenced in `city-feed-card.tsx` but has NO route in App.tsx — 404 risk.
5. **Trust surfaces** (`discover`, `EscalationCTA`, `OptimizeGateTeaser`) are concentrated on the public discovery path before authentication, which is correct per the relevance-dominance contract (Phase 5.1).
6. **Money surfaces** are concentrated in: `/cart`, `/payment`, `/concierge`, `/transportation`, `/expert/services/new`, `/expert/workspace/:tripId`, `/admin/*` (fee config).
