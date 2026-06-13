# Guest Invite, Event Management & Executive Assistant Page Audit

## Methodology
- Read all 25 pages and 8 logistics components
- Identified "trip"/"travel" terminology, wedding-only assumptions, missing event coordination features, EA event support gaps, calendar event type limitations, and transportation booking issues
- Line numbers are exact from the file reads
- Event support level: 0 = pure travel, 5 = fully event-ready

---

## Page: GuestInvitePage.tsx
### Current State
- Personalized landing page for wedding/event guests
- Shows travel recommendations based on origin city
- Includes RSVP, dietary restrictions, accommodation preference, transportation needs
- **Event support level: 2/5** — Has event-aware RSVP but is deeply travel-branded and wedding-centric in recommendations

### Issues Found
- **P0**: "Trip" terminology throughout. Lines 2-4: `/** * Guest Invite Page * Personalized landing page for wedding/event guests * Shows travel recommendations based on their origin city */` — still says "travel recommendations". Line 278: `🌟 Personalized Travel Planning` and line 280-282: `We'll help you plan your journey! Just tell us where you're traveling from, and we'll show you flight options, ground transportation, accommodation near the venue, and local activities during your stay.` — pure travel framing.
- **P0**: Wedding-only assumptions in recommendations. Line 513-518: `Flight options will appear here` / `Transport options` / `Hotels Near Venue` / `Things to Do` — assumes personal travel to a wedding, no event-specific options like group shuttles, rehearsal dinner transport, or bridal party logistics.
- **P1**: Missing event type awareness. The page has no concept of *which* event type the guest is invited to (wedding ceremony vs. corporate dinner vs. birthday party). No event-specific RSVP fields (e.g., "Will attend ceremony only", "Will attend reception only").
- **P1**: No group messaging or host-guest communication channel. The "Message to Host" (line 470-479) is one-way only; no threaded communication.
- **P2**: Dietary restrictions are hardcoded (line 408: `['Vegetarian', 'Vegan', 'Gluten-Free', 'Nut Allergy', 'Dairy-Free']`). No "Other" free-text option or event-specific dietary categories (kosher, halal, allergies for children).
- **P2**: No accessibility needs field in RSVP. Missing wheelchair access, hearing assistance, etc.

### Changes Needed
1. Change title block (lines 2-4) and welcome text (lines 278-282) to "Experience Planning" framing.
2. Replace "travel recommendations" with event-aware logistics: group shuttle, event schedule, dress code, etc.
3. Add event-type context to the invite API and display event-specific fields (ceremony vs. reception timing, etc.).
4. Add accessibility needs checkbox group to RSVP form.
5. Make dietary restrictions configurable per-event or at least add "Other" field.

### Effort Estimate
- Medium (1-4hr)

---

## Page: my-itinerary.tsx
### Current State
- Detailed itinerary viewer with day-by-day timeline, transport legs, packages, metrics, logistics
- **Event support level: 2/5** — Very travel-centric in labels and metrics; logistics components are event-capable but the page framing is pure travel

### Issues Found
- **P0**: "Trip" terminology everywhere. Line 252: `// User is the trip owner`. Line 336: `Itinerary Not Found`. Line 338: `Back to My Trips`. Line 369: `Traveloure Itinerary` badge. Line 392: `{data.travelers} traveler{data.travelers > 1 ? 's' : ''}`. Line 459: `Trip Strategy`. Line 686: `Transport Package` / `All transportation included in your trip`. Line 737: `Your stays during the trip`. Line 952: `TripLogisticsDashboard` prop `tripName={data?.title || data?.destination || "Trip"}`.
- **P0**: Metrics are travel-only. Line 426-429: `Traveloure Score` / `Based on balance, pacing, and wellness optimization` — these are vacation metrics, not event metrics. No "Event Timeline Score", "Guest Satisfaction", "Vendor Coordination Status".
- **P1**: No event-specific timeline anchors. The logistics tab imports `TemporalAnchorManager`, `ScheduleValidator`, `EnergyBudgetDisplay`, `AnchorSuggestionsPanel` which DO support event anchors (ceremony, rehearsal, etc.), but the page doesn't surface event-specific labels or default to event mode.
- **P1**: No guest/attendee management view on this page. For an event planner, the itinerary should show WHO is attending each activity, not just WHAT the activity is.
- **P2**: Transport hub is personal-travel only. The `TransportHub` (line 969) and `InlineTransportSelector` (line 659) are for individual transport legs, not group shuttles or event logistics.

### Changes Needed
1. Rename all "trip" labels to "experience" or "event" throughout (lines 252, 338, 369, 392, 459, 686, 737, 952).
2. Add event-mode toggle to switch metrics from travel-wellness to event-coordination.
3. Add attendee roster view to each day/activity.
4. Add group transport booking mode in addition to individual transport legs.

### Effort Estimate
- Large (4-8hr) due to pervasive terminology and metric model changes

---

## Page: my-bookings.tsx
### Current State
- Booking status page with visa tracking, document checklists, and review flows
- **Event support level: 1/5** — Purely travel/booking focused; no event coordination features

### Issues Found
- **P0**: "Trip" terminology. Line 66: `tripId: string | null;`. Line 506-511: `View Itinerary` button links to `/my-itinerary/${booking.tripId}`. No event-specific booking tracking.
- **P1**: No event vendor booking tracking. For event planning, bookings should include venue rentals, catering contracts, florist, photographer — not just travel services.
- **P1**: No payment tracking for group events. The visa timeline (lines 48-107) is individual-travel specific; no group payment collection or vendor deposit tracking.
- **P2**: No RSVP-linked booking status. A guest's booking should be connected to their RSVP status.

### Changes Needed
1. Rename `tripId` references to `experienceId` or `eventId`.
2. Add vendor booking categories (venue, catering, entertainment, decor).
3. Add group payment and deposit tracking UI.

### Effort Estimate
- Medium (1-4hr)

---

## Page: optimize.tsx
### Current State
- AI optimization page for "Paris Trip" with cost/time saver plans
- **Event support level: 0/5** — Pure travel optimization; no event awareness at all

### Issues Found
- **P0**: Entire page is hardcoded for Paris travel. Line 294: `Optimize Your Paris Trip with AI`. Line 304-309: `Your Current Cart` lists Eiffel Tower, Louvre, food tour. Line 322: `2-3 Alternative Itineraries`. Line 459: `AI-Optimized Plans for Your Paris Trip`. All plans (lines 44-143) are Paris sightseeing.
- **P0**: No event types. No wedding, corporate, birthday, or proposal optimization modes. No vendor coordination optimization.
- **P1**: Missing event-specific optimization dimensions: guest convenience, venue proximity, group dining capacity, vendor reliability — instead only optimizes for individual cost, time, and "hidden gems".
- **P2**: No group booking optimization. Cannot optimize for multiple travelers with different needs (e.g., bridal party vs. family vs. children).

