# Traveloure Complete Booking Flow - Design Specification

**Date:** 2026-01-31  
**Status:** Design Phase  
**Owner:** Leon D

---

## 🎯 Overview

Complete user journey from city discovery → AI itinerary generation → customization → booking or expert handoff.

**Key Goals:**
- Capture user intent upfront (dates, experience type, travelers)
- AI-powered itinerary generation
- Seamless cart/checkout experience
- Optional expert refinement

---

## 📊 User Flows

### Flow 1: Single City ("Take me There")

```
City Card (TravelPulse/Discover)
    ↓ [Take me There button]
Planning Modal
    • Destination: [Pre-filled from card]
    • Date Range: [Start/End date picker]
    • Experience Type: [Travel/Wedding/Corporate/Event/Retreat]
    • # of Travelers: [Number input]
    • Special Requests: [Optional text]
    ↓ [Generate Itinerary button]
AI Processing (loading state)
    • Generate activities based on city gems/events
    • Create day-by-day itinerary
    • Suggest meals, transport, accommodations
    • Calculate pricing
    ↓
Experience Builder Page
    • Itinerary loaded in cart
    • Map view with pins
    • Timeline view (day-by-day)
    • All items editable
    ↓
User Actions:
    ├─ [Customize] → Edit items, add/remove services
    ├─ [Book Now] → Checkout Flow
    └─ [Send to Expert] → Expert Handoff Flow
```

### Flow 2: Multi-City

```
Homepage/Discover
    ↓ [Plan Multi-City Trip button]
Planning Modal
    • Cities: [Add multiple destinations with autocomplete]
    • Date Range: [Start/End for entire trip]
    • Experience Type: [Same as single-city]
    • # of Travelers: [Number input]
    • Travel Pace: [Slow/Medium/Fast - affects days per city]
    ↓ [Generate Itinerary button]
AI Processing
    • Generate itinerary for each city
    • Add inter-city transportation
    • Optimize timing and transitions
    • Balance budget across cities
    ↓
Experience Builder Page (Multi-City View)
    • Tabs or sections for each city
    • Inter-city transport included
    • Day-by-day timeline across all cities
    ↓
[Same user actions as single-city]
```

---

## 🎨 Planning Modal Design

### Component: `PlanningModal.jsx`

**Visual Layout:**
```
┌─────────────────────────────────────────────┐
│  ✨ Plan Your Perfect Trip                  │
│                                             │
│  📍 Destination                             │
│  [Paris, France          ] 🔍              │
│  + Add another city (for multi-city)       │
│                                             │
│  📅 When are you traveling?                 │
│  [Start Date] → [End Date]                  │
│  Suggested: 5-7 days                        │
│                                             │
│  🎭 What type of experience?                │
│  ○ Travel  ○ Wedding  ○ Corporate           │
│  ○ Event   ○ Retreat  ○ Other              │
│                                             │
│  👥 Number of travelers                     │
│  [  2  ] ➖ ➕                              │
│                                             │
│  💬 Special requests (optional)             │
│  [Tell us about dietary restrictions,       │
│   accessibility needs, interests...]        │
│                                             │
│          [Cancel]  [Generate Itinerary →]  │
└─────────────────────────────────────────────┘
```

**Validation Rules:**
- Destination: Required (pre-filled for single-city)
- Dates: Start must be >= today, end > start
- Experience Type: Required
- Travelers: Min 1, max 50
- Special Requests: Max 500 chars

**Multi-City Additions:**
- "+ Add another city" button
- Each city shows with remove button
- Min 2 cities, max 5 cities
- Option to specify days per city or let AI decide

---

## 🤖 AI Itinerary Generation

### API Endpoint: `POST /api/itinerary/generate`

**Request Payload:**
```json
{
  "destinations": [
    {
      "city": "Paris",
      "country": "France",
      "cityId": "paris-fr",
      "suggestedDays": 4
    }
  ],
  "startDate": "2026-03-15",
  "endDate": "2026-03-19",
  "experienceType": "travel",
  "travelers": 2,
  "specialRequests": "Vegetarian meals, love art museums",
  "budget": "moderate",
  "userId": "user_123"
}
```

