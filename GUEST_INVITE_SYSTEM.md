# Guest Invite System Documentation

**Created:** February 1, 2025  
**Status:** MVP Implemented | SERP API Integration Pending  
**Game-Changing Feature:** Per-guest personalized travel logistics

---

## 🎯 Executive Summary

### The Problem
Current event planning platforms (The Knot, Zola, etc.) assume all guests travel from the same location. This creates a **terrible experience for destination weddings and events** where guests come from dozens of different cities.

**Example Pain Points:**
- Wedding in NYC
- Guest A from Tampa sees same "NYC hotels" as Guest B from Boston
- No personalized flight options from Tampa → NYC
- No ground transport recommendations specific to their airport/origin
- No way to filter activities by "what to do if I arrive 2 days early"

### The Solution: Personalized Guest Invites

**Core Innovation:**
1. **Unique invite link per guest** (e.g., `/invite/abc123xyz`)
2. **Guest inputs their city of origin** (Tampa, FL)
3. **System shows personalized recommendations:**
   - ✈️ **Flights:** Tampa → NYC for wedding dates
   - 🚗 **Ground Transport:** TPA airport → venue in Manhattan
   - 🏨 **Hotels:** Near wedding venue
   - 🎭 **Activities:** Things to do in NYC if arriving early/staying late

### Why This Matters
- ✅ **No competitor has this feature**
- ✅ **Solves real pain point** for 60% of weddings (destination weddings)
- ✅ **Viral potential** - guests will screenshot their personalized pages
- ✅ **Data goldmine** - Know exactly where guests travel from (origin cities map visualization)

---

## 📐 System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORGANIZER (Event Host)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Create Event Experience  │
              │  (Wedding in NYC 3/10/25) │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Generate Guest Invites   │
              │  - Guest A: john@email    │
              │  - Guest B: jane@email    │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  System Creates Unique    │
              │  Tokens (abc123, def456)  │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Send Invite Links        │
              │  (Email/SMS)              │
              └───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GUEST (Invitee)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Click Invite Link        │
              │  /invite/abc123xyz        │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Personalized Welcome     │
              │  "You're invited, John!"  │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Enter Origin City        │
              │  "Where are you from?"    │
              │  → Tampa, FL              │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  System Saves Origin      │
              │  Geocodes Tampa           │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Submit RSVP              │
              │  - Attending: Yes         │
              │  - Guests: 2              │
              │  - Dietary: Vegan         │
              └───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERP API INTEGRATION                          │
│  (Future Phase - Not Yet Implemented)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Query SERP APIs          │
              │  - Google Flights         │
              │    Tampa → NYC 3/9-3/11   │
              │  - Booking.com            │
              │    Hotels near venue      │
              │  - Uber API               │
              │    TPA → Manhattan        │
              │  - Viator API             │
              │    NYC activities         │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Cache Results in DB      │
              │  (guest_travel_plans)     │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │  Display Personalized     │
              │  Recommendations          │
              │  - Flights (5 options)    │
              │  - Hotels (10 options)    │
              │  - Transport ($45 Uber)   │
              │  - Activities (12 ideas)  │
              └───────────────────────────┘