### Changes Needed
1. Remove hardcoded Paris content and make destination-agnostic.
2. Add event-type selector (wedding, corporate, birthday, proposal) with event-specific optimization criteria.
3. Add vendor coordination and group logistics optimization.
4. Rename all "trip" references to "experience" or "event".

### Effort Estimate
- XL (8+hr) — requires significant refactoring of hardcoded content and optimization model

---

## Page: quick-start-itinerary.tsx
### Current State
- AI quick-start itinerary generator with destination, dates, adults/kids, interests, pace
- **Event support level: 1/5** — Has `experienceType` dropdown but defaults to "travel" and the generated output is travel-only

### Issues Found
- **P0**: "Trip" terminology. Line 468: `Tell us about your trip and we'll create a personalized itinerary`. Line 650: `Generate AI Itinerary`. Line 673: `Creating Your Personalized Itinerary`. Line 676: `craft the perfect trip for you`. Line 807: `Trip Overview`. Line 856: `Customize This Trip`. Line 869: `Send to Expert`. Line 883: `Travel Tips`.
- **P0**: Experience type dropdown (line 185) defaults to `"travel"` and the fallback (line 507) is also `Travel`. The API call (line 201) sends to `/api/quick-start-itinerary` which doesn't appear to have event-specific generation logic.
- **P1**: No event-specific fields. No venue selection, event date, guest count, event type-specific interests (e.g., "ceremony venue", "reception catering", "corporate meeting space"). The `INTEREST_OPTIONS` (lines 129-135) are only culture, food, adventure, nature, nightlife.
- **P1**: Generated itinerary is travel-only. The `DayItinerary` interface (lines 92-99) includes `activities`, `meals`, `transportation` — no event milestones, vendor bookings, or rehearsal schedules.
- **P2**: The `handleSendToExpert` (line 263) creates a `trip` object and navigates to `/discover` with `showExperts=true` — no event-specific expert routing.

### Changes Needed
1. Change all "trip" terminology to "experience" or "event".
2. Make `experienceType` default dynamic and add event-specific options (wedding, corporate, birthday, proposal).
3. Add event-specific interest options and generation parameters.
4. Add event milestone fields to the generated itinerary model.

### Effort Estimate
- Large (4-8hr)

---

## Page: transportation-booking.tsx
### Current State
- 12Go ground transportation booking widget for Southeast Asia routes
- **Event support level: 0/5** — Pure inter-city travel booking; no event awareness

### Issues Found
- **P0**: Only personal travel routes. Lines 10-17: `bangkok → chiang-mai`, `phuket → phi-phi`, etc. No event shuttle booking, no bridal party transport, no airport-to-venue transfers.
- **P0**: Title says "Book Ground Transportation" (line 33) with subtext "Trains, buses, ferries and more across Southeast Asia" — purely travel.
- **P1**: No group booking support. No "Book shuttle for X guests" or "Reserve multiple seats for group".
- **P1**: No event-specific transport types. Missing: limousine service, guest shuttle buses, bridal car rentals, corporate coach hire.
- **P2**: No integration with event logistics. The `TwelveGoWidget` is a standalone widget; not connected to `tripId`, `experienceId`, or guest lists.

### Changes Needed
1. Add event transport mode: group shuttles, venue transfers, bridal transport, corporate coaches.
2. Connect to experience/trip context to show relevant routes (e.g., airport to venue, hotel to event space).
3. Add group booking quantity selector.
4. Rename page context from "travel" to "event logistics".

### Effort Estimate
- Medium (1-4hr) — mainly widget configuration and UI additions

---

## Page: itinerary-comparison.tsx
### Current State
- AI itinerary comparison with variants, metrics, travel pulse, and cart application
- **Event support level: 1/5** — Travel optimization with some "experience" terminology but no event coordination

### Issues Found
- **P0**: "Trip" terminology. Line 731: `{data?.comparison?.destination} - {data?.comparison?.travelers || 1} traveler(s)`. Line 861: `if the trip is already well-optimized`. Line 634: `setLocation(\`/trip/${result.tripId}?optimized=1\`)`. Multiple references to `travelers`, `travelTime`, `tripId`.
- **P0**: `TravelPulse` data (lines 467-498) is city travel intelligence (crowd levels, weather, budget) — no event venue intelligence or vendor availability.
- **P1**: No event variant comparison. Cannot compare "outdoor ceremony vs. indoor ceremony" or "buffet vs. plated dinner" — only compares travel activities, hotels, and transport.
- **P1**: Metrics are travel-only. `totalTravelTime`, `freeTimeMinutes`, `optimizationScore`, `balance_score`, `wellness_score`, `pace_score`, `diversity_score` (lines 672-700) — all vacation metrics. No "guest experience score", "vendor coordination score", "timeline feasibility score".
- **P2**: `expertBookingMutation` (line 420) sends to `/api/expert-booking-requests` with generic notes — no event-specific expert categories (wedding planner, corporate event coordinator).

### Changes Needed
1. Rename all `travelers` to `attendees` or `guests`, `tripId` to `experienceId`.
2. Add event-specific variant dimensions (venue, catering, decor, entertainment).
3. Replace TravelPulse with EventPulse: venue availability, vendor pricing, seasonal event factors.
4. Add event-specific metrics.

### Effort Estimate
- Large (4-8hr)

---

## Page: global-calendar.tsx
### Current State
- City-level event calendar showing festivals, sporting events, conferences, holidays
- **Event support level: 2/5** — Shows external city events but not user-created event milestones

### Issues Found
- **P0**: Title says "Global Travel Calendar" (line 129). Subtext: "Plan around festivals, holidays, and peak seasons. See crowd and price predictions for any destination." (lines 131-133) — purely travel framing.
- **P0**: Event types are only external city events. Line 53-59: `festival`, `sporting`, `conference`, `holiday` — no user event types like "wedding ceremony", "rehearsal", "corporate dinner", "birthday party".
- **P1**: No personal event overlay. The calendar shows city-wide events but doesn't let users overlay their own event milestones (rehearsal, ceremony, reception) on the same calendar.
- **P1**: No event milestone tracking. No "Rehearsal dinner: 2 days before", "Ceremony: Day 1 at 4pm", "Reception: Day 1 at 6pm".
- **P2**: The API is `/api/travelpulse/calendar/${city}` (line 92) — no integration with personal event data.

### Changes Needed
1. Rename to "Global Event Calendar" or "Experience Calendar".
2. Add user event overlay: show personal event milestones on the calendar alongside city events.
3. Add event-type filter for user events (rehearsal, ceremony, reception, corporate meeting, etc.).
4. Change API to merge personal event data with city intelligence.

### Effort Estimate
- Medium (1-4hr)

---

