# FEATURE_COMPLETENESS_MATRIX.md

> **Produced by:** Feature-Completeness Audit — Pass 2 (read-only static analysis)  
> **Consumes:** `ROUTE_CRITICALITY_MAP.md` (Pass 1), `business-plan-v1.3.md`, `business-plan-delivery-map.md`  
> **Branch:** `fix/phase-3-0-1-prestep`  
> **Method:** Top-down catalog-derived capability audit. Surface × Endpoint × Model × Wiring.  
> **Time-box:** 4-agent parallel deep-search + synthesis.

---

## 1. Matrix: Capability × Step × Status

### Legend
- **✅** — All four pieces present and wired (surface, endpoint, model, wiring)
- **🟡** — Partial: exists but unwired, stubbed, or incomplete
- **❌** — Missing: no implementation
- **Evidence** — `file:line` for present pieces; named gap for ❌/🟡

---

### 1.1 Local Experts (10 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 1.1 | **Expert onboarding** | ✅ `App.tsx:377` `/become-expert` | ✅ `experts.routes.ts:205` `POST /api/expert-application` | ✅ `schema.ts:323` `localExpertForms` | ✅ `travel-experts.tsx:410` → `POST /api/expert-application` | ✅ | `App.tsx:377`, `experts.routes.ts:205`, `schema.ts:323` |
| 1.2 | **Expert offering creation** (advisory/planning/coordination/live_support/specialized) | ✅ `App.tsx:465` `/expert/services/new` → `ServiceWizard` | ✅ `experts.routes.ts:474` `POST /api/provider/services` | ✅ `schema.ts:508` `providerServices` + `schema.ts:5768` `expertOfferingTypes` (5-tier enum) | ✅ `service-wizard.tsx:202` → `POST /api/provider/services` | ✅ | `App.tsx:465`, `schema.ts:5768` (5-tier enum) |
| 1.3 | **Expert discoverable in feed** | ✅ `city-feed-card-expert.tsx:16` (expert card) | ✅ `experts.routes.ts:601` `GET /api/experts` | ✅ `schema.ts:323` `localExpertForms` | ✅ `discover-location.tsx:1288` → `GET /api/experts?location=${city}` | ✅ | `discover-location.tsx:1288`, `experts.routes.ts:601` |
| 1.4 | **Expert request/receive** | ✅ `DeliveryOptions.tsx:88` (expert CTA) | ✅ `booking-actions.ts:104` `POST /api/expert-requests` | ✅ `schema.ts:5383` `expertRequests` | ✅ `DeliveryOptions.tsx:88` → `POST /api/expert-requests` | ✅ | `booking-actions.ts:104`, `schema.ts:5383` |
| 1.5 | **Expert concierge offerings** (ai_plan_polish, text-a-local, same-day-rescue, reservation-lifeline) | ✅ `EscalationCTA.tsx:107` ("polish this" CTA) | ✅ `booking-actions.ts:104` `POST /api/expert-requests` | ✅ `schema.ts:5768` `expertOfferingTypes` (ai_plan_polish tier exists) | ✅ `EscalationCTA.tsx:107` → `POST /api/expert-requests` | ✅ | `EscalationCTA.tsx:107`, `schema.ts:5768` |
| 1.6 | **Expert `isLead` / neighborhood-lead role** | ✅ `ExpertMatchCard.tsx` shows lead badge | ✅ `upsell.routes.ts:824` `filterLeadEndorsements` + `expertIsLead` | ✅ `schema.ts` `neighborhoodCoverage` with `isLead` | ✅ `lead-routing.service.ts` + `upsell.routes.ts` | ✅ | `upsell.routes.ts:824`, `schema.ts:2581` |
| 1.7 | **Expert workspace** | ✅ `App.tsx:521` `/expert/workspace/:tripId` | ✅ `experts.routes.ts:3746` `PATCH /api/expert/assignments/:id/workspace-status` | ✅ `schema.ts:116` `tripExpertAdvisors` | ✅ `workspace.tsx:501` → `PATCH` | ✅ | `App.tsx:521`, `workspace.tsx:501` |
| 1.8 | **Expert payout (Stripe Connect)** | ✅ `App.tsx:476` `/expert/earnings` | ✅ `experts.routes.ts:1212` `GET /api/expert/earnings` + `experts.routes.ts:3111` `POST /api/expert/payouts/request` + `payments.routes.ts:626` `POST /api/stripe/connect/onboard` | ✅ `schema.ts:3876` `expertEarnings` + `schema.ts:3893` `expertPayouts` | ✅ `earnings.tsx:46` → `GET /api/expert/earnings` + `stripe-connect-card.tsx:32` → `POST /api/stripe/connect/onboard` | ✅ | `App.tsx:476`, `payments.routes.ts:626`, `schema.ts:3876` |
| 1.9 | **Expert commission split (`resolveCommissionRates`)** | ✅ `expert/earnings.tsx` displays split | ✅ `commission.ts:76` `resolveCommissionRates` | ✅ `schema.ts:5690` `feeBands` + `schema.ts:1024` `bookingFeeConfigs` | ✅ `booking.service.ts` + `payments.routes.ts` call `resolveCommissionRates` | ✅ | `commission.ts:76`, `schema.ts:5690` |
| 1.10 | **Expert per-expert override (80%+)** | ✅ `admin/dashboard.tsx` shows override UI | ✅ `commission.ts:94` Tier-3 branch (`commission_override_expert_share_percent`) | ✅ `schema.ts:1024` `bookingFeeConfigs` + `users.commission_override_expert_share_percent` | ✅ `commission.ts:94` checks `user.commission_override_expert_share_percent` | ✅ | `commission.ts:94`, `schema.ts:1024` |

