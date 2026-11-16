# Automation tracker — isolated signup fixture PR

## Preserved work and scope

- Fresh-main base: `cd76f5cb4972cf89bff3c418db576c3d9a268938`.
- Preserved remote branch: `work/stage2-part4-atomic-reset-timezone`,
  head `fbbdc4e6192621e154fd157a53ffc80e86a06f41`.
- The complete held 269-row inventory remains in that branch's
  `reports/automation-flow-tracker.md`. This focused document does not
  reinterpret its counts as implementation on current main.
- Scope: test fixture setup/teardown plus this report only. No runtime,
  production, migration-file, payment, flag, transport or workflow changes.
  Existing migrations ran only inside a private disposable PostgreSQL instance.
- No local commit is created in the production deploy checkout or the
  separate verification checkout. The PR commit is created through GitHub.

## Fixture behavior

The registration suite temporarily opens signup only in an owned
`automation_msg_<16 hex>` schema, or in the existing GitHub Actions job's
dedicated loopback `traveloure` PostgreSQL service. The CI exception requires
both GitHub Actions/CI markers, the exact database and a loopback URL.
Unknown/workspace public schemas are refused before the new setting write.

The fixture saves its original value, uses schema-qualified statements,
invalidates the existing platform-flag cache, and restores/deletes its own
setting in finally. For owned schemas it compares a digest of the shared
public setting before/after. No shared-development setting is changed.

## Pinned tests

Edited pinned file: `server/__tests__/auth-three-defects.db.test.ts`.
Only an existing helper import and fixture declarations/hooks change.
R1–R5 and N1–N6 bodies: 11/11 byte-identical; added/removed cases: 0.
Owned-target guard cases: 7/7, including 5 denied targets.

## Fresh migration-built proof — ready for review

Current main has 11 auth cases and 3 preference cases: 14, not the held
branch's 22. No held runtime code, constraint-name repair, or extra tests
were copied into this PR.

| Fresh loop | Registered migrations recorded | Boot/migration phase | Normal session initialization | Tests | Failures | Cancelled |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 422/422 through 428 | 29.48 s | 1.34 s | 14/14 | 0 | 0 |
| 2 | 422/422 through 428 | 15.25 s | 1.14 s | 14/14 | 0 | 0 |

- Provider-free main build: passed, 15.16 s; reused without source changes.
- PostgreSQL 16.15, private temporary instance, fresh empty database per loop.
  No workspace DATABASE_URL or shared/production connection was used.
- Main's unchanged compiled boot ran the full registered chain with NODE_ENV=test,
  no copied history. Both ended at 428_selection_events.sql. Timings above cover
  the migration boot phase and process shutdown, not SQL-only execution.
- users_email_unique was created by the application's migrations in both loops.
  The classifier is unchanged; no index/constraint rename repair was used.
- Baseline deliberately excludes sessions, which express-session owns. The
  application's unchanged getSession middleware initialized it via a synthetic
  session save/destroy before each test run. Bootstrap sessions remaining: 0/0.
- Isolation scaffolding only: hand off public to an owned automation_msg namespace
  and retain an independent public.platform_settings control snapshot for the
  unchanged guard. No manual application-column or constraint repair.
- Original auth fixture blob is unchanged from the prior PR head; all test bodies
  and assertions are unchanged. No fake GitHub CI markers were used.
- Full initial migration-only attempt: 9/14, R1-R5 failed because sessions was
  not initialized. Earlier clone attempts: 3/14 (missing apple_sub), then 13/14
  (N3, generated key name). These failures are retained, not counted clean.
- Final consecutive clean loops: 2/2. Shared-setting guard passed in both private
  control snapshots. Databases remaining after each loop: 0/0; private PostgreSQL
  stopped. No real email, QA-inbox observation or elapsed-time proof.

Previously verified, unchanged-source gates (not rerun for this operational proof):
- Typecheck baseline/current 110/110, new diagnostics 0, ceiling 111. Not globally clean.
- Static guards 79/79; registry/roster 2/2; mutation-auth checks 2/2.

Evidence: .local/verification-evidence/auth-empty-chain-20261101/ in the workspace,
including the operational driver, normal session bootstrap, sanitized boot/test
logs, source-integrity comparison and cleanup records.

**Fixture PR: READY FOR REVIEW. No merge performed. Broader automation RELEASE HELD.**

## Held inventory counts — unchanged by this PR

| BUILT | EXISTS | WAITING | NOT BUILT | EXCLUDED | Total |
|---:|---:|---:|---:|---:|---:|
| 34 | 76 | 70 | 87 | 2 | 269 |

