# Traveloure: Integrated Page-by-Page Execution Plan
## Experience Planning Reframe — Cohesive Implementation Roadmap

**Date:** 2026-06-13
**Scope:** 156+ pages across 5 categories (Core User Flow, Expert/Provider, Guest/Event Management, Marketing/Content, Admin)
**Total Estimated Effort:** 180–250 hours (~5–6 weeks for 1 dev, or 2–3 weeks for a team of 3–4)

---

## Executive Summary

Every page in the Traveloure codebase contains travel terminology that contradicts the reframed "Experience Planning" business model. The audits found **~150 P0 issues**, **~90 P1 issues**, and **~60 P2 issues** across 156+ pages. No page is fully aligned. However, the schema, backend services, and landing page marketing are already event-aware — the gaps are almost entirely **frontend copy, UI labels, and page framing**.

**The good news:** This is primarily a copy/branding refactor, not a backend rewrite. Most changes are text replacements and label updates. The hardest work is the monetization model redesign (pricing page) and the create-trip wizard restructuring.

---

## Phase 1: Week 1 — Terminology Blitz (P0 Copy Changes)

**Goal:** Rename all user-facing "trip" / "travel" / "traveler" / "itinerary" terminology to "experience" / "event" / "guest" / "attendee" / "timeline" across the most visible pages.

**Estimated Effort:** 40–50 hours

### Pages to Fix (Priority Order)

| # | Page | File | Issues | Effort | Key Changes |
|---|------|------|--------|--------|-------------|
| 1 | **Create Trip** | `create-trip.tsx` | 24 P0 | XL | Rename "trip"→"event", "travelers"→"guests", per-day budget→event budget, travel styles→event planning styles, default "vacation"→neutral |
| 2 | **Pricing** | `pricing.tsx` | 12 P0 | XL | Replace credit model with event coordination fees (Free / $49-99/mo Pro / Custom Enterprise) |
| 3 | **Payment** | `payment.tsx` | 8 P0 | Large | Rename "Trip Details"→"Event Details", $45 flat fee→percentage/tiered, "TRAVEL10"→"EVENT10", remove hardcoded Bali mock |
| 4 | **Cart** | `cart.tsx` | 6 P0 | Medium | Rename flow steps "trip-details"→"event-details", `tripTitle`→`eventTitle`, `tripTravelers`→`guestCount` |
| 5 | **My Trips** | `my-trips.tsx` | 5 P0 | Small | Rename page title, filter labels, empty state, CTAs |
| 6 | **Dashboard** | `dashboard.tsx` | 5 P0 | Small | Rename "My Trips" section, "Trip" quick actions, "Travel" stats |
| 7 | **Itinerary** | `itinerary.tsx` | 4 P0 | Medium | Rename "Itinerary"→"Event Plan" or "Timeline", "Travelers"→"Guests", transport→logistics |
| 8 | **My Itinerary** | `my-itinerary.tsx` | 4 P0 | Medium | Same as itinerary + "Trip Strategy"→"Event Strategy", "Trip Overview"→"Event Overview" |
| 9 | **Discover** | `discover.tsx` | 6 P0 | Large | Rename "Trip Packages"→"Event Packages", "travelers"→"guests", "travel creators"→"event planners" |
| 10 | **Landing** | `landing.tsx` | 5 P0 | Medium | "AI Trip Planner"→"AI Event Planner", "Trips Planned"→"Events Planned", "trip planners"→"event planners" |
| 11 | **Optimize** | `optimize.tsx` | 5 P0 | XL | Remove hardcoded Paris content, add event-type selector, event-specific optimization criteria |
| 12 | **Experience Template** | `experience-template.tsx` | 3 P0 | Medium | "Ceremony Date" hardcoded for wedding, "From/To" dates for non-wedding, generalize wedding-specific UI |
| 13 | **Experts (public)** | `experts.tsx` | 4 P0 | Medium | "Work with a Trip Planner"→"Plan Your Experience", "tripDetails"→"experienceDetails", add event-type filter |
| 14 | **Expert Workspace** | `expert/workspace.tsx` | 4 P0 | Large | "Itinerary Workspace"→"Event Workspace", "Trip Overview"→"Event Overview", `PlanCard trip`→`PlanCard experience` |
| 15 | **Expert Dashboard** | `expert/dashboard.tsx` | 3 P0 | Small | "Itinerary" quick actions→"Event Plan", `/api/expert/assigned-trips`→`/api/expert/assigned-experiences` |
| 16 | **Expert Assigned Trips** | `expert/assigned-trips.tsx` | 4 P0 | Medium | "Assigned Trips"→"Assigned Projects", `trip_id`→`project_id`, `traveler_name`→`client_name` |
| 17 | **Expert Clients** | `expert/clients.tsx` | 2 P0 | Small | "Trips" tab→"Projects", "Traveler"→"Client" |
| 18 | **Expert Messages** | `expert/messages.tsx` | 3 P0 | Small | `trip_id`→`project_id`, "trip workspace"→"event workspace" |
| 19 | **Expert Detail** | `expert-detail.tsx` | 2 P0 | Small | "completedTrips"→"completedProjects" or role-aware label, bio fallback "trip"→"experience" |
| 20 | **Guest Invite Page** | `GuestInvitePage.tsx` | 3 P0 | Medium | "travel recommendations"→"event logistics", "traveling from"→"arriving from", "plan your journey"→"plan your visit" |
| 21 | **EA Trips** | `ea/trips.tsx` | 3 P0 | Small | Rename all "trip" terminology to "experience" or "event" |
| 22 | **EA Travel** | `ea/travel.tsx` | 3 P0 | Medium | Rename "Travel"→"Logistics", add event shuttle/transport modes |
| 23 | **About** | `about.tsx` | 6 P0 | Medium | "Revolutionizing How the World Plans Travel"→"Plans Experiences", "Passion for Travel"→"Passion for Experiences", "Trips Planned"→"Events Planned" |
| 24 | **FAQ** | `faq.tsx` | 5 P0 | Medium | Rewrite all Q&A to include event planning, add event-specific FAQs, "trip packages"→"event packages" |
| 25 | **Features** | `features.tsx` | 5 P0 | Medium | "Perfect Trip"→"Perfect Experience", "AI-Powered Trip Planning"→"AI-Powered Experience Planning", add event features |
| 26 | **How It Works** | `how-it-works.tsx` | 3 P0 | Small | "travel planning"→"experience planning", "trip"→"experience", "Create Your First Trip"→"Create Your First Experience" |
| 27 | **Partner With Us** | `partner-with-us.tsx` | 3 P0 | Small | "Trip Planner"→"Experience Planner", "travelers"→"clients/guests", "Trips Planned"→"Events Planned" |
| 28 | **Terms** | `terms.tsx` | 4 P0 | Large | "Travelers"→"Clients", "Travel Content Creator"→"Content Creator", "Travel Expert"→"Experience Planner", "trip"→"experience/event" |
| 29 | **Privacy** | `privacy.tsx` | 3 P0 | Medium | "travelers"→"clients", "travel preferences"→"travel and event preferences", "trip details"→"event/trip details" |
| 30 | **Explore** | `explore.tsx` | 4 P0 | Medium | "travel experiences"→"experiences and events", "trip packages"→"event packages", "travelers"→"guests" |
| 31 | **Careers** | `careers.tsx` | 4 P0 | Medium | "travel industry"→"experience industry", "travelers"→"clients", "trip planning"→"experience planning" |
| 32 | **Help** | `help.tsx` | 3 P0 | Small | "trip"→"experience", "travel"→"travel and event" |
| 33 | **Press** | `press.tsx` | 2 P0 | Small | "travel"→"experience", "trip planning"→"experience planning" |
| 34 | **Blog** | `blog.tsx` | 2 P0 | Small | "travel"→"experience", "trip"→"event" |
| 35 | **Travel Experts** | `travel-experts.tsx` | 3 P0 | Medium | "Trip Planner"→"Event Planner", "travel"→"experience", "trips"→"events" |
| 36 | **Layout** | `layout.tsx` | 2 P0 | Small | "Trip Planner" nav label→"Event Planner", "trips"→"experiences" in nav |
| 37 | **User Menu** | `user-menu.tsx` | 2 P0 | Small | "My Trips"→"My Experiences", "trip"→"experience" |
| 38 | **Admin Users** | `admin/users.tsx` | 1 P0 | Small | "Trips" column→"Events" |
| 39 | **Admin Plans** | `admin/plans.tsx` | 2 P0 | Medium | `/api/admin/trips`→`/api/admin/experiences`, `destination`→`location`, `travelers`→`guests` |
| 40 | **Admin Fee Config** | `admin/fee-config.tsx` | 2 P0 | Large | "itinerary"→"event plan", "trips"→"events", add event-type fee categories |
| 41 | **Admin Revenue** | `admin/revenue.tsx` | 3 P0 | Large | Remove travel-only affiliate streams, add event-type revenue breakdown |
| 42 | **Admin Tourism Analytics** | `admin/tourism-analytics.tsx` | 4 P0 | XL | Rebuild from tourism-centric to event-market intelligence |

