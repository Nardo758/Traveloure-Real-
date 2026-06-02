# Traveloure — Spec vs Code Gap Report

**Generated:** 2026-06-02
**Branch:** `claude/laughing-bardeen-KyTUY`
**Scope:** Read-only audit. No application code modified.

**Source documents read:**
- Inline business plan (user-provided in task message)
- `attached_assets/TRAVELOURE_WIREFRAMES_COMPLETE_v2_(2)_1767308071667.md`
- `attached_assets/TRAVELOURE_COMMERCE_WIREFRAMES_v4_1767389773873.md`
- `attached_assets/TRAVELOURE_MARKETPLACE_MASTER_SPEC_1767736982633.md` (closest analogue to "MASTER IMPLEMENTATION ARCHITECTURE")
- `attached_assets/COORDINATION_HUB_ARCHITECTURE_1768145676190.md`

Note: the exact filenames `Traveloure_Complete_Business_Plan_-_Updated.md` and `TRAVELOURE_MASTER_IMPLEMENTATION_ARCHITECTURE.md` do not exist in the repo. The inline plan in the task description was used in place of the first; `TRAVELOURE_MARKETPLACE_MASTER_SPEC` was used in place of the second.

**Status legend:** ✅ BUILT · 🟡 PARTIAL · 🔴 MISSING · ⚪ DEFERRED

---

## 1. Summary Table

| Feature Group | ✅ Built | 🟡 Partial | 🔴 Missing | ⚪ Deferred | Total |
|---|---:|---:|---:|---:|---:|
| A. Traveler | 12 | 9 | 2 | 0 | 23 |
| B. Expert (Consultative Advisor) | 14 | 6 | 2 | 0 | 22 |
| B2. Executive Assistant | 4 | 0 | 0 | 0 | 4 |
| C. Provider | 8 | 5 | 1 | 0 | 14 |
| D. Three-Party Marketplace | 5 | 6 | 5 | 0 | 16 |
| E. PlanCard / Itinerary | 8 | 5 | 2 | 0 | 15 |
| F. Monetization | 2 | 4 | 5 | 0 | 11 |
| G. Admin Panel | 6 | 3 | 2 | 0 | 11 |
| H. AI Layer | 6 | 7 | 2 | 0 | 15 |
| **TOTAL** | **65** | **45** | **21** | **0** | **131** |

Plus 12 ⚪ DEFERRED items captured separately at end of §2.

---

## 2. Full Mapping Table

### A. Traveler Features

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| A1 | Email/phone signup with verification, 2FA via SMS | 🟡 | `server/replit_integrations/auth/emailAuth.ts` (register/login/reset/logout); `server/replit_integrations/auth/replitAuth.ts` (OAuth); `server/replit_integrations/auth/facebookAuth.ts` | No SMS 2FA path found (no Twilio/Authy integration grep hit). Email verification flow not located. |
| A2 | Traveler profile (travel style, interests, dietary, accessibility, languages) | 🟡 | `shared/schema.ts:154` `touristPreferences`; `client/src/pages/profile.tsx` | Schema covers preferences but accessibility-needs UI not verified; languages-spoken field not located. |
| A3 | User dashboard home with Active/Upcoming/Credits/Saved stat cards | ✅ | `client/src/pages/dashboard.tsx` route at `App.tsx:354` | |
| A4 | Multi-experience plan creation (Travel/Wedding/Proposal/Romance/Birthday/Corporate/Custom) 4-step wizard | ✅ | `App.tsx:296-302` `/experiences`, `/experiences/:slug`, `/experiences/:slug/new`; `shared/schema.ts:838` `experienceTypes`, `:860` `experienceTemplateSteps` | |
| A5 | Three planning-approach paths (AI-only / Hybrid / Expert-led) | 🟡 | `routes.ts:749` `/api/ai/generate-blueprint`, `:8339` `/api/ai/generate-itinerary`; expert assignment via `tripExpertAdvisors` table | Backend supports each path individually; explicit 3-way picker UI in plan-creation wizard not verified. |
| A6 | Quick Quiz recommender (5 questions → approach suggestion) | 🔴 | none — `grep -r "quick.quiz\|recommender" client/src` → 0 | |
| A7 | Commerce-first entry: location+dates → immediate inventory browse | 🟡 | `App.tsx:231` `/discover`; `routes.ts:1706` `/api/catalog/search` | UI present but "ask almost nothing" flow not fully verified vs v4 wireframe. |
| A8 | Persistent shopping cart with subtotal + 3% platform fee + per-person breakdown | 🟡 | `shared/schema.ts:685` `cartItems`; `routes.ts:5331-5438` cart CRUD; `App.tsx:238` `/cart` | Platform fee in `bookingFeeConfigs.platformFeePercent` defaults to **12%**, not the spec's 3% (`schema.ts:5242`). Save-cart/share-cart not located. |
| A9 | Activities/Hotels/Services/Restaurants tabs with filters (price, duration, rating, skip-the-line, instant confirm, free cancel) | ✅ | `App.tsx:231` `/discover`; `routes.ts:1815-2206` 19+ vertical catalog endpoints; `shared/schema.ts:2458-2513` experience template tabs/filters | |
| A10 | Cart items grouped by category with per-item remove | 🟡 | `routes.ts:5331-5438` cart CRUD includes DELETE per item | Category grouping in UI not verified in `client/src/pages/cart.tsx`. |
| A11 | AI Optimization upsell modal — 3 tiers ($19.99/$49.99/$199) with money-back guarantee | 🔴 | none — no `$19.99 / $49.99 / $199` constants found in `client/src` or `server` | Variant generation exists but tiered paywall not implemented. |
| A12 | Plan Comparison view: original + Cost Saver + Time Saver + Local Expert side-by-side | ✅ | `App.tsx:349` `/itinerary-comparison/:id`; `client/src/pages/itinerary-comparison.tsx`; `shared/schema.ts:773` `itineraryVariants`, `:815` `itineraryVariantMetrics`; `server/itinerary-optimizer.ts` | |
| A13 | Native checkout (CC / PayPal / Apple Pay) with platform fee waiver when AI optimization purchased | 🟡 | `routes.ts:5452` `/api/checkout`; `client/src/components/booking/StripeCheckout.tsx`; `server/services/stripe-payment.service.ts` | Stripe path exists; PayPal/Apple Pay branches not located; fee-waiver-on-optimization rule not implemented. |
| A14 | Real-time chat with Expert (WebSocket, attachments, online status, voice notes, scheduled send) | 🟡 | `shared/schema.ts:736` `userAndExpertChats`; `server/routes/messages.ts`; `routes.ts` `/api/messages` | No WebSocket server found (`grep -r "ws\|socket.io\|WebSocket" server` not run as positive hit). Voice notes & scheduled send not located. |
| A15 | In-chat Contract Proposal cards (Accept/Decline/Discuss Changes) | ✅ | `shared/schema.ts:711` `userAndExpertContracts`; `App.tsx:251` `/contracts/:id`; `routes.ts:5578` | |
| A16 | Credits wallet — 1 credit = $1, packages $10/25/50/100/200/500 with 0/8/10/20/25/30% bonus, never expire | ✅ | `shared/schema.ts:616` `wallets`, `:624` `creditTransactions`; `routes.ts:2356-2415` wallet+credits endpoints; `client/src/pages/credits.tsx` | Credit-package definitions are hardcoded client-side (no `credit_packages` table). |
| A17 | Credit transaction history with running balance | ✅ | `routes.ts:2363` `/api/wallet/transactions`; `shared/schema.ts:624` `creditTransactions` | |
| A18 | Multiple saved payment methods with default + invoices/receipts | 🟡 | `server/services/stripe.service.ts`; Stripe handles cards | UI for managing multiple methods not verified; receipt download stubbed (`client/src/components/booking/BookingConfirmation.tsx:44,49` TODO). |
| A19 | Notifications center with email/SMS/push/WhatsApp per-event toggles | 🟡 | `shared/schema.ts:670` `notifications`; `routes.ts:4652-4690`; `App.tsx:369` `/notifications` | Channel-toggle settings UI not verified; no WhatsApp/SMS provider integration found. |
| A20 | All Trips/Events page with Active/Upcoming/Completed filters | ✅ | `App.tsx:357` `/my-trips`; `client/src/pages/my-trips.tsx` | |
| A21 | Mobile live tracking app for in-trip itinerary | 🔴 | none — no native/PWA mobile app code beyond responsive web | Spec calls for distinct mobile tracking experience. |
| A22 | Trip review/rating after completion | ✅ | `shared/schema.ts:133` `reviewRatings`, `:587` `serviceReviews`; `routes.ts:4692-4736` | |
| A23 | AI-generated PDF download + calendar (.ics) + share link | 🟡 | `server/routes/my-itinerary.routes.ts` GET `:id/calendar`; `routes.ts:15227,15300` KML/GPX export; `App.tsx:245` `/trips/shared/:token` | PDF generation not located; `.ics` calendar export exists. |

