# EXPERT & PROVIDER Pages Audit — Travel → Experience Planning Rebrand Gap Analysis

**Date:** 2025-06-13  
**Scope:** 33 pages under `client/src/pages/` (Expert & Provider surfaces)  
**Auditor:** Kimi Code  
**Goal:** Identify gaps between current "travel" branding and the reframed "Experience Planning" business model (weddings, birthdays, proposals, corporate events in foreign cities).

---

## Methodology

For each page, we inspected:
1. **Trip terminology** — any use of "trip", "travel", "traveler", "itinerary", "destination" in UI copy or data models
2. **Travel-specific expert roles** — role labels, CTAs, and descriptions that assume travel
3. **Missing event planner features** — fields, filters, or workflows absent for weddings/corporate/etc.
4. **Earnings model misalignment** — pricing, commission, or revenue language that reflects low-ticket travel rather than high-ticket events
5. **Service template awareness** — whether templates/content types support event planning
6. **Contract category specificity** — whether categories are travel-centric vs. event-centric

**Priority definitions:**
- **P0** — Critical rebrand blocker. User-facing travel language that directly contradicts the event-planning positioning. Must fix before launch.
- **P1** — Important. Confusing or limiting for event planners. Should fix in next sprint.
- **P2** — Minor. Internal or low-visibility terminology. Nice-to-have cleanup.

---

## Page-by-Page Audit

---

## Page: `experts.tsx` (public expert marketplace)

### Current State
Public-facing expert discovery page. Supports three role tabs: `travel_expert`, `local_expert`, `event_planner`. AI matching sends `tripDetails` with `travelers`, `destination`, `dates`. CTAs and descriptions are overwhelmingly travel-framed.

### Issues Found
- **P0** — Title "Trip Planners" for `travel_expert` tab at line 112. In a rebranded marketplace, this role label should be neutral or event-capable.
- **P0** — AI Matching hardcodes `tripDetails` object with `destination`, `dates`, `travelers` at lines 208–214. No event-equivalent fields (event type, guest count, venue preference).
- **P0** — "Work with a Trip Planner" heading at line 315. This is the primary H1 for the default tab.
- **P0** — "Are You a Trip Planner?" CTA heading at line 828 and "Become a Trip Planner" at line 830. This is the expert recruitment banner on the same page that also lists event planners.
- **P1** — "Connect with verified local experts who know their destinations inside out" at line 325. "Destinations" is travel-centric.
- **P1** — Destination filter dropdown and search placeholder "Search by name, destination, or specialty" at line 620. No event-type filter.
- **P2** — "Share your city knowledge, earn money, and help travelers discover the best of your destination" at line 841. Travel-specific but only in the local-expert CTA.

### Changes Needed
- Rename `travel_expert` display label to "Experience Planner" or "Trip & Event Planner" depending on capability.
- Replace AI Matching `tripDetails` with a polymorphic `experienceDetails` object that supports both `trip` and `event` shapes.
- Add event-type filter (Wedding, Proposal, Corporate, Birthday) alongside destination filters.
- Update all CTA headings to be role-agnostic: "Plan Your Experience" instead of "Work with a Trip Planner".

### Effort Estimate
**Medium–Large** (3–5 days). Requires UI copy changes, data model extension for AI matching, and new filter logic.

---

## Page: `expert-detail.tsx` (public expert profile)

### Current State
Public expert profile page. Displays bio, stats, reviews, and booking CTA. Has `event_planner` role support but defaults to travel framing.

### Issues Found
- **P0** — Bio fallback: "Experienced local expert ready to help plan your perfect trip." at line 146. If an event planner has no bio, this is the default.
- **P1** — "{expert.completedTrips || 0} trips completed" at line 231. Event planners complete events, not trips. Needs role-aware label.
- **P1** — No event-specific portfolio section. No fields for "Past events planned", "Event types", "Guest count range", "Venue partnerships".
- **P2** — No visual differentiation between a travel expert and an event planner beyond the role badge.

### Changes Needed
- Make bio fallback role-aware: "plan your perfect experience" for generic, or "plan your perfect wedding/event" for event planners.
- Rename `completedTrips` to `completedProjects` or make the label conditional based on role.
- Add event portfolio section with event-type tags, past event photos, and guest count metrics.

### Effort Estimate
**Medium** (2–3 days). Requires conditional rendering logic and new profile fields.

---

## Page: `expert/workspace.tsx` (itinerary workspace)

### Current State
Core expert working tool. Built around day-by-day itinerary planning. Left rail shows "Trip Overview", "Trip stats", "Days planned", "Total items". Uses `PlanCard` with `trip` prop. Commission card uses `totalGross` / `expertShare`.

