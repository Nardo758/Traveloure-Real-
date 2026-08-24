# 🚀 Traveloure Complete Implementation Plan

**Target:** ASAP MVP Launch  
**Scope:** Full booking platform with AI itinerary + flexible booking

---

## 📋 Phase 1: Core Infrastructure (Week 1)

### 1.1 Database Schema

**New Tables Needed:**

#### `trips` Table
```sql
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- Trip details
    destinations JSONB NOT NULL,  -- [{city, country, cityId, suggestedDays}]
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    experience_type VARCHAR(20) NOT NULL,  -- travel, wedding, corporate, event, retreat
    travelers INT NOT NULL DEFAULT 1,
    special_requests TEXT,
    
    -- AI-generated itinerary
    itinerary JSONB,  -- Full itinerary structure
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft',  -- draft, expert_review, confirmed, completed, cancelled
    
    -- Expert assignment
    expert_id UUID REFERENCES local_experts(id),
    expert_notes TEXT,
    expert_modified_at TIMESTAMP,
    
    -- Booking
    booking_reference VARCHAR(50) UNIQUE,
    
    -- Sharing
    is_public BOOLEAN DEFAULT FALSE,
    share_token VARCHAR(64) UNIQUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trips_user ON trips(user_id, status);
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX idx_trips_share ON trips(share_token);
```

#### `trip_items` Table
```sql
CREATE TABLE trip_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    
    -- Item details
    item_type VARCHAR(20) NOT NULL,  -- accommodation, activity, meal, transport
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Scheduling
    date DATE NOT NULL,
    time TIME,
    duration VARCHAR(50),  -- "2 hours", "3 nights"
    day_number INT,
    order_in_day INT DEFAULT 0,
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_price_estimated BOOLEAN DEFAULT TRUE,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Location
    location_name VARCHAR(255),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    address TEXT,
    
    -- Provider linkage
    provider_id UUID REFERENCES service_providers(id),
    booking_type VARCHAR(20),  -- instant, request, external, expert_assisted
    
    -- External booking
    external_url TEXT,  -- Affiliate link
    affiliate_partner VARCHAR(50),  -- booking_com, viator, etc.
    
    -- Booking status
    booking_status VARCHAR(20) DEFAULT 'not_booked',  -- not_booked, pending, confirmed, cancelled
    confirmation_code VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trip_items_trip ON trip_items(trip_id, date);
CREATE INDEX idx_trip_items_provider ON trip_items(provider_id, booking_status);
```

#### `bookings` Table
```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    trip_id UUID REFERENCES trips(id),
    trip_item_id UUID REFERENCES trip_items(id),
    
    -- Provider/Expert
    provider_id UUID REFERENCES service_providers(id),
    expert_id UUID REFERENCES local_experts(id),  -- If expert-assisted
    
    -- Booking details
    booking_type VARCHAR(20) NOT NULL,  -- instant, request, external, expert_assisted
    status VARCHAR(50) DEFAULT 'pending',  -- pending, pending_payment, confirmed, completed, cancelled, refunded
    
    -- Service details
    title VARCHAR(255) NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME,
    travelers INT NOT NULL,
    
    -- Pricing
    service_amount DECIMAL(10,2) NOT NULL,  -- Base service cost
    platform_fee DECIMAL(10,2) NOT NULL,  -- Platform commission
    expert_fee DECIMAL(10,2) DEFAULT 0,  -- Expert commission if applicable
    total_amount DECIMAL(10,2) NOT NULL,  -- Total user pays
    provider_payout DECIMAL(10,2),  -- What provider receives
    
    -- Payment method
    payment_method VARCHAR(20),  -- full, deposit, pay_later
    deposit_amount DECIMAL(10,2),  -- If deposit payment
    deposit_paid BOOLEAN DEFAULT FALSE,
    balance_amount DECIMAL(10,2),
    balance_paid BOOLEAN DEFAULT FALSE,
    balance_due_date DATE,
    
    -- Stripe integration
    stripe_payment_intent_id VARCHAR(255),
    stripe_deposit_intent_id VARCHAR(255),
    stripe_balance_intent_id VARCHAR(255),
    payment_status VARCHAR(50),  -- pending, succeeded, failed, refunded
    
    -- Confirmation
    confirmation_code VARCHAR(50) UNIQUE,
    confirmed_at TIMESTAMP,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20),  -- user, provider, admin
    refund_amount DECIMAL(10,2),
    refund_status VARCHAR(50),
    refunded_at TIMESTAMP,
    
    -- Metadata
    special_requests TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_user ON bookings(user_id, status);
CREATE INDEX idx_bookings_provider ON bookings(provider_id, status);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_payment ON bookings(stripe_payment_intent_id);
```