### Global String Replacements (All Pages)

Create a systematic find-and-replace script for safe replacements:

| Find | Replace | Risk Level |
|------|---------|------------|
| `Plan Your Perfect Trip` | `Plan Your Perfect Experience` | Low |
| `Create Trip` | `Create Experience` | Low |
| `My Trips` | `My Experiences` | Low |
| `trip planner` | `experience planner` | Low |
| `trip planning` | `experience planning` | Low |
| `AI Trip Planner` | `AI Experience Planner` | Low |
| `Trips Planned` | `Experiences Planned` | Low |
| `travelers` | `guests` (user-facing) | Medium — check code variables |
| `traveler` | `guest` (user-facing) | Medium — check code variables |
| `traveling` | `attending` / `planning` | Medium — context-dependent |
| `itinerary` | `timeline` / `plan` | Medium — some backend references |
| `destination` | `location` / `city` | Medium — some backend references |
| `vacation` (as default) | `celebration` or require selection | Low |
| `per day` / `daily` | remove or replace with total budget | Low |
| `Trip Details` | `Event Details` | Low |
| `Trip Summary` | `Event Summary` | Low |
| `Number of Travelers` | `Number of Guests` | Low |
| `Travel Style` | `Event Style` / `Planning Style` | Low |
| `Travel Dates` | `Event Dates` | Low |

**Caution:** Only replace user-facing strings. Do NOT rename API endpoints, database columns, or route parameters in Phase 1. Those are Phase 2/3.

---

## Phase 2: Week 2 — Monetization & Budget Model (Structural Changes)

**Goal:** Replace the credit-based SaaS model with an event-coordination fee model. Add event budget tiers. Restructure the pricing page and payment flow.

**Estimated Effort:** 50–60 hours

### Pages to Restructure

| # | Page | Changes | Effort |
|---|------|---------|--------|
| 1 | **pricing.tsx** | Complete restructure: Free (basic AI) → Pro ($49-99/mo, unlimited events, vendor quotes, RSVP, budget tracking) → Enterprise (custom, commission-based for agencies) | XL |
| 2 | **payment.tsx** | Replace $45 flat fee with event-scaled fees: AI Planning $9.99-49.99, Coordination 5-10% or $499-4,999, Payment Processing 2.9% + $0.30. Add deposit/milestone payment UI. | Large |
| 3 | **create-trip.tsx** | Replace per-day budget ($50-250/day) with total event budget tiers: Micro (<$5K), Standard ($5K-25K), Premium ($25K-75K), Luxury ($75K+). Add totalBudget field to schema. | XL |
| 4 | **cart.tsx** | Add event-specific checkout: deposit amount, milestone schedule, contract signing checkbox, multi-vendor checkout. | Large |
| 5 | **credits.tsx** | Deprecate or reframe: "Credits" → "Planning Tokens" or remove entirely. | Medium |
| 6 | **credits-billing.tsx** | Reframe billing for event coordination fees, not credit packages. | Medium |
| 7 | **admin/plans.tsx** | Add event-tier plan management. | Medium |
| 8 | **admin/fee-config.tsx** | Add event-specific fee categories (wedding_premium, corporate_standard, proposal_simple). | Large |
| 9 | **admin/fee-bands.tsx** | Add event-type band keys with $5K-50K transaction size notes. | Medium |
| 10 | **admin/revenue.tsx** | Add event-type revenue breakdown (wedding, corporate, proposal, birthday). Remove travel-only affiliate categorization. | Large |
| 11 | **admin/payouts.tsx** | Add event-specific payout tracking. | Small |
| 12 | **expert/earnings.tsx** | Reframe earnings for event coordination fees (percentage of event budget) rather than per-hour rates. | Medium |
| 13 | **expert/revenue-optimization.tsx** | Add event-specific revenue optimization (venue markups, vendor commissions, package bundling). | Medium |

### Monetization Model Change (Backend + Frontend)

**Current Model (Travel SaaS):**
- Free: 5 credits, 3 trip saves
- Pro: $14.99/mo, 25 credits, unlimited trips
- Enterprise: Custom, API access, white-label
- Service fee: $45 flat
- AI optimization: $19.99-29

**New Model (Event Planning Marketplace):**
- **Free**: AI planning + basic itinerary, 1 event plan, limited expert matching
- **Pro**: $49-99/mo — Unlimited events, priority expert matching, vendor quote management, RSVP tools, budget tracking, guest list management, timeline builder
- **Enterprise**: Custom — Commission-based for event agencies, white-label for wedding planners, team management for corporate event teams, dedicated account manager
- **AI Planning Fee**: $9.99 (simple) → $49.99 (complex events) — One-time per event
- **Coordination Fee**: 5-10% of event budget OR $499-$4,999 flat per event
- **Payment Processing**: 2.9% + $0.30 (Stripe standard)
- **Service Fee**: Scaled — $5 per vendor booked, or $50-200 per event tier
- **Deposit Structure**: 50% deposit at booking, 50% before event (configurable by vendor)
- **Milestone Payments**: 25% at booking, 25% at 30 days, 25% at 7 days, 25% day-of (configurable)

---

## Phase 3: Week 3 — Event-Specific Features (Functional Gaps)

**Goal:** Add missing event-specific features: coordination services, event sequencing, guest invite generalization, event-specific upsells, and EA event support.

**Estimated Effort:** 60–70 hours

### New Services to Build (Backend)

| # | Service | Description | Effort |
|---|---------|-------------|--------|
| 1 | **proposal-coordination.service.ts** | Location scout → Setup → Proposal moment → Photos → Celebration dinner timeline builder | Large |
| 2 | **birthday-coordination.service.ts** | Arrival → Activities → Cake → Dancing → Send-off timeline builder | Large |
| 3 | **corporate-coordination.service.ts** | Registration → Keynote → Breakouts → Networking → Dinner timeline builder | Large |
| 4 | **anniversary-coordination.service.ts** | Romantic dinner → Photographer → Special touches → Experience timeline | Medium |
| 5 | **event-sequencing-rules.ts** | Add to smart-sequencing.service.ts: ceremony→cocktail→reception→dancing, scout→setup→proposal→photos, etc. | Medium |
| 6 | **event-upsell-slots.ts** | Add to upsell-engine: wedding_vendor_gate, proposal_extras_gate, corporate_catering_gate, birthday_entertainment_gate | Medium |
| 7 | **event-contract-templates.ts** | Wedding vendor contract, proposal vendor contract, corporate vendor contract, birthday vendor contract | Large |

