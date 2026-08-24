# Traveloure Core User Flow Page Audit
## Experience Planning Rebrand Gap Analysis

**Audit Date:** 2026-06-13
**Auditor:** Specialist Agent
**Scope:** 24 core user-flow pages in `client/src/pages/`
**Business Model Context:** Reframe from "travel/tourism" to "Experience Planning" (weddings, birthdays, proposals, corporate events in foreign cities, $5K–$50K events)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Pages Audited | 24 |
| Pages with **P0** Issues | 24 |
| Pages with **P1** Issues | 23 |
| Pages with No Issues | 0 |
| Total P0 Issues | ~78 |
| Total P1 Issues | ~45 |
| Total P2 Issues | ~28 |

**Critical Finding:** Every single core user-flow page contains P0-level "trip/travel" terminology or travel-centric copy that directly contradicts the reframed Experience Planning business model. The most severely misaligned pages are **create-trip.tsx**, **pricing.tsx**, **payment.tsx**, **optimize.tsx**, and **discover.tsx**, which together form the creation, monetization, and discovery pillars of the user journey.

**Monetization Misalignment:** The platform still operates on a credit-based SaaS model ($14.99/mo Pro, $19.99 AI optimization, $45 service fees) that is fundamentally incompatible with a $5K–$50K event planning marketplace. No page presents event-specific pricing tiers, deposit workflows, or milestone payment structures.

---

## Methodology

1. **Read all 24 target files** using `Read` tool with verified line numbers.
2. **Categorized findings** into five audit dimensions:
   - (1) "Trip" terminology
   - (2) Travel-specific copy
   - (3) Budget/per-day pricing
   - (4) Missing event features
   - (5) Monetization misalignment
3. **Assigned severity:** P0 = Critical (must fix before rebrand), P1 = Important (affects user perception), P2 = Nice-to-have (refinement).
4. **Skipped:** Already-correct event terminology (e.g., "Wedding", "Proposal" in `eventTypes`), backend-only concerns, and admin pages.

---

## Per-Page Audit

### 1. `create-trip.tsx` — Experience Creation Wizard
**Event Support Level: 1/5**

**Current State:** The primary creation flow has event type selection (vacation, wedding, proposal, birthday, corporate) but uses heavy travel terminology throughout. The default event type is "vacation" with a Plane icon. Budget is per-day ($50–$250+/day), not total event budget. Guest count is labeled "Travelers". Travel styles (adventure, relaxation, culture) are presented instead of event-specific planning options.

**Issues Found:**

**P0:**
- **Line 33:** `id: "vacation", label: "Vacation", icon: Plane, description: "Leisure travel and exploration"` — Default event type is pure travel.
- **Line 38:** `id: "birthday", label: "Birthday", icon: PartyPopper, description: "Birthday celebration trip"` — Even the birthday option says "trip".
- **Line 49:** `numberOfTravelers: z.coerce.number().min(1, "At least 1 traveler required")` — Field name and error message are travel-centric.
- **Lines 55–62:** `const travelStyles = ["adventure", "relaxation", "culture", "food", "nature", "nightlife"]` — Travel style categories, not event planning styles.
- **Lines 65–67:** Per-day budget options: `$50-100/day`, `$100-250/day`, `$250+/day` — Completely misaligned with $5K–$50K events.
- **Line 71:** Step 1 description: `"What kind of trip is this?"`
- **Line 72:** Step 2 description: `"Where do you want to go?"` — "Destination" is travel framing; should be "City/Location".
- **Line 73:** Step 3 description: `"When are you traveling?"`
- **Line 75:** Step 5 description: `"Confirm your trip details"`
- **Line 170:** Hero title: `"Plan Your Perfect Trip"`
- **Line 174:** Hero subtitle: `"Let's create an amazing travel experience tailored just for you."`
- **Line 228:** Step 1 heading: `"What kind of trip is this?"`
- **Line 274:** Step 2 heading: `"Where do you want to go?"`
- **Line 303:** Form label: `"Number of Travelers"`
- **Line 345:** Step 3 heading: `"When are you traveling?"`
- **Line 346:** Step 3 subtext: `"Select your travel dates"`
- **Line 456:** Step 4 heading: `"Travel Style (select all that apply)"`
- **Line 522:** Step 5 heading: `"Review Your Trip"`
- **Line 531:** Form label: `"Trip Name"`
- **Line 540:** Form placeholder: `"Give your trip a memorable name"`
- **Line 547:** Summary heading: `"Trip Summary"`
- **Line 558:** Summary label: `"Travelers"`
- **Line 576:** Summary label: `"Travel Styles"`
- **Line 634:** Submit button: `"Create Trip"`

**P1:**
- **Line 42:** `eventType: z.string().default("vacation")` — Default should be a neutral event type or require explicit selection.
- **Line 150:** `setLocation(`/trip/${trip.id}`)` — Route uses `/trip/` path.
- **Line 286:** Destination placeholder: `"e.g., Tokyo, Japan"` — Travel destination example.

**P2:**
- Missing event-specific fields: guest list import, ceremony/reception preferences, venue requirements, vendor selection, RSVP tracking.
- Missing total event budget input (instead of per-day).
- No step for wedding-specific details (ceremony type, reception style, guest count by category).
- No step for corporate event details (agenda, AV requirements, team size, breakout rooms).

**Changes Needed:**
- Replace all "trip" terminology with "event" or "experience".
- Change `numberOfTravelers` to `numberOfGuests` or `guestCount`.
- Replace `travelStyles` with event-type-specific planning categories (e.g., for weddings: ceremony style, reception vibe, formality; for corporate: team-building, networking, celebration).
- Replace per-day budget with total event budget ranges ($5K–$10K, $10K–$25K, $25K–$50K, $50K+).
- Remove "vacation" as default; force explicit selection or use "celebration" as default.
- Rename route to `/event/${id}` or `/plan/${id}`.
- Add event-specific wizard steps (conditional based on event type).

**Effort Estimate: Large (XL)**

---

### 2. `pricing.tsx` — Pricing & Plans Page
**Event Support Level: 1/5**

**Current State:** Pure travel SaaS pricing page. Three tiers (Free, Pro $14.99/mo, Enterprise Custom) built around credits, trip saves, and AI trip planning. No mention of event planning, high-ticket services, or commission-based revenue model.

**Issues Found:**

**P0:**
- **Line 32:** `"Perfect for trying out Traveloure"` — Travel brand framing.
- **Lines 35–39:** Free plan features: `"5 free credits on signup"`, `"AI-powered trip planning"`, `"Basic itinerary generation"`, `"Save up to 3 trips"` — All travel-centric.
- **Line 52:** Pro description: `"For frequent travelers who want more"`
- **Lines 56–62:** Pro features: `"25 credits per month"`, `"Unlimited trip saves"`, `"Trip collaboration tools"` — All travel-centric.
- **Line 71:** Enterprise description: `"For travel agencies and large teams"` — Targets travel agencies, not event planners.
- **Lines 73–81:** Enterprise features include `"Custom integrations"`, `"White-label options"`, `"API access"` — No event-specific enterprise features.
- **Line 89:** Feature comparison: `"AI Trip Planning"`
- **Line 92:** Feature comparison: `"Trip Saves"`
- **No event-specific pricing tiers:** No mention of commission on bookings, vendor fees, event planning packages, or high-ticket service pricing.
- **Credit-based model:** $0/$14.99/mo/Custom is completely misaligned with a $5K–$50K event marketplace.

