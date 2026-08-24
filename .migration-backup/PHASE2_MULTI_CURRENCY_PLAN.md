# Phase 2: Multi-Currency Implementation Plan

## Current State
- **Frontend:** Cart has currency selector (USD, EUR, GBP, JPY, AUD, SGD) with exchange rates from Frankfurter API. Prices are DISPLAYED in selected currency but CHARGED in USD.
- **Backend:** `/api/exchange-rates` fetches rates, caches 1 hour. All Stripe calls hardcode `currency: 'usd'`.
- **Database:** `users` table has NO `preferredCurrency`. `eaClientRelationships` has it but that's for EA clients only. `serviceBookings` and `paymentIntents` have `currency` columns but they're always set to USD.

## Goal
Make the selected currency actually work end-to-end: user selects currency → cart shows converted prices → checkout charges in that currency → booking records the currency.

## Implementation Steps

### Step 1: Database Migration
Add `preferredCurrency` to `users` table with default "USD".

**Migration file:** `server/migrations/077_user_preferred_currency.sql`
```sql
ALTER TABLE users ADD COLUMN preferred_currency VARCHAR(3) DEFAULT 'USD';
```

### Step 2: Update `users` schema
Add `preferredCurrency` to `shared/models/auth.ts` `users` table definition.

### Step 3: User preference endpoint
Add `PATCH /api/user/currency` to save user's preferred currency.

### Step 4: Update checkout API
- Accept `currency` in `POST /api/checkout` body
- Pass currency to `stripePaymentService.createPaymentIntent()`
- Save currency on `serviceBookings` records

### Step 5: Update Stripe payment service
- `createPaymentIntent()` accepts `currency` parameter (default 'usd')
- Use the currency when creating Stripe PaymentIntent
- Store currency in `paymentIntents` table

### Step 6: Update transport booking Stripe service
- `createTransportBookingCheckout()` accepts currency
- Pass currency to Stripe checkout session

### Step 7: Update credit purchase
- `POST /api/credits/purchase` accepts currency
- Pass currency to Stripe checkout session

### Step 8: Frontend updates
- Cart page: send `displayCurrency` to `/api/checkout`
- Save selected currency to user profile via `PATCH /api/user/currency`
- Load user's preferred currency on login

### Step 9: E2E spec update
- Add currency selection test to journey-1
- Verify booking records show the correct currency

## Out of Scope (deferred)
- Payout currency conversion (expert/provider earnings) — Stripe Connect handles this
- Exchange rate locking at checkout time — use Stripe's rate
- Currency conversion for refunds — keep simple for now
- Multi-currency wallets/credits — keep in USD for now

## Testing Strategy
1. Build verification: `npm run build` clean
2. Type check: `tsc --noEmit` no new errors
3. E2E: Journey 1A with EUR selected → verify charge in EUR, booking shows EUR

## Success Criteria
- [ ] User can select currency in cart
- [ ] Checkout charges in selected currency (visible in Stripe dashboard)
- [ ] Booking record stores the correct currency
- [ ] User preference persists across sessions
- [ ] Exchange rate API still works (display conversion)
- [ ] USD fallback when selected currency is not supported
- [ ] No new tsc errors
- [ ] Build succeeds