### Issues Found
- **P0** — "Itinerary Workspace" header at line 632. This is the page title. For event planners, this should be "Event Workspace" or "Experience Workspace".
- **P0** — "Trip Overview" label at line 731 and "Trip stats" at line 729. The entire workspace is structured around "trips".
- **P0** — `PlanCard` receives `trip` prop and `role="expert"`, `stage="full"` at line 912. The component API assumes a trip object.
- **P1** — "Days planned" and "Total items" at lines 755, 759. Event planners need "Event Timeline", "Run-of-Show", "Vendor count", "Guest list".
- **P1** — Browse tab searches `/api/search/experiences` at line 454. This is fine semantically, but the UI still frames everything as a trip.
- **P1** — Commission card uses `totalGross`, `expertShare`, `revenueShareRate` at lines 767–779. Functional, but the copy around it should mention "experience" or "event" rather than "trip".
- **P2** — No event-specific workspace mode. Missing: vendor coordination panel, guest list management, budget breakdown by category (venue, catering, decor), RSVP tracker.

### Changes Needed
- Rename page title and all "Trip" labels to "Experience" or make them role-conditional.
- Extend `PlanCard` to accept `experience` prop or make it polymorphic.
- Add event-specific workspace modules: timeline builder, vendor tracker, guest list, budget by category.
- Keep the commission logic but update surrounding copy.

### Effort Estimate
**Large** (5–7 days). This is the most complex expert page. Requires significant UI restructuring and new sub-components.

---

## Page: `expert/dashboard.tsx` (expert home)

### Current State
Expert landing page after login. Shows stats, quick actions, messages, and recent assignments. Query key is `/api/expert/assigned-trips`.

### Issues Found
- **P0** — Quick action links to "Itinerary" at lines 213, 275, 315, 317. For event planners, this should be "Event Plan" or "Experience Plan".
- **P0** — Query key `/api/expert/assigned-trips` at line 92. This API naming is baked into the frontend. The UI reflects trip-centric data.
- **P1** — No event-specific quick actions. Missing: "Create Event Timeline", "Manage Vendor List", "Send Guest Invitation".
- **P2** — Stats cards assume trip volume (e.g., "Itinerary" count). Should be generic "Projects" or role-aware.

### Changes Needed
- Rename "Itinerary" quick action to "Plan Experience" or make it role-conditional.
- Add event planner quick actions when the expert role is `event_planner`.
- Either rename the API endpoint or add a frontend abstraction layer.

### Effort Estimate
**Medium** (2–3 days). Mostly UI copy and conditional quick actions.

---

## Page: `expert/assigned-trips.tsx` (trip assignment list)

### Current State
Lists trips assigned to the expert. Interface is entirely trip-shaped: `trip_id`, `trip_title`, `destination`, `start_date`, `end_date`, `traveler_name`.

### Issues Found
- **P0** — Page title "Assigned Trips" at line 138.
- **P0** — Data model: `trip_id`, `trip_title`, `destination`, `traveler_name` at lines 31–35.
- **P0** — Query key `/api/expert/assigned-trips` at line 87 and `/api/trips/${tripId}/suggestions` at lines 92, 98.
- **P1** — No event-specific fields. No `event_type`, `guest_count`, `venue`, `event_date` (singular).
- **P2** — "When travelers assign you to their trip, they'll appear here" at line 162.

### Changes Needed
- Rename to "Assigned Projects" or "Assigned Experiences".
- Extend the `AssignedTrip` interface to include event fields or create a polymorphic `AssignedExperience` type.
- Update API keys to `/api/expert/assigned-experiences` or keep backwards-compatible aliases.
- Add event-type badge and guest count to the list cards.

### Effort Estimate
**Medium** (2–3 days). Requires type changes and API key updates.

---

## Page: `expert/clients.tsx` (client list)

### Current State
Groups assigned trips by traveler to build a client list. Shows "Trips" tab and "Traveler" labels. Has event type icons (`proposal`, `anniversary`, `birthday`, `corporate`) but buries them.

### Issues Found
- **P0** — "Trips" tab label at line 262.
- **P1** — "Traveler" as default client name fallback at line 69. Should be "Client" or "Guest of Honor".
- **P1** — Status label: "Currently traveling" / "Planning phase" at line 73. For events: "Event day" / "Planning phase".
- **P1** — Event type icons exist but are not prominently displayed. The primary grouping is by trip, not by event type.
- **P2** — `trip` variable used throughout (lines 56–84).

### Changes Needed
- Rename "Trips" to "Projects" or "Events".
- Make client name fallback role-aware.
- Update status labels to be event-compatible.
- Surface event type icons in the client card header.

### Effort Estimate
**Small–Medium** (1–2 days).

---

## Page: `expert/client-detail.tsx` (client detail)

### Current State
Shows mock client detail with `tripTitle` and trip-focused chat. Link back to `/expert/assigned-trips`.

### Issues Found
- **P0** — `tripTitle: "Kyoto Cherry Blossom Experience"` at line 62. The entire mock data object is trip-shaped.
- **P0** — Chat message: "Hi! I'm so excited about the Kyoto trip." at line 81.
- **P1** — Link to `/expert/assigned-trips` at lines 140, 191.
- **P2** — No event-specific client details: guest list, RSVP status, vendor contacts, budget approval status.

### Changes Needed
- Replace mock data with event-shaped mock data for event planner context.
- Rename `tripTitle` to `experienceTitle` or `eventTitle`.
- Add event-specific detail sections.
- Update link to `/expert/assigned-experiences` or keep alias.