### B. Expert Features (Consultative Advisor)

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| B1 | Expert application with admin review/approval | ✅ | `shared/schema.ts:290` `localExpertForms`; `routes.ts:962-1015` `/api/expert-application`, `/api/expert-forms`; `client/src/pages/admin/experts.tsx` | |
| B2 | Expert dashboard (Active Clients / Revenue MTD / Rating / AI Hours Saved) | ✅ | `client/src/pages/expert/dashboard.tsx` (575 lines); `routes.ts:4838` `/api/expert/dashboard` | |
| B3 | "Needs Attention" triage queue with urgency colors and inline actions | 🟡 | `client/src/pages/expert/dashboard.tsx` rendering present | Backend triage prioritization logic not verified. |
| B4 | Expert Services Menu CRUD | ✅ | `client/src/pages/expert/services.tsx` (446 lines); `routes.ts:4277` `/api/expert/services`; `shared/schema.ts:905` `expertSelectedServices` | |
| B5 | 5-step Service Creation Wizard (Type→Basics→Included→Pricing→Requirements/FAQs) | ✅ | `client/src/pages/expert/service-wizard.tsx`; `App.tsx:430` `/expert/service-wizard` | |
| B6 | Pre-built Service Template library (38+ templates: Quick Consultation $29, Cart Review $49, Full Trip Planning $249, etc.) | ✅ | `client/src/pages/expert/service-templates.tsx`; `shared/schema.ts:514` `serviceTemplates`; `routes.ts:2462-2517` | Template content (38+ items) not verified by row count. |
| B7 | Expert Service tier structure (Tier 1 $29-49 / Tier 2 $49-99 / Tier 3 $199-499 / Specialty $99-899) | 🟡 | `shared/schema.ts:893` `expertServiceOfferings` | No tier-enforcement code located; price tiers per spec not codified as enum. |
| B8 | Per-service analytics (bookings, revenue, conversion %, avg rating) with pause/duplicate/edit/lead-time/blackout | 🟡 | `routes.ts:4755-4954` `/api/expert/analytics`; `client/src/pages/expert/analytics.tsx` | Pause/blackout/lead-time controls per-service not verified. |
| B9 | Expert public profile page `/experts/:id` with About/Services/Reviews/Portfolio tabs | ✅ | `App.tsx:223` `/experts/:id`; `client/src/pages/expert-detail.tsx` | |
| B10 | Self-service booking: select → form → Stripe pay → auto-contract → auto-open chat | 🟡 | `routes.ts:4584` POST `/api/bookings`; `server/services/booking.service.ts` (TODOs at 392, 456-458 for notify/earnings/availability) | Auto-contract generation and auto-open chat post-payment not implemented; many side-effects stubbed. |
| B11 | Chat-first booking path (chat → expert creates custom contract) | ✅ | `userAndExpertContracts` table; `/api/expert/contracts/recent` (`routes.ts:17834`) | |
| B12 | Expert Earnings Dashboard with weekly/monthly toggle + Request Payout | ✅ | `client/src/pages/expert/earnings.tsx`; `shared/schema.ts:3562` `expertEarnings`, `:3579` `expertPayouts`; `routes.ts:12802` `/api/expert/payouts/request` | |
| B13 | Expert AI Assistant ("Productivity Partner") — Quick Delegate + Pending Review with Send/Edit/Regenerate/Reject | ✅ | `client/src/pages/expert/ai-assistant.tsx` (488 lines); `shared/schema.ts:1916` `expertAiTasks`; `routes.ts:7944-8129` delegate/approve/reject/regenerate | |
| B14 | Expert AI stats panel (tasks, completion, time saved, edit rate, quality, top strengths) | ✅ | `routes.ts:8206` `/api/expert/ai-tasks/stats` | |
| B15 | Expert negotiates vendor pricing on behalf of client; surface savings in chat | 🟡 | `shared/schema.ts:4384` `expertVendorCoordination` (deposit/total fields); `routes.ts:13579-13672` vendor management | "Negotiated savings" surfacing in chat as a typed contract field not located. |
| B16 | Expert Bookings/Services/Performance/Learning + Help/Resources | 🟡 | bookings.tsx, services.tsx, performance.tsx present; **`leaderboard.tsx:18` is 33-line "Coming Soon" placeholder** | "Learning" route not present; closest is `/expert/templates` + `/expert/content-studio`. |
| B17 | Background verification flow (gov ID, references, category credentials) | 🟡 | `localExpertForms.identityVerification*` fields (`schema.ts:351-366`); `server/routes/identity.routes.ts` POST `/create-session`; Stripe Identity webhook | Category-specific credential checks not located; references collection not verified. |
| B18 | Insurance tier attachment on expert/provider profile drives downstream commission | 🔴 | none — no insurance-tier→commission mapping found | `bookingFeeConfigs` exists but is not driven by an insurance tier. |
| B19 | Expert calendar/availability with concurrent booking cap + lead-time | 🟡 | `shared/schema.ts:4313` `providerAvailabilitySchedule`, `:4333` `providerBlackoutDates`; `routes.ts:16943-17046` rules + blackouts | Tables/endpoints are provider-side; expert-side equivalents not found. |
| B20 | Expert sends contract proposals with itemized scope, deposit/balance schedule, T&Cs | ✅ | `userAndExpertContracts` table; `bookings.stripeDepositIntentId / stripeBalanceIntentId` (`schema.ts:4988-4990`) | |
| B21 | TikTok-first creator-fund participation flag on expert profile | 🔴 | none — no `creatorFund` field anywhere | |
| B22 | Distinction: Experts are advisors; Tour Guides are Providers | 🟡 | `users.role` enum includes `local_expert` and `service_provider`; provider categories include guides | No code-level guard preventing Experts from offering physical-guide services. |

