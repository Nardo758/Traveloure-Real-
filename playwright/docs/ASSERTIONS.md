# Traveloure Test Assertions Reference

Comprehensive list of assertions and validations for E2E testing.

---

## Authentication Assertions

### Login Flow
- [ ] Login page loads when not authenticated
- [ ] Email field accepts valid email format
- [ ] Password field masks input
- [ ] Login succeeds with correct credentials
- [ ] Login fails with invalid password (shows error)
- [ ] Login fails with unregistered email (shows error)
- [ ] Session persists across page reloads
- [ ] User redirected to appropriate dashboard based on role
- [ ] Logout clears session and redirects to login

### Role-Based Access
- [ ] Expert can access /expert/dashboard
- [ ] Provider cannot access /expert/dashboard (403 or redirect)
- [ ] Traveler cannot access /provider/dashboard
- [ ] EA can only access /ea/* routes
- [ ] Admin can access /admin/* routes
- [ ] Unauthenticated users redirect to /login

### Terms & Conditions
- [ ] Terms modal appears on first login
- [ ] Accept button saves consent
- [ ] Declining terms prevents login
- [ ] Subsequent logins don't show modal

---

## Expert Profile Assertions

### Profile Completeness
- [ ] Dashboard shows profile completion percentage
- [ ] Bio field accepts 150-200 words
- [ ] Bio field rejects content >500 words
- [ ] Bio field displays correctly after save
- [ ] Hourly rate shows in correct currency
- [ ] Hourly rate validates (positive numbers only)
- [ ] Hourly rate persists after page reload
- [ ] Multiple languages can be selected (min 2)
- [ ] Multiple specialties can be selected
- [ ] Profile changes save without errors
- [ ] "Profile saved successfully" message appears
- [ ] Profile image uploads and displays
- [ ] Profile image appears in public listings

### Expertise Details
- [ ] Years of experience field accepts numbers
- [ ] Certifications text field accepts 50+ characters
- [ ] Education/training field appears and saves
- [ ] Previous experience details display correctly
- [ ] Verified badge appears for completed profiles
- [ ] Response time displays on profile

---

## Service Creation Assertions

### Service Form Validation
- [ ] Service name field required
- [ ] Service name accepts 5-100 characters
- [ ] Service name rejects <5 or >100 characters
- [ ] Service description required
- [ ] Service description accepts 50-500 words
- [ ] Service description displays with proper formatting
- [ ] Price field required
- [ ] Price accepts decimal values
- [ ] Price rejects negative or zero values
- [ ] Duration field accepts 1-8 hours
- [ ] Duration field rejects 0 or >8 hours
- [ ] Currency selector matches expert's market
- [ ] Currency converts correctly for display

### Service Listings
- [ ] Services appear in /expert/services within 5 seconds
- [ ] Service card displays name, price, duration, image
- [ ] Service rating/reviews display if available
- [ ] Service availability toggle works
- [ ] Inactive services don't appear in public listings
- [ ] Clicking service shows detailed view
- [ ] Service edit form loads with current data
- [ ] Service edits save without errors
- [ ] Service can be deleted
- [ ] Deleted services removed from listings immediately
- [ ] Service image uploads and displays
- [ ] Multiple images can be added (if supported)

### Service Pricing Display
- [ ] Price shows in correct currency symbol
- [ ] Total cost = price × duration displayed
- [ ] Pricing calculations are accurate
- [ ] Currency conversions display (if applicable)
- [ ] Pricing history accessible in admin
- [ ] Discount codes apply correctly (if supported)

---

## Provider Setup Assertions

### Business Profile
- [ ] Business name field required
- [ ] Business name accepts 5-100 characters
- [ ] Business description required
- [ ] Business description accepts 50+ words
- [ ] Service types checkboxes display correctly
- [ ] Multiple service types can be selected
- [ ] Business info saves without errors
- [ ] Business changes reflect in public profiles
- [ ] Business logo uploads and displays
- [ ] Verified provider badge displays (if applicable)

### Service Listings (Provider)
- [ ] Provider can create 1+ service listings
- [ ] Service listing shows availability
- [ ] Pricing per night/hour displays correctly
- [ ] Service description formats correctly
- [ ] Multiple images can be added
- [ ] Availability calendar displays 30+ days
- [ ] Calendar integrates with booking system

### Availability Calendar
- [ ] Calendar displays 30-day forward window
- [ ] Individual days can be marked available/unavailable
- [ ] Multiple consecutive days can be selected
- [ ] Bulk availability setting works (if supported)
- [ ] Calendar persists after page reload
- [ ] Booked dates appear as unavailable
- [ ] Availability updates reflect in public listings
- [ ] Timezone is displayed and editable

---

## Traveler Trip Assertions

### Trip Creation
- [ ] Trip creation form loads
- [ ] Destination field accepts text input
- [ ] Destination field shows location suggestions
- [ ] Start date picker works and validates
- [ ] End date validates (after start date)
- [ ] Trip duration calculates correctly
- [ ] Guest count field accepts numbers (1-20)
- [ ] Budget field accepts numbers
- [ ] Budget currency matches trip destination
- [ ] Trip saves successfully
- [ ] New trip appears in /my-trips
- [ ] Trip shows destination, dates, status on card

### Trip Activities
- [ ] Activities can be added to trip
- [ ] Activity form accepts name, description, date
- [ ] Activities display in chronological order
- [ ] Activity duration auto-calculates (if available)
- [ ] Activity location can be added via map
- [ ] Activity images upload and display
- [ ] Activities can be reordered via drag/drop (if supported)
- [ ] Activities can be edited
- [ ] Activities can be deleted
- [ ] Total itinerary time calculates (sum of activities)
- [ ] Activity start/end times conflict check (if applicable)

### Trip Status
- [ ] Trip shows status (draft, planning, confirmed, etc.)
- [ ] Status updates as trip progresses
- [ ] Trip can be duplicated
- [ ] Trip can be shared via link
- [ ] Trip can be exported/printed

---

## Itinerary & Map Assertions

### Timeline Display
- [ ] All activities display in timeline
- [ ] Activities appear in chronological order
- [ ] Activity details visible: name, time, location
- [ ] Transport legs appear between activities
- [ ] Transport time estimates display
- [ ] Total trip time displays correctly
- [ ] Timeline formats dates in user's locale
- [ ] Timeline responsive on mobile (if tested)

### Map Display
- [ ] Map loads with correct location
- [ ] Activity pins display on map
- [ ] Pins are numbered (1, 2, 3, etc.)
- [ ] Transport polylines display between pins
- [ ] Transport route is visible and clear
- [ ] Map can be zoomed in/out
- [ ] Map can be panned/dragged
- [ ] Activity details appear on pin click
- [ ] Map layers can be toggled
- [ ] Map is accessible on /trip/:id/map
- [ ] Map is accessible in sidebar/mobile view

### Shareable Itinerary
- [ ] Share button generates unique URL
- [ ] Share link format: /itinerary/{uuid}
- [ ] Unauthenticated users can access share link
- [ ] Shared itinerary displays full trip details
- [ ] Shared itinerary shows all activities
- [ ] Shared itinerary shows map with pins/routes
- [ ] Share link doesn't expire (or expiration shown)
- [ ] Share link is copyable/shareable
- [ ] Shared view is read-only (no editing)

### Transport Verification
- [ ] Transport legs calculate server-side (not client)
- [ ] Transport time estimated between activities
- [ ] Transport distance calculated (if available)
- [ ] Transport mode shown (if available: car, train, walk)
- [ ] Transport can be edited/replaced
- [ ] Transport appears in operations dashboard
- [ ] Transport booking/confirmation available
- [ ] Transport cost estimates display
- [ ] Transport status updates (confirmed, pending)

---

## Booking & Payment Assertions

### Shopping Cart
- [ ] Services can be added to cart
- [ ] Cart displays all added items
- [ ] Each item shows price and quantity
- [ ] Cart total calculates correctly
- [ ] Cart items can be removed
- [ ] Cart persists across sessions (if supported)
- [ ] Empty cart shows message
- [ ] Proceed to checkout button visible
- [ ] Out-of-stock items handled (if applicable)

### Checkout Flow
- [ ] Checkout page displays cart summary
- [ ] Billing address form required
- [ ] Billing address validates correctly
- [ ] Payment method selection appears
- [ ] Multiple payment options available (if supported)
- [ ] Order review shows: items, prices, total
- [ ] Promo codes can be applied (if supported)
- [ ] Promo code discount calculates
- [ ] Discount applied to total
- [ ] Checkout validates all required fields
- [ ] Checkout shows errors for invalid fields
- [ ] Continue to payment button visible

### Payment Processing
- [ ] Stripe payment form loads
- [ ] Card number field accepts valid card
- [ ] Expiry date field validates MM/YY format
- [ ] CVC field accepts 3-4 digits
- [ ] Card validation fails for invalid data
- [ ] Test card (4242 4242 4242 4242) processes successfully
- [ ] Declined card shows error message
- [ ] Payment processes without page reload
- [ ] Payment success shows confirmation page
- [ ] Confirmation page displays booking details
- [ ] Confirmation email received (check test email)
- [ ] Booking appears in /my-bookings immediately
- [ ] Order number displayed on confirmation

### Booking Status
- [ ] Booking shows status: pending, confirmed, in-progress, completed
- [ ] Booking displays expert name and service
- [ ] Booking shows dates and times
- [ ] Booking shows total cost paid
- [ ] Booking shows expert contact info
- [ ] Booking can be cancelled (before/after confirmation per policy)
- [ ] Cancellation shows refund policy
- [ ] Refund appears in account (if applicable)

### Expert Booking Confirmation
- [ ] Expert receives notification of new booking
- [ ] Booking appears in /expert/bookings
- [ ] Booking shows traveler name and details
- [ ] Expert can confirm/accept booking
- [ ] Expert can modify booking (dates, details, if allowed)
- [ ] Expert can decline/cancel booking
- [ ] Traveler notified of expert's response
- [ ] Booking status updates reflect in both views

---

## Earnings & Payouts Assertions

### Expert Earnings Dashboard
- [ ] /expert/earnings page loads
- [ ] Completed bookings appear in earnings
- [ ] Booking amount shows correctly
- [ ] Platform fee calculated and displayed
- [ ] Net earnings calculated (80% or per policy)
- [ ] Currency conversion displays (if multi-currency)
- [ ] Earnings total displays at top
- [ ] Monthly breakdown available (if supported)
- [ ] Year-to-date total displays
- [ ] Earnings chart/graph displays (if supported)

### Payout Information
- [ ] Bank account section appears
- [ ] Bank details can be added/edited
- [ ] Payout schedule shows (e.g., 7 days after completion)
- [ ] Next payout date displays
- [ ] Payout status shows pending/completed/failed
- [ ] Failed payouts show reason
- [ ] Payout history displays past transfers
- [ ] Minimum payout threshold shown (if applicable)
- [ ] Payout method options available (bank, PayPal, etc.)

### Payment Tracking
- [ ] Completed bookings show in earnings same day
- [ ] Pending bookings tracked separately
- [ ] Booking completion status updates earnings
- [ ] Refunded bookings deduct from earnings
- [ ] Tax information accessible (if required)
- [ ] 1099/tax document generation available (if US)
- [ ] Earnings reports downloadable (CSV, PDF)

---

## Messaging Assertions

### Message Sending
- [ ] Message input field visible
- [ ] Message accepts 1-500 characters
- [ ] Send button active with text entered
- [ ] Send button disabled on empty message
- [ ] Message sends successfully
- [ ] Message appears in conversation immediately
- [ ] Message timestamp displays
- [ ] User name displays on message
- [ ] User avatar displays (if available)

### Message Receiving
- [ ] Received messages appear in chat
- [ ] Message sender identifies correctly
- [ ] Unread badge appears on notification
- [ ] Chat history loads previous messages
- [ ] Conversation loads with expert details
- [ ] Message read/unread status shows
- [ ] Typing indicator displays (if supported)
- [ ] Notification appears for new messages

### Message Management
- [ ] Messages can be deleted (if policy allows)
- [ ] Message editing available (if policy allows)
- [ ] Message search available (if supported)
- [ ] Conversation can be archived
- [ ] Conversation can be blocked (if applicable)
- [ ] Bulk messaging available (if applicable)
- [ ] Export message history (if supported)

---

## Collaboration & Review Assertions

### Activity Review (Expert)
- [ ] Expert can view traveler's itinerary
- [ ] Activities display with all details
- [ ] Expert can accept activity
- [ ] Expert can modify/suggest alternatives
- [ ] Expert can reject activity
- [ ] Changes show with attribution (expert name, timestamp)
- [ ] Traveler receives notification of changes
- [ ] Change history displays
- [ ] Comments can be added to activities
- [ ] Activity status shows (accepted, pending, rejected)

### Recommendation System
- [ ] Expert can add suggestions
- [ ] Suggestions appear for traveler review
- [ ] Traveler can accept/reject suggestions
- [ ] Accepted suggestions integrate into itinerary
- [ ] Rejected suggestions don't appear in timeline
- [ ] Suggestion history tracked

---

## Executive Assistant (EA) Assertions

### EA Dashboard
- [ ] /ea/dashboard loads
- [ ] Overview shows client count
- [ ] Upcoming trips summary displays
- [ ] Active trips highlighted
- [ ] Trip status indicators show
- [ ] Navigation to client management accessible

### Client Management
- [ ] /ea/clients shows all assigned clients
- [ ] Client list displays with names and contact info
- [ ] Trips per client visible
- [ ] Trip status for each client shows
- [ ] Client details can be opened
- [ ] Trip details can be accessed
- [ ] Experts assigned to trips visible
- [ ] Expert contact info available

### Master Calendar
- [ ] /ea/calendar displays
- [ ] All client trips appear on calendar
- [ ] Trips color-coded by client (if supported)
- [ ] Month/week/day views available
- [ ] Clicking trip shows details
- [ ] Trip dates clearly visible
- [ ] Calendar conflicts visible (if overlapping)
- [ ] Calendar can export to .ics (if supported)

### Trip Coordination
- [ ] EA can view trip details
- [ ] EA can assign experts to trips
- [ ] Expert assignment notifications sent
- [ ] Reassignments possible
- [ ] Trip status can be updated
- [ ] Communications between EA and client visible
- [ ] Documents/files uploadable (if supported)

---

## Navigation & UI Assertions

### Dashboard Navigation
- [ ] Main navigation menu visible
- [ ] All applicable menu items appear based on role
- [ ] Menu items link to correct pages
- [ ] Sidebar renders correctly (known bug tracking)
- [ ] Sidebar doesn't collapse unexpectedly
- [ ] Mobile menu available (if mobile tested)
- [ ] Active page highlighted in navigation
- [ ] Breadcrumbs display (if implemented)

### Page Load Performance
- [ ] Dashboard loads within 3 seconds
- [ ] Services page loads within 3 seconds
- [ ] Bookings page loads within 3 seconds
- [ ] No loading spinners stuck
- [ ] Network requests complete without 5xx errors
- [ ] Console has no JavaScript errors
- [ ] Console warnings only for non-critical items

### Error Handling
- [ ] 404 pages display correctly
- [ ] 403 access denied message displays
- [ ] 500 server error message displays
- [ ] Form validation errors display
- [ ] API errors shown to user (non-technical language)
- [ ] Retry button available for failed actions
- [ ] Previous data preserved after error (if applicable)

---

## Data Validation Assertions

### Pricing Calculations
- [ ] Service price × quantity = subtotal
- [ ] Subtotal + tax = total (if applicable)
- [ ] Platform fee = 15-20% (per policy)
- [ ] Expert payout = total - platform fee
- [ ] Currency conversions accurate
- [ ] Decimal precision to 2 places maintained
- [ ] Rounding consistent across calculations

### Date/Time Handling
- [ ] Dates display in user's locale
- [ ] Times account for timezones (if multi-timezone)
- [ ] Duration calculations correct
- [ ] Start/end time validation (end > start)
- [ ] Past dates rejected for bookings
- [ ] Date ranges in past rejected
- [ ] Daylight savings handling correct (if applicable)

### Data Persistence
- [ ] Form data saved persists after reload
- [ ] Profile updates persist
- [ ] Booking data consistent across pages
- [ ] Earnings calculations accurate
- [ ] Database transactions complete (no partial saves)
- [ ] Concurrent edits handled (if multi-user possible)

---

## Known Issues & Exceptions

### Documented Bugs to Monitor
- [ ] **Sidebar rendering:** Sometimes doesn't appear on first load. Refresh page if missing.
- [ ] **Payment confirmation:** May take 2-5 seconds. Don't click twice.
- [ ] **Calendar sync:** Provider availability may lag 10s. Wait for visual update.
- [ ] **Email delivery:** Test emails may not send. Check admin view of email queue.

### Expected Behaviors
- [ ] Some API endpoints return 202 (async processing) instead of 200
- [ ] Profile photo upload limited to 5MB
- [ ] Service descriptions auto-truncate at 500 words
- [ ] Deleted accounts are soft-deleted (records kept for audit)

---

## Testing Tips

### Assertion Best Practices
1. Always wait for element visibility before asserting
2. Use `catch()` for optional elements that may not appear
3. Assert on data, not just visual elements
4. Include error messages in assertions for debugging
5. Screenshot before assertions for failure documentation

### Common Assertion Patterns

```typescript
// Check element exists and is visible
await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();

// Check element doesn't exist
await expect(page.locator('[data-testid="error"]')).not.toBeVisible();

// Check text content
await expect(page.locator('h1')).toContainText('Dashboard');

// Check attribute value
await expect(page.locator('button')).toHaveAttribute('disabled');

// Check multiple elements
const items = await page.locator('[data-testid="item"]').all();
expect(items.length).toBe(5);

// Check navigation
expect(page.url()).toContain('/expert/dashboard');
```

---

## Performance Assertions

- [ ] Page load time < 3 seconds
- [ ] API response time < 2 seconds
- [ ] Form submission < 1 second
- [ ] Search results appear < 1 second
- [ ] Pagination loads < 1 second
- [ ] Image lazy loading works
- [ ] Mobile load time < 5 seconds (if tested)
