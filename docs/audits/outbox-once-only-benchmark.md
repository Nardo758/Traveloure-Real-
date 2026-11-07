# Outbox once-only lookup: disposable PostgreSQL measurement

## Result

**Measured on November 7, 2026:** the missing-key lookup scanned the entire
queue at every size. At one million rows its client-observed p50/p95 was
**425.376 / 451.536 ms**. All 12 captured plans were `Limit → Seq Scan`.
All **480 concurrent attempts completed without errors or extra rows**.
This supports a separate optimization assessment, not an unapproved index change.

Evidence: [compact measurements and full plans](outbox-once-only-evidence.json).

## Scope and safety

This is development-only evidence, not an optimization or a production capacity
claim. No runtime source, application query, application index, schema declaration,
migration file, send setting, or production data was changed. No application server,
enqueue API, email sender, push sender, or scheduler was invoked. No merge or publish
was performed.

The harness creates its **own empty PostgreSQL cluster**, with a private Unix
socket directory, `listen_addresses=''` (no TCP listener), and explicit connection
fields. It does not read `DATABASE_URL`, `PROD_DATABASE_URL`, or any credentials.
It loads the unchanged table/index definitions from migration 240 and the nullable
expiry column from migration 411 **only into that owned disposable cluster**.
This does not execute the application's migration runner or authorize either
migration anywhere else. The cluster is stopped and its data and socket directories
are deleted when measurement finishes.

## Reproduce

```sh
# PostgreSQL initdb, pg_ctl, and postgres must already be on PATH.
npx tsx scripts/benchmarks/outbox-once-only.ts
```

No packages need installing. The harness writes raw timing samples, full JSON
query plans, source hashes, configuration, invariants, and cleanup confirmation to:

```text
generated-artifacts/outbox-once-only/<unique-run>/measurements.json
```

That directory is excluded from Git and deployment. The compact evidence JSON
beside this report preserves measured distributions and all query plans; the raw
sample file is retained only in the originating workspace. Source hashes and the
raw-file digest identify this particular run.

## What was measured

