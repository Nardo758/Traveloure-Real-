# Traveloure Booking System - Complete Design

**Date:** 2026-01-31  
**Purpose:** Enable efficient, scalable booking for all trip items

---

## 🎯 Booking Types

### 1. Platform Bookings (Your Service Providers)
**Service providers on Traveloure platform**

**Flow:**
```
User selects item → Check availability → Book → Payment → Confirmation → Provider notification
```

**Item Types:**
- Activities/Tours (guides, experiences)
- Accommodations (if you have property partners)
- Transportation (local drivers, transfers)
- Meals (restaurant reservations)

**Characteristics:**
- ✅ Real-time availability
- ✅ Instant or request-based confirmation
- ✅ Direct payment through Stripe
- ✅ Commission to Traveloure
- ✅ In-platform messaging

---

### 2. External/Affiliate Bookings
**Link to 3rd party platforms**

**Providers:**
- Hotels: Booking.com, Expedia
- Activities: GetYourGuide, Viator
- Flights: Skyscanner, Google Flights
- Restaurants: OpenTable, Resy

**Flow:**
```
User clicks item → Redirect to partner site → User books externally → Traveloure tracks via affiliate
```

**Characteristics:**
- ✅ No inventory management needed
- ✅ Wider selection
- ✅ Affiliate commission (5-15%)
- ⚠️ No direct booking control
- ⚠️ External customer service

---

### 3. Expert-Assisted Bookings
**Expert handles booking on user's behalf**

**Flow:**
```
User requests expert help → Expert books manually → Expert uploads confirmation → User pays
```

**Use Cases:**
- Complex multi-service packages
- VIP experiences requiring connections
- Language barrier situations
- Custom requests

**Characteristics:**
- ✅ Personalized service
- ✅ Expert handles issues
- ✅ Higher conversion for complex trips
- ⚠️ More manual work
- ⚠️ Higher cost (expert fee)

---

## 💳 Recommended Booking Flow (Hybrid Approach)

### Phase 1: Cart & Review

**User builds cart from itinerary:**

```
┌─────────────────────────────────────┐
│  Your Cart                          │
│                                     │
│  ✓ Instant Book (3 items)  $850    │
│    • Hotel (4 nights)               │
│    • Walking Tour                   │
│    • Airport Transfer               │
│                                     │
│  ⏱ Request to Book (2 items) $340  │
│    • Private Cooking Class          │
│    • Sunset Boat Tour               │
│                                     │
│  🔗 External (5 items)      $480    │
│    • Restaurant reservations (3)    │
│    • Museum tickets (2)             │
│                                     │
│  👨‍🏫 Expert Package (optional) $200   │
│                                     │
│  ──────────────────────────────     │
│  Subtotal              $1,670       │
│  Platform Fee (5%)        $84       │
│  Total                 $1,754       │
│                                     │
│  [Book Instantly: $850] [Continue] │
└─────────────────────────────────────┘
```

**Logic:**
1. **Instant Book items** - Book immediately, charge now
2. **Request items** - Submit requests, charge when confirmed
3. **External items** - Provide links, user books separately
4. **Expert package** - Expert handles all bookings

---

### Phase 2: Booking Execution

#### A. Instant Book Items