## Page: help-me-decide.tsx
### Current State
- Discovery page with pre-researched trips, services, articles, events, and TravelPulse
- **Event support level: 1/5** — Pre-researched trips are all vacation packages; no event packages

### Issues Found
- **P0**: "Trip" terminology everywhere. Line 315: `Expert-Curated Trips`. Line 321: `Browse our collection of pre-researched, expert-approved trip packages`. Line 342: `Find Trips`. Line 403: `Trip Packages`. Line 462: `Compare AI Alternatives` for trips. Line 699: `View Details` for trips. Line 833: `Build Your Own Trip`.
- **P0**: Pre-researched trips (lines 72-163) are all vacations: "Discover Kyoto's Ancient Temples", "Amalfi Coast Dream Escape", "Bali Wellness Retreat", "Costa Rica Adventure Week", "Paris Family Discovery", "Moroccan Desert Adventure". No event packages like "Wedding in Tuscany", "Corporate Retreat in Barcelona", "Birthday Celebration in Paris".
- **P1**: No event category in filters. Lines 63-70: categories are `all`, `adventure`, `cultural`, `relaxation`, `romantic`, `family`. Missing: `wedding`, `corporate`, `birthday`, `proposal`.
- **P1**: The "Upcoming Events" tab (line 790) uses `GlobalCalendar` which is city events, not bookable event packages.
- **P2**: No event expert profiles. The "Talk to an Expert" button (line 822) doesn't differentiate wedding planners from corporate event coordinators.

### Changes Needed
1. Rename all "trip" references to "experience" or "event".
2. Add event-specific pre-researched packages and categories.
3. Add event expert specialization filtering.
4. Add event package booking flow (venue + catering + entertainment bundles).

### Effort Estimate
- Large (4-8hr)

---

## Page: shared-trip.tsx
### Current State
- Public shared trip view with read-only day-by-day itinerary
- **Event support level: 1/5** — Framed as "trip" sharing; no event-specific sharing features

### Issues Found
- **P0**: "Trip" terminology. Line 22-23: `interface SharedTripData` / `trip: SharedTripData`. Line 65: `Loading trip plan…`. Line 80: `This trip plan link may have expired`. Line 85: `Plan your own trip`. Line 146: `You are viewing a shared trip plan`. Line 218: `Inspired by this trip?`. Line 220: `Create your own personalised plan`. Line 225: `Plan my own trip`.
- **P0**: No event context. The shared view shows activities but doesn't say WHAT event this is (wedding, corporate, birthday). No event branding, dress code, or special instructions.
- **P1**: No guest-specific view. All guests see the same generic itinerary. There's no "Your shuttle leaves at 3pm" or "Your hotel check-in is at 2pm" personalization.
- **P1**: No RSVP integration in shared view. The shared page is read-only; guests can't RSVP or confirm attendance from here.
- **P2**: No event photo gallery or welcome message. The hero uses a generic `picsum.photos` image (line 103) instead of event-specific imagery or couple's photo for a wedding.

### Changes Needed
1. Rename all "trip" to "experience" or "event".
2. Add event type banner and context (wedding, corporate, etc.) with event-specific branding.
3. Add personalized guest view with their specific logistics (transport, hotel, timing).
4. Add inline RSVP and confirmation buttons for invited guests.
5. Add event welcome message and photo gallery.

### Effort Estimate
- Medium (1-4hr)

---

## Page: executive-assistant.tsx
### Current State
- Main EA overview page with trip stats, upcoming/recent trips, quick actions, and alerts
- **Event support level: 2/5** — Recognizes event types (wedding, honeymoon, corporate) but UI is still trip-centric

### Issues Found
- **P0**: "Trip" terminology dominant. Line 109: `Manage and oversee all travel operations`. Line 125: `Total Trips`. Line 138: `Active Trips`. Line 151: `Completed`. Line 164: `Drafts`. Line 174: `Upcoming Trips`. Line 244: `Recently Created` (subtitle says "Latest trips added"). Line 298: `All Trips`.
- **P1**: Event types are shown as badges (line 330-332: `trip.eventType`) but the UI doesn't use them for organization. No "Events" tab separate from "Trips".
- **P1**: Quick actions are travel-only. Line 382: `Plan Experience` (good), but line 393: `Open AI Assistant`, line 402: `Manage Vendors` — vendors is only a link, not integrated.
- **P2**: Stats are trip counts only. No "Events managed this month", "Vendors confirmed", "Guest RSVPs tracked".

### Changes Needed
1. Rename all "trip" stats and labels to "experiences" or add "Events" alongside "Trips".
2. Add event-specific stats and quick actions: "Track Guest RSVPs", "Confirm Vendor Bookings", "Review Event Timeline".
3. Separate trips (travel) from events (local) in the tabs and stats.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/dashboard.tsx
### Current State
- EA dashboard with client stats, active trips, AI tasks, messages, quick actions
- **Event support level: 2/5** — Very travel/EA-centric; event coordination is implicit at best

### Issues Found
- **P0**: "Trip" terminology. Line 74: `Active Trips` stat card. Line 78: `<Plane className="w-5 h-5" />`. Line 225: `Manage Trips` quick action.
- **P1**: No event management quick actions. Quick actions are: Send Update, Delegate to AI, Book Event, Manage Trips, Arrange Travel, Order Gift, Reports. "Book Event" is present but generic; missing: "Track RSVPs", "Confirm Catering", "Review Vendor Contracts".
- **P1**: No event-specific client view. The clients list (lines 131-147) shows only name and email. No "Event Type", "Event Date", "Guest Count", or "RSVP Status".
- **P2**: AI tasks stat is always 0 (line 88). No event-specific AI task types.
- **P2**: No calendar integration showing upcoming event milestones.

### Changes Needed
1. Rename "Active Trips" to "Active Experiences" or split into "Trips" and "Events".
2. Add event-specific client columns and quick actions.
3. Add upcoming event milestones widget to dashboard.
4. Add event-specific AI task templates.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/trips.tsx
### Current State
- Managed trips list with create-trip dialog for clients
- **Event support level: 3/5** — Has event type dropdown (vacation, business, event, wedding, celebration) but UI is still trip-centric

### Issues Found
- **P0**: Page title and URL say "trips". Line 143: `Managed Trips`. Line 145: `Trips you coordinate on behalf of your clients`. Line 151: `New Trip`. Line 293: `No managed trips yet`. Line 300: `Create your first trip`.
- **P1**: Event type dropdown (lines 233-238) includes `vacation`, `business`, `event`, `wedding`, `celebration` — good, but the UI doesn't change based on selection. Creating a "wedding" still shows generic trip fields; no venue selector, guest list import, or event timeline.
- **P1**: No guest/attendee management in the trip card. The card shows destination, dates, client name, and expert status (lines 307-338) — but no guest count, RSVP summary, or venue status.
- **P2**: Special requests textarea (line 260) is free-text only. No structured event fields: venue preference, catering needs, entertainment type, decor theme.

