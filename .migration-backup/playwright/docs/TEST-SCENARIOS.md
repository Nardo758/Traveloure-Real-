# Traveloure Test Scenarios & Test Case Matrix

Detailed breakdown of all test scenarios organized by phase.

---

## Phase 1: Expert Profile Setup & Content Creation

**Objective:** Verify each expert can set up profile and create services

**Total Scenarios:** 21 tests (one per expert)
**Expected Runtime:** 30-40 minutes
**Dependencies:** None - tests run independently

### Test Matrix

| Market | Expert | Email | Test Name | Coverage |
|---|---|---|---|---|
| Kyoto | Yuki Tanaka | kyoto-temple@traveloure.test | `[Phase 1] Expert Setup - Yuki Tanaka (kyoto)` | Temple guide profile, services |
| Kyoto | Haruki Sato | kyoto-arts@traveloure.test | `[Phase 1] Expert Setup - Haruki Sato (kyoto)` | Arts specialist profile, services |
| Kyoto | Aiko Yamamoto | kyoto-food@traveloure.test | `[Phase 1] Expert Setup - Aiko Yamamoto (kyoto)` | Food expert profile, services |
| Kyoto | Kenji Nakamura | kyoto-neighborhood@traveloure.test | `[Phase 1] Expert Setup - Kenji Nakamura (kyoto)` | Neighborhood guide profile, services |
| Kyoto | Mei Kobayashi | kyoto-etiquette@traveloure.test | `[Phase 1] Expert Setup - Mei Kobayashi (kyoto)` | Etiquette specialist profile, services |
| Edinburgh | Alistair MacGregor | edinburgh-culture@traveloure.test | `[Phase 1] Expert Setup - Alistair MacGregor (edinburgh)` | Culture expert profile, services |
| Edinburgh | Fiona Campbell | edinburgh-whisky@traveloure.test | `[Phase 1] Expert Setup - Fiona Campbell (edinburgh)` | Whisky expert profile, services |
| Edinburgh | Hamish Stewart | edinburgh-festival@traveloure.test | `[Phase 1] Expert Setup - Hamish Stewart (edinburgh)` | Festival expert profile, services |
| Edinburgh | Morag Fraser | edinburgh-highlands@traveloure.test | `[Phase 1] Expert Setup - Morag Fraser (edinburgh)` | Highlands guide profile, services |
| Cartagena | Valentina Herrera | cartagena-romance@traveloure.test | `[Phase 1] Expert Setup - Valentina Herrera (cartagena)` | Romance specialist profile, services |
| Cartagena | Miguel Castillo | cartagena-culture@traveloure.test | `[Phase 1] Expert Setup - Miguel Castillo (cartagena)` | Culture expert profile, services |
| Cartagena | Sofia Vargas | cartagena-food@traveloure.test | `[Phase 1] Expert Setup - Sofia Vargas (cartagena)` | Food expert profile, services |
| Cartagena | Diego Morales | cartagena-beach@traveloure.test | `[Phase 1] Expert Setup - Diego Morales (cartagena)` | Beach/island guide profile, services |
| Jaipur | Priya Sharma | jaipur-artisan@traveloure.test | `[Phase 1] Expert Setup - Priya Sharma (jaipur)` | Artisan specialist profile, services |
| Jaipur | Arjun Singh | jaipur-culture@traveloure.test | `[Phase 1] Expert Setup - Arjun Singh (jaipur)` | Culture expert profile, services |
| Jaipur | Deepa Gupta | jaipur-food@traveloure.test | `[Phase 1] Expert Setup - Deepa Gupta (jaipur)` | Food expert profile, services |
| Jaipur | Vikram Rathore | jaipur-photography-expert@traveloure.test | `[Phase 1] Expert Setup - Vikram Rathore (jaipur)` | Photography expert profile, services |
| Porto | Joao Ferreira | porto-wine@traveloure.test | `[Phase 1] Expert Setup - Joao Ferreira (porto)` | Wine expert profile, services |
| Porto | Ana Silva | porto-architecture@traveloure.test | `[Phase 1] Expert Setup - Ana Silva (porto)` | Architecture expert profile, services |
| Porto | Pedro Costa | porto-food@traveloure.test | `[Phase 1] Expert Setup - Pedro Costa (porto)` | Food expert profile, services |
| Porto | Mariana Santos | porto-digitalnomad@traveloure.test | `[Phase 1] Expert Setup - Mariana Santos (porto)` | Digital nomad guide profile, services |