### Effort Estimate
**Small** (1 day). Mostly mock data and copy.

---

## Page: `expert/messages.tsx` (expert messages)

### Current State
Shows client actions and links to trip workspaces. Data model is trip-shaped.

### Issues Found
- **P0** — `trip_id`, `trip_title`, `destination`, `traveler_name` at lines 13–18.
- **P0** — "Open chat or jump directly to a trip workspace." at line 59.
- **P0** — Query key `/api/expert/assigned-trips` at line 29.
- **P1** — "No active assigned trips found" at line 99.
- **P2** — Links to `/expert/assigned-trips` at line 101 and `/expert/workspace/${trip.trip_id}` at line 131.

### Changes Needed
- Rename data model fields to `experience_id`, `experience_title`, `client_name`.
- Update copy to "experience workspace".
- Update query keys and route links.

### Effort Estimate
**Small–Medium** (1–2 days).

---

## Page: `expert/bookings.tsx` (booking management)

### Current State
Manages bookings. Hardcodes `VisaBookingMetadata` interface, `VISA_STATUS_OPTIONS`, and uses `Plane` icon for visa cases. No event-specific booking metadata.

### Issues Found
- **P0** — `VisaBookingMetadata` interface at lines 47–58. This is a travel-specific data model hardcoded into the booking page.
- **P0** — `VISA_STATUS_OPTIONS` at lines 71–77. Visa tracking is irrelevant for weddings and corporate events.
- **P0** — `Plane` icon labels "Visa" and "Visa Cases" at lines 394, 442, 482, 551.
- **P1** — No event-specific booking metadata: `guestCount`, `cateringRequirements`, `avNeeds`, `setupTime`, `breakdownTime`.
- **P2** — `bookingMetadata?: VisaBookingMetadata` at line 67. The optional type is travel-only.

### Changes Needed
- Remove `VisaBookingMetadata` from the expert-facing booking page (or make it conditional for travel experts only).
- Add `EventBookingMetadata` with guest count, catering, A/V, setup/breakdown times.
- Replace `Plane` icon with event-appropriate icons (e.g., `Users` for guest count, `Mic` for A/V).
- Make booking metadata type a union: `TravelBookingMetadata | EventBookingMetadata`.

### Effort Estimate
**Medium** (2–3 days). Requires new interfaces and conditional rendering.

---

## Page: `expert/booking-partners.tsx` (affiliate partners)

### Current State
Lists affiliate booking partners (hotels, flights, etc.). Commission tracked via Travelpayouts.

### Issues Found
- **P1** — Travelpayouts is a travel-specific affiliate platform. Name appears at lines 321, 469, 471, 472. For event planners, this partner is irrelevant.
- **P1** — Partner categories are travel-centric (flights, hotels, car rentals). No event vendor partners (catering, florists, photographers, venues).
- **P2** — Commission structure mentions "booking fee" and "Travelpayouts marker" which is travel-specific terminology.

### Changes Needed
- Add event vendor partner categories (catering, decor, photography, venues).
- Make Travelpayouts section conditional for travel experts only.
- Add event vendor affiliate integrations or manual vendor referral tracking.

### Effort Estimate
**Medium** (2–3 days). Requires new partner categories and conditional sections.

---

## Page: `expert/services.tsx` (expert service management)

### Current State
Expert's own service dashboard. Lists services, analytics, and templates. Generic service management UI.

### Issues Found
- **P2** — Banner shows role label (e.g., "You are a Travel Advisor") at lines 304–309. If the role is `travel_expert`, this is travel-specific. If `event_planner`, it shows correctly. This is acceptable but the template copy could be more event-aware.
- **P2** — "No templates tailored to your role yet" at line 332. Template system may not have event planner templates.

### Changes Needed
- Ensure template system provides event planner templates (e.g., "Wedding Planning Package", "Corporate Retreat Coordination").
- Otherwise, this page is largely rebrand-compatible.

### Effort Estimate
**Small** (0.5 day). Template availability is backend/content issue.

---

## Page: `expert/service-wizard.tsx` (service creation wizard)

### Current State
Wizard for creating new services. Has delivery method steps but assumes travel consultation.

### Issues Found
- **P0** — Placeholder: "e.g., Trip Planning Consultation" at line 327.
- **P1** — "Detailed itinerary, booking links, local recommendations" at line 602. This is the deliverable example text.
- **P1** — "Add curated insider annotations to every itinerary stop" at line 613.
- **P2** — Delivery methods include "video", "in-person", "document" which are generic and work for events too.

### Changes Needed
- Replace placeholder with event examples: "e.g., Wedding Coordination Package", "Corporate Event Planning".
- Update deliverable examples to include event-specific items: "venue walkthrough, vendor coordination, run-of-show timeline, guest list management".
- Add event-specific deliverable presets.

### Effort Estimate
**Small** (1 day). Copy and placeholder changes.

---

## Page: `expert/templates.tsx` (itinerary templates)

### Current State
Expert creates and manages itinerary templates. Entirely travel-shaped.