#### `booking_requests` Table
```sql
CREATE TABLE booking_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    trip_item_id UUID REFERENCES trip_items(id),
    provider_id UUID REFERENCES service_providers(id) NOT NULL,
    
    -- Request details
    status VARCHAR(50) DEFAULT 'pending_provider',  -- pending_provider, accepted, declined, counter_offered, expired
    requested_date DATE NOT NULL,
    requested_time TIME,
    travelers INT NOT NULL,
    special_requests TEXT,
    
    -- Provider response
    provider_response TEXT,
    responded_at TIMESTAMP,
    response_expires_at TIMESTAMP,  -- Time limit for provider to respond
    
    -- Counter offer
    counter_date DATE,
    counter_time TIME,
    counter_price DECIMAL(10,2),
    counter_message TEXT,
    
    -- Conversion
    booking_id UUID REFERENCES bookings(id),  -- If accepted and booked
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,  -- Auto-decline if no response
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_booking_requests_provider ON booking_requests(provider_id, status);
CREATE INDEX idx_booking_requests_user ON booking_requests(user_id, status);
```

#### `provider_availability` Table
```sql
CREATE TABLE provider_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES service_providers(id) NOT NULL,
    service_id UUID,  -- Specific service if applicable
    
    -- Availability type
    availability_type VARCHAR(20) NOT NULL,  -- calendar, toggle, inventory
    
    -- Calendar-based (specific dates blocked)
    blocked_dates JSONB DEFAULT '[]',  -- ["2026-03-15", "2026-03-16"]
    available_dates JSONB DEFAULT '[]',  -- If whitelist approach
    
    -- Toggle-based
    is_available BOOLEAN DEFAULT TRUE,
    
    -- Inventory-based (X slots per day)
    daily_capacity INT,  -- Max bookings per day
    current_bookings INT DEFAULT 0,
    
    -- Time slots (if time-specific)
    time_slots JSONB,  -- [{time: "09:00", available: true, booked: 0, capacity: 5}]
    
    -- Recurring rules (e.g., "unavailable every Monday")
    recurring_unavailable JSONB,  -- [{day: "monday"}, {dates: "2026-12-25"}]
    
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_provider_availability ON provider_availability(provider_id);
```

#### `provider_pricing` Table
```sql
CREATE TABLE provider_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES service_providers(id) NOT NULL,
    service_id UUID,  -- Specific service
    
    -- Pricing type
    pricing_type VARCHAR(20) NOT NULL,  -- fixed, dynamic, quote_based
    
    -- Fixed pricing
    base_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Dynamic pricing (by date/season)
    seasonal_pricing JSONB,  -- [{season: "peak", dates: [...], multiplier: 1.5}]
    date_overrides JSONB,  -- [{date: "2026-12-31", price: 500}]
    
    -- Quote-based
    requires_quote BOOLEAN DEFAULT FALSE,
    estimated_range_min DECIMAL(10,2),
    estimated_range_max DECIMAL(10,2),
    
    -- Per-person pricing
    per_person BOOLEAN DEFAULT FALSE,
    group_discounts JSONB,  -- [{min_people: 5, discount_percent: 10}]
    
    -- Deposit requirements
    requires_deposit BOOLEAN DEFAULT FALSE,
    deposit_type VARCHAR(20),  -- percentage, fixed
    deposit_amount DECIMAL(10,2),
    deposit_percentage INT,  -- If percentage-based
    
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_provider_pricing ON provider_pricing(provider_id);
```