### Pages to Enhance

| # | Page | Changes | Effort |
|---|------|---------|--------|
| 1 | **GuestInvitePage.tsx** | Generalize for all event types: event-type-aware RSVP questions, corporate attendee fields (company, title), birthday fields (age, parent contact), accessibility needs, custom invite templates | Large |
| 2 | **GuestInviteManager.tsx** | Same as above — make it event-type-aware | Medium |
| 3 | **expert/workspace.tsx** | Add event-specific modules: vendor tracker, guest list, budget by category, RSVP dashboard, run-of-show timeline | XL |
| 4 | **expert/contract-categories.tsx** | Add event-specific contract templates (wedding photographer, corporate catering, proposal florist) | Medium |
| 5 | **expert/service-wizard.tsx** | Add event-type service templates (wedding package, corporate retreat package, proposal package) | Medium |
| 6 | **expert/templates.tsx** | Add event-type template categorization (wedding, proposal, corporate, birthday tags) | Medium |
| 7 | **expert/services.tsx** | Add event-type service categories and filtering | Medium |
| 8 | **expert/dashboard.tsx** | Add event planner quick actions: "Create Event Timeline", "Manage Vendor List", "Send Guest Invitation" | Small |
| 9 | **ea/dashboard.tsx** | Add event coordinator mode with guest/vendor/timeline management | Medium |
| 10 | **ea/events.tsx** | Add event planning dashboard for EA (currently just a list) | Medium |
| 11 | **ea/calendar.tsx** | Add personal event milestone overlay (rehearsal, ceremony, reception) | Medium |
| 12 | **ea/clients.tsx** | Add event-specific client fields (event type, guest count, budget) | Small |
| 13 | **global-calendar.tsx** | Add user event overlay + event-type filter (rehearsal, ceremony, reception, corporate meeting) | Medium |
| 14 | **help-me-decide.tsx** | Add pre-researched event packages (wedding in Cartagena, corporate retreat in Kyoto, proposal in Edinburgh) | Medium |
| 15 | **transportation-booking.tsx** | Add event transport modes: group shuttles, venue transfers, bridal transport, corporate coaches | Medium |
| 16 | **my-bookings.tsx** | Add vendor booking categories (venue, catering, entertainment, decor), group payment tracking, deposit tracking | Medium |
| 17 | **itinerary-comparison.tsx** | Add event variant comparison (outdoor vs indoor ceremony, buffet vs plated dinner) | Large |
| 18 | **optimize.tsx** | Add event-type selector, event-specific optimization (vendor coordination, guest convenience, venue proximity), remove hardcoded Paris content | XL |
| 19 | **quick-start-itinerary.tsx** | Add event-specific generation: venue selection, ceremony type, guest count, event interests (ceremony venue, reception catering) | Large |
| 20 | **discover.tsx** | Add event package filtering, event planner profiles, vendor categories (photography, florals, catering) | Medium |
| 21 | **discover-location.tsx** | Add event-specific location intelligence (wedding venues, corporate spaces, proposal spots) | Medium |
| 22 | **experience-discovery.tsx** | Add event-type discovery (wedding destinations, proposal locations, corporate retreat venues) | Medium |
| 23 | **admin/event-packages.tsx** | Add sub-package management (proposal package with photographer + florist + venue), per-event-type bulk actions | Medium |
| 24 | **admin/categories.tsx** | Add event-primary category hierarchy (Wedding → Photography, Florals, Catering, Venue) | Medium |
| 25 | **admin/services.tsx** | Add event-specific affinity tags (ceremony, reception, welcome_dinner, after_party, rehearsal_dinner, corporate_session, team_building) | Medium |
| 26 | **admin/experts.tsx** | Add event specialty badges (wedding specialist, corporate retreat specialist) and event-type filter | Medium |
| 27 | **admin/providers.tsx** | Add event category filter (photography, florals, catering, music, venue) and event portfolio display | Medium |
| 28 | **admin/analytics.tsx** | Add event-type metrics (wedding bookings, corporate bookings, proposal bookings) | Medium |
| 29 | **admin/data.tsx** | Add event-specific data tabs (Venues, Caterers, Photographers, Florists) alongside Hotels/Activities/Flights | Medium |
| 30 | **admin/tourism-analytics.tsx** | Rebuild as event-market intelligence: wedding market trends, corporate retreat demand, proposal seasonality | XL |
| 31 | **admin/affiliate-partners.tsx** | Add event vendor partners (The Knot, WeddingWire, Cvent, Eventbrite) alongside travel partners | Medium |
| 32 | **admin/ai-costs.tsx** | Add event-planning API cost tracking (vendor search, venue matching, timeline generation) | Small |
| 33 | **admin/platform-providers.tsx** | Add event vendor APIs (WeddingWire, The Knot, Cvent, Yelp for venues) alongside travel APIs | Medium |
| 34 | **admin/content-mapping.tsx** | Add event-specific content surfaces (wedding vendor reviews, proposal spot guides, corporate venue profiles) | Medium |
| 35 | **admin/cross-sell-analytics.tsx** | Add event-specific cross-sell tracking (photographer → florist, venue → caterer) | Small |
| 36 | **admin/review-moderation.tsx** | Add event-specific review categories (vendor quality, venue condition, caterer timeliness) | Small |
| 37 | **vendors.tsx** | Add event vendor categories (photography, catering, music, venue, decor, florals) and event-specific vendor profiles | Medium |
| 38 | **service-detail.tsx** | Add event-specific service details (venue capacity, catering menu options, photographer portfolio) | Small |
| 39 | **service-providers.tsx** | Add event-specific provider filtering and search | Small |
| 40 | **services-provider.tsx** | Add event-specific service categories and tags | Small |
| 41 | **expert/assigned-trips.tsx** | Add event-type badge, guest count, venue name to assignment list. Rename to "Assigned Projects" | Medium |
| 42 | **expert/clients.tsx** | Surface event type icons in client card header, add event-type grouping | Small |
| 43 | **expert/client-detail.tsx** | Add event-specific detail sections: guest list, RSVP status, vendor contacts, budget approval | Small |
| 44 | **expert-detail.tsx** | Add event portfolio section: event-type tags, past event photos, guest count metrics | Medium |
| 45 | **experts.tsx** (public) | Add event-type filter alongside destination filter, role-agnostic CTAs | Medium |
| 46 | **travel-experts.tsx** | Rename to "experience-experts.tsx" or add event planner section. Add event planner application flow | Medium |
| 47 | **partner-with-us.tsx** | Add event planner as primary partner type, add event-specific benefits and testimonials | Small |
| 48 | **about.tsx** | Add event-specific milestones ("2025: Event Planning Launch" for weddings, proposals, corporate events) | Small |
| 49 | **faq.tsx** | Add event-specific FAQs: "How do I plan a wedding in another city?", "Can I invite guests to collaborate?", "How do corporate event bookings work?" | Medium |
| 50 | **features.tsx** | Add event-specific features: Guest Coordination, Vendor Management, Timeline Builder, RSVP Tracking | Medium |
| 51 | **landing.tsx** | Add event-specific testimonials, event stats, and CTA sections | Medium |
| 52 | **how-it-works.tsx** | Add event-specific examples in step descriptions ("plan a wedding in Cartagena", "organize a corporate retreat in Kyoto") | Small |
| 53 | **profile.tsx** | Add event preferences (event types, budget range, group size) to user profile | Medium |
| 54 | **notifications.tsx** | Add event-specific notification types (RSVP received, vendor quote received, milestone payment due) | Small |
| 55 | **chat.tsx** | Add event-specific chat contexts (group chat with vendors, host-guest communication) | Small |
| 56 | **ai-assistant.tsx** | Add event-specific AI prompts (wedding planner, proposal planner, corporate event planner, birthday planner) | Large |
| 57 | **concierge/index.tsx** | Already aligned — use as reference for other pages | Small |
| 58 | **executive-assistant.tsx** | Add event coordination mode for EA (not just travel) | Medium |
| 59 | **my-trips.tsx** | Add event-type filter, event status badges (planning, confirmed, completed), guest count | Small |
| 60 | **dashboard.tsx** | Add event-specific stats (events planned, vendors booked, guests invited, budget managed) | Small |
| 61 | **itinerary.tsx** | Add event-mode toggle, attendee roster per activity, group transport booking | Medium |
| 62 | **itinerary-view.tsx** | Add event-specific view mode (timeline vs day-by-day), guest list overlay | Medium |
| 63 | **shared-trip.tsx** | Add event-specific sharing (guest invite link, vendor view, public event page) | Small |
| 64 | **booking-demo.tsx** | Reframe as event booking demo (venue booking, caterer selection) | Small |
| 65 | **architecture-diagram.tsx** | Update to show event planning architecture (not just travel) | Small |
| 66 | **deals.tsx** | Add event-specific deals (wedding venue discounts, corporate package deals) | Medium |
| 67 | **hidden-gems.tsx** | Add event-specific hidden gems (proposal spots, wedding photo locations, corporate retreat venues) | Small |
| 68 | **explore.tsx** | Add event-specific exploration (wedding destinations, proposal locations, birthday venues) | Small |
| 69 | **earn.tsx** | Reframe as event planner earning opportunity, not just travel guide | Small |
| 70 | **careers.tsx** | Add event planning roles (Event Planner, Wedding Coordinator, Corporate Event Manager) | Small |
| 71 | **contact.tsx** | Add event planning inquiry option | Small |
| 72 | **blog.tsx** | Add event planning blog categories (wedding planning, proposal ideas, corporate events) | Small |
| 73 | **press.tsx** | Add event planning press angles (destination wedding trends, corporate retreat growth) | Small |
| 74 | **visa-help.tsx** | Reframe as event logistics help (not just visa) | Small |
| 75 | **spontaneous.tsx** | Add spontaneous event opportunities (last-minute venue availability, flash proposal deals) | Small |
| 76 | **not-found.tsx** | Generic — no changes needed | None |
| 77 | **reset-password.tsx** | Generic — no changes needed | None |
| 78 | **verify-email.tsx** | Generic — no changes needed | None |
| 79 | **accept-terms.tsx** | Generic — no changes needed | None |
| 80 | **contract-view.tsx** | Add event-specific contract templates | Medium |
| 81 | **architecture-diagram.tsx** | Update labels to show event planning flow | Small |
| 82 | **landing-mockups.tsx** | Update mockups to show event planning UI | Small |
| 83 | **layout-mock.tsx** | Update mock layout to show event planning nav | Small |
| 84 | **credits.tsx** | Deprecate or reframe | Medium |
| 85 | **credits-billing.tsx** | Reframe for event coordination billing | Medium |
| 86 | **provider-status.tsx** | Add event provider status (event vendor verification) | Small |
| 87 | **expert-status.tsx** | Add event planner status (event planner verification) | Small |
| 88 | **expert/verification.tsx** | Add event planner verification flow (portfolio review, past event references) | Medium |
| 89 | **expert/settings.tsx** | Add event planner settings (event types, specialties, portfolio) | Small |
| 90 | **expert/performance.tsx** | Add event planner performance metrics (events completed, guest satisfaction, vendor coordination score) | Small |
| 91 | **expert/content-studio.tsx** | Add event content creation (wedding portfolio, proposal galleries, corporate event case studies) | Medium |
| 92 | **expert/content-create.tsx** | Add event content templates | Small |
| 93 | **expert/custom-services.tsx** | Add event-specific custom service offerings | Small |
| 94 | **expert/booking-partners.tsx** | Add event booking partners (The Knot, WeddingWire, Cvent) | Medium |
| 95 | **expert/messages.tsx** | Add event-specific message templates (RSVP reminder, vendor coordination, guest update) | Small |
| 96 | **expert/leaderboard.tsx** | Add event planner leaderboard category | Small |
| 97 | **admin/search.tsx** | Add event search type (event, vendor, venue) | Small |
| 98 | **admin/offering-types.tsx** | Add event offering types (wedding_package, corporate_retreat, proposal_bundle) | Small |
| 99 | **admin/routing-queue.tsx** | Add event-specific routing (wedding requests → wedding planners, corporate → corporate event managers) | Small |
| 100 | **admin/system.tsx** | Add event planning system settings (event categories, default fees, event templates) | Small |
| 101 | **admin/notifications.tsx** | Add event-specific notification templates | Small |
| 102 | **admin/neighborhoods.tsx** | Add event venue neighborhoods (wedding districts, corporate zones) | Small |
| 103 | **admin/neighborhood-backfill.tsx** | Add event neighborhood data | Small |
| 104 | **admin/gem-photo-backfill.tsx** | Add event venue photo backfill | Small |
| 105 | **admin/content-tracking.tsx** | Add event content tracking | Small |
| 106 | **admin/cross-sell-analytics.tsx** | Add event cross-sell analytics | Small |
| 107 | **admin/review-moderation.tsx** | Add event review categories | Small |
| 108 | **admin/payouts.tsx** | Add event payout rules | Small |
| 109 | **admin/category-fees.tsx** | Add event category fees | Small |
| 110 | **admin/platform-providers.tsx** | Add event vendor APIs | Medium |
| 111 | **admin/affiliate-partners.tsx** | Add event affiliate partners | Medium |
| 112 | **admin/ai-costs.tsx** | Add event AI cost tracking | Small |
| 113 | **ea/communications.tsx** | Add event communication templates | Small |
| 114 | **ea/gifts.tsx** | Add event gift registry integration | Medium |
| 115 | **ea/executives.tsx** | Add event executive oversight (corporate event approval) | Small |
| 116 | **ea/ai-assistant.tsx** | Add event AI for EA (event coordination, vendor management) | Medium |
| 117 | **ea/reports.tsx** | Add event reports (event ROI, guest satisfaction, vendor performance) | Medium |
| 118 | **ea/settings.tsx** | Add event EA settings | Small |
| 119 | **ea/venues.tsx** | Add venue management for EA | Medium |
| 120 | **ea/profile.tsx** | Add event EA profile | Small |
| 121 | **ea/travel.tsx** | Rename to "ea/logistics.tsx", add event logistics | Medium |
| 122 | **ea/trips.tsx** | Rename to "ea/experiences.tsx" | Small |

