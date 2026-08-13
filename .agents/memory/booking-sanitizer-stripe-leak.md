---
name: Booking sanitizer field-name drift
description: Deny-list sanitizers written against assumed field names silently leak; use allow-list projection reconciled with the schema
---
Booking responses to earners (providers/experts) once leaked Stripe PaymentIntent ids because the
sanitizer's strip-list used assumed field names (`paymentIntentId`) while the real columns were
`stripePaymentIntentId`/`stripeDepositIntentId`/`stripeBalanceIntentId`.

**Why:** a deny-list drifts silently — a wrong or newly added column name fails OPEN.

**How to apply:** when auditing responses, grep the actual Drizzle schema columns, never the
sanitizer's own list. Prefer allow-list projection (e.g. the earner booking-fields allow-list in
`server/utils/data-sanitizer.ts`) so new sensitive columns fail closed; `canSeeFullUserData` roles
may still get the raw row.
## Aug 2026 full audit result
All endpoints returning service_bookings rows were enumerated. Leaks found & fixed with EARNER_BOOKING_FIELDS/pickPublicFields: handleOwnerBookingStatus (expert/provider status PATCH, 3 response sites) and the provider-gated visa-status PATCH. All other surfaces are traveler-own, admin-only, or already projected (expert/provider bookings lists, calendar, customers use explicit selects). Note: GET /api/bookings/:id is registered in BOTH server/routes/bookings.ts and server/routes.ts — mount order decides which answers.