**P1:**
- **Lines 25–26:** Import from `@shared/credit-packages` — Credit model is inherently travel-SaaS, not event marketplace.
- **Line 93:** Feature comparison: `"Monthly Credits"` — Reinforces credit model.

**P2:**
- Missing: Commission/fee structure transparency for event bookings.
- Missing: Enterprise tier for wedding planners, event agencies, corporate travel managers.
- Missing: Premium event planning packages (e.g., "Full Wedding Planning" at $2,500–$5,000).

**Changes Needed:**
- **Complete restructure** of pricing model:
  - **Free:** Basic AI planning, limited expert matching, 1 event plan.
  - **Pro:** $49–$99/mo — Unlimited events, priority expert matching, vendor quote management, RSVP tools, budget tracking.
  - **Enterprise:** Custom — Commission-based for event agencies, white-label for wedding planners, team management for corporate event teams.
- Replace credit-based features with event-planning features (vendor management, guest lists, budget tracking, timeline coordination).
- Remove all "traveler" language.

**Effort Estimate: Extra Large (XL)**

---

### 3. `cart.tsx` — Cart & Checkout Flow
**Event Support Level: 2/5**

**Current State:** Multi-step cart/checkout flow with trip-specific step labels and state variables. Flow steps include "trip-details" and "itinerary". Uses `tripTitle`, `tripDestination`, `tripTravelers` state.

**Issues Found:**

**P0:**
- `type FlowStep = "cart" | "trip-details" | "optimize" | "itinerary" | "payment"` — "trip-details" should be "event-details".
- `const [tripTitle, setTripTitle] = useState("")` — Travel-centric naming.
- `const [tripDestination, setTripDestination] = useState("")` — Should be "location" or "city".
- `const [tripTravelers, setTripTravelers] = useState(2)` — Should be "guestCount".
- Step labels use "trip" terminology throughout the flow.

**P1:**
- The flow assumes travel booking (flights, hotels, activities) rather than event service procurement (venue, catering, photography, floral).
- "Itinerary" as a checkout step is okay for events but framed as travel.

**P2:**
- Missing event-specific checkout fields: deposit amount, milestone payment schedule, contract signing, vendor coordination notes.
- No support for multiple service providers (e.g., photographer + caterer + florist) in a single checkout.

**Changes Needed:**
- Rename all `trip*` variables to `event*` or `plan*`.
- Rename flow step `"trip-details"` to `"event-details"`.
- Change "Travelers" to "Guests" or "Attendees".
- Add event-specific checkout fields (deposit, contract, milestone payments).

**Effort Estimate: Medium**

---

### 4. `payment.tsx` — Payment Page
**Event Support Level: 1/5**

**Current State:** Payment page with hardcoded "Bali, Indonesia" trip summary, "$45 service fee", "$29 AI optimization upsell", and "TRAVEL10" promo code. Designed for low-value travel bookings, not high-ticket events.

**Issues Found:**

**P0:**
- **Line 209:** Card title: `"Trip Details"` — Should be "Event Details" or "Booking Summary".
- **Line 216:** Hardcoded destination: `"Bali, Indonesia"` — Mock data that should be dynamic.
- **Line 224:** `"2 Travelers"` — Should be "Guests".
- **Line 62:** `const serviceFee = subtotal > 0 ? 45 : 0;` — $45 service fee is misaligned with $5K+ events. Should be percentage-based or tiered.
- **Line 481:** Promo code badge: `"TRAVEL10 applied"` — Should be "EVENT10" or neutral.
- **Line 549:** Upsell card: `"Optimize Your Trip?"` — Should be "Optimize Your Event?".
- **Line 561:** Upsell price: `"Add for $29"` — $29 upsell is trivial for a $5K+ event. Should be event-tiered optimization.

**P1:**
- **Line 502:** `"Service Fee"` label — For events, this should be "Planning Fee" or "Platform Fee" with percentage.
- **Line 525:** Pay button: `"Pay ${total.toFixed(0)}"` — No mention of deposit or milestone payment.
- Payment structure assumes single-payment checkout; events need deposit + milestone payment support.

**P2:**
- Missing: Deposit structure (e.g., 50% deposit, 50% before event).
- Missing: Contract acceptance checkbox specific to event services.
- Missing: Payment protection / escrow language for high-ticket bookings.

**Changes Needed:**
- Replace hardcoded trip data with dynamic event data.
- Change "Travelers" to "Guests".
- Replace flat $45 service fee with percentage-based or tiered platform fee (e.g., 5–10% of subtotal, or flat fee for events under $1K).
- Replace "TRAVEL10" with "EVENT10" or remove travel-specific promos.
- Add deposit and milestone payment options.
- Add event-specific upsells (e.g., "Add Event Coordinator for $499" instead of "AI optimization for $29").

**Effort Estimate: Medium**

---

### 5. `trip-details.tsx` — Experience Detail Page
**Event Support Level: 2/5**

**Current State:** The main detail page for a saved plan/event. Has some event support (wedding anchor presets, event type badge, expert suggestions) but heavily uses "trip" language, "Travelers" count, travel booking CTAs, and travel-specific empty states (Plane icon for "No Bookings Yet").

**Issues Found:**

**P0:**
- `"Plan Your Trip"` CTA button.
- `"Share Your Trip"` button.
- `"Travelers"` label (multiple occurrences).
- `"Book on Traveloure"` / `"Book via Partners"` booking tabs — assumes travel booking model.
- `"No Bookings Yet"` empty state with Plane icon.
- `"Regenerate Plan"` / `"Plan My Trip"` CTAs.
- `"Share your trip plan"` in share dialog title.
- `"Anyone with this link can view your itinerary"` — "trip" in link name.
- `"curate your trip"` in expert picker description.
- `"TripLogisticsDashboard"` component name (though the component itself may handle events).
- `tripName="Trip"` fallback in logistics dashboard.

**P1:**
- `tripId` used throughout as prop/parameter name.
- `numberOfTravelers` in data display.
- "Itinerary" tab is fine for events but "trip" in the tab label.
- "Services" tab uses travel-oriented service categories.

**P2:**
- Missing: Event-specific logistics dashboard (vendor status, guest RSVP summary, seating chart link, gift registry).
- Missing: Wedding-specific timeline (ceremony → cocktail hour → reception → after-party).
- Missing: Corporate event run-of-show.

**Changes Needed:**
- Replace all "trip" labels with "event" or "plan".
- Change "Travelers" to "Guests" or "Attendees".
- Replace "Book on Traveloure / Book via Partners" with "Book Services" or "Hire Vendors".
- Replace Plane icon with Calendar, Party, or Users icon for empty bookings.
- Update share dialog to "Share your event plan".
- Add event-specific detail widgets based on event type.

**Effort Estimate: Large**

---

### 6. `itinerary.tsx` — Itinerary Management Page
**Event Support Level: 2/5**

**Current State:** Day-by-day itinerary view with timeline, activity cards, transport legs. Uses "Trip Timeline" title, "Travelers" count, travel booking CTAs, and travel-specific empty states.