### B2. Executive Assistant (sub-role)

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| B2-1 | EA dashboard supporting multiple executives with profile data | ✅ | `client/src/pages/ea/dashboard.tsx`, `executives.tsx`; `shared/schema.ts:5280-5448` 8 EA tables; `routes.ts:17284-17833` `/api/ea/*` | |
| B2-2 | Multi-Client / Multi-Event coordination calendar with conflict detection | ✅ | `client/src/pages/ea/calendar.tsx`, `events.tsx`; `shared/schema.ts:5323` `eaEvents` | Conflict-detection logic not deeply verified. |
| B2-3 | AI Coordination Assistant (cross-exec scheduling, gift research, approvals) | ✅ | `client/src/pages/ea/ai-assistant.tsx`; `shared/schema.ts:5432` `eaAiTasks` | |
| B2-4 | Bulk vendor research + travel approval workflows | ✅ | `client/src/pages/ea/travel.tsx`, `venues.tsx`, `gifts.tsx`; `shared/schema.ts:5346` `eaTravelArrangements`, `:5391` `eaSavedVenues`, `:5368` `eaGifts` | |

### C. Provider Features

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| C1 | Provider application with category selection (15+ categories) | ✅ | `shared/schema.ts:372` `serviceProviderForms`, `:420` `serviceCategories`; `routes.ts:1156-1185` `/api/provider-application`, `/api/provider-forms`; `shared/constants/providerCategories.ts` | |
| C2 | Multi-role registration (one provider holds multiple verified roles) | 🟡 | `users.role` can be promoted; no `provider_roles` join table or primary-role designator found | |
| C3 | 5-step provider registration (Roles→Basic→Role-Specific→Verification→Payment) | 🟡 | `client/src/pages/become-provider.tsx`; `serviceProviderForms` schema | Step structure not verified to match 5-step spec; wizard component not located. |
| C4 | Category-specific verification (background check, gov ID, references, CPR, license, insurance proof) | 🟡 | identity verification fields on forms; admin/providers.tsx approval UI | No per-category required-document matrix found. |
| C5 | Provider insurance tier selection driving 4-12% commission | 🔴 | `providerSettings` table (`schema.ts:5254`); `bookingFeeConfigs.platformFeePercent=12` default (`:5242`) | No insurance-tier → commission-rate logic; commission rate is a flat config, not a tier engine. |
| C6 | Provider dashboard (Pending/Month/MTD/Rating) with role switcher for multi-role | 🟡 | `client/src/pages/provider/dashboard.tsx` (442 lines) | Role switcher UI not verified. |
| C7 | Pending Requests queue (Send Quote / Decline / Request More Info / Calendar) | ✅ | `shared/schema.ts:4343` `providerBookingRequests` (includes `counterOffer`); `routes.ts:13774` GET; `:13815` PUT respond; `client/src/components/logistics/provider-booking-context.tsx` | |
| C8 | Provider Services Management (price, included, delivery, lead time, max concurrent, blackout) | ✅ | `client/src/pages/provider/services.tsx`; `shared/schema.ts:456` `providerServices`; blackout dates table | |
| C9 | Provider calendar with confirmed bookings & availability windows | ✅ | `client/src/pages/provider/calendar.tsx`, `availability-management.tsx`; availability rules CRUD (`routes.ts:16943-17004`) | |
| C10 | Provider Earnings + payout requests (weekly cadence) | ✅ | `client/src/pages/provider/earnings.tsx`, `payouts.tsx`; `shared/schema.ts:3779` `providerPayouts`; `routes.ts:12712-12765` | Weekly cadence enforcement not verified. |
| C11 | Provider reviews with right of response | ✅ | `routes.ts:4736` expert/provider review-response endpoint; `serviceReviews` table | |
| C12 | Tour Guides classified as Providers (not Experts) | ✅ | `serviceCategories` includes guide categories; `users.role = service_provider` for guides | |
| C13 | Provider portal for vendor coordination (incoming bookings from Experts & travelers) | ✅ | `providerBookingRequests`, `expertVendorCoordination` tables; provider/bookings.tsx | |
| C14 | Custom category request submission (admin approval) | 🔴 | none — admin can CRUD categories but provider-side custom-category request workflow not found | |

