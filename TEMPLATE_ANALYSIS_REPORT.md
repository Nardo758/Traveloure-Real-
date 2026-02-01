# Traveloure Platform: Complete Template Analysis Report

**Generated:** February 1, 2025  
**Analyst:** AI Strategic Analysis  
**Scope:** All 21 trip/experience templates

---

## Executive Summary

**Current State:**
- ✅ **21 Experience Templates** defined across personal, celebratory, and corporate events
- ⚠️ **Architecture Inconsistency:** Two implementation patterns coexist
  - **Static Config** (19 templates): Hardcoded tabs in `experienceConfigs` object
  - **Database-Driven** (2 templates): `bachelor-bachelorette` and `anniversary-trip` with rich filter schema
- 🔴 **Critical UX Bugs:** State management issues cause non-functional buttons in multi-mode templates
- 🔴 **Data Gaps:** All templates have empty venue/vendor tabs - no SERP API integration yet
- 🟡 **Guest Personalization:** Missing critical feature for guest-specific logistics (travel from origin city)

**Strategic Recommendation:**  
**Migrate all templates to database-driven architecture** for consistency, scalability, and dynamic content population via SERP APIs.

---

## Template Inventory & Classification

### Category 1: Travel & Adventure (2 templates)
1. **`travel`** - General vacation/leisure travel
2. **`anniversary-trip`** - Romantic couple getaways *(DB-driven)*

### Category 2: Weddings & Romance (5 templates)
3. **`wedding`** - Wedding planning *(dual-mode: planning + guest activities)*
4. **`proposal`** - Proposal coordination
5. **`engagement-party`** - Engagement celebration
6. **`wedding-anniversaries`** - Anniversary celebrations
7. **`bachelor-bachelorette`** - Bachelor/Bachelorette parties *(DB-driven)*

### Category 3: Social Celebrations (7 templates)
8. **`birthday`** - Birthday parties
9. **`baby-shower`** - Baby shower planning
10. **`graduation-party`** - Graduation celebrations
11. **`housewarming-party`** - Housewarming events
12. **`retirement-party`** - Retirement celebrations
13. **`career-achievement-party`** - Career milestone events
14. **`farewell-party`** - Farewell/goodbye events
15. **`holiday-party`** - Seasonal holiday parties

### Category 4: Group Trips (2 templates)
16. **`boys-trip`** - Men's group trips
17. **`girls-trip`** - Women's group trips

### Category 5: Professional & Retreats (3 templates)
18. **`corporate-events`** - Corporate events/retreats
19. **`retreats`** - Wellness/spiritual retreats
20. **`reunions`** - Family/school reunions

### Category 6: Romance & Dating (1 template)
21. **`date-night`** - Date night planning

---

## Deep Dive: Template-by-Template Analysis

### 1. WEDDING TEMPLATE 👰

**Current State:**
```typescript
Tabs: Venues | Vendors | Services | Guest Accommodations | Transportation | Rehearsal
Modes: "Planning Mode" | "Guest Activities Mode"
Filters: Indoor, Outdoor, Beach, Garden, Ballroom, Rustic, Modern, Traditional
```

**Critical Issues Identified:**

1. **🔴 UX Bug - Button Dependency**
   - **Problem:** "Planning Mode" and "Guest Activities" buttons non-functional until "Submit Wedding Details" clicked
   - **Root Cause:** State management issue - `detailsSubmitted` flag not properly initialized
   - **Impact:** Users cannot explore modes without submitting form
   - **Fix Required:** Remove state dependency OR auto-enable modes on page load

2. **🔴 Missing Feature - Wedding Date Field**
   - **Problem:** No proper date picker for wedding date (only generic start/end dates)
   - **Needed:** Single date selector OR date range (multi-day wedding)
   - **Use Case:** "Wedding on 3/10/2025" OR "Wedding weekend 3/10-3/17/2025"

3. **🔴 Personalization Gap - Guest-Specific Travel**
   - **Problem:** No mechanism for guests to input their "City of Origin"
   - **Current:** System assumes all guests travel from same location
   - **Needed:** 
     - Unique guest invite links
     - Per-guest "Where are you traveling from?" field
     - Personalized transport/flight recommendations
   - **Example:** 
     - Guest 1 (Tampa → NYC): Show Tampa→NYC flights, ground transport
     - Guest 2 (Boston → NYC): Show Boston→NYC flights, train options

4. **🔴 Data Gap - Empty Venues Tab**
   - **Problem:** Venues tab shows no data
   - **Cause:** No SERP API integration for venue discovery
   - **Needed:** Google Places API queries for wedding venues in destination city

**What Makes Weddings Unique:**
- **Dual Stakeholder:** Couple (planning) + Guests (attending)
- **Multi-Day Event:** Rehearsal, ceremony, reception, post-wedding brunch
- **Vendor Coordination:** 10+ vendor types (venue, catering, photography, florist, DJ, etc.)
- **Group Logistics:** Guest accommodations, transportation to/from venue
- **Timeline Critical:** Everything scheduled to the minute

**Critical Logistics:**
1. **Venue Booking** - Primary decision, affects all other choices
2. **Guest Accommodations** - Hotel blocks, group rates
3. **Transportation** - Shuttles between hotel/venue, airport transfers
4. **Vendor Timing** - Setup/breakdown windows, ceremony start time
5. **Guest RSVP** - Meal choices, +1s, dietary restrictions

**Information Needed:**

**From Organizer (Couple):**
- Wedding date (single day OR multi-day)
- Wedding location (city, specific venue if known)
- Number of guests (estimated)
- Budget (total OR per-category)
- Style preferences (formal, casual, rustic, modern, beach, etc.)
- Must-have vendors (photography, videography, DJ, band, etc.)

**From Each Guest:**
- RSVP status
- **City of origin** (for personalized travel logistics)
- Number in party (+1s, family)
- Dietary restrictions
- Accommodation preference (hotel block vs own booking)
- Transportation needs (shuttle vs own car)

**External Data to Auto-Populate:**

1. **Venues (Google Places API)**
   - Query: `"wedding venues in {destination}"`
   - Filters: Indoor/outdoor, capacity, price range, ratings
   - Display: Name, address, photos, capacity, starting price, reviews

2. **Vendors (SERP API)**
   - Categories: Photographers, florists, caterers, DJs, planners
   - Query: `"wedding photographer {destination}"` (per category)
   - Display: Portfolio, pricing, availability, reviews

3. **Guest Hotels (Booking.com Affiliate API)**
   - Query: Hotels near venue address
   - Filters: Group rates, wedding-friendly, shuttle service
   - Display: Price per night, distance from venue

4. **Transportation (Uber API / local shuttle services)**
   - Calculate distances between hotels and venue
   - Estimate costs for group transportation

5. **Flights (Amadeus API)**
   - **Per-guest personalized:** {guest_origin_city} → {wedding_destination}
   - Dates: Arrival day before, departure day after
   - Display: Flight options, price, duration

6. **Weather (OpenWeather API)**
   - Historical weather data for wedding date
   - Forecast (if within 14 days)

**Planning Tools Needed:**
- ✅ Timeline/Schedule builder (ceremony, cocktail hour, reception)
- ✅ RSVP manager with meal choices
- ✅ Budget tracker (per-vendor)
- ✅ Guest list with origin cities
- ✅ Seating chart
- ❌ Vendor comparison tool (quotes side-by-side)
- ❌ Group transportation scheduler

**SERP API Strategy:**

**Phase 1 (MVP):**
- Google Places API: Venues only
- Display basic venue cards with photos, capacity, price range

**Phase 2 (Full Feature):**
- Add vendor categories (photographer, florist, caterer, DJ)
- Booking.com API: Guest accommodations
- Weather API integration

**Phase 3 (Advanced):**
- Per-guest flight recommendations (Amadeus API)
- Group transportation optimizer
- Vendor availability calendar sync

---

### 2. BACHELOR/BACHELORETTE PARTY TEMPLATE 🎉

**Current State:**
```typescript
Architecture: DATABASE-DRIVEN (✅ Advanced Implementation)
Tabs: Destinations | Accommodations | Daytime Activities | Nightlife | Dining | Transportation | Party Services
Universal Filters: Date Range, Booking Status, Cancellation Policy, Expert Verified, Payment Options
```