## Approved itinerary cancellation decision log — provider-free receipts

Founder approved the proposed three-file scope in this task's approval form.
This section appends evidence; it does not replace the fixture receipts or
reclassify the held inventory above.

### Change and boundaries

- `server/services/itinerary-followup.service.ts`: the existing local
  cancellation helper now calls the existing application logger after its
  cancellation update, with exactly `outboxId`, `emailType`, and the existing
  fixed cancellation `reason`. The static message is
  `[itinerary-followup] cancelled; not sent`. It records a decision, not a
  provider receipt. No recipients, subject, body, metadata, or user/plan identity
  is passed to the logger.
- `server/services/__tests__/itinerary-followups.vitest.ts`: eight new cases
  cover deleted/archived plans, all three follow-up types, pending/failed rows
  through the real outbox dispatcher, processing rows through the worker,
  already-sent rows, and cancelled rows retried before and after plan restoration.
  Rescheduling the restored plan cannot resurrect cancelled rows or insert
  replacements. Ready notices remain untouched. Exact logger argument equality
  enforces the three-field privacy allowlist.
- No runtime eligibility, expiry, consent/preferences, retry, or send-exit logic
  changed. The dispatcher still delegates to the same worker and single send
  exit. No new source file, migration, table, scheduler, or provider send.
- All database fixtures ran in a newly created private local PostgreSQL 16.10
  instance, materialized from the current Drizzle schema (with `pg_trgm`).
  This is schema-built evidence, not an empty migration-chain proof.
  Provider credentials were absent from the allowlisted child environments.
  A private loopback HTTPS app mounted the existing authentication and
  preferences handlers against that same private database, so the two HTTP
  preference/unsubscribe cases ran rather than being skipped. It had email
  sending disabled; test delivery callbacks were intercepted, never sent.
  No shared-development or production fixture writes were used.

### Pinned rounds and refinement

Pinned command: `vitest run --config vitest.itinerary-followups.config.ts`,
with `RUN_ITINERARY_FOLLOWUP_DB_TESTS=1`, a private database target, and the
private HTTPS route harness. No test-name filter, skipped case, or provider
credential was used in the four accepted rounds.

| Round | Tests passed | Failed / skipped | Suite duration |
|---|---:|---:|---:|
| Clean 1 | 28/28 | 0 / 0 | 5.16 s |
| Clean 2 | 28/28 | 0 / 0 | 3.22 s |
| REFINE | Stale-worker assertions and deletion-safe fixture cleanup strengthened | No runtime changes | — |
| Clean 3 | 28/28 | 0 / 0 | 3.21 s |
| Clean 4 | 28/28 | 0 / 0 | 3.26 s |

Final two rounds each ended with **zero fixture users and zero outbox rows**.
The cancellation matrix includes 18 unavailable-plan/type/source-status
combinations and six already-sent plan/type combinations. Repeated worker and
dispatcher calls leave terminal rows unchanged and emit no second cancellation
decision.

Initial exploratory runs are not counted as clean rounds: two unrelated stale
fixture assumptions surfaced (the named expert lacked current Identity/Connect
eligibility, and the generic dispatch-claim fixture was already expired).
Only fixture setup changed: the expert now satisfies the existing policy, and
the claim test uses a three-hour-old itinerary. No assertion or runtime guard
was relaxed. Refinement also found orphan ready notices when a test deleted its
plan; teardown now includes the fixture's known comparison ID even after that
plan is gone. Earlier private-instance leftovers were removed before the final
two rounds; their cleanup counts are not presented as clean.

Source SHA-256 pins:

- Runtime, all four rounds:
  `21b1ad46aec66e5b19cb6f58a57f2987f8906d284679486bfdfcbdc29f0a5912`.
- Tests, first two rounds:
  `f2cb05aeaab39ee60ad8c0ee6f5d76f65820382af6406071ebbb9ab237fc9cbd`.
- Tests, final two rounds:
  `40806a1a353e3436373e03be0dd546425553e472247ff75fbbf19aa4faab87de`.

Additional checks:

- Retained itinerary payload, outbox, and critical-email unit suites: 48/48,
  zero failures/cancellations/skips.
- Existing static guard harness: 81/81 stages passed.
- Automation registry: 89 nodes validated; cron roster passed.
- Mutation-auth manifest and coverage checks passed. The manifest check reported
  its existing non-fatal stale-line-number notice; no rail changed.
- Baseline/final typecheck: 103/103 existing diagnostics, zero new diagnostics;
  not a globally clean typecheck.