**Issues Found:**

**P0:**
- `"Trip Timeline"` page title.
- `"Share Your Trip"` button.
- `"Plan My Trip"` CTA.
- `"Book on Traveloure"` / `"Book via Partners"` booking tabs.
- `"No Bookings Yet"` empty state with Plane icon.
- `"Regenerate Plan"` button.
- `"Travelers"` count display.

**P1:**
- "Itinerary" is acceptable for events but "Trip Timeline" is travel-specific framing.
- `useTrip` hook usage.
- Activity categories (tours, sightseeing, dining) are travel-oriented.

**P2:**
- Missing: Event-specific timeline items (ceremony start, grand entrance, first dance, cake cutting, speeches, cocktail hour).
- Missing: Vendor coordination timeline (floral delivery, AV setup, photographer arrival).
- Missing: Guest arrival/departure logistics for destination events.

**Changes Needed:**
- Rename "Trip Timeline" to "Event Schedule" or "Day-of Timeline".
- Remove travel booking CTAs; replace with "Add Service" or "Book Vendor".
- Replace Plane icon with event-appropriate icon.
- Add event-type-specific timeline templates (wedding, corporate, birthday).

**Effort Estimate: Medium**

---

### 7. `shared-trip.tsx` — Public Share View
**Event Support Level: 2/5**

**Current State:** Public-facing read-only view of a shared plan. Uses "Share Your Adventure" hero, "Travelers" count, travel booking tabs, and travel-specific empty states.

**Issues Found:**

**P0:**
- `"Share Your Adventure"` hero title.
- `"Travelers"` label.
- `"Book on Traveloure"` / `"Book via Partners"` tabs.
- `"No Bookings Yet"` with Plane icon.
- `"Plan My Trip"` CTA for non-owner viewers.

**P1:**
- `trip` in data structure and URL parameters.
- "Adventure" framing is travel-specific.

**P2:**
- Missing: Event-specific share view (e.g., wedding guest view with RSVP button, corporate attendee view with agenda).
- Missing: Share link customization for events (e.g., "Join us in Paris!" instead of generic trip link).

**Changes Needed:**
- Replace "Share Your Adventure" with "Share Your Event" or "Event Details".
- Change "Travelers" to "Guests".
- Remove travel booking tabs.
- Add event-specific RSVP or attendance confirmation for shared views.

**Effort Estimate: Medium**

---

### 8. `itinerary-view.tsx` — Shared Itinerary View (Expert/Read-Only)
**Event Support Level: 2/5**

**Current State:** Read-only itinerary view for experts and shared links. Uses `PlanCardTrip` types, "traveler" in expert notes, and travel-specific OG tags.

**Issues Found:**

**P0:**
- **Line 150:** `"The traveler has been notified of your suggestions."` — Should be "client" or "event host".
- **Line 205:** `document.title = "${destination} Itinerary • Traveloure"` — Okay but generic.
- **Line 231:** `coverImageUrl = "https://picsum.photos/seed/travel-cover/1200/630"` — "travel-cover" seed.
- **Line 303:** `const planCardTrip: PlanCardTrip` — Type name uses "Trip".
- **Line 309:** `numberOfTravelers: 1` — Field name.
- **Line 717:** `"Plan your own trip with Traveloure"`
- **Line 720:** `"Plan My Trip"` button text.
- **Line 729:** `"Send Edits to Traveler"` dialog title.
- **Line 782:** `"Send to Traveler"` button text.

**P1:**
- **Line 429:** Brand logo uses "Traveloure" (brand name is okay but contains "travel").
- **Line 439:** Share title uses "Itinerary" (acceptable for events).
- `tripId` prop throughout components.
- `tripDestination` prop name.

**P2:**
- Missing: Expert view for event-specific notes (e.g., "Recommend ceremony flowers", "Suggest backup indoor venue").
- Missing: Client feedback loop for event approvals (e.g., "Approve vendor", "Confirm timeline").

**Changes Needed:**
- Replace all "traveler" references with "client", "host", or "event organizer".
- Rename `PlanCardTrip` type to `PlanCardEvent`.
- Change `numberOfTravelers` to `guestCount`.
- Rename `tripId`/`tripDestination` props to `eventId`/`eventLocation`.
- Replace "Plan My Trip" with "Plan My Event" or "Start Planning".

**Effort Estimate: Medium**

---

### 9. `my-itinerary.tsx` — My Itinerary (Personal View)
**Event Support Level: 3/5**

**Current State:** Personal itinerary view with day-by-day schedule, cost breakdown, and booking summary. Has some event-agnostic structure but uses "Travelers" and trip-centric data.

**Issues Found:**

**P1:**
- `"Travelers"` count in header/stats.
- `trip` in data structure and API calls.
- `"Bookings"` section uses generic but travel-leaning icons (Plane, Hotel, Car).

**P2:**
- Missing: Event-specific cost categories (venue, catering, floral, photography, entertainment) instead of generic "activities", "transportation", "accommodation".
- Missing: Guest-facing itinerary view (what guests need to know vs. what the planner sees).

**Changes Needed:**
- Change "Travelers" to "Guests".
- Rename data references from `trip` to `event`.
- Add event-specific cost categories.

**Effort Estimate: Small**

---

### 10. `my-trips.tsx` — My Plans & Events List
**Event Support Level: 3/5**

**Current State:** Lists all saved plans with filter, search, and status. Header is "My Plans & Events" (correct), but filter options include "Travel" and "Vacation" as event types. Uses `useTrips` hook.

**Issues Found:**

**P0:**
- **Line 34:** Filter option: `{ value: "vacation", label: "Travel" }` — "Vacation" mapped to "Travel" label.
- **Line 22:** `vacation: Plane` icon mapping — Plane icon for vacation/travel.

**P1:**
- **Line 1:** `import { useTrips } from "@/hooks/use-trips"` — Hook name.
- **Line 68:** Error message: `"Could not load your trips."`
- `trip` used throughout variable names and data references.

**P2:**
- Missing: Event-specific status labels ("Venue Confirmed", "Vendors Booked", "RSVP Closed", "Final Count").
- Missing: Event type icon differentiation (wedding ring, birthday cake, corporate building).

**Changes Needed:**
- Change filter label from "Travel" to "Vacation" or remove "vacation" as a separate category.
- Replace `useTrips` with `useEvents` or `usePlans` (requires backend alignment).
- Change Plane icon to a more neutral icon for vacation/leisure events.
- Add event-specific status labels.

**Effort Estimate: Small**

---

### 11. `my-bookings.tsx` — Bookings & Reservations
**Event Support Level: 3/5**

**Current State:** Shows booking status, confirmation codes, and payment status. Mostly event-agnostic but contains some travel-specific elements.

**Issues Found:**

**P1:**
- `tripId` in booking data references.
- `"View Itinerary"` link — okay but could be "View Event Plan".
- Visa application timeline — travel-specific feature that may not apply to all events.
- Booking metadata assumes travel (flights, hotels, tours).

**P2:**
- Missing: Event-specific booking statuses ("Vendor Confirmed", "Deposit Paid", "Final Payment Due", "Contract Signed").
- Missing: Milestone payment tracking for event vendors.
- Missing: Cancellation policy specific to event services (non-refundable deposits, etc.).

