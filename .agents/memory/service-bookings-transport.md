---
name: serviceBookings transport inserts
description: Transport bookings reuse the service_bookings table; three columns were made nullable and column-name mismatches in stripe.service.ts were fixed.
---

## Rule

When inserting into `serviceBookings` for transport bookings:
- Use `travelerId: userId` (NOT `userId`)
- Use `providerId: option.providerId` (NOT `serviceProviderId`)
- Do NOT pass `serviceId` (no associated service for transport)
- Do NOT pass `tripId` from `itineraryComparisons.id` — that is a comparison ID not a trips FK

The three columns `serviceId`, `travelerId`, `providerId` are now nullable in the schema (`.notNull()` removed) and in the DB (`ALTER TABLE service_bookings ALTER COLUMN ... DROP NOT NULL` applied 2026-06-08).

**Why:** `createTransportBookingCheckout` in `stripe.service.ts` originally passed wrong JS property names (`userId`, `serviceProviderId`) that Drizzle silently ignored (via `as any`), leaving all three NOT NULL columns as null → DB constraint violation. Also `tripId` was passed as `comparison.id` (not a valid `trips.id`) triggering an FK violation.

**How to apply:** Any future code inserting transport records into `service_bookings` should follow the corrected insert shape in `stripe.service.ts` (post laughing-bardeen merge, 2026-06-08).