```python
# Backend logic
def process_instant_booking(cart_items, user, payment_method):
    """
    Process items that can be booked immediately
    """
    bookings = []
    total = 0
    
    for item in cart_items:
        if item.booking_type == 'instant':
            # Check real-time availability
            available = check_availability(
                provider_id=item.provider_id,
                date=item.date,
                time=item.time,
                quantity=item.travelers
            )
            
            if available:
                # Create booking
                booking = Booking.objects.create(
                    user=user,
                    trip_item=item,
                    status='pending_payment',
                    amount=item.price,
                )
                bookings.append(booking)
                total += item.price
            else:
                # Item no longer available
                return {
                    'success': False,
                    'error': f'{item.title} is no longer available'
                }
    
    # Charge payment
    platform_fee = total * 0.05
    stripe_amount = int((total + platform_fee) * 100)  # Convert to cents
    
    payment_intent = stripe.PaymentIntent.create(
        amount=stripe_amount,
        currency='usd',
        payment_method=payment_method,
        customer=user.stripe_customer_id,
        confirm=True,
        metadata={
            'user_id': user.id,
            'trip_id': bookings[0].trip_item.trip.id,
            'booking_ids': [str(b.id) for b in bookings]
        }
    )
    
    if payment_intent.status == 'succeeded':
        # Confirm all bookings
        for booking in bookings:
            booking.status = 'confirmed'
            booking.confirmation_code = generate_confirmation_code()
            booking.payment_intent_id = payment_intent.id
            booking.save()
            
            # Notify provider
            notify_provider_new_booking(booking)
            
            # Update provider's availability
            update_provider_availability(booking)
        
        return {
            'success': True,
            'bookings': bookings,
            'payment_intent': payment_intent.id
        }
    else:
        # Payment failed
        for booking in bookings:
            booking.status = 'payment_failed'
            booking.save()
        
        return {
            'success': False,
            'error': 'Payment failed'
        }
```

**Result:**
- ✅ Immediate confirmation
- ✅ Provider notified
- ✅ Calendar blocked
- ✅ Confirmation email sent

---

#### B. Request to Book Items

```python
def submit_booking_requests(cart_items, user):
    """
    Submit booking requests that need provider approval
    """
    requests = []
    
    for item in cart_items:
        if item.booking_type == 'request':
            # Create pending request
            booking_request = BookingRequest.objects.create(
                user=user,
                trip_item=item,
                provider=item.provider,
                status='pending_provider',
                requested_date=item.date,
                requested_time=item.time,
                travelers=item.travelers,
                special_requests=item.special_requests,
                expires_at=timezone.now() + timedelta(hours=48)
            )
            
            # Notify provider
            send_booking_request_email(booking_request)
            send_booking_request_notification(booking_request)
            
            requests.append(booking_request)
    
    return {
        'success': True,
        'requests': requests,
        'message': 'Booking requests sent to providers'
    }
```

**Provider Response Options:**
1. **Accept** - Confirm availability, set price, user is charged
2. **Decline** - Not available, user notified
3. **Counter-offer** - Suggest alternate time/date/price
4. **Expire** - No response in 48h, auto-decline

**User sees:**
```
⏱ Pending Approval (2 items)
  • Private Cooking Class - Awaiting response
  • Sunset Boat Tour - Awaiting response
  
  You'll be notified when providers respond.
  Your card will only be charged if they approve.
```

---

### Phase 3: Payment Handling

#### Stripe Payment Flow

```javascript
// Frontend - Checkout component
async function handleCheckout() {
  // 1. Separate instant vs request items
  const instantItems = cartItems.filter(i => i.bookingType === 'instant');
  const requestItems = cartItems.filter(i => i.bookingType === 'request');
  
  // 2. Create payment intent for instant items
  if (instantItems.length > 0) {
    const response = await apiPost('/api/bookings/create-payment-intent/', {
      items: instantItems,
      tripId: currentTrip.id
    });
    
    const { clientSecret, bookingIds } = response;
    
    // 3. Confirm payment with Stripe
    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: user.name,
            email: user.email
          }
        }
      }
    );
    
    if (error) {
      showError(error.message);
    } else if (paymentIntent.status === 'succeeded') {
      // 4. Confirm bookings on backend
      await apiPost('/api/bookings/confirm/', {
        paymentIntentId: paymentIntent.id,
        bookingIds: bookingIds
      });
      
      showSuccess('Bookings confirmed!');
    }
  }
  
  // 5. Submit request items (no payment yet)
  if (requestItems.length > 0) {
    await apiPost('/api/bookings/submit-requests/', {
      items: requestItems,
      tripId: currentTrip.id
    });
    
    showInfo('Booking requests sent to providers');
  }
  
  // 6. Redirect to confirmation page
  router.push(`/bookings/confirmation?tripId=${currentTrip.id}`);
}
```