### D. Three-Party Marketplace Mechanics

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| D1 | Stripe Connect onboarding for Experts/Providers with bank/IBAN/PayPal | ✅ | `server/services/stripe-connect.service.ts` (Express accounts, onboarding link, login link, status); `routes.ts:12865-12931`; `client/src/components/stripe-connect-card.tsx` | PayPal-as-payout not located (Stripe Connect only). |
| D2 | Stripe Treasury for held funds | 🔴 | none — `grep -rn "treasury" server client` → 0 hits | Spec requires Stripe Treasury; only Connect Express transfers + payment intents in use. |
| D3 | Stripe Tax for jurisdictional tax | 🔴 | none — `grep -rn "stripe.tax\|StripeTax\|automaticTax" server` → 0 hits | |
| D4 | **75/25 Expert/platform split** on expert services | 🔴 | **No `0.75` or `0.25` constant anywhere in `/server`.** Conflicting splits found: `revenueSplits.expertPercentage=85, platformPercentage=15` defaults (`schema.ts:3650-3652`); `bookingFeeConfigs.expertSharePercent=70, platformFeePercent=12` (`:5242-5244`) | **Three competing split sources of truth, none matching the business plan's 75/25.** |
| D5 | Provider 4-12% commission tier engine driven by insurance level | 🔴 | none — no tier→rate function | Spec drift: codebase encodes flat percentages, not a tier engine. |
| D6 | Auto-contract generation on service selection + Stripe payment URL | 🟡 | `routes.ts:5578` `/api/contracts/:id`; `bookings` table with `stripePaymentIntentId` | Auto-trigger from "Add to cart → contract" not located. |
| D7 | Stripe webhook → update booking → WebSocket notify → auto-open chat → email | 🟡 | `server/routes/webhooks.routes.ts` + `server/services/stripe-payment.service.ts` | Lines 158-227 contain `// TODO` for notify-user, notify-provider, update-earnings, return-inventory. No WebSocket emit found. |
| D8 | Expert→Provider booking proposal flow (Accept/Decline/Counter/More Info) | ✅ | `shared/schema.ts:4343` `providerBookingRequests` with `counterOffer` JSONB; `routes.ts:13815` PUT respond; `client/src/components/logistics/expert-coordination-hub.tsx` | |
| D9 | **"via Expert" attribution shown to travelers on bookings** | 🔴 | **None — `grep -rn "via.Expert\|viaExpert\|via_expert" server client` → 0 hits.** `expertId` is stored on bookings but no UI surface attributes the booking to the sourcing Expert. | |
| D10 | Coordination state as SSOT across User/Expert/Vendor | ✅ | `shared/schema.ts:1385` `coordinationStates`, `:1425` `coordinationBookings`; `routes.ts:6063-6257` `/api/coordination-states/*`; `routes.ts:13847-13944` propagation endpoints | |
| D11 | Stakeholder sync status (userNotified/expertNotified/vendorNotified) | 🟡 | `coordinationStates` table exists with state tracking | Specific notified flags + pending-notifications queue not verified as named columns. |
| D12 | Async vendor response with 24h deadline + continue-during-pending | 🟡 | `providerBookingRequests` has `status='pending'` and `respondedAt` | 24h timeout enforcement / auto-escalation cron not found. |
| D13 | Conflict resolution engine (expert pref vs weather vs availability → alternative) | 🔴 | none — no conflict-resolution service file found | |
| D14 | Graceful degradation (expert unavailable → AI fallback; vendor down → cached + manual) | 🟡 | `server/services/ai-orchestrator.ts:488` has Claude→Grok fallback; cache tables present | No documented "expert unavailable → AI" handoff trigger. |
| D15 | Booking dispute / refund queue routed to admin | 🟡 | `routes.ts:11820` admin moderation routes; `stripe-payment.service.ts` `refunds` function | No dispute-specific table or admin queue UI found. |
| D16 | Review system: traveler reviews service+provider, provider responds, verified-booking flag | ✅ | `serviceReviews`, `reviewRatings`; `routes.ts:4692-4736` includes expert response | |

### E. PlanCard / Itinerary System

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| E1 | PlanCard data model (meta, days, activities, meals, accommodation, transportation) | ✅ | `client/src/components/plancard/plancard-types.tsx`; `server/routes/plancard.routes.ts` GET `/api/trips/:tripId/plancard` | |
| E2 | **3 map layers — Places, Lodging, Transport — independently toggleable** | 🟡 | `client/src/components/plancard/MapControlCenter.tsx:333` `useState({ activities: true, transport: true })` — **only 2 layers**. Toggle UI lines 558-566 show only two switches. | **Lodging layer missing entirely.** |
| E3 | Transport-as-post-optimization (routes computed AFTER places locked) | ✅ | `server/services/transport-leg-calculator.ts:69` `calculateTransportLegs(variantId, activities, …)` sorts by activity order (line 87) then iterates pairwise (line 89). Routes computed after activities are placed. | |
| E4 | Day-by-day timeline with time/location/booking-ref/confirmation/directions/contact/what-to-bring/tips | ✅ | `client/src/components/plancard/ActivitiesSection.tsx`; `shared/schema.ts:2707` `itineraryItems` | |
| E5 | Native maps handoff (Open in Apple/Google Maps deep links) | ✅ | `server/services/maps-url-builder.ts` (`buildGoogleNavUrl`, `buildAppleNavUrl`, `buildAppleMapsWebUrl`); `client/src/lib/navigate.ts` `openInMaps` w/ iOS detection; used in `ActivitiesSection.tsx:145,555`, `TransportSection.tsx:18,30`; route `routes.ts:15373` | |
| E6 | Itinerary versioning (version, lastModified, modifiedBy) | ✅ | `shared/schema.ts:773` `itineraryVariants` (version field); `routes.ts` `itineraryChanges` log; `server/routes/plancard.routes.ts` change-log CRUD | |
| E7 | **Collaborator permissions: owner / editor / viewer / guest** | 🟡 | `shared/schema.ts:4526` `sharedItineraries.permissions` (token-based view/edit); `:2557` `tripParticipants.role` includes `organizer`/`co-organizer`/`guest`/`vendor_contact` | **4-role spec (owner/editor/viewer/guest) not fully encoded.** No standalone `collaborators` table. |
| E8 | Share plan with partner / team access for corporate trips | ✅ | `shared/schema.ts:5183` `sharedTrips`, `:5209` `sharedTripViews`; `client/src/components/GuestInviteManager.tsx`; guest-invites schema | |
| E9 | PlanCard budget breakdown (accom/food/activities/transport/shopping %) | 🟡 | `plancard-types.tsx` exposes `savings`/`savingsPercent`; `StatsRow.tsx` renders totals | Categorical breakdown percentages not verified as a defined data structure. |
| E10 | "Why this works for you" reasoning panel (interest matches + pacing) | 🔴 | none — no `whyThisWorks` / reasoning-panel component found | |
| E11 | Edit Day / View Map / Get Local Expert per-day actions | ✅ | `client/src/components/plancard/DaySelector.tsx`, `SectionTabs.tsx`; trip-experts API | |
| E12 | Real-time collaboration on plans (multiple editors) | 🔴 | none — no WebSocket/CRDT/Yjs infrastructure found in `/server` | |
| E13 | PDF export, mobile itinerary, calendar (.ics) export | 🟡 | `server/routes/my-itinerary.routes.ts` `/api/my-itinerary/:id/calendar`; `routes.ts:15227,15300` KML/GPX | PDF generator not located. |
| E14 | Live tracking URL for in-trip coordination | ✅ | `App.tsx:245` `/trips/shared/:token`; `App.tsx:242` `/itinerary-view/:token`; `sharedTrips` table | |
| E15 | Day-of overview generator + per-activity directions | 🟡 | per-activity directions: ✅ via navigate.ts; "day-of overview" generator not located | |