### Per-Expert Test Steps

For each expert account:

1. **Login** ← Auth system
2. **Navigate to dashboard** ← Role-based routing
3. **Access profile form** ← UI navigation
4. **Fill profile:**
   - Bio (150-200 words, market-specific focus)
   - Hourly rate (USD, GBP, INR, EUR as per market)
   - Languages (2-3 languages per expert)
   - Specialties (primary + secondary)
5. **Verify profile saves** ← Data persistence
6. **Create Service 1:**
   - Name: `{Specialty} Experience - Half Day`
   - Duration: 2-3 hours
   - Price: Market-specific
   - Description: 100+ words
7. **Verify Service 1 listed** ← Service CRUD
8. **Create Service 2:**
   - Name: `{Specialty} Deep Dive - Full Day`
   - Duration: 4-6 hours
   - Price: Market-specific
   - Description: 100+ words
9. **Verify Service 2 listed** ← Service CRUD
10. **Navigate to /expert/services** ← Both services visible
11. **Navigate to /expert/earnings** ← Page loads
12. **Navigate to /expert/analytics** ← Page loads
13. **Logout** ← Session cleanup

### Assertions Per Test

```typescript
// Profile completion
expect(profile.bio).toMatch(/^.{150,200}$/);
expect(profile.hourlyRate).toBeGreaterThan(0);
expect(profile.languages.length).toBeGreaterThanOrEqual(2);
expect(profile.specialties.length).toBeGreaterThanOrEqual(1);

// Service creation
expect(service1.name).toContain('Half Day');
expect(service1.duration).toBe(3);
expect(service1.description.length).toBeGreaterThan(100);
expect(service2.name).toContain('Full Day');
expect(service2.duration).toBe(6);

// UI verification
expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
expect(page.locator('text=Service 1').first()).toBeVisible();
expect(page.locator('text=Service 2').first()).toBeVisible();
```

---

## Phase 2: Service Provider Setup

**Objective:** Verify service providers can set up business and create listings

**Total Scenarios:** 15 tests (one per provider)
**Expected Runtime:** 20-30 minutes
**Dependencies:** None - tests run independently

### Test Matrix

| Market | Provider | Email | Test Name | Coverage |
|---|---|---|---|---|
| Kyoto | Takeshi Ito | kyoto-transport@traveloure.test | `[Phase 2] Provider Setup - Takeshi Ito (kyoto)` | Transport business, services |
| Kyoto | Sakura Watanabe | kyoto-photography@traveloure.test | `[Phase 2] Provider Setup - Sakura Watanabe (kyoto)` | Photography business, services |
| Kyoto | Ryo Suzuki | kyoto-stays@traveloure.test | `[Phase 2] Provider Setup - Ryo Suzuki (kyoto)` | Accommodation business, services |
| Edinburgh | Angus MacDonald | edinburgh-transport@traveloure.test | `[Phase 2] Provider Setup - Angus MacDonald (edinburgh)` | Transport business, services |
| Edinburgh | Isla Robertson | edinburgh-photography@traveloure.test | `[Phase 2] Provider Setup - Isla Robertson (edinburgh)` | Photography business, services |
| Edinburgh | Duncan Murray | edinburgh-stays@traveloure.test | `[Phase 2] Provider Setup - Duncan Murray (edinburgh)` | Accommodation business, services |
| Cartagena | Andres Reyes | cartagena-transport@traveloure.test | `[Phase 2] Provider Setup - Andres Reyes (cartagena)` | Transport business, services |
| Cartagena | Camila Torres | cartagena-photography@traveloure.test | `[Phase 2] Provider Setup - Camila Torres (cartagena)` | Photography business, services |
| Cartagena | Juan Ospina | cartagena-stays@traveloure.test | `[Phase 2] Provider Setup - Juan Ospina (cartagena)` | Accommodation business, services |
| Cartagena | Isabella Mendoza | cartagena-luxury@traveloure.test | `[Phase 2] Provider Setup - Isabella Mendoza (cartagena)` | Luxury services business, services |
| Cartagena | Carlos Rivera | cartagena-concierge@traveloure.test | `[Phase 2] Provider Setup - Carlos Rivera (cartagena)` | Concierge business, services |
| Jaipur | Ravi Kumar | jaipur-transport@traveloure.test | `[Phase 2] Provider Setup - Ravi Kumar (jaipur)` | Transport business, services |
| Jaipur | Ananya Mehra | jaipur-photography@traveloure.test | `[Phase 2] Provider Setup - Ananya Mehra (jaipur)` | Photography business, services |
| Jaipur | Manish Joshi | jaipur-stays@traveloure.test | `[Phase 2] Provider Setup - Manish Joshi (jaipur)` | Accommodation business, services |
| Porto | Tiago Oliveira | porto-transport@traveloure.test | `[Phase 2] Provider Setup - Tiago Oliveira (porto)` | Transport business, services |

