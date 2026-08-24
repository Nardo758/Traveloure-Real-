---
name: Load-testing baseline & constraints
description: How to load-test this app safely and what the Aug 2026 dev-container baseline showed
---

**Constraints**
- STRIPE_SECRET_KEY is **live-mode**, BUT an /api/checkout re-drive (Aug 2026) produced a PI that only existed under STRIPE_SECRET_KEY_TEST — the running checkout path uses a test-mode key at runtime. Verify which key answered before assuming a live object was created; still never load-drive any endpoint that reaches `stripe.paymentIntents.create` (`POST /api/checkout` path). Verify the double-submit guard at the DB layer instead: the real concurrency guard is the unique partial index `service_bookings_idempotency_key_idx` (idempotency_key WHERE NOT NULL), not Stripe.
- `generalRateLimiter` (100 req/min/IP) has `skip: loopbackSkip` — localhost load tests bypass it, so they measure app capacity; real external clients get throttled at 100/min/IP first.
- App pg pool max=20 (server/db.ts); DB max_connections=112. A test harness with its own pool ≥100 will hit 53300 too_many_connections.
- `service_bookings` inserts need explicit `id` (no DB default) — gen_random_uuid()::varchar.
- Test bookings via `booking_details->>'loadTest'='true'`; cleanup must also decrement `provider_services.bookings_count` (incremented per booking create).

**Why:** re-running scale checks without these guards risks live Stripe objects and dirty counters.

**Baseline (Aug 2026, dev container, vite dev mode)**: /api/services caps ~130 rps; latency grows linearly with concurrency (queueing, zero errors) through 350 concurrent; collapses (stalls, no crash) at ~400 concurrent, instant recovery. POST /api/bookings ~85 rps, exact row counts at 200 concurrent. Admin revenue aggregates read consistently during concurrent writes and match DB recomputation at quiesce.

**Bottleneck identified (Tier 1 audit, Aug 2026):** the ~400-concurrent "stall" is soft event-loop queuing — DB pool at 0% utilization and 0 active backends throughout; /health latency (cheap endpoint) balloons to 3-4s exactly tracking inflight count; zero 5xx; instant recovery. Cause is single Node process CPU (vite dev mode). Plateau at 320 concurrent: 0 errors, p99 ~3.9s. Cheap fix = production build + autoscale deploy (multi-instance), not pool tuning. /health "memory unhealthy" at idle is a false alarm (elastic heapTotal, see task on health check).
**DR baseline:** pg_dump -Fc of dev DB (17MB) = 7s; pg_restore into scratch DB = 23s, 0 errors, row counts exact. Killing all app DB connections mid-burst crashed the server once but was not reproducible ×3 (pool error handler absorbs it).
