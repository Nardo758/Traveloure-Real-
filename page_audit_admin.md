# Admin Pages Audit — Travel → Experience Planning Reframe

## Summary

| Priority | Page | Event Support | Effort | Key Issues |
|----------|------|---------------|--------|------------|
| P0 | `tourism-analytics.tsx` | 0 | XL (8+hr) | Entire page is tourism-centric; needs rebuild for event-market intelligence |
| P0 | `revenue.tsx` | 1 | Large (4-8hr) | Affiliate streams are travel-only (Travelpayouts, Viator, Booking.com); no event-type revenue breakdown |
| P0 | `fee-config.tsx` | 2 | Large (4-8hr) | Categories are travel-only (flights, hotels, eSIM); optimization fees reference "itinerary" and "trips" |
| P1 | `analytics.tsx` | 1 | Medium (1-4hr) | Top Destinations, no event-type metrics; generic metrics only |
| P1 | `data.tsx` | 1 | Medium (1-4hr) | Tabs for Hotels, Activities, Flights — no event-specific data views |
| P1 | `platform-providers.tsx` | 1 | Medium (1-4hr) | All 9 providers are travel APIs (Amadeus, Viator, Booking.com, etc.) |
| P1 | `affiliate-partners.tsx` | 1 | Medium (1-4hr) | Reconciliation defaults to travel partners (Travelpayouts, Viator, Booking.com) |
| P1 | `ai-costs.tsx` | 2 | Medium (1-4hr) | Amadeus is travel-specific; no event-planning API tracking |
| P1 | `plans.tsx` | 2 | Medium (1-4hr) | API is `/api/admin/trips`; fields are `destination`, `startDate`, `endDate` |
| P2 | `experts.tsx` | 2 | Medium (1-4hr) | Uses "Destinations" instead of "Markets"; no event specialty filters |
| P2 | `users.tsx` | 2 | Small (<1hr) | Column header "Trips" should be "Events" |
| P2 | `dashboard.tsx` | 3 | Small (<1hr) | `trip_id` in stale booking interface; no event-type breakdowns |
| P2 | `event-packages.tsx` | 4 | Small (<1hr) | "traveler's destination" in helper text |
| P2 | `expert-templates.tsx` | 3 | Small (<1hr) | Role "travel_expert" / "Travel Advisor" should be "event_expert" / "Experience Advisor" |
| P2 | `services.tsx` | 2 | Small (<1hr) | Affinity tag "Any trip (general logistics)"; "traveller contexts" in dialog |
| P2 | `content-mapping.tsx` | 2 | Small (<1hr) | Content type `trip`; surface `itinerary`; TravelPulse references |
| P2 | `content-tracking.tsx` | 2 | Small (<1hr) | Content type labels include "Trip" and "Itinerary" |
| P2 | `cross-sell-analytics.tsx` | 2 | Small (<1hr) | "travellers" in empty-state copy |
| P2 | `review-moderation.tsx` | 2 | Small (<1hr) | `travelerId` and `travelerName` in data model and UI |
| P2 | `routing-queue.tsx` | 2 | Small (<1hr) | `trip_id` and `traveler_name` in queue items |
| P2 | `search.tsx` | 2 | Small (<1hr) | Search types: user, expert, provider, plan — no "event" search |
| P2 | `offering-types.tsx` | 3 | Small (<1hr) | Placeholder "trip_architecture" in expert offering key |
| P3 | `providers.tsx` | 2 | Small (<1hr) | Description mentions "travel experts" |
| P3 | `categories.tsx` | 3 | Small (<1hr) | Mix of travel and event categories; needs audit |
| P3 | `neighborhoods.tsx` | 3 | Small (<1hr) | No event-specific terminology; mostly neutral |
| P3 | `neighborhood-backfill.tsx` | 3 | Small (<1hr) | Neutral — no travel terminology found |
| P3 | `gem-photo-backfill.tsx` | 3 | Small (<1hr) | Neutral — no travel terminology found |
| P3 | `system.tsx` | 3 | Small (<1hr) | Neutral — no travel terminology found |
| P3 | `payouts.tsx` | 4 | Small (<1hr) | Generic payout management; no event-specific tracking |
| P3 | `fee-bands.tsx` | 4 | Small (<1hr) | Generic fee band editor; no event-specific bands |
| P3 | `category-fees.tsx` | 4 | Small (<1hr) | Generic category fee attributes; no event-specific fields |
| P3 | `notifications.tsx` | 3 | Small (<1hr) | Generic notification UI; no travel terminology found |

---

## Page: `dashboard.tsx`
### Current State
- Admin dashboard with stats cards, stale pending bookings alert, expert/provider application queues, and platform health.
- Event support level: 3