The source is `enqueueEmailImpl` in
`server/services/email-outbox.service.ts`. For a nonblank dedupe key it performs:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));
-- $1 above is 'email-outbox:' || the dedupe key.
SELECT "id" FROM "email_outbox"
WHERE "email_outbox"."metadata"->>'dedupeKey' = $1 LIMIT $2;
-- Parameters for the lookup are the unprefixed key and 1.
-- If found: return existing id, deliver=false.
-- Otherwise: INSERT a processing row with the key, RETURNING id.
COMMIT;
```

The harness imports only the shared table declaration and database libraries,
**not** the outbox service or application database module. It builds the lookup
using the same Drizzle expression as the runtime and asserts that the source
still contains the expected lock, lookup, and insertion contract. Concurrent
attempts mirror the actual Drizzle persistence transaction, then stop; they never
perform delivery. This is not an end-to-end test of `enqueueEmail`, its gates,
catch/return behavior, or the provider.

### Dataset

- Independent queues of 10,000, 100,000, and 1,000,000 rows, not additive counts.
- Unique synthetic `metadata.dedupeKey` values, JSONB booking/context fields,
  512-byte HTML and 256-byte plain-text bodies; no real personal data.
- 70% sent, 10% pending, 10% failed, and 10% held rows. These are synthetic statuses,
  not evidence of actual delivery.
- Monotonic insertion order. Matching keys are insertion positions 1, N/2, and N;
  the absent key never exists.
- `VACUUM (ANALYZE)` after each seed. Only the existing primary key,
  `(created_at DESC)` index, and partial `(status,retry_after)` index are present.
  No JSONB/dedupe expression index is created, even experimentally.

### Timing and concurrency

- Five warmups per lookup case, then **100 measured samples per case per size**:
  1,200 measured serial lookups in total.
- Case order alternates each iteration to reduce ordering bias.
- Each serial lookup is inside a real transaction after the advisory lock;
  the transaction is rolled back without inserting, so the absent case remains
  absent for every sample.
- `lookupMs` is client-observed elapsed wall time around the actual SELECT.
  `lockMs` is around the lock query. Serial `transactionMs` includes pool checkout,
  BEGIN, lock, lookup and ROLLBACK, not a full enqueue with insertion.
- At each size: five synchronized waves of 16 concurrent attempts for distinct
  fresh keys, plus five waves for pre-existing keys appended to that queue.
  Connections are established beforehand; no connection setup is charged to
  the measured waves.
- Race `transactionMs` includes pool checkout, BEGIN, lock wait, SELECT,
  conditional INSERT, and COMMIT. `lockMs` includes waiting for earlier same-key
  transactions. There are **480 measured concurrent attempts**, 240 per mode.
- Percentiles use nearest rank: sorted sample at `ceil(n*p)-1`; no interpolation.
  These are empirical percentiles, not statistical confidence bounds.
- Plans are separate `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)` executions
  after serial measurement and before concurrency. Their server execution times
  are single observations, not the 100-sample latency distribution.
  **Planner costs are dimensionless estimates, never latency measurements.**

## Interpretation limits

- This is one local PostgreSQL instance on shared development compute, not the
  remote application database, a managed-production replica, or production load.
  Network latency, production resource allocation, queue age/retention,
  contention from other keys, bloat/churn, and actual template sizes can differ.
- The uniform synthetic row shape and 100% key coverage are explicit assumptions,
  not measurements of live inventory. The queue sizes are scale scenarios, not
  observed production queue counts.
- These are warmed-cache measurements. There is no OS cache eviction, restart
  between samples, or cold-storage claim. Shared-buffer reads may still be served
  from the OS page cache.
- PostgreSQL synchronized sequential scans can start partway through a relation.
  “Early”, “middle”, and “late” name insertion positions, **not guaranteed scan
  starting positions or latency order**. Existing race keys are newly appended;
  their timings do not represent arbitrary historical-key matches.
- The lock test uses separate PostgreSQL sessions in one harness process. It
  verifies these finite same-key waves under the default READ COMMITTED isolation,
  not all interleavings, worker crashes, network partitions, other isolation
  levels, or writers that bypass this advisory-lock protocol.
- Once-only persistence is not exactly-once external delivery. No delivery or
  push behavior was tested or changed.

## Run environment and queue sizes

- Measurement window: `2026-11-07T05:55:53.765Z` through
  `2026-11-07T05:58:25.841Z` (initial cluster creation precedes this window).
- PostgreSQL 16.10; Node 20.20.0; Linux x64; eight reported CPUs,
  Intel Xeon Platinum 8581C at 2.30 GHz; approximately 16 GB RAM.
  The observed container limits were eight CPU equivalents and 16 GiB RAM.
- PostgreSQL defaults retained: shared buffers 128 MiB, work memory 4 MiB,
  effective cache size 4 GiB, maximum parallel workers per gather 2, JIT on,
  READ COMMITTED isolation, random page cost 4, sequential page cost 1.
  `fsync`, `synchronous_commit`, and `full_page_writes` were all **on**.
  Private-instance connection limit was 24; benchmark pool size was 16.
- No production configuration or indexes were inspected or inferred.

| Queue rows | Heap bytes | Total relation bytes, including indexes | Mean row bytes | Seed + vacuum/analyze ms |
|---:|---:|---:|---:|---:|
| 10,000 | 11,706,368 | 12,443,648 | 1,087.921 | 718.734 |
| 100,000 | 117,030,912 | 123,551,744 | 1,087.992 | 4,190.349 |
| 1,000,000 | 1,170,292,736 | 1,234,821,120 | 1,087.999 | 41,891.473 |

The source/table-definition SHA-256 hashes are preserved in the evidence JSON.
The workspace-only raw sample file for this run is
`generated-artifacts/outbox-once-only/run-qQOwUA/measurements.json`, SHA-256:

```text
c88d35d9eff925717186c8146dc2a1a61186f786ba6bb3f0d480c06211ffd31b
```

## Measured lookup latency

All values below are **milliseconds measured with the client monotonic clock**,
100 samples per row. They are SELECT-only times after the advisory lock, not
EXPLAIN cost, full request time, or email delivery time.

| Queue rows | Match case | p50 ms | p95 ms |
|---:|---|---:|---:|
| 10,000 | Early insertion | 0.247 | 0.449 |
| 10,000 | Middle insertion | 1.329 | 1.916 |
| 10,000 | Late insertion | 2.440 | 3.428 |
| 10,000 | Absent | 2.359 | 3.393 |
| 100,000 | Early insertion | 1.057 | 12.245 |
| 100,000 | Middle insertion | 9.665 | 13.345 |
| 100,000 | Late insertion | 0.804 | 11.811 |
| 100,000 | Absent | 19.222 | 25.416 |
| 1,000,000 | Early insertion | 0.887 | 215.596 |
| 1,000,000 | Middle insertion | 218.155 | 233.424 |
| 1,000,000 | Late insertion | 0.839 | 214.378 |
| 1,000,000 | Absent | 425.376 | 451.536 |

Absent-key work grew materially with queue size. The jump between 100,000 and
1,000,000 also crosses the instance's shared-buffer capacity, so extrapolating a
single linear per-row constant would be unjustified. Small p50 values for early
or late matches do not remove their substantially larger p95 values.

The evidence JSON additionally preserves min/max, lock p50/p95, and full serial
transaction p50/p95. For context, absent-case serial transactions had p50/p95
of 3.039/4.545 ms, 19.708/25.788 ms, and 425.940/452.084 ms respectively.

## Captured query plans

The generated SQL used in every case was:

```sql
select "id" from "email_outbox"
where "email_outbox"."metadata"->>'dedupeKey' = $1 limit $2
```

Each plan had this shape, without a parallel worker or index scan:

```text
Limit (actual rows: 1 for a match, 0 for absent; loops: 1)
  -> Seq Scan on email_outbox
       Filter: ((metadata ->> 'dedupeKey'::text) = '<measured key>'::text)