**AI Processing Steps:**
1. **Fetch City Data**
   - Hidden gems from TravelPulse
   - Local events during date range
   - Available service providers
   - Seasonal recommendations

2. **Generate Day Plans**
   - Morning/Afternoon/Evening activities
   - Travel time between locations
   - Meal suggestions (breakfast/lunch/dinner)
   - Balance of activity types

3. **Add Services**
   - Accommodations (hotels, Airbnb alternatives)
   - Transportation (airport transfers, local transit, rentals)
   - Tours/experiences from marketplace
   - Restaurant reservations

4. **Optimize & Price**
   - Check availability
   - Calculate total cost
   - Suggest alternatives for budget
   - Flag bookings that need expert help

**Response Structure:**
```json
{
  "tripId": "trip_abc123",
  "itinerary": {
    "days": [
      {
        "date": "2026-03-15",
        "dayNumber": 1,
        "city": "Paris",
        "items": [
          {
            "id": "item_001",
            "type": "accommodation",
            "time": "14:00",
            "title": "Check-in: Le Marais Boutique Hotel",
            "duration": "4 nights",
            "price": 850.00,
            "checkIn": "2026-03-15",
            "checkOut": "2026-03-19",
            "metadata": {
              "providerId": "hotel_123",
              "address": "...",
              "amenities": ["wifi", "breakfast"]
            }
          },
          {
            "id": "item_002",
            "type": "activity",
            "time": "16:00",
            "title": "Walking Tour: Le Marais District",
            "duration": "2 hours",
            "price": 45.00,
            "location": {
              "lat": 48.8566,
              "lng": 2.3522
            },
            "metadata": {
              "providerId": "tour_456",
              "category": "culture"
            }
          },
          {
            "id": "item_003",
            "type": "meal",
            "time": "19:30",
            "title": "Dinner: Chez L'Ami Jean",
            "duration": "1.5 hours",
            "price": 120.00,
            "estimatedCost": true,
            "metadata": {
              "cuisine": "French Bistro",
              "dietaryNotes": "Vegetarian options available"
            }
          }
        ]
      }
    ],
    "summary": {
      "totalDays": 4,
      "totalActivities": 12,
      "totalMeals": 8,
      "estimatedTotal": 2450.00,
      "breakdown": {
        "accommodation": 850.00,
        "activities": 340.00,
        "meals": 480.00,
        "transportation": 180.00,
        "miscellaneous": 600.00
      }
    }
  },
  "expertRecommendations": [
    {
      "expertId": "expert_789",
      "name": "Sophie Laurent",
      "specialty": "Paris Local Expert",
      "matchScore": 0.95
    }
  ]
}
```

---

## 🛒 Cart & Experience Builder

### Component: `ExperienceBuilder.jsx`

**Features:**
- **Timeline View:** Day-by-day breakdown
- **Map View:** All locations pinned
- **List View:** All items in categories
- **Cart Summary:** Running total, breakdown by category

**User Actions:**
- **Edit Item:** Modify time, replace with alternative
- **Remove Item:** Delete from itinerary
- **Add Item:** Browse marketplace, add custom item
- **Reorder:** Drag & drop items within days
- **Save Draft:** Auto-save + manual save option

**Cart Data Structure** (sessionStorage/localStorage):
```json
{
  "tripId": "trip_abc123",
  "destinations": ["Paris"],
  "startDate": "2026-03-15",
  "endDate": "2026-03-19",
  "experienceType": "travel",
  "travelers": 2,
  "items": [...], // Full itinerary items
  "customizations": true,
  "lastModified": "2026-01-31T11:07:00Z"
}
```

---

## 💳 Checkout Flow

### Phase 1: Cart Review

**Route:** `/checkout/review`

**Display:**
```
┌─────────────────────────────────────────┐
│  Your Trip to Paris                     │
│  March 15-19, 2026 • 2 travelers       │
│                                         │
│  📦 What's Included                     │
│  ├─ Accommodation (4 nights)   $850    │
│  ├─ Activities (12 items)      $340    │
│  ├─ Meals (8 reservations)     $480    │
│  └─ Transportation             $180    │
│                                         │
│  💡 Expert Add-ons Available            │
│  [View recommendations]                 │
│                                         │
│  ────────────────────────────────       │
│  Subtotal                     $1,850    │
│  Service Fee (5%)                $93    │
│  Total                        $1,943    │
│                                         │
│  [← Back to Edit]  [Continue to Pay →] │
└─────────────────────────────────────────┘
```