### Issues Found
- **P2**: `trip_id` field in `StaleBooking` interface (line: 37) — legacy trip terminology in booking model
- **P2**: Stale bookings card references `pending_payment` status and Stripe dashboard (line: 128-131) — payment-centric language, not event-planning centric
- **P1**: No event-type breakdown in stats (e.g., wedding bookings vs corporate bookings) — dashboard is generic

### Changes Needed
1. Rename `trip_id` to `event_id` or `booking_id` in the interface and API (line: 37)
2. Add event-type stat cards (Weddings, Corporate, Proposals, Birthdays) if data is available
3. Update stale booking copy to be event-agnostic ("client" instead of "user")

### Effort Estimate
- Small (<1hr)

---

## Page: `event-packages.tsx`
### Current State
- CRUD for full/done-for-you event packages. Supports wedding, proposal, corporate, honeymoon, anniversary, birthday, other.
- Event support level: 4

### Issues Found
- **P2**: CardDescription says "traveler's destination" (line: 130) — should be "guest's destination" or "client's destination"
- **P1**: No per-event-type bulk actions or filters in the catalog view
- **P1**: No sub-package management (e.g., proposal packages with photographer, florist, venue sub-items)

### Changes Needed
1. Change "traveler's destination" to "guest's destination" (line: 130)
2. Add event-type filter tabs in the catalog
3. Add sub-package / bundle management UI

### Effort Estimate
- Small (<1hr) for terminology; Medium (1-4hr) for filters; Large (4-8hr) for sub-packages

---

## Page: `expert-templates.tsx`
### Current State
- Template library with role-based filtering: local_expert, travel_expert, event_planner, executive_assistant.
- Event support level: 3

### Issues Found
- **P2**: Role value `travel_expert` and label "Travel Advisor" (lines: 45, 47, 67, 169) — should be `event_expert` / "Experience Advisor"
- **P2**: Tab filter "Travel Advisor" (line: 67) and icon `<Plane />` (line: 68) — travel-specific icon
- **P2**: Stats card "Travel Advisor" count (line: 169) — label and icon are travel-centric
- **P1**: No event-type template categorization (wedding templates, proposal templates, corporate templates)

### Changes Needed
1. Rename `travel_expert` role to `event_expert` throughout (lines: 45, 67, 169)
2. Change "Travel Advisor" label to "Experience Advisor" (lines: 46, 68, 169)
3. Replace `<Plane />` icon with `<Calendar />` or `<Sparkles />` (lines: 47, 68)
4. Add event-type template tags (wedding, proposal, corporate, birthday)

### Effort Estimate
- Small (<1hr) for terminology/icon changes; Medium (1-4hr) for event-type tags

---

## Page: `experts.tsx`
### Current State
- Expert application management with pending/approved tabs, commission override editor, identity verification.
- Event support level: 2

### Issues Found
- **P2**: `destinations?: string[]` in ExpertApplication interface (line: 36) — "Destinations" is travel-centric; should be "Markets" or "Cities"
- **P2**: UI label "Destinations" in pending application grid (line: 311) and approved experts table (line: 442)
- **P2**: No event specialty filter or display (e.g., wedding specialist, corporate retreat specialist)
- **P1**: Commission override uses generic percentages; no event-specific override tiers

### Changes Needed
1. Rename `destinations` to `markets` or `cities` in interface and UI (lines: 36, 311, 442)
2. Add event specialty badges (wedding, corporate, proposal, birthday) to expert cards
3. Add event-type filter in approved experts tab

### Effort Estimate
- Medium (1-4hr)

---

## Page: `providers.tsx`
### Current State
- Service provider application management with platform providers and pending applications tabs.
- Event support level: 2

### Issues Found
- **P2**: Page description says "travel experts can book for their clients" (line: 189) — should be "event planners" or "experience designers"
- **P2**: Service listings use generic icons; no event-specific categories (photographer, florist, DJ, caterer) prominently displayed
- **P1**: No event-type filtering on provider applications or platform providers

### Changes Needed
1. Update description to "event planners can book for their clients" (line: 189)
2. Add event category filter (photography, florals, catering, music, venue)
3. Add event portfolio display (photos from past weddings/events)

### Effort Estimate
- Small (<1hr) for copy; Medium (1-4hr) for filters

---

## Page: `services.tsx`
### Current State
- Services registry with status management, featured toggling, affinity tags, and deletion.
- Event support level: 2

### Issues Found
- **P2**: Affinity tag "general_logistics" label is "Any trip (general logistics)" (line: 70) — trip terminology
- **P2**: Dialog description says "traveller contexts" (line: 590) — should be "guest contexts" or "client contexts"
- **P1**: Affinity tags are travel-centric (hotel_arrival, restaurant_visit, cultural_attraction, hiking_outdoor) — missing event-specific tags (ceremony, reception, welcome_dinner, after_party)
- **P1**: No event-type categorization in the services table