### Changes Needed
1. Rename page to "Managed Experiences" or split into "Trips" and "Events".
2. Add event-type conditional form fields: venue selector for weddings, meeting space for corporate, etc.
3. Add guest/attendee count and RSVP status to trip cards.
4. Add structured event preference fields.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/events.tsx
### Current State
- Events management page with stats, filters, and event list
- **Event support level: 3/5** — Has event list but stats are hardcoded, event types are limited, and no integration with event planning tools

### Issues Found
- **P0**: Stats are hardcoded (lines 64-84). `28 Active Events`, `12 This Week`, `5 Pending Approval`, `3 Need Attention` — these are static demo values, not real data.
- **P1**: Event type filter (lines 116-120) only has: `dinner`, `meeting`, `travel`, `personal`. Missing: `wedding`, `ceremony`, `reception`, `birthday`, `proposal`, `corporate retreat`, `conference`.
- **P1**: No event planning integration. The event cards show title, executive, date, venue, guests, status (lines 152-199) — but no vendor status, RSVP summary, budget tracking, or timeline validation.
- **P1**: No event creation form. The "Create New Event" button (line 56) is just a button with no dialog or form behind it.
- **P2**: The "Gift Needed" badge (lines 159-161) is the only event-specific feature, but it's a binary flag without integration with the Gifts page.

### Changes Needed
1. Replace hardcoded stats with real API data.
2. Expand event type filter to include all experience types.
3. Add event creation form with venue, date, guest list, budget, and vendor selection.
4. Add RSVP summary and vendor status to event cards.
5. Integrate with Gifts page for giftNeeded events.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/clients.tsx
### Current State
- Client roster with contact info, payment info, push notifications
- **Event support level: 2/5** — Good client management but no event-specific client tracking

### Issues Found
- **P1**: No event history per client. The client card shows payment info and notes (lines 107-288) but no "Events this client is attending", "Past events", "RSVP history".
- **P1**: No client role tagging. Can't tag a client as "Bride", "Groom", "Best Man", "CEO", "Event Coordinator", "Guest".
- **P2**: Push notification templates (lines 244-261) are generic. No event-specific templates: "Your hotel block is reserved", "The ceremony starts at 4pm", "Please confirm your dietary restrictions".
- **P2**: Notes field (line 387) is free-text. No structured event preferences: seating preferences, dietary restrictions, accessibility needs, gift preferences.

### Changes Needed
1. Add event history and upcoming events per client.
2. Add client role tagging for events.
3. Add event-specific notification templates.
4. Add structured event preference fields.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/venues.tsx
### Current State
- Venue search and saved venues list with stats
- **Event support level: 3/5** — Has venue types (Restaurant, Hotel) but missing event-specific venue categories

### Issues Found
- **P1**: Venue types are limited to `Restaurant` and `Hotel` (lines 94-105 stats). Missing: `Wedding Venue`, `Conference Center`, `Event Space`, `Outdoor Garden`, `Beach Venue`, `Banquet Hall`, `Rooftop`.
- **P1**: No venue availability or booking integration. The "Book" button (line 154) is a placeholder; no actual booking flow, date checking, or availability query.
- **P1**: No venue-event linking. Saved venues aren't linked to specific events or clients. No "Used for Sarah's Wedding" or "Reserved for Corporate Retreat".
- **P2**: No venue comparison feature. Can't compare two venues side-by-side for capacity, price, availability, or amenities.
- **P2**: No venue vendor integration. No link to caterers, florists, photographers, or AV services that work with each venue.

### Changes Needed
1. Add event-specific venue categories.
2. Implement venue booking flow with date availability.
3. Link venues to events and clients.
4. Add venue comparison and vendor integration.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/calendar.tsx
### Current State
- Multi-event coordination calendar with executive matrix and today's events
- **Event support level: 2/5** — Has event coordination concept but is executive-centric, not event-guest-centric

### Issues Found
- **P0**: Calendar is designed for executives, not events. The matrix rows are "Executive" names (lines 82-88) with day codes (D=dinner, M=meeting, G=gift, F=flight, etc.). No event rows like "Rehearsal", "Ceremony", "Reception", "Guest Shuttle".
- **P1**: Legend (lines 19-28) is executive-task oriented: `Dinner`, `Meeting`, `Gift`, `Board`, `Weekend`, `Flight`, `Call`, `Presentation`, `Travel`. Missing: `Ceremony`, `Reception`, `Rehearsal`, `Vendor Setup`, `Guest Check-in`, `Catering`, `Entertainment`.
- **P1**: No guest timeline view. The calendar shows what executives are doing, not what guests need to do or where they need to be.
- **P2**: "AI Coordination Assistant" (lines 222-243) lists: detect conflicts, suggest meeting times, coordinate multi-city travel, track gifts, draft communications, research venues. No "coordinate guest arrivals", "manage vendor setup times", "track RSVP deadlines", "monitor catering headcounts".
- **P2**: The `executives` array (line 17) is empty. No actual data integration.

### Changes Needed
1. Add event-centric calendar view: show event milestones, vendor setup times, guest arrivals.
2. Expand legend to include event-specific codes.
3. Add guest timeline overlay to the calendar.
4. Add event-specific AI coordination tasks.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/communications.tsx
### Current State
- Communications center with email, messages, AI drafts, templates, and stats
- **Event support level: 2/5** — Good communication infrastructure but no event-specific templates or guest communication

### Issues Found
- **P1**: Templates are generic. Lines 191-205: `Thank You Note`, `Booking Confirmation`, `Event Reminder`, `Travel Itinerary`, `Status Update`. Missing: `RSVP Reminder`, `Dietary Restrictions Request`, `Dress Code Notice`, `Venue Directions`, `Plus-One Confirmation`, `Welcome Message`.
- **P1**: No guest list communication. Can't send to "All Confirmed Guests" or "All Pending RSVPs" — only to individual executives/recipients.
- **P1**: No event-specific communication tracking. No "Sent ceremony details to 45 guests" or "Reminder sent to 12 pending RSVPs".
- **P2**: Stats (lines 216-229) are hardcoded: `24 Emails Sent`, `38 Messages`, `12 Calls Logged`, `15 AI Drafted`. No breakdown by event or communication type.

### Changes Needed
1. Add event-specific communication templates.
2. Add guest list segmentation for bulk communication (all guests, confirmed only, pending only, etc.).
3. Add event-specific communication tracking and stats.
4. Add RSVP reminder automation.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/gifts.tsx
### Current State
- Gift management with occasions, AI suggestions, and history
- **Event support level: 3/5** — Good for executive gifting but not integrated with event guest gifts or favors