**User Can:**
- Review all items
- See price breakdown
- Go back to edit
- See terms & conditions
- Add expert consultation ($50-200)

---

### Phase 2: Traveler Information

**Route:** `/checkout/travelers`

**Collect:**
- Primary traveler (from account or new entry)
- Additional travelers (names, emails)
- Contact phone
- Emergency contact
- Special needs/requirements per traveler

**For Each Service:**
- Some items may need additional info (e.g., passport details for international)
- Dietary restrictions for meals
- Accessibility needs

---

### Phase 3: Payment

**Route:** `/checkout/payment`

**Payment Methods:**
- Credit/Debit Card (Stripe)
- PayPal
- Apple Pay / Google Pay
- Split payment option (50% now, 50% before trip)
- Payment plans for high-value bookings

**Payment Flow:**
1. Select payment method
2. Enter payment details (Stripe Elements)
3. Apply promo codes
4. Review final total
5. Agree to terms
6. Submit payment

**Security:**
- PCI compliant (Stripe handles card data)
- 3D Secure for international
- Fraud detection
- SSL/TLS encryption

---

### Phase 4: Confirmation

**Route:** `/checkout/confirmation`

**Display:**
```
✅ Your trip is confirmed!

Booking Reference: #TRV-2026-001234

📧 Confirmation sent to: leon@example.com

📱 What's Next:
  • Add to calendar
  • Download itinerary (PDF)
  • View in dashboard
  • Chat with your expert (if included)

🎫 Your Services:
  ✓ Le Marais Hotel - Confirmation #HTL123
  ✓ Walking Tour - Ticket #TKT456
  ✓ [All bookings listed]

Need help? Contact us or message your expert
```

**Post-Booking Actions:**
- Email confirmation with PDF attachment
- SMS confirmation (optional)
- Calendar invites (.ics files)
- Update user dashboard
- Notify service providers
- Create support ticket thread
- If expert involved, create expert chat

---

## 👨‍🏫 Expert Handoff Flow

### Trigger: User clicks "Send to Expert"

**Route:** `/expert-handoff?tripId=trip_abc123`

**Process:**
1. **Create Trip Record** (if not exists)
   - Save current itinerary state
   - Mark as "pending expert review"
   
2. **Show Expert Matching**
   ```
   ┌─────────────────────────────────────────┐
   │  🎯 Finding Your Perfect Expert         │
   │                                         │
   │  We're matching you with experts who:   │
   │  ✓ Specialize in Paris                  │
   │  ✓ Have experience with Travel trips    │
   │  ✓ Are available for your dates         │
   │                                         │
   │  [View 3 matched experts →]             │
   └─────────────────────────────────────────┘
   ```

3. **Expert Selection Page** (`/discover` with context)
   - Show top 3-5 matched experts
   - Display expert profiles, ratings, specialties
   - "Your AI itinerary has been shared" banner
   - User selects expert

4. **Expert Communication**
   - Opens chat/messaging with expert
   - Expert sees AI itinerary
   - Expert can modify, add, remove items
   - Real-time collaboration
   - User approves final itinerary

5. **Back to Checkout**
   - Once approved, go to checkout flow
   - Expert fee added to total
   - Expert commission handled backend

---

## 🏗️ Technical Architecture

### Frontend Components