### Per-Provider Test Steps

For each provider account:

1. **Login** ← Auth system
2. **Navigate to dashboard** ← Role-based routing
3. **Access business profile form** ← UI navigation
4. **Fill business profile:**
   - Business name (market-specific)
   - Business description (50+ words)
   - Service types (multiple selections)
5. **Verify profile saves** ← Data persistence
6. **Create Service 1:**
   - Name (market-specific)
   - Price (per night/hour, market currency)
   - Description
7. **Create Service 2** (if applicable)
8. **Navigate to /provider/calendar** ← UI navigation
9. **Set availability for 30 days** ← Calendar interaction
10. **Verify availability persists** ← Data persistence
11. **Navigate to /provider/bookings** ← Page loads
12. **Navigate to /provider/earnings** ← Page loads
13. **Logout** ← Session cleanup

### Assertions Per Test

```typescript
// Business profile
expect(profile.businessName).toBeTruthy();
expect(profile.description.length).toBeGreaterThan(50);
expect(profile.serviceTypes.length).toBeGreaterThan(0);

// Service creation
expect(service1.name).toBeTruthy();
expect(service1.price).toBeGreaterThan(0);
expect(service1.description.length).toBeGreaterThan(20);

// Availability calendar
expect(availableDays).toHaveLength(30);
expect(availableDays.every(d => d.available === true)).toBe(true);

// UI verification
expect(page.locator('[data-testid="provider-dashboard"]')).toBeVisible();
expect(page.locator('[data-testid="calendar"]')).toBeVisible();
```

---

## Phase 3: Traveler Flows & Trip Creation

**Objective:** Verify travelers can create trips, add activities, and book services

**Total Scenarios:** 5 comprehensive tests (one per market)
**Expected Runtime:** 40-50 minutes
**Dependencies:** Phase 1 & 2 tests must pass (need experts/providers)

### Test Matrix

| Trip | Market | Traveler Email | Dates | Guests | Budget | Coverage |
|---|---|---|---|---|---|---|
| Kyoto Couples | Kyoto | test-traveler-kyoto@traveloure.test | July 15-22 | 2 | $3,000 | Temple tours, food, photography |
| Edinburgh Whisky | Edinburgh | test-traveler-edinburgh@traveloure.test | Aug 5-12 | 4 | £4,500 | Whisky tasting, festivals, nature |
| Cartagena Proposal | Cartagena | test-traveler-cartagena@traveloure.test | Sept 1-7 | 2 | $5,000 | Romance, yacht, proposal setup |
| Jaipur Family | Jaipur | test-traveler-jaipur@traveloure.test | Oct 10-17 | 5 | ₹200,000 | Palaces, bazaars, workshops |
| Porto Digital Nomad | Porto | test-traveler-porto@traveloure.test | Nov 1-14 | 1 | €2,000 | Wine, architecture, coworking |