### Issues Found
- **P0** — "Itinerary Templates" tab at line 251 and heading at line 300.
- **P0** — "Create a ready-made travel itinerary that travelers can purchase" at line 311.
- **P0** — "Duration (days)" field at line 356. Events are measured in hours, not days.
- **P1** — Categories: adventure, cultural, luxury, romantic, business. No wedding, corporate, birthday, proposal categories.
- **P2** — "You'll earn 80% of the sale price" — generic but framed around travel template sales.

### Changes Needed
- Rename to "Experience Templates" or "Event Templates".
- Add event template types: "Wedding Timeline", "Corporate Retreat Agenda", "Birthday Party Run-of-Show".
- Replace "Duration (days)" with "Duration (hours / days)" depending on template type.
- Add event-specific fields: guest count range, venue type, vendor checklist.

### Effort Estimate
**Medium** (2–3 days). Requires new template types and form fields.

---

## Page: `expert/content-studio.tsx` (content dashboard)

### Current State
Expert content creation dashboard. Content types are all travel: `travel-guide`, `itinerary`, `food-guide`, `hotel-guide`, `tips-tricks`, `story`.

### Issues Found
- **P0** — Content types: `travel-guide`, `itinerary`, `food-guide`, `hotel-guide`, `tips-tricks` at lines 94–102. Zero event content types.
- **P0** — Default content type is `travel-guide` at line 181.
- **P0** — Hashtag presets include `#travelguide`, `#traveltips`, `#tripplanning`, `#travelhacks` at lines 227–235.
- **P1** — No event content types: `wedding-guide`, `corporate-event-guide`, `proposal-guide`, `birthday-party-guide`, `vendor-guide`.
- **P2** — Description: "Comprehensive destination guides", "Day-by-day travel plans" at lines 94–99.

### Changes Needed
- Add event content types: `wedding-guide`, `corporate-event-guide`, `proposal-guide`, `birthday-party-guide`, `vendor-guide`, `event-timeline`.
- Add event-specific hashtags: `#weddingplanning`, `#corporateevents`, `#eventplanner`.
- Update descriptions to be inclusive: "Comprehensive destination and event guides".

### Effort Estimate
**Medium** (2–3 days). Requires new content type definitions and UI tabs.

---

## Page: `expert/content-create.tsx` (content editor)

### Current State
Content creation/editing page. Content types are travel-only. "Destination" field is mandatory-ish.

### Issues Found
- **P0** — Default type param is `travel-guide` at line 33.
- **P0** — Rich text types: `travel-guide`, `hidden-gem`, `restaurant-review`, `hotel-review`, `activity-recommendation`, `safety-tips` at lines 125–131.
- **P0** — Template types: `packing-list`, `budget-breakdown`, `day-itinerary` at line 133. No event templates.
- **P1** — "Share your knowledge with travelers" at line 187.
- **P1** — "Destination" field at line 242. For event content, this is less relevant than "Venue" or "City".
- **P2** — Tags placeholder: `travel, budget, adventure` at line 316.

### Changes Needed
- Add event content types to the editor.
- Replace default type with `experience-guide` or make it role-aware.
- Update tags placeholder to include event keywords.
- Add "Venue / City" field alongside or instead of "Destination" for event content.

### Effort Estimate
**Medium** (2–3 days).

---

## Page: `expert/analytics.tsx` (analytics dashboard)

### Current State
Expert analytics with income streams, benchmarks, and upsells. Values and labels are calibrated for low-ticket travel.

### Issues Found
- **P0** — "Avg Booking Value $350" benchmark at line 433. This is far too low for weddings ($5K–$50K) and corporate events ($10K+).
- **P0** — "Peak Travel Season" at line 1102. Should be "Peak Event Season" or season-aware for events.
- **P1** — Passive income stream: "Itinerary Templates" at line 249. Should include "Event Templates" and "Vendor Guides".
- **P1** — Upsells: "Add Transportation Service", "Offer Photography Package", "Premium Concierge Add-on" at lines 1032–1040. These are travel upsells. For events: "Add Catering Coordination", "Venue Scouting Service", "Guest List Management".
- **P2** — "Conversion Rate 55%" at line 436. This benchmark may not apply to high-ticket events with longer sales cycles.

### Changes Needed
- Make benchmarks role-aware: event planners see "Avg Project Value $8,500" instead of "Avg Booking Value $350".
- Add event-specific income streams and upsells.
- Update seasonal demand to reflect event seasons (wedding season, holiday party season).

### Effort Estimate
**Medium** (2–3 days). Requires new data mappings and conditional UI.

---

## Page: `expert/revenue-optimization.tsx` (revenue tips)

### Current State
Suggests pricing and upsell strategies. All values are trip-based and low-ticket.

### Issues Found
- **P0** — Suggested pricing: `$75–$150/hour` at line 191. Event planners charge $500–$2,000/hour or flat fees of $5K–$20K.
- **P0** — Upsell potentials: `+$180/trip` at line 205, `+$250/booking` at line 213, `+$400/trip` at line 221. These are trivial for events.
- **P1** — Passive income: "Itinerary Templates" at line 131. Missing "Event Planning Packages", "Vendor Coordination Guides".
- **P2** — No wedding/package pricing tiers ($5K, $10K, $25K packages).