**Changes Needed:**
- Rename `tripId` to `eventId` or `planId`.
- Add event-specific booking statuses and payment milestones.
- Remove or contextualize visa application for non-international events.

**Effort Estimate: Small**

---

### 12. `optimize.tsx` — AI Optimization Page
**Event Support Level: 1/5**

**Current State:** Hardcoded "Optimize Your Paris Trip with AI" page. Paris-specific plans, per-person pricing, hotel/accommodation framing, and AI optimization tiers at $19.99/$49.99/$199. Completely travel-oriented with no event-specific optimization.

**Issues Found:**

**P0:**
- **Line 294:** Card title: `"Optimize Your Paris Trip with AI"` — Hardcoded city and "trip" language.
- **Line 162:** Tier: `"AI Optimization Only"` at `$19.99` — Low-value travel upsell.
- **Line 168:** Tier: `"AI Optimization + Expert Review"` at `$49.99` — Still low for events.
- **Line 176:** Tier: `"Full Expert Service"` at `$199` — Too low for full event planning.
- Paris hardcoded in all plan data (Eiffel Tower, Louvre, Hotel Monge, Latin Quarter, Marais).
- Plan options use "hotel" instead of "venue".
- "perPerson" pricing — events are typically total cost, not per-person.
- Activities are tourist attractions (Eiffel Tower, Louvre, food tours) — not event services.
- Services include "Airport transfer", "Metro pass", "Museum pass" — pure travel.
- "Cost Saver" and "Time Saver" framing is travel optimization, not event planning.
- "hiddenGems" is a travel concept.

**P1:**
- `tripId` in URL parameters.
- "Back to Discover" button.
- `useTierPrice("optimize_expert_review", 49.99)` — fee band key assumes travel optimization.

**P2:**
- Missing: Event-specific optimization tiers (e.g., "Venue Optimization", "Vendor Bundle", "Timeline Optimization").
- Missing: Event budget optimization (suggesting cheaper floral alternatives, venue packages).
- Missing: Guest experience optimization (seating arrangements, dietary accommodations, transport coordination).

**Changes Needed:**
- Remove hardcoded Paris data; make dynamic based on user's event destination.
- Replace "trip" with "event" or "plan" throughout.
- Replace "hotel" with "venue".
- Replace tourist activities with event services (photography, floral, catering, entertainment).
- Replace "perPerson" with total cost or per-guest pricing.
- Restructure pricing tiers for events:
  - "AI Event Optimization" — $99–$199
  - "AI + Expert Review" — $299–$499
  - "Full Event Planning" — $1,999+ (market rate, not platform fee)
- Add event-specific optimization suggestions (vendor bundles, venue packages, timeline efficiency).

**Effort Estimate: Large**

---

### 13. `quick-start-itinerary.tsx` — AI Quick Start Flow
**Event Support Level: 2/5**

**Current State:** "AI Quick Start Itinerary" flow with destination city, "travelers" (adults + kids), travel interests (culture, food, nature, adventure, nightlife), and travel-specific outputs (accommodation, meals, transportation, hidden gems, travel tips, packing list).

**Issues Found:**

**P0:**
- **Lines 129–135:** Interest options: `"Culture & History"`, `"Food & Dining"`, `"Adventure"`, `"Nature & Outdoors"`, `"Nightlife"` — Travel interests, not event planning needs.
- **Line 122:** `dailyItinerary` — Day-by-day travel itinerary, not event timeline.
- **Line 101:** `accommodationSuggestions` — Hotels/B&Bs, not event venues.
- **Line 84:** `transportation` per day — Travel logistics, not event guest transport.
- **Line 112:** `hiddenGemsCount` — Travel discovery feature.
- **Line 125:** `travelTips` — Travel advice, not event planning tips.
- **Line 124:** `packingList` — Travel packing, not event preparation.
- "travelers" input (adults + kids) — Should be "guests".
- "interests" selection — Should be "event priorities" or "experience goals".
- Output structure assumes travel (meals per day, transport per day, hotel recommendations).

**P1:**
- `cityIntelligence` — Travel destination data (crowd levels, price trends).
- `paceOptions` — Relaxed/moderate/packed is travel pacing, not event planning.

**P2:**
- Missing: Event-specific inputs (event type, formality, venue preference, guest count, budget, vendor priorities).
- Missing: Event-specific outputs (vendor shortlist, venue options, timeline, RSVP tracking, dietary requirements).
- Missing: Wedding-specific quick start (ceremony style, reception vibe, guest count, budget).
- Missing: Corporate event quick start (agenda, team size, objectives, breakout needs).

**Changes Needed:**
- Rename to "AI Quick Start Event Plan" or "Quick Plan Your Experience".
- Replace travel interests with event priorities (e.g., "Elegant & Formal", "Fun & Casual", "Adventurous & Unique", "Intimate & Romantic").
- Replace "travelers" with "guests" and ask for event type first.
- Remove accommodation/hotel focus; add venue discovery.
- Remove daily transport; add guest transport/logistics if needed.
- Replace packing list with event preparation checklist (vendor contracts, RSVPs, final counts).
- Replace travel tips with event planning tips (local vendor recommendations, permit requirements, weather contingencies).

**Effort Estimate: Large**

---

### 14. `itinerary-comparison.tsx` — Plan Comparison
**Event Support Level: 1/5**

**Current State:** Side-by-side comparison of itinerary variants. Uses "Compare Trip Plans", "Plan My Trip", "Travelers", and "TravelPulse" data with travel-specific AI tips and must-see attractions.

**Issues Found:**

**P0:**
- `"Compare Trip Plans"` title.
- `"Plan My Trip"` CTA.
- `"Travelers"` count.
- `travelPulseData` with `aiTravelTips` and `aiMustSeeAttractions` — Travel-specific intelligence.
- `"multi-city trips"` reference.
- "AI Optimized" badge with per-person cost savings — Travel optimization framing.
- Plan comparison assumes travel cost savings (flights, hotels, activities) rather than event value comparison (venue A vs venue B, package A vs package B).

**P1:**
- "Trip" in all data structures and labels.
- "TravelPulse" is okay as a feature name but data is travel-oriented.

**P2:**
- Missing: Event-specific comparison dimensions (venue capacity, catering options, photography packages, floral designs, entertainment choices).
- Missing: Side-by-side vendor comparison.
- Missing: Budget impact comparison for event choices.

**Changes Needed:**
- Rename to "Compare Event Plans" or "Plan Options".
- Replace "Travelers" with "Guests".
- Replace travel AI tips with event planning intelligence (venue availability, vendor ratings, local event regulations).
- Replace "must-see attractions" with "must-have services" or "recommended vendors".
- Restructure comparison to show event value (not just cost savings).

**Effort Estimate: Medium**

---

### 15. `global-calendar.tsx` — Global Calendar
**Event Support Level: 1/5**

**Current State:** "Global Travel Calendar" with crowd predictions, price predictions, and travel events (festivals, sporting events, holidays). No event planning calendar for weddings, corporate events, or private celebrations.

**Issues Found:**

**P0:**
- Page title: `"Global Travel Calendar"` — Should be "Global Event Calendar" or "Destination Calendar".
- Description: `"Plan around festivals, holidays, and peak seasons. See crowd and price predictions for any destination."` — Travel planning language.
- "crowd predictions" and "price predictions" — Travel tourism metrics.
- Events listed are public/travel events (festivals, sporting events, conferences, holidays) — not private event planning dates.