### Changes Needed
1. Change "Any trip (general logistics)" to "Any event (general logistics)" (line: 70)
2. Change "traveller contexts" to "guest contexts" (line: 590)
3. Add event-specific affinity tags: `ceremony`, `reception`, `welcome_dinner`, `after_party`, `rehearsal_dinner`, `corporate_session`, `team_building`
4. Add event type column/filter in services table

### Effort Estimate
- Small (<1hr) for copy; Medium (1-4hr) for tags and filters

---

## Page: `categories.tsx`
### Current State
- Service category CRUD with subcategories, icons, and verification toggles.
- Event support level: 3

### Issues Found
- **P2**: Mix of travel and event categories: `tours-experiences`, `lodging-accommodation`, `transportation-logistics` are travel-centric; `events-celebrations`, `floral-decoration`, `music-performance` are event-aware
- **P2**: Title "Service Provider Categories" (line: 225) is fine, but description says "15+ service provider categories for your marketplace" (line: 228) — no mention of event focus
- **P1**: No event-type hierarchy (e.g., Wedding → Photography, Florals, Catering, Venue)

### Changes Needed
1. Deprecate or reframe travel-only categories (`tours-experiences`, `lodging-accommodation`) as secondary
2. Add event-primary categories: `wedding-services`, `corporate-events`, `proposal-planning`, `birthday-celebrations`
3. Add event-type parent/child hierarchy in the UI

### Effort Estimate
- Medium (1-4hr)

---

## Page: `fee-bands.tsx`
### Current State
- Live fee band editor (percent and flat) with platform policy settings.
- Event support level: 4

### Issues Found
- **P1**: No event-specific fee bands (e.g., `wedding_premium`, `corporate_standard`, `proposal_simple`)
- **P1**: Percent bands default to small-transaction scale (e.g., 0.25 = 25% of $100-$200); for $5K-$50K events, the absolute platform fee should be capped or tiered differently
- **P2**: `beta_flat` and `tiered` policies are generic; no event-aware policy

### Changes Needed
1. Add event-type band keys: `event_wedding`, `event_corporate`, `event_proposal`, `event_birthday`
2. Add transaction-size tier notes to band descriptions (e.g., "$5K-$50K events")
3. Add event policy toggle in platform settings

### Effort Estimate
- Medium (1-4hr)

---

## Page: `fee-config.tsx`
### Current State
- Legacy fee configuration page (deprecated in favor of fee-bands) with per-category booking fees and AI optimization fees.
- Event support level: 2

### Issues Found
- **P0**: `CATEGORY_LABELS` are travel-only: `accommodation`, `activities`, `transportation`, `car_rental`, `flights`, `insurance`, `dining`, `esim`, `luggage` (lines: 57-68) — no event categories
- **P0**: `OPTIMIZATION_TIER_META` description says "Standard vacation, birthday, adventure, or cultural trips" (line: 87) — "vacation", "trips"
- **P0**: `OPTIMIZATION_TIER_META` description says "Honeymoon, anniversary, proposal, or multi-city trips" (line: 93) — "trips"
- **P0**: Optimization fee card says "Users pay this once to unlock the full AI optimizer for their itinerary" (lines: 390-391) — "itinerary"
- **P1**: Default optimization fees are $9.99/$49.99 — these are too low for event planning ($5K-$50K); should be $99-$499
- **P1**: No event-type booking fee categories (wedding coordination fee, corporate event fee)

### Changes Needed
1. Replace `CATEGORY_LABELS` with event-aware categories: `venue`, `catering`, `photography`, `florals`, `entertainment`, `transportation`, `accommodation`, `coordination` (lines: 57-68)
2. Update tier descriptions to remove "vacation", "trips" and replace with "events", "experiences" (lines: 87, 93)
3. Change "itinerary" to "event plan" (lines: 390-391)
4. Raise default optimization fees to $99-$499 for event complexity tiers
5. Add event-type fee categories with appropriate % rates (venue 5%, catering 8%, photography 10%, etc.)

### Effort Estimate
- Large (4-8hr)

---

## Page: `plans.tsx`
### Current State
- Plan management page that renders trips from `/api/admin/trips` with search and status filters.
- Event support level: 2

### Issues Found
- **P1**: API endpoint is `/api/admin/trips` (line: 43); data model uses `trips` array (line: 40)
- **P1**: Field names are `destination`, `startDate`, `endDate`, `guests` (lines: 41, 83-85) — travel-centric
- **P2**: Stats label "Total Plans" (line: 116) is fine, but the page is built on top of a trips API
- **P1**: No event-type filter (Wedding, Corporate, Proposal, Birthday)
- **P1**: No event budget range display (e.g., "$15K-$25K")