### Changes Needed
- Make pricing suggestions role-aware. Event planners see package pricing ($5K–$25K) rather than hourly rates.
- Add event-specific upsells: "Venue Scouting (+$1,500)", "Full Day Coordination (+$2,500)", "Vendor Management (+$1,000)".
- Add package tier recommendations.

### Effort Estimate
**Medium** (2–3 days). Requires conditional logic and new data.

---

## Page: `expert/earnings.tsx` (earnings dashboard)

### Current State
Shows earnings, revenue share, and transactions. Generic but hardcodes 75/25 split.

### Issues Found
- **P1** — `shareRate = summary?.revenueShareRate ?? 0.75` at line 92. Hardcoded fallback to 75%. For high-ticket events, the platform may want a different split (e.g., 85/15 or tiered).
- **P2** — "Gross Booking Value" at line 151. Fine, but "Gross Project Value" would be more event-neutral.
- **P2** — Otherwise generic and largely compatible.

### Changes Needed
- Ensure `revenueShareRate` is fetched from backend and can vary by role or service tier. Do not hardcode 75% fallback.
- Update label to "Gross Project Value" for event planners.

### Effort Estimate
**Small** (0.5–1 day).

---

## Page: `expert/performance.tsx` (performance metrics)

### Current State
Shows rating, response rate, completion rate, repeat clients. Generic metrics, no travel-specific language.

### Issues Found
- **P2** — Achievements: "50+ repeat clients", "100 five-star reviews" at lines 52–53. These are fine for events too.
- **P2** — No event-specific achievements: "10+ Weddings Planned", "Corporate Client Retention".

### Changes Needed
- Add event-specific achievements when role is `event_planner`.
- Otherwise, this page is **rebrand-compatible**.

### Effort Estimate
**Small** (0.5 day).

---

## Page: `expert/profile.tsx` (expert own profile editor)

### Current State
Expert edits their public profile. Role selection includes `event_planner`. Some fields are travel-centric.

### Issues Found
- **P1** — "Travel Advisor" label for `travel_expert` at lines 42, 386. This is the default role display.
- **P1** — "Help travellers find the right local expert for their area" at line 524. "Travellers" is travel-specific.
- **P1** — Expert Notes: "private annotations you add to each itinerary stop" at line 720. Should be "each experience stop" or "each event timeline entry".
- **P2** — Specialties input is freeform but no event-specific placeholder or suggestions.
- **P2** — Neighborhoods section is great for local experts but less relevant for event planners who may work across a city.

### Changes Needed
- Update "Travel Advisor" to "Experience Planner" or make it conditional.
- Replace "travellers" with "clients" or "guests".
- Update Expert Notes description to be event-compatible.
- Add event-specific specialty suggestions: "Wedding Planning", "Corporate Events", "Proposal Coordination".

### Effort Estimate
**Small–Medium** (1–2 days).

---

## Page: `expert/verification.tsx` (verification & payouts)

### Current State
Identity verification and Stripe Connect setup. Generic functionality.

### Issues Found
- **P2** — "build trust with travellers" at line 98. Should be "clients" or "guests".
- **P2** — Otherwise generic and rebrand-compatible.

### Changes Needed
- Replace "travellers" with "clients".

### Effort Estimate
**Small** (0.5 day).

---

## Page: `expert/settings.tsx` (settings)

### Current State
Notification settings, availability, response templates, preferences, security, leaderboard.

### Issues Found
- **P1** — "Itinerary Update" notification at line 208. Should be "Experience Update" or "Plan Update".
- **P1** — Response template: "Thank you for reaching out! I'm excited to help plan your trip." at line 220. Travel-specific default template.
- **P2** — "On Vacation" availability status at line 387. Acceptable but could be "Unavailable".
- **P2** — "Vacation Mode" toggle. Fine, but event planners may prefer "Busy Season" or "Fully Booked".

### Changes Needed
- Rename "Itinerary Update" to "Plan Update" or "Experience Update".
- Update default response templates to be role-aware or generic: "plan your experience".
- Add "Fully Booked" status option.

### Effort Estimate
**Small** (1 day).

---

## Page: `expert/leaderboard.tsx` (leaderboard)

### Current State
Placeholder page. "Leaderboard Coming Soon".

### Issues Found
- **P2** — "Expert rankings based on ratings, response time, and client satisfaction" at line 22. Generic enough.
- **P2** — No event-specific leaderboard categories (e.g., "Top Wedding Planner", "Top Corporate Event Planner").

### Changes Needed
- Add role-specific leaderboard categories when implemented.
- Otherwise, this page is **rebrand-compatible**.

### Effort Estimate
**Small** (0.5 day).

---

## Page: `expert/contract-categories.tsx` (contract categories)

### Current State
Hardcoded contract categories. Includes "Romantic Events" and "Celebrations" but subcategories are travel-framed.

