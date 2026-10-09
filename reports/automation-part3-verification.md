# Part 3 — development-only commerce email sweep

## Status and release boundary

The ten requested Part 3 development checks passed. The complete commerce email
automation is **not production-certified**: quiet hours, unsubscribe/consent, paid
checks on every rail, cancel-at-send, final content and real delivered-email proof
remain deferred to the approved later parts.

**Do not release the sweep before Parts 4 and 6 are closed and separate founder
release approval is given.** Part 4 has not started.

Verified runtime/test source: `0e6f3207b` on
`work/automation-part3-commerce-sweep`, based on the completed Part 2 work branch.
No main reset, merge, PR, publish, production write, secret change, fee change,
payment-code change or feature-flag change was made.

## Reuse check

- Existing messaging automation registry: extended with one node, not copied.
- Existing internal-job authentication, background-job runner and `runJob`: reused.
- Existing `job_heartbeats`: reused; only commerce opts into failure recording.
- Existing `email_outbox`: reused; new helper queues pending rows and never invokes
  the existing immediate-send helper.
- Existing `scripts/ci/post-internal-jobs.sh` backstops bucket: extended once.
- Existing `jobs-cron.yml`: already has one `*/15 * * * *` schedule and calls the
  same script. No second scheduler, interval, timer or workflow was created.
- Existing registry inspection, cron-roster and test-reachability checks passed.

The sweep SELECTs account/cart conditions and INSERTs pending outbox rows. It does
not update cart contents, clock, snapshots, prices, availability or payment state.
Heartbeat persistence is the separately approved operational write.

## Multiple-cart check and final key

The schema has `cart_items.user_id`, `guest_session_id` and `experience_slug`;
there is no separate persisted cart table/ID. `storage.getCartItems(userId,
experienceSlug)` supports experience-scoped views and includes shared unscoped
items. A traveler can retain items under more than one experience scope.

The sweep groups stored rows by account and their actual stored experience scope.
It does not copy shared unscoped rows into every named scope. Its **derived logical
scope ID**, not a new database column, is:

- NULL scope: `unscoped`.
- Named scope: `experience:{base64url(UTF-8 experience_slug)}`.

Final key:

`cart-reminder-1h:user:{user_id}:cart:{scope_id}:{sequence_id}`

Signed-in rows with a lingering guest-session value remain grouped by account/scope,
not split into extra guest carts. Guest-only groups have no account recipient and
are skipped. The test uses **the same sequence ID in two different scopes**, proving
that the scope portion prevents a real collision rather than merely relying on two
different sequence IDs. A resumed scope with a new sequence queues a new row.

## Queue-only and default-off safety

Execution requires test/development mode, the retained verification runner's
existing `MESSAGING_VERIFICATION_SCHEMA` opt-in, and an exact database
`current_schema()` match to that disposable schema. The retained runner sets its
search path to that schema alone.

Ordinary workspace execution and production return an explicit disabled skip;
they do not query candidates or advance the heartbeat. The queue helper also
refuses production/non-isolated configuration and non-QA recipients, and its
INSERT is conditioned on the schema match. Only synthetic `traveloure-qa.test`
accounts are eligible in verification. No inbox setting was read or printed.

Pending verification rows carry `verificationOnly: true` and the Part 4/6 release
restriction. They live only inside disposable schemas, inaccessible to the running
application's public-schema dispatcher. Both final loops recorded **zero delivery
calls**. No provider receipt or real delivered email is claimed.

The development database's existing unique index was confirmed read-only:

```sql
CREATE UNIQUE INDEX email_outbox_commerce_key
ON email_outbox ((metadata ->> 'commerceKey'))
WHERE metadata ? 'commerceKey';
```

The INSERT uses this explicit expression/predicate with `ON CONFLICT DO NOTHING
RETURNING id`. A conflicting row counts as a duplicate suppressed, not another row.
If the index is absent at execution, inference fails rather than silently allowing
duplicates. No new dedupe migration or runtime index-creation code was added.
For a fresh main-only CI database lacking the existing development constraint, the
test reproduces its identical definition **only inside its disposable fixture
schema**; ordinary runtime does not create it.

