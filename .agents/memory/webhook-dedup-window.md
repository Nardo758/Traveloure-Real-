---
name: Webhook dedup window & revenue race
description: Stripe webhook dedup only blocks after processed=true; concurrent duplicates both run business logic
---
The /api/webhooks/stripe dedup (webhook_events) skips only when an earlier delivery has already finished (processed=true). Two copies arriving ~150ms apart BOTH execute the handler; safety currently rests on per-handler idempotency (checkout promotion matches 0 rows; revenue guard hasPaymentIntentRevenue is read-then-write with NO unique index on platform_revenue paymentIntentId — double-insert possible under true concurrency).

**Why:** proven live in the Tier 1 audit (Aug 2026) with self-signed events (sign with STRIPE_CONNECT_WEBHOOK_SECRET — the /stripe route verifies against that secret, not STRIPE_WEBHOOK_SECRET).
**How to apply:** any new webhook side-effect must be idempotent at the DB layer (unique index / ON CONFLICT), never a read-then-check. Contradictory signals (failed then succeeded) correctly raise a reconciliation exception and never resurrect a failed booking.