### Issues Found
- **P0** — "Vacation Planning" at line 41. This is the first category.
- **P1** — "Bachelor Parties", "Group Adventures" at line 84. These are travel activities, not event planning categories.
- **P1** — "Business travel and corporate retreats" at line 90. Should be "Corporate Events and Retreats" without "travel".
- **P1** — Revenue figures are low ($8.5K–$45K). While $45K is event-range, the framing is vacation packages.
- **P2** — Missing event-specific subcategories: "Wedding Reception", "Proposal Setup", "Birthday Party", "Conference", "Gala".

### Changes Needed
- Rename "Vacation Planning" to "Experience Planning" or split into "Travel Experiences" and "Event Experiences".
- Update subcategories to be event-centric: "Weddings", "Proposals", "Birthdays", "Corporate Retreats", "Conferences", "Gala Dinners".
- Remove "Bachelor Parties" and "Group Adventures" as standalone categories unless under "Travel Experiences".

### Effort Estimate
**Medium** (2 days). Requires copy and category restructure.

---

## Page: `expert/custom-services.tsx` (custom services)

### Current State
Create and manage custom services. Generic UI with title, description, price, duration, deliverables.

### Issues Found
- **P2** — No event-specific fields: `eventType`, `guestCapacity`, `venueType`, `setupTime`.
- **P2** — Title placeholder: "Private Food Tour in Barcelona" at line 234. Could include event examples.
- **P2** — Otherwise largely generic and **rebrand-compatible**.

### Changes Needed
- Add optional event-specific fields to the custom service form.
- Update placeholder to include event examples: "e.g., Wedding Day Coordination in Paris".

### Effort Estimate
**Small** (1 day).

---

## Page: `expert/service-form.tsx` (service form shell)

### Current State
Minimal shell component (13 lines). Just imports and exports a placeholder.

### Issues Found
- **P2** — No content to audit. Likely a stub.

### Changes Needed
- Ensure this shell implements the same event-aware fields as the service wizard.

### Effort Estimate
**Small** (0.5 day).

---

## Page: `provider-status.tsx` (provider application status)

### Current State
Service provider business verification. Identity + business verification (KYB). Generic business onboarding.

### Issues Found
- **P2** — "Service Provider Application" at line 238. Generic.
- **P2** — No event-specific business verification requirements (e.g., event liability insurance, catering licenses, venue permits).

### Changes Needed
- Add event-specific document requirements when the provider selects "Events & Celebrations" category.
- Otherwise, this page is **rebrand-compatible**.

### Effort Estimate
**Small** (1 day).

---

## Page: `service-providers.tsx` (public service marketplace)

### Current State
Public service provider browsing page. Lists categories and services. Has `events-celebrations` category but subtitle is travel-framed.

### Issues Found
- **P0** — "Find trusted local professionals for your travel needs" at line 303. This is the page subtitle.
- **P1** — "Browse Service Providers" title at line 300. Could be more inclusive: "Browse Local Professionals".
- **P2** — Has `events-celebrations` category (line 100) and `per_event` pricing (line 141), which is good.

### Changes Needed
- Replace "travel needs" with "experience needs" or "event needs".
- Update title to "Browse Local Professionals for Your Events & Experiences".
- Add event-specific filter tags (Wedding, Corporate, Birthday) alongside categories.

### Effort Estimate
**Small** (1 day).

---

## Page: `services-provider.tsx` (provider registration)

### Current State
Multi-step provider registration. Includes "Events & Celebrations" category. Benefits mention "travelers".

### Issues Found
- **P1** — "Access to qualified travelers" at line 83. Should be "qualified clients" or "event hosts".
- **P2** — "Events & Celebrations" is present in categories (line 60). Good.
- **P2** — "Capacity (if applicable)" at line 496. Could be more event-specific: "Guest capacity / Group size".
- **P2** — "Price Range" options: Budget, Moderate, Upscale, Luxury. Works for events too.

### Changes Needed
- Replace "travelers" with "clients" or "customers".
- Update capacity label to "Guest Capacity / Group Size".
- Add event-specific checkboxes: "I have event liability insurance", "I have venue partnerships".

### Effort Estimate
**Small** (1 day).

---

## Page: `service-detail.tsx` (public service detail)

### Current State
Public service detail page. Shows price, reviews, booking CTA. Has `per_event` pricing support.

### Issues Found
- **P1** — `travelerId` in review interface at line 73. The data model assumes the reviewer is a traveler.
- **P2** — "Browse Services" back button at line 140. Generic enough.
- **P2** — `per_event` pricing is supported (lines 160–172). Good.

### Changes Needed
- Rename `travelerId` to `clientId` or `reviewerId` in the review model.
- Add event-specific service attributes: "Max guest capacity", "Setup time included", "Travel to venue included".

### Effort Estimate
**Small** (1 day).

---

## Page: `vendors.tsx` (vendor list)

### Current State
Vendor browsing page. Has event-related categories (`wedding`, `coordination`) but UI is generic.

### Issues Found
- **P2** — `PLANNER_ROLES` includes `event_planner` at line 89. Good.
- **P2** — No explicit travel terminology found in the UI. The categories include `wedding`, `photography`, `catering`, `venue`, `decor` which are event-friendly.
- **P2** — Missing vendor attributes: "Venue capacity", "Catering style", "Equipment list", "Event types served".