#### Payment States

**Instant Book:**
```
Cart → Payment → Confirmed → Email
```

**Request to Book:**
```
Cart → Request Sent → Provider Approves → Payment → Confirmed → Email
```

**Split Payment:**
- User can pay deposit (e.g., 30%) to secure bookings
- Balance charged closer to travel date
- Configurable per provider

---

## 📦 Database Schema

### Bookings Table

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    trip_id UUID REFERENCES trips(id),
    trip_item_id UUID REFERENCES trip_items(id),
    provider_id UUID REFERENCES service_providers(id),
    
    -- Status
    status VARCHAR(50), -- pending_payment, confirmed, completed, cancelled, refunded
    booking_type VARCHAR(50), -- instant, request, external, expert_assisted
    
    -- Details
    title VARCHAR(255),
    booking_date DATE,
    booking_time TIME,
    travelers INT,
    
    -- Pricing
    amount DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    provider_payout DECIMAL(10,2),
    
    -- Payment
    payment_intent_id VARCHAR(255), -- Stripe Payment Intent
    payment_status VARCHAR(50), -- pending, succeeded, failed, refunded
    payment_method VARCHAR(50),
    paid_at TIMESTAMP,
    
    -- Confirmation
    confirmation_code VARCHAR(50) UNIQUE,
    confirmed_at TIMESTAMP,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    refund_amount DECIMAL(10,2),
    refunded_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB,
    special_requests TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_user ON bookings(user_id, status);