- Application workflow restarted and served the landing page successfully.
  Startup applied zero migrations; mail sending remained disabled.

### C29 absence-proof status

| Required evidence | Result |
|---|---|
| Outbox decision | Private-fixture rows cancelled with the fixed plan-unavailable reason, no retry, no attempt increment, and no resurrection |
| Decision log | Exact safe payload observed once per cancellation; terminal repeats do not emit another decision |
| Real provider-event absence | **Not observed**; intercepted callbacks are not provider-event evidence |
| QA-inbox absence | **Not observed**; no inbox or elapsed-time claim |

The code gap behind **W-C29-DECISION-LOG** is implemented and verified on this
task's branch, pending review/merge. **C29 remains WAITING; the four-part live
absence proof and broader release are not complete.** No delivery activation,
merge, or publish was performed.

## Approved bulk itinerary cancellation logs — provider-free receipts

Founder explicitly approved the separate three-existing-file scope in the
approval form for this change. This extends decision visibility to existing
bulk cancellations; it does not change the C29 live absence-proof status above.

### Change and preserved boundaries

- `server/services/itinerary-followup.service.ts`: the existing
  `cancelItineraryFollowups` UPDATE now returns only the affected outbox IDs and
  email types. Each returned row emits the existing static
  `[itinerary-followup] cancelled; not sent` message with exactly `outboxId`,
  `emailType`, and the caller's existing fixed `reason`. Raw PostgreSQL bigint
  IDs are converted to match the outbox schema's existing numeric ID contract.
- The three existing caller reasons remain `Cancelled by a newer ready itinerary`,
  `Booking or payment started`, and `Traveler unsubscribed`. No recipient,
  subject, body, metadata, traveler ID, or itinerary ID is passed to this logger.
- No pre-update lookup, additional cancellation, or send path was introduced.
  The UPDATE's traveler/version/status filters and optional itinerary exclusion
  are unchanged. Eligibility, preferences, expiry, locking, retries, and the
  single send exit are unchanged. Rows initially inserted as cancelled by an
  older late completion are not UPDATE-affected rows and are not logged here.
- These are decisions logged after a successful UPDATE inside the caller's
  transaction, not independent transaction-commit or provider-delivery receipts.
  Outer-transaction rollback behavior is not certified by this change.
- No migration, new tracked source file, provider send, activation, manual
  commit/push, or publish was performed.

### Test receipts

`server/services/__tests__/itinerary-followups.vitest.ts` adds three
database-backed cases, one per fixed reason. Each uses all three follow-up
types across pending, failed, and processing source states. Exact logger
argument equality proves one safe log per affected row and no extra fields.
Sent, cancelled, and expired controls for every type remain byte-for-byte
unchanged, as do other-traveler/version controls and itinerary-ready notices.
The newer-plan case additionally protects the explicitly excluded itinerary;
booking and unsubscribe exercise the helper without that exclusion.

Repeating the cancellation and invoking stale workers and the dispatcher for
the newly terminal rows produces no additional logs, sends, or row changes.
The pre-existing integration cases also continue to exercise real scheduling,
booking/payment guards, explicit HTTP unsubscribe, and authenticated preference
saves.

Final command: `vitest run --config vitest.itinerary-followups.config.ts`,
with explicit development-fixture authorization and a newly initialized private
local PostgreSQL 16.10 database materialized from the current Drizzle schema
(including `pg_trgm`). A loopback HTTPS harness mounted the existing auth and
preference handlers against that same database. Child-process environments
were allowlisted without provider credentials; delivery callbacks were
intercepted and the HTTP harness had email sends disabled. Shared development
and production databases were not used for these fixtures.

| Check | Observed result |
|---|---|
| Final full follow-up suite | **31/31 passed**, zero failures/skips, 9.02 s total |
| Private fixture teardown | **0 users, 0 outbox rows** remaining |
| Full `tsc --noEmit --pretty false` | 103 diagnostics elsewhere; none in either changed TypeScript file; not a globally clean typecheck |
| `git diff --check` | Passed |
| Application restart | Served the landing page; startup applied 0 migrations; outbox sending disabled |
| Provider events or inbox absence | Not observed or claimed; no provider sends were attempted by verification |

Exploratory checks are not counted as final passes: the first private database
process did not survive its short-lived shell, so it was relaunched as a managed
background process. Exact-payload tests then caught raw PostgreSQL bigint IDs
arriving as strings; the runtime log now matches the existing numeric ID shape.
A test iterator was changed to support the project's configured TypeScript
target. A separate in-memory baseline-comparison attempt timed out; the normal
TypeScript command completed with the result reported above.