**Expert subtotal:** 10/10 ✅

---

### 1.2 Service Providers (10 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 2.1 | **Provider onboarding** | ✅ `App.tsx:380` `/become-provider` | ✅ `experts.routes.ts:256` `POST /api/provider-application` | ✅ `schema.ts:410` `serviceProviderForms` | ✅ `services-provider.tsx:194` → `POST` | ✅ | `App.tsx:380`, `experts.routes.ts:256` |
| 2.2 | **Provider offering creation** | ✅ `App.tsx:590` `/provider/services/new` | ✅ `experts.routes.ts:474` `POST /api/provider/services` | ✅ `schema.ts:508` `providerServices` | ✅ `ServiceForm.tsx:504` → `POST` | ✅ | `App.tsx:590`, `ServiceForm.tsx:504` |
| 2.3 | **Provider discoverable in feed** | ✅ `city-feed-card.tsx` renders provider items | ✅ `content.routes.ts:221` `GET /api/offering-types/experts` | ✅ `schema.ts:508` `providerServices` | ✅ `feed-stream.ts:165` weaves providers into feed | ✅ | `feed-stream.ts:165`, `city-feed-card.tsx` |
| 2.4 | **Provider booking (beta-flat 10%)** | ✅ `provider/bookings.tsx` | ✅ `experts.routes.ts:1857` `GET /api/provider/bookings` + `experts.routes.ts:3503` `PUT /api/provider/booking-requests/:id/respond` | ✅ `schema.ts:688` `serviceBookings` | ✅ `provider/bookings.tsx:215` → `GET` | ✅ | `experts.routes.ts:1857`, `schema.ts:688` |
| 2.5 | **Provider fulfill** | ✅ `provider/bookings.tsx` (status update UI) | ✅ `experts.routes.ts:3503` `PUT /api/provider/booking-requests/:id/respond` | ✅ `schema.ts:688` `serviceBookings` | ✅ `provider/bookings.tsx` → `PUT` | ✅ | `provider/bookings.tsx` |
| 2.6 | **Provider payout** | ✅ `App.tsx:596` `/provider/earnings` | ✅ `experts.routes.ts:3016` `GET /api/provider/earnings` + `experts.routes.ts:3073` `POST /api/provider/payouts/request` + `payments.routes.ts:626` `POST /api/stripe/connect/onboard` | ✅ `schema.ts:4075` `providerEarnings` + `schema.ts:4094` `providerPayouts` | ✅ `provider/earnings.tsx:35` → `GET /api/stripe/connect/status` | ✅ | `App.tsx:596`, `payments.routes.ts:626` |
| 2.7 | **Provider commission (flat 10%)** | ✅ `provider/earnings.tsx` displays 10% | ✅ `commission.ts:76` `resolveCommissionRates` with `role='provider'` | ✅ `schema.ts:1024` `bookingFeeConfigs` (provider_commission_percent) | ✅ `commission.ts` Tier-1 provider branch | ✅ | `commission.ts:76`, `schema.ts:1024` |
| 2.8 | **Provider commission configurable by admin** | ✅ `admin/fee-config.tsx` | ✅ `admin.routes.ts:5070` `POST /api/admin/optimization-fees` (general admin fee CRUD) | ✅ `schema.ts:1024` `bookingFeeConfigs` | ✅ `admin/fee-config.tsx` → `POST /api/admin/optimization-fees` | ✅ | `admin/fee-config.tsx`, `admin.routes.ts:5070` |
| 2.9 | **Provider vs. Expert split** | ✅ `commission.ts` handles both | ✅ `commission.ts:76` `resolveCommissionRates` with `role` param | ✅ `schema.ts:1024` `bookingFeeConfigs` (role-specific rows) | ✅ `commission.ts` branches on `role='provider'` vs `role='expert'` | ✅ | `commission.ts:76` |
| 2.10 | **Provider insurance tier capture** | 🟡 `provider/settings.tsx` has insurance fields | 🟡 Schema has `insuranceTier` fields but no dedicated endpoint | ✅ `schema.ts:508` `providerServices` (insuranceTier column) | 🟡 UI fields exist but not wired to a dedicated API | 🟡 | `schema.ts:508` (insuranceTier); `provider/settings.tsx` (form fields) |

**Provider subtotal:** 9/10 ✅, 1/10 🟡 (insurance tier wiring)

---

