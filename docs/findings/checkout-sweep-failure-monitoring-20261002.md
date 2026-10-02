# Checkout sweep false-green fix and connection investigation

## Scope and release status

Independent branch: `fix/checkout-sweep-failure-reporting-20261002`, cut from fetched
`origin/main`. No email-fix branch or automation-registry code/PR was modified. The
previous local email-merge watcher was stopped to prevent it making branch updates
during this separate task; existing GitHub protection settings were not changed.

**Implemented and locally verified; not confirmed live.** Review, merge and operator
publishing are still required. No production job was POSTed and no production data,
schema, deployment setting, pool size or connection timeout was changed.

## Fix

Both unauthorized and stale-authorized checkout candidate-query failures now return
an explicit, nonempty `error` alongside their counters, matching the itinerary sweep
pattern. Even an empty thrown message cannot become a false success.

The combined cron endpoint collects both scan results, surfaces either error through
the existing `runJob` failure predicate, and returns **HTTP 500 / `ok=false`**.
`recordJobSuccess` is not called for a failed scan. An actual completed empty scan
continues to return HTTP 200 and write exactly one success heartbeat.

Candidate failure logs now include the local pool's total/idle/waiting counts, alongside
the existing driver error/cause, to support subsequent live timeout diagnosis.

This deliberately does not change row-level reconciliation/quarantine policy, payment
or email behavior, retry policy, heartbeat cadence or schema. Like the itinerary
reference, a caught-and-returned error does not trigger the background runner's
throw-based retry mechanism.

## Simulated failure verification

Command:

```sh
npx vitest run --config vitest.checkout-sweep.config.ts
```

**11 passed, zero failures**, including:

- Either real sweep exposes its simulated candidate-query error.
- Either scan failing makes the actual authenticated cron HTTP route return 500.
- No heartbeat persistence write occurs on these failures.
- A missing checkout heartbeat stays `never_succeeded`; health is unhealthy.
- A stale checkout heartbeat's timestamp/result are unchanged; it stays stale.
- Both failed scans retain diagnostics; empty thrown messages still fail.
- Completed zero-candidate scans succeed; a failed pass followed by recovery stamps
  exactly once on the subsequent completed pass.

The tests exercise production sweep functions, cron wrapper, heartbeat writer and
health computation through a real local HTTP server. Only persistence and unrelated
Stripe initialization are simulated. All other roster jobs are fresh in the fixture,
so unhealthy results are attributable to checkout, not another job. The tests also
pass without database or Stripe credentials. There is no production fault-injection
flag or endpoint.

Existing background runner regression command:

```sh
npx tsx --test server/services/__tests__/background-job-runner.test.ts
```

**4 passed, zero failures** (transient classification/retry, nontransient failure and
overlap handling). A dedicated secret-free GitHub workflow runs the new HTTP regression.

The repository-wide compiler check did not complete within its 120-second budget;
it must not be described as a passing typecheck. Targeted test transformation passed.

## Lower-priority connection-timeout investigation

### Distinguishing the failure phase

The installed `pg-pool` has two different timeout paths:

- Waiting for a free local pool slot: `timeout exceeded when trying to connect`.
- Establishing a **new** client connection: `Connection terminated due to connection timeout`.

The production failures inspected use the second message. The configured five-second
new-connection timer expires before connection establishment completes. This is not
evidence of an established SQL statement timing out or of the local pool's wait queue
being full.

In the 08:45–08:50 UTC production log window, failures occur at 08:47:25.684/25.987,
followed by a new established connection at 08:47:28.682 and more successful
connections at 08:48:03.127 and 08:49:11.985. These are transient establishment
failures followed by recovery, not a demonstrated sustained database outage.

### Read-only primary evidence

Three sequential, single-client samples against the configured production connection
used read-only transactions and a three-second statement limit:

| Sample | Connect | Read query |
|---|---:|---:|
| 1 | 236 ms | 77 ms |
| 2 | 200 ms | 65 ms |
| 3 | 182 ms | 62 ms |

The server identified itself as **primary** (`pg_is_in_recovery=false`), with
`max_connections=450`, four reserved connections, four connected clients and one active
client at each sample. Its uptime was approximately 280–281 seconds. This rules out
sustained server connection-limit exhaustion **at sampling time**, not during the
historical incidents.

Primary and the managed production read replica independently matched aggregate
heartbeat/bookings data: 13 heartbeat rows, latest cron success
`2026-10-02T10:15:29.085Z`, seven booking rows. Only aggregates were read; no customer
records, connection strings or credentials were displayed or retained.

The production SQL callback itself uses a read replica. Its connection count/startup
statistics are not primary diagnostics; the primary samples above were collected
separately. The short primary uptime and recovery after timeout are consistent with
compute wake-up/restart or transient upstream/network establishment delay. They do
**not** distinguish those causes definitively, and upstream pooler limits also remain
possible. No pool-pressure-at-error telemetry existed for the historical failures.

**Root cause remains unconfirmed.** The new failure-time pool counters must be observed
after this monitoring fix is published, alongside provider restart/wake/network
telemetry, before choosing a pool-size or timeout adjustment. Increasing pool size
without evidence could worsen pressure and would not address the observed new-client
handshake timeout.

## Live verification gate

Production `/internal/jobs/health` was deliberately **not** rechecked or represented
as trustworthy in this task before the monitoring repair is confirmed live.

After reviewed code is published, verify its deployed build contains this fix, confirm
a real completed checkout cron pass and its heartbeat, finish the timeout diagnosis,
and then recheck the authenticated health endpoint. Local simulated failure proof is
not production deployment proof.

The endpoint still measures **last cron-driven success**, with its existing staleness
grace period. A failed pass never refreshes success, but a prior recent successful
heartbeat can remain `ok` until its grace period expires. This patch does not turn
last-success monitoring into an immediate last-attempt-failure monitor.