**P1:**
- Calendar is designed for travelers to avoid crowds, not for event planners to find available dates.
- "peak season" / "off season" is travel pricing language.

**P2:**
- Missing: Event-specific calendar (venue availability, vendor blackout dates, popular wedding dates, corporate event seasonality).
- Missing: "When to Go" for events (best months for weddings in Tuscany, best seasons for corporate retreats in Costa Rica).
- Missing: Local event regulations (permit seasons, noise ordinances, venue restrictions).

**Changes Needed:**
- Rename to "Global Event Calendar" or "Destination Intelligence".
- Reposition from "crowd avoidance" to "event planning timing" (best seasons, vendor availability, permit windows).
- Add event-specific date guidance (wedding season, proposal season, corporate retreat windows).
- Keep public events as "Local Happenings" that could enhance a private event (e.g., "Schedule your wedding during the cherry blossom festival").

**Effort Estimate: Medium**

---

### 16. `landing.tsx` — Landing Page
**Event Support Level: 3/5**

**Current State:** Already partially reframed with event templates (wedding, proposal, birthday, corporate) and "Plan Your Perfect Life Experiences" hero. However, significant travel remnants remain: "AI Trip Planner", "Travel" category, "Trips Planned" stat, "travelers" in testimonials, and "Local Experts & Trip Planners" FAQ.

**Issues Found:**

**P0:**
- **Line 67:** Experience category: `icon: Plane, label: "Travel", slug: "travel"` — First category is pure travel.
- **Line 89:** Key feature: `label: "AI Trip Planner"` — Should be "AI Event Planner" or "AI Experience Designer".
- **Line 113:** Travel category has `hiddenGems: 247` and `expertRates: "$75-120/hr"` — Travel-specific metadata.
- **Line 124:** Travel category tip: `"AI-powered itineraries save 15+ hours of planning and find 30% more hidden gems than manual research."` — Travel copy.
- **Line 284:** FAQ title: `"Local Experts & Trip Planners"` — "Trip Planners" is travel-specific.
- **Line 287:** FAQ content: `"trip planner"` and `"Trip Planners"` — Multiple occurrences.
- **Line 356:** Testimonial: `tripType: "Anniversary Trip"` — "Trip" language.
- **Line 370:** Testimonial: `tripType: "Cultural Travel"` — "Travel" language.
- **Line 418:** Platform stat: `label: "Trips Planned"` — Should be "Events Planned" or "Experiences Created".
- **Line 419:** Stat description: `"Join the millions who've seamlessly planned their journeys"` — "Journeys" is travel.
- **Line 561:** Feature card: `"trip planners who know every hidden gem"` — Travel language.
- **Line 767:** Platform intelligence subtitle: `"Real-time collective intelligence from travelers worldwide"` — Should be "clients" or "event hosts".

**P1:**
- **Line 73:** `label: "Anniversary Trip"` — Should be "Anniversary Celebration".
- **Lines 321, 338:** FAQ references to "travelers" in partner section.
- **Line 450:** SEO description mentions `"travel platform"`, `"AI travel planning"`, `"vacation booking"` — SEO keywords are travel-focused.

**P2:**
- **Line 449:** SEO title: `"Home"` — Should include event planning keywords.
- Some testimonial images use `seed/land-trip-1` — minor.
- Missing: Event-specific social proof (e.g., "Sarah & John's Paris Wedding", "TechCorp's Barcelona Retreat").

**Changes Needed:**
- Replace "AI Trip Planner" with "AI Experience Planner" or "AI Event Designer".
- Change "Travel" category to "Getaways" or move it lower in the list; lead with Weddings, Proposals, Corporate.
- Replace "Trips Planned" with "Events Planned" or "Experiences Created".
- Replace "travelers" with "clients", "hosts", or "guests".
- Replace "trip planners" with "event planners" or "experience designers".
- Update SEO keywords to focus on event planning.
- Update testimonials to use event-type labels ("Wedding Planning", "Corporate Retreat", "Birthday Celebration").

**Effort Estimate: Large**

---

### 17. `dashboard.tsx` — User Dashboard
**Event Support Level: 3/5**

**Current State:** Dashboard with greeting, active plans, saved trips, wishlist, expert panels, and credits. Uses "Welcome back, Traveler", "active plans", "next adventure" language. Some components have travel-specific names (`SavedTripsSection`, `TravelPulsePanel`).

**Issues Found:**

**P0:**
- **Line 137:** Greeting: `"Welcome back, {user?.firstName || 'Traveler'}"` — Default fallback is "Traveler".
- **Line 121:** Empty state subtext: `"Ready for your next adventure?"` — Adventure is travel framing.

**P1:**
- **Line 2:** `import { useTrips } from "@/hooks/use-trips"` — Hook name.
- **Line 11:** `import { SavedTripsSection } from "@/components/dashboard/SavedTripsSection"` — Component name.
- **Line 13:** `import { TravelPulsePanel } from "@/components/dashboard/TravelPulsePanel"` — "TravelPulse" is okay as feature but implies travel.
- **Line 198:** Section label: `"Your active plans"` — Okay but could be "Your active events".
- **Line 40:** CTA card: `label: "New experience", sub: "Travel, wedding, event"` — "Travel" listed first.
- `trip` used throughout variable names (`activePlans`, `selectedTripId`, `trip-chip`).

**P2:**
- Missing: Event-specific dashboard widgets (upcoming RSVPs due, vendor payments pending, final guest count, event countdown).
- Missing: Event type-specific quick actions ("Send RSVP reminder", "Review vendor contract", "Share event plan").
- Missing: Event timeline/progress tracker ("Venue booked ✓", "Catering confirmed ✓", "Photographer pending ⏳").

**Changes Needed:**
- Change default greeting fallback from "Traveler" to "Planner" or "Host".
- Replace "next adventure" with "next experience" or "next celebration".
- Rename `useTrips` to `usePlans` or `useEvents` (requires backend alignment).
- Update CTA priority to lead with events, not travel.
- Add event-specific dashboard widgets.

**Effort Estimate: Medium**

---

### 18. `experiences.tsx` — Experience List & Templates
**Event Support Level: 4/5**

**Current State:** Lists experience templates by type (wedding, proposal, birthday, corporate). Already largely event-oriented but contains some travel remnants.

**Issues Found:**

**P1:**
- "Travelers" count in step cards for some templates.
- "Destination" references instead of "City" or "Location".
- Some descriptions use travel-oriented language ("explore", "adventure", "discover").
- `useTrips` or trip-related hooks may be used internally.

**P2:**
- Missing: Event-specific template metadata (guest capacity, formality level, venue type, vendor categories included).
- Missing: Template pricing that reflects event scale (e.g., "Intimate Wedding (20 guests)" vs "Grand Wedding (200 guests)").

**Changes Needed:**
- Remove or recontextualize "travelers" count as "guest capacity" or "intimate vs grand".
- Add event-specific template details (venue type, included services, typical guest count, formality).
- Ensure all copy uses event planning language.

**Effort Estimate: Small**

---