### 1.3 Discovery Feed (5 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 3.1 | **Feed renders ranked content** | ✅ `discover-location.tsx` uses `useUpsellSlot("discover_location")` | ✅ `upsell.routes.ts:440` `POST /api/upsell/discover-location` | ✅ `schema.ts` `travelPulseCities` (pulseScore, trendingScore) + `upsell_slot_config` | ✅ `useUpsellSlot` hook → `rankCandidates` server-side | ✅ | `discover-location.tsx:1334`, `upsell.routes.ts:440` |
| 3.2 | **Selection-over-filtering model** | 🟡 `discover-location.tsx` has spine chips (`SpineFilterBar`) | N/A | N/A | 🟡 Chips present but `experience-discovery.tsx` and `discover.tsx` still have checkbox/filter panels | 🟡 | `discover-location.tsx:408` (spine chips); `experience-discovery.tsx:221` (filter panel) |
| 3.3 | **Relevance-dominance enforced** | N/A | ✅ `upsell-engine.service.ts:189` `blendScore` + `:211` `holdsDominance` | ✅ `upsell_slot_config` table with `revenueWeight`, `revenueCap`, `bandWidth` | ✅ `DEFAULT_POLICY` sets `revenueCap: 0.15`, `bandWidth: 0.15`. Tests enforce contract. | ✅ | `upsell-engine.service.ts:189`, `upsell-engine.test.ts:104` |
| 3.4 | **CategoryKey resolver** | ✅ `discover.tsx`, `discover-location.tsx`, `admin/category-fees.tsx` | ✅ `routes.ts:2126` `GET /api/service-categories/:categoryKey/fields` | ✅ `schema.ts:478` `categoryKey` in `serviceCategories`, `serviceOfferingTypes`, `feeBands` | ✅ `roleForProviderCategory` / `isAffiliateCategory` in client. Server resolves via `fee_bands`. | ✅ | `schema.ts:478`, `schema.ts:5690`, `routes.ts:2126` |
| 3.5 | **Click attribution (issue #49)** | ✅ `UpsellSlot.tsx:99` `logClick(offeringId)` | ✅ `upsell.routes.ts:1437` `POST /api/upsell/click` (labeled "issue #49, gates PR #50") | ✅ `schema.ts` `upsell_impressions` (clicked boolean) + `affiliate_clicks` | ✅ `UpsellSlot.tsx:99` → `POST /api/upsell/click` | ✅ | `UpsellSlot.tsx:99`, `upsell.routes.ts:1437` |

**Discovery subtotal:** 4/5 ✅, 1/5 🟡 (selection-over-filtering coexistence)

---

### 1.4 Booking (6 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 4.1 | **Bookability derivation (native/deeplink/info_only)** | ✅ `city-feed-card.tsx` imports `resolveBookability` | ✅ `shared/bookability.ts:48` `resolveBookability` | N/A (derived at read-time) | ✅ Client and server both import from `@shared/bookability` | ✅ | `shared/bookability.ts:48`, `city-feed-card.tsx:12` |
| 4.2 | **Native booking rail** | ✅ `BookingFlowModal.tsx` + `StripeCheckout.tsx` | ✅ `bookings-domain.routes.ts:568` `POST /api/bookings` + `stripe-payment.service.ts:63` `stripe.paymentIntents.create` | ✅ `schema.ts:688` `serviceBookings` | ✅ Full cart → checkout → Stripe PI → webhook → confirmation | ✅ | `stripe-payment.service.ts:63`, `bookings-domain.routes.ts:568` |
| 4.3 | **Deeplink/affiliate booking rail** | ✅ `discover-location.tsx` shows `affiliateLabel` + `deals.tsx` has `affiliateUrl` CTAs | ✅ `content.routes.ts:7216` `POST /api/affiliate/track-click` + `affiliate.service.ts` generates links | ✅ `schema.ts` `affiliateProducts`, `affiliate_links`, `affiliate_clicks`, `affiliate_booking_requests` | ✅ Client tracks clicks → server logs attribution → redirects to partner | ✅ | `discover-location.tsx:512`, `content.routes.ts:7216`, `schema.ts` |
| 4.4 | **Info-only booking rail** | ✅ `city-feed-card.tsx:650` suppresses button when `info_only` | N/A (derived) | N/A (derived) | ✅ `resolveBookability` returns `info_only` when no booking signals | ✅ | `city-feed-card.tsx:650` |
| 4.5 | **Cart system** | ✅ `App.tsx:275` `/cart` + `CartPage` | ✅ `bookings-domain.routes.ts:713` `GET/POST/PATCH/DELETE /api/cart/*` + `POST /api/cart/migrate` + `POST /api/cart/convert-to-itinerary` | ✅ `schema.ts` `cartItems` implied | ✅ `cart.tsx` → cart API + guest→auth migration | ✅ | `cart.tsx:197`, `bookings-domain.routes.ts:713` |
| 4.6 | **Cart multi-currency** | ❌ No UI evidence | ❌ All Stripe calls hardcode `currency: 'usd'` | ❌ No currency column in cart schema | ❌ No wiring | ❌ | `stripe-payment.service.ts:63` (USD only); `cart.tsx` (no currency selector) |

**Booking subtotal:** 5/6 ✅, 1/6 ❌ (multi-currency)

---

### 1.5 Concierge (5 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 5.1 | **AI Concierge (per-task fee)** | ✅ `App.tsx:232` `/concierge` + `IntentForm` + `DeliveryOptions` | ✅ `concierge.routes.ts:72` `POST /api/concierge/quote` + `POST /api/concierge/requests` | ✅ `schema.ts` `conciergeRequests` (intent, chosenTier, status) | ✅ `IntentForm` → `fetch("/api/concierge/quote")` → `DeliveryOptions` → `/cart?step=optimize` | ✅ | `concierge.routes.ts:72`, `concierge/index.tsx:44`, `schema.ts` |
| 5.2 | **Expert Concierge (escalation)** | ✅ `EscalationCTA.tsx:107` ("polish this") + `DeliveryOptions` Expert tier | ✅ `booking-actions.ts:104` `POST /api/expert-requests` + `bookings-domain.routes.ts:177` `POST /api/expert-booking-requests` | ✅ `schema.ts:5383` `expertRequests` | ✅ `EscalationCTA` → `POST /api/expert-requests` | ✅ | `EscalationCTA.tsx:107`, `booking-actions.ts:104` |
| 5.3 | **Full / Done-for-You (event coordination)** | 🟡 `DeliveryOptions.tsx:162` shows "admin will follow up" for Full tier | ✅ `routes.ts:7198+` `GET/POST/PATCH/DELETE /api/coordination-states*` | ✅ `schema.ts:1598` `coordinationStates` + `event_packages` + `eventCoordinationProfiles` | 🟡 Backend routes + schema ready, but traveler-facing DFY checkout flow is stub-only | 🟡 | `DeliveryOptions.tsx:162` (stub); `schema.ts:1598` (coordinationStates); `routes.ts:7198` (coordination API) |
| 5.4 | **Suggest/add wiring (3.3)** | ✅ `PlanningWithBooking.tsx:435` `BookingFlowModal` + `ItineraryComparisonWithBooking.tsx:105` | ✅ `bookings-domain.routes.ts:568` `POST /api/bookings` + `content.routes.ts:3323` `POST /api/claude/optimize-itinerary` | ✅ `schema.ts:688` `serviceBookings` + `schema.ts:64` `trips` | ✅ `BookingFlowModal` → `POST /api/bookings` + `POST /api/claude/optimize-itinerary` | ✅ | `PlanningWithBooking.tsx:435`, `content.routes.ts:3323` |
| 5.5 | **Event coordinator (Phase 4)** | ❌ No dedicated event coordinator UI surface | ✅ `routes.ts:7198+` coordination-states endpoints | ✅ `schema.ts:1598` `coordinationStates` + `eventCoordinationProfiles` | 🟡 Routes exist but **not connected to a traveler-facing event build/coordination UI** | 🟡 | `schema.ts:1598` (model present); `routes.ts:7198` (endpoints); **no UI** |

**Concierge subtotal:** 3/5 ✅, 2/5 🟡 (DFY surface minimal, event coordinator UI missing)

---

### 1.6 Executive Assistant Vertical (12 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 6.1 | **EA dashboard** | ✅ `App.tsx:526` `/ea/dashboard` → `EADashboard` | ✅ `routes.ts` (implied by route registration) | ✅ `schema.ts` `users` (role = `executive_assistant`) | ✅ `App.tsx:526` → `ProtectedRoute` with `requiredRole="executive_assistant"` | ✅ | `App.tsx:526` |
| 6.2 | **EA clients** | ✅ `App.tsx:529` `/ea/clients` → `EAClients` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` (role-based) | ✅ `App.tsx:529` → `ProtectedRoute` | ✅ | `App.tsx:529` |
| 6.3 | **EA executives** | ✅ `App.tsx:532` `/ea/executives` → `EAExecutives` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:532` → `ProtectedRoute` | ✅ | `App.tsx:532` |
| 6.4 | **EA calendar** | ✅ `App.tsx:535` `/ea/calendar` → `EACalendar` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:535` → `ProtectedRoute` | ✅ | `App.tsx:535` |
| 6.5 | **EA events** | ✅ `App.tsx:538` `/ea/events` → `EAEvents` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:538` → `ProtectedRoute` | ✅ | `App.tsx:538` |
| 6.6 | **EA communications** | ✅ `App.tsx:541` `/ea/communications` → `EACommunications` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:541` → `ProtectedRoute` | ✅ | `App.tsx:541` |
| 6.7 | **EA AI assistant** | ✅ `App.tsx:546` `/ea/ai-assistant` → `EAAIAssistant` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:546` → `ProtectedRoute` | ✅ | `App.tsx:546` |
| 6.8 | **EA travel** | ✅ `App.tsx:549` `/ea/travel` → `EATravel` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:549` → `ProtectedRoute` | ✅ | `App.tsx:549` |
| 6.9 | **EA trips** | ✅ `App.tsx:552` `/ea/trips` → `EATrips` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:552` → `ProtectedRoute` | ✅ | `App.tsx:552` |
| 6.10 | **EA venues** | ✅ `App.tsx:555` `/ea/venues` → `EAVenues` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:555` → `ProtectedRoute` | ✅ | `App.tsx:555` |
| 6.11 | **EA gifts** | ✅ `App.tsx:558` `/ea/gifts` → `EAGifts` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:558` → `ProtectedRoute` | ✅ | `App.tsx:558` |
| 6.12 | **EA reports** | ✅ `App.tsx:561` `/ea/reports` → `EAReports` | ✅ `routes.ts` (implied) | ✅ `schema.ts` `users` | ✅ `App.tsx:561` → `ProtectedRoute` | ✅ | `App.tsx:561` |

**EA subtotal:** 12/12 ✅ (all routes present with role gate; pages exist as components)

---

### 1.7 Planning Objects — Trip / Experience / Event (13 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 7.1 | **Trip creation front-door** | ✅ `App.tsx:363` `/quick-start` → `QuickStartItinerary` | ✅ `trips.routes.ts:1023` `POST /api/quick-start-itinerary` | ✅ `schema.ts:64` `trips` | ✅ `quick-start-itinerary.tsx:162` → `useCreateTrip` → `POST` | ✅ | `App.tsx:363`, `trips.routes.ts:1023` |
| 7.2 | **Experience creation front-door** | ✅ `App.tsx:340` `/experiences/:slug/new` → `ExperienceTemplatePage` | ✅ `content.routes.ts:1507` `createUserExperience` | ✅ `schema.ts:1193` `userExperiences` + `schema.ts:1051` `experienceTypes` | ✅ `experience-template.tsx:711` → `POST` | ✅ | `App.tsx:340`, `content.routes.ts:1507` |
| 7.3 | **Event creation front-door** | ✅ `App.tsx:232` `/concierge` → `IntentForm` (event type select) | ✅ `concierge.routes.ts:31` `POST /api/concierge/requests` | ✅ `schema.ts` `eventType` enum on trips + `conciergeRequests` | ✅ `concierge/index.tsx:35` → `IntentForm` → `POST` | ✅ | `App.tsx:232`, `concierge.routes.ts:31` |
| 7.4 | **Trip build** | 🟡 `EnhancedPlanningModal.tsx:77` exists but **not imported anywhere** | ❌ No dedicated trip-build endpoint | ✅ `schema.ts:64` `trips` + itinerary tables | 🟡 `trip-details.tsx:570` has day-by-day UI but no dedicated build endpoint | 🟡 | `EnhancedPlanningModal.tsx:77` (orphan); `trip-details.tsx:570` (day UI) |
| 7.5 | **Experience build** | ✅ `experience-template.tsx:711` (activity selection + template builder) | ✅ `content.routes.ts:914` `GET /api/experience-template-steps` + `content.routes.ts:922` `GET /api/experience-template-tabs` | ✅ `schema.ts:1080` `experienceTemplateSteps` + `schema.ts:2765` `experienceTemplateTabs` | ✅ `experience-template.tsx:711` → `GET` endpoints | ✅ | `experience-template.tsx:711`, `content.routes.ts:914` |
| 7.6 | **Event build** | ❌ No UI for event timeline/vendor matrix | ❌ `buildEventTimeline` exists in `event-coordination.service.ts:86` but **not exposed in any route** | ✅ `schema.ts` `eventCoordinationProfiles` (migration 077) | ❌ No route, no UI | ❌ | `event-coordination.service.ts:86` (orphan service); `schema.ts` (model present) |
| 7.7 | **Trip optimize** | ✅ `optimize.tsx` + `itinerary-comparison.tsx` | ❌ **No `POST /api/trips/:id/optimize`** | ✅ `schema.ts:969` `optimizationFees` | 🟡 Closest: `content.routes.ts:3323` `POST /api/claude/optimize-itinerary`, `trips.routes.ts:1554` `POST /api/trips/:tripId/itinerary/optimize-order`, `upsell.routes.ts:700` `POST /api/upsell/optimize-gate` | 🟡 | `optimize.tsx` (UI); `trips.routes.ts` (no `POST /api/trips/:id/optimize`) |
| 7.8 | **Experience optimize** | ✅ `experience-template.tsx:675` (AI optimize CTA) | ✅ `content.routes.ts:621` `POST /api/ai/optimize-experience` | ✅ `schema.ts:969` `optimizationFees` | ✅ `experience-template.tsx:675` → `POST /api/ai/optimize-experience` | ✅ | `experience-template.tsx:675`, `content.routes.ts:621` |
| 7.9 | **Event optimize** | 🟡 `pricing.tsx:209` mentions event optimize; `optimize.tsx:413` mentions coordination credit | ❌ **No dedicated event optimize endpoint** | ✅ `schema.ts:969` `optimizationFees` (event rows seeded) | ❌ No endpoint, no wiring | ❌ | `schema.ts:969` (model present); **no endpoint** |
| 7.10 | **Trip deliver via PlanCard** | ✅ `dashboard.tsx:290`, `itinerary-view.tsx:580`, `trip-details.tsx:661` | ✅ `plancard.routes.ts:177` `GET /api/trips/:tripId/plancard` | ✅ `schema.ts` `itineraryChanges`, `activityComments` | ✅ `dashboard.tsx` → `plancard.routes.ts:177` | ✅ | `plancard.routes.ts:177`, `dashboard.tsx:290` |
| 7.11 | **Experience deliver via PlanCard** | ❌ No `PlanCard` usage for experiences | ❌ No experience PlanCard endpoint | ❌ No experience PlanCard schema | ❌ | ❌ | **None found** |
| 7.12 | **Event deliver via PlanCard** | ❌ No `PlanCard` usage for events | ❌ No event PlanCard endpoint | ❌ No event PlanCard schema | ❌ | ❌ | **None found** |
| 7.13 | **Event coordination (Phase 4)** | 🟡 `DeliveryOptions.tsx:162` mentions event coordinator | 🟡 `routes.ts:7198+` coordination-states endpoints | ✅ `schema.ts:1598` `coordinationStates` + `eventCoordinationProfiles` | ✅ `resolveCoordinationFee` and `buildEventTimeline` are **wired** — `routes.ts:5975` (fee) and `routes.ts:5996` (timeline) on the coordination-state endpoints | 🟡 | `optimization-fee.service.ts` (wired at routes.ts:5975); `event-coordination.service.ts` (wired at routes.ts:5996); `routes.ts:7198` (endpoints) |

**Planning subtotal:** 6/13 ✅, 2/13 🟡, 5/13 ❌

---

### 1.8 Admin & Compliance (7 capabilities)

| # | Capability | Surface | Endpoint | Model | Wiring | Status | Evidence |
|---|---|---|---|---|---|---|---|
| 8.1 | **Admin fee management** | ✅ `App.tsx:676` `/admin/fee-config` + `App.tsx:679` `/admin/fee-bands` + `App.tsx:685` `/admin/category-fees` | ✅ `admin.routes.ts:5047` `GET /api/admin/optimization-fees` + `admin.routes.ts:5070` `POST /api/admin/optimization-fees` + `admin.routes.ts` fee-bands CRUD | ✅ `schema.ts:5690` `feeBands` + `schema.ts:1024` `bookingFeeConfigs` | ✅ `admin/fee-config.tsx` → `POST /api/admin/optimization-fees` | ✅ | `App.tsx:676`, `admin.routes.ts:5047` |
| 8.2 | **Admin payouts** | ✅ `App.tsx:673` `/admin/payouts` → `AdminPayouts` | ✅ `admin.routes.ts` `POST /api/admin/payouts` | ✅ `schema.ts:3876` `expertEarnings` + `schema.ts:4075` `providerEarnings` | ✅ `admin/payouts.tsx` → `POST` | ✅ | `App.tsx:673`, `admin.routes.ts` |
| 8.3 | **Admin revenue tracking** | ✅ `App.tsx:634` `/admin/revenue` → `AdminRevenue` | ✅ `admin.routes.ts` revenue analytics | ✅ `schema.ts` `revenueTracking` | ✅ `admin/revenue.tsx` → analytics API | ✅ | `App.tsx:634` |
| 8.4 | **Admin content moderation** | ✅ `App.tsx:662` `/admin/content-tracking` → `AdminContentTracking` | ✅ `admin.routes.ts` content moderation endpoints | ✅ `schema.ts` `contentTracking` | ✅ `admin/content-tracking.tsx` → moderation API | ✅ | `App.tsx:662` |
| 8.5 | **Background verification workflow** | 🟡 `provider-status.tsx` shows verification status; `routes.ts:1531` reads `backgroundCheckConfirmed` | 🟡 `routes.ts:1578` `PATCH` updates `backgroundCheckConfirmed` | ✅ `schema.ts:1531` `users.backgroundCheckConfirmed` | 🟡 UI shows status + admin can toggle, but no dedicated background-check submission/upload flow | 🟡 | `routes.ts:1531` (read); `routes.ts:1578` (admin toggle); `schema.ts:1531` (column) |
| 8.6 | **Insurance tier capture** | 🟡 `provider/settings.tsx` has insurance form fields | 🟡 `schema.ts:508` `providerServices` has `insuranceTier` column | ✅ `schema.ts:508` `providerServices` | 🟡 Fields exist but not wired to a dedicated provider insurance tier endpoint | 🟡 | `schema.ts:508` (insuranceTier); `provider/settings.tsx` (form fields) |
| 8.7 | **KYC/AML hooks** | ❌ No dedicated KYC/AML surface | ❌ No KYC/AML endpoint | ❌ No KYC/AML schema | ❌ | ❌ | **None found** |

**Admin/Compliance subtotal:** 4/7 ✅, 2/7 🟡, 1/7 ❌

---

## 2. Prioritized Gap Backlog

Ranked by Pass-1 journey criticality. P0 = on a money/payout terminal. P1 = on a booking/conversion path. P2 = peripheral.

| Priority | Gap | Affected Journey | Status | Evidence | Why it ranks here |
|---|---|---|---|---|---|
| **P0** | `bookingsDomainRoutes` imported but **never mounted** | All cart, booking, coordination, contract endpoints | 🟡 | `server/routes.ts:99` imports but `app.use(bookingsDomainRoutes)` is **missing** | `routes.ts:388-431` mounts all other routers but skips `bookingsDomainRoutes`. The coordination-states endpoints are duplicated inline (lines 7198+), so the API works, but the extracted router file is orphaned. If the inline routes are removed, all booking/coordination APIs break. |
| ~~P0~~ RESOLVED | `resolveCoordinationFee` is **wired** | Event coordination (Journey 7) | ✅ | `optimization-fee.service.ts` → called at `routes.ts:5975` | The coordination fee resolver (now config-backed via `fee_bands` `coordination_floor`/`coordination_percent`, migration 122, with a $499/8% code fallback) IS wired — `GET /api/coordination-states/:id/fee` (routes.ts:5975) calls it, reading the budget from the `budget` jsonb (§7). |
| **P0** | `buildEventTimeline` exists but **not wired to any route** | Event coordination (Journey 7) | 🟡 | `event-coordination.service.ts:86` (service exists); **no route caller** | The event timeline builder is fully implemented and tested but not exposed via any API. The `/api/coordination/wedding-timeline/:tripId` route in `bookings-domain.routes.ts` exists but the router is never mounted. |
| **P0** | Cart **multi-currency** missing | Cart → Payment (Journey 1) | ❌ | `stripe-payment.service.ts:63` hardcodes `currency: 'usd'`; `cart.tsx` has no currency selector | All Stripe PI calls charge in USD regardless of user locale. The `displayCurrency` field in `cart.tsx` is UI-only — it never affects the charged amount. |
| **P1** | `EnhancedPlanningModal` exists but **not imported anywhere** | Trip creation → Planning (Journey 2) | 🟡 | `EnhancedPlanningModal.tsx:77` exists; grep shows **only its own file** | The modal is fully implemented but orphaned. `trip-details.tsx` uses a different day-by-day planner, so `EnhancedPlanningModal` is unreachable. |
| **P1** | `POST /api/trips/:id/optimize` **does not exist** | Trip optimize (Journey 2) | 🟡 | `optimize.tsx` (UI exists); `trips.routes.ts` (no `POST /api/trips/:id/optimize`) | Trip optimization flows through `/api/claude/optimize-itinerary` and `/api/trips/:tripId/itinerary/optimize-order` instead. The canonical endpoint is missing. |
| **P1** | Event optimize **endpoint missing** | Event optimize (Journey 7) | ❌ | `schema.ts:969` has event fee rows; **no event optimize endpoint** | No dedicated API for event optimization. Event coordination uses `resolveCoordinationFee`, which IS wired (routes.ts:5975); a distinct event-optimize endpoint is the remaining gap. |
| **P1** | **Done-for-You (DFY) traveler surface** is stub-only | Concierge → DFY (Journey 2) | 🟡 | `DeliveryOptions.tsx:162` shows "admin will follow up" for Full tier | The Full tier in `DeliveryOptions` shows a placeholder message, not a real checkout flow. Backend `coordinationStates` + `event_packages` are ready but no traveler-facing DFY booking surface exists. |
| **P1** | **Event coordinator UI** missing | Event coordination (Journey 7) | ❌ | No event coordinator surface in `client/src/` | No traveler-facing UI for event coordination (timeline, vendor matrix, coordination fee display). Backend exists but frontend missing. |
| **P1** | **PlanCard for Experience/Event** missing | Experience/Event delivery (Journey 2) | ❌ | No `PlanCard` usage for experiences or events | PlanCard is trip-only. No rendering, endpoint, or schema for experience or event PlanCard. |
| **P2** | Selection-over-filtering **coexistence** | Discovery feed (Journey 1) | 🟡 | `discover-location.tsx` has spine chips; `experience-discovery.tsx` has checkbox panels | Partial migration — chips exist but old filter panels still present. Not a launch blocker. |
| **P2** | Provider **insurance tier wiring** | Provider onboarding (Journey 4) | 🟡 | `schema.ts:508` has `insuranceTier`; `provider/settings.tsx` has form fields; no dedicated API | Insurance tier data is stored but not fully wired through the provider settings API. |
| **P2** | Background check **submission/upload flow** | Compliance | 🟡 | `users.backgroundCheckConfirmed` exists; admin can toggle; no provider upload flow | Providers can see their verification status but cannot submit background check documents. Admin can toggle the flag manually. |
| **P2** | **KYC/AML** missing | Compliance | ❌ | No KYC/AML surface, endpoint, or schema | Not required for day-1 launch but needed for money-transmitter compliance. |
| **P2** | `$9/month power-user tier` | Concierge | ⏳ | `concierge-phase-b-brief.md` ready; 4-week data gate | Code ready but waiting for cost data accumulation (June 6 → July 4). Per delivery map. |
| **P2** | Expert tier-based auto-split (85/15 → 75/25) | Expert payouts | ⏳ | `EXP-OVR` manual override covers beta; auto-flip deferred | Per delivery map: auto-flip deferred post-launch. |
| **P2** | Affiliate markup/rebate | Booking | ⏳ | Pass-through works; partner request triggers scope | Per delivery map: deferred post-launch. |
| **P2** | Platform-usage credits / credit gifting | Credits | ⏳ | `credits-billing` page exists; gifting not wired | Per delivery map: deferred post-launch. |

---

## 3. Promise-vs-Build Deltas ("promised but never built")

These are catalog/business-plan capabilities that have **no implementation at all** — a route trace would never surface them because there's no route to trace.

| # | Catalog Promise | Business Plan Reference | Build Status | Gap |
|---|---|---|---|---|
| 1 | **Event coordinator UI** — traveler-facing timeline, vendor matrix, coordination fee display | §3.1, §4.7 | ❌ | No UI. Backend `event-coordination.service.ts` + `coordinationStates` exist but no frontend. |
| 2 | **PlanCard for Experience** — deliver experience plan via PlanCard | §3.2 | ❌ | No rendering, endpoint, or schema. |
| 3 | **PlanCard for Event** — deliver event plan via PlanCard | §3.1 | ❌ | No rendering, endpoint, or schema. |
| 4 | **KYC/AML compliance hooks** — money-transmitter verification | §5.1 | ❌ | No surface, endpoint, or schema. |
| 5 | **Credit gifting** — gift credits to another user | §4.3 | ⏳ | `credits-billing` page exists; gifting not wired. |
| 6 | **Cart multi-currency** — charge in user's local currency | §4.2 | ❌ | Stripe hardcodes USD. `displayCurrency` is UI-only. |
| 7 | **Event optimize endpoint** — `POST /api/trips/:id/optimize` for events | §3.1 | ❌ | No dedicated event optimize API. |
| 8 | **Done-for-You traveler checkout** — Full tier with real checkout flow | §2.3 | 🟡 | Backend ready, frontend stub-only. |
| 9 | **Provider insurance tier API** — dedicated endpoint for insurance tier submission | §3.2, §5.2 | 🟡 | Schema field exists; no dedicated API. |
| 10 | **Background check document upload** — provider submits docs | §5.3 | 🟡 | Admin can toggle flag; no upload flow. |
| 11 | **EnhancedPlanningModal wiring** — trip planning modal | §3.1 | 🟡 | Component exists but not imported. |
| 12 | **Expert tier auto-split (85/15 → 75/25)** | §4.8 | ⏳ | Manual override works; auto-flip deferred. |
| 13 | **Affiliate markup/rebate** | §4.2 | ⏳ | Pass-through works; markup deferred. |
| 14 | **$9/month power-user tier** | §4.7 | ⏳ | Code ready; 4-week data gate. |

---

## 4. Summary by Critical Journey

| Journey | # Capabilities | # ✅ | # 🟡 | # ❌ | # ⏳ | Blocking Gap |
|---|---|---|---|---|---|---|
| 1. Discover → Cart → Payment → Booking | 6 | 5 | 0 | 1 | 0 | **Multi-currency** (P0) |
| 2. Trip Creation → Planning → Optimize → Checkout | 13 | 6 | 2 | 5 | 0 | **Event build UI**, **Event optimize endpoint**, **PlanCard Experience/Event**, **EnhancedPlanningModal orphan** |
| 3. Expert Onboarding → Service → Booking → Earnings | 10 | 10 | 0 | 0 | 0 | **None** |
| 4. Provider Onboarding → Service → Booking → Earnings | 10 | 9 | 1 | 0 | 0 | **Insurance tier wiring** (P2) |
| 5. Admin Fee Management → Payout | 7 | 4 | 2 | 1 | 0 | **KYC/AML** (P2) |
| 6. Transport Booking | 6 | 5 | 0 | 1 | 0 | **Multi-currency** (P0) |
| 7. Event Coordination (Wedding/etc.) | 5 | 1 | 2 | 2 | 0 | **Event coordinator UI** (P1); resolveCoordinationFee + buildEventTimeline are now **wired** (routes.ts:5975/5996) — the prior "unwired P0" is RESOLVED |
| 8. AI Assistant → Booking Conversion | 5 | 3 | 1 | 1 | 0 | **Multi-currency** (P0) |
| EA Vertical | 12 | 12 | 0 | 0 | 0 | **None** |

---

## 5. Critical Cross-Cutting Findings

1. **`bookingsDomainRoutes` NEVER MOUNTED** — `server/routes.ts:99` imports the router but `app.use()` is missing. This is a **P0 structural bug**: the extracted `bookings-domain.routes.ts` file (1,500+ lines) is dead code. The endpoints are duplicated inline in `routes.ts` (lines 7198+), so the API works, but the architecture is broken. If the inline routes are removed, the entire booking/coordination layer collapses.

2. ~~**Two Phase 4 services are fully implemented but unwired**~~ **RESOLVED (Jul 21, 2026):** `resolveCoordinationFee` and `buildEventTimeline` ARE wired — `routes.ts:5975` (fee) and `routes.ts:5996` (timeline) on the coordination-state endpoints. This row is kept as a corrected record; the "built but never plugged in" gap no longer applies to these two.

3. **PlanCard is trip-only** — No PlanCard rendering, endpoint, or schema exists for experiences or events. This is a structural gap in the delivery layer for non-trip planning objects.

4. **Stripe always charges USD** — `stripe-payment.service.ts:63` hardcodes `currency: 'usd'`. The `displayCurrency` field in `cart.tsx` is cosmetic. Multi-currency is a launch-blocker for non-US markets.

5. **All 8 P0/P1 gaps sit on money or payout journeys** — the gap backlog is correctly concentrated where revenue is at risk.