### Per-Trip Test Steps

For each trip (Kyoto example):

1. **Register/Login** as `test-traveler-kyoto@traveloure.test`
2. **Navigate to trip creation**
3. **Fill trip details:**
   - Destination: Kyoto, Japan
   - Start date: July 15
   - End date: July 22
   - Guests: 2
   - Budget: $3,000
   - Type: Travel
4. **Verify trip created**
5. **Add 5+ activities:**
   - Fushimi Inari (3 hours)
   - Tea Ceremony (2 hours)
   - Nishiki Market Tour (4 hours)
   - Bamboo Grove Walk (2 hours)
   - Kaiseki Dinner (3 hours)
6. **Verify activities timeline**
7. **Browse Kyoto experts** (search/filter)
8. **View Aiko Yamamoto profile**
9. **Message Aiko** about food tour
10. **Find and view services** (Nishiki Market tour)
11. **Add photography service to cart**
12. **Proceed to checkout**
13. **Process payment** (Stripe test card)
14. **Verify booking created**
15. **View itinerary** with timeline
16. **View itinerary map** with activity pins
17. **Generate shareable link**
18. **Test shareable link** (unauthenticated)
19. **Verify transport legs** between activities
20. **Toggle map layers** (activities/transport)

### Assertions Per Test

```typescript
// Trip creation
expect(trip.destination).toBe('Kyoto, Japan');
expect(trip.startDate).toBe('July 15');
expect(trip.guests).toBe(2);
expect(trip.budget).toBe(3000);

// Activities
expect(activities.length).toBeGreaterThanOrEqual(5);
expect(activities.every(a => a.name && a.duration)).toBe(true);

// Timeline order
activities.forEach((activity, index) => {
  if (index > 0) {
    expect(activity.date >= activities[index - 1].date).toBe(true);
  }
});

// Booking
expect(booking.status).toBe('confirmed');
expect(booking.totalPrice).toBeGreaterThan(0);
expect(booking.expert.name).toBe('Sakura Watanabe');

// Itinerary
expect(itinerary.activities.length).toBeGreaterThanOrEqual(5);
expect(itinerary.transport.legs.length).toBeGreaterThanOrEqual(4);

// Shareable link
expect(shareLink).toMatch(/\/itinerary\/[a-f0-9-]+$/);
expect(unauthenticatedPage.activities).toBeTruthy();
```

---

## Phase 4: Expert Review & Collaboration

**Objective:** Verify experts can review and modify traveler itineraries

**Total Scenarios:** 5 tests (one expert per trip)
**Expected Runtime:** 15-20 minutes
**Dependencies:** Phase 3 tests must pass

### Test Matrix

| Trip | Expert | Email | Task |
|---|---|---|---|
| Kyoto | Aiko Yamamoto | kyoto-food@traveloure.test | Review food-related activities, suggest changes |
| Edinburgh | Fiona Campbell | edinburgh-whisky@traveloure.test | Review whisky activities, add recommendations |
| Cartagena | Valentina Herrera | cartagena-romance@traveloure.test | Review proposal activities, enhance experience |
| Jaipur | Priya Sharma | jaipur-artisan@traveloure.test | Review artisan/craft activities, suggest workshops |
| Porto | Joao Ferreira | porto-wine@traveloure.test | Review wine activities, suggest vineyards |

### Test Steps

For each expert review:

1. **Login** as expert
2. **Navigate to /expert/clients**
3. **Find traveler's trip**
4. **Open itinerary for review**
5. **Review each activity:**
   - Accept 2-3 activities
   - Suggest modification for 1-2
   - Accept 1-2 more
6. **Add expert comments** to activities
7. **Send recommendations message**
8. **Verify attribution tracking** (name, timestamp)
9. **Logout**

### Assertions Per Test