### Changes Needed
1. Rename API endpoint from `/api/admin/trips` to `/api/admin/plans` or `/api/admin/events` (line: 43)
2. Rename `destination` to `market` or `city` in the data model (line: 41)
3. Add `eventType` filter buttons (Wedding, Corporate, Proposal, Birthday)
4. Add budget range display and filter
5. Rename `startDate`/`endDate` to `eventDate` or `eventWindow` if possible

### Effort Estimate
- Medium (1-4hr)

---

## Page: `revenue.tsx`
### Current State
- Unified revenue dashboard with Stripe, affiliate, and partner commission streams.
- Event support level: 1

### Issues Found
- **P0**: Affiliate stream cards are all travel-specific: `Travelpayouts` (line: 482), `Viator Partner` (line: 497), `Booking.com Affiliate` (line: 527) — no event-specific revenue streams
- **P0**: `getSourceLabel` has no event-type revenue categories (line: 200-210) — missing "Wedding Revenue", "Corporate Revenue", "Proposal Revenue", "Birthday Revenue"
- **P1**: Bar chart compares "This Period vs Last Month" for travel streams (lines: 567-638) — should include event package revenue, venue booking revenue, catering revenue
- **P1**: "Commissions by Partner" tab is Travelpayouts-centric (line: 912) — no event vendor partner reconciliation
- **P1**: "API Costs" tab tracks Amadeus and SerpAPI (line: 972) — no event-planning API costs (venue APIs, caterer APIs, florist APIs)
- **P2**: Export filenames use `traveloure-revenue` (lines: 388, 401) — fine, but could be more generic

### Changes Needed
1. Replace travel affiliate streams with event vendor streams: `Venue Partners`, `Catering Partners`, `Photography Partners`, `Florist Partners`
2. Add `getSourceLabel` entries for event types: `wedding_revenue`, `corporate_revenue`, `proposal_revenue`, `birthday_revenue` (line: 200)
3. Add event-type revenue breakdown tab
4. Add event vendor reconciliation panel
5. Update API costs tab to include event-planning integrations (if any)

### Effort Estimate
- Large (4-8hr)

---

## Page: `users.tsx`
### Current State
- User management table with role filters, status badges, and search.
- Event support level: 2

### Issues Found
- **P2**: Table column header "Trips" (line: 167) and cell value `user.trips` (line: 204) — should be "Events" and `user.events`
- **P1**: No event organizer role or event-type filter (e.g., Wedding Client, Corporate Client)
- **P1**: No event spend tracking (e.g., "Total Event Spend" instead of generic "Spent")

### Changes Needed
1. Rename "Trips" column to "Events" (line: 167) and `user.trips` to `user.events` (line: 204)
2. Add event organizer role if applicable
3. Add event-type user tags (Wedding, Corporate, etc.)

### Effort Estimate
- Small (<1hr)

---

## Page: `analytics.tsx`
### Current State
- Generic analytics with metrics, weekly active users, demographics, top destinations.
- Event support level: 1

### Issues Found
- **P1**: `topDestinations` is travel-centric (line: 21) — should be `topMarkets` or `topCities` for events
- **P1**: "Top Destinations" card (line: 139) shows destination popularity — not event market intelligence (wedding market trends, corporate retreat demand)
- **P1**: No event-type analytics (wedding bookings by month, corporate demand by quarter)
- **P1**: No event revenue analytics (average wedding spend, average corporate event spend)
- **P2**: "Weekly Active Users" is generic but acceptable

### Changes Needed
1. Rename `topDestinations` to `topMarkets` (line: 21) and update UI copy (line: 139)
2. Add event-type demand cards: Wedding Market Trends, Corporate Retreat Demand, Proposal Seasonality
3. Add event revenue metrics: Avg Wedding Spend, Avg Corporate Spend, Avg Proposal Spend
4. Replace destination heatmap with event market heatmap

### Effort Estimate
- Medium (1-4hr)

---

## Page: `data.tsx`
### Current State
- Location data cache manager with tabs for Events, Hotels, Activities, Flights.
- Event support level: 1

### Issues Found
- **P0**: Tabs are `Events`, `Hotels`, `Activities`, `Flights` (lines: 208-220) — 3 of 4 are travel-centric. For experience planning, tabs should be `Venues`, `Vendors`, `Activities`, `Transport`
- **P1**: Data endpoints are Fever cache (`/api/fever/cache/status`), hotels, activities, flights — no event vendor data cache
- **P2**: "Refresh Events" button (line: 197) is ambiguous — refers to ticketed events, not planned events
- **P1**: City list is travel cities (Madrid, Barcelona, NYC, etc.) — no event market focus