#### `platform_fees` Table
```sql
CREATE TABLE platform_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Fee configuration
    fee_type VARCHAR(20) NOT NULL,  -- category, provider, global
    
    -- Category-specific
    category VARCHAR(50),  -- accommodation, activity, meal, transport
    
    -- Provider-specific (override)
    provider_id UUID REFERENCES service_providers(id),
    
    -- Fee structure
    fee_type_method VARCHAR(20) DEFAULT 'percentage',  -- percentage, fixed
    fee_percentage DECIMAL(5,2),  -- e.g., 15.00 for 15%
    fee_fixed_amount DECIMAL(10,2),  -- Or fixed amount
    
    -- Minimum/maximum
    min_fee DECIMAL(10,2),
    max_fee DECIMAL(10,2),
    
    -- Active status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Priority (higher = takes precedence)
    priority INT DEFAULT 0,  -- Provider-specific > Category > Global
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_platform_fees ON platform_fees(fee_type, category, provider_id);
```

#### `expert_handoffs` Table
```sql
CREATE TABLE expert_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id) NOT NULL,
    expert_id UUID REFERENCES local_experts(id) NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, completed, declined
    
    -- Itinerary versions
    original_itinerary JSONB NOT NULL,
    modified_itinerary JSONB,
    
    -- Communication
    expert_notes TEXT,
    user_feedback TEXT,
    
    -- Booking assistance
    can_book_on_behalf BOOLEAN DEFAULT FALSE,  -- For personal assistant experts
    bookings_made JSONB DEFAULT '[]',  -- Track bookings expert made
    
    -- Fees
    expert_fee DECIMAL(10,2),
    fee_paid BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    completed_at TIMESTAMP,
    user_approved_at TIMESTAMP
);

CREATE INDEX idx_expert_handoffs ON expert_handoffs(expert_id, status);
CREATE INDEX idx_expert_handoffs_trip ON expert_handoffs(trip_id);
```

#### Update `service_providers` Table
```sql
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS
    stripe_account_id VARCHAR(255),
    stripe_account_status VARCHAR(50),  -- pending, active, restricted
    can_receive_payments BOOLEAN DEFAULT FALSE,
    
    -- Availability settings
    availability_type VARCHAR(20) DEFAULT 'toggle',  -- calendar, toggle, inventory
    pricing_type VARCHAR(20) DEFAULT 'fixed',  -- fixed, dynamic, quote_based
    
    -- Booking preferences
    instant_booking_enabled BOOLEAN DEFAULT TRUE,
    request_booking_enabled BOOLEAN DEFAULT TRUE,
    requires_deposit BOOLEAN DEFAULT FALSE,
    deposit_percentage INT DEFAULT 30,
    
    -- Earnings
    total_earnings DECIMAL(10,2) DEFAULT 0,
    pending_payout DECIMAL(10,2) DEFAULT 0,
    total_bookings INT DEFAULT 0;
```

#### Update `local_experts` Table
```sql
ALTER TABLE local_experts ADD COLUMN IF NOT EXISTS
    can_book_on_behalf BOOLEAN DEFAULT FALSE,  -- Personal assistant privilege
    is_personal_assistant BOOLEAN DEFAULT FALSE,
    
    -- Fees
    booking_fee_type VARCHAR(20) DEFAULT 'percentage',  -- percentage, fixed, hourly
    booking_fee_percentage DECIMAL(5,2) DEFAULT 10.00,
    booking_fee_fixed DECIMAL(10,2),
    booking_fee_hourly DECIMAL(10,2),
    
    -- Earnings
    total_earnings DECIMAL(10,2) DEFAULT 0,
    total_handoffs INT DEFAULT 0,
    total_bookings_assisted INT DEFAULT 0;
```

---

## 1.2 Backend Services

### Service: `BookingBotService`

**Purpose:** Central booking orchestrator that handles all booking logic

**Location:** `/authentication/services/booking_bot.py`