### Changes Needed
- Add event-specific vendor attribute filters.
- Otherwise, this page is **rebrand-compatible**.

### Effort Estimate
**Small** (1 day).

---

## Page: `travel-experts.tsx` (expert application)

### Current State
Expert application form. Has `event_planner` type but defaults to travel framing throughout.

### Issues Found
- **P0** — `expertTypeTitles`: `travel_expert: "Trip Planner"` at line 174. Default title is "Trip Planner".
- **P0** — Specialization options: "Budget Travel", "Solo Travel", "Family Travel", "Group Travel" at lines 86–96. No "Wedding Planning", "Corporate Events".
- **P0** — "Tell travelers about yourself, your passion for travel, and what makes you a great guide..." at line 1175. Bio placeholder is travel-only.
- **P1** — "Access to global travelers" at line 146. Should be "global clients".
- **P1** — "Solo travellers", "Couples", "Families", "Groups", "Business travellers" at line 950. Client type tags are travel-centric.
- **P1** — Hourly rate input implies "$50–150/hour" at line 1265. Event planners charge packages, not hourly.
- **P2** — "Step 4: Experience (travel/event experts only)" at line 1145. Acknowledges event planners but parenthetical is awkward.
- **P2** — Question: "Name your top pick for a local meal near a popular tourist area... Where do you send the traveler?" at line 60. Travel-specific application question.

### Changes Needed
- Rename `travel_expert` title to "Experience Planner".
- Add event specialization options: "Wedding Planning", "Proposal Coordination", "Corporate Events", "Birthday Parties".
- Make bio placeholder role-aware.
- Update client type tags to include "Event Hosts", "Corporate Teams", "Brides & Grooms".
- Add package pricing option alongside hourly rate.
- Add event-specific application questions: "Describe a complex event you planned", "What vendors do you have relationships with?"

### Effort Estimate
**Medium–Large** (3–5 days). Requires new form fields, conditional logic, and new questions.

---

## Page: `partner-with-us.tsx` (partner recruitment)

### Current State
Partner recruitment landing page. Includes `event-planner` partner type but stats and copy are travel-framed.

### Issues Found
- **P0** — "Trips Planned" stat at line 206. Should be "Experiences Planned" or "Events Planned".
- **P1** — "Connect with travelers and earn on your terms" at line 196. Should be "Connect with clients".
- **P1** — Testimonial: "help 20+ travelers every month" at line 140. Should be "20+ clients".
- **P2** — `event-planner` partner type exists at line 77 with description "Specialise in weddings, proposals, and group celebrations". This is good.
- **P2** — "local-expert" description: "Guide travelers through your city..." at line 59. Travel-specific but acceptable for that role.

### Changes Needed
- Rename "Trips Planned" to "Experiences Planned" or make it conditional: "Events Planned" for event planners.
- Replace all "travelers" with "clients" or make role-conditional.
- Keep `event-planner` type as-is.

### Effort Estimate
**Small** (1 day).

---

## Summary Table — Pages Ranked by Priority