### Issues Found
- **P1**: Gift management is executive-centric (lines 21-24: `executiveName`, `occasion`, `recipient`). No event guest gift tracking: "Welcome bags for 50 guests", "Bridesmaid gifts", "Corporate swag for attendees".
- **P1**: No bulk gift ordering. Can't order 50 identical items for event guests; only individual executive gifts.
- **P2**: Stats are hardcoded (lines 57-81). No real data.
- **P2**: AI suggestions (lines 133-177) are empty arrays. No actual gift recommendation logic.

### Changes Needed
1. Add event guest gift tracking: welcome bags, favors, bridal party gifts, corporate swag.
2. Add bulk ordering and budget tracking for group gifts.
3. Integrate with event page so gifts are linked to specific events.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/executives.tsx
### Current State
- Executive management with profiles, preferences, family info, and travel history
- **Event support level: 1/5** — Purely executive/assistant paradigm; not event-guest or event-attendee management

### Issues Found
- **P0**: The entire page is for "Executives", not "Guests" or "Attendees". For event planning, we need to manage guests, not just executives.
- **P0**: Preferences are travel-only (lines 142-154): `travelClass`, `hotelBrands`, `dietary`, `seating`. No event preferences: `dietary restrictions`, `accessibility needs`, `plus-one status`, `table assignment preference`, `speech/presentation role`.
- **P1**: No event role assignment. Can't tag an executive/guest as "MC", "Speaker", "Bridal Party", "VIP Guest", "Vendor".
- **P1**: No event attendance history. The "View All Events" button (line 197) has no backing data; no "Events attended", "RSVP history", "Dietary restrictions from past events".
- **P2**: Family info (lines 165-179) is good for weddings but is nested under executive preferences. Should be a first-class guest feature.

### Changes Needed
1. Add "Guest/Attendee Management" mode alongside "Executive Management".
2. Add event-specific guest preferences and roles.
3. Add event attendance history and RSVP tracking per person.
4. Make family/dietary info a first-class feature, not nested under travel preferences.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/ai-assistant.tsx
### Current State
- AI task delegation with templates, pending review, stats, and settings
- **Event support level: 2/5** — Templates have some event awareness but are executive-centric

### Issues Found
- **P1**: Quick templates (lines 95-99) are executive-focused: `Research hotels in [city] for [executive]`, `Draft thank-you note for [executive]'s [event]`, `Find gift options for [executive]'s [occasion]`, `Coordinate travel for [executive]'s [trip]`, `Research restaurants in [city]`. Missing: `Track RSVPs for [event]`, `Confirm catering headcount for [event]`, `Check venue availability for [date]`, `Draft welcome message for [event] guests`.
- **P1**: No event-specific AI tasks. The task types don't include "RSVP Tracking", "Vendor Coordination", "Timeline Validation", "Guest Communication".
- **P2**: AI stats (lines 47-55) are all zeros/empty. No real metrics.
- **P2**: No integration with event data. The AI can't pull guest lists, event timelines, or vendor contracts to make intelligent suggestions.

### Changes Needed
1. Add event-specific AI templates and task types.
2. Integrate AI with event data (guest lists, RSVPs, vendor contracts, timelines).
3. Add event coordination automation: auto-remind pending RSVPs, validate vendor payment schedules, suggest timeline adjustments.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/profile.tsx
### Current State
- EA profile settings with personal info, notifications, security
- **Event support level: 2/5** — Generic profile; no event-specific preferences

### Issues Found
- **P2**: Job title is hardcoded to "Executive Assistant" (line 104). No option for "Event Coordinator", "Wedding Planner", "Travel Concierge".
- **P2**: Notification preferences (lines 20-26) are generic: `Urgent event alerts`, `AI task completions`, `Calendar reminders`, `Executive updates`, `Weekly summary emails`. No "RSVP deadline alerts", "Vendor payment due alerts", "Guest dietary restriction updates".
- **P2**: No event specialization profile. Can't set expertise: "Wedding Planning", "Corporate Events", "Birthday Parties".

### Changes Needed
1. Add job title options for event coordinators.
2. Add event-specific notification preferences.
3. Add event specialization/expertise fields.

### Effort Estimate
- Small (<1hr)

---

## Page: ea/settings.tsx
### Current State
- EA settings with AI, display, calendar, email integration, and verification/payouts
- **Event support level: 2/5** — Good infrastructure but no event-specific settings

### Issues Found
- **P1**: AI settings (lines 195-201) are generic: `Auto-delegate routine tasks`, `AI draft communications`, `Smart calendar suggestions`, `Proactive travel recommendations`, `Gift reminders`. Missing: `Auto-remind pending RSVPs`, `Proactive vendor payment tracking`, `Guest dietary alert notifications`.
- **P1**: Email integration (lines 360-396) is Outlook/Gmail/Slack. No event platform integrations: event registration platforms, RSVP tools, wedding planning apps, corporate event software.
- **P2**: Calendar settings (lines 296-357) are generic. No event-specific calendar views: "Guest arrival timeline", "Vendor setup schedule", "Rehearsal timeline".

### Changes Needed
1. Add event-specific AI settings.
2. Add event platform integrations (RSVP tools, wedding apps, event registration).
3. Add event-specific calendar view options.

### Effort Estimate
- Medium (1-4hr)

---

## Page: ea/reports.tsx
### Current State
- Reports and analytics with weekly stats, monthly metrics, top activities, and AI performance
- **Event support level: 1/5** — All stats are executive/travel focused; no event reports

### Issues Found
- **P0**: Weekly stats (lines 19-25) are all executive EA metrics: `eventsManaged: 24`, `aiTasksCompleted: 45`, `timeSaved: 18`, `executivesSupported: 8`, `travelArranged: 3`, `giftsOrdered: 2`. No event metrics: `guestsInvited`, `rsvpsCollected`, `vendorsConfirmed`, `budgetSpent`, `timelineValidated`.
- **P0**: Top activities (lines 33-39) are all executive tasks: `Travel Coordination`, `Restaurant Bookings`, `Meeting Scheduling`, `Gift Procurement`, `Venue Research`. Missing: `Guest RSVP Tracking`, `Vendor Contract Management`, `Catering Headcount Coordination`, `Event Timeline Validation`.
- **P1**: Report generation buttons (lines 223-234) are: `Weekly Summary`, `Expense Report`, `Travel Summary`, `Executive Activity`. Missing: `Event Summary`, `Guest RSVP Report`, `Vendor Status Report`, `Budget vs. Actual Report`.
- **P2**: All stats are hardcoded. No real data integration.

### Changes Needed
1. Add event-specific report types and metrics.
2. Replace hardcoded stats with real data from event APIs.
3. Add guest RSVP, vendor status, and budget tracking reports.

### Effort Estimate
- Large (4-8hr)

---

