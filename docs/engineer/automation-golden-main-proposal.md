# Automation golden checks: clean-main retention proposal

Review branch: `work/automation-golden-clean-main`. Base: current main
`b31447cc9e72cbfe514842add0db2c4cbc71e77d`, whose parent is `afbf00ebc`.
The intervening commit updates artifact metadata, not application source.

## Scope

Restore the existing 13-stage runner and seven-test safety suite from
`work/automation-part10-final-gates`. Retain every regression stage, all five
isolated-DB groups, and an exact guard inventory assertion.
The seven-test suite is restored with one current-main compatibility update:
78 → 80 guard commands, adding the LiteAPI payment-method guard and its
`--self-test` variant. No held guard was removed. An extra assertion requires
that new self-test. No application behavior or regression assertions are weakened.

Changes relative to the held runner are confined to test infrastructure:
- Unsupported `--live-proof` is rejected before starting children or writing
  evidence. The reporter does not retain the live-mail credential passthrough.
- Generated evidence goes to ignored `generated-artifacts/automation-golden/`,
  excluded from both Git and deployment inputs.
- `results.json` uses a JSON replacer that applies the retained text redactor
  to string values and redacts named sensitive fields, never to JSON punctuation.
  It remains an object with arrays, numeric counts/durations, boolean isolation
  state, per-stage timestamps, individual names, reasons and exit codes.
  The extra evidence tests are separate from the seven retained tests.

The text redactor still accepts/coerces text as before; `redact(object)` is not
a structured-evidence API and produces `[object Object]`. Use
`serializeEvidence(document)` for JSON. It validates the redacted JSON before
persistence and fails explicitly if serialization/redaction corrupts it.
Logs are redacted text, not raw child output. Redacting the whole serialized
JSON string is unsafe: the text-only bearer/credential patterns can consume
closing quotes. The JSON replacer avoids that without changing the text API.

## Retained messaging gate review

`scripts/verification/run-messaging-gate.mjs` is unchanged. Non-DB children
receive its explicit provider-free environment and synthetic unreachable DB URL.
Opt-in DB execution requires an independently checked development fingerprint.
The gate owns the empty constraint-preserving clone, replacement serial
sequences, restored foreign keys, isolated search path and private HTTP harness.
It stops child process groups before dropping the schema and verifies removal.
`messaging-schema-preload.cjs` prevents public SQL/search-path escape and
qualifies the session store to the disposable schema.

The restored reporter adapts only the isolated test child for the original
Vitest configs and opt-in suites, preserving their assertions. HTTP adaptation
targets the retained loopback harness, never the preview. Vitest workers need
their own setup file; a parent preload alone is insufficient.
The outer runner deliberately does not SIGKILL DB owners, so the retained
deadline and `finally` cleanup remain responsible for their lifecycle.

## Approval boundaries

No email, provider API calls, production access, restarts, runtime configuration
changes, migration registration, CI wiring, merge or Phase 2 journeys.
Do not run `--isolated-db` without **fresh explicit owner approval** for disposable
schema creation/deletion and a freshly verified development fingerprint.
Possessing a fingerprint is a technical check, not owner approval.

Without that authorization the default runner must exit 1 and retain five
`ISOLATED_TEST_DATABASE_AUTHORIZATION_REQUIRED` failures. They are blocked
checks, never skips or green results. `--guards-only` is retained as an explicit
guard inventory mode, not proof that regression tests or DB groups passed.

## Validation

Fresh provider-free run on 2026-10-13:
`node scripts/check-automation-golden-baseline.cjs`.
**87 PASS reported entries, 5 FAIL/authorization-refusal entries, exit 1.**
These are reported entries, not 87 distinct database tests: TAP suite rows,
repeated contract assertions and registry/roster check entries are retained.

| Stage | Pass | Fail | Exit |
| --- | ---: | ---: | ---: |
| Itinerary outcome payload | 5 | 0 | 0 |
| Itinerary follow-up payload | 5 | 0 | 0 |
| Generation authoritative-writer tests | 0 | 1 | 1 |
| Three itinerary follow-up tests | 0 | 1 | 1 |
| Signup welcome | 0 | 1 | 1 |
| Verification and password-reset boundaries | 4 | 0 | 0 |
| Booking confirmation duplicate and payment retry | 0 | 1 | 1 |
| Booking durable delivery / retry | 0 | 1 | 1 |
| Outbox retry / leases / dedupe / cancellation | 26 | 0 | 0 |
| Retained registry contract suites | 38 | 0 | 0 |
| Registry IDs | 1 | 0 | 0 |
| Cron roster | 1 | 0 | 0 |
| New harness safety tests | 7 | 0 | 0 |

Local structured evidence:
`generated-artifacts/automation-golden/golden-1-d05ae913-efad-4f47-aa21-e552571ba98b/results.json`.
The file contains all 13 stage records and 92 reported rows, individual names,
start/completion timestamps, durations and the five explicit refusal reasons.
No raw exceptions, recipient addresses or provider credentials are persisted.
Generated output is intentionally local/ignored, not part of the proposal commit.

Additional command:
`node --test scripts/verification/__tests__/automation-baseline-evidence.test.mjs`
— **5/5 passing**, outside the retained 87-entry count.
`git diff --check` passed, and the generated evidence path is Git-ignored.
The 80 guard commands were inventoried, not executed via `--guards-only`.

The first attempt exposed the stale 78-command assertion (current main has 80)
and a synthetic redaction test caught JSON punctuation corruption. Both were
fixed as described above; failed-attempt evidence is not relabeled as passing.

The earlier Phase 1 report's 80 current-main provider-free entries still pass,
with seven restored safety entries added. Historical 143/143 is **not** a
current-main parity target. All five DB groups remain unexecuted pending fresh
explicit approval. **Full golden closure is blocked**, not certified green.
No global build/typecheck, browser, delivery or production certification is claimed.

Source context: `reports/e2e-pre-phase2-gate.md` on
`work/e2e-automation-harness-phase1`. That harness and its CI proposal remain
separate and unmerged.