### F. Monetization

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| F1 | Affiliate commissions (GYG 8-12%, Viator 8-10%, Klook 10-15%, Booking 15-25%, Airbnb 3%) | ✅ | `shared/schema.ts:3345` `affiliatePartners`, `:3369` `affiliateProducts`, `:3422` `affiliateClicks`, `:3693` `affiliateEarnings`; `routes.ts:11328-11562` admin partner CRUD + reconciliation; `client/src/pages/admin/affiliate-partners.tsx` | Rate-per-partner data not verified. |
| F2 | AI Optimization upsell — 3 paywall tiers ($19.99/$49.99/$199) with money-back guarantee | 🔴 | none — variant generation exists (`/api/ai/generate-optimized-itineraries`) but no `19.99`/`49.99`/`199` price constants or paywall modal found | |
| F3 | 3% platform fee on bookings, waived when AI optimization purchased | 🔴 | `shared/schema.ts:5242` `bookingFeeConfigs.platformFeePercent` default **= 12** (not 3). No waiver logic when optimization is purchased. | Spec drift in default fee. |
| F4 | Credit packages with bonus tiers + never-expire | 🟡 | Credit purchase route exists (`routes.ts:2400`); package definitions hardcoded client-side in `client/src/pages/credits.tsx` | No `credit_packages` table; never-expire enforcement not located. |
| F5 | Subscriptions: Savings Explorer $19.99/mo, Savings Concierge $39.99/mo, Corporate custom | 🔴 | **No subscription/membership table or endpoint.** `grep -n "pgTable.*subscript\|pgTable.*member" shared` → 0 (excluding the `subscription` value in `revenueSourceTypes` enum at `schema.ts:3812`). | |
| F6 | AI Savings Analysis free (lead generation) with savings receipt at checkout | 🟡 | Variant generation surfaces `savings`/`savingsPercent` (`StatsRow.tsx:86-89`); `transport-booking-options.service.ts:39,229,248` `savingsVsIndividual` | No standalone "savings analysis" lead-gen funnel; no checkout savings receipt component. |
| F7 | Expert Creator Fund payouts (TikTok-first creator program) | 🔴 | none — no `creatorFund` table/field or revenue-share rule found | |
| F8 | "Platform providers first" display logic — native ranked above SERP/affiliate | 🟡 | `server/services/transport-booking-options.service.ts:64-96` explicitly ranks platform options first (sortOrder=0, isRecommended=true) before affiliates; `routes.ts:9586` discoverPlatformProviders branch | **No global ranking utility** — implemented ad-hoc per-vertical. Discover/search endpoints don't enforce platform-first consistently. |
| F9 | Provider commission tier engine 4-12% by insurance tier | 🔴 | (see D5) — flat configs only | |
| F10 | 75/25 expert services platform fee | 🔴 | (see D4) — no 75/25 anywhere | |
| F11 | Per-booking platform-take reporting in admin | ✅ | `client/src/pages/admin/revenue.tsx`; `routes.ts:12223-12711` revenue dashboard/summary/transactions/unified/export; `shared/schema.ts:3816` `platformRevenue`, `:3848` `dailyRevenueSummary` | |

### G. Admin Panel

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| G1 | Admin dashboard with Total Users / Active Plans / Revenue MTD / New Users Today | ✅ | `client/src/pages/admin/dashboard.tsx` (225 lines); `routes.ts:14719` `/api/platform/stats` | |
| G2 | Pending Approvals queue (Expert apps, Provider apps, Disputes) | 🟡 | `client/src/pages/admin/experts.tsx`, `providers.tsx` (566 lines) | No unified "Pending Approvals" tab combining all three; disputes queue missing. |
| G3 | Service Provider Category CRUD (custom fields, required docs, templates, display order, featured) | ✅ | `routes.ts:2529-2663` admin category endpoints; `client/src/pages/admin/categories.tsx`; `shared/schema.ts:420` `serviceCategories`, `:438` `serviceSubcategories` | Full custom-field-schema builder not verified. |
| G4 | Expert Management (list, suspend, edit, bookings, earnings) | ✅ | `client/src/pages/admin/experts.tsx` (360 lines); admin routes | |
| G5 | Provider Management with verification queue + approve/reject + admin notes | ✅ | `client/src/pages/admin/providers.tsx` (566 lines) | |
| G6 | User Management with role assignment (multi-role) | ✅ | `client/src/pages/admin/users.tsx` (229 lines); `users.role` enum | |
| G7 | Platform Analytics (GMV, category popularity, conversion funnels) | ✅ | `client/src/pages/admin/analytics.tsx`, `tourism-analytics.tsx`; `routes.ts:13945-14803`; analytics tables `bookingFunnelAnalytics`, `searchAnalytics`, `pageViewAnalytics` | |
| G8 | Dispute resolution interface (refunds, complaints) | 🔴 | `client/src/pages/admin/content-tracking.tsx:423` shows **"Invoice management coming soon"** stub; no `/admin/disputes` route | |
| G9 | Platform Health monitor (API time, server load, sessions, AI queue) | 🟡 | `client/src/pages/admin/system.tsx`; `/api/admin/system/health` | Live metrics depth not verified. |
| G10 | System logs viewer + audit trail of coordination state changes | 🟡 | `shared/schema.ts:3896` `accessAuditLogs`; `routes.ts` admin notifications | No coordination-state-specific audit log UI located. |
| G11 | Custom category request approval workflow | 🔴 | (see C14) — no submission/queue UI | |