CREATE INDEX idx_bookings_provider ON bookings(provider_id, status);
CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
```

### Booking Requests Table

```sql
CREATE TABLE booking_requests (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    trip_item_id UUID REFERENCES trip_items(id),
    provider_id UUID REFERENCES service_providers(id),
    
    -- Request details
    status VARCHAR(50), -- pending_provider, accepted, declined, counter_offered, expired
    requested_date DATE,
    requested_time TIME,
    travelers INT,
    special_requests TEXT,
    
    -- Provider response
    provider_response TEXT,
    responded_at TIMESTAMP,
    
    -- Counter offer (if applicable)
    counter_date DATE,
    counter_time TIME,
    counter_price DECIMAL(10,2),
    
    -- Expiration
    expires_at TIMESTAMP,
    
    -- Converted to booking
    booking_id UUID REFERENCES bookings(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔔 Notification System

### User Notifications

**Instant Book:**
- ✅ Booking confirmed email (immediate)
- 📱 SMS confirmation with details
- 📅 Calendar invite (.ics file)
- ⏰ Reminder 24h before (email + SMS)

**Request to Book:**
- 📩 Request submitted confirmation
- ✅ Provider approved (email + SMS)
- ❌ Provider declined (email with alternatives)
- ⏱ Provider counter-offer (email with accept/decline)

### Provider Notifications

**New Booking:**
- 📧 Email with booking details
- 📱 In-app notification
- 📊 Dashboard update
- 💰 Earnings updated

**New Request:**
- 📧 Email with request details
- 📱 Push notification
- ⏰ Reminder after 24h if no response
- ⚠️ Auto-decline warning at 46h

---

## 💰 Commission & Payout Structure

### Platform Revenue

**Service Type** | **User Pays** | **Provider Gets** | **Platform Fee**
---|---|---|---
Activities | $100 | $85 | $15 (15%)
Accommodations | $200 | $185 | $15 (7.5%)
Meals | $50 | $47.50 | $2.50 (5%)
Transport | $80 | $72 | $8 (10%)
Expert Service | $200 | $170 | $30 (15%)

### Payout Schedule

**Option 1: Instant Payout (Stripe Connect)**
- Provider gets paid within 2-7 days
- Platform holds payment until service completion
- Automatic dispute resolution

**Option 2: After Service Completion**
- Provider paid after service is delivered
- User has 24h to report issues
- Safer for platform, slower for providers

**Recommended:** Hybrid
- New providers: After service completion
- Verified providers (good reviews): Instant payout

---

## 🔄 Cancellation & Refund Policy

### User Cancellations

**Timeline** | **Refund**
---|---
>14 days before | 100% refund
7-14 days before | 50% refund
<7 days before | No refund (provider discretion)
No-show | No refund

### Provider Cancellations

- Provider cancels → User gets 100% refund + $50 credit
- Provider no-show → User gets 100% refund + $100 credit
- Platform helps rebook alternative

### Refund Processing

```python
def process_refund(booking, reason, refund_percentage=100):
    """
    Process booking refund
    """
    # Calculate refund amount
    refund_amount = (booking.amount * refund_percentage) / 100
    
    # Create Stripe refund
    refund = stripe.Refund.create(
        payment_intent=booking.payment_intent_id,
        amount=int(refund_amount * 100),  # cents
        reason=reason,
        metadata={
            'booking_id': str(booking.id),
            'refund_percentage': refund_percentage
        }
    )
    
    # Update booking
    booking.status = 'refunded'
    booking.refund_amount = refund_amount
    booking.refunded_at = timezone.now()
    booking.cancellation_reason = reason
    booking.save()
    
    # Notify user
    send_refund_confirmation_email(booking, refund_amount)
    
    # Update provider earnings
    provider_payout_adjustment(booking.provider, -refund_amount)
    
    return refund
```

---

## 📱 User Experience Flow

### Step-by-Step

**1. Review Cart**
```
[ ] Instant Book Items (3) - $850
[ ] Request Items (2) - $340
[ ] External Links (5) - Book separately
```

**2. Payment Method**
```
💳 Credit/Debit Card
   **** **** **** 1234
   
   [Change card]
   
   □ Save for future bookings
```

**3. Traveler Details**
```
Primary Traveler: Leon D (from account)
Additional Travelers: [+ Add]

Special Requirements:
□ Dietary restrictions
□ Accessibility needs
□ Other: _______
```

**4. Review & Confirm**
```
Total: $1,754
  
✓ I agree to Terms & Conditions
✓ I understand the cancellation policy

[Confirm & Pay $850] (Instant items only)
[Submit Requests] (for pending items)
```

**5. Confirmation**
```
🎉 Bookings Confirmed!

✅ Instant Bookings (3 items)
   Confirmation #: TRV-2026-001234
   
⏱ Pending Requests (2 items)
   We'll notify you when providers respond
   
📧 Confirmation sent to leon@example.com
📱 Added to your calendar

[View Trip Details] [Message Expert]
```

---

## 🚀 Implementation Priority

### Phase 1: MVP (Week 1-2)
- [ ] Instant book for platform providers
- [ ] Stripe payment integration
- [ ] Basic confirmation emails
- [ ] Simple booking status tracking

### Phase 2: Enhanced (Week 3-4)
- [ ] Request to book flow
- [ ] Provider dashboard for managing requests
- [ ] Calendar syncing
- [ ] SMS notifications

### Phase 3: Complete (Week 5-6)
- [ ] External/affiliate link tracking
- [ ] Expert-assisted booking tools
- [ ] Cancellation/refund system
- [ ] Advanced analytics

---

## 🔧 Technical Implementation

### API Endpoints

```
POST   /api/bookings/create-payment-intent/
POST   /api/bookings/confirm/
POST   /api/bookings/submit-requests/
GET    /api/bookings/user/{userId}/
GET    /api/bookings/{bookingId}/
PATCH  /api/bookings/{bookingId}/cancel/
POST   /api/bookings/{bookingId}/refund/

# Provider endpoints
GET    /api/provider/bookings/
PATCH  /api/provider/booking-requests/{requestId}/respond/
```

---

**Questions for Leon:**

1. **Priority booking type?** Start with instant book only, or include requests?
2. **Payment timing?** Full payment upfront, or deposit + balance?
3. **Provider onboarding?** How do providers set availability/pricing?
4. **External links?** Include affiliate bookings from day 1?
5. **Expert role?** Should experts be able to book on user's behalf directly?

Let me know and I'll build the specific components you need! 🚀