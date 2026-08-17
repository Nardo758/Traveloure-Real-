---
name: Load-testing baseline & constraints
description: How to load-test this app safely and what the Aug 2026 dev-container baseline showed
---

**Constraints**
- STRIPE_SECRET_KEY is **live-mode** — never load-drive any endpoint that reaches `stripe.paymentIntents.create` (`POST /api/checkout` path). Verify the double-submit guard at the DB layer instead: the real concurrency guard is the unique partial index `service_bookings_idempotency_key_idx` (idempotency_key WHERE NOT NULL), not Stripe.
- `generalRateLimiter` (100 req/min/IP) has `skip: loopbackSkip` — localhost load tests bypass it, so they measure app capacity; real external clients get throttled at 100/min/IP first.
- App pg pool max=20 (server/db.ts); DB max_connections=112. A test harness with its own pool ≥100 will hit 53300 too_many_connections.
- `service_bookings` inserts need explicit `id` (no DB default) — gen_random_uuid()::varchar.
- Test bookings via `booking_details->>'loadTest'='true'`; cleanup must also decrement `provider_services.bookings_count` (incremented per booking create).

**Why:** re-running scale checks without these guards risks live Stripe objects and dirty counters.

**Baseline (Aug 2026, dev container, vite dev mode)**: /api/services caps ~130 rps; latency grows linearly with concurrency (queueing, zero errors) through 350 concurrent; collapses (stalls, no crash) at ~400 concurrent, instant recovery. POST /api/bookings ~85 rps, exact row counts at 200 concurrent. Admin revenue aggregates read consistently during concurrent writes and match DB recomputation at quiesce.