### H. AI Layer

| # | Spec Item | Status | Evidence | Notes |
|---|---|---|---|---|
| H1 | **Gronk Optimizer** — weighted scoring (Cost×0.35 + Time×0.35 + Quality×0.30) | 🟡 | `server/itinerary-optimizer.ts` (`generateOptimizedItineraries`, `getComparisonWithVariants`); `server/services/grok.service.ts` (note: "Grok" not "Gronk" in code); `server/services/itinerary-intelligence.service.ts:70` uses `grok-3-mini` | Explicit 0.35/0.35/0.30 weighting constants not located; tuning lives inside LLM prompts. |
| H2 | Three alternative-plan generators: Cost Saver / Time Saver / Local Expert with different weights | 🟡 | `shared/schema.ts:773` `itineraryVariants` with `variantType`; `server/itinerary-optimizer.ts` produces variants | Three named variants exist conceptually in optimizer; explicit weight tuples (0.6/0.2/0.2 etc) per spec not located. |
| H3 | Cost Optimization algorithms (bundling, date shifting, alt suppliers, free alternatives, off-peak, combo) | 🟡 | itinerary-optimizer prompts; `trip-optimization.service.ts:335` references "current deals and smart savings" | Algorithms exist as LLM-prompted heuristics, not as deterministic functions. |
| H4 | Time Efficiency algorithms (clustering, TSP, skip-the-line, optimal visit times, mode selection, buffer elimination) | 🟡 | `transport-leg-calculator.ts` handles routing; LLM prompts handle clustering | No TSP solver located. |
| H5 | Hidden Gems algorithm (local DB, review analysis <500/4.8+, neighborhood match) | ✅ | `shared/schema.ts:3258` `aiDiscoveredGems`, `:3286` `discoveryJobs`, `:3299` `userSavedGems`; `server/services/grok-discovery.service.ts`; `routes.ts:11202-11328` discovery endpoints; `App.tsx:314` `/hidden-gems` | Review-threshold rule (<500 reviews, 4.8+) not verified as a coded constant. |
| H6 | Implicit profiling from cart (no questions) — infers budget/interests/style/group from selections | 🟡 | `aiInteractions` table; itinerary-optimizer takes cart inputs | Explicit "profile inference from cart" service not located as a dedicated module. |
| H7 | Hybrid SERP+native inventory — native first, SERP fills gaps | ✅ | `routes.ts:1752` `/api/catalog/search-hybrid`; `server/services/serp.service.ts`; `shared/schema.ts:3096-3124` serpCache/Tracking/Inquiries; `client/src/components/serp-inquiry-dialog.tsx` | `server/services/serp-api-integration.ts:85,176,248,264,334` has 5 mock TODOs. |
| H8 | AI Trip Planner standalone (free) with stepwise inputs + progress UI | ✅ | `routes.ts:7806` POST `/api/quick-start-itinerary`; `App.tsx:317` `/quick-start` | |
| H9 | AI-Powered Expert Match scoring (specializations × interests × availability × rating) | ✅ | `shared/schema.ts:1845` `expertMatchScores`, `:4427` `expertMatchAnalytics`; `routes.ts:7568` `/api/grok/match-experts` | |
| H10 | Expert AI Assistant (per-expert delegate, drafting, vendor research, optimization, comparison) | ✅ | (see B13) | |
| H11 | Executive Assistant AI (conflict detection, gift research, multi-city logistics) | ✅ | `shared/schema.ts:5432` `eaAiTasks`; `routes.ts` `/api/ea/ai-tasks` | |
| H12 | Weather-aware activity prioritization (rain → indoor reshuffle) | 🔴 | none — no weather-rebalance service found | |
| H13 | Currency conversion, weather forecast, local-events feed | 🟡 | `feverEventCache` table (events); Amadeus integration in `routes.ts:6278-6624` | Weather forecast integration not located; currency conversion module not located. |
| H14 | AI confidence + quality scoring with approve/edit/regenerate/reject loop | 🟡 | `expertAiTasks` table; `routes.ts:8066-8129` approve/reject/regenerate | Quality-score field on artifacts not verified. |
| H15 | AI-generated savings receipt at checkout ("You saved $X with AI optimization") | 🟡 | `StatsRow.tsx:86-89` "Saves $X" badge | No checkout-confirmation savings receipt component located. |

### ⚪ DEFERRED — Post-launch per spec (not counted as gaps)

| # | Spec Item | Source |
|---|---|---|
| Z1 | Instant booking on provider services | MASTER_SPEC L2224 |
| Z2 | Provider calendar sync (Google/iCal) | MASTER_SPEC L2225 |
| Z3 | Package deals across multiple providers | MASTER_SPEC L2226 |
| Z4 | Subscription services beyond Savings Explorer/Concierge | MASTER_SPEC L2227 |
| Z5 | Provider teams (multi-staff accounts) | MASTER_SPEC L2228 |
| Z6 | Gift certificates | MASTER_SPEC L2229 |
| Z7 | CDN for provider image optimization | MASTER_SPEC L2189-2193 |
| Z8 | Provider referral / TikTok recruitment automation | MASTER_SPEC L2210-2218 |
| Z9 | Vendor portal mobile app (separate from web dashboard) | COORDINATION_HUB L912 |
| Z10 | WhatsApp notification delivery (UI toggle exists, integration deferred) | wireframes v2 |
| Z11 | Multi-generational / sustainable / relocation modules | MASTER_SPEC |
| Z12 | `/local-expert/services/page.jsx` placeholder (legacy Next.js page in reference repo) | MASTER_SPEC L122-126 |

---

## 3. Critical Gaps For Kyoto Launch (Ranked by Severity)

These are the 🔴 / 🟡 items that block the launch. Ranked by how directly they break the marketplace contract or the user-facing promise.

### P0 — Blocks Money Flowing Correctly