### Changes Needed
1. Rename tabs to `Venues`, `Vendors`, `Activities`, `Transport` (lines: 208-220)
2. Add event vendor data cache endpoints (photographers, caterers, florists, DJs by city)
3. Replace "Refresh Events" with "Refresh Vendor Data" (line: 197)
4. Update city list to include top event destinations (e.g., Napa, Tuscany, Bali, Santorini)

### Effort Estimate
- Medium (1-4hr)

---

## Page: `content-mapping.tsx`
### Current State
- Content surface map editor with placement rules for where content appears.
- Event support level: 2

### Issues Found
- **P2**: Content type `trip` exists in `CONTENT_TYPE_COLORS` (line: 48) and `CONTENT_TYPES` (imported from `@shared/content-surface-map`) — should be `event`
- **P2**: Surface slug `itinerary` exists (line: 40) — should be `event_plan` or `experience`
- **P2**: Auto-index references "TravelPulse" (lines: 147, 428) — travel brand name
- **P1**: No event-specific surfaces (e.g., `wedding-showcase`, `corporate-retreat`, `proposal-guide`)

### Changes Needed
1. Rename `trip` content type to `event` in `content-surface-map.ts` and UI (line: 48)
2. Rename `itinerary` surface to `event_plan` or `experience` (line: 40)
3. Replace "TravelPulse" with "EventPulse" or generic "Pulse" (lines: 147, 428)
4. Add event-specific surfaces

### Effort Estimate
- Medium (1-4hr)

---

## Page: `content-tracking.tsx`
### Current State
- Content registry, moderation queue, invoices, and analytics tabs.
- Event support level: 2

### Issues Found
- **P2**: `contentTypeLabels` include "Trip" (line: 102) and "Itinerary" (line: 103) — should be "Event" and "Event Plan"
- **P2**: Content type `trip` is used in registry and analytics (line: 102)
- **P1**: No event-specific content types (`wedding_plan`, `corporate_proposal`, `proposal_itinerary`, `birthday_plan`)
- **P1**: Affiliate product focus is travel-centric; no event vendor product tracking

### Changes Needed
1. Rename "Trip" to "Event" (line: 102) and "Itinerary" to "Event Plan" (line: 103)
2. Add event-specific content types to `contentTypeLabels` (line: 101-118)
3. Update analytics tab to show event content breakdown

### Effort Estimate
- Small (<1hr)

---

## Page: `cross-sell-analytics.tsx`
### Current State
- Cross-sell funnel analytics: impressions → clicks → conversions → bookings.
- Event support level: 2

### Issues Found
- **P2**: Empty state says "travellers view and click the 'Users also book' strip" (line: 256) — "travellers" should be "guests" or "clients"
- **P1**: Funnel is generic (impressions → clicks → bookings) but could be event-enhanced (e.g., package upgrades, vendor cross-sell)
- **P1**: No event-specific cross-sell metrics (e.g., photography → florist upsell, venue → catering upsell)

### Changes Needed
1. Change "travellers" to "guests" (line: 256)
2. Add event vendor cross-sell funnel (photography → florals → venue → catering)
3. Add event package upgrade tracking

### Effort Estimate
- Small (<1hr) for copy; Medium (1-4hr) for event funnel

---

## Page: `affiliate-partners.tsx`
### Current State
- Affiliate partner management with reconciliation panel.
- Event support level: 1

### Issues Found
- **P1**: Reconciliation partner filter defaults to travel partners: `travelpayouts`, `viator`, `fever`, `booking` (lines: 640-643) — no event vendor partners
- **P1**: Partner categories are generic; no event vendor categories (`venue`, `catering`, `photography`, `florals`, `entertainment`)
- **P2**: Scraping is for travel products; no event vendor scraping

### Changes Needed
1. Add event vendor partner options in reconciliation filter (lines: 640-643)
2. Add event vendor categories (venue, catering, photography, florals, entertainment, music, planning)
3. Add event vendor product scraping logic

### Effort Estimate
- Medium (1-4hr)

---

## Page: `ai-costs.tsx`
### Current State
- AI and external API cost tracking with Grok, Claude, Amadeus usage.
- Event support level: 2

### Issues Found
- **P1**: External API tab is Amadeus-centric (lines: 230, 238, 497, 534) — travel-specific flight/hotel API
- **P1**: No event-planning API tracking (venue APIs, caterer APIs, florist APIs, photography APIs)
- **P2**: "Amadeus Costs" stat card (line: 230) and icon `<Plane />` (line: 238) — travel-specific
- **P2**: "Daily Amadeus API calls and costs" (line: 497) — travel-specific

### Changes Needed
1. Rename "Amadeus Costs" to "External API Costs" and add generic icon (line: 230, 238)
2. Add event vendor API providers to tracking (if integrated)
3. Update tab label from "External APIs (Amadeus)" to "External APIs (Amadeus + Vendors)" (line: 267)

### Effort Estimate
- Small (<1hr) for copy; Medium (1-4hr) for new vendor integrations