```

Below are the actual rows rejected, buffer counts, and the **single measured
server execution time** from each captured plan. Buffer counts are PostgreSQL
8 KiB blocks; “read” means a shared-buffer miss, not necessarily physical disk
access. Planning times and all unabridged fields are in the evidence JSON.

| Queue rows | Case | Rows removed by filter | Shared hit blocks | Shared read blocks | EXPLAIN execution ms |
|---:|---|---:|---:|---:|---:|
| 10,000 | Early | 0 | 1 | 0 | 0.016 |
| 10,000 | Middle | 4,999 | 715 | 0 | 1.685 |
| 10,000 | Late | 9,999 | 1,429 | 0 | 3.171 |
| 10,000 | Absent | 10,000 | 1,429 | 0 | 3.145 |
| 100,000 | Early | 96 | 15 | 0 | 0.036 |
| 100,000 | Middle | 49,999 | 7,143 | 0 | 9.265 |
| 100,000 | Late | 50,047 | 7,150 | 0 | 10.146 |
| 100,000 | Absent | 100,000 | 14,286 | 0 | 18.762 |
| 1,000,000 | Early | 64 | 11 | 0 | 0.037 |
| 1,000,000 | Middle | 499,999 | 3,085 | 68,344 | 213.628 |
| 1,000,000 | Late | 500,031 | 13,237 | 58,197 | 207.535 |
| 1,000,000 | Absent | 1,000,000 | 16,349 | 126,509 | 425.583 |

For clarity, the Limit node's **estimated cost** was approximately 31.57 at all
three sizes, while the underlying full-scan estimated cost grew from 1,579 to
15,786 to 157,857.65. Those figures are **not milliseconds**. In particular,
the nearly unchanged Limit cost does not describe the measured cost of proving
a key absent: the executor must examine every row despite `LIMIT 1`.

## Concurrent same-key enqueue results

Each row aggregates five waves of 16 calls, with a different key per wave.
“Fresh” begins with no matching row. “Existing” has one preinserted row for each
key, outside the measured wave. Every attempt returned that wave's single id.

| Queue rows | Mode | Attempts | Transaction p50 / p95 ms | Lock p50 / p95 ms | SELECT p50 / p95 ms | Rows inserted by waves | Extra duplicate rows | Errors |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 10,000 | Fresh | 80 | 15.391 / 31.464 | 13.121 / 25.137 | 0.475 / 2.159 | 5 | 0 | 0 |
| 10,000 | Existing | 80 | 7.663 / 19.446 | 5.911 / 16.339 | 0.418 / 0.832 | 0 | 0 | 0 |
| 100,000 | Fresh | 80 | 29.601 / 38.868 | 27.831 / 37.463 | 0.359 / 18.232 | 5 | 0 | 0 |
| 100,000 | Existing | 80 | 6.375 / 12.162 | 4.597 / 8.578 | 0.309 / 0.486 | 0 | 0 | 0 |
| 1,000,000 | Fresh | 80 | 439.001 / 497.200 | 435.292 / 495.225 | 0.353 / 408.208 | 5 | 0 | 0 |
| 1,000,000 | Existing | 80 | 5.660 / 11.249 | 4.227 / 8.137 | 0.306 / 0.448 | 0 | 0 | 0 |

All 30 measured waves ended with exactly one row for their key; every wave had
exactly one distinct returned id. Fresh waves had one winning insert and 15
suppressed duplicates each; existing waves had zero inserts and 16 suppressed
duplicates each. Across 480 measured attempts this is **15 new inserts, 465
reuses, zero extra duplicate rows, and zero errors**. The 15 existing-key setup
inserts are not part of those 480 attempts. Final queue counts were exactly
10,010, 100,010, and 1,000,010.

The fresh million-row waves show why SELECT-only distributions can hide the
user-visible delay: most contenders perform a cheap matching lookup **after
waiting approximately 435–495 ms for the advisory lock**. The winner first pays
for the missing-key scan. Phase percentiles are calculated separately and must
not be added to reconstruct transaction percentiles.

## Verification and disposition

The benchmark exited successfully with all assertions enabled:

- 1,200 measured serial lookups returned the expected presence/absence.
- 480 concurrent attempts, with per-wave row count, winning-insert count, and
  returned-id checks.
- Three exact final queue-count checks.
- Query plans and measured wall-clock distributions saved separately.
- Disposable PostgreSQL stopped; owned data and socket directories removed.
- Runtime source and migration hashes remained unchanged.

No full application/UI test or app restart was needed: no application behavior
or workflow was modified, and importing the live service would add unnecessary
delivery risk. This measurement does not authorize a runtime or index change.
Any optimization proposal needs separate approval, including its write/storage
cost and rollback plan; failure-recovery concurrency coverage is also separate
from these successful-wave measurements.