1. **🔴 D4 — Commission split is undefined.** Three competing sources of truth (`revenueSplits 85/15`, `bookingFeeConfigs 70/12`, business plan `75/25`) and **no `0.75` constant in `/server`**. Cannot pay experts correctly. Same root cause as D5, F9, F10. **Fix before any real money moves.**
2. **🔴 D5 / F9 — Provider commission tier engine (4-12% by insurance) does not exist.** Flat percentages only. Provider take-rate is wrong for every booking.
3. **🔴 F3 — Platform fee default is 12%, not 3% per spec.** Travelers will see triple-spec fees at checkout. Fee-waiver-on-AI-optimization rule is also missing.
4. **🟡 D7 — Stripe webhook post-payment side effects are stubbed.** `stripe-payment.service.ts:158,159,185,226,227` has `// TODO: Notify user/provider, Update earnings, Return inventory`. Payments succeed; downstream state is silent. Also affects B10 (auto-contract + auto-open-chat).
5. **🔴 D2 / D3 — Stripe Treasury and Stripe Tax are not integrated.** Plan requires Treasury for held funds and Tax for VAT/GST. Currently only Connect Express + raw Payment Intents.

### P1 — Breaks Core Marketplace Promise

6. **🔴 D9 — "via Expert" attribution does not surface to travelers.** `expertId` is in the booking row but no UI string credits the sourcing Expert. The three-party narrative is invisible in checkout/itinerary UI.
7. **🟡 E2 — PlanCard map has 2 layers (activities + transport), missing the lodging layer.** Spec explicitly requires 3 toggleable layers. (`MapControlCenter.tsx:333`)
8. **🟡 E7 — Collaborator roles spec is owner/editor/viewer/guest (4 roles); code has token-based view/edit + a different `tripParticipants.role` enum.** Mismatch will break corporate trips.
9. **🔴 F5 — Subscription system (Savings Explorer $19.99 / Concierge $39.99 / Corporate) does not exist.** No table, no endpoint, no UI. Entire membership revenue stream is unbuilt.
10. **🟡 A14 — No WebSocket server found for real-time chat / live coordination.** Messages are persisted REST-only. Affects D7 (real-time notify), E12 (collaboration), expert "live travel support" tier.

### P2 — Visible to User, Harms Conversion

11. **🔴 A11 / F2 — AI Optimization upsell modal with $19.99/$49.99/$199 tiers + money-back guarantee is unbuilt.** Variant generation works but the paywall is missing — no revenue capture on the AI value-add.
12. **🟡 H1 — "Gronk" optimizer in spec is "Grok" in code, and the explicit 0.35/0.35/0.30 weighting tuple is not coded as constants.** Functions, but spec parity is loose.
13. **🟡 F8 — "Platform providers first" is implemented ad-hoc in transport + a discover branch only.** No global ranking utility; risk of inconsistent rules across `/discover`, `/catalog/search`, vertical endpoints.
14. **🟡 H7 — SERP integration has 5 mock TODOs in `serp-api-integration.ts`** and the production SERP service is younger. Hybrid strategy works for some paths and not others.
15. **🟡 B17 / C4 — Background verification flow is partial.** Stripe Identity session exists; per-category required-document matrix and references collection are not built. Insurance proof attachment (B18) has no plumbing.

### P3 — Will Be Noticed Post-Launch

16. **🔴 A21 — Mobile live tracking app is missing.** Only responsive web exists. The "during-trip" experience is unbuilt.
17. **🔴 E12 — Real-time collaboration on plans is missing.** No WebSocket/CRDT layer.
18. **🔴 G8 — Admin dispute resolution queue is missing.** "Invoice management coming soon" is the closest stub.
19. **🔴 H12 — Weather-aware activity rebalancing is missing.**
20. **🔴 B21 / F7 — Expert Creator Fund (TikTok-first) has no schema or payout logic.** Spec calls it out as a launch differentiator.
21. **🔴 A6 — Quick Quiz recommender (5 questions) is missing.**
22. **🟡 B16 — `/expert/leaderboard` is a 33-line "Coming Soon" stub** (`pages/expert/leaderboard.tsx:18`). Expert "Learning" route is also missing.
23. **🔴 C14 / G11 — Provider custom category request → admin approval workflow is missing.**
24. **🔴 D13 — Conflict resolution engine (weather × expert preference × vendor availability) is missing.**

---

## 4. Spec Drift — Code Present, Plan Silent

Items the code implements that the business plan / wireframes / master spec do not describe. Could be undocumented features or scope creep.

| # | Code Item | Where | Why It's Drift |
|---|---|---|---|
| SD1 | **Instagram OAuth + publishing** | `server/routes/instagram.ts` (callback, status, publish, publish-carousel, publishing-limit, disconnect) | Plan mentions Instagram as a content-distribution channel, but native publishing endpoints on the backend are out-of-scope. |
| SD2 | **Facebook OAuth + `/api/auth/instagram-data`** | `server/replit_integrations/auth/facebookAuth.ts` | Social login is not in the plan. |
| SD3 | **TravelPulse** — full subsystem with 11 tables (trending, live scores, truth checks, crowd forecasts, calendar events, cities, hidden gems, live activity, discovery scores, city alerts, happening now) | `shared/schema.ts:1967-2381`; `routes.ts:8651-9330` `/api/travelpulse/*` | Not in any spec document. Substantial undocumented feature. |
| SD4 | **TravelPayouts integration** with cache table | `shared/schema.ts:5196` `travelpayoutsCache`; `client/src/components/travelpayouts/*` | Affiliate program not mentioned in plan. |
| SD5 | **20+ catalog vertical endpoints** (Tiqets, Wegotrip, Viator-feed, Agoda, Klook, Insurance, Bus, Luggage Storage, eSIM, Nomad, etc.) | `routes.ts:1815-2206` | Plan describes 5 major affiliate partners; code wires 20+. |
| SD6 | **Spontaneous Opportunities subsystem** | `shared/schema.ts:2950-3026`; `routes.ts:10970-11202` | "Spontaneous travel" is not a plan category. |
| SD7 | **Fever events integration** | `feverEventCache` (`schema.ts:1612`); `routes.ts:9712-10120` | Specific event-source partnership not in plan. |
| SD8 | **AI Costs admin page + AI usage logs** | `client/src/pages/admin/ai-costs.tsx`; `shared/schema.ts:4047` `aiUsageLogs` | Internal AI cost tracking — operational tooling, not in plan. |
| SD9 | **Content Registry + Invoices + Versions + Flags + Analytics** (5 tables) | `shared/schema.ts:3953-4030` | Suggests a content marketplace beyond the spec. |
| SD10 | **Affiliate scrape jobs** with Grok-3 | `shared/schema.ts:3406` `affiliateScrapeJobs`; `server/services/affiliate-scraper.service.ts` | Web-scraping not in plan. |
| SD11 | **Service recommendations engine** (5 tables: demand signals, recs, conversions, gap analysis, seasonal opportunities) | `shared/schema.ts:4152-4256`; `routes.ts:5077-5262` | Recommendation product surface not described. |
| SD12 | **Anchors / Day Boundaries / Energy Tracking** for itinerary pacing | `shared/schema.ts:2784-2833`; `routes.ts:13102-13474` | Pacing/anchor system is more sophisticated than spec describes. |
| SD13 | **Pasted-in Django backend + Next.js frontend** | `attached_assets/Traveloure-Backend-main/`, `attached_assets/Traveloure-Frontend-main/` | Two parallel reference implementations live in the repo and are not the live system. Should be archived or deleted. |
| SD14 | **Python backend services** | `backend-services/*.py` (5 files); `temp_models.py`, `temp_serializers.py`, `traveloure-backend-replit-claude.py`, `traveloure-trip-model.py` at repo root | Stray Python files not wired into Node server. |
| SD15 | **Raw SQL migration files at repo root** | `database-migrations.sql`, `database-migrations-part2.sql`, `database-migrations-phase2.sql` | Drizzle migrations are in `/migrations` and `/server/migrations`; raw SQL at root is unmanaged. |
| SD16 | **80+ root-level status/planning markdown docs** | `BETA_*`, `SECURITY_FIXES_*`, `FIXES_*`, `IMPLEMENTATION_*`, etc. | Heavy documentation churn at repo root; no spec asked for any of these. |