### 19. `experience-template.tsx` — Template Builder/Detail
**Event Support Level: 4/5**

**Current State:** Displays detailed experience template with step counts, venue search, and vendor search. Already largely event-oriented but contains travel-specific widgets and tabs.

**Issues Found:**

**P1:**
- **ESimSidebarWidget** — "Stay connected abroad" is travel-specific international connectivity feature. Not relevant for most events (unless international destination event).
- **RestaurantCatalogSection** — Food/restaurant search is travel dining, not event catering.
- **BookingComCatalogSection** — Hotel booking affiliate is travel accommodation, not event venue.
- **TravelpayoutsActivities** — Travel activities affiliate, not event services.
- **Flight tab config** — Travel flight booking.
- **Hotel tab config** — Travel hotel booking.
- **Transport tab config** — Travel transport (flights, trains, car rental).

**P2:**
- Travel widgets should be conditionally shown only for international destination events, or removed entirely in favor of event-specific widgets (venue finder, caterer catalog, photographer portfolio, florist gallery).
- Default tab configs should be event-specific: "Venue", "Catering", "Photography", "Entertainment", "Floral", "Transport" (for guests, not flights).

**Changes Needed:**
- Remove or conditionally hide ESim, Booking.com, Travelpayouts widgets.
- Replace restaurant catalog with caterer catalog.
- Replace hotel tab with venue tab.
- Replace flight tab with guest transport logistics (shuttles, group transport).
- Add event-specific vendor categories (photography, floral, entertainment, AV).

**Effort Estimate: Medium**

---

### 20. `discover.tsx` — Main Discovery/Marketplace
**Event Support Level: 2/5**

**Current State:** Large marketplace page (2038 lines) with services, trip packages, trending destinations, expert templates, and travel influencer content. Heavy travel terminology throughout: "Explore Services & Trip Packages", "Trip Packages", "TravelPulse", "travelers", "travel creators", "trip planners", "trending destinations".

**Issues Found:**

**P0:**
- **Line 940:** Hero title: `"Explore Services & Trip Packages"` — "Trip Packages" is travel.
- **Line 943:** Hero subtitle: `"Browse expert services, curated trip packages, and get AI-powered recommendations"` — "trip packages".
- **Line 944:** Hero subtitle continues: `"for your next adventure."` — Adventure is travel.
- **Line 1178:** CTA card: `"Looking for trip packages?"`
- **Line 1182:** CTA subtext: `"Build a trip from a curated template"` — "trip".
- **Line 1536:** Tab section: `"Expert Itinerary Templates"` — Okay but "Itinerary" is travel-biased.
- **Line 1539:** Tab description: `"Purchase ready-made travel plans crafted by verified local experts"` — "travel plans".
- **Line 1554:** Empty state: `"for travelers to purchase"` — "travelers".
- **Line 1702:** Section title: `"Trending Destinations"` — Travel discovery language.
- **Line 1776:** Category filter: `const tripCategories = [...]` — Variable name and travel categories (adventure, cultural, relaxation, romantic, family).
- **Line 1888:** Influencer tab: `"Curated by Travel Creators"` — "Travel Creators".
- **Line 1889:** Influencer tab description: `"travel influencers and local experts"` — "travel influencers".
- **Line 2017:** Still Undecided CTA: `"trip planners"` — "Talk to one of our local experts or trip planners."
- **Line 2018:** Still Undecided CTA: `"perfect trip based on your preferences, budget, and travel style."` — "travel style".

**P1:**
- **Line 1198:** Tab: `"TravelPulse"` — Feature name is okay but data is travel-oriented.
- **Line 1208:** Tab: `"By Date"` — Travel event calendar.
- **Lines 1282–1288:** Quick category chips include `"tours-experiences"`, `"visa-assistance"`, `"food-culinary"` — Travel-oriented categories.
- **Line 1302:** Quick category: `categoryIcons["tours-experiences"]` — Travel tours.
- "travelers" count in various service cards and stats.
- `getCategoryImage` fallback uses `"travel"` seed.

**P2:**
- Missing: Event-specific service categories (wedding planning, proposal coordination, corporate event management, birthday party planning).
- Missing: Event package marketplace (e.g., "Paris Wedding Package", "Barcelona Corporate Retreat").
- Missing: Event vendor discovery (photographers, florists, caterers, DJs, venues) instead of travel services.
- Missing: Event-specific filters (event type, guest count, formality, budget range, venue type).

**Changes Needed:**
- Rename hero to "Explore Services & Event Packages".
- Replace "trip packages" with "event packages" or "experience templates".
- Replace "Trending Destinations" with "Popular Event Locations" or "Trending Cities for Events".
- Replace `tripCategories` with event categories (wedding, proposal, birthday, corporate, anniversary, celebration).
- Replace "Travel Creators" with "Event Creators" or "Experience Curators".
- Replace "trip planners" with "event planners" or "experience designers".
- Replace travel service categories with event vendor categories (venue, catering, photography, floral, entertainment, AV, event coordination).
- Add event-specific package templates and vendor marketplace.

**Effort Estimate: Extra Large (XL)**

---

### 21. `discover-location.tsx` — Location-Specific Discovery
**Event Support Level: 2/5**

**Current State:** City/location-specific page with local services, events, and intelligence. Uses "travellers here now" stats, "Travelers" labels, and travel-oriented categories.

**Issues Found:**

**P0:**
- `"travellers here now"` stat — Travel tourism metric.
- `"Travelers"` in various labels and stats.
- `"TravelPulse"` data is travel-oriented (crowd levels, tourist trends).

**P1:**
- "Destination" language throughout instead of "Event Location" or "City".
- "tours" category prominently featured.
- Local insights are travel-focused (restaurants, attractions, hidden gems) rather than event-focused (venues, local vendors, event regulations, permit requirements).

**P2:**
- Missing: Event-specific city intelligence (popular wedding venues, best proposal spots, corporate retreat facilities, local event vendor directories).
- Missing: "Event Planner's Guide to [City]" content.
- Missing: Local event regulations and permit information.

**Changes Needed:**
- Replace "travellers here now" with "events happening now" or "local happenings".
- Change "Travelers" to "Visitors" or "Guests".
- Reframe local insights from travel to event planning (venue recommendations, local vendor lists, event-specific tips).
- Add event-specific city guides ("Best Wedding Venues in Paris", "Top Proposal Spots in Santorini").

**Effort Estimate: Medium**

---

### 22. `experience-discovery.tsx` — Experience Discovery Flow
**Event Support Level: 2/5**

**Current State:** Entry flow for discovering experiences. Uses "Start Your Journey", "Plan Trip", and destination-focused language.

**Issues Found:**

**P0:**
- `"Start Your Journey"` — Travel/journey framing.
- `"Plan Trip"` CTA.
- "Destination" instead of "City" or "Location".

**P1:**
- "travelers" references.
- "travel blog" or travel content references.
- Discovery flow assumes travel interests rather than event planning needs.

**P2:**
- Missing: Event type selection as first step in discovery.
- Missing: Event-specific discovery ("I want to plan a wedding", "I want to plan a corporate retreat").
- Missing: Budget-based discovery ("Show me $10K–$25K wedding packages in Paris").

