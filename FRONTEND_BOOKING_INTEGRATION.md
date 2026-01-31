# Frontend Booking Integration Guide

## 🎯 What Was Built

Complete booking flow with 3 new components:

### 1. **StripeCheckout.tsx**
- Stripe payment form with card element
- Handles payment processing
- Error handling & loading states
- Secure payment confirmation

### 2. **BookingConfirmation.tsx**
- Success screen with confirmation codes
- Payment summary
- Receipt download/email
- Next steps guidance

### 3. **BookingFlowModal.tsx**
- Complete booking flow orchestration
- 3 steps: Review → Payment → Confirmation
- Cart management
- Price calculations
- API integration

### 4. **bookingAPI.ts**
- Type-safe API client
- All booking endpoints wrapped
- Error handling
- TypeScript interfaces

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- `@stripe/stripe-js` - Stripe.js loader
- `@stripe/react-stripe-js` - React Stripe components

### Step 2: Add Environment Variable

In Replit Secrets or `.env`:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### Step 3: Import and Use

```tsx
import BookingFlowModal from '@/components/booking/BookingFlowModal';
import { useState } from 'react';

function YourComponent() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  return (
    <>
      <button onClick={() => setIsBookingOpen(true)}>
        Book Now
      </button>

      <BookingFlowModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        cartItems={cartItems}
        tripData={{
          destinations: [{ city: 'Paris', country: 'France' }],
          startDate: '2026-03-01',
          endDate: '2026-03-07',
          travelers: 2,
          experienceType: 'travel',
        }}
        userId="user-123"
        userEmail="user@example.com"
      />
    </>
  );
}
```

---

## 🔄 Integration with Existing PlanningModal

### Option A: Replace PlanningModal

Replace your current `PlanningModal.jsx` flow with the booking flow:

```tsx
// After AI generates itinerary, open booking modal
const handleItineraryGenerated = (itinerary) => {
  // Convert itinerary items to cart items
  const cartItems = itinerary.items.map(item => ({
    id: item.id,
    tripId: itinerary.tripId,
    providerId: item.providerId,
    title: item.title,
    itemType: item.type,
    bookingType: 'instant', // or 'request' or 'external'
    date: item.date,
    time: item.time,
    price: item.price,
    location: item.location,
  }));

  setCartItems(cartItems);
  setIsBookingModalOpen(true);
};
```

### Option B: Add Booking Step to PlanningModal

Extend your existing `PlanningModal` with a booking step:

```tsx
// In PlanningModal.jsx
import { bookingAPI } from '@/lib/bookingAPI';

const [bookingStep, setBookingStep] = useState(false);

// After generating itinerary
const handleGenerate = async () => {
  // ... existing code ...
  
  // Instead of navigating away, show booking options
  setBookingStep(true);
};

// In render
{bookingStep ? (
  <BookingFlowModal
    isOpen={true}
    onClose={() => setBookingStep(false)}
    cartItems={generatedCartItems}
    tripData={tripData}
    userId={userId}
  />
) : (
  // ... existing planning form ...
)}
```

---

## 📦 Component API Reference

### BookingFlowModal Props

```typescript
interface BookingFlowModalProps {
  isOpen: boolean;                    // Modal visibility
  onClose: () => void;                // Close handler
  cartItems: CartItem[];              // Items to book
  tripData: {                         // Trip metadata
    destinations: any[];
    startDate: string;
    endDate: string;
    travelers: number;
    experienceType: string;
  };
  userId: string;                     // Current user ID
  userEmail?: string;                 // User email for receipts
}

interface CartItem {
  id: string;
  tripId: string;
  providerId?: string;
  title: string;
  itemType: string;
  bookingType: 'instant' | 'request' | 'external';
  date: string;
  time?: string;
  price: number;
  location: string;
  metadata?: any;
}
```

### StripeCheckout Props

```typescript
interface StripeCheckoutProps {
  paymentIntent: {
    clientSecret: string;
    paymentIntentId: string;
    amount: number;                   // Amount in cents
  };
  bookingIds: string[];
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}
```

### BookingConfirmation Props

```typescript
interface BookingConfirmationProps {
  bookings: BookingItem[];            // Confirmed bookings
  paymentIntentId: string;
  totalAmount: number;
  travelers: number;
  userEmail?: string;
  onClose: () => void;
}
```

---

## 🧪 Testing the Flow

### Test with Stripe Test Cards

**Success:**
- Card: `4242 4242 4242 4242`
- Any future expiry, any CVC