## Page: ea/travel.tsx
### Current State
- Travel coordination with active trips, upcoming travel, segments, and AI travel assistant
- **Event support level: 1/5** — Pure travel management; no event logistics integration

### Issues Found
- **P0**: Entire page is travel-centric. Title: `Travel Coordination` (line 39). Subtitle: `Manage executive travel arrangements` (line 42). Button: `Arrange New Trip` (line 45). Stats: `Active Trips`, `Pending Approval`, `Upcoming`, `Confirmed` (lines 51-78). All segments are `flight` and `hotel` (lines 141-172).
- **P1**: No event transport management. Missing: `Guest Shuttle Booking`, `Venue Transfer Coordination`, `Bridal Party Transport`, `Corporate Coach Hire`.
- **P1**: No integration with event timelines. Travel is managed independently; can't see that "Flight must arrive 3 hours before ceremony" or "Hotel checkout must be after reception ends".
- **P2**: AI travel assistant (lines 212-231) only handles flights, hotels, multi-city itineraries, booking modifications, and frequent flyer programs. No "coordinate guest airport pickups" or "schedule group transport to venue".

### Changes Needed
1. Add event transport modes: group shuttles, venue transfers, bridal transport.
2. Integrate travel with event timeline constraints (e.g., arrival before ceremony).
3. Add guest arrival coordination and pickup scheduling.
4. Rename from "Travel Coordination" to "Travel & Event Logistics".

### Effort Estimate
- Large (4-8hr)

---

## Component: GuestInviteManager.tsx
### Current State
- Event organizer component to create and manage guest invites with RSVP tracking
- **Event support level: 3/5** — Good invite management but still travel-oriented in description and wedding-centric in API

### Issues Found
- **P0**: Description says "travel recommendations" (line 236-237). Still framed as travel.
- **P1**: No event type awareness. The component takes `eventName`, `eventDestination`, `eventDate` (lines 62-67) but doesn't display event type (wedding, corporate, etc.) or event-specific details (ceremony time, dress code, venue map).
- **P1**: No bulk RSVP analytics. Stats show total, accepted, pending, origin cities (lines 296-335) but no "Response rate by guest type", "Dietary restriction summary", "Accessibility needs count".
- **P2**: The API is `/api/events/${experienceId}/invites` (line 87) which is good, but the invite link description still says "travel recommendations based on their city of origin" (line 236-237).

### Changes Needed
1. Change description to "event logistics and recommendations".
2. Add event type display and event-specific details in the invite manager.
3. Add bulk analytics: dietary summary, accessibility needs, plus-one counts.

### Effort Estimate
- Small (<1hr)

---

## Component: logistics/multi-person-coordination.tsx
### Current State
- Group coordination with RSVP, payments, communication, and requirements tabs
- **Event support level: 4/5** — Strong event coordination support! Has RSVPs, payments, dietary restrictions, accessibility needs, group messaging

### Issues Found
- **P0**: The component name and props use `experienceId` and `experienceName` (lines 56-58, 70-71) which is good, but the title says `Group Coordination` (line 158) and description says `Manage RSVPs, payments, and communications for {experienceName}` (line 160) — could be more explicit about event coordination.
- **P1**: No event type-specific fields. The component handles generic RSVPs, payments, and requirements but doesn't show event-specific info: "Ceremony at 4pm, Reception at 6pm", "Dress code: Black Tie", "Venue address and map".
- **P1**: Payment tracking is simple. Lines 281-373 show basic payment badges. No vendor payment tracking, deposit tracking, or installment scheduling.
- **P2**: Group messaging (lines 376-420) has no event announcement templates. The "Send Announcement" button (line 382) has no template picker.
- **P2**: No role assignment. Can't tag attendees as "Bridal Party", "Family", "VIP", "Speaker", "Vendor".

### Changes Needed
1. Add event type context display (ceremony timing, dress code, venue info).
2. Add attendee role tagging.
3. Add announcement templates for event updates.
4. Enhance payment tracking with vendor deposits and installments.

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/trip-logistics-dashboard.tsx
### Current State
- Logistics dashboard with participants, payments, contracts, budget, alerts, and planning tabs
- **Event support level: 4/5** — Very event-capable! Has dietary restrictions, accessibility needs, participant roster, payment collection, vendor contracts, budget tracking, timeline validation, and energy budget

### Issues Found
- **P0**: Component name and props use `tripId` and `tripName` (lines 31-36, 108-112). Should be `experienceId` and `experienceName`.
- **P0**: Title says `Logistics Dashboard` (line 172) and subtitle says `Real-time planning intelligence for {tripName}` (line 175). Should be event-framed.
- **P1**: No event milestone display. The dashboard shows participants, budget, and planning but no "Ceremony in 2 days", "Catering headcount confirmed", "Photographer arrival at 10am".
- **P2**: The `Participant` interface (lines 95-106) has `role` and `status` but the UI doesn't show role assignment or filtering by role (e.g., "Show only bridal party").
- **P2**: Budget categories (line 393) use `cat.category.replace(/_/g, " ")` which is generic. No event-specific categories: `venue`, `catering`, `photography`, `flowers`, `entertainment`, `decor`.

### Changes Needed
1. Rename props from `tripId`/`tripName` to `experienceId`/`experienceName`.
2. Add event milestone widget to dashboard.
3. Add participant role filtering and display.
4. Add event-specific budget categories.

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/vendor-management.tsx
### Current State
- Vendor management with contracts, payments, communication, and overview tabs
- **Event support level: 4/5** — Strong event vendor support! Has contract status, payment milestones, communication log, and reminders

### Issues Found
- **P1**: No event type vendor categories. The `Vendor` interface (lines 28-48) has `category` as a free-text string. No predefined event vendor types: `Venue`, `Catering`, `Photography`, `Florist`, `Entertainment`, `AV/Technical`, `Decor`, `Transportation`.
- **P1**: No vendor-event linking. Vendors are managed in isolation; no "Vendors for Sarah's Wedding" or "Vendors for Corporate Retreat".
- **P2**: No vendor review/rating system. The `rating` field exists (line 46) but isn't displayed or aggregated.
- **P2**: Communication log (lines 409-511) is good but lacks event context. No "Discussed menu changes for wedding reception" or "Confirmed AV setup for corporate event".

### Changes Needed
1. Add predefined event vendor categories.
2. Link vendors to specific events/experiences.
3. Add vendor rating display and review system.
4. Add event context to communication log.

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/wedding-anchor-presets.tsx
### Current State
- Wedding/proposal schedule template generator with preset anchors and day boundaries
- **Event support level: 4/5** — Very event-specific! Supports wedding, proposal, and generic trip templates