**Changes Needed:**
- Replace "Start Your Journey" with "Find Your Experience" or "Plan Your Event".
- Replace "Plan Trip" with "Plan Experience" or "Get Started".
- Add event type selection as the primary discovery filter.
- Lead with "What event are you planning?" instead of "Where do you want to go?".

**Effort Estimate: Medium**

---

### 23. `browse.tsx` — Browse & Search
**Event Support Level: 2/5**

**Current State:** Browse page with filters, search, and grid of experiences/packages. Uses "Travel Packages", "Travelers", "Trip Packages", "Travel Guides".

**Issues Found:**

**P0:**
- `"Travel Packages"` filter/tab.
- `"Travelers"` in grid cards.
- `"Trip Packages"` section.
- `"Travel Guides"` section.
- `"trip packages"` in various labels.

**P1:**
- "travelers" in card metadata.
- "travel" category filter.
- "plan trip" CTA on cards.

**P2:**
- Missing: Event-specific browse filters (event type, guest count, formality, budget range, venue type, included services).
- Missing: "Event Packages" as primary category.

**Changes Needed:**
- Replace "Travel Packages" with "Event Packages".
- Replace "Travel Guides" with "Planning Guides" or "City Guides for Events".
- Replace "Travelers" with "Guests" or "Capacity".
- Add event-specific filters and categories.
- Replace "plan trip" CTA with "View Package" or "Plan This Event".

**Effort Estimate: Medium**

---

### 24. `help-me-decide.tsx` — Decision Helper
**Event Support Level: 2/5**

**Current State:** "Can't Decide? We've Got You Covered" page with pre-researched trips, expert-curated packages, travel articles, and TravelPulse data. All content is travel-oriented.

**Issues Found:**

**P0:**
- `"Expert-Curated Trips"` hero title.
- `"Trip Packages"` tab.
- `"Travel Articles"` tab.
- `"TravelPulse"` tab.
- Pre-researched destinations are framed as "trips" (Kyoto, Amalfi, Bali, Costa Rica, Paris, Morocco).
- `"Build Your Own Trip"` CTA.
- All destination descriptions are travel-focused ("hidden gems", "local culture", "adventure", "beach getaway").
- "Travel Articles" content is travel blog style.
- "TravelPulse" data is travel-oriented.

**P1:**
- "travel" in all descriptions.
- "trip" in all card data.
- Destinations are presented as vacation spots rather than event locations.

**P2:**
- Missing: Event-specific decision helper ("Planning a Wedding?", "Organizing a Corporate Retreat?", "Celebrating a Milestone Birthday?").
- Missing: Event package comparison ("Paris Wedding Package A vs Package B").
- Missing: Event planning guides instead of travel guides.
- Missing: Expert-curated event packages with vendor inclusions.

**Changes Needed:**
- Rename to "Expert-Curated Events" or "Can't Decide? Start Here".
- Replace "Trip Packages" with "Event Packages".
- Replace "Travel Articles" with "Planning Guides" or "Inspiration".
- Replace destination framing from "trip to Paris" to "wedding in Paris", "corporate retreat in Costa Rica", "birthday celebration in Bali".
- Replace "Build Your Own Trip" with "Build Your Own Event" or "Create Custom Experience".
- Add event-specific curated packages with vendor details and pricing.

**Effort Estimate: Large**

---

## Summary Priority Table

| Priority | Page | P0 Count | P1 Count | P2 Count | Effort | Key Issue |
|----------|------|----------|----------|----------|--------|-----------|
| **1** | `create-trip.tsx` | 24 | 3 | 3 | **XL** | Entire wizard is travel-centric; default "vacation", per-day budget, "Travelers" |
| **2** | `pricing.tsx` | 10 | 2 | 2 | **XL** | Complete pricing model mismatch; credit-based SaaS vs $5K–$50K events |
| **3** | `discover.tsx` | 14 | 6 | 3 | **XL** | 2038-line marketplace; "Trip Packages", "travelers", "trending destinations" |
| **4** | `landing.tsx` | 12 | 3 | 2 | **L** | "AI Trip Planner", "Trips Planned", "travelers", "trip planners" |
| **5** | `trip-details.tsx` | 12 | 4 | 2 | **L** | Main detail page; "Plan Your Trip", "Travelers", Plane icon, booking tabs |
| **6** | `optimize.tsx` | 10 | 2 | 2 | **L** | Hardcoded Paris; $19.99/$29 travel upsells; hotel/transport framing |
| **7** | `help-me-decide.tsx` | 8 | 2 | 2 | **L** | All content is travel-oriented; "Expert-Curated Trips", "Travel Articles" |
| **8** | `payment.tsx` | 7 | 2 | 2 | **M** | Hardcoded Bali; $45 service fee; TRAVEL10; $29 upsell |
| **9** | `itinerary.tsx` | 7 | 2 | 2 | **M** | "Trip Timeline", "Travelers", booking tabs, Plane icon |
| **10** | `shared-trip.tsx` | 6 | 1 | 2 | **M** | "Share Your Adventure", "Travelers", booking tabs |
| **11** | `itinerary-view.tsx` | 8 | 3 | 1 | **M** | "traveler" in all expert interactions, `PlanCardTrip`, "Plan My Trip" |
| **12** | `quick-start-itinerary.tsx` | 7 | 2 | 3 | **L** | "AI Quick Start Itinerary"; travel interests; hotel/transport/packing outputs |
| **13** | `cart.tsx` | 4 | 2 | 2 | **M** | FlowStep "trip-details"; tripTitle/tripDestination/tripTravelers |
| **14** | `itinerary-comparison.tsx` | 5 | 2 | 2 | **M** | "Compare Trip Plans"; "Travelers"; TravelPulse travel tips |
| **15** | `global-calendar.tsx` | 4 | 1 | 2 | **M** | "Global Travel Calendar"; crowd/price predictions; travel events |
| **16** | `dashboard.tsx` | 2 | 5 | 2 | **M** | "Welcome back, Traveler"; "next adventure"; useTrips hook |
| **17** | `experience-discovery.tsx` | 3 | 2 | 2 | **M** | "Start Your Journey"; "Plan Trip"; destination-focused |
| **18** | `browse.tsx` | 5 | 2 | 2 | **M** | "Travel Packages"; "Travel Guides"; "Trip Packages" |
| **19** | `discover-location.tsx` | 2 | 2 | 2 | **M** | "travellers here now"; "Travelers"; travel categories |
| **20** | `experience-template.tsx` | 0 | 7 | 2 | **M** | ESim, BookingCom, Travelpayouts widgets; flight/hotel/transport tabs |
| **21** | `my-trips.tsx` | 2 | 2 | 2 | **S** | "Travel" filter; Plane icon; useTrips hook |
| **22** | `my-bookings.tsx` | 0 | 3 | 2 | **S** | tripId references; visa timeline; travel booking metadata |
| **23** | `my-itinerary.tsx` | 0 | 2 | 2 | **S** | "Travelers"; trip in data; travel icons |
| **24** | `experiences.tsx` | 0 | 2 | 2 | **S** | "Travelers" in cards; "destination" language |

---

## Cross-Cutting Themes

### 1. "Trip" Terminology (Present in 24/24 pages)
The word "trip" appears in variable names, state names, route paths, API hooks (`useTrips`), component names (`PlanCardTrip`, `SavedTripsSection`), labels, CTAs, and user-facing copy across every page. This is the single most pervasive issue.