```python
class BookingBotService:
    """
    Central booking orchestrator - handles all booking types
    Connects users, payments, providers, and experts
    """
    
    @staticmethod
    def process_cart(user, cart_items, payment_method='full'):
        """
        Process entire cart with mixed booking types
        
        Returns:
            {
                'instant_bookings': [...],  # Confirmed immediately
                'pending_requests': [...],  # Awaiting provider approval
                'external_links': [...],     # For user to book elsewhere
                'payment_required': Decimal, # Amount to charge now
                'deposit_required': Decimal, # If deposit payment
            }
        """
        pass
    
    @staticmethod
    def book_instant(trip_item, user, payment_info):
        """Book items with instant confirmation"""
        pass
    
    @staticmethod
    def submit_request(trip_item, user):
        """Submit booking request to provider"""
        pass
    
    @staticmethod
    def expert_book_on_behalf(expert, trip_item, user):
        """
        Personal assistant expert books for user
        Uses user's saved payment method
        """
        pass
    
    @staticmethod
    def handle_payment(booking, payment_method, deposit_only=False):
        """
        Process payment via Stripe
        Handles full payment or deposit
        """
        pass
    
    @staticmethod
    def calculate_fees(booking):
        """
        Calculate platform fees based on:
        - Category-specific fees
        - Provider-specific overrides
        - Expert fees if applicable
        """
        pass
```

---

### Service: `StripePaymentService`

**Location:** `/authentication/services/stripe_service.py`

```python
class StripePaymentService:
    """
    Handles all Stripe operations
    Note: Replit will connect actual Stripe API keys
    """
    
    @staticmethod
    def create_payment_intent(booking, deposit_only=False):
        """Create payment intent for booking"""
        pass
    
    @staticmethod
    def charge_deposit(booking):
        """Charge deposit amount"""
        pass
    
    @staticmethod
    def charge_balance(booking):
        """Charge remaining balance"""
        pass
    
    @staticmethod
    def create_provider_transfer(booking):
        """Transfer funds to provider (Stripe Connect)"""
        pass
    
    @staticmethod
    def process_refund(booking, refund_amount):
        """Process refund for cancellation"""
        pass
    
    @staticmethod
    def onboard_provider(provider):
        """Create Stripe Connect account for provider"""
        pass
```

---

### Service: `AvailabilityService`

**Location:** `/authentication/services/availability_service.py`

```python
class AvailabilityService:
    """
    Check and manage provider availability
    Supports all 3 availability types
    """
    
    @staticmethod
    def check_availability(provider, date, time=None, quantity=1):
        """
        Check if provider is available
        Handles: calendar, toggle, inventory types
        """
        pass
    
    @staticmethod
    def block_date(provider, date):
        """Block a date (calendar type)"""
        pass
    
    @staticmethod
    def decrease_inventory(provider, date, quantity=1):
        """Decrease available slots (inventory type)"""
        pass
    
    @staticmethod
    def get_available_dates(provider, start_date, end_date):
        """Get list of available dates in range"""
        pass
```

---

### Service: `PricingService`

**Location:** `/authentication/services/pricing_service.py`

```python
class PricingService:
    """
    Calculate pricing for bookings
    Supports all 3 pricing types
    """
    
    @staticmethod
    def get_price(provider, service_id, date, travelers=1):
        """
        Get price for service on specific date
        Handles: fixed, dynamic, quote-based
        """
        pass
    
    @staticmethod
    def apply_seasonal_pricing(base_price, date):
        """Apply seasonal multipliers"""
        pass
    
    @staticmethod
    def apply_group_discount(price, travelers):
        """Apply group discounts"""
        pass
    
    @staticmethod
    def calculate_deposit(price, provider):
        """Calculate required deposit amount"""
        pass
```

---

## 1.3 API Endpoints

### AI Itinerary Generation
```
POST /api/ai/generate-itinerary/
POST /api/ai/regenerate-day/
PATCH /api/ai/customize-item/
```

### Trips
```
GET /api/trips/user/{userId}/
GET /api/trips/{tripId}/
PATCH /api/trips/{tripId}/
DELETE /api/trips/{tripId}/
POST /api/trips/{tripId}/share/
```