Final source SHA-256 pins:

- Runtime:
  `7fa730357c538c27c056328d67c58d58437cf2351670e4c9b941444b69113068`.
- Tests:
  `ff968384ab8c84540edf9bbfee3cc54407c930ac778cffa0c6c3e0f02f80158d`.
## Cancellation decision rollback regression — 2026-11-15

Added three provider-free cases in
`server/services/__tests__/itinerary-followups.vitest.ts`, one each for
`itinerary_nudge_2h`, `itinerary_followup_24h`, and
`itinerary_reengagement_5d`.

### Injected failure and observed rollback

Each case archives its fixture plan, claims the reminder as `processing`, and
captures the complete reminder rows plus the separate ready-notice rows.
A one-shot test wrapper invokes the real `db.transaction` callback. After that
callback returns `cancelled`, the wrapper verifies that the row is cancelled
**inside the still-open transaction** and that the decision was logged. It then
executes `SELECT 1 / 0` on that same transaction before commit. The worker promise
rejects with PostgreSQL SQLSTATE **22012** in the Drizzle error's cause.

For all three reminder types, assertions passed for:

- Exactly one emitted decision before the failure, with only `outboxId`,
  `emailType`, and fixed `reason: "Itinerary removed or no longer ready"`;
  static message `[itinerary-followup] cancelled; not sent`.
- After rejection, **all reminder rows exactly equal their pre-transaction
  snapshots**, including the claimed row's `processing` status, retry timestamp,
  attempt count, last error, payload, metadata, and update timestamp. Ready
  notices also exactly equal their snapshots. The cancellation UPDATE rolled
  back; the earlier, separately committed claim did not.
- **Zero intercepted sender calls** before failure, after rollback, after retry,
  and after terminal repeats. Both direct-worker and outbox-dispatch sender
  paths use the test spy; no live transport is invoked.
- With fault injection removed and the plan still archived, a fresh worker
  returns `cancelled` and persists only the intended cancellation fields
  (`status`, `lastError`, `retryAfter`, `updatedAt`). Other reminders and ready
  notices remain unchanged. The retry emits a second identical decision.
- A further worker call returns `skipped`; an outbox-dispatch repeat also leaves
  rows unchanged, emits no third decision, and makes no send.

**Interpretation:** the first decision exists even though its cancellation
transaction failed. It records the worker's in-transaction decision, **not a
committed cancellation, delivery receipt, or independent proof of provider
absence**. Repeated identical decisions can represent rollback followed by
retry. In this fixture, separate database reads establish rollback/commit and
sender-spy assertions establish zero calls. Real provider-event and QA-inbox
absence were not observed; C29's live absence-proof status is unchanged.
Logging timing/semantics remain unchanged and require separate founder approval
to change. The three-field privacy allowlist and all production eligibility,
send, and retry behavior are unchanged.

### Execution evidence and limits

- Used a private loopback PostgreSQL **16.10** database materialized from the
  current Drizzle schema (**1016 statements**, `pg_trgm` installed), not a proof
  of the migration chain. The retained messaging verifier cloned an empty,
  constraint-preserving schema and reported `ISOLATED_SCHEMA_REMOVED=true`
  after the run. No shared-development or production fixtures were written.
- The verifier and its children ran in an explicit allowlisted environment with
  no real provider credentials. The database instance was stopped afterward.
- Ran the full `vitest.itinerary-followups.config.ts` suite through the retained
  `automation-baseline-reporter.mjs` adapter and `run-messaging-gate.mjs
  --isolated-db --http-harness`. **31 collected: 29 passed, 2 failed, 0 skipped.**
  All **3/3 new rollback cases passed** (181.77 ms, 96.72 ms, 97.57 ms).
  The two existing HTTP cases failed on **404 instead of 200**: unsubscribe GET
  and authenticated preferences GET. Their failures are not rollback-test
  failures and this run is **not** claimed as a green full-suite result.
- `tsc --noEmit --pretty false` exited 2 with **103 repository diagnostics**;
  none named the edited test file. This is not a globally clean typecheck.
  `git diff --check` passed.
- Runtime SHA-256 remains
  `21b1ad46aec66e5b19cb6f58a57f2987f8906d284679486bfdfcbdc29f0a5912`.
  Test SHA-256:
  `58b08fb5ff492a511ee10a727cf8934b1f67eefcd5aa5943f5eff5d8ee128402`.
  No application source, migration, workflow, delivery activation, or publish
  changed as part of this task.
