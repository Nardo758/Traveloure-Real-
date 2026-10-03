# Signup/login messaging — Part 1 evidence and refinement

Date: 2026-10-04 (Asia/Calcutta). Branch: `task-automation-registry`.

## Status and limits

Implementation delivered; **not “Part 1 genuinely complete.”**
All six email-dependent nodes are **verified in dev, inbox receipt pending**,
not closed. The user authorized development verification without an approved
mailbox; no real inbox or provider-receipt assertion is made.

The integration suite executes the actual HTTP registration, login, resend and
verification routes, real PostgreSQL transactions, real outbox claims and
registry guards. Only the final provider transport is intercepted, before any
network send. It asserts persisted rows and send order. Development fixtures
are cleaned afterwards. The normal app was stopped during the DB suite so its
background drain could not send these fixtures.

Reminder timing is proven by exact persisted account-creation-relative deadlines
and development-only advancement of due dates, not a wall-clock three-day wait.
Messages accepted by a provider before verification cannot be recalled; the
shared lock guarantees their delivery begins before verification commits, never
after. Provider idempotency retention is finite, not an unlimited exactly-once
delivery guarantee.

These are email-only nodes: there is no invented in-app notification evidence.

## Phase 1: randomized loop evidence

Commands:

```sh
RUN_AUTH_JOURNEY_DB_TESTS=1 NODE_ENV=test \
  npx tsx --test --test-concurrency=1 server/__tests__/signup-journey.db.test.ts

npx tsx --test --test-concurrency=1 \
  server/automations/__tests__/*.test.ts \
  server/automations/*/__tests__/*.test.ts \
  server/__tests__/email-outbox.test.ts

npx tsx --test server/__tests__/registration-flag-gate.test.ts
```

Results: **10/10 integration tests, 58/58 registry/outbox regression tests,
5/5 registration-flag tests; zero skips in these runs.** The opt-in DB suite
also has its own isolated PostgreSQL CI job in the existing registry gate.
This is not a claim that the remote CI job has already run.

Each loop creates fresh randomized fixture addresses and account IDs. The
name/no-name and language/unset variants are deliberately varied, not reused.
Email templates support English and Spanish; unset/unsupported languages fall
back to English. Signup success UI has English/Japanese translations.

| Loop | Fresh verification/duplicate-account fixture | Fresh reminder fixture | Evidence |
|---|---|---|---|
| 1 | `be1a6fb2-f29f-44c8-a16e-55f18c80f6ca` — name, default English | `af0cd1ab-f630-4cad-99b0-0c249539c0e8` — no name, Spanish | All six node actions executed; 24h expiry, old-token burn, not-before deadlines, one welcome, neutral duplicate response, cancellation |
| 2 | `e6bd9687-ee20-415e-ab03-8f811e441a3e` — no name, Spanish | `75ca94e5-8299-4591-b464-b3a17ce07611` — name, default English | Second consecutive clean development round for every node; actual simultaneous resend/verify HTTP requests |
| 3 — refinement | `85444d07-2484-4b5f-a7df-c512f69b8d56` — new name/default-language identity | `fd095d72-0e0f-4e9f-8354-158f6e867d94` — fresh no-name/Spanish identity | Fresh sequencing and neutrality evidence, not the earlier loop's rows; all six actions repeated |

The captured integration output is `/tmp/signup-part1-final-loops.txt`
(temporary runtime log). For example, loop 1 records actual outbox delivery
rows 347 (verification), 353 (welcome), and 354 (already-account). Provider IDs
are explicitly `intercepted-*`, not real delivery receipts. Do not use these
logs as evidence of inbox arrival.

Every round includes a separate new account for a due-reminder-versus-verification
race. Either verification wins and the claimed reminder is cancelled without a
send, or delivery wins and the reminder precedes welcome; no reminder follows
welcome. All remaining pending/retrying/claimed reminders are cancelled.

Additional fresh fixtures prove:

- Expired token returns HTTP 400 and creates no welcome.
- Two simultaneous authenticated resend requests leave one usable token;
  older links fail without a welcome. Deadlines are not reset by resend.
- Two simultaneous verification requests yield one HTTP 200 and one HTTP 400,
  one persisted welcome row and exactly one intercepted welcome submission.
- Overlapping immediate delivery calls submit each due reminder once.
- A failed welcome submission remains retryable; concurrent retry produces
  exactly one successful submission with the same durable/provider key.
- A deliberately held in-flight reminder send blocks verification on the
  same per-user lock; after release, verification commits and welcome follows.