Counts returned: `candidates`, `enqueued`, `duplicates`, `skipped`, and numeric
`skipReasons`. Here candidates means cart-scope groups inspected, including groups
that are subsequently found not due or ineligible.

## Held heartbeat migration

The registry's final numbered migration was 359 and 360 was free when checked.

`server/migrations/360_job_heartbeats_nullable_success.sql` contains:

```sql
ALTER TABLE job_heartbeats
ALTER COLUMN last_success_at DROP NOT NULL;
```

It is **HELD and UNREGISTERED**. `migration-files.ts` was not changed. Migrations
346 and 347 were not touched. The held SQL was applied only to disposable test
schemas; no production migration was run. The managed development app restarted
with **zero newly applied migrations**.

This change is needed because a first failed pass has no actual success timestamp.
The failure recorder writes `FAILED` in existing `last_result`, updates
`updated_at`, and never overwrites a previous success time. A first-failure row has
NULL success. Both a persisted NULL-success commerce row and its latest-failed row
report `failed` and are unhealthy. A job with no row/no attempted run retains
`never_succeeded`, also unhealthy; it is never shown as green.

Only commerce supplies the failure callback to the internal-job wrapper. Other
jobs keep their existing success-only stamping and skip/failure behavior.
Failure-heartbeat persistence errors themselves remain visible as HTTP 500 plus
server logging; there is no success fallback if the database cannot persist.

## Per-rule verification

Counts below refer to the **final source's two fresh consecutive randomized
native loops**, not earlier exploratory builds. Each final loop also had five
hostile scenarios and zero failures.

| Rule | Disposition | Final loops / clean | Evidence |
|---|---|---:|---|
| Two sequential sweeps, no duplicate rows | Satisfied | 2 / 2 | First run queued 2; repeat queued 0 and suppressed 2; total stayed 2 |
| Two simultaneous sweeps, no duplicate rows | Satisfied | 2 / 2 | Barrier held both after their SELECTs; combined inserts 2, conflicts 2, total rows 2 |
| Actual success heartbeat | Satisfied | 2 / 2 | Authenticated endpoint returned 200; stored time lay between request start and completion; health `ok` |
| Candidate-query failure, including first run | Satisfied | 2 / 2 | Real PostgreSQL division-by-zero SELECT; endpoint 500, stored `FAILED`, first success NULL, health `failed` |
| Failure preserves previous success | Satisfied | 2 / 2 | Previous timestamp unchanged, attempt timestamp updated, latest health `failed` |
| Nothing due | Satisfied | 2 / 2 | Recent activity skipped; empty candidate result returned explicit success and `enqueued: 0` |
| Counts returned | Satisfied | 2 / 2 | Candidates/enqueued/duplicates/skipped checked on first, repeat, recent, invalid and empty runs |
| Registry and roster | Satisfied | 2 / 2 native; separate inspection pass | Exactly one node/cadence entry; existing registry and cron/reachability guards passed |
| Other heartbeat semantics | Satisfied | 2 / 2 | Legacy success row byte-equivalent after failure and skip; untouched job remained `never_succeeded` |
| Golden regression | Satisfied | Before 1 / 1; after 2 / 2 | 143/143 before; 143/143 in each after run; 13 stages each, no failing/skipped assertions |
| Typecheck baseline | Satisfied | 1 / 1 final | 117 diagnostics, same per-file/error-code counts as Part 2; none in new files |
| Production and real-email isolation | Satisfied | 2 / 2 | Production disabled; direct sweep rejected; real-looking recipient skipped; delivery counter 0 |
| Production release | Deferred | 0 / 0 | Parts 4/6 safety and separate founder approval required |

## Loop and attack log

1. Exploratory run failed: PostgreSQL rejected ordering by the original guest
   column after normalized grouping. **Fixed** with ordering by grouped result
   columns. This failed attempt is not counted as clean.
2. Intermediate implementation passed two randomized loops. Before final proof,
   queue-only protection was strengthened and the scope collision test changed to
   use the same sequence across both scopes.
3. Final loop 1: scenario `718ce4c7-3491-44fc-bdf7-d7af22cc500d`, clean.
4. Final loop 2: scenario `c0a320b4-17bb-4409-9536-cf6bae53d9b8`, clean.

