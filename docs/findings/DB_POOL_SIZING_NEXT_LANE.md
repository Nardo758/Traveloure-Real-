# DB Pool Sizing & Connect-Timeout — filed as the follow-on lane (not backlog)

**Origin:** scheduler-reliability lane (#1712) Phase 0 root-cause analysis · **as-of** `c757678c`
**Status:** FILED — the direct cause of every #1712 symptom, but a real root-cause lane that must
not be tuned blind inside the reliability lane. Ratified by the decision-maker (decision #6).

## What this lane is

The four #1712 production sightings (earnings-release timeout, auto-complete DB error, health-check
500 bursts, seed connection timeout) all trace to ONE thing: the app runs the entire request path
**and** all background work through a single connection pool —

- `server/db.ts:13` — `new Pool({ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })`.
- No dedicated background pool. `checkDatabase()` (`server/infrastructure/health.ts:29`) probes this
  same pool with `pool.query("SELECT 1")`, so when it saturates the health endpoint 500s in bursts.

The scheduler-reliability lane addressed the *trigger* (external cron replaces unreliable in-process
timers) and the *boot herd* (a ≥60s floor + jitter on every timer's first pass, so nothing fires
into the boot window). It deliberately did **not** resize or retune the pool — that is this lane.

## What this lane should decide (with data, not guesses)

1. **A dedicated background pool** (small, e.g. 3–5 connections) so scheduled/background work can
   never starve the request path, vs. raising `max` on the shared pool. Measure real concurrent
   connection use at boot and under load first.
2. **`connectionTimeoutMillis`** — 5s surfaces contention as "timeout exceeded when trying to
   connect". Whether to raise it (wait longer) or keep it short (fail fast + retry) depends on the
   provider's real connection ceiling.
3. **The provider ceiling** — Replit/Neon (or whatever backs `DATABASE_URL`) has its own max
   connections; `max: 20` may already be near or over it under multiple instances. This needs the
   actual limit, not a guess.

## Already pulled INTO the reliability lane (done, not deferred)

The two schedulers that bypassed `runBackgroundJob`'s pool-protection concurrency cap
(`MAX_CONCURRENT_BACKGROUND_JOBS`) were a one-line-each, behavior-preserving fix and were closed in
the reliability lane:

- `server/services/fx-rate-refresh.service.ts` — `refreshOnce()` now runs through
  `runBackgroundJob("fx-rate-refresh", …)`.
- `server/services/stripe-connect-reminder.service.ts` — `runReminders()` now runs through
  `runBackgroundJob("stripe-connect-reminder", …)`.

**Correction to Phase 0:** the audit listed a third bypasser, `travelpulse-demand-refresh`. On
re-read it was already wrapped in `runBackgroundJob` on both its first-run and interval paths
(`travelpulse-scheduler.service.ts`), so there was no third to fix — two, not three. No other started
scheduler bypasses the cap (verified by grep: every `*-scheduler.service.ts` that touches the DB on a
timer routes through `runBackgroundJob`).

## Evidence correction — production boot window

The 12 early production health-check failures were an **Autoscale readiness race**, not pool
evidence and not scheduler-related. Two probes were refused and ten returned HTTP 500 between
`23:06:42` and `23:06:47` UTC, before Express bound at `23:06:57` UTC. The health probes were
therefore racing the container start/readiness path.

The actual post-start pool evidence is **two** connection-timeout events: `email-outbox` at
`23:08:37` UTC and a second background timeout at `23:14:03` UTC. Size and investigate this lane
against those two events, not the 12 pre-bind health failures.

**Separate deploy-config finding:** the Autoscale health probe reaches the container roughly
15 seconds before Express binds. This belongs to the readiness path/probe start-delay configuration,
not to application code or scheduler tuning.