---

## Phase 4: Week 4 — AI & Intelligence Reframe

**Goal:** Make the AI optimizer, concierge, and intelligence services event-aware. Add event-specific prompts, sequencing, and optimization.

**Estimated Effort:** 30–40 hours

### Backend Services to Update

| # | Service | Changes | Effort |
|---|---------|---------|--------|
| 1 | **trip-optimization.service.ts** | Make `eventType` primary. Add event-specific optimization: venue proximity, vendor coordination, guest convenience, group dining capacity | Large |
| 2 | **grok.service.ts** | Add event-specific AI prompts: wedding planner, proposal planner, corporate event planner, birthday planner | Large |
| 3 | **itinerary-intelligence.service.ts** | Add event-specific intelligence: venue availability, vendor pricing, seasonal event factors, cultural ceremony customs | Medium |
| 4 | **smart-sequencing.service.ts** | Add event sequencing rules: ceremony→cocktail→reception→dancing, scout→setup→proposal→photos, registration→keynote→breakouts→networking | Medium |
| 5 | **upsell-engine.service.ts** | Add event-specific upsell slots: wedding_vendor_gate, proposal_extras_gate, corporate_catering_gate, birthday_entertainment_gate | Medium |
| 6 | **travelpulse.service.ts** | Add EventPulse: venue availability, vendor pricing, event seasonality, cultural event calendar | Large |
| 7 | **provider-matching.service.ts** | Add event vendor matching: photographer, florist, caterer, DJ, venue based on event type and budget | Medium |
| 8 | **constraint-propagation.service.ts** | Add event constraints: ceremony time immovable, vendor availability windows, guest travel arrival times, dietary restrictions | Medium |
| 9 | **emergency.service.ts** | Add event-specific contingency plans: rain backup for outdoor ceremony, vendor no-show replacement, dress emergency, speaker cancellation | Medium |
| 10 | **destination-trends.service.ts** | Add event market trends: wedding destination popularity, corporate retreat growth, proposal seasonality | Small |
| 11 | **logistics-presets.service.ts** | Add event logistics presets: wedding guest shuttle routes, corporate airport transfer schedules, proposal discrete arrival plans | Medium |
| 12 | **revenue-tracking.service.ts** | Add event revenue categories: wedding revenue, corporate revenue, proposal revenue, birthday revenue | Small |
| 13 | **transport-leg-calculator.ts** | Add group transport calculation: shuttle capacity, multiple pickup points, event timeline integration | Small |
| 14 | **kml-generator.ts** | Add event KML generation: venue locations, guest hotel cluster, shuttle route visualization | Small |
| 15 | **gpx-generator.ts** | Add event GPX generation: proposal walking route, wedding photo tour route | Small |
| 16 | **kml-generator.ts** | Add event-specific map layers | Small |