### Bookings
```
POST /api/bookings/process-cart/          # Main booking endpoint
POST /api/bookings/create-payment-intent/
POST /api/bookings/confirm/
GET /api/bookings/user/{userId}/
GET /api/bookings/{bookingId}/
PATCH /api/bookings/{bookingId}/cancel/
POST /api/bookings/{bookingId}/refund/
POST /api/bookings/charge-balance/        # Charge remaining balance
```

### Booking Requests
```
POST /api/booking-requests/submit/
GET /api/booking-requests/provider/{providerId}/
PATCH /api/booking-requests/{requestId}/respond/
POST /api/booking-requests/{requestId}/accept/
POST /api/booking-requests/{requestId}/decline/
POST /api/booking-requests/{requestId}/counter-offer/
```

### Provider Management
```
GET /api/providers/{providerId}/availability/
PATCH /api/providers/{providerId}/availability/
GET /api/providers/{providerId}/pricing/
PATCH /api/providers/{providerId}/pricing/
POST /api/providers/{providerId}/stripe-onboard/
GET /api/providers/{providerId}/bookings/
GET /api/providers/{providerId}/earnings/
```

### Expert Handoffs
```
POST /api/expert-handoffs/create/
GET /api/expert-handoffs/expert/{expertId}/
PATCH /api/expert-handoffs/{handoffId}/accept/
PATCH /api/expert-handoffs/{handoffId}/complete/
POST /api/expert-handoffs/{handoffId}/book-on-behalf/  # Personal assistants only
```

### Platform Configuration
```
GET /api/platform/fees/
POST /api/platform/fees/
PATCH /api/platform/fees/{feeId}/
GET /api/platform/fees/calculate/
```

---

## 📦 Phase 2: Frontend Components (Week 1-2)

### Core Components

1. **`PlanningModal.jsx`** ✅ (Already created)
   - Multi-city support
   - Days-per-city option
   - Date range picker
   - Experience type selector

2. **`CartReview.jsx`**
   - Show all items grouped by booking type
   - Instant / Request / External separation
   - Price breakdown

3. **`PaymentForm.jsx`**
   - Stripe Elements integration
   - Deposit vs full payment option
   - Save payment method

4. **`BookingConfirmation.jsx`**
   - Success state
   - Confirmation codes
   - Pending request status
   - External booking links

5. **`ProviderDashboard.jsx`**
   - Manage availability (calendar/toggle/inventory)
   - Manage pricing (fixed/dynamic/quote)
   - View booking requests
   - Accept/decline requests

6. **`ExpertHandoffModal.jsx`**
   - Show matched experts
   - Request expert assistance
   - Chat interface
   - Approve expert modifications

---

## ⚙️ Phase 3: Booking Bot Logic (Week 2)

### Core Flow

```python
def process_booking(user, cart_items):
    results = {
        'instant': [],
        'requests': [],
        'external': [],
        'errors': []
    }
    
    for item in cart_items:
        if item.booking_type == 'instant':
            # Check availability
            if AvailabilityService.check_availability(item.provider, item.date):
                # Calculate price
                price = PricingService.get_price(
                    provider=item.provider,
                    date=item.date,
                    travelers=item.travelers
                )
                
                # Calculate fees
                fees = calculate_platform_fees(item, price)
                
                # Create booking
                booking = create_instant_booking(item, price, fees)
                results['instant'].append(booking)
            else:
                results['errors'].append(f"{item.title} no longer available")
        
        elif item.booking_type == 'request':
            # Submit request
            request = submit_booking_request(item)
            results['requests'].append(request)
        
        elif item.booking_type == 'external':
            # Generate affiliate link
            link = generate_affiliate_link(item)
            results['external'].append(link)
    
    # Process payment for instant bookings
    if results['instant']:
        payment_amount = calculate_total_with_fees(results['instant'])
        payment_intent = StripePaymentService.create_payment_intent(
            amount=payment_amount,
            bookings=results['instant']
        )
        results['payment_intent'] = payment_intent
    
    return results
```

---