**Decline:**
- Card: `4000 0000 0000 0002`

**3D Secure:**
- Card: `4000 0025 0000 3155`

### Test Flow

1. **Add items to cart:**
```typescript
const testCartItems = [
  {
    id: 'item-1',
    tripId: 'trip-123',
    providerId: 'provider-1',
    title: 'Eiffel Tower Tour',
    itemType: 'activities',
    bookingType: 'instant',
    date: '2026-03-15',
    time: '10:00',
    price: 89.99,
    location: 'Paris, France',
  },
];
```

2. **Open modal:**
```tsx
<BookingFlowModal
  isOpen={true}
  onClose={() => console.log('Closed')}
  cartItems={testCartItems}
  tripData={{
    destinations: [{ city: 'Paris', country: 'France' }],
    startDate: '2026-03-15',
    endDate: '2026-03-20',
    travelers: 2,
    experienceType: 'travel',
  }}
  userId="test-user-123"
  userEmail="test@example.com"
/>
```

3. **Review cart** → Click "Proceed to Payment"

4. **Enter test card** → Click "Pay"

5. **See confirmation** → Booking codes displayed

---

## 🎨 Customization

### Styling

All components use Tailwind CSS. Customize colors:

```tsx
// Change primary color from purple to blue
className="bg-purple-600" → className="bg-blue-600"
className="text-purple-600" → className="text-blue-600"
```

### Platform Fee

Adjust in `BookingFlowModal.tsx`:

```typescript
// Change from 12% to 10%
const platformFee = subtotal * 0.10; // was 0.12
```

### Payment Options

Add deposit payments:

```typescript
// In BookingFlowModal
const [paymentMethod, setPaymentMethod] = useState<'full' | 'deposit'>('full');

// Pass to process cart
const response = await fetch('/api/bookings/process-cart', {
  body: JSON.stringify({
    userId,
    cartItems,
    paymentMethod, // 'full' or 'deposit'
  }),
});
```

---

## 🔌 API Integration Points

### Backend Endpoints Used

All these endpoints are already built in your backend:

```
POST /api/bookings/process-cart
POST /api/bookings/confirm-payment
GET  /api/bookings/availability/:providerId
GET  /api/bookings/availability-calendar/:providerId
POST /api/bookings/estimate-cost
POST /api/bookings/apply-promo
POST /api/bookings/refund
```

### Using the API Client

```typescript
import { bookingAPI } from '@/lib/bookingAPI';

// Check availability
const available = await bookingAPI.checkAvailability(
  'provider-123',
  '2026-03-15',
  '10:00',
  2 // travelers
);

// Get price estimate
const estimate = await bookingAPI.estimateCost([
  { providerId: 'provider-123', date: '2026-03-15', travelers: 2, category: 'activities' }
]);

// Apply promo code
const promo = await bookingAPI.applyPromoCode('SUMMER25', 100, 'user-123');
```

---

## 🐛 Troubleshooting

### "Stripe is not defined"

Make sure `VITE_STRIPE_PUBLISHABLE_KEY` is set in Replit Secrets.

### "Failed to process cart"

Check backend logs in Replit. Verify:
- Backend is running
- Database tables exist
- Stripe keys are configured

### Payment not confirming

Check Stripe webhook is configured (not needed in test mode, but needed in production).

### TypeScript errors

Make sure you have the right imports:

```tsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
```

---

## 🚢 Production Checklist

Before going live:

- [ ] Switch to live Stripe keys (`pk_live_...`, `sk_live_...`)
- [ ] Set up Stripe webhooks at `https://your-domain.com/api/bookings/webhooks/stripe`
- [ ] Configure webhook secret in environment
- [ ] Test with real payment methods
- [ ] Enable 3D Secure authentication
- [ ] Set up email confirmations
- [ ] Add receipt generation
- [ ] Configure refund policies
- [ ] Test all error scenarios
- [ ] Add analytics tracking

---

## 📚 Next Steps

1. **Test the flow** with test cards
2. **Customize styling** to match your brand
3. **Add email notifications** for confirmations
4. **Build provider dashboard** to manage bookings
5. **Add booking history** page for users
6. **Implement cancellation** flow with refunds
7. **Add availability calendar** to search/browse

---

## 🎉 You're Done!

Your booking system is ready to go! Users can now:
- ✅ Review their cart
- ✅ Pay with Stripe
- ✅ Get instant confirmations
- ✅ Receive booking codes

Need help? Check the component source code or backend API docs.