```typescript
// Expert can view trip
expect(trip.traveler.name).toBeTruthy();
expect(trip.activities.length).toBeGreaterThan(0);

// Attribution tracking
activities.forEach(activity => {
  if (activity.status === 'modified') {
    expect(activity.modifiedBy).toBe('Expert Name');
    expect(activity.modifiedAt).toBeTruthy();
  }
});

// Messaging
expect(message.from).toBe(expert.email);
expect(message.content.length).toBeGreaterThan(10);
```

---

## Phase 5: Executive Assistant Flows

**Objective:** Verify EA can manage multiple client trips

**Total Scenarios:** 1 comprehensive test
**Expected Runtime:** 5-10 minutes
**Dependencies:** Phase 3 tests must pass (multiple trips exist)

### Test Steps

1. **Login** as `test-ea@traveloure.test`
2. **Navigate to /ea/dashboard**
3. **Verify overview** (client count, upcoming trips)
4. **Navigate to /ea/clients**
5. **View all assigned clients** (should see 5 from Phase 3)
6. **Navigate to /ea/calendar**
7. **Verify all trips visible** on calendar
8. **Navigate to /ea/planning**
9. **View trip coordination** interface
10. **Select one trip** and assign an expert
11. **Verify assignment** completed
12. **Logout**

### Assertions Per Test

```typescript
// Dashboard
expect(dashboard.clientCount).toBeGreaterThanOrEqual(5);
expect(dashboard.upcomingTrips).toBeTruthy();

// Calendar
expect(calendar.events.length).toBeGreaterThanOrEqual(5);

// Expert assignment
expect(trip.assignedExpert).toBe('Expert Name');
expect(expert.notification).toContain('assignment');
```

---

## Phase 6: Transport & Itinerary Verification

**Objective:** Verify transport calculations and itinerary features

**Total Scenarios:** 2 comprehensive tests
**Expected Runtime:** 10-15 minutes
**Dependencies:** Phase 3 tests must pass

### Test Matrix

| Trip | Focus |
|---|---|
| Kyoto | Transport between temple activities |
| Cartagena | Transport between island activities |

### Test Steps

For each trip:

1. **Login** as traveler
2. **Open trip itinerary**
3. **Verify transport legs** appear between all activities
4. **Check transport times** estimate
5. **View transport dashboard**
6. **Toggle activity map layer**
7. **Toggle transport map layer**
8. **Verify polylines** show on map
9. **Test shareable link** with full details
10. **Logout**

### Assertions Per Test

```typescript
// Transport calculation
activities.forEach((activity, index) => {
  if (index < activities.length - 1) {
    const transport = itinerary.transport[index];
    expect(transport).toBeTruthy();
    expect(transport.duration).toBeGreaterThan(0);
  }
});

// Map display
expect(map.activityPins.length).toBeGreaterThanOrEqual(5);
expect(map.transportPolylines.length).toBeGreaterThanOrEqual(4);

// Layer toggle
expect(map.toggleActivityLayer()).toEqual({ visible: false });
expect(map.toggleTransportLayer()).toEqual({ visible: false });
```

---

## Phase 7: Cross-Role Booking & Payment

**Objective:** Verify complete booking and payment flow

**Total Scenarios:** 5 tests (one per market)
**Expected Runtime:** 20-30 minutes
**Dependencies:** Phase 1-3 tests must pass

### Test Matrix

| Market | Service | Provider | Price | Coverage |
|---|---|---|---|---|
| Kyoto | Nishiki Market Food Tour | Aiko Yamamoto | $140 | Add to cart, checkout, payment, confirmation |
| Edinburgh | Whisky Masterclass | Fiona Campbell | £95 | Cart management, payment processing |
| Cartagena | Photography Session | Camila Torres | $200 | Payment error handling, confirmation |
| Jaipur | Artisan Workshop | Priya Sharma | ₹4500 | Multi-currency payment, payout tracking |
| Porto | Wine Tasting Tour | Joao Ferreira | €75 | Full booking lifecycle |

### Test Steps

For Kyoto example:

1. **Login** as `test-traveler-kyoto@traveloure.test`
2. **Search for Aiko's food tour**
3. **View service details**
4. **Add to cart**
5. **Verify cart** shows item, price, total
6. **Proceed to checkout**
7. **Fill billing address**
8. **Enter Stripe test card** (4242 4242 4242 4242)
9. **Submit payment**
10. **Verify success** page
11. **Check confirmation email** received
12. **Logout traveler**
13. **Login as Aiko** (expert)
14. **Navigate to /expert/bookings**
15. **Find traveler's booking**
16. **Verify booking details**
17. **Confirm booking**
18. **Navigate to /expert/earnings**
19. **Verify booking appears** in earnings
20. **Verify payout calculated** (85% of $140 = $119)
21. **Logout expert**

### Assertions Per Test

```typescript
// Cart
expect(cart.items.length).toBe(1);
expect(cart.total).toBe(140);

// Checkout
expect(billingAddress.required).toBe(true);
expect(paymentForm).toBeVisible();

// Payment
expect(stripeForm).toBeVisible();
expect(paymentResponse.status).toBe('succeeded');

// Confirmation
expect(bookingConfirmation).toContain('Nishiki Market');
expect(confirmationEmail).toBeReceived();

// Expert view
expect(expertBooking.status).toBe('pending');
expect(expertBooking.amount).toBe(140);

// Earnings
expect(expert.earnings).toContain(119); // 85% of 140
expect(expertBooking.status).toBe('confirmed');
```

---

## Dependency Graph

```
Phase 1 ──┐
          ├─→ Phase 3 ┬──→ Phase 4
Phase 2 ──┘          │
                     ├──→ Phase 6
                     └──→ Phase 7

Phase 3 ──→ Phase 5

Phase 3 & Phase 1-2 ──→ Phase 6
Phase 3 & Phase 1-2 ──→ Phase 7
```

---

## Test Execution Strategies

### Smoke Test (5-10 minutes)
Run Phase 1 & 2 tests for 1-2 accounts per market only:
- `[Phase 1] Expert Setup - Yuki Tanaka (kyoto)`
- `[Phase 2] Provider Setup - Takeshi Ito (kyoto)`
- `[Phase 1] Expert Setup - Fiona Campbell (edinburgh)`
- `[Phase 2] Provider Setup - Angus MacDonald (edinburgh)`

### Functional Test (20-30 minutes)
Run Phase 1, 2, 3 full:
- All Phase 1 tests (21 experts)
- All Phase 2 tests (15 providers)
- All Phase 3 tests (5 trips)

### Integration Test (40-50 minutes)
Run Phase 3-7 full:
- Phase 3: Trip creation (5 tests)
- Phase 4: Expert review (5 tests)
- Phase 5: EA dashboard (1 test)
- Phase 6: Transport verification (2 tests)
- Phase 7: Booking & payment (5 tests)

### Full E2E Test (60-90 minutes)
Run all phases:
```bash
npm run test:e2e  # Runs all 7 phases
```

---

## Known Flaky Tests & Workarounds

| Test | Issue | Workaround |
|---|---|---|
| Authentication Modal | Terms modal may not appear | Use `acceptTerms()` helper with error handling |
| Calendar Sync | Provider availability takes 10s to sync | Add `page.waitForTimeout(10000)` after save |
| Email Testing | Test email may not arrive immediately | Wait up to 30 seconds, use email API for verification |
| Stripe Payment | Card frame loads asynchronously | Wait for iframe before filling form |
| Maps | Maps may take time to load | Add explicit wait for map API |

---

## Performance Baselines

| Test Type | Expected Time | Threshold |
|---|---|---|
| Single expert setup | 1-2 min | <3 min |
| Single provider setup | 1-2 min | <3 min |
| Single trip creation | 3-5 min | <7 min |
| Expert review | 1-2 min | <3 min |
| Full booking flow | 2-3 min | <5 min |

If tests exceed thresholds, investigate:
- Network latency
- Database performance
- API response times
- Browser/driver issues