### Frontend Pages to Update

| # | Page | Changes | Effort |
|---|------|---------|--------|
| 1 | **ai-assistant.tsx** | Add event planner mode selector, event-specific AI prompts, wedding/proposal/corporate/birthday templates | Large |
| 2 | **optimize.tsx** | Dynamic destination (not hardcoded Paris), event-type selector, event optimization metrics | XL |
| 3 | **quick-start-itinerary.tsx** | Event-type-aware generation, venue selection, ceremony type, guest count, event interests | Large |
| 4 | **itinerary-comparison.tsx** | Event variant comparison (venue A vs B, catering style, decor package) | Large |
| 5 | **discover.tsx** | Event-specific discovery algorithm (venue matching, vendor recommendation) | Medium |
| 6 | **discover-location.tsx** | Event-specific location intelligence | Medium |
| 7 | **experience-discovery.tsx** | Event-type discovery | Medium |
| 8 | **help-me-decide.tsx** | Event package recommendation (wedding in Cartagena, corporate retreat in Kyoto) | Medium |
| 9 | **global-calendar.tsx** | Personal event milestone overlay | Medium |
| 10 | **dashboard.tsx** | Event-specific AI suggestions ("Your wedding is in 30 days — book photographer now") | Small |
| 11 | **expert/workspace.tsx** | AI-assisted event timeline building, vendor recommendation, budget optimization | Medium |
| 12 | **expert/ai-assistant.tsx** | Event-specific AI for experts (vendor sourcing, timeline optimization, guest logistics) | Medium |
| 13 | **ea/ai-assistant.tsx** | Event coordination AI for EA (vendor follow-up, guest reminder, timeline check) | Medium |
| 14 | **landing.tsx** | AI event planner feature highlight | Small |
| 15 | **features.tsx** | AI Event Planning feature description | Small |
| 16 | **about.tsx** | AI event planning technology mention | Small |
| 17 | **faq.tsx** | AI event planning FAQ | Small |
| 18 | **pricing.tsx** | AI planning fee tiers ($9.99 simple → $49.99 complex) | Small |
| 19 | **cart.tsx** | AI optimization upsell (event-specific) | Small |
| 20 | **payment.tsx** | AI optimization fee (event-tiered) | Small |
| 21 | **admin/ai-costs.tsx** | Event AI cost tracking | Small |
| 22 | **admin/tourism-analytics.tsx** | Event AI usage analytics | Small |
| 23 | **admin/analytics.tsx** | Event AI conversion metrics | Small |
| 24 | **expert/performance.tsx** | AI-assisted event planning score | Small |
| 25 | **expert/revenue-optimization.tsx** | AI revenue optimization for events | Small |

---

## Phase 5: Week 5–6 — Polish, Testing & Launch Prep

**Goal:** QA all changes, fix broken links, update SEO, test event flows end-to-end, and prepare launch.

**Estimated Effort:** 20–30 hours

### Tasks

| # | Task | Effort |
|---|------|--------|
| 1 | **Global QA sweep** — Check all renamed routes, links, and references | Medium |
| 2 | **SEO update** — Update meta tags, titles, descriptions on all marketing pages | Small |
| 3 | **Sitemap update** — Add event-specific pages (event-packages, vendor-categories) | Small |
| 4 | **End-to-end event flow test** — Create wedding → add guests → book vendors → optimize → pay deposit → view timeline | Large |
| 5 | **End-to-end corporate flow test** — Create corporate retreat → book venue → add attendees → book catering → optimize → pay | Large |
| 6 | **End-to-end proposal flow test** — Create proposal → book photographer → book venue → optimize → view timeline | Large |
| 7 | **Mobile responsiveness check** — All updated pages on mobile | Medium |
| 8 | **Accessibility audit** — Ensure event forms (RSVP, accessibility needs) are accessible | Medium |
| 9 | **Performance check** — No regression from new event features | Small |
| 10 | **Analytics instrumentation** — Add event-specific tracking (event type, budget tier, vendor category) | Medium |
| 11 | **Documentation update** — Update README, API docs, admin docs for event model | Medium |
| 12 | **Stakeholder demo** — Walk through wedding, corporate, and proposal flows | Small |
| 13 | **Soft launch** — Launch to beta users (event planners, wedding planners) | Small |
| 14 | **Feedback loop** — Collect feedback from beta users, iterate | Ongoing |

---

## Master Checklist by Page

### Core User Flow (24 pages)