- Name HTML is escaped; whitespace/no-name bodies are valid; reminder links
  never contain stale verification tokens.

Two consecutive clean **development** rounds do not close inbox-dependent work.
No node encountered six failing rounds; there is no unresolved flaky/structural
risk flag. The inbox blocker is a stated evidence dependency, not hidden flakiness.

## Bug list: before → after

1. **Welcome before verification.** Before: registration independently started
   verification and welcome sends without awaiting verification. After: signup
   commits only verification/reminder rows. Token consumption, verified state,
   welcome enqueue and reminder cancellation share one transaction. Loops 1–3
   assert no welcome before verification and welcome send time after verified
   state. The OAuth compatibility entry can no longer bypass this guard.
2. **Duplicate-account disclosure.** Before: existing-account signup returned
   HTTP 400 and an explicit account-exists message; new signup returned HTTP 201,
   a user object and a new authenticated session. After: both return HTTP 201,
   identical message-only JSON and no new session cookie; existing-account
   passwords/profile data are unchanged. Both UIs stay in a neutral check-inbox
   state rather than conditionally redirecting. Loops 1–3 prove the HTTP/body/
   cookie parity. Interactive browser proof remains pending below.
3. **Resend/verify concurrency exposure.** Before: token invalidation, issue and
   verification writes occurred in separate statements without a shared lock.
   After: token validity is re-read under a per-user transactional advisory lock;
   repeated/concurrent verification cannot enqueue another welcome.

## Phase 2: mandatory six-item refinement

| Item | Status | Evidence / explicit deferral |
|---|---|---|
| 1. Exact six-file count | **Satisfied** | `server/automations/messaging/signup/`: `verify-email.ts`, `welcome-email.ts`, `verify-reminder-1h.ts`, `verify-reminder-1d.ts`, `verify-reminder-3d.ts`, `already-have-account.ts`. `signup-contract.test.ts` asserts exactly six files/IDs, all active. Infrastructure/other messaging files are outside this journey count. |
| 2. Every automation fired with real evidence | **Deferred: inbox receipt** | All six actually executed against persisted development outbox rows in each round; final transport interception observed each send. No approved mailbox means real inbox receipt cannot be claimed. Each node is “verified in dev, inbox receipt pending.” |
| 3. Structural risks resolved | **Satisfied** | Three clean fresh development rounds; no six-failure cap or unresolved flaky case. Retry, concurrency and in-flight cancellation boundary are explicitly tested. |
| 4. Sequencing fixes still hold on fresh loops | **Fixed in dev; browser interaction evidence deferred** | Loop 3 uses new randomized accounts and re-proves no premature welcome, duplicate-neutral HTTP/body/session behavior. Static `/signup` render is captured in `evidence/signup-form.jpg`. The browser automation failed with a Replit infrastructure error before a usable interaction verdict, so neither signup surface's post-submit interaction is marked passed. |
| 5. Real concurrency, exactly one welcome | **Satisfied in dev; inbox receipt pending** | Actual `Promise.all` HTTP verification requests against one usable token yield `[200,400]`, one welcome row and one intercepted successful send, in all three rounds. Retry and provider-before-verify lock boundary are tested separately. |
| 6. No orphaned references | **Satisfied** | Registry validation and contract tests resolve every cancellation reference. Welcome cancels exactly all three reminder IDs. Reminder nodes have no outbound cancellation targets, so those lists are intentionally empty, not dangling. |

## Application and static checks

- The application workflow was restarted once after the implementation batch;
  it is running and `/signup` renders without a broken-page error.
- `git diff --check` passed.
- A completed intermediate full typecheck reported 118 repository diagnostics
  and none in the changed signup/auth/outbox/email/UI files after the one new
  downlevel-iterator diagnostic was fixed. Subsequent baseline-from-HEAD and
  final full typecheck attempts timed out; a final clean whole-project
  typecheck/baseline-diff is **not claimed**.
- Browser automation: **blocked by Replit infrastructure**, not a passing UI
  interaction result. Screenshot is static page evidence only.
- No deployment, production data write, schema migration, new scheduler or new
  email transport was introduced.

## Corrected broader counts — not implemented here

Part 1: 6 active. Part 2: 10 active (including both email-change nodes), with
Google separately deferred. Part 3: 4 active. Part 4: 3 or 4 active depending
on reachable signin velocity. Total: 23 or 24 active; 24 or 25 tracked including
deferred Google. Do not count a deferred Google node as active or repeat the
original inconsistent Part 2 count.

Parts 2–5 remain outside this implementation. Full closure still requires
authorized inbox evidence and successful interactive browser verification.