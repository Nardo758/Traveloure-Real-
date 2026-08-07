---
name: Booking confirmation surfacing
description: Where the cart rail's traveler-facing confirmation legs live, and the redirect_status trust rule.
---
- The traveler-facing confirmation number is `service_bookings.tracking_number` (TRV-YYYYMM-NNNNN). The legacy `bookings` rail has a separate `confirmation_code`; cart-rail rows never carry it — any UI reading `confirmationCode` must fall back to `trackingNumber`.
- Cart rail's traveler confirmation email is sent from `promotePaidCheckout` for rows THAT call promoted (atomic flip = exactly one winner across webhook / confirm-payment fallback / drift), so a double signal cannot double-send. Fire-and-forget: email failure must never fail the money leg.
- Both non-3DS and 3DS success paths land on `/booking/confirmation`; the page fetches the traveler's bookings by `stripePaymentIntentId` to display TRV numbers.
- **Never trust `redirect_status=succeeded`** — it's a client-forgeable URL param. The page must verify via `stripe.retrievePaymentIntent(clientSecret)` (and scrub the client secret from the address bar with replaceState). Without a client secret, render a can't-verify state, not success.
- **Why:** a forged URL previously produced a false "Booking Confirmed!" screen; caught in code review Aug 2026.