**What Makes This Template Unique:**
- ✅ **Most Advanced Template** - Fully database-driven with granular filters
- ✅ **Complex Filter Schema** - 50+ filter options across 7 tabs
- ✅ **Group-Centric** - Every filter accounts for group size (4-40+ people)
- ✅ **Multi-Day Coordination** - Weekend to full-week trips

**Critical Logistics:**

1. **Group Size Management**
   - Accommodations must sleep entire group
   - Activities/venues must accommodate group capacity
   - Transportation fleet sizing
   - Restaurant reservations for large parties

2. **Energy Flow Optimization**
   - Daytime activities energy level (chill → extreme)
   - Recovery time between events
   - Nightlife timing (early vs late)

3. **Safety & Responsibility**
   - Group transportation for nightlife (no drunk driving)
   - Emergency contacts
   - Designated "sober friend" rotation

4. **Budget Coordination**
   - Splitting costs across attendees
   - Payment collection (Venmo, Splitwise integration)
   - Optional upgrades (VIP tables, bottle service)

**Information Needed:**

**From Organizer:**
- Destination preferences (beach, city, mountains, international)
- Group size (exact count)
- Date range (weekend, long weekend, full week)
- Budget per person
- Vibe (party-heavy, chill, adventure, wellness)
- Must-do activities

**From Each Guest:**
- **City of origin** (for flight coordination)
- Budget comfort level
- Activity preferences (adventurous vs chill)
- Dietary restrictions
- Alcohol preferences (big drinker, moderate, sober)
- Room sharing preferences

**External Data to Auto-Populate:**

1. **Destinations Tab:**
   - Google Places API: Destination popularity data
   - Distance calculator: Drive time vs flight time from origin cities
   - Weather API: Best time to visit

2. **Accommodations Tab:**
   - Airbnb API: Large group houses/villas
   - Booking.com API: Hotel blocks
   - VRBO API: Vacation rentals
   - Filters: Sleeps X, party-friendly, pool, game room

3. **Daytime Activities:**
   - TripAdvisor API: Top-rated group activities
   - Viator API: Bookable tours/experiences
   - Filter by: Group size capacity, energy level, duration

4. **Nightlife:**
   - Yelp API: Bars, clubs, lounges
   - OpenTable API: Dinner spots
   - Filter by: Group reservation availability, dress code, cover charge

5. **Dining:**
   - OpenTable API: Group-friendly restaurants
   - Filter by: Capacity (12+ people), private rooms, prix fixe menus

6. **Transportation:**
   - Party bus rental APIs
   - Uber/Lyft group estimates
   - Sprinter van rentals

7. **Party Services:**
   - Vendor directories: Photographers, DJs, decorators
   - Custom apparel providers (matching shirts, etc.)

**Planning Tools Needed:**
- ✅ Itinerary builder (hourly schedule for multi-day trip)
- ✅ Group poll (vote on activities)
- ✅ Budget split calculator
- ✅ Guest RSVP with payment tracking
- ❌ Shared photo album
- ❌ Group chat integration

**Issues Identified:**
- ✅ **Excellent filter granularity** - No gaps
- ⚠️ **Data population pending** - Needs SERP API integration to fill tabs
- ⚠️ **Guest invite system** - No unique invite links with per-guest data collection

**SERP API Strategy:**

**Destinations Tab:**
- Query: `"best {vibe} destinations for bachelor party"`
- APIs: Google Places (city data), Flight search (accessibility)

**Accommodations Tab:**
- APIs: Airbnb, VRBO, Booking.com
- Query: `"vacation rental {destination} sleeps {group_size}"`

**Daytime Activities:**
- API: Viator, TripAdvisor, GetYourGuide
- Query: `"{activity_type} {destination} group size {X}"`

**Nightlife:**
- API: Yelp Fusion
- Query: `"nightclubs {destination} large group reservations"`

**Dining:**
- API: OpenTable, Yelp
- Query: `"restaurants {destination} group dining {group_size}"`

**Transportation:**
- API: Google Maps (distance calculation), Local vendor APIs
- Query: `"party bus rental {destination}"`

---

### 3. ANNIVERSARY TRIP TEMPLATE 💕

**Current State:**
```typescript
Architecture: DATABASE-DRIVEN (✅ Advanced Implementation)
Tabs: Destinations | Romantic Accommodations | Couple Experiences | Romantic Dining | Spa & Wellness | Special Touches | Transportation
Universal Filters: Trip Duration, Total Budget, Booking Status, Cancellation Policy, Expert Verified
```

**What Makes This Template Unique:**
- ✅ **Intimacy-Focused** - All filters emphasize privacy, romance, seclusion
- ✅ **Milestone Awareness** - Filters for 1st, 5th, 10th, 25th, 50th anniversaries
- ✅ **Experience Quality** - Emphasizes "romantic moments" over "things to do"
- ✅ **Couples-Only** - Fixed 2-person logistics, no group coordination

**Critical Logistics:**