## 🔗 Phase 4: Affiliate Integration (Week 2)

### Affiliate Partners

**Hotels:**
- Booking.com Affiliate Program
- Expedia Partner Solutions

**Activities:**
- GetYourGuide Affiliate
- Viator Affiliate

**Restaurants:**
- OpenTable Affiliate

### Implementation

```python
class AffiliateService:
    PARTNERS = {
        'booking_com': {
            'base_url': 'https://www.booking.com/hotel/',
            'affiliate_id': 'YOUR_AFFILIATE_ID',
            'params': 'aid={affiliate_id}&checkin={checkin}&checkout={checkout}'
        },
        'viator': {
            'base_url': 'https://www.viator.com/tours/',
            'affiliate_id': 'YOUR_AFFILIATE_ID'
        }
    }
    
    @staticmethod
    def generate_link(item, partner):
        """Generate affiliate tracking link"""
        config = AffiliateService.PARTNERS.get(partner)
        # Build URL with tracking parameters
        return f"{config['base_url']}...&aid={config['affiliate_id']}"
```

---

## 🧪 Phase 5: Testing & Launch (Week 3)

### Test Scenarios

1. **Instant Booking Flow**
   - Add instant-book items to cart
   - Pay full amount
   - Verify confirmation
   - Check provider notification

2. **Deposit Payment Flow**
   - Add items requiring deposit
   - Pay deposit
   - Verify balance reminder
   - Charge balance later

3. **Request Booking Flow**
   - Submit request
   - Provider accepts
   - User gets notified
   - User pays and confirms

4. **Mixed Cart**
   - Cart with instant + request + external
   - Process correctly
   - Verify partial payments

5. **Expert Handoff**
   - Send trip to expert
   - Expert modifies
   - User approves
   - Book final itinerary

6. **Personal Assistant Booking**
   - Expert with PA privileges
   - Books on user's behalf
   - Uses user's payment method
   - User gets confirmation

---

## 📋 TODO List for Database (Give to Replit Agent)

### Task 1: Create Core Trip Tables
```sql
-- Copy entire SQL schema from section 1.1
-- Tables: trips, trip_items, bookings, booking_requests
```

### Task 2: Create Provider Management Tables
```sql
-- provider_availability
-- provider_pricing
-- platform_fees
```

### Task 3: Update Existing Tables
```sql
-- ALTER TABLE service_providers (add Stripe & booking fields)
-- ALTER TABLE local_experts (add PA & fee fields)
```

### Task 4: Create Expert Handoff Table
```sql
-- expert_handoffs
```

### Task 5: Create Indexes
```sql
-- All CREATE INDEX statements from section 1.1
```

### Task 6: Seed Default Platform Fees
```sql
INSERT INTO platform_fees (fee_type, category, fee_percentage, is_active, priority)
VALUES
    ('global', NULL, 15.00, true, 0),
    ('category', 'accommodation', 7.50, true, 10),
    ('category', 'activity', 15.00, true, 10),
    ('category', 'meal', 5.00, true, 10),
    ('category', 'transport', 10.00, true, 10);
```

---

## 🎯 Implementation Order (ASAP)

### Week 1 - Days 1-3: Database & Backend Core
- [ ] Run all SQL migrations (give to Replit Agent)
- [ ] Create BookingBotService skeleton
- [ ] Create StripePaymentService (structure, Replit connects API)
- [ ] Create AvailabilityService
- [ ] Create PricingService

### Week 1 - Days 4-7: API Endpoints
- [ ] AI itinerary generation endpoint (with Claude)
- [ ] Booking process-cart endpoint
- [ ] Payment intent creation
- [ ] Booking confirmation
- [ ] Provider availability/pricing management
- [ ] Expert handoff endpoints

### Week 2 - Days 1-4: Frontend Components
- [ ] Deploy PlanningModal (already created)
- [ ] Build CartReview component
- [ ] Build PaymentForm with Stripe Elements
- [ ] Build BookingConfirmation page
- [ ] Build ProviderDashboard
- [ ] Build ExpertHandoffModal