### Issues Found
- **P0**: Component name is `WeddingAnchorPresets` (line 52) but it supports `wedding`, `proposal`, and generic `trip`. Should be renamed to `EventAnchorPresets`.
- **P1**: Missing event types. The template slug check (line 116) only handles `wedding`, `proposal`, and default `trip`. Missing: `corporate`, `birthday`, `anniversary`, `baby_shower`, `graduation`.
- **P1**: Anchor types (lines 42-50) are wedding/proposal focused: `ceremony_time`, `reception_start`, `rehearsal_time`, `hair_makeup_start`, `photographer_arrival`, `proposal_moment`. Missing: `keynote_speech`, `dinner_service`, `guest_arrival`, `vendor_setup`, `presentation_start`, `cake_cutting`, `first_dance`.
- **P2**: The styling is pink/purple wedding-themed (line 112: `border-pink-200 bg-gradient-to-br from-pink-50/50 to-purple-50/50`). Should be neutral or theme-aware.

### Changes Needed
1. Rename component to `EventAnchorPresets`.
2. Add more event types and corresponding anchor presets.
3. Make styling neutral or event-type-aware.
4. Add generic event anchor types (keynote, dinner, vendor setup, etc.).

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/temporal-anchor-manager.tsx
### Current State
- Temporal anchor manager with anchor types, create/edit, and list view
- **Event support level: 4/5** — Good event anchor support! Has ceremony, rehearsal, proposal, photographer, hair/makeup, reception

### Issues Found
- **P0**: Some anchor types are travel-only (lines 29-32): `flight_arrival`, `flight_departure`, `hotel_checkin`, `hotel_checkout`. These are fine but the list is travel-heavy.
- **P1**: Missing event anchor types. Lines 34-42: `pre_booked_tour`, `ceremony_time`, `rehearsal_time`, `proposal_moment`, `dinner_reservation`, `photographer_arrival`, `reception_start`, `hair_makeup_start`, `meeting_time`, `custom`. Missing: `guest_arrival`, `vendor_setup`, `catering_delivery`, `entertainment_soundcheck`, `decor_setup`, `rehearsal_dinner`, `welcome_reception`, `farewell_brunch`, `speech_toast`, `cake_cutting`.
- **P2**: Title says `Temporal Anchors` (line 165) and subtitle says `Fixed time commitments that everything else must work around` (line 167-168). Could be more event-specific: "Event milestones that constrain your timeline".

### Changes Needed
1. Add more event-specific anchor types.
2. Rename title/subtitle to be more event-oriented.
3. Group anchor types by category: Travel, Event Milestones, Vendor Setup, Personal.

### Effort Estimate
- Small (<1hr)

---

## Component: logistics/schedule-validator.tsx
### Current State
- Schedule validator that checks itinerary against temporal anchors and day boundaries
- **Event support level: 4/5** — Event-aware! Validates against ceremony, rehearsal, and other anchors

### Issues Found
- **P1**: The validation is generic. It checks for conflicts between itinerary items and anchors (lines 50-65) but doesn't have event-specific rules: "Hair & makeup must finish before ceremony", "Catering must arrive 2 hours before reception", "Guest shuttle must depart 30 minutes after reception ends".
- **P2**: No event-specific conflict messages. The `conflict` string (line 23) is generic; could be more descriptive for events.
- **P2**: No vendor setup time validation. Doesn't check if vendor setup anchors overlap with guest arrival or venue access times.

### Changes Needed
1. Add event-specific validation rules (hair/makeup before ceremony, catering before reception, etc.).
2. Add vendor setup time validation.
3. Make conflict messages more event-contextual.

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/energy-budget-display.tsx
### Current State
- Energy budget calculator showing daily energy depletion across trip activities
- **Event support level: 2/5** — Travel wellness concept; not directly relevant to event planning

### Issues Found
- **P0**: Entire concept is travel-centric. Title: `Energy Budget` (line 104). Subtitle: `Track daily energy to prevent burnout across your trip` (line 107). For event planning, energy/burnout is less relevant than timeline feasibility and vendor coordination.
- **P1**: No event-specific energy model. For a wedding, "energy" might mean "host stamina" or "guest engagement". For a corporate event, it might mean "attention span" or "networking fatigue". The current model doesn't adapt.
- **P2**: Could be repurposed for "Timeline Stress Indicator" — showing which days have too many back-to-back event milestones or vendor commitments.

### Changes Needed
1. Repurpose for event timeline stress analysis: show days with too many milestones, vendor conflicts, or tight transitions.
2. Rename from "Energy Budget" to "Timeline Feasibility" or "Event Pace Analyzer".
3. Add event-specific stress factors: host obligations, vendor transitions, guest travel times.

### Effort Estimate
- Medium (1-4hr)

---

## Component: logistics/anchor-suggestions-panel.tsx
### Current State
- AI-powered anchor suggestions with optimization tips and apply functionality
- **Event support level: 3/5** — Has event anchor types but is framed as trip optimization

### Issues Found
- **P0**: Framed as "trip" optimization. Title: `Smart Suggestions` (line 124). Subtitle: `AI-powered anchor recommendations for your trip` (line 128-129).
- **P1**: Missing event-specific suggestions. The `ANCHOR_ICONS` (lines 39-48) include `ceremony_time`, `proposal_moment`, `photographer_arrival`, `hair_makeup_start` — good, but missing `vendor_setup`, `catering_delivery`, `guest_welcome`, `speech_time`, `cake_cutting`.
- **P1**: No event-specific optimization tips. The `OptimizationTip` interface (lines 34-37) is generic. Could have event-specific tips: "Consider a welcome reception the day before the wedding for out-of-town guests", "Schedule corporate team-building after keynote, not before".
- **P2**: No event-type-aware suggestion engine. The `templateSlug` prop (line 52) is passed but not prominently used in the UI.

### Changes Needed
1. Rename subtitle to "AI-powered anchor recommendations for your event".
2. Add more event-specific anchor types and suggestions.
3. Add event-specific optimization tips based on event type.

### Effort Estimate
- Small (<1hr)

---

## Summary Table: Priority Ranking