```
src/
├── components/
│   ├── planning/
│   │   ├── PlanningModal.jsx          # Main modal
│   │   ├── DateRangePicker.jsx        # Date selection
│   │   ├── ExperienceTypeSelector.jsx # Experience type
│   │   ├── CitySelector.jsx           # Multi-city input
│   │   └── TravelerInput.jsx          # Traveler count
│   ├── itinerary/
│   │   ├── ExperienceBuilder.jsx      # Main builder page
│   │   ├── TimelineView.jsx           # Day-by-day view
│   │   ├── MapView.jsx                # Map with pins
│   │   ├── CartSummary.jsx            # Price breakdown
│   │   └── ItineraryItem.jsx          # Individual items
│   ├── checkout/
│   │   ├── ReviewCart.jsx             # Phase 1
│   │   ├── TravelerInfo.jsx           # Phase 2
│   │   ├── PaymentForm.jsx            # Phase 3 (Stripe)
│   │   ├── Confirmation.jsx           # Phase 4
│   │   └── CheckoutLayout.jsx         # Wrapper
│   └── experts/
│       ├── ExpertHandoff.jsx          # Handoff banner
│       ├── ExpertMatcher.jsx          # Matching algorithm
│       └── ExpertChat.jsx             # Communication
├── lib/
│   ├── api/
│   │   ├── itinerary.js               # AI generation API
│   │   ├── checkout.js                # Payment/booking API
│   │   ├── experts.js                 # Expert matching API
│   │   └── trips.js                   # Trip CRUD
│   └── utils/
│       ├── cartHelpers.js             # Cart operations
│       ├── priceCalculator.js         # Pricing logic
│       └── dateHelpers.js             # Date utilities
└── redux-features/
    ├── trip/
    │   └── tripSlice.js               # Trip state
    ├── cart/
    │   └── cartSlice.js               # Cart state
    └── checkout/
        └── checkoutSlice.js           # Checkout state
```

### Backend APIs

```
/api/
├── itinerary/
│   ├── POST /generate                # Generate AI itinerary
│   ├── POST /regenerate/:id          # Regenerate section
│   └── PATCH /:id                    # Update itinerary
├── trips/
│   ├── POST /                        # Create trip
│   ├── GET /:id                      # Get trip
│   ├── PATCH /:id                    # Update trip
│   └── DELETE /:id                   # Delete trip
├── checkout/
│   ├── POST /initialize              # Start checkout session
│   ├── POST /payment                 # Process payment
│   ├── POST /confirm                 # Confirm booking
│   └── GET /status/:id               # Check status
├── experts/
│   ├── POST /match                   # Match experts
│   ├── POST /handoff                 # Create handoff
│   └── GET /availability/:id         # Check expert schedule
└── bookings/
    ├── POST /                        # Create booking
    ├── GET /:id                      # Get booking details
    ├── PATCH /:id/cancel             # Cancel booking
    └── POST /notify-providers        # Notify service providers
```

### Database Schema

**Trips Table:**
```sql
trips:
  - id (PK)
  - user_id (FK)
  - destinations (JSON array)
  - start_date
  - end_date
  - experience_type
  - travelers_count
  - status (draft|expert_review|confirmed|completed)
  - itinerary (JSON)
  - expert_id (FK, nullable)
  - created_at
  - updated_at
```

**Bookings Table:**
```sql
bookings:
  - id (PK)
  - trip_id (FK)
  - user_id (FK)
  - reference_number
  - status (pending|confirmed|cancelled)
  - total_amount
  - payment_status
  - payment_method
  - stripe_payment_intent_id
  - booked_items (JSON)
  - traveler_info (JSON)
  - confirmation_sent_at
  - created_at
  - updated_at
```

**Trip_Items Table:**
```sql
trip_items:
  - id (PK)
  - trip_id (FK)
  - provider_id (FK, nullable)
  - item_type (accommodation|activity|meal|transport)
  - title
  - description
  - date
  - time
  - duration
  - price
  - location (JSON)
  - metadata (JSON)
  - booking_status (pending|confirmed|cancelled)
  - confirmation_code
  - created_at
```

**Expert_Handoffs Table:**
```sql
expert_handoffs:
  - id (PK)
  - trip_id (FK)
  - expert_id (FK)
  - user_id (FK)
  - status (pending|in_progress|completed)
  - original_itinerary (JSON)
  - modified_itinerary (JSON)
  - expert_notes
  - user_approved_at
  - completed_at
  - created_at
```

---

## 🔗 Integration Points

### 1. AI/LLM Integration
- **Provider:** OpenAI GPT-4 or Claude
- **Purpose:** Generate context-aware itineraries
- **Input:** User preferences + city data
- **Output:** Structured itinerary JSON