```

---

## 🗄️ Database Schema

### 1. `event_invites` Table

**Purpose:** Store unique invite links for each guest

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR (PK) | UUID primary key |
| `experience_id` | VARCHAR (FK) | Links to `user_experiences` (the event) |
| `organizer_id` | VARCHAR (FK) | Event host (user who created event) |
| `guest_email` | VARCHAR(255) | Guest email address |
| `guest_name` | VARCHAR(255) | Guest full name |
| `guest_phone` | VARCHAR(50) | Optional phone number |
| `unique_token` | VARCHAR(100) UNIQUE | URL-safe token for invite link |
| **ORIGIN LOCATION** | | |
| `origin_city` | VARCHAR(255) | Guest's city of origin (e.g., "Tampa") |
| `origin_state` | VARCHAR(100) | State/province |
| `origin_country` | VARCHAR(100) | Country |
| `origin_latitude` | DECIMAL(10,7) | Geocoded latitude |
| `origin_longitude` | DECIMAL(10,7) | Geocoded longitude |
| **RSVP DATA** | | |
| `rsvp_status` | VARCHAR(20) | pending, accepted, declined, maybe |
| `rsvp_date` | TIMESTAMP | When guest responded |
| `number_of_guests` | INTEGER | Total guests (including +1s) |
| **PREFERENCES** | | |
| `dietary_restrictions` | JSONB | Array of dietary needs |
| `accommodation_preference` | VARCHAR(50) | hotel_block, own_booking, with_family |
| `transportation_needed` | BOOLEAN | Need shuttle/transport? |
| `special_requests` | TEXT | Special accommodations |
| `message` | TEXT | Message to organizer |
| **TRACKING** | | |
| `invite_sent_at` | TIMESTAMP | When invite was sent |
| `invite_viewed_at` | TIMESTAMP | First view timestamp |
| `last_viewed_at` | TIMESTAMP | Most recent view |
| `view_count` | INTEGER | Total views |
| `created_at` | TIMESTAMP | Created timestamp |
| `updated_at` | TIMESTAMP | Last updated |

**Indexes:**
- `idx_event_invites_experience` on `experience_id`
- `idx_event_invites_token` on `unique_token` (for fast lookup)
- `idx_event_invites_email` on `guest_email`
- `idx_event_invites_rsvp_status` on `rsvp_status`

---

### 2. `guest_travel_plans` Table

**Purpose:** Store personalized travel recommendations and selections

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR (PK) | UUID primary key |
| `invite_id` | VARCHAR (FK) UNIQUE | Links to `event_invites` (1:1 relationship) |
| **FLIGHTS** | | |
| `selected_flight` | JSONB | Guest's chosen flight |
| `flight_options` | JSONB | Cached SERP API results (Amadeus/Skyscanner) |
| `flight_search_date` | TIMESTAMP | When flight search was performed |
| **GROUND TRANSPORT** | | |
| `selected_transport` | JSONB | Chosen transport option |
| `transport_options` | JSONB | Uber/Lyft/Rental car/Shuttle options |
| `transport_search_date` | TIMESTAMP | When transport search was performed |
| **ACCOMMODATION** | | |
| `selected_accommodation` | JSONB | Chosen hotel/Airbnb |
| `accommodation_options` | JSONB | Cached hotel results (Booking.com) |
| `accommodation_search_date` | TIMESTAMP | When hotel search was performed |
| **ACTIVITIES** | | |
| `selected_activities` | JSONB | Activities guest is interested in |
| `activity_recommendations` | JSONB | Cached activity results (Viator/TripAdvisor) |
| `activities_search_date` | TIMESTAMP | When activity search was performed |
| **BUDGET** | | |
| `estimated_total_cost` | DECIMAL(10,2) | Total estimated cost (flight + hotel + transport) |
| `budget_breakdown` | JSONB | Cost breakdown by category |
| **DATES** | | |
| `arrival_date` | TIMESTAMP | Guest arrival date (may be before event) |
| `departure_date` | TIMESTAMP | Guest departure date (may be after event) |
| `created_at` | TIMESTAMP | Created timestamp |
| `updated_at` | TIMESTAMP | Last updated |

**Why JSONB for Options?**
- Flexible schema for different API responses
- Can cache 10+ flight options without rigid columns
- Easy to filter/query with PostgreSQL JSONB operators

**Example `flight_options` JSON:**
```json
[
  {
    "airline": "Delta",
    "flight_number": "DL1234",
    "departure_airport": "TPA",
    "arrival_airport": "JFK",
    "departure_time": "2025-03-09T08:00:00Z",
    "arrival_time": "2025-03-09T11:30:00Z",
    "duration_minutes": 210,
    "stops": 0,
    "price_usd": 245,
    "booking_link": "https://delta.com/..."
  },
  ...
]
```

---

### 3. `invite_templates` Table

**Purpose:** Allow organizers to customize invite messages

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR (PK) | UUID primary key |
| `user_id` | VARCHAR (FK) | Template creator |
| `name` | VARCHAR(255) | Template name |
| `subject` | VARCHAR(500) | Email subject line |
| `message_body` | TEXT | Email/message body with variables |
| `variables` | JSONB | Supported variables ({{guest_name}}, etc.) |
| `event_type` | VARCHAR(50) | Event type this template is for |
| `is_default` | BOOLEAN | Default template for event type? |
| `created_at` | TIMESTAMP | Created timestamp |
| `updated_at` | TIMESTAMP | Last updated |

**Supported Variables:**
- `{{guest_name}}` - Guest's name
- `{{event_name}}` - Event title
- `{{event_date}}` - Event date
- `{{event_destination}}` - Event location
- `{{invite_link}}` - Unique invite URL
- `{{organizer_name}}` - Host's name

---

### 4. `invite_send_log` Table

**Purpose:** Track invite delivery and engagement

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR (PK) | UUID primary key |
| `invite_id` | VARCHAR (FK) | Links to `event_invites` |
| `method` | VARCHAR(20) | email, sms, whatsapp |
| `recipient_address` | VARCHAR(255) | Email or phone number |
| `status` | VARCHAR(20) | sent, failed, bounced, opened, clicked |
| `error_message` | TEXT | Error details if failed |
| `sent_at` | TIMESTAMP | Send timestamp |
| `opened_at` | TIMESTAMP | Email open timestamp |
| `clicked_at` | TIMESTAMP | Link click timestamp |

---

## 🔌 API Endpoints

### Organizer Endpoints (Event Host)

#### `POST /api/events/:experienceId/invites`
**Create invite links for guests**

**Request Body:**
```json
{
  "guests": [
    {
      "email": "john@example.com",
      "name": "John Smith",
      "phone": "+1-555-0100"
    },
    {
      "email": "jane@example.com",
      "name": "Jane Doe"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Created 2 invites",
  "invites": [
    {
      "id": "uuid-1",
      "guestEmail": "john@example.com",
      "guestName": "John Smith",
      "uniqueToken": "abc123xyz",
      "inviteLink": "https://traveloure.com/invite/abc123xyz",
      "rsvpStatus": "pending"
    },
    ...
  ]
}
```

---

#### `GET /api/events/:experienceId/invites`
**Get all invites for an event**

**Response:**
```json
{
  "invites": [
    {
      "id": "uuid-1",
      "guestName": "John Smith",
      "guestEmail": "john@example.com",
      "originCity": "Tampa",
      "rsvpStatus": "accepted",
      "numberOfGuests": 2,
      "inviteViewedAt": "2025-01-15T10:30:00Z",
      "viewCount": 3,
      "inviteLink": "https://traveloure.com/invite/abc123xyz"
    },
    ...
  ]
}
```

---

#### `GET /api/events/:experienceId/invites/stats`
**Get RSVP statistics**

**Response:**
```json
{
  "stats": {
    "total": 50,
    "accepted": 35,
    "declined": 5,
    "pending": 10,
    "totalGuests": 78,
    "originCities": ["Tampa", "Boston", "Miami", "Chicago", ...],
    "viewedCount": 45,
    "notViewedCount": 5
  }
}
```

---

#### `DELETE /api/invites/:inviteId`
**Delete/cancel an invite**

---

### Guest Endpoints (Invite Recipients)

#### `GET /api/invites/:token`
**Get invite details (public endpoint)**

**Response:**
```json
{
  "invite": {
    "id": "uuid-1",
    "guestName": "John Smith",
    "guestEmail": "john@example.com",
    "originCity": null,
    "rsvpStatus": "pending"
  },
  "experience": {
    "id": "exp-uuid",
    "title": "Sarah & Mike's Wedding",
    "destination": "New York City, NY",
    "startDate": "2025-03-10",
    "endDate": "2025-03-10"
  }
}
```

**Tracking:** This endpoint automatically increments `view_count` and sets `invite_viewed_at` on first view.

---

#### `POST /api/invites/:token/origin`
**Save guest's origin city**

**Request Body:**
```json
{
  "originCity": "Tampa",
  "originState": "FL",
  "originCountry": "United States",
  "latitude": 27.9506,
  "longitude": -82.4572
}
```

**Response:**
```json
{
  "message": "Origin city saved successfully",
  "invite": { ... }
}
```

---

#### `POST /api/invites/:token/rsvp`
**Submit RSVP**

**Request Body:**
```json
{
  "rsvpStatus": "accepted",
  "numberOfGuests": 2,
  "dietaryRestrictions": ["Vegetarian", "Gluten-Free"],
  "accommodationPreference": "hotel_block",
  "transportationNeeded": true,
  "specialRequests": "We'll need a high chair for our 2-year-old",
  "message": "So excited to celebrate with you!"
}
```

**Response:**
```json
{
  "message": "RSVP submitted successfully",
  "invite": { ... }
}
```

---

#### `GET /api/invites/:token/recommendations`
**Get personalized travel recommendations**

**Response (Current - Without SERP APIs):**
```json
{
  "recommendations": {
    "origin": {
      "city": "Tampa",
      "state": "FL",
      "country": "United States"
    },
    "destination": {
      "city": "New York City",
      "eventDate": "2025-03-10"
    },
    "flights": [],
    "groundTransport": [],
    "accommodations": [],
    "activities": [],
    "needsApiIntegration": true
  },
  "travelPlan": { ... }
}
```

**Response (Future - With SERP APIs):**
```json
{
  "recommendations": {
    "origin": { ... },
    "destination": { ... },
    "flights": [
      {
        "airline": "Delta",
        "price": 245,
        "departure": "2025-03-09T08:00:00Z",
        "arrival": "2025-03-09T11:30:00Z",
        ...
      },
      ...
    ],
    "groundTransport": [
      {
        "type": "uber",
        "from": "TPA Airport",
        "to": "Wedding Venue Manhattan",
        "estimatedCost": 75,
        "duration": "30 mins"
      },
      ...
    ],
    "accommodations": [
      {
        "name": "The Plaza Hotel",
        "distanceFromVenue": "0.5 miles",
        "pricePerNight": 350,
        "rating": 4.5,
        ...
      },
      ...
    ],
    "activities": [
      {
        "title": "Central Park Walking Tour",
        "duration": "2 hours",
        "price": 45,
        ...
      },
      ...
    ],
    "estimatedCost": 1245
  }
}
```

---

#### `POST /api/invites/:token/travel-plans`
**Update guest's travel selections**

**Request Body:**
```json
{
  "selectedFlight": { ... },
  "selectedAccommodation": { ... },
  "selectedTransport": { ... },
  "selectedActivities": [ ... ],
  "arrivalDate": "2025-03-09T14:00:00Z",
  "departureDate": "2025-03-11T10:00:00Z"
}
```

---

## 🎨 Frontend Components

### 1. `<GuestInviteManager />` (Organizer View)

**Location:** `/client/src/components/GuestInviteManager.tsx`

**Features:**
- ✅ Add guests (name, email, phone)
- ✅ Bulk invite creation
- ✅ View all invites in table
- ✅ Copy invite links
- ✅ Track RSVP status (visual badges)
- ✅ See origin cities
- ✅ View engagement metrics (views, RSVP rate)
- ✅ Delete invites
- ✅ RSVP statistics dashboard

**Usage:**
```tsx
<GuestInviteManager
  experienceId="event-uuid"
  eventName="Sarah & Mike's Wedding"
  eventDestination="New York City"
  eventDate="2025-03-10"
/>
```

**Key Components:**
- Stats cards (Total Invites, Accepted, Pending, Origin Cities)
- Add guests dialog (multi-row form)
- Invites table with actions
- Copy-to-clipboard for invite links

---

### 2. `<GuestInvitePage />` (Guest View)

**Location:** `/client/src/pages/GuestInvitePage.tsx`  
**Route:** `/invite/:token`

**Multi-Step Flow:**

#### Step 1: Welcome
- Personalized greeting: "You're Invited, John! 🎉"
- Event details (name, location, date)
- Explanation of personalized travel feature

#### Step 2: Origin City Input
- City, State, Country inputs
- Autocomplete (future: Google Places Autocomplete)
- Geocoding (future: convert to lat/lng)

#### Step 3: RSVP Form
- **RSVP Status:** Accepted / Declined / Maybe
- **Number of Guests:** Input field
- **Dietary Restrictions:** Checkboxes
- **Accommodation Preference:** Dropdown
- **Transportation Needed:** Checkbox
- **Special Requests:** Textarea
- **Message to Host:** Textarea

#### Step 4: Recommendations
- **Tabs:** Flights, Transport, Hotels, Activities
- Personalized results based on origin city
- Placeholder UI (until SERP APIs integrated)
- Booking links for external sites

---

## 🔮 SERP API Integration Strategy

### Phase 1: Core APIs (MVP+)

#### 1. **Google Flights API / Amadeus API**
**Purpose:** Flight search from origin → destination

**Query:**
```
origin: TPA (Tampa International)
destination: NYC (All airports: JFK, LGA, EWR)
dates: 3/9/2025 - 3/11/2025 (around event date)
passengers: 2 (from RSVP)
```

**Data to Cache:**
- Airline name
- Flight numbers
- Departure/arrival times
- Duration
- Stops
- Price (USD)
- Booking link

**Caching Strategy:**
- Cache for 24 hours per origin-destination pair
- Refresh if guest changes arrival/departure dates
- Store in `guest_travel_plans.flight_options` JSONB

---

#### 2. **Booking.com Affiliate API**
**Purpose:** Hotels near event venue

**Query:**
```
location: Event venue address (geocoded)
radius: 5 miles
check_in: Event date - 1 day
check_out: Event date + 1 day
guests: 2 (from RSVP)
```

**Data to Cache:**
- Hotel name
- Address
- Distance from venue
- Price per night
- Total price
- Rating (stars + guest score)
- Photos
- Amenities
- Booking link

---

#### 3. **Uber API / Google Maps Distance Matrix**
**Purpose:** Ground transport estimates

**Calculations:**
- **Origin Airport → Venue**
  - Example: TPA → Manhattan wedding venue
  - Uber estimate: $75, 30 mins
- **Hotel → Venue**
  - Example: The Plaza → Venue
  - Walking: 0.5 miles, 10 mins
  - Uber: $12, 5 mins

**Data to Cache:**
- Transport type (Uber, Lyft, taxi, rental car, public transit)
- Estimated cost
- Duration
- Distance

---

#### 4. **Viator API / TripAdvisor API**
**Purpose:** Activities in destination city

**Query:**
```
location: Event destination city
categories: Tours, Attractions, Food & Drink
duration: 2-4 hours (for day-before or day-after)
price_range: $20-$100
```

**Data to Cache:**
- Activity title
- Description
- Duration
- Price
- Rating
- Photos
- Booking link

---

### Phase 2: Advanced APIs

#### 5. **OpenWeather API**
**Purpose:** Weather forecast for event date

#### 6. **Rental Car APIs**
**Purpose:** Car rental options at destination airport

#### 7. **Restaurant APIs (OpenTable, Yelp)**
**Purpose:** Dining recommendations near venue

---

### Caching & Optimization

**Why Cache?**
- Reduce API costs (flights are expensive per query)
- Faster page loads for guests
- Multiple guests from same city can share results

**Cache Strategy:**
```
Key: origin_city + destination_city + event_date
TTL: 24 hours
Storage: guest_travel_plans.flight_options (JSONB)
```

**Example:**
- Guest A from Tampa queries flights → API call → Cache result
- Guest B from Tampa queries 2 hours later → Serve from cache (no API call)
- Guest C from Boston queries → Different cache key → New API call

---

## 📊 Analytics & Insights

### Organizer Dashboard Metrics

1. **Origin Cities Map**
   - Heatmap showing where guests are traveling from
   - Pin clusters for major cities

2. **RSVP Funnel**
   - Invite sent → Viewed → Origin set → RSVP submitted
   - Identify drop-off points

3. **Engagement Score**
   - View count per invite
   - Time to RSVP
   - Link sharing (if guests forward to +1s)

4. **Travel Insights**
   - Average flight cost by origin city
   - Most popular hotels
   - Transportation preferences

---

## 🚀 Implementation Checklist

### ✅ Phase 1: Core System (COMPLETED)

- [x] Database schema designed
- [x] Migration SQL file created
- [x] Backend API endpoints implemented
- [x] Organizer component (`<GuestInviteManager />`)
- [x] Guest invite page (`<GuestInvitePage />`)
- [x] RSVP form with all fields
- [x] Token generation & validation
- [x] View tracking

### 🔄 Phase 2: SERP API Integration (NEXT)

- [ ] Google Flights API integration
- [ ] Booking.com API integration
- [ ] Uber API / Google Maps integration
- [ ] Viator API integration
- [ ] Result caching in `guest_travel_plans`
- [ ] Recommendation display UI
- [ ] Booking link tracking

### 📅 Phase 3: Polish & Optimization (FUTURE)

- [ ] Email invite sending (SendGrid/Mailgun)
- [ ] SMS invite sending (Twilio)
- [ ] Custom invite templates
- [ ] Origin city autocomplete (Google Places)
- [ ] Map visualization of origin cities
- [ ] Budget calculator for guests
- [ ] Save travel itinerary to calendar
- [ ] Share travel plans with travel companions

---

## 💡 Future Enhancements

### 1. **Group Travel Coordination**
- Guests from same city can see each other
- Coordinate shared flights/transportation
- Split hotel rooms

### 2. **Flight Price Alerts**
- "Tampa → NYC flights just dropped to $199!"
- Email alerts for price changes

### 3. **Travel Insurance Upsell**
- Partner with travel insurance providers
- Recommend insurance based on trip cost

### 4. **Carbon Offset**
- Calculate flight carbon footprint
- Offer carbon offset purchase

### 5. **Influencer Integration**
- Influencers curate "best places to stay" for destination
- Affiliate revenue share

---

## 🎯 Competitive Advantage

### What The Knot / Zola / Withjoy DON'T Have:

1. ❌ **No per-guest personalization**
   - They show same recommendations to all guests
   
2. ❌ **No origin city tracking**
   - They don't know where guests travel from
   
3. ❌ **No flight search integration**
   - Guests have to search flights separately
   
4. ❌ **No ground transport recommendations**
   - No airport → venue guidance
   
5. ❌ **No origin city analytics**
   - Organizers can't see guest travel patterns

### What Traveloure WILL Have:

1. ✅ **Unique invite link per guest**
2. ✅ **Origin city input**
3. ✅ **Personalized flight options** (Tampa → NYC)
4. ✅ **Ground transport estimates** (TPA → Venue)
5. ✅ **Hotels filtered by distance from venue**
6. ✅ **Activities for early arrivals**
7. ✅ **Origin cities map visualization**
8. ✅ **Travel cost estimates per guest**

---

## 📝 Developer Notes

### Running Migrations

```bash
# Apply guest invite system migration
psql $DATABASE_URL -f server/migrations/001_guest_invite_system.sql
```

### Testing Endpoints

```bash
# Create test invite
curl -X POST http://localhost:5000/api/events/test-event-id/invites \
  -H "Content-Type: application/json" \
  -d '{"guests": [{"email": "test@example.com", "name": "Test Guest"}]}'

# Get invite details
curl http://localhost:5000/api/invites/abc123xyz

# Submit RSVP
curl -X POST http://localhost:5000/api/invites/abc123xyz/rsvp \
  -H "Content-Type: application/json" \
  -d '{"rsvpStatus": "accepted", "numberOfGuests": 2}'
```

### Adding to Main Routes

In `server/index.ts`:
```typescript
import { setupGuestInviteRoutes } from './routes/guest-invites';

// ...

setupGuestInviteRoutes(app);
```

---

## 🎉 Success Metrics

### KPIs to Track:

1. **Invite Usage Rate**
   - % of events that use guest invites
   - Target: 60% of destination weddings

2. **Guest Engagement**
   - % of invites viewed
   - % of guests who set origin city
   - Target: 80% view rate, 70% set origin

3. **RSVP Conversion**
   - Time from invite sent → RSVP submitted
   - Target: <7 days

4. **Viral Coefficient**
   - Guests sharing their personalized pages
   - Social media screenshots

5. **Revenue Impact**
   - Flight/hotel bookings via affiliate links
   - Target: $50 revenue per destination wedding

---

## 📚 Related Documentation

- `TEMPLATE_ANALYSIS_REPORT.md` - Full context on wedding template pain points
- `SERP_API_QUERIES.json` - SERP API query examples for travel data
- `/shared/guest-invites-schema.ts` - Database schema TypeScript definitions
- `/server/routes/guest-invites.ts` - API endpoints implementation
- `/client/src/components/GuestInviteManager.tsx` - Organizer UI component
- `/client/src/pages/GuestInvitePage.tsx` - Guest-facing invite page

---

**Last Updated:** February 1, 2025  
**Status:** Ready for testing & SERP API integration  
**Next Steps:** Integrate Google Flights API for personalized flight recommendations
