---
name: Platform Stripe webhook verified
description: End-to-end operational status of the live bookings Stripe webhook.
---

The live bookings Stripe webhook has been verified end to end with an authorized low-value Stripe-hosted purchase carrying explicit synthetic no-op metadata. Stripe received HTTP 200 on the first delivery, and production recorded exactly one unprocessed webhook event with no commerce-table writes or handler errors. The charge was fully refunded and temporary catalog objects were archived.

**Why:** Earlier signature failures could not distinguish a stale workspace environment from a production secret mismatch. A real Stripe-signed delivery after secret rotation and republish proves production alignment.

**How to apply:** Treat the live bookings webhook as active and signature-verified. For future checks, identify the exact Stripe event ID, require one durable row, and verify metadata-specific handlers do not run for synthetic no-op events.