1. **Romance Optimization**
   - Privacy level (secluded vs intimate boutique)
   - Surprise coordination (partner doesn't know details)
   - Special touches timing (rose petals, champagne arrival)

2. **Activity Balance**
   - Relaxation vs adventure ratio
   - Shared experiences (cooking class, couples massage)
   - Independent time vs together time

3. **Dining Timing**
   - Sunset dinner reservations
   - In-room breakfast
   - Special occasion coordination (anniversary dessert)

**Information Needed:**

**From Organizer:**
- Anniversary milestone (1st, 5th, 10th, etc.)
- Destination preferences (beach, mountain, city, wine country)
- Trip duration (weekend, week, extended)
- Budget (couple total)
- Romance level (maximum, balanced with adventure)
- Partner preferences (adventure vs relaxation)
- Surprise element? (yes/no)

**From Partner (if not surprise):**
- Activity preferences
- Spa interest level
- Dining style (fine dining, casual romantic)

**External Data to Auto-Populate:**

1. **Destinations Tab:**
   - Query: `"most romantic destinations for {milestone} anniversary"`
   - Filter by: Season optimization, crowd level, romance rating

2. **Romantic Accommodations:**
   - Booking.com API: Boutique hotels, luxury resorts
   - Airbnb Luxe: Private villas
   - Filter by: Private pool, ocean view, fireplace, four-poster bed

3. **Couple Experiences:**
   - Viator API: Private tours, couples activities
   - Query: `"couples experiences {destination}"`
   - Filter by: Intimacy level (private vs small group)

4. **Romantic Dining:**
   - OpenTable API: Fine dining, romantic restaurants
   - Filter by: Candlelit, scenic views, private table, beachfront

5. **Spa & Wellness:**
   - Query: `"couples spa {destination}"`
   - Filter by: In-room vs spa facility, duration, price

6. **Special Touches:**
   - Vendor directory: Florists, photographers, surprise coordinators
   - Query: `"anniversary surprise services {destination}"`

**Planning Tools Needed:**
- ✅ Itinerary builder (day-by-day, but flexible)
- ✅ Surprise coordinator (keep partner in dark)
- ✅ Budget tracker
- ❌ Photo moment planner (best photo ops)
- ❌ Restaurant reservation manager

**Issues Identified:**
- ✅ Excellent romance-focused filters
- ⚠️ **Surprise Mode:** Need separate organizer/partner views
- ⚠️ **Milestone Theming:** Should suggest gift ideas (1st = paper, 25th = silver)

**SERP API Strategy:**

**Destinations Tab:**
- Query: `"romantic destinations" + {season} + {milestone}`
- Filter by romance score, accessibility, season optimization

**Accommodations Tab:**
- APIs: Booking.com, Airbnb Luxe, boutique hotel networks
- Query: `"romantic hotel {destination}" + filters (private pool, view, etc.)`

**Experiences Tab:**
- API: Viator, GetYourGuide
- Query: `"couples experiences {destination}" + intimacy filter`

**Dining Tab:**
- API: OpenTable, Michelin Guide API
- Query: `"romantic restaurants {destination}"`

---

### 4. TRAVEL (GENERAL) TEMPLATE ✈️

**Current State:**
```typescript
Tabs: Activities | Hotels | Services | Dining | Flights | Transportation
Filters: Budget, Luxury, Family, Adventure, Business, Beach, City, Nature
```

**What Makes This Template Unique:**
- Most **generic/flexible** template
- Serves multiple use cases (leisure, business, family)
- Lacks specific event context

**Critical Issues:**
- ⚠️ **Too Generic** - No differentiation from other templates
- ⚠️ **Filter Overlap** - "Budget/Luxury" duplicates budget fields elsewhere
- 🔴 **Missing Context** - Is this solo, couple, family, group?

**Logistics Needs:**
1. **Trip Purpose** - Leisure, business, family, solo?
2. **Travel Party Size** - Solo, couple, family (kids?), group
3. **Pace** - Packed itinerary vs slow travel
4. **Accommodation Type** - Hotel, Airbnb, hostel, resort

**Information Needed:**

**From Organizer:**
- Travel purpose (leisure, business, visiting friends/family)
- Party size (solo, couple, family with X kids, group of Y)
- Destination (city, region, country)
- Dates (flexible vs fixed)
- Budget (total OR per day)
- Travel style (adventure, relaxation, cultural, foodie, nature)

**External Data to Auto-Populate:**

1. **Activities Tab:**
   - TripAdvisor API: Top-rated activities in destination
   - Filter by: Family-friendly, adventure level, indoor/outdoor

2. **Hotels Tab:**
   - Booking.com API, Airbnb API
   - Filter by: Budget range, family rooms, amenities

3. **Services Tab:**
   - Local tour operators, car rentals, luggage storage
   - Query: `"travel services {destination}"`

4. **Dining Tab:**
   - Yelp API, Google Places
   - Filter by: Cuisine type, price range, dietary options

5. **Flights Tab:**
   - Amadeus API, Skyscanner API
   - Origin city → destination, date range

6. **Transportation Tab:**
   - Uber/Lyft availability
   - Public transit info
   - Car rental options

**Planning Tools Needed:**
- ✅ Itinerary builder
- ✅ Budget tracker
- ✅ Packing list generator
- ❌ Travel checklist (passport, visas, vaccines)

**Recommendations:**
- **Rename to "Leisure Travel"** for clarity
- **Add pre-trip checklist:** Passport expiry, visa requirements, travel insurance
- **Add travel style quiz:** Help users self-select their travel personality

**SERP API Strategy:**

**Activities Tab:**
- API: TripAdvisor, Viator
- Query: `"things to do {destination}"` + filters (family, adventure, etc.)

**Hotels Tab:**
- API: Booking.com, Airbnb
- Query: `"hotels {destination}"` + filters (budget, family, etc.)

**Flights Tab:**
- API: Amadeus, Skyscanner
- Query: `{origin_city} to {destination}` + date range

---

### 5. PROPOSAL TEMPLATE 💍

**Current State:**
```typescript
Tabs: Locations | Services | Celebration Dining | Post-Proposal Activities | Accommodations
Filters: Romantic, Private, Scenic, Restaurant, Beach, Rooftop, Garden, Sunset
```

**What Makes This Template Unique:**
- **Surprise Element Critical** - Partner cannot see details
- **Moment Perfection** - Everything must go flawlessly
- **Backup Plans** - Weather contingencies for outdoor proposals

**Critical Logistics:**

1. **Surprise Management**
   - Separate views for proposer and partner
   - Secret planning mode
   - Coordinating with helpers (photographer, restaurant, friends)

2. **Timing Precision**
   - Sunset timing (for outdoor proposals)
   - Restaurant reservation coordination
   - Photographer arrival timing

3. **Backup Plans**
   - Weather contingency (outdoor proposals)
   - Alternative location
   - Plan B activities

**Information Needed:**

**From Proposer:**
- Proposal location (city)
- Preferred setting (beach, rooftop, restaurant, garden, private)
- Partner personality (public vs private)
- Budget (total)
- Desired elements (photographer, flowers, champagne)
- Preferred time of day (sunset, dinner, brunch)

**External Data to Auto-Populate:**

1. **Locations Tab:**
   - Google Places API: Scenic viewpoints, beaches, rooftops, gardens
   - Filter by: Privacy level, romantic rating, photo-worthiness

2. **Services Tab:**
   - Vendor directory: Proposal photographers, florists, musicians
   - Query: `"proposal photographer {destination}"`

3. **Celebration Dining:**
   - OpenTable API: Romantic restaurants
   - Filter by: Private table, celebration packages, champagne service

4. **Post-Proposal Activities:**
   - Ideas: Engagement photoshoot, couples massage, sunset cruise
   - Viator API: Romantic experiences

5. **Accommodations:**
   - Booking.com API: Romantic hotels with proposal packages
   - Filter by: Champagne, rose petals, special turndown

**Planning Tools Needed:**
- ✅ Timeline builder (minute-by-minute for proposal day)
- ✅ Weather contingency planner
- ✅ Vendor coordination dashboard
- ❌ Secret planning mode (hide from partner)
- ❌ Backup plan generator

**Issues Identified:**
- 🔴 **No Surprise Mode** - Partner could accidentally see details
- ⚠️ **Missing Weather Integration** - Critical for outdoor proposals
- ⚠️ **No Backup Location** - Need contingency for weather

**SERP API Strategy:**

**Locations Tab:**
- Query: `"best proposal spots {destination}"`
- Filter by: Sunset view, privacy, photo-worthiness

**Services Tab:**
- Query: `"proposal photographer {destination}"`
- Additional: Florists, musicians, surprise coordinators

**Dining Tab:**
- Query: `"romantic restaurants {destination} private table"`
- Filter by: Proposal-friendly, champagne service

---

### 6. BIRTHDAY TEMPLATE 🎂

**Current State:**
```typescript
Tabs: Venues | Activities | Dining | Entertainment | Services | Accommodations
Filters: Kids, Teens, Adults, Milestone, Outdoor, Indoor, Theme Party, Elegant
```

**What Makes This Template Unique:**
- **Age-Specific** - Kids, teens, adults, milestone birthdays (21st, 30th, 40th, 50th)
- **Wide Scope** - Ranges from kids' bouncy house to adult wine tasting
- **Party Size Variation** - Intimate (10 people) to large (100+)

**Critical Logistics:**

1. **Age Appropriateness**
   - Activities must match age group
   - Venue suitability (kids-safe vs bar)
   - Entertainment type (clown vs DJ)

2. **Party Size Management**
   - Venue capacity
   - Catering quantities
   - Activity group sizes

3. **Theme Coordination**
   - Decorations
   - Dress code
   - Activities aligned to theme

**Information Needed:**

**From Organizer:**
- Birthday person's age (or age group: kids, teens, adults)
- Milestone birthday? (1st, 13th, 16th, 18th, 21st, 30th, 40th, 50th, etc.)
- Party size (guests count)
- Venue preference (home, restaurant, venue, outdoor)
- Theme (if any)
- Budget (total)
- Desired vibe (casual, elegant, wild party, chill gathering)

**External Data to Auto-Populate:**

1. **Venues Tab:**
   - Google Places API: Event venues, party spaces
   - Filter by: Capacity, kid-friendly, adult-only, outdoor/indoor

2. **Activities Tab:**
   - Age-specific activities
   - Kids: Bounce houses, face painters, magicians
   - Teens: Escape rooms, laser tag, arcade
   - Adults: Wine tasting, cooking class, karaoke

3. **Dining Tab:**
   - Catering options
   - Restaurants with private rooms
   - Birthday cake bakeries

4. **Entertainment Tab:**
   - Vendor directory: DJs, bands, magicians, comedians
   - Filter by: Age appropriateness

5. **Services Tab:**
   - Party planners
   - Decorators
   - Photographers

**Planning Tools Needed:**
- ✅ Guest list manager
- ✅ RSVP tracker
- ✅ Budget calculator
- ❌ Theme idea generator
- ❌ Activity timeline (schedule for party day)

**Issues Identified:**
- ⚠️ **Age Segmentation** - Needs clearer age breakdowns (0-5, 6-12, 13-17, 18-29, 30-39, 40-49, 50+)
- ⚠️ **Theme Suggestions** - No theme ideas based on age/interests
- 🔴 **Milestone Logic** - Should auto-suggest milestone-specific ideas

**SERP API Strategy:**

**Venues Tab:**
- Query: `"birthday party venues {destination}" + age_filter`
- Filter by: Capacity, kid-friendly, pricing

**Activities Tab:**
- Query: `"{age_group} birthday activities {destination}"`
- Examples:
  - Kids: `"kids birthday activities {destination}"`
  - Adults: `"30th birthday activities {destination}"`

**Dining Tab:**
- Query: `"birthday dinner {destination} group {party_size}"`
- Filter by: Private room, birthday packages

---

### 7. BOYS TRIP TEMPLATE 🏔️

**Current State:**
```typescript
Tabs: Accommodations | Adventures | Nightlife | Sports | Services
Filters: Adventure, Sports, Nightlife, Beach, Mountains, City, Bachelor, Fishing
```

**What Makes This Template Unique:**
- **Activity-Heavy** - Focus on adventures, sports, nightlife
- **Bonding-Oriented** - "Bro time" activities
- **Energy Level** - High-energy, outdoor activities

**Critical Logistics:**

1. **Group Size Coordination**
   - Accommodation sleeping arrangements
   - Activity group capacity
   - Transportation fleet

2. **Energy Management**
   - Active days vs recovery days
   - Nightlife stamina
   - Alcohol consumption planning

3. **Budget Splits**
   - Shared expenses (Airbnb, transportation)
   - Individual costs (meals, drinks)

**Information Needed:**

**From Organizer:**
- Group size
- Destination type (beach, mountains, city)
- Trip duration
- Budget per person
- Vibe (party-heavy, adventure-focused, chill)

**From Each Guest:**
- Activity interests (sports, fishing, hiking, nightlife)
- Budget comfort level
- Alcohol consumption level

**External Data to Auto-Populate:**

1. **Accommodations Tab:**
   - Airbnb API: Large houses, cabins
   - Filter by: Sleeps X, game room, pool, BBQ

2. **Adventures Tab:**
   - TripAdvisor API: Outdoor activities
   - Examples: Hiking, fishing, ATV, zip-lining

3. **Nightlife Tab:**
   - Yelp API: Bars, clubs, breweries
   - Filter by: Group-friendly, sports bar, dive bar

4. **Sports Tab:**
   - Golf courses, sports facilities
   - Brewery tours
   - Sporting events

**Planning Tools Needed:**
- ✅ Itinerary builder
- ✅ Group poll (vote on activities)
- ✅ Budget split calculator
- ❌ Packing list (adventure gear)

**Issues Identified:**
- ⚠️ **Gender Assumption** - "Boys" trip may be outdated terminology
- ⚠️ **Activity Diversity** - Could expand beyond stereotypical "bro" activities
- 🔴 **Safety Planning** - No emergency contact/medical info collection

**SERP API Strategy:**

**Accommodations Tab:**
- Query: `"vacation rental {destination} sleeps {group_size} + game room"`

**Adventures Tab:**
- Query: `"adventure activities {destination} groups"`

**Nightlife Tab:**
- Query: `"bars {destination} sports bar"`

---

### 8. GIRLS TRIP TEMPLATE 💃

**Current State:**
```typescript
Tabs: Accommodations | Spa & Wellness | Shopping | Dining & Wine | Services
Filters: Spa, Shopping, Beach, Wine, Brunch, Wellness, Bachelorette, Luxury
```

**What Makes This Template Unique:**
- **Wellness-Focused** - Spa, self-care, relaxation
- **Social Bonding** - Brunch, wine, shopping together
- **Photo-Worthy** - Instagram-able moments

**Critical Logistics:**

1. **Spa Reservations**
   - Group spa bookings
   - Treatment timing coordination
   - Robes/slippers sizing

2. **Dining Reservations**
   - Brunch spots (group-friendly)
   - Wine tasting reservations
   - Bottomless mimosas

3. **Shopping Coordination**
   - Shopping districts
   - Group transportation between stores

**Information Needed:**

**From Organizer:**
- Group size
- Destination type (beach, wine country, city)
- Trip duration
- Budget per person
- Vibe (party, chill, wellness)

**From Each Guest:**
- Spa interest level
- Shopping budget
- Dietary restrictions (for brunch/dining)

**External Data to Auto-Populate:**

1. **Accommodations Tab:**
   - Airbnb Luxe: Stylish properties
   - Hotels with spa packages

2. **Spa & Wellness Tab:**
   - Google Places: Spas, yoga studios
   - Filter by: Group packages, treatments

3. **Shopping Tab:**
   - Google Places: Shopping districts, boutiques
   - Filter by: Luxury, vintage, local artisans

4. **Dining & Wine Tab:**
   - OpenTable: Brunch spots, wine bars
   - Filter by: Bottomless brunch, outdoor seating

**Planning Tools Needed:**
- ✅ Itinerary builder
- ✅ Group poll
- ✅ Budget tracker
- ❌ Photo spot planner (Instagram-worthy locations)

**Issues Identified:**
- ⚠️ **Gender Assumption** - "Girls" trip may be outdated terminology
- ⚠️ **Stereotyping** - Assumes all women want spa/shopping
- 🔴 **Activity Diversity** - Should include adventure options too

**SERP API Strategy:**

**Spa Tab:**
- Query: `"spa {destination} group packages"`

**Shopping Tab:**
- Query: `"shopping districts {destination}"`

**Dining Tab:**
- Query: `"brunch {destination} bottomless mimosas"`

---

### 9. DATE NIGHT TEMPLATE 💑

**Current State:**
```typescript
Tabs: Dining | Activities | Entertainment | Services | Transportation
Filters: Romantic, Casual, Upscale, Adventure, Foodie, First Date, Anniversary
```

**What Makes This Template Unique:**
- **Local Focus** - Usually in same city
- **Evening-Centric** - Typically 2-4 hour experience
- **First Impression Critical** - Especially for early-stage dating

**Critical Logistics:**

1. **Reservation Timing**
   - Dinner reservation (7pm typical)
   - Activity booking (movie, show, etc.)
   - Transportation coordination

2. **Budget Appropriateness**
   - First date: Moderate ($50-100)
   - Anniversary: Splurge ($200+)

3. **Vibe Matching**
   - Casual vs upscale
   - Quiet vs lively
   - Adventurous vs traditional

**Information Needed:**

**From Organizer:**
- City/neighborhood
- Date type (first date, casual, anniversary)
- Budget (total for evening)
- Vibe preference (romantic, casual, adventurous)
- Time of day (brunch, lunch, dinner, late-night)

**External Data to Auto-Populate:**

1. **Dining Tab:**
   - Yelp API, OpenTable: Restaurants
   - Filter by: Romantic, quiet, outdoor seating, price

2. **Activities Tab:**
   - Google Places: Movie theaters, mini-golf, museums
   - Filter by: Date-friendly, interactive

3. **Entertainment Tab:**
   - Eventbrite API: Comedy shows, concerts, theater
   - Filter by: Date night appropriate

4. **Services Tab:**
   - Florists, chocolatiers
   - Surprise delivery services

5. **Transportation Tab:**
   - Uber estimate
   - Parking availability

**Planning Tools Needed:**
- ✅ Timeline builder (dinner → activity → drinks)
- ✅ Budget calculator
- ❌ Date idea generator (based on interests)
- ❌ Conversation starter suggestions

**Issues Identified:**
- ⚠️ **Context Missing** - Needs "relationship stage" (first date, early dating, established couple)
- ⚠️ **Time of Day** - Assumes evening, but brunch/lunch dates exist
- 🔴 **Surprise Element** - No way to mark as "surprise date"

**SERP API Strategy:**

**Dining Tab:**
- Query: `"romantic restaurants {city}" + filter (price, quiet, etc.)`

**Activities Tab:**
- Query: `"date night activities {city}"`

**Entertainment Tab:**
- Query: `"events tonight {city}" + date_friendly_filter`

---

### 10. CORPORATE EVENTS TEMPLATE 💼

**Current State:**
```typescript
Tabs: Venues | Team Activities | Services | Dining | Transportation | Accommodations
Filters: Conference, Retreat, Workshop, Team Building, Seminar, Gala, Networking
```

**What Makes This Template Unique:**
- **Professional Context** - Business-appropriate everything
- **Tax Deductibility** - Need receipts, invoices
- **ADA Compliance** - Accessibility requirements
- **Branding Opportunities** - Custom materials, signage

**Critical Logistics:**

1. **Venue Requirements**
   - AV equipment (projector, sound system, Wi-Fi)
   - Seating capacity
   - Breakout rooms
   - Catering kitchen

2. **Timing Precision**
   - Session schedule (start/end times)
   - Break times
   - Meal timing (breakfast, lunch, coffee breaks)

3. **Accommodation Blocks**
   - Hotel group rates
   - Room allocation
   - Shuttle service

4. **Budget Management**
   - Invoice tracking
   - Per-person cost calculations
   - Tax deductions

**Information Needed:**

**From Organizer:**
- Event type (conference, retreat, team building, gala)
- Number of attendees
- Event duration (half-day, full day, multi-day)
- Budget (total)
- Venue requirements (AV, breakout rooms, catering)
- Accommodation needed? (out-of-town attendees)

**External Data to Auto-Populate:**

1. **Venues Tab:**
   - Google Places: Conference centers, hotels with meeting space
   - Filter by: Capacity, AV equipment, catering options

2. **Team Activities Tab:**
   - Team building vendors
   - Examples: Escape rooms, cooking classes, charity activities

3. **Services Tab:**
   - AV rental companies
   - Event planners
   - Caterers

4. **Dining Tab:**
   - Corporate catering
   - Group dining options

5. **Transportation Tab:**
   - Shuttle services
   - Airport transfers

6. **Accommodations Tab:**
   - Hotels with group rates
   - Filter by: Conference facilities, shuttle service

**Planning Tools Needed:**
- ✅ Attendee list manager
- ✅ Budget tracker (per-person costs)
- ✅ Session schedule builder
- ❌ Invoice collector
- ❌ Receipt organizer (for taxes)

**Issues Identified:**
- 🔴 **No Invoice Management** - Critical for corporate
- ⚠️ **Missing ADA Info** - Accessibility not tracked
- ⚠️ **No Agenda Builder** - Need session schedule tool

**SERP API Strategy:**

**Venues Tab:**
- Query: `"conference venues {destination}" + capacity_filter`

**Team Activities Tab:**
- Query: `"corporate team building {destination}"`

**Accommodations Tab:**
- Query: `"hotels {destination} group rates conference facilities"`

---

### 11. REUNIONS TEMPLATE 👨‍👩‍👧‍👦

**Current State:**
```typescript
Tabs: Venues | Activities | Services | Dining | Accommodations | Transportation
Filters: Family, School, Friends, Outdoor, Indoor, Casual, Formal, Weekend
```

**What Makes This Template Unique:**
- **Nostalgia-Driven** - Reconnecting after time apart
- **Wide Age Range** - Kids to grandparents (family), classmates (school)
- **Multi-Generational** - Activities for all ages

**Critical Logistics:**

1. **Attendance Coordination**
   - RSVP tracking (people traveling from far)
   - Head count for catering
   - Accommodation needs

2. **Activity Age-Appropriateness**
   - Kids' activities
   - Adult socializing
   - Accessible for elderly

3. **Budget Sensitivity**
   - Some may have limited budgets
   - Shared costs vs individual costs

**Information Needed:**

**From Organizer:**
- Reunion type (family, school class, friends, military unit)
- Number of attendees (estimated)
- Age range (kids, teens, adults, elderly)
- Location (hometown, new destination)
- Duration (day event, weekend, week)
- Budget (per person OR total)

**From Each Attendee:**
- RSVP status
- Number in party (spouse, kids)
- Dietary restrictions
- Accommodation needs

**External Data to Auto-Populate:**

1. **Venues Tab:**
   - Google Places: Event spaces, parks, community centers
   - Filter by: Capacity, kid-friendly, accessible

2. **Activities Tab:**
   - Age-appropriate activities
   - Examples: Picnic games, trivia (school reunion), family photos

3. **Dining Tab:**
   - Catering options
   - Restaurants with large group capacity

4. **Accommodations Tab:**
   - Hotels with group rates
   - Airbnb for families

5. **Transportation Tab:**
   - Shuttle between hotel and venue

**Planning Tools Needed:**
- ✅ RSVP manager (track who's coming)
- ✅ Budget split calculator
- ✅ Memory book creator (photo collection)
- ❌ "Remember when" story collector
- ❌ Contact info updater (keep in touch post-reunion)

**Issues Identified:**
- ⚠️ **Type Specificity** - "Family" vs "School" have very different needs
- 🔴 **No Memory Features** - Should have photo sharing, story collection
- ⚠️ **Attendance Tracking** - Needs "maybe" option for RSVPs

**SERP API Strategy:**

**Venues Tab:**
- Query: `"{reunion_type} reunion venues {destination}"`

**Activities Tab:**
- Query: `"family reunion activities" OR "school reunion ideas"`

---

### 12-21: REMAINING TEMPLATES (Party Templates)

**Templates:** Wedding Anniversaries, Retreats, Baby Shower, Graduation Party, Engagement Party, Housewarming Party, Retirement Party, Career Achievement Party, Farewell Party, Holiday Party

**Common Characteristics:**
- All are **social celebrations**
- Similar tab structures: Venues, Catering, Decorations, Entertainment, Services
- Filter differences: Age appropriateness, formality level, theme options

**Shared Issues Across Party Templates:**

1. **🔴 Venue Data Gap** - All have empty venues tabs
2. **🔴 No Vendor Ratings** - No way to see reviews for caterers, DJs, etc.
3. **⚠️ Missing Budget Guidance** - No cost estimates per category
4. **⚠️ Guest List Tools** - No RSVP management built-in
5. **⚠️ Timeline Tools** - No event schedule builder

**Unique Aspects:**

### Wedding Anniversaries Template
- **Focus:** Celebrating marriage milestones
- **Unique Need:** Milestone-specific themes (1st = paper, 25th = silver)
- **Logistics:** Couple-centric vs family affair

### Retreats Template
- **Focus:** Wellness, spiritual, corporate
- **Unique Need:** Multi-day schedule, workshop space
- **Logistics:** Accommodation + activity venue in one location

### Baby Shower Template
- **Focus:** Gender reveal, gift registry
- **Unique Need:** Baby-friendly timing (avoid late nights)
- **Logistics:** Gift tracking, registry links

### Graduation Party Template
- **Focus:** Academic achievement
- **Unique Need:** School colors, cap & gown photos
- **Logistics:** Timing (often during graduation season congestion)

### Engagement Party Template
- **Focus:** Announcing engagement
- **Unique Need:** Photography, announcement coordination
- **Logistics:** Guest list overlap with wedding

### Housewarming Party Template
- **Focus:** New home celebration
- **Unique Need:** House tour, gift ideas (home goods)
- **Logistics:** Parking, home capacity limits

### Retirement Party Template
- **Focus:** Career send-off
- **Unique Need:** Speeches, memory book, roast/toast
- **Logistics:** Workplace coordination, surprise element

### Career Achievement Party Template
- **Focus:** Promotion, award, milestone
- **Unique Need:** Professional recognition, networking
- **Logistics:** Corporate setting vs casual

### Farewell Party Template
- **Focus:** Goodbye celebration
- **Unique Need:** Memory collection, gifts
- **Logistics:** Timing (before departure date)

### Holiday Party Template
- **Focus:** Seasonal celebrations
- **Unique Need:** Holiday-specific decorations, themes
- **Logistics:** Holiday season venue availability (high demand)

**SERP API Strategy (All Party Templates):**

**Venues Tab:**
- Query: `"{event_type} venues {destination}"`
- Filter by: Capacity, indoor/outdoor, price range

**Catering Tab:**
- Query: `"caterers {destination} {event_type}"`
- Filter by: Cuisine, dietary options, price per person

**Entertainment Tab:**
- Query: `"DJ {destination}" OR "band {destination}"`
- Filter by: Event type appropriateness

**Services Tab:**
- Query: `"party planner {destination}"`
- Filter by: Event specialty

---

## Critical Issues Summary (All Templates)

### 🔴 Critical Bugs (Fix Immediately)

1. **Wedding Template: Button Dependency Bug**
   - "Planning Mode" and "Guest Activities" buttons don't work until form submission
   - **Fix:** Remove `detailsSubmitted` state dependency OR auto-enable on load

2. **Wedding Template: Missing Wedding Date Field**
   - Only generic start/end dates
   - **Fix:** Add dedicated wedding date picker (single date OR range)

3. **All Templates: Empty Data Tabs**
   - Venues, vendors, services tabs show no results
   - **Fix:** Implement SERP API integration (Phase 1 priority)

### 🟡 High-Priority Features (MVP)

4. **Guest Personalization System**
   - **Problem:** No per-guest data collection (origin city, preferences)
   - **Fix:** Implement unique guest invite links with custom forms
   - **Use Case:** Wedding guest from Tampa sees Tampa→NYC flights
   - **Impact:** Massive UX improvement for group events

5. **SERP API Integration (Venues)**
   - **Problem:** No real venue data
   - **Fix:** Google Places API for venues
   - **Priority Order:**
     1. Weddings (venues, vendors)
     2. Corporate Events (conference centers)
     3. All Party Templates (event venues)

6. **State Management Consistency**
   - **Problem:** Multi-mode templates (Wedding) have broken state
   - **Fix:** Refactor state persistence, remove unnecessary dependencies

### ⚠️ Medium-Priority Features

7. **Budget Guidance**
   - Add cost estimates per category
   - Show "typical range" for services

8. **Template-Specific Tools**
   - Wedding: Vendor comparison tool
   - Corporate: Invoice management
   - Reunions: Memory book creator
   - Proposal: Surprise mode (hide from partner)

9. **Database Migration**
   - Migrate all 19 static templates to database-driven architecture
   - Match the quality of bachelor-bachelorette and anniversary templates

---

## Guest Invite System Design

**Problem Statement:**
Current system assumes all guests travel from the same origin city. This is incorrect for most events (weddings, reunions, parties).

**Proposed Solution: Personalized Guest Invites**

### Architecture

1. **Unique Invite Links**
   - Organizer creates event
   - System generates unique invite link per guest
   - Example: `traveloure.com/invite/abc123xyz`

2. **Guest Onboarding Flow**
   - Guest clicks invite link
   - Sees event details (wedding in NYC on 3/10-3/17)
   - Prompted: "Where are you traveling from?"
   - Inputs city: "Tampa, FL"
   - System geocodes Tampa → NYC

3. **Personalized Recommendations**
   - **Flights:** Shows Tampa→NYC flights for 3/9-3/18
   - **Ground Transport:** Shows NYC airport→hotel options
   - **Local Activities:** Shows "what to do in NYC before/after wedding"

4. **Data Collection Per Guest**
   - Origin city (for flight/transport)
   - RSVP status
   - Number in party (+1s, kids)
   - Dietary restrictions
   - Accommodation preference (hotel block vs own booking)
   - Activity interests (guest activities mode)

### Implementation Plan

**Phase 1: Backend**
- Database schema:
  - `guest_invites` table (event_id, guest_email, unique_token, origin_city, rsvp_status)
  - `guest_preferences` table (dietary, accommodation, activities)
- API endpoints:
  - `POST /api/invites` - Generate invite links
  - `GET /api/invites/:token` - Load guest invite page
  - `POST /api/invites/:token/rsvp` - Submit guest info

**Phase 2: Frontend**
- Guest invite page (`/invite/:token`)
- Guest info form (origin city, RSVP, preferences)
- Personalized recommendations view (flights from guest's city)

**Phase 3: Organizer Dashboard**
- View all guest responses
- See origin city breakdown (map visualization)
- Track RSVPs
- Bulk actions (send reminders)

---

## SERP API Integration Strategy

### Priority Tier 1 (MVP - Next 2 Weeks)

**Target Templates:** Wedding, Corporate Events, Bachelor/Bachelorette

**APIs to Implement:**

1. **Google Places API** - Venues
   - Endpoint: Places Search
   - Query: `"wedding venues {destination}"`
   - Data: Name, address, photos, rating, price level, phone
   - Display: Venue cards with "Request Quote" CTA

2. **Yelp Fusion API** - Vendors (Wedding)
   - Categories: Photographers, florists, caterers, DJs
   - Query: `"wedding photographer {destination}"`
   - Data: Portfolio link, pricing, reviews, availability

3. **Booking.com Affiliate API** - Hotels
   - Query: Hotels near event venue
   - Filter: Group rates, distance from venue
   - Data: Price per night, amenities, photos

### Priority Tier 2 (Full Feature - 4 Weeks)

**Target Templates:** All remaining templates

**APIs to Implement:**

4. **Viator API** - Activities
   - Categories: Tours, experiences, attractions
   - Query: `"activities {destination}"`
   - Filter by: Group size, duration, price

5. **OpenTable API** - Dining
   - Query: Restaurants in destination
   - Feature: Direct reservation booking
   - Filter: Group capacity, cuisine type, price

6. **Amadeus Flight Search API** - Flights
   - **Per-Guest Personalization:** {guest_origin_city} → {event_destination}
   - Display: Price, duration, airline, stops
   - Feature: Direct booking OR affiliate link

7. **TripAdvisor API** - Reviews & Ratings
   - Supplement Google Places data
   - Show aggregate ratings across platforms

### Priority Tier 3 (Advanced - 6 Weeks)

8. **Weather APIs** (OpenWeather, WeatherAPI)
   - Historical data for planning
   - Forecast for upcoming events
   - Weather contingency alerts (outdoor events)

9. **Uber/Lyft API** - Transportation Estimates
   - Calculate group transportation costs
   - Show ETAs, pricing

10. **Eventbrite API** - Local Events
    - Date night template: Show concerts, shows, comedy
    - Filter by date, category

### API Implementation Pattern (Reusable)

```typescript
// Example: Google Places API integration
async function fetchVenues(destination: string, eventType: string) {
  const query = `${eventType} venues in ${destination}`;
  const response = await googlePlacesAPI.textSearch({
    query,
    type: 'event_venue',
    location: geocodeDestination(destination),
    radius: 50000 // 50km
  });
  
  return response.results.map(venue => ({
    id: venue.place_id,
    name: venue.name,
    address: venue.formatted_address,
    rating: venue.rating,
    photos: venue.photos,
    priceLevel: venue.price_level,
    isExternal: true // Mark as external for cart logic
  }));
}
```

**Key Features:**
- Cache results (1 hour TTL)
- Error handling (fallback to empty state)
- Rate limiting (respect API quotas)
- Affiliate tracking (Booking.com, Viator)

---

## Tab Relevance & Conditional Display

**Problem:** Not all tabs are relevant for all templates.

**Solution: Conditional Tab Display**

### Example: Wedding Template

**Planning Mode Tabs:**
- ✅ Venues (critical)
- ✅ Vendors (critical)
- ✅ Services (critical)
- ✅ Guest Accommodations (critical)
- ✅ Transportation (critical)
- ✅ Rehearsal (optional)

**Guest Activities Mode Tabs:**
- ✅ Activities (critical)
- ✅ Dining (critical)
- ❌ Venues (not relevant - wedding already planned)
- ❌ Vendors (not relevant - for organizer only)

### Template-Specific Tab Logic

**Birthday Template:**
- If age < 18: Show "Kids Activities" tab, hide "Nightlife" tab
- If age >= 21: Show "Nightlife" tab, hide "Kids Activities" tab

**Corporate Events Template:**
- If event_type === "conference": Show "Breakout Rooms" tab
- If event_type === "team_building": Show "Activities" tab
- If event_type === "gala": Show "Entertainment" tab

**Proposal Template:**
- If setting === "restaurant": Show "Dining" tab as primary
- If setting === "outdoor": Show "Locations" tab as primary

### Implementation

```typescript
function getRelevantTabs(template: string, context: any) {
  const allTabs = experienceConfigs[template].tabs;
  
  // Filter based on context
  return allTabs.filter(tab => {
    if (template === "birthday" && tab.id === "nightlife") {
      return context.age >= 21;
    }
    if (template === "wedding" && context.mode === "guest") {
      return !["venues", "vendors"].includes(tab.id);
    }
    return true; // Show by default
  });
}
```

---

## State Management Recommendations

**Current Issue:** Wedding template's multi-mode buttons don't work due to state dependency on form submission.

**Root Cause Analysis:**
```typescript
// Current broken logic:
const [detailsSubmitted, setDetailsSubmitted] = useState(false);

// Buttons are disabled until this is true:
<Button disabled={!detailsSubmitted} onClick={() => setWeddingMode("guest")}>
  Guest Activities
</Button>
```

**Fix Options:**

### Option 1: Remove Dependency (Immediate Fix)
```typescript
// Enable modes by default
<Button onClick={() => setWeddingMode("guest")}>
  Guest Activities
</Button>
```

### Option 2: Auto-Enable on Input (Progressive Enhancement)
```typescript
// Enable once destination is entered
const canSwitchModes = destination.trim().length > 0;

<Button disabled={!canSwitchModes} onClick={() => setWeddingMode("guest")}>
  Guest Activities
</Button>
```

### Option 3: Separate Flows (Better UX)
```typescript
// Show mode selector FIRST, then customize
Step 1: "Are you planning the wedding or a guest?"
  → If planning: Show planning tabs
  → If guest: Show guest tabs
Step 2: Enter destination, dates
Step 3: Browse recommendations
```

**Recommendation:** **Option 3** provides the best UX. Users declare their role upfront, then see relevant content.

---

## Database Migration Plan

**Goal:** Migrate all 19 static templates to database-driven architecture (matching bachelor-bachelorette and anniversary quality).

### Current State
- **Static:** 19 templates hardcoded in `experienceConfigs` object
- **DB-Driven:** 2 templates (bachelor-bachelorette, anniversary) with rich schema

### Migration Benefits
1. **Consistency:** All templates use same architecture
2. **Scalability:** Easy to add new templates without code changes
3. **A/B Testing:** Test different tab configurations
4. **Personalization:** Customize tabs per user preferences
5. **Analytics:** Track which tabs/filters are most used

### Migration Steps

**Phase 1: Schema Extension (Week 1)**
- Extend database schema to support all template types
- Migrate wedding template (highest priority)
- Migrate corporate events template

**Phase 2: Party Templates (Week 2-3)**
- Migrate all 10 party templates (birthday, baby shower, etc.)
- Shared schema: venues, catering, entertainment, services, decorations

**Phase 3: Travel & Romance (Week 4)**
- Migrate travel, date-night, proposal templates
- Add date-night-specific filters (first date, anniversary, casual)

**Phase 4: Group Trips & Professional (Week 5)**
- Migrate boys-trip, girls-trip, reunions, retreats
- Add group-specific filters (budget splitting, activity voting)

### Database Schema (Extended)

```sql
-- Experience types (already exists)
CREATE TABLE experience_types (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Template tabs (already exists)
CREATE TABLE experience_template_tabs (
  id UUID PRIMARY KEY,
  experience_type_id UUID REFERENCES experience_types(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true
);

-- Template filters (already exists)
CREATE TABLE experience_template_filters (
  id UUID PRIMARY KEY,
  tab_id UUID REFERENCES experience_template_tabs(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  filter_type TEXT, -- single_select, multi_select, range, toggle
  icon TEXT,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true
);

-- Filter options (already exists)
CREATE TABLE experience_template_filter_options (
  id UUID PRIMARY KEY,
  filter_id UUID REFERENCES experience_template_filters(id),
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  min_value DECIMAL,
  max_value DECIMAL,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true
);

-- NEW: Template modes (for multi-mode templates like Wedding)
CREATE TABLE experience_template_modes (
  id UUID PRIMARY KEY,
  experience_type_id UUID REFERENCES experience_types(id),
  name TEXT NOT NULL, -- "Planning Mode", "Guest Activities Mode"
  slug TEXT NOT NULL, -- "planning", "guest"
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER
);

-- NEW: Mode-specific tab visibility
CREATE TABLE experience_mode_tabs (
  id UUID PRIMARY KEY,
  mode_id UUID REFERENCES experience_template_modes(id),
  tab_id UUID REFERENCES experience_template_tabs(id),
  sort_order INTEGER
);
```

---

## Implementation Roadmap

### Sprint 1 (Week 1-2): Critical Fixes
**Goal:** Fix UX bugs, implement MVP SERP integration

**Tasks:**
1. ✅ Fix wedding template button dependency bug
2. ✅ Add wedding date field (single date OR range)
3. ✅ Implement Google Places API for wedding venues
4. ✅ Implement Yelp API for wedding vendors
5. ✅ Design guest invite system architecture

**Deliverables:**
- Wedding template fully functional
- Venues tab populated with real data
- Vendors tab populated with real data

**Success Metrics:**
- Wedding template: 0 UX bugs
- Venues tab: 10+ results per destination
- Vendors tab: 5+ results per category

---

### Sprint 2 (Week 3-4): Guest Personalization
**Goal:** Implement guest invite system

**Tasks:**
1. ✅ Database schema for guest invites
2. ✅ API endpoints (generate invites, submit guest info)
3. ✅ Guest invite page UI
4. ✅ Organizer dashboard (view guest responses)
5. ✅ Personalized flight recommendations (Amadeus API)

**Deliverables:**
- Organizer can generate unique invite links
- Guest can submit origin city + RSVP
- Guest sees personalized flight options

**Success Metrics:**
- 90% of guests submit origin city
- Personalized flights shown for 100% of guests who submit

---

### Sprint 3 (Week 5-6): SERP API Expansion
**Goal:** Populate all templates with external data

**Tasks:**
1. ✅ Implement Booking.com API for accommodations
2. ✅ Implement Viator API for activities
3. ✅ Implement OpenTable API for dining
4. ✅ Implement TripAdvisor API for reviews
5. ✅ Populate bachelor-bachelorette template tabs

**Deliverables:**
- All templates have at least 3 tabs with live data
- Bachelor-bachelorette template fully populated

**Success Metrics:**
- 80% of tabs show real results
- Average 15+ results per tab

---

### Sprint 4 (Week 7-8): Database Migration
**Goal:** Migrate all templates to database-driven architecture

**Tasks:**
1. ✅ Extend database schema
2. ✅ Migrate wedding template to DB
3. ✅ Migrate 5 party templates to DB
4. ✅ Create admin UI for template management

**Deliverables:**
- 50% of templates database-driven
- Admin can create/edit templates without code changes

**Success Metrics:**
- 0 hardcoded templates
- Template creation time: <30 min per template

---

### Sprint 5 (Week 9-10): Advanced Features
**Goal:** Template-specific tools and enhancements

**Tasks:**
1. ✅ Wedding: Vendor comparison tool
2. ✅ Corporate: Invoice management
3. ✅ Proposal: Surprise mode (hide from partner)
4. ✅ All: Weather integration
5. ✅ All: Budget guidance

**Deliverables:**
- Each template has 1+ unique tool
- Weather shown for all outdoor events
- Budget estimates for all services

**Success Metrics:**
- 70% of users engage with template-specific tools
- Weather alerts reduce outdoor event cancellations by 50%

---

## Technical Architecture Recommendations

### 1. State Management Pattern

**Current:** `useState` hooks with sessionStorage persistence  
**Issue:** State lost on page refresh, complex logic scattered  
**Recommendation:** **Zustand** or **Jotai** for global state

**Example Migration:**
```typescript
// Before (useState + sessionStorage)
const [destination, setDestination] = useState(() => {
  const stored = sessionStorage.getItem("destination");
  return stored || "";
});

// After (Zustand)
import create from 'zustand';
import { persist } from 'zustand/middleware';

const useExperienceStore = create(
  persist(
    (set) => ({
      destination: "",
      setDestination: (dest) => set({ destination: dest }),
      startDate: null,
      endDate: null,
      cart: [],
      addToCart: (item) => set((state) => ({ cart: [...state.cart, item] })),
    }),
    { name: 'experience-store' }
  )
);
```

**Benefits:**
- Auto-persists to localStorage
- Cleaner component logic
- Easy debugging (Zustand devtools)

---

### 2. API Abstraction Layer

**Current:** Direct API calls scattered in components  
**Issue:** Hard to maintain, no caching, duplicate logic  
**Recommendation:** **Centralized API service** with React Query

**Example:**
```typescript
// services/serpAPI.ts
export const serpAPI = {
  async fetchVenues(destination: string, eventType: string) {
    const cached = queryClient.getQueryData(['venues', destination, eventType]);
    if (cached) return cached;
    
    const response = await googlePlacesAPI.textSearch({
      query: `${eventType} venues in ${destination}`
    });
    
    return response.results.map(formatVenue);
  },
  
  async fetchFlights(origin: string, destination: string, dates: DateRange) {
    return amadeusAPI.flightSearch({ origin, destination, ...dates });
  }
};

// Component usage
const { data: venues, isLoading } = useQuery(
  ['venues', destination, 'wedding'],
  () => serpAPI.fetchVenues(destination, 'wedding'),
  { staleTime: 1000 * 60 * 60 } // Cache 1 hour
);
```

**Benefits:**
- Single source of truth for API calls
- Automatic caching (React Query)
- Easy to swap API providers
- Loading/error states handled automatically

---

### 3. Component Architecture

**Current:** Single mega-component (3200+ lines in experience-template.tsx)  
**Issue:** Hard to maintain, slow to load, testing nightmare  
**Recommendation:** **Component splitting** by responsibility

**Proposed Structure:**
```
experience-template/
├── ExperienceTemplatePage.tsx (orchestrator)
├── components/
│   ├── ExperienceHeader.tsx (hero, title, search bar)
│   ├── ExperienceFilters.tsx (filter sidebar)
│   ├── ExperienceTabs.tsx (tab navigation)
│   ├── tabs/
│   │   ├── VenuesTab.tsx
│   │   ├── VendorsTab.tsx
│   │   ├── AccommodationsTab.tsx
│   │   └── ...
│   ├── ExperienceCart.tsx (cart sidebar)
│   ├── GuestInviteModal.tsx
│   └── AIOptimizer.tsx
├── hooks/
│   ├── useExperienceState.ts
│   ├── useExperienceFilters.ts
│   └── useGuestInvites.ts
└── services/
    ├── serpAPI.ts
    └── guestInviteAPI.ts
```

**Benefits:**
- Faster load times (code splitting)
- Easier testing (unit test each component)
- Parallel development (multiple devs work on different tabs)

---

### 4. SERP API Error Handling

**Current:** No fallback when API fails  
**Issue:** Users see empty tabs, poor UX  
**Recommendation:** **Graceful degradation** with fallbacks

**Example:**
```typescript
const { data: venues, isLoading, isError } = useQuery(
  ['venues', destination],
  () => serpAPI.fetchVenues(destination, 'wedding'),
  {
    retry: 2,
    staleTime: 1000 * 60 * 60,
    // Fallback to manual entry if API fails
    onError: () => {
      setShowManualEntryOption(true);
    }
  }
);

// UI Rendering
{isError && (
  <EmptyState
    icon={<MapPin />}
    title="Unable to load venues"
    description="API temporarily unavailable"
    action={
      <Button onClick={() => setAddVenueModalOpen(true)}>
        Add Venue Manually
      </Button>
    }
  />
)}
```

---

## Success Metrics & KPIs

### Template Health Metrics

**Per Template:**
- **Data Coverage:** % of tabs with live results (Target: 80%+)
- **User Engagement:** % of users who interact with tabs (Target: 70%+)
- **Conversion Rate:** % who add items to cart (Target: 40%+)
- **Completion Rate:** % who complete booking (Target: 25%+)

**Platform-Wide:**
- **Template Usage:** Which templates are most/least used
- **Tab Popularity:** Which tabs get clicked most
- **Filter Usage:** Which filters are applied most
- **API Success Rate:** % of SERP API calls that succeed (Target: 95%+)

### Guest Invite Metrics

- **Invite Click Rate:** % of sent invites that are opened (Target: 80%+)
- **Guest Completion Rate:** % who submit origin city + RSVP (Target: 70%+)
- **Personalization Impact:** Conversion lift from personalized recommendations (Target: +30%)

### Technical Metrics

- **Page Load Time:** < 2 seconds (Target)
- **API Response Time:** < 500ms (Target)
- **Cache Hit Rate:** > 60% (Target)
- **Error Rate:** < 1% (Target)

---

## Competitive Analysis

### What Competitors Do Well

**Airbnb Experiences:**
- ✅ Beautiful photo-first UI
- ✅ Clear pricing (no hidden fees)
- ✅ Instant booking
- ✅ Host profiles with reviews
- ❌ No multi-day itinerary building
- ❌ No group coordination tools

**The Knot (Wedding Planning):**
- ✅ Comprehensive vendor directory
- ✅ Budget tracker
- ✅ Guest list manager
- ✅ Checklist/timeline
- ❌ No personalized guest travel logistics
- ❌ No multi-template support

**Trippr (Group Travel):**
- ✅ Poll/voting for group decisions
- ✅ Shared itinerary
- ✅ Budget splitting
- ✅ Group chat
- ❌ Limited to travel (no events)
- ❌ No vendor marketplace

### Traveloure's Unique Value Proposition

**Differentiation:**
1. **Multi-Template Platform** - 21 event types in one platform (vs competitors with single focus)
2. **Guest Personalization** - Per-guest travel logistics (no competitor does this)
3. **AI Optimization** - Itinerary optimization with AI (unique)
4. **Unified Cart** - Book everything in one checkout (vs jumping between sites)
5. **Expert Matching** - AI-matched travel experts (The Knot has vendors, not advisors)

---

## Appendix: Template Priority Matrix

| Template | Business Priority | Technical Complexity | User Demand | Implementation Order |
|----------|-------------------|---------------------|-------------|---------------------|
| **Wedding** | 🔴 Critical | 🟠 High | 🔴 Very High | **1** |
| **Bachelor/Bachelorette** | 🟠 High | ✅ Complete | 🔴 Very High | **2** (Data only) |
| **Anniversary Trip** | 🟡 Medium | ✅ Complete | 🟡 Medium | **3** (Data only) |
| **Corporate Events** | 🟠 High | 🟡 Medium | 🟠 High | **4** |
| **Birthday** | 🟡 Medium | 🟡 Medium | 🟠 High | **5** |
| **Travel** | 🟡 Medium | 🟡 Medium | 🔴 Very High | **6** |
| **Proposal** | 🟡 Medium | 🟡 Medium | 🟡 Medium | **7** |
| **Date Night** | 🟢 Low | 🟢 Low | 🟡 Medium | **8** |
| **Reunions** | 🟢 Low | 🟡 Medium | 🟡 Medium | **9** |
| **Retreats** | 🟢 Low | 🟡 Medium | 🟢 Low | **10** |
| **Party Templates** (10 total) | 🟢 Low | 🟢 Low | 🟡 Medium | **11-20** |

---

## Conclusion & Next Steps

### Immediate Actions (This Week)

1. **Fix Wedding Template UX Bugs**
   - Remove button state dependency
   - Add wedding date field
   - Test multi-mode switching

2. **Implement Google Places API**
   - Integrate for wedding venues tab
   - Display venue cards with photos, ratings, price
   - Add "Request Quote" CTA

3. **Design Guest Invite System**
   - Finalize database schema
   - Wireframe guest invite page
   - Plan API endpoints

### Medium-Term Goals (Next Month)

1. **SERP API Integration**
   - Google Places (venues)
   - Yelp (vendors)
   - Booking.com (accommodations)
   - Viator (activities)
   - OpenTable (dining)

2. **Guest Personalization**
   - Unique invite links
   - Per-guest data collection
   - Personalized flight recommendations

3. **Database Migration**
   - Migrate wedding template
   - Migrate corporate events template
   - Migrate 5 party templates

### Long-Term Vision (3 Months)

1. **All Templates Database-Driven**
   - Consistent architecture
   - Easy to add new templates
   - A/B testing capabilities

2. **AI-Powered Recommendations**
   - Destination suggestions based on preferences
   - Itinerary optimization
   - Budget optimization

3. **Full-Service Booking Platform**
   - Unified checkout
   - Vendor payments
   - Booking confirmations
   - Calendar sync

---

**Report End**