---

## 5. Verification Log

Commands run by inventory subagent (representative — full list in agent transcript):

| Purpose | Command | Result |
|---|---|---|
| Confirm wouter (not react-router-dom) | `grep -rn "from \"wouter\"\|from 'wouter'" client/src` | Hits in `App.tsx` and many pages; zero hits for `react-router-dom` in `/client/src` |
| Enumerate frontend routes | `grep -rn "Route" client/src --include="*.tsx"` | ~70 distinct `<Route path="...">` lines, all in `client/src/App.tsx:199-650` |
| Count Express routes in monolith | `grep -cE 'app\.(get\|post\|put\|delete\|patch)\s*\(' server/routes.ts` | **613** route handlers |
| Find Stripe Treasury | `grep -rn "Treasury\|treasury\|stripe.treasury" server client` | **0 hits** |
| Find Stripe Tax | `grep -rn "stripe.tax\|StripeTax\|automaticTax" server` | **0 hits** |
| Find 75/25 commission constant | `grep -rn "0\.75\|0\.25\|75/25\|expertShare.*75" server` | **0 hits matching the spec** |
| Find "via Expert" attribution | `grep -rn "via.Expert\|viaExpert\|via_expert" server client` | **0 hits** |
| Find subscription table | `grep -n "pgTable.*subscript\|pgTable.*member" shared/schema.ts` | **0 table definitions** (only enum values) |
| Find providers table | `grep -n "pgTable(\"providers\"" shared/schema.ts` | **0 hits** (providers live in `serviceProviderForms` + `providerServices` + `users.role`) |
| Find provider_bookings table | `grep -n "pgTable(\"provider_bookings\"" shared/schema.ts` | **0 hits** (closest: `providerBookingRequests:4343`, generic `bookings:4964`) |
| Find admin settings | `grep -n "admin_settings\|adminSettings" shared/schema.ts` | **0 hits** |
| Find leaderboard | `grep -n "leaderboard" shared/schema.ts` | **0 hits** (page is "Coming Soon") |
| Find plan_card_ tables | `grep -n "pgTable.*plan_card\|plancard" shared/schema.ts` | **0 hits** (PlanCard derived from existing tables) |
| Find map lodging layer | `grep -n "lodging\|hotelLayer" client/src/components/plancard/MapControlCenter.tsx` | **0 hits**; only `activities` and `transport` defined at line 333 |
| Find Gronk | `grep -rn "Gronk\|gronk" server client shared` | **0 hits** (code uses "Grok") |
| Count Drizzle tables | `grep -cn "pgTable(" shared/schema.ts` | ~140 tables |
| Find "Coming Soon" placeholders | `grep -rn "Coming Soon\|coming soon" client/src` | 6 distinct placeholder UI locations (see §9 of inventory) |
| Find TODOs in Stripe payment | `grep -n "TODO" server/services/stripe-payment.service.ts` | Lines 158, 159, 185, 226, 227 |
| Find TODOs in SERP integration | `grep -n "TODO" server/services/serp-api-integration.ts` | Lines 85, 176, 248, 264, 334 |
| Confirm transport post-optimization | Read `server/services/transport-leg-calculator.ts:69-95` | `calculateTransportLegs(variantId, activities[])` sorts activities by `.order` (L87), then pairs `sorted[i] → sorted[i+1]` (L89). Transport legs are derived AFTER activity ordering — confirms post-optimization. |
| Confirm native maps handoff | Read `server/services/maps-url-builder.ts` + `client/src/lib/navigate.ts` | iOS branch → `maps://maps.apple.com/?q=`, otherwise → Google Maps web URL |

---

## Reconciliation Items For Product

1. **Commission split (75/25 vs 85/15 vs 70/12)** — pick one canonical split, encode it as a single function (`computePayoutSplit(bookingType, insuranceTier)`), and migrate `revenueSplits` + `bookingFeeConfigs` to it.
2. **Platform fee (3% vs 12%)** — same: pick one and migrate.
3. **Spec gap on insurance-tier → commission rate** — the business plan promises this but no table maps tier → rate. Define it.
4. **Cleanup: drop or move the two reference projects** (`attached_assets/Traveloure-Backend-main` Django app, `attached_assets/Traveloure-Frontend-main` Next.js app) and the stray Python files from repo root. They confuse spec-vs-code audits.
5. **"Gronk" vs "Grok"** — confirm the spec's intended name (Grok is the xAI model name; "Gronk" reads as a typo). Update either spec or code to align.
