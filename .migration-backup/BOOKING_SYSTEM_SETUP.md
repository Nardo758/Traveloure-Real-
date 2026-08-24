# Traveloure Booking System - Setup Guide

## ✅ What Was Added

### TypeScript Services (server/services/)
- **booking.service.ts** - Main booking orchestrator
- **stripe-payment.service.ts** - Stripe payment intents & webhooks
- **availability.service.ts** - Real-time inventory management
- **pricing.service.ts** - Dynamic pricing & fee calculations
- **affiliate.service.ts** - Affiliate link generation (TwelveGo, Viator, etc.)

### API Routes (server/routes/bookings.ts)
- `POST /api/bookings/process-cart` - Process cart items
- `POST /api/bookings/confirm-payment` - Confirm after payment
- `GET /api/bookings/availability/:providerId` - Check availability
- `GET /api/bookings/availability-calendar/:providerId` - Get calendar
- `POST /api/bookings/estimate-cost` - Price estimates
- `POST /api/bookings/apply-promo` - Promo code validation
- `POST /api/bookings/webhooks/stripe` - Stripe webhooks
- `POST /api/bookings/refund` - Create refunds

### Dependencies Added
- `stripe` (v18.5.0) - Payment processing

---

## 🚀 Quick Start on Replit

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Add Environment Variables

In Replit Secrets (Tools → Secrets) or `.env`:

```bash
# Stripe (Required)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# TwelveGo Affiliate (Optional - already set in your .replit)
TWELVEGO_AFFILIATE_ID=13805109

# Other Affiliates (Optional)
VIATOR_AFFILIATE_ID=
BOOKING_AFFILIATE_ID=
GYG_AFFILIATE_ID=
```

### Step 3: Run Database Migrations

The services expect these tables to exist:

```sql
-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id TEXT,
  provider_id TEXT,
  booking_type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT,
  booking_date TEXT,
  booking_time TEXT,
  travelers INTEGER DEFAULT 1,
  service_amount REAL NOT NULL,
  platform_fee REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  provider_payout REAL,
  payment_method TEXT,
  payment_status TEXT,
  deposit_amount REAL,
  balance_amount REAL,
  deposit_paid INTEGER DEFAULT 0,
  balance_paid INTEGER DEFAULT 0,
  confirmed_at TEXT,
  confirmation_code TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  refunded_at TEXT
);

-- Payment intents table
CREATE TABLE IF NOT EXISTS payment_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  is_deposit INTEGER DEFAULT 0,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Booking requests table
CREATE TABLE IF NOT EXISTS booking_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  provider_id TEXT,
  trip_id TEXT,
  status TEXT NOT NULL,
  requested_date TEXT,
  requested_time TEXT,
  travelers INTEGER DEFAULT 1,
  title TEXT,
  item_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

-- Capacity reservations table
CREATE TABLE IF NOT EXISTS capacity_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT,
  stripe_refund_id TEXT,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Service providers table (if not exists)
CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,
  capacity_per_day INTEGER DEFAULT 10,
  instant_booking_enabled INTEGER DEFAULT 0,
  base_price REAL DEFAULT 0,
  price_per_person REAL DEFAULT 0
);

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  max_discount REAL,
  active INTEGER DEFAULT 1,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  expires_at TEXT
);

-- Promo code usage table
CREATE TABLE IF NOT EXISTS promo_code_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promo_code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  booking_id TEXT,
  used_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Blocked dates table
CREATE TABLE IF NOT EXISTS blocked_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate tracking tables
CREATE TABLE IF NOT EXISTS affiliate_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner TEXT NOT NULL,
  item_type TEXT,
  destination TEXT,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  generated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  user_id TEXT,
  clicked_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  commission REAL NOT NULL,
  converted_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

You can either:
- Add these to your existing migration file
- Run them directly in Replit Database console
- Use the database migrations from `database-migrations.sql` and `database-migrations-part2.sql`

### Step 4: Test the API

Start the server:
```bash
npm run dev
```

Test endpoints:
```bash
# Check availability
curl http://localhost:5000/api/bookings/availability/PROVIDER_ID?date=2026-02-15&time=10:00

# Get availability calendar
curl http://localhost:5000/api/bookings/availability-calendar/PROVIDER_ID?startDate=2026-02-01&endDate=2026-02-28
```

---

## 🔄 Integration with Frontend

### Update API calls in your frontend:

```typescript
// src/lib/api.ts or wherever you handle API calls
const API_BASE = process.env.VITE_API_URL || 'http://localhost:5000';

export const bookingAPI = {
  processCart: async (userId: string, cartItems: any[], paymentMethod: 'full' | 'deposit') => {
    const response = await fetch(`${API_BASE}/api/bookings/process-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, cartItems, paymentMethod }),
    });
    return response.json();
  },

  checkAvailability: async (providerId: string, date: string, time: string) => {
    const response = await fetch(
      `${API_BASE}/api/bookings/availability/${providerId}?date=${date}&time=${time}`
    );
    return response.json();
  },

  estimateCost: async (tripItems: any[]) => {
    const response = await fetch(`${API_BASE}/api/bookings/estimate-cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripItems }),
    });
    return response.json();
  },
};
```

---

## 📦 How It Works

### 1. User adds items to cart
Items can be:
- **Instant Booking** - Confirmed immediately after payment
- **Request Booking** - Requires provider approval
- **External Link** - Redirect to affiliate partner

### 2. Process Cart
```typescript
const result = await bookingAPI.processCart(userId, cartItems, 'full');
// Returns:
// - instantBookings: confirmed bookings
// - pendingRequests: awaiting provider
// - externalLinks: affiliate URLs
// - paymentIntent: Stripe client secret
```

### 3. Payment Flow
```typescript
// Use Stripe.js on frontend
const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
const { paymentIntent } = result;

const { error } = await stripe.confirmCardPayment(paymentIntent.clientSecret, {
  payment_method: {
    card: cardElement,
  },
});
```

### 4. Webhook Confirms Booking
Stripe sends webhook → `POST /api/bookings/webhooks/stripe` → Bookings confirmed

---

## 🎯 Next Steps

1. **Set up Stripe Webhooks** (when deploying):
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-replit-url.repl.co/api/bookings/webhooks/stripe`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   - Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

2. **Connect Frontend PlanningModal**:
   - Update `PlanningModal.jsx` to use these APIs
   - Wire up cart → checkout → payment flow

3. **Test Complete Flow**:
   - Add items to cart
   - Process cart
   - Complete Stripe payment (use test card: 4242 4242 4242 4242)
   - Verify booking confirmed

4. **Add Email Notifications** (optional):
   - Booking confirmations
   - Provider notifications
   - Payment receipts

---

## 🧪 Testing with Stripe Test Mode

Use these test cards:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Any future expiry date, any CVC.

---

## 📚 Files to Review

- `server/services/booking.service.ts` - Main booking logic
- `server/services/stripe-payment.service.ts` - Payment handling
- `server/routes/bookings.ts` - API endpoints
- `traveloure-booking-flow-spec.md` - Detailed flow documentation
- `traveloure-stripe-integration-guide.md` - Stripe setup guide

---

## 🐛 Troubleshooting

**Stripe webhook failing?**
- Verify `STRIPE_WEBHOOK_SECRET` is set
- Check Replit logs for errors
- Test with `stripe listen --forward-to localhost:5000/api/bookings/webhooks/stripe`

**Database errors?**
- Ensure all migration tables are created
- Check Replit Database console for errors

**Module not found errors?**
- Run `npm install` again
- Check that all services are in `server/services/`

---

Need help? Check the docs or ping the team! 🚀
