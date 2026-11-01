# Automation tracker — isolated signup fixture PR

## Preserved work and scope

- Fresh-main base: `cd76f5cb4972cf89bff3c418db576c3d9a268938`.
- Preserved remote branch: `work/stage2-part4-atomic-reset-timezone`,
  head `fbbdc4e6192621e154fd157a53ffc80e86a06f41`.
- The complete held 269-row inventory remains in that branch's
  `reports/automation-flow-tracker.md`. This focused document does not
  reinterpret its counts as implementation on current main.
- Scope: test fixture setup/teardown plus this report only. No runtime,
  production, migration, payment, flag, transport or workflow changes.
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

## Fresh proof and blockers

Current main contains 11 auth tests and 3 preference-writer tests: 14 total,
not the held branch's 22. Its 5 time-zone and 3 additional preference tests
were not copied into this PR.

- First fresh isolated run: 3/14 passed; 11 auth failures.
- First underlying schema error: `users.apple_sub` is absent from the
  development schema cloned by the runner. Its definition is in main's
  existing `424_users_apple_sub.sql`; the migration ledger was not inspected.
- Temporary setting restored: 1/1; shared setting unchanged: 1/1;
  disposable namespace removed: 1/1.
- Clean signup loops: 0/2. A second run is not justified until the underlying
  schema blocker is approved/resolved. No test was weakened.
- Main also does not contain the held constraint-name preservation repair.
  It was not copied, bypassed or silently added to this two-file PR.
- Fresh typecheck: baseline 110, current 110, new diagnostics 0, ceiling 111.
  Normalized diagnostic lists are identical; this is not a globally clean build.
- Static guards: 79/79 after a provider-free private build supplied the bundle
  required by two guards (initially 77/79; only those two were rerun).
  Registry/roster: 2/2; mutation-auth checks: 2/2; private build: 1/1.
  An existing stale manifest-line-number notice is non-blocking; no rail changed.

No shared schema repair, migration execution, release activation, real email,
inbox observation, payment writer, direct sender or scheduler change occurred.
Signup is **NOT DEV-CLOSED** on fresh main. Draft PR; **RELEASE HELD**.

## Held inventory counts — unchanged by this PR

| BUILT | EXISTS | WAITING | NOT BUILT | EXCLUDED | Total |
|---:|---:|---:|---:|---:|---:|
| 34 | 76 | 70 | 87 | 2 | 269 |