| Page / Component | Event Support | Priority | Effort | Key Issues |
|------------------|-------------|----------|--------|------------|
| optimize.tsx | 0/5 | **P0** | XL | Hardcoded Paris travel, no event types |
| transportation-booking.tsx | 0/5 | **P0** | Medium | Only personal travel, no event shuttles |
| help-me-decide.tsx | 1/5 | **P0** | Large | All vacation packages, no event categories |
| shared-trip.tsx | 1/5 | **P0** | Medium | No event context, no guest personalization |
| ea/travel.tsx | 1/5 | **P0** | Large | Pure travel, no event logistics |
| ea/reports.tsx | 1/5 | **P0** | Large | All executive/travel stats, no event reports |
| ea/executives.tsx | 1/5 | **P0** | Large | Executive-centric, no guest/attendee management |
| my-itinerary.tsx | 2/5 | **P0** | Large | Pervasive "trip" terminology, travel-only metrics |
| global-calendar.tsx | 2/5 | **P0** | Medium | Travel calendar, no personal event overlay |
| executive-assistant.tsx | 2/5 | **P0** | Medium | Trip-centric, no event stats |
| ea/dashboard.tsx | 2/5 | **P0** | Medium | Trip-centric, no event quick actions |
| ea/communications.tsx | 2/5 | **P1** | Medium | No event templates, no guest segmentation |
| ea/gifts.tsx | 3/5 | **P1** | Medium | Executive-only, no guest favors |
| ea/venues.tsx | 3/5 | **P1** | Large | No event venue categories, no booking integration |
| ea/calendar.tsx | 2/5 | **P1** | Large | Executive matrix, no event milestones |
| ea/events.tsx | 3/5 | **P1** | Large | Hardcoded stats, limited event types, no creation form |
| ea/ai-assistant.tsx | 2/5 | **P1** | Medium | Executive templates, no event task types |
| quick-start-itinerary.tsx | 1/5 | **P1** | Large | Defaults to travel, no event generation |
| itinerary-comparison.tsx | 1/5 | **P1** | Large | Travel-only variants, no event metrics |
| my-bookings.tsx | 1/5 | **P1** | Medium | No vendor booking tracking |
| GuestInvitePage.tsx | 2/5 | **P1** | Medium | Travel-branded recommendations, wedding-only assumptions |
| GuestInviteManager.tsx | 3/5 | **P2** | Small | Travel-framed description, no event analytics |
| logistics/energy-budget-display.tsx | 2/5 | **P2** | Medium | Travel wellness concept, not event timeline |
| logistics/anchor-suggestions-panel.tsx | 3/5 | **P2** | Small | Trip-framed, missing event anchors |
| logistics/wedding-anchor-presets.tsx | 4/5 | **P2** | Medium | Name says wedding, missing event types |
| logistics/temporal-anchor-manager.tsx | 4/5 | **P2** | Small | Missing event anchor types |
| logistics/schedule-validator.tsx | 4/5 | **P2** | Medium | Generic validation, no event-specific rules |
| logistics/vendor-management.tsx | 4/5 | **P2** | Medium | No event vendor categories, no event linking |
| logistics/multi-person-coordination.tsx | 4/5 | **P2** | Medium | No event context display, no role assignment |
| logistics/trip-logistics-dashboard.tsx | 4/5 | **P2** | Medium | "trip" terminology, no event milestones |
| ea/profile.tsx | 2/5 | **P2** | Small | No event coordinator title options |
| ea/settings.tsx | 2/5 | **P2** | Medium | No event-specific AI settings |
| ea/trips.tsx | 3/5 | **P2** | Large | Trip-centric UI despite event type dropdown |
| ea/clients.tsx | 2/5 | **P2** | Medium | No event history per client |

---

## Cross-Cutting Themes

### 1. Terminology Refactoring
The most pervasive issue is "trip" / "travel" / "traveler" language. This appears in **every single page** and many components. A systematic find-and-replace is insufficient because:
- Some contexts genuinely ARE travel (flight booking, inter-city transport)
- Some contexts need to be ambiguous (a "trip" could be a wedding trip or a vacation)
- The data model uses `tripId` everywhere, which would require API changes

**Recommendation**: Introduce a terminology layer:
- `trip` → `experience` (when ambiguous)
- `traveler` → `guest` / `attendee` / `participant` (when at an event)
- `travel` → `travel` (when genuinely about flights/transport)
- `itinerary` → `timeline` / `schedule` (when event-focused)

### 2. Event Type Awareness
Only a few pages have event type dropdowns or awareness:
- `ea/trips.tsx` has `eventType` dropdown (vacation, business, event, wedding, celebration)
- `executive-assistant.tsx` shows event type badges
- `quick-start-itinerary.tsx` has `experienceType` dropdown

But the UI doesn't change based on event type. **Recommendation**: Add event-type conditional rendering:
- Wedding mode: show venue, ceremony time, reception time, bridal party, guest list, dress code
- Corporate mode: show meeting rooms, agenda, speaker schedule, AV requirements, team building
- Birthday mode: show cake, entertainment, age-appropriate activities, gift registry
- Proposal mode: show secret planning, photographer stealth, ring logistics, backup plans

### 3. Missing Event Coordination Features
The logistics components (`multi-person-coordination`, `vendor-management`, `trip-logistics-dashboard`) are actually quite event-capable! The problem is that the **pages don't use them for event coordination**. They import them as generic logistics widgets without event context.

**Recommendation**: Create an `EventCoordinationPage` that combines:
- `MultiPersonCoordination` (RSVPs, payments, dietary, accessibility, messaging)
- `VendorManagement` (contracts, payments, communication)
- `TripLogisticsDashboard` (budget, participants, alerts)
- `WeddingAnchorPresets` / `TemporalAnchorManager` (event timeline)
- `ScheduleValidator` (timeline feasibility)
- `GuestInviteManager` (invite links, RSVP tracking)

### 4. EA Event Support Gap
The EA pages are designed for executive assistants managing executive travel. For the "Experience Planning" model, the EA needs to become an **Event Coordinator** who manages:
- Guest lists and RSVPs (not just executive contacts)
- Vendor contracts and payments (not just hotel bookings)
- Event timelines and milestones (not just flight schedules)
- Group logistics and shuttles (not just individual travel)
- Event budgets and per-head costs (not just travel expenses)

**Recommendation**: Create a parallel `EventCoordinator` role or add an "Event Mode" toggle to the EA interface that switches from executive/travel management to event/guest management.

### 5. Calendar and Timeline
The calendar pages (`global-calendar.tsx`, `ea/calendar.tsx`) show external city events or executive schedules. Neither shows **event milestones** as first-class calendar items.

**Recommendation**: Make event anchors (ceremony, reception, rehearsal, vendor setup) into calendar events that can be viewed in:
- Global calendar (city-level context)
- EA calendar (coordination view)
- Guest view (personal timeline)
- Vendor view (setup and delivery schedule)

---

## Effort Summary by Category

| Category | Pages | Total Effort |
|----------|-------|-------------|
| Terminology refactoring (trip → experience) | 15+ pages | ~20-30 hours |
| Add event type awareness and conditional UI | 10+ pages | ~15-25 hours |
| Create event-specific features (RSVP, vendor, timeline) | 8+ pages | ~20-30 hours |
| EA event coordinator mode | 5 pages | ~15-20 hours |
| Calendar event milestone integration | 3 pages | ~10-15 hours |
| Transport event-awareness | 2 pages | ~5-8 hours |
| Reports and analytics | 2 pages | ~8-12 hours |
| **TOTAL** | **~25 pages** | **~90-140 hours** |

This is approximately **3-4 weeks of focused engineering work** for a single developer, or **1-2 weeks** for a team of 3-4.