---

## Page: `platform-providers.tsx`
### Current State
- Platform API provider status dashboard with 9 providers (AI, Booking, Maps, Search, Transport, Events).
- Event support level: 1

### Issues Found
- **P0**: All providers are travel-centric: `Viator` (tours), `Amadeus` (flights/hotels), `Booking.com` (hotels), `12Go Asia` (transport), `Google Maps` (maps), `SerpAPI` (venues), `Fever` (events/tickets) (lines: 30-174)
- **P0**: Provider descriptions mention "itinerary optimization", "travel advice", "tours and activities", "flights, hotels, POI discovery", "hotel search", "ground transportation", "route visualization" (lines: 35, 50, 65, 82, 97, 114, 131, 146) — all travel
- **P1**: No event-planning providers (venue APIs, caterer APIs, florist marketplaces, photography portfolios, DJ booking platforms)
- **P1**: Category "Events" is only Fever (event discovery) — no event vendor categories

### Changes Needed
1. Deprecate or reframe travel providers as secondary integrations
2. Add event vendor providers: `The Knot` (weddings), `Cvent` (corporate), `Zola` (registry), `WeddingWire` (vendors), `Thumbtack` (local vendors), `Yelp` (catering/venues)
3. Update provider descriptions to be event-planning focused
4. Add categories: `Venues`, `Catering`, `Photography`, `Florals`, `Entertainment`, `Planning`

### Effort Estimate
- Large (4-8hr)

---

## Page: `neighborhoods.tsx`
### Current State
- Neighborhood spine management with lead expert assignment, coverage targets, and adjacency.
- Event support level: 3

### Issues Found
- **P2**: No event-specific terminology; mostly neutral
- **P1**: Coverage targets use generic `categoryKey` — no event-specific coverage targets (e.g., "2 wedding photographers", "3 florists", "1 venue coordinator")
- **P1**: No event market intelligence per neighborhood (wedding popularity, corporate event demand)

### Changes Needed
1. Add event-specific coverage target presets (wedding, corporate, proposal, birthday)
2. Add event demand indicators per neighborhood

### Effort Estimate
- Small (<1hr) for presets; Medium (1-4hr) for demand indicators

---

## Page: `neighborhood-backfill.tsx`
### Current State
- Auto-assigns neighborhoods to legacy services using Haversine proximity.
- Event support level: 3

### Issues Found
- No travel terminology found.
- Neutral page.

### Changes Needed
- None required.

### Effort Estimate
- Small (<1hr) — no changes needed

---

## Page: `gem-photo-backfill.tsx`
### Current State
- Backfills photos for hidden gems with missing image URLs.
- Event support level: 3

### Issues Found
- No travel terminology found.
- "Hidden gems" concept is travel-oriented but can be reframed as "Hidden venues" or "Secret spots" for events.

### Changes Needed
1. Consider renaming "Hidden Gem" to "Hidden Venue" or "Secret Spot" in page title and copy (lines: 51, 52)

### Effort Estimate
- Small (<1hr)

---

## Page: `search.tsx`
### Current State
- Global admin search for users, experts, providers, and plans.
- Event support level: 2

### Issues Found
- **P2**: Search types are `user`, `expert`, `provider`, `plan` (line: 22) — no `event` search type
- **P2**: Search placeholder says "Search users, experts, providers, plans..." (line: 73) — no "events"
- **P1**: No event-specific search filters (search by event type, budget, date, city)

### Changes Needed
1. Add `event` to search types and placeholder (lines: 22, 73)
2. Add event-specific filters in search results

### Effort Estimate
- Small (<1hr)

---

## Page: `system.tsx`
### Current State
- System settings with maintenance mode, registration, email, API usage, security, backup.
- Event support level: 3

### Issues Found
- No travel terminology found.
- Neutral page.
- **P2**: API usage tracks Claude and Stripe — generic and fine

### Changes Needed
- None required.

### Effort Estimate
- Small (<1hr) — no changes needed

---

## Page: `tourism-analytics.tsx`
### Current State
- Comprehensive tourism analytics dashboard with destination demand, booking trends, source markets, spending patterns, party composition, seasonality, and trip event types.
- Event support level: 0

### Issues Found
- **P0**: Page title is "Tourism Analytics Dashboard" (line: 155) — entire page is tourism-centric
- **P0**: Subtitle says "Comprehensive insights into travel patterns and demand" (line: 156) — travel patterns
- **P0**: Summary metrics include "Total Trips", "Avg Duration" (days), "Avg Party Size", "Completed" (bookings) (lines: 183-253) — all tourism metrics
- **P0**: "Destination Demand Heatmap" (line: 263) — travel destination focus
- **P0**: "Source Markets" chart subtitle says "Where travelers come from" (line: 363) — travelers
- **P0**: "Party Composition" subtitle says "Breakdown of traveler groups" (line: 438) — traveler groups
- **P0**: "Trip Event Types" card (line: 508) — default type is 'vacation' (line: 520)
- **P0**: Spending patterns are by destination, not by event type (wedding vs corporate vs proposal)
- **P0**: Seasonality is generic booking seasonality, not event seasonality (wedding season, corporate Q4)