### 2. Payment Processing
- **Provider:** Stripe
- **Features:**
  - Payment intents
  - 3D Secure
  - Webhooks for confirmations
  - Refund handling

### 3. Service Provider APIs
- **Hotels:** Amadeus, Booking.com API (or internal)
- **Activities:** GetYourGuide, Viator API
- **Restaurants:** OpenTable, Resy API
- **Transport:** Uber, local transit APIs

### 4. Email/SMS
- **Provider:** SendGrid / Twilio
- **Use Cases:**
  - Booking confirmations
  - Itinerary PDFs
  - Reminders
  - Expert messages

### 5. Calendar Integration
- **Format:** .ics files
- **Features:**
  - Add all trip events to calendar
  - Reminders before activities
  - Check-in/checkout alerts

---

## 📱 Mobile Considerations

**Responsive Design:**
- Modal fits mobile screens
- Date picker mobile-friendly
- Touch-optimized drag/drop
- Simplified checkout on mobile

**Mobile-Specific Features:**
- Save to mobile wallet (Apple/Google)
- SMS confirmations prioritized
- One-tap payment methods
- Location-based reminders during trip

---

## 🚀 Implementation Phases

### Phase 1: Planning Modal & AI Generation (Week 1-2)
- [ ] Build PlanningModal component
- [ ] Integrate date picker
- [ ] Create experience type selector
- [ ] Multi-city selector
- [ ] Connect to AI API endpoint
- [ ] Loading states & error handling

### Phase 2: Cart & Experience Builder (Week 3-4)
- [ ] Build ExperienceBuilder page
- [ ] Timeline view
- [ ] Map integration
- [ ] Edit/delete items
- [ ] Cart summary component
- [ ] Save/load from storage

### Phase 3: Checkout Flow (Week 5-6)
- [ ] Review cart page
- [ ] Traveler info form
- [ ] Stripe integration
- [ ] Payment form
- [ ] Confirmation page
- [ ] Email notifications

### Phase 4: Expert Handoff (Week 7-8)
- [ ] Expert matching algorithm
- [ ] Handoff UI/UX
- [ ] Expert dashboard integration
- [ ] Chat/messaging system
- [ ] Approval workflow

### Phase 5: Polish & Testing (Week 9-10)
- [ ] Error handling
- [ ] Loading states
- [ ] Mobile optimization
- [ ] Payment testing
- [ ] End-to-end testing
- [ ] Security audit

---

## ⚠️ Edge Cases & Considerations

**Booking Failures:**
- Some services may not be available
- Handle partial bookings
- Offer alternatives
- Refund logic

**Date Changes:**
- User wants to modify dates after generation
- Re-check availability
- Update pricing
- Notify affected providers

**Multi-Currency:**
- Support international bookings
- Display prices in user's currency
- Handle exchange rates
- Payment in local currency

**Cancellations:**
- User cancels before trip
- Partial cancellations
- Refund policies per provider
- Cancel with expert involved

**Group Bookings:**
- Multiple travelers with different requirements
- Split payments
- Individual confirmations
- Group discounts

---

## 📊 Success Metrics

**User Engagement:**
- Modal completion rate
- Itinerary generation success rate
- Customization activity
- Expert handoff rate

**Conversion:**
- Generation → Checkout rate
- Checkout completion rate
- Average cart value
- Expert vs self-serve booking ratio

**Quality:**
- User satisfaction with AI itineraries
- Booking confirmation rate
- Service provider fulfillment rate
- Expert approval time

---

## 🎯 Next Steps

1. **Review this spec** - Leon approves or requests changes
2. **Prioritize features** - MVP vs nice-to-have
3. **Technical feasibility** - Check current backend capabilities
4. **Design mockups** - Visual designs for key screens
5. **Start Phase 1** - Build planning modal & AI generation

---

**Questions for Leon:**
1. Do we have AI/LLM API access ready? (OpenAI, Claude, etc.)
2. What payment processor do you prefer? (Stripe strongly recommended)
3. Are service provider APIs available or do we need manual bookings initially?
4. Should multi-city be MVP or phase 2?
5. Expert commission structure decided?
6. Any existing booking/trip tables in database we need to work with?

---

**Author:** RocketMan 🚀  
**Last Updated:** 2026-01-31