### Week 2 - Days 5-7: Integration & Testing
- [ ] End-to-end instant booking test
- [ ] Deposit payment test
- [ ] Request booking test
- [ ] Expert handoff test
- [ ] Affiliate link generation
- [ ] Fix bugs

### Week 3: Polish & Launch
- [ ] Email/SMS notifications
- [ ] Calendar integration
- [ ] Error handling
- [ ] Loading states
- [ ] Mobile optimization
- [ ] Production deploy

---

## 🔑 Key Files to Create/Modify

### Backend (Django)
```
/authentication/
  ├── models.py                        # Add new models (or separate file)
  ├── services/
  │   ├── booking_bot.py              # NEW
  │   ├── stripe_service.py           # NEW
  │   ├── availability_service.py     # NEW
  │   ├── pricing_service.py          # NEW
  │   └── affiliate_service.py        # NEW
  ├── views_api/
  │   ├── itinerary_generator.py      # NEW (already provided)
  │   ├── bookings_api.py             # NEW
  │   ├── booking_requests_api.py     # NEW
  │   ├── provider_management_api.py  # NEW
  │   └── expert_handoffs_api.py      # NEW
  └── urls.py                          # Add new routes

/ai/
  └── urls.py                          # AI-related routes
```

### Frontend (Next.js)
```
/src/app/
  ├── components/
  │   ├── PlanningModal.jsx           # ✅ DONE
  │   ├── CartReview.jsx              # NEW
  │   ├── PaymentForm.jsx             # NEW
  │   ├── BookingConfirmation.jsx     # NEW
  │   ├── ProviderDashboard.jsx       # NEW
  │   └── ExpertHandoffModal.jsx      # NEW
  ├── checkout/
  │   └── page.jsx                     # NEW - Checkout flow
  └── bookings/
      └── [bookingId]/
          └── page.jsx                 # NEW - Booking details
```

---

## 💰 Platform Fee Configuration (Example)

### Default Fees by Category
- **Accommodations:** 7.5%
- **Activities:** 15%
- **Meals:** 5%
- **Transport:** 10%
- **Global default:** 15%

### Fee Priority System
1. **Provider-specific** (highest priority)
2. **Category-specific**
3. **Global default** (lowest priority)

### Admin Interface Needed
- View/edit all fee configurations
- Set provider overrides
- View fee revenue reports

---

## 🚨 Critical Security Considerations

### Payment Security
- ✅ Replit handles Stripe API keys (secure)
- ✅ Never store full card numbers (Stripe Elements)
- ✅ Use payment intents (not direct charges)
- ✅ Webhook signature verification

### Expert Access Control
- ❌ Regular experts CANNOT access user payment methods
- ✅ Only "Personal Assistant" experts can book on behalf
- ✅ Require explicit user permission
- ✅ Log all PA bookings for audit

### Provider Payouts
- ✅ Use Stripe Connect (automatic splits)
- ✅ Platform fee deducted before provider payout
- ✅ Escrow period (hold funds until service complete)

---

## 📊 Success Metrics to Track

### User Metrics
- Itinerary generation completion rate
- Cart-to-booking conversion rate
- Average cart value
- Booking confirmation rate

### Provider Metrics
- Instant booking acceptance rate
- Request approval rate
- Average response time
- Earnings per provider

### Expert Metrics
- Handoff acceptance rate
- Itinerary modification satisfaction
- Expert-assisted booking conversion
- Repeat usage rate

### Platform Metrics
- Total GMV (Gross Merchandise Value)
- Platform fee revenue
- Affiliate commission revenue
- Average transaction value

---

## 🎯 Next Immediate Steps

1. **Give Replit Agent:**
   - All SQL schema from section 1.1
   - Instructions to create tables and indexes

2. **You build (or delegate):**
   - Backend service classes (skeleton structure)
   - API endpoint routes

3. **I'll build:**
   - Frontend components
   - Complete booking flow UI
   - Provider dashboard

4. **Replit connects:**
   - Stripe API keys to payment service
   - Claude AI to itinerary generation
   - Email/SMS services

**Ready to start? Begin with database setup!** 🚀