| Page | Phase 1 (Terminology) | Phase 2 (Monetization) | Phase 3 (Features) | Phase 4 (AI) | Phase 5 (QA) |
|------|----------------------|------------------------|-------------------|--------------|-------------|
| create-trip.tsx | ✅ Rename all | ✅ Event budget tiers | ✅ Event wizard steps | ✅ AI prompts | ✅ E2E test |
| trip-details.tsx | ✅ Rename all | — | ✅ Guest list view | ✅ AI suggestions | ✅ Test |
| my-trips.tsx | ✅ Rename all | — | ✅ Event filter | — | ✅ Test |
| itinerary.tsx | ✅ Rename all | — | ✅ Event mode, attendees | ✅ AI timeline | ✅ Test |
| itinerary-view.tsx | ✅ Rename all | — | ✅ Event view mode | — | ✅ Test |
| itinerary-comparison.tsx | ✅ Rename all | — | ✅ Event variant compare | ✅ AI compare | ✅ Test |
| cart.tsx | ✅ Rename all | ✅ Deposit/milestone | ✅ Multi-vendor checkout | ✅ AI upsell | ✅ Test |
| payment.tsx | ✅ Rename all | ✅ Event-scaled fees | ✅ Contract checkbox | ✅ AI fee | ✅ Test |
| pricing.tsx | ✅ Rename all | ✅ Full restructure | ✅ Event tiers | ✅ AI tiers | ✅ Test |
| landing.tsx | ✅ Rename all | — | ✅ Event testimonials | ✅ AI feature | ✅ SEO |
| dashboard.tsx | ✅ Rename all | — | ✅ Event stats | ✅ AI suggestions | ✅ Test |
| experiences.tsx | ✅ Rename all | — | ✅ Event filter | — | ✅ Test |
| experience-template.tsx | ✅ Rename all | — | ✅ Generalize wedding UI | ✅ AI template | ✅ Test |
| experience-discovery.tsx | ✅ Rename all | — | ✅ Event discovery | ✅ AI discovery | ✅ Test |
| discover.tsx | ✅ Rename all | — | ✅ Event packages | ✅ AI recommend | ✅ Test |
| discover-location.tsx | ✅ Rename all | — | ✅ Event intelligence | ✅ AI intel | ✅ Test |
| browse.tsx | ✅ Rename all | — | ✅ Event categories | ✅ AI browse | ✅ Test |
| shared-trip.tsx | ✅ Rename all | — | ✅ Guest invite link | — | ✅ Test |
| quick-start-itinerary.tsx | ✅ Rename all | — | ✅ Event generation | ✅ AI generate | ✅ Test |
| optimize.tsx | ✅ Rename all | — | ✅ Event optimization | ✅ AI optimize | ✅ Test |
| my-itinerary.tsx | ✅ Rename all | — | ✅ Event mode | ✅ AI mode | ✅ Test |
| my-bookings.tsx | ✅ Rename all | — | ✅ Vendor booking tracking | ✅ AI track | ✅ Test |
| global-calendar.tsx | ✅ Rename all | — | ✅ Event milestone overlay | ✅ AI calendar | ✅ Test |
| help-me-decide.tsx | ✅ Rename all | — | ✅ Event packages | ✅ AI recommend | ✅ Test |

### Expert/Provider (33 pages)

| Page | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| experts.tsx | ✅ | — | ✅ Event filter | ✅ AI match | ✅ |
| expert-detail.tsx | ✅ | — | ✅ Event portfolio | ✅ AI suggest | ✅ |
| expert/workspace.tsx | ✅ | — | ✅ Event modules | ✅ AI workspace | ✅ |
| expert/dashboard.tsx | ✅ | — | ✅ Event actions | ✅ AI dashboard | ✅ |
| expert/assigned-trips.tsx | ✅ | — | ✅ Event badges | ✅ AI list | ✅ |
| expert/clients.tsx | ✅ | — | ✅ Event grouping | ✅ AI clients | ✅ |
| expert/client-detail.tsx | ✅ | — | ✅ Event details | ✅ AI details | ✅ |
| expert/messages.tsx | ✅ | — | ✅ Event templates | ✅ AI messages | ✅ |
| expert/services.tsx | ✅ | — | ✅ Event categories | ✅ AI services | ✅ |
| expert/service-wizard.tsx | ✅ | — | ✅ Event templates | ✅ AI wizard | ✅ |
| expert/templates.tsx | ✅ | — | ✅ Event tags | ✅ AI templates | ✅ |
| expert/dashboard.tsx | ✅ | — | ✅ Event stats | ✅ AI stats | ✅ |
| expert/earnings.tsx | ✅ | ✅ Event fees | ✅ Event revenue | ✅ AI earnings | ✅ |
| expert/performance.tsx | ✅ | — | ✅ Event metrics | ✅ AI score | ✅ |
| expert/revenue-optimization.tsx | ✅ | — | ✅ Event optimization | ✅ AI revenue | ✅ |
| expert/bookings.tsx | ✅ | — | ✅ Event bookings | ✅ AI bookings | ✅ |
| expert/booking-partners.tsx | ✅ | — | ✅ Event partners | ✅ AI partners | ✅ |
| expert/custom-services.tsx | ✅ | — | ✅ Event services | ✅ AI custom | ✅ |
| expert/service-form.tsx | ✅ | — | ✅ Event form | ✅ AI form | ✅ |
| expert/verification.tsx | ✅ | — | ✅ Event verification | ✅ AI verify | ✅ |
| expert/settings.tsx | ✅ | — | ✅ Event settings | ✅ AI settings | ✅ |
| expert/leaderboard.tsx | ✅ | — | ✅ Event category | ✅ AI leaderboard | ✅ |
| expert/content-studio.tsx | ✅ | — | ✅ Event content | ✅ AI content | ✅ |
| expert/content-create.tsx | ✅ | — | ✅ Event templates | ✅ AI create | ✅ |
| expert/profile.tsx | ✅ | — | ✅ Event portfolio | ✅ AI profile | ✅ |
| expert/contract-categories.tsx | ✅ | — | ✅ Event contracts | ✅ AI contracts | ✅ |
| expert/analytics.tsx | ✅ | — | ✅ Event analytics | ✅ AI analytics | ✅ |
| provider-status.tsx | ✅ | — | ✅ Event provider | ✅ AI status | ✅ |
| service-providers.tsx | ✅ | — | ✅ Event providers | ✅ AI providers | ✅ |
| services-provider.tsx | ✅ | — | ✅ Event services | ✅ AI services | ✅ |
| service-detail.tsx | ✅ | — | ✅ Event details | ✅ AI details | ✅ |
| vendors.tsx | ✅ | — | ✅ Event vendors | ✅ AI vendors | ✅ |
| travel-experts.tsx | ✅ | — | ✅ Event experts | ✅ AI experts | ✅ |
| partner-with-us.tsx | ✅ | — | ✅ Event partners | ✅ AI partners | ✅ |

### Guest/Event Management (25 pages + components)

| Page | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| GuestInvitePage.tsx | ✅ | — | ✅ Generalize | ✅ AI invite | ✅ |
| GuestInviteManager.tsx | ✅ | — | ✅ Generalize | ✅ AI manager | ✅ |
| my-itinerary.tsx | ✅ | — | ✅ Event mode | ✅ AI itinerary | ✅ |
| my-bookings.tsx | ✅ | — | ✅ Vendor tracking | ✅ AI bookings | ✅ |
| optimize.tsx | ✅ | — | ✅ Event optimization | ✅ AI optimize | ✅ |
| quick-start-itinerary.tsx | ✅ | — | ✅ Event generation | ✅ AI generate | ✅ |
| transportation-booking.tsx | ✅ | — | ✅ Event transport | ✅ AI transport | ✅ |
| itinerary-comparison.tsx | ✅ | — | ✅ Event compare | ✅ AI compare | ✅ |
| global-calendar.tsx | ✅ | — | ✅ Event overlay | ✅ AI calendar | ✅ |
| help-me-decide.tsx | ✅ | — | ✅ Event packages | ✅ AI recommend | ✅ |
| shared-trip.tsx | ✅ | — | ✅ Event sharing | ✅ AI share | ✅ |
| executive-assistant.tsx | ✅ | — | ✅ Event mode | ✅ AI EA | ✅ |
| ea/dashboard.tsx | ✅ | — | ✅ Event dashboard | ✅ AI dashboard | ✅ |
| ea/trips.tsx | ✅ | — | ✅ Rename + event | ✅ AI trips | ✅ |
| ea/events.tsx | ✅ | — | ✅ Event planning | ✅ AI events | ✅ |
| ea/clients.tsx | ✅ | — | ✅ Event clients | ✅ AI clients | ✅ |
| ea/venues.tsx | ✅ | — | ✅ Venue management | ✅ AI venues | ✅ |
| ea/calendar.tsx | ✅ | — | ✅ Event calendar | ✅ AI calendar | ✅ |
| ea/communications.tsx | ✅ | — | ✅ Event comms | ✅ AI comms | ✅ |
| ea/gifts.tsx | ✅ | — | ✅ Gift registry | ✅ AI gifts | ✅ |
| ea/executives.tsx | ✅ | — | ✅ Event oversight | ✅ AI execs | ✅ |
| ea/ai-assistant.tsx | ✅ | — | ✅ Event AI | ✅ AI EA | ✅ |
| ea/profile.tsx | ✅ | — | ✅ Event profile | ✅ AI profile | ✅ |
| ea/settings.tsx | ✅ | — | ✅ Event settings | ✅ AI settings | ✅ |
| ea/reports.tsx | ✅ | — | ✅ Event reports | ✅ AI reports | ✅ |
| ea/travel.tsx | ✅ | — | ✅ Rename + logistics | ✅ AI travel | ✅ |
| logistics/multi-person-coordination.tsx | ✅ | — | ✅ Event-aware | ✅ AI coord | ✅ |
| logistics/vendor-management.tsx | ✅ | — | ✅ Event vendors | ✅ AI vendors | ✅ |
| logistics/trip-logistics-dashboard.tsx | ✅ | — | ✅ Event logistics | ✅ AI logistics | ✅ |
| logistics/wedding-anchor-presets.tsx | ✅ | — | ✅ Generalize | ✅ AI presets | ✅ |
| logistics/temporal-anchor-manager.tsx | ✅ | — | ✅ Event anchors | ✅ AI anchors | ✅ |
| logistics/schedule-validator.tsx | ✅ | — | ✅ Event validate | ✅ AI validate | ✅ |
| logistics/energy-budget-display.tsx | ✅ | — | ✅ Event budget | ✅ AI budget | ✅ |
| logistics/anchor-suggestions-panel.tsx | ✅ | — | ✅ Event suggestions | ✅ AI suggest | ✅ |
| logistics/expert-constraint-dashboard.tsx | ✅ | — | ✅ Event constraints | ✅ AI constraints | ✅ |

### Marketing/Content (39 pages + components)

| Page | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| about.tsx | ✅ | — | ✅ Event milestones | ✅ AI mention | ✅ SEO |
| partner-with-us.tsx | ✅ | — | ✅ Event partners | ✅ AI partners | ✅ |
| terms.tsx | ✅ | — | — | — | ✅ Legal review |
| privacy.tsx | ✅ | — | — | — | ✅ Legal review |
| faq.tsx | ✅ | — | ✅ Event FAQs | ✅ AI FAQs | ✅ |
| features.tsx | ✅ | — | ✅ Event features | ✅ AI features | ✅ |
| how-it-works.tsx | ✅ | — | ✅ Event examples | ✅ AI examples | ✅ |
| help.tsx | ✅ | — | ✅ Event help | ✅ AI help | ✅ |
| press.tsx | ✅ | — | ✅ Event press | ✅ AI press | ✅ |
| careers.tsx | ✅ | — | ✅ Event roles | ✅ AI roles | ✅ |
| blog.tsx | ✅ | — | ✅ Event blog | ✅ AI blog | ✅ |
| contact.tsx | ✅ | — | ✅ Event contact | ✅ AI contact | ✅ |
| earn.tsx | ✅ | — | ✅ Event earn | ✅ AI earn | ✅ |
| hidden-gems.tsx | ✅ | — | ✅ Event gems | ✅ AI gems | ✅ |
| explore.tsx | ✅ | — | ✅ Event explore | ✅ AI explore | ✅ |
| travel-experts.tsx | ✅ | — | ✅ Event experts | ✅ AI experts | ✅ |
| visa-help.tsx | ✅ | — | ✅ Event logistics | ✅ AI help | ✅ |
| deals.tsx | ✅ | — | ✅ Event deals | ✅ AI deals | ✅ |
| ai-assistant.tsx | ✅ | — | ✅ Event AI | ✅ AI mode | ✅ |
| chat.tsx | ✅ | — | ✅ Event chat | ✅ AI chat | ✅ |
| notifications.tsx | ✅ | — | ✅ Event notifications | ✅ AI notifications | ✅ |
| profile.tsx | ✅ | — | ✅ Event preferences | ✅ AI profile | ✅ |
| credits-billing.tsx | ✅ | ✅ Reframe | ✅ Event billing | ✅ AI billing | ✅ |
| credits.tsx | ✅ | ✅ Deprecate | ✅ Event tokens | ✅ AI credits | ✅ |
| booking-demo.tsx | ✅ | — | ✅ Event demo | ✅ AI demo | ✅ |
| architecture-diagram.tsx | ✅ | — | ✅ Event diagram | ✅ AI diagram | ✅ |
| landing-mockups.tsx | ✅ | — | ✅ Event mockups | ✅ AI mockups | ✅ |
| layout-mock.tsx | ✅ | — | ✅ Event layout | ✅ AI layout | ✅ |
| spontaneous.tsx | ✅ | — | ✅ Event spontaneous | ✅ AI spontaneous | ✅ |
| not-found.tsx | — | — | — | — | ✅ |
| reset-password.tsx | — | — | — | — | ✅ |
| verify-email.tsx | — | — | — | — | ✅ |
| accept-terms.tsx | — | — | — | — | ✅ |
| contract-view.tsx | ✅ | — | ✅ Event contracts | ✅ AI contracts | ✅ |
| concierge/index.tsx | ✅ | — | — | — | ✅ |
| layout.tsx | ✅ | — | ✅ Event nav | ✅ AI nav | ✅ |
| user-menu.tsx | ✅ | — | ✅ Event menu | ✅ AI menu | ✅ |
| expert-card.tsx | ✅ | — | ✅ Event card | ✅ AI card | ✅ |
| expert-sidebar.tsx | ✅ | — | ✅ Event sidebar | ✅ AI sidebar | ✅ |

### Admin (32 pages)

| Page | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| admin/dashboard.tsx | ✅ | — | ✅ Event stats | ✅ AI stats | ✅ |
| admin/event-packages.tsx | ✅ | — | ✅ Sub-packages | ✅ AI packages | ✅ |
| admin/expert-templates.tsx | ✅ | — | ✅ Event tags | ✅ AI templates | ✅ |
| admin/experts.tsx | ✅ | — | ✅ Event badges | ✅ AI experts | ✅ |
| admin/providers.tsx | ✅ | — | ✅ Event providers | ✅ AI providers | ✅ |
| admin/services.tsx | ✅ | — | ✅ Event tags | ✅ AI services | ✅ |
| admin/categories.tsx | ✅ | — | ✅ Event hierarchy | ✅ AI categories | ✅ |
| admin/fee-bands.tsx | ✅ | ✅ Event bands | ✅ Event bands | ✅ AI bands | ✅ |
| admin/fee-config.tsx | ✅ | ✅ Event config | ✅ Event config | ✅ AI config | ✅ |
| admin/plans.tsx | ✅ | ✅ Event plans | ✅ Event plans | ✅ AI plans | ✅ |
| admin/revenue.tsx | ✅ | ✅ Event revenue | ✅ Event revenue | ✅ AI revenue | ✅ |
| admin/users.tsx | ✅ | — | ✅ Event users | ✅ AI users | ✅ |
| admin/analytics.tsx | ✅ | — | ✅ Event analytics | ✅ AI analytics | ✅ |
| admin/data.tsx | ✅ | — | ✅ Event data | ✅ AI data | ✅ |
| admin/content-mapping.tsx | ✅ | — | ✅ Event content | ✅ AI content | ✅ |
| admin/content-tracking.tsx | ✅ | — | ✅ Event tracking | ✅ AI tracking | ✅ |
| admin/cross-sell-analytics.tsx | ✅ | — | ✅ Event cross-sell | ✅ AI cross-sell | ✅ |
| admin/affiliate-partners.tsx | ✅ | — | ✅ Event partners | ✅ AI partners | ✅ |
| admin/ai-costs.tsx | ✅ | — | ✅ Event AI costs | ✅ AI costs | ✅ |
| admin/platform-providers.tsx | ✅ | — | ✅ Event APIs | ✅ AI APIs | ✅ |
| admin/neighborhoods.tsx | ✅ | — | ✅ Event neighborhoods | ✅ AI neighborhoods | ✅ |
| admin/neighborhood-backfill.tsx | ✅ | — | ✅ Event backfill | ✅ AI backfill | ✅ |
| admin/gem-photo-backfill.tsx | ✅ | — | ✅ Event photos | ✅ AI photos | ✅ |
| admin/search.tsx | ✅ | — | ✅ Event search | ✅ AI search | ✅ |
| admin/system.tsx | ✅ | — | ✅ Event settings | ✅ AI settings | ✅ |
| admin/tourism-analytics.tsx | ✅ | ✅ Rebuild | ✅ Event intelligence | ✅ AI intelligence | ✅ |
| admin/review-moderation.tsx | ✅ | — | ✅ Event reviews | ✅ AI reviews | ✅ |
| admin/routing-queue.tsx | ✅ | — | ✅ Event routing | ✅ AI routing | ✅ |
| admin/payouts.tsx | ✅ | ✅ Event payouts | ✅ Event payouts | ✅ AI payouts | ✅ |
| admin/offering-types.tsx | ✅ | — | ✅ Event offerings | ✅ AI offerings | ✅ |
| admin/category-fees.tsx | ✅ | ✅ Event fees | ✅ Event fees | ✅ AI fees | ✅ |
| admin/notifications.tsx | ✅ | — | ✅ Event notifications | ✅ AI notifications | ✅ |

---

## Risk Assessment & Mitigation

### High Risk
1. **Breaking existing travel users** — Many current users may be travel-focused. Mitigation: Gradual rollout with feature flags, keep travel mode available as "Travel" event type.
2. **Legal document changes** — Terms and privacy changes need legal review. Mitigation: Phase 5 legal review, not Phase 1.
3. **API endpoint renaming** — Renaming `/api/trips` → `/api/experiences` breaks mobile apps and integrations. Mitigation: Keep API aliases for backward compatibility. Only rename frontend routes in Phase 1.
4. **Monetization model change** — Switching from credits to event fees affects existing revenue. Mitigation: Grandfather existing Pro users, offer migration path.

### Medium Risk
1. **SEO impact** — Changing "trip" to "experience" may affect search rankings. Mitigation: 301 redirects, updated meta tags, sitemap resubmission.
2. **Expert confusion** — Existing travel experts may not understand the rebrand. Mitigation: Clear communication, onboarding webinar, updated expert docs.
3. **Database migration** — Adding `totalBudget`, `eventType` fields requires migration. Mitigation: Use Drizzle migrations, test in staging.

### Low Risk
1. **Copy changes** — Pure text changes are low risk. Mitigation: Global find-and-replace with code review.
2. **Icon changes** — Plane → PartyPopper, etc. Mitigation: Visual review.
3. **New pages** — Adding event-specific pages doesn't break existing flows. Mitigation: Feature flag rollout.

---

## Success Metrics

### Week 1 (Terminology)
- [ ] Zero user-facing "trip" terminology on top 20 pages
- [ ] All "travelers" → "guests" on user-facing pages
- [ ] All "itinerary" → "timeline" or "plan" on user-facing pages
- [ ] All "destination" → "location" or "city" on user-facing pages

### Week 2 (Monetization)
- [ ] Pricing page shows event coordination tiers (not credits)
- [ ] Payment page shows event-scaled fees (not $45 flat)
- [ ] Create-trip page shows total event budget (not per-day)
- [ ] Cart supports deposit and milestone payments

### Week 3 (Features)
- [ ] Wedding coordination service tested end-to-end
- [ ] Proposal coordination service built and tested
- [ ] Birthday coordination service built and tested
- [ ] Corporate coordination service built and tested
- [ ] Guest invite system generalized for all event types
- [ ] Event-specific upsell slots active

### Week 4 (AI)
- [ ] AI optimizer supports all 4 event types (wedding, proposal, birthday, corporate)
- [ ] Smart sequencing includes event-specific rules
- [ ] Grok service has event-specific prompts
- [ ] EventPulse intelligence active

### Week 5–6 (Launch)
- [ ] All 156 pages audited and fixed
- [ ] End-to-end wedding flow passes QA
- [ ] End-to-end corporate flow passes QA
- [ ] End-to-end proposal flow passes QA
- [ ] SEO updated and sitemap submitted
- [ ] Legal docs reviewed and approved
- [ ] Beta launch with 10 event planners
- [ ] Public launch announcement

---

## Recommended Team Composition

| Role | Count | Responsibilities |
|------|-------|------------------|
| **Frontend Lead** | 1 | Phase 1 terminology, Phase 2 monetization UI, Phase 3 event features, Phase 4 AI integration |
| **Backend Lead** | 1 | Phase 2 fee model, Phase 3 coordination services, Phase 4 AI/sequencing, database migrations |
| **Full-Stack Dev** | 1 | Admin pages, expert pages, guest/event management pages, EA pages |
| **Copywriter/UX** | 1 | All text changes, marketing page rewrites, FAQ updates, legal doc review coordination |
| **QA Engineer** | 1 | Phase 5 testing, E2E event flows, mobile testing, accessibility audit |
| **Designer** | 0.5 | Event-specific UI components, icon updates, marketing asset updates |
| **Product Manager** | 0.5 (you) | Priority decisions, stakeholder communication, beta user coordination |

**Total:** 5–6 FTE for 6 weeks = ~$50K–$75K in dev costs (assuming $150–$200/hr contractor rates).

---

## Files Produced

1. `codebase_audit_business_model_alignment.md` — High-level business model alignment audit
2. `page_audit_plan.md` — Deep dive plan methodology
3. `page_audit_core_user_flow.md` — Core user flow page audit (24 pages, 1067 lines)
4. `page_audit_expert_provider.md` — Expert/provider page audit (33 pages, 819 lines)
5. `page_audit_guest_event_management.md` — Guest/event management page audit (25 pages, 875 lines)
6. `page_audit_marketing_content.md` — Marketing/content page audit (39 pages, 998 lines)
7. `page_audit_admin.md` — Admin page audit (32 pages, 754 lines)
8. `integrated_execution_plan.md` (this file) — Master cohesive plan

---

## Next Steps

1. **Review this plan** — Confirm priorities and timeline
2. **Approve Phase 1 scope** — Which pages must be fixed first?
3. **Start Phase 1** — I can begin the terminology blitz immediately (create-trip.tsx, pricing.tsx, landing.tsx, etc.)
4. **Set up feature flags** — Enable gradual rollout (travel mode vs event mode)
5. **Schedule weekly check-ins** — Review progress, adjust priorities

**Ready to start Phase 1?** I can begin with the highest-impact pages: `create-trip.tsx`, `pricing.tsx`, `landing.tsx`, and `payment.tsx`.