| Rank | Page | Priority | P0 Count | P1 Count | Effort | Key Blocker |
|------|------|----------|----------|----------|--------|-------------|
| 1 | `expert/workspace.tsx` | **P0** | 3 | 4 | Large | Entire page is "Itinerary/Trip" shaped |
| 2 | `experts.tsx` | **P0** | 4 | 3 | Medium–Large | AI Matching, CTAs, filters all travel-only |
| 3 | `expert/bookings.tsx` | **P0** | 3 | 2 | Medium | Hardcoded `VisaBookingMetadata` irrelevant for events |
| 4 | `travel-experts.tsx` | **P0** | 3 | 4 | Medium–Large | Application form defaults to "Trip Planner" |
| 5 | `expert/templates.tsx` | **P0** | 3 | 2 | Medium | "Itinerary Templates" only; no event templates |
| 6 | `expert/content-studio.tsx` | **P0** | 3 | 1 | Medium | Content types are 100% travel |
| 7 | `expert/content-create.tsx` | **P0** | 3 | 2 | Medium | Editor only supports travel content types |
| 8 | `expert/analytics.tsx` | **P0** | 2 | 3 | Medium | $350 avg booking is wrong for events |
| 9 | `expert/revenue-optimization.tsx` | **P0** | 2 | 2 | Medium | $75–$150/hour is wrong for events |
| 10 | `expert/dashboard.tsx` | **P0** | 2 | 2 | Medium | "Itinerary" quick actions everywhere |
| 11 | `expert/assigned-trips.tsx` | **P0** | 3 | 1 | Medium | Entire data model is trip-shaped |
| 12 | `expert/contract-categories.tsx` | **P0** | 1 | 3 | Medium | "Vacation Planning" as first category |
| 13 | `expert-detail.tsx` | **P0** | 1 | 2 | Medium | "trips completed" and bio fallback |
| 14 | `expert/messages.tsx` | **P0** | 3 | 1 | Small–Medium | All data fields are trip-shaped |
| 15 | `expert/client-detail.tsx` | **P0** | 2 | 1 | Small | Mock data is trip-only |
| 16 | `service-providers.tsx` | **P0** | 1 | 1 | Small | "travel needs" subtitle |
| 17 | `expert/service-wizard.tsx` | **P1** | 1 | 2 | Small | "Trip Planning Consultation" placeholder |
| 18 | `expert/booking-partners.tsx` | **P1** | 0 | 2 | Medium | Travelpayouts is travel-only affiliate |
| 19 | `expert/clients.tsx` | **P1** | 1 | 3 | Small–Medium | "Trips" tab, "Traveler" labels |
| 20 | `expert/profile.tsx` | **P1** | 0 | 3 | Small–Medium | "Travel Advisor", "travellers", "itinerary" |
| 21 | `expert/services.tsx` | **P1** | 0 | 2 | Small | Template availability for event planners |
| 22 | `expert/earnings.tsx` | **P1** | 0 | 1 | Small | Hardcoded 75% revenue share fallback |
| 23 | `services-provider.tsx` | **P1** | 0 | 1 | Small | "qualified travelers" in benefits |
| 24 | `service-detail.tsx` | **P1** | 0 | 1 | Small | `travelerId` in review model |
| 25 | `expert/settings.tsx` | **P2** | 0 | 2 | Small | "Itinerary Update", "Vacation Mode" |
| 26 | `expert/verification.tsx` | **P2** | 0 | 0 | Small | "travellers" in description |
| 27 | `expert/performance.tsx` | **P2** | 0 | 0 | Small | Generic, just needs event achievements |
| 28 | `expert/custom-services.tsx` | **P2** | 0 | 0 | Small | Generic, could add event fields |
| 29 | `expert/leaderboard.tsx` | **P2** | 0 | 0 | Small | Placeholder, no issues yet |
| 30 | `provider-status.tsx` | **P2** | 0 | 0 | Small | Generic, no event-specific docs |
| 31 | `vendors.tsx` | **P2** | 0 | 0 | Small | Generic, event categories exist |
| 32 | `partner-with-us.tsx` | **P2** | 0 | 2 | Small | "Trips Planned", "travelers" |
| 33 | `expert/service-form.tsx` | **P2** | 0 | 0 | Small | Shell, no content to audit |

---

## Cross-Cutting Themes

### 1. Data Model Assumes "Trip" Everywhere
The most systemic issue is that the frontend data models (`AssignedTrip`, `trip_id`, `trip_title`, `destination`, `traveler_name`, `traveler_user_id`) are hardcoded across **14+ pages**. A polymorphic `Experience` model with `type: 'trip' | 'event'` would allow the same components to serve both use cases.

### 2. "Traveler" vs "Client" Language
"Traveler" appears in 20+ pages. In a unified platform, "Client" or "Guest" is more inclusive. For event planners, the client is often the bride, the corporate HR manager, or the birthday host—not a "traveler".

### 3. Itinerary vs Event Timeline
The word "Itinerary" and "Itinerary Workspace" appear on 8+ pages. For events, this should be "Event Timeline", "Run-of-Show", or "Experience Plan".

### 4. Earnings Model Mismatch
The platform assumes low-ticket, high-volume travel bookings ($350 avg, $75–150/hour). Event planning is high-ticket, low-volume ($5K–$50K per project). Analytics, revenue optimization, and earnings pages need role-aware benchmarks.

### 5. Missing Event Planner Features
No page has:
- Guest list / RSVP management
- Vendor coordination (beyond generic service browsing)
- Event budget breakdown by category (venue, catering, decor, A/V)
- Run-of-show timeline (hour-by-hour, not day-by-day)
- Event-specific contracts (venue, catering, photography)
- Event liability insurance verification

---

## Recommended Sprint Order

**Sprint 1 (Critical rebrand blockers):**
1. `expert/workspace.tsx` — rename to Experience Workspace, add event modules
2. `experts.tsx` — update CTAs, AI matching, filters
3. `expert/bookings.tsx` — remove visa hardcoding, add event metadata
4. `expert/dashboard.tsx` — rename Itinerary quick actions

**Sprint 2 (High-visibility public pages):**
5. `travel-experts.tsx` — application form updates
6. `expert-detail.tsx` — conditional stats, event portfolio
7. `service-providers.tsx` / `services-provider.tsx` — copy updates
8. `partner-with-us.tsx` — stats and copy

**Sprint 3 (Expert tools & content):**
9. `expert/templates.tsx` — event template types
10. `expert/content-studio.tsx` / `content-create.tsx` — event content types
11. `expert/analytics.tsx` / `revenue-optimization.tsx` — role-aware benchmarks
12. `expert/contract-categories.tsx` — event category restructure

**Sprint 4 (Cleanup):**
13. `expert/assigned-trips.tsx`, `expert/messages.tsx`, `expert/clients.tsx` — rename to "experience" / "project"
14. `expert/profile.tsx`, `expert/settings.tsx`, `expert/verification.tsx` — "traveler" → "client"
15. All remaining P2 pages

---

*End of audit.*
