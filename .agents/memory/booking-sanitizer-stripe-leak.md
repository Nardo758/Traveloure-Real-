---
name: Booking sanitizer Stripe-field leak
description: sanitizeBookingForExpert strips the wrong payment field names, leaking Stripe intent IDs to providers/experts
---
`sanitizeBookingForExpert` (server/utils/data-sanitizer.ts) strips `paymentIntentId`/`stripeSessionId`,
but the real service_bookings columns are `stripePaymentIntentId`, `stripeDepositIntentId`,
`stripeBalanceIntentId`. So GET /api/provider/bookings (and the expert equivalent) leaks the full
Stripe PaymentIntent ID to the earner. Confirmed live Aug 2026: response carried `pi_...`.

**Why:** strip-list was written against assumed field names, never reconciled with the Drizzle schema.
Traveler PII sanitization (sanitizeUserForRole) is correct — only this booking-level payment ref leaks.

**Status:** FIXED Aug 13 2026 — sanitizeBookingForExpert now projects through the
`EARNER_BOOKING_FIELDS` allow-list (stripe*IntentId + idempotencyKey excluded by construction);
canSeeFull roles still get the raw row.

**How to apply:** when auditing booking responses, grep the actual schema columns, not the sanitizer's
list. Prefer an allow-list projection over a deny-list so new sensitive columns fail closed. SQLi is
safe (Drizzle params) and stored-XSS is inert (React escapes; only DOMPurify'd dangerouslySetInnerHTML).

## Aug 2026 full audit result
All endpoints returning service_bookings rows were enumerated. Leaks found & fixed with EARNER_BOOKING_FIELDS/pickPublicFields: handleOwnerBookingStatus (expert/provider status PATCH, 3 response sites) and the provider-gated visa-status PATCH. All other surfaces are traveler-own, admin-only, or already projected (expert/provider bookings lists, calendar, customers use explicit selects). Note: GET /api/bookings/:id is registered in BOTH server/routes/bookings.ts and server/routes.ts — mount order decides which answers.
