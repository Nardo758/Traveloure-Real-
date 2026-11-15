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