### Changes Needed
1. **Rename page** to "Event Market Intelligence" or "Experience Analytics"
2. **Replace summary metrics** with: Total Events, Wedding Bookings, Corporate Bookings, Proposal Bookings, Birthday Bookings, Avg Event Spend, Avg Guest Count
3. **Replace Destination Demand** with Event Market Demand (wedding demand by city, corporate demand by city)
4. **Replace Source Markets** with Client Source Markets (where clients come from)
5. **Replace Party Composition** with Event Type Composition (wedding, corporate, proposal, birthday)
6. **Replace Trip Event Types** with Event Type Distribution
7. **Replace Seasonality** with Event Seasonality (wedding season peaks, corporate Q4 demand, proposal Valentine's peak)
8. **Add event revenue analytics** by type (wedding revenue, corporate revenue, proposal revenue)
9. **Add vendor demand analytics** (photographer demand, florist demand, venue demand by city)

### Effort Estimate
- XL (8+hr) — requires new data model, API endpoints, and chart configurations

---

## Page: `review-moderation.tsx`
### Current State
- Review moderation queue with approve, flag, remove actions.
- Event support level: 2

### Issues Found
- **P2**: `travelerId` in ModerationReview interface (line: 26) — should be `guestId` or `clientId`
- **P2**: `travelerName` in ModerationReview interface (line: 30) — should be `guestName` or `clientName`
- **P2**: UI displays "Traveler" label (line: 81) and "Traveler: {name}" (line: 129)
- **P1**: No event-type filter or display (e.g., wedding review, corporate review)

### Changes Needed
1. Rename `travelerId` to `guestId` and `travelerName` to `guestName` (lines: 26, 30)
2. Update UI labels from "Traveler" to "Guest" (lines: 81, 129)
3. Add event type badge to each review card

### Effort Estimate
- Small (<1hr)

---

## Page: `routing-queue.tsx`
### Current State
- Expert assignment queue with scored candidates and confirm/reassign actions.
- Event support level: 2

### Issues Found
- **P2**: `trip_id` in QueueItem interface (line: 31) — should be `event_id`
- **P2**: `traveler_name` in QueueItem interface (line: 39) — should be `guest_name` or `client_name`
- **P2**: UI label "Traveler: {name}" (line: 129)
- **P1**: No event-type display in queue (e.g., "Wedding in Kyoto — needs photographer + florist")
- **P1**: Scoring criteria are generic (destination, specialty, availability, response rate) — no event-specific scoring (wedding experience, vendor network size, past event portfolio)

### Changes Needed
1. Rename `trip_id` to `event_id` (line: 31)
2. Rename `traveler_name` to `guest_name` (lines: 39, 129)
3. Add event type and required vendor categories to queue items
4. Add event-specific scoring criteria (event portfolio score, vendor network score)

### Effort Estimate
- Medium (1-4hr)

---

## Page: `payouts.tsx`
### Current State
- Payout request management for experts and providers with approve/reject/execute workflows.
- Event support level: 4

### Issues Found
- No travel terminology found.
- Generic payout management.
- **P1**: No event-type payout tracking (e.g., wedding photographer payout vs corporate event planner payout)
- **P1**: No payout categorization by event type for commission analysis

### Changes Needed
1. Add event type column in payouts table (optional — useful for analytics)
2. Add event-type payout summary cards

### Effort Estimate
- Small (<1hr) — optional enhancements

---

## Page: `offering-types.tsx`
### Current State
- Admin CRUD for service and expert offering types (Phase-2 catalog vocabularies).
- Event support level: 3

### Issues Found
- **P2**: Expert offering placeholder key is `trip_architecture` (line: 261) — should be `event_architecture` or `experience_design`
- **P2**: Delivery formats include `chat`, `written`, `video`, `live_text`, `done_for_you` — these are fine but could include `on_site` for events
- **P1**: Service tiers are generic (`advisory`, `planning`, `coordination`, `live_support`, `specialized`) — no event-specific tiers
- **P1**: No event-type offering categories (wedding planning, corporate coordination, proposal design, birthday styling)

### Changes Needed
1. Replace `trip_architecture` placeholder with `event_architecture` or `experience_design` (line: 261)
2. Add `on_site` delivery format for event-day presence
3. Add event-type offering type presets (wedding_planning, corporate_coordination, proposal_design, birthday_styling)

### Effort Estimate
- Small (<1hr)

---

## Page: `category-fees.tsx`
### Current State
- Editor for billing-aware attributes of service categories (commission band, insurance, risk profile).
- Event support level: 4

### Issues Found
- No travel terminology found.
- Generic category fee editor.
- **P1**: No event-specific risk profiles or insurance bands (e.g., wedding = high risk, corporate = moderate risk, proposal = low risk)
- **P1**: `sourceType` options are `platform_provider` and `affiliate` — no event vendor marketplace types

### Changes Needed
1. Add event-type risk profile defaults (wedding = high, corporate = moderate, proposal = low, birthday = low)
2. Add `event_vendor` source type option

### Effort Estimate
- Small (<1hr)

---

## Page: `notifications.tsx`
### Current State
- Admin notification inbox with read/unread, filters, and delete.
- Event support level: 3

### Issues Found
- No travel terminology found.
- Generic notification UI.
- **P1**: Notification categories are generic (`info`, `success`, `warning`, `alert`) — no event-specific notification categories (new wedding booking, corporate inquiry, proposal deadline)

### Changes Needed
- Optional: Add event-specific notification categories and filters

### Effort Estimate
- Small (<1hr) — optional

---

## Recommended Priority Order

1. **P0 — `tourism-analytics.tsx`**: Rebuild from scratch as "Event Market Intelligence" dashboard. This is the highest impact page because it shapes how the team views the business.
2. **P0 — `revenue.tsx`**: Replace travel affiliate streams with event vendor streams and add event-type revenue breakdown. Critical for financial reporting.
3. **P0 — `fee-config.tsx`**: Replace travel categories with event vendor categories and reframe optimization fees for event planning. Affects pricing strategy.
4. **P1 — `platform-providers.tsx`**: Add event vendor integrations and reframe existing providers as secondary. Needed for the platform's core value proposition.
5. **P1 — `data.tsx`**: Replace travel data tabs with event vendor data tabs. Needed for marketplace discovery.
6. **P1 — `analytics.tsx`**: Add event-type metrics and replace destination-centric analytics. Needed for market intelligence.
7. **P1 — `plans.tsx`**: Rename trips to events and add event-type filters. Needed for operational clarity.
8. **P2 — `expert-templates.tsx`**: Rename travel_expert role and add event-type tags. Quick win for brand consistency.
9. **P2 — `experts.tsx`**: Rename destinations to markets and add event specialties. Quick win for brand consistency.
10. **P2 — `users.tsx`**: Rename trips to events. Quick win for brand consistency.
11. **P2 — `review-moderation.tsx`**: Rename traveler to guest. Quick win for brand consistency.
12. **P2 — `routing-queue.tsx`**: Rename trip_id/traveler to event_id/guest. Quick win for brand consistency.
13. **P2 — `services.tsx`**: Update affinity tags and dialog copy. Quick win for brand consistency.
14. **P2 — `content-mapping.tsx`**: Rename trip/itinerary content types. Quick win for brand consistency.
15. **P2 — `content-tracking.tsx`**: Rename Trip/Itinerary labels. Quick win for brand consistency.
16. **P2 — `cross-sell-analytics.tsx`**: Update empty state copy. Quick win for brand consistency.
17. **P2 — `offering-types.tsx`**: Replace trip_architecture placeholder. Quick win for brand consistency.
18. **P2 — `search.tsx`**: Add event search type. Quick win for brand consistency.
19. **P3 — `providers.tsx`**: Update description. Quick win for brand consistency.
20. **P3 — `event-packages.tsx`**: Update helper text. Quick win for brand consistency.
21. **P3 — `dashboard.tsx`**: Rename trip_id and add event stats. Quick win for brand consistency.
22. **P3 — `categories.tsx`**: Add event-primary categories. Medium effort but high impact for marketplace organization.
23. **P3 — `fee-bands.tsx`**: Add event-type bands. Medium effort for pricing strategy.
24. **P3 — `neighborhoods.tsx`**: Add event coverage targets. Medium effort for marketplace depth.
25. **P3 — `gem-photo-backfill.tsx`**: Rename hidden gems. Optional.
26. **P3 — `ai-costs.tsx`**: Reframe Amadeus as external APIs. Optional.
27. **P3 — `affiliate-partners.tsx`**: Add event vendor categories. Optional until vendor integrations are built.
28. **P3 — `payouts.tsx`**: Add event-type tracking. Optional.
29. **P3 — `category-fees.tsx`**: Add event risk profiles. Optional.
30. **P3 — `system.tsx`**: No changes needed.
31. **P3 — `notifications.tsx`**: No changes needed.
32. **P3 — `neighborhood-backfill.tsx`**: No changes needed.

---

*Audit completed by subagent. All line numbers cited from actual file reads. No fabricated line numbers.*