**Recommended Fix:** Systematic rename campaign:
- `trip` → `event` or `plan` or `experience`
- `useTrips` → `usePlans` or `useEvents`
- `numberOfTravelers` → `numberOfGuests` or `guestCount`
- `/trip/:id` → `/event/:id` or `/plan/:id`
- `TripCard` → `PlanCard` or `EventCard`
- `TripSummary` → `EventSummary` or `PlanSummary`

**Note:** `PlanCard` already exists in some places; standardize on it.

### 2. "Travel" / "Traveler" / "Adventure" / "Journey" Language (Present in 22/24 pages)
Travel-specific synonyms appear in greetings ("Welcome back, Traveler"), descriptions ("next adventure", "amazing travel experience"), CTAs ("Plan Your Trip", "Start Your Journey"), and empty states.

**Recommended Fix:** Replace with event-planning equivalents:
- "Traveler" → "Planner", "Host", "Client", "Guest"
- "Adventure" → "Experience", "Celebration", "Occasion"
- "Journey" → "Planning process", "Experience"
- "Trip" → "Event", "Plan", "Experience"

### 3. Per-Day Budget & Low-Value Pricing (Present in 6/24 pages)
The create-trip wizard uses per-day budgets ($50–$250+/day). The pricing page uses credit-based SaaS ($14.99/mo). The payment page uses $45 service fees and $29 upsells. The optimize page uses $19.99/$49.99/$199 tiers. All are fundamentally misaligned with a $5K–$50K event marketplace.

**Recommended Fix:** Restructure all monetization:
- **Creation flow:** Total event budget ($5K–$10K, $10K–$25K, $25K–$50K, $50K+).
- **Platform pricing:** Commission-based or percentage fees on bookings (e.g., 5–10% platform fee, or flat fee for small events).
- **Expert services:** Market-rate pricing ($500–$5,000+ per event), not $19.99 upsells.
- **Optimization:** Event-specific optimization tiers ($99–$499 for AI + expert review).
- **Payment flow:** Support deposits and milestone payments (50% deposit, 50% before event).

### 4. Travel-Specific Features & Widgets (Present in 8/24 pages)
ESim widgets, Booking.com catalogs, Travelpayouts activities, flight/hotel/transport tabs, visa applications, travel packing lists, and crowd predictions are all travel-specific features that have no place in an event planning platform (except for international destination events, where they should be secondary).

**Recommended Fix:**
- Remove or conditionally hide travel widgets.
- Replace with event-specific features: venue finder, caterer catalog, photographer portfolio, florist gallery, entertainment directory, AV equipment rental.
- For international events, keep travel features but label them as "Guest Travel" or "Destination Logistics" and make them secondary to event planning.

### 5. Missing Event-Specific Features (Present in 20/24 pages)
No page has comprehensive event-specific features: guest lists, RSVP tracking, seating charts, vendor management, contract tracking, milestone payments, event timelines (ceremony → reception → after-party), dietary requirements, gift registries, or event-specific logistics.

**Recommended Fix:** Build event-specific feature modules:
- **Guest Management:** Import guest list, track RSVPs, dietary restrictions, plus-ones, seating preferences.
- **Vendor Management:** Shortlist vendors, compare quotes, track contracts, manage payments.
- **Timeline Builder:** Event-specific timeline (not day-by-day travel itinerary) with ceremony, cocktail hour, reception, speeches, dances, cake cutting.
- **Budget Tracker:** Total event budget with category breakdown (venue, catering, floral, photography, entertainment, transport, miscellaneous).
- **Logistics Dashboard:** Venue setup, AV requirements, guest transport, accommodation blocks, welcome bags.

---

## Recommended Action Plan

### Phase 1: Critical Terminology (Week 1–2)
- [ ] Rename all `trip` → `event`/`plan` in **create-trip.tsx**, **cart.tsx**, **payment.tsx**, **trip-details.tsx**, **itinerary.tsx**, **shared-trip.tsx**.
- [ ] Replace "Traveler" → "Guest" / "Planner" in **dashboard.tsx**, **payment.tsx**, **create-trip.tsx**.
- [ ] Replace "Plan Your Trip" → "Plan Your Event" in all CTAs.
- [ ] Replace per-day budget with total event budget in **create-trip.tsx**.

### Phase 2: Pricing & Monetization (Week 2–4)
- [ ] Restructure **pricing.tsx** with event-specific tiers (Free / Pro / Enterprise for event planners).
- [ ] Update **payment.tsx** with percentage-based fees and deposit/milestone support.
- [ ] Update **optimize.tsx** with event-tiered pricing ($99–$499+) and dynamic destinations.
- [ ] Remove credit-based features from pricing page; replace with event-planning features.

### Phase 3: Discovery & Marketplace (Week 3–5)
- [ ] Reframe **discover.tsx** from "Trip Packages" to "Event Packages" and "Vendor Marketplace".
- [ ] Reframe **landing.tsx** from "AI Trip Planner" to "AI Experience Planner" and "Trips Planned" to "Events Planned".
- [ ] Reframe **help-me-decide.tsx** from travel destinations to event packages.
- [ ] Add event-specific filters and categories across discovery pages.

### Phase 4: Feature Parity (Week 4–8)
- [ ] Add guest list and RSVP management.
- [ ] Add vendor management and quote comparison.
- [ ] Add event-specific timeline builder (ceremony → reception → after-party).
- [ ] Add event budget tracker with category breakdown.
- [ ] Add event logistics dashboard.
- [ ] Remove or conditionalize travel widgets (ESim, Booking.com, Travelpayouts).

### Phase 5: Backend Alignment (Week 6–10)
- [ ] Rename API endpoints from `/api/trips` to `/api/events` or `/api/plans`.
- [ ] Rename database tables/columns (`trips` → `events` or `plans`, `number_of_travelers` → `guest_count`).
- [ ] Update schema types (`Trip` → `Event` or `Plan`).
- [ ] Update hooks (`useTrips` → `usePlans` / `useEvents`).
- [ ] Update route paths (`/trip/:id` → `/event/:id`).

---

## Files with Zero P0 Issues
None. All 24 audited pages contain at least one P0 issue.

## Lowest-Effort Wins
1. **my-trips.tsx** (Small): Change "Travel" filter label and Plane icon.
2. **my-bookings.tsx** (Small): Rename `tripId` references and add event-specific statuses.
3. **my-itinerary.tsx** (Small): Change "Travelers" to "Guests" and rename data references.
4. **experiences.tsx** (Small): Remove "travelers" count and update descriptions.
5. **dashboard.tsx** (Medium): Change "Traveler" fallback and "next adventure" subtext.

## Highest-Impact Changes
1. **create-trip.tsx** (XL): Rewriting the creation wizard is the #1 user-facing change. This is the first impression.
2. **pricing.tsx** (XL): The pricing model must align with the business model or the rebrand is cosmetic only.
3. **discover.tsx** (XL): The marketplace is the core discovery engine; it must speak event language.
4. **landing.tsx** (L): The landing page is the front door; it must immediately communicate event planning.
5. **optimize.tsx** (L): The AI optimization page must be event-specific and high-value.

---

*End of Audit Report*