Hostile scenarios, each repeated with fresh data in both final loops:

- Malformed legacy timestamp and absent timestamp: skipped, no guessed clock.
- Guest without an account recipient: skipped.
- Real-looking non-QA recipient inside the fixture schema: skipped.
- Old queued sequence followed by a resumed scope's new sequence: new row allowed.
- Production mode with a syntactically valid isolation name: disabled/rejected,
  no new row or delivery.

Scenario families used: S1 happy path, S2 repeated signals, S3 simultaneous sweeps,
S6 recipient isolation, S7 missing/malformed data, S8 candidate-query fault,
S9 persisted/backdated timing and resume, S10 machine authentication/isolation,
S12 regression. Backdating was used for fast loop timing; **no final real-clock
delivery/wait proof** is claimed.

## G1–G10 scorecard

| Gate | Disposition | Evidence / remaining scope |
|---|---|---|
| G1 Trigger | Satisfied for Part 3 | Stored Part 2 clock, 1h only, not-due/empty cases |
| G2 Recipient | Deferred for full automation | QA/account/guest isolation proven; final changed-address/suspension checks belong to send-time work |
| G3 Content | Deferred | Verification HTML/text only; final personalization, language, links and render proof not claimed |
| G4 Once-only | Satisfied for queueing | Real unique index, sequential/concurrent checks, two scopes sharing one sequence |
| G5 Cancellation | Deferred | Cancel-at-send and paid-all-rails safety arrive later; release blocked |
| G6 Consent/limits | Deferred | Quiet hours, unsubscribe and shared cap arrive in Parts 4/6 |
| G7 Failure | Satisfied for sweep faults | Real query exception, first NULL-success failure, preserved prior success; no false-empty catch |
| G8 Concurrency | Satisfied for sweeps; deferred for sending | Two candidate SELECTs/INSERTs raced; action-vs-send races not claimed |
| G9 Observability | Satisfied for backend Part 3 | Counts, skip reasons, cadence roster, failure health and genuine success times |
| G10 Real delivery | Deferred / intentionally not run | No live emails authorized in Part 3; no receipt IDs invented |

The complete automation does not score 10/10 yet. Passing Part 3 infrastructure
checks must not be described as production email certification.

## Touch list

Added:
- `server/automations/messaging/commerce-email-sweep.ts`
- `server/services/commerce-email-sweep.service.ts`
- `server/routes/__tests__/commerce-email-sweep.db.test.ts`
- `server/migrations/360_job_heartbeats_nullable_success.sql` — held/unregistered
- This report and its generated sanitized evidence sidecars.

Extended existing files:
- `server/automations/messaging/index.ts`
- `server/routes/internal.routes.ts`
- `server/services/email-outbox.service.ts`
- `server/services/job-heartbeats.service.ts`
- `shared/schema.ts`
- `scripts/ci/post-internal-jobs.sh`
- `.github/workflows/scheduler-jobs-gate.yml`

Deleted files: **none**. No existing node, template, route or test was replaced.
No existing Part 1 runtime/registry/CI copy was imported.

Deliberately not touched: authoritative cart/payment/availability writers,
checkout, migration registration, migrations 346/347, production database/settings,
secrets, fee bands, feature flags, old test suites and the existing cron schedule.

## Retained evidence and verification limits

- `reports/automation-part3-evidence/native-loops.json`
- `reports/automation-part3-evidence/golden-before-results.json`
- `reports/automation-part3-evidence/golden-after-1-results.json`
- `reports/automation-part3-evidence/golden-after-2-results.json`

Each golden run used the retained Part 1 four-file test/report harness overlay
only, not its runtime/registry/CI changes. Both after runs used committed source
`0e6f3207b`. Their 78 distinct CI guard commands include actual configured flags;
all passed. Sanitized golden results were checked for recipient addresses before
retention. The app booted on port 5000 and the public landing screenshot rendered.
There was no GitHub-hosted CI run, authenticated traveler browser journey, real
delivery, production activation or migration-registration approval.

**Part 3 not complete as full automation certification:** later send-time safety,
final content/delivery proof and founder release approval remain open. The ten
requested development infrastructure checks are satisfied; Part 4 has not started.
