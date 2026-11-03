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
