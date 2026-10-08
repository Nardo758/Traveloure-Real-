# Part 1 — baseline freeze and protection

**Part 1 not complete.** This is a partial, fresh baseline report, not production certification.

## Source and scope

- Frozen source: `f413edab1bbde376ba55b2139c952683c520e4fc`.
- Work branch: `work/automation-part1-baseline-freeze`.
- Prior checkout preserved on `backup/pre-automation-part1-20261008T152000Z`.
- PR 1274: merged, merge `2211257967c788d15951acfdf29c65497c4c79a0`, already an ancestor of the frozen head.
- PR 1327: merged, merge `3c7d675d18d3b16bb168d986d7d470d7b003fe7d`, already an ancestor of the frozen head.
- No runtime reconciliation or legacy branch transplant was needed.
- GitHub main advanced during inspection. This report remains explicitly pinned to the frozen head, not that later source.
- Runtime, payment writers, schema, migrations, fee settings, production settings and existing CI are unchanged.
- No protected file was renamed or deleted. No duplicate registry, outbox, dispatcher or scheduled job was created.
- Development inbox settings are available. Their values are never included in this report.
- Their secure-form save modified local `.replit`. That private configuration diff is excluded from commits and reports; no diff containing its values has been printed.

## Fresh measured results

| Check | Result | Evidence / qualification |
|---|---|---|
| Provider-free golden baseline | 85 PASS; five required DB stages BLOCKED | `automation-part1-evidence/golden-1-d0ab9bc1-4649-46e7-a20c-39d7c745cc9f/results.json` |
| Retained CI guard commands | 75 PASS; one FAIL, 76 commands | `automation-part1-evidence/golden-1-eb36e251-9ada-4898-8713-9f5c88d926f2/results.json` |
| TypeScript diagnostics | 117; existing CI ceiling 117 | Direct compiler exited 2; diagnostic count is at the ratchet, not a clean typecheck |
| New-tooling diagnostics | Zero in project diagnostic output | The report/test helpers are outside the project's normal type scope; this is not a claim of independent semantic typechecking of every helper |
| Supplemental harness safety pass | 6 PASS | `automation-part1-evidence/harness-safety.json`, including JSON followed by retained cleanup output |
| Protected registry | 89 unique nodes | `protected-automations.md`, frozen source hashes in `protected-registry.json` |
| Production core job heartbeat read | 17 job names with recorded successful runs | Read-only; `production-heartbeats.csv`, no result bodies or customer data |
| Real delivered emails this run | Zero | No provider receipt or outbox ID claimed |
| Browser verification this run | Not performed | No fresh post-submit or received-email link proof claimed |
| Completed clean certification loops | Zero | No automation has two clean fresh loops |

The initial `npx tsc` attempt timed out. The direct compiler completed with 117 diagnostics using:

```sh
node --max-old-space-size=6144 node_modules/typescript/bin/tsc \
  --noEmit --incremental false --pretty false
```

The main type ceiling remains **117**. It has not been raised. Runtime source did not change after that measurement.

## Golden command and ordered coverage

```sh
node scripts/check-automation-golden-baseline.cjs --loop=1
```

This deliberately exits nonzero while the five DB stages remain unauthorized. It does not silently skip them or call the partial pass green.

| Stage | Fresh result |
|---|---|
| Itinerary generation outcome payload | 5 PASS |
| Itinerary marketing follow-up payload | 5 PASS |
| Authoritative generation DB writer suite | BLOCKED: isolated test-schema authorization |
| Three follow-up DB suite | BLOCKED: isolated test-schema authorization |
| Signup welcome DB suite | BLOCKED: isolated test-schema authorization |
| Verification / password-reset producer boundaries | 4 PASS |
| Booking confirmation duplicate / payment retry DB suite | BLOCKED: isolated test-schema authorization |
| Booking durable delivery / retry DB suite | BLOCKED: isolated test-schema authorization |
| Existing outbox retry / lease / cancellation tests | 26 PASS |
| Retained registry contract cases | 38 PASS |
| Registry uniqueness | PASS |
| Cron roster consistency | PASS |
| New test-harness safety cases | 5 PASS |

Every case's result and elapsed milliseconds is in the evidence JSON and the command's table. SKIP, TODO, malformed or zero-test output does not count as PASS.

The supplemental safety pass added a parser regression case after the initial five-case pass. A targeted attempt through the retained server-only launcher correctly rejected the script-folder test path before executing anything; the provider-free direct test command then passed all six cases. That does not repair its separate CI reachability failure.

After explicit authorization, the same command supports `--isolated-db` with a separately verified development fingerprint. It reuses the retained isolation runner and retained Vitest configs. It does not copy either.

## The guard failure introduced by this work

`check-test-files-wired.cjs` correctly reports one **new** orphan:

`scripts/verification/__tests__/automation-baseline-harness.test.ts`.

The 33 older orphan paths are already covered by main's unchanged ratchet. They are not the reason this guard refuses this branch. The new file is my infrastructure issue, not a pre-existing application defect.

Proposed touch-list correction: place the new test at
`server/automations/messaging/__tests__/automation-baseline-harness.test.ts`,
under an existing CI selector, and update its new runner/import paths. No existing CI file, protected test or orphan baseline would change. This correction awaits approval. It is not resolved in this report.

## Shared-mechanism audit

Full file/line anchors are in `automation-part1-evidence/shared-mechanisms.json`. These are source findings, not fresh behavioral certification.

| Mechanism | Finding | Representative source |
|---|---|---|
| Eligibility / cancellation | Shared dispatcher, separate generation, follow-up and welcome business guards; not one universal policy | `email-outbox.service.ts:364–384`, `itinerary-followup.service.ts:72–102`, `signup-welcome-outbox.service.ts:78–104` |
| Recipient locking | Traveler advisory locking exists for follow-ups; welcome/account and queue-row leases are different scopes | `itinerary-followup.service.ts:26–27`, `signup-welcome-outbox.service.ts:86–91` |
| Consent / unsubscribe | Itinerary preferences/tokens and activity preferences use distinct checks | Follow-up and activity service anchors in shared-mechanisms JSON |
| Quiet hours / timezone | Stored preference/window logic exists; fixed 09:00–20:00, unknown-zone skip and every boundary still need fresh proof | Follow-up email/service anchors in shared-mechanisms JSON |
| Daily marketing cap | Follow-up reservation logic uses shared outbox metadata; that alone does not prove cross-family enforcement or priority arbitration | Follow-up service anchors in shared-mechanisms JSON |
| Unique dedupe | Family-specific keys and claims exist; generic enqueue is not evidence of a universal event-key guarantee | Generation, welcome and outbox anchors in shared-mechanisms JSON |
| Reason codes | Existing suppression reasons are family-specific, including text in outbox failure/cancellation fields | Corresponding service anchors in shared-mechanisms JSON |
| Dead-row digest | Existing dead-row summary/digest path exists; its delivery/recovery requires fresh proof | Outbox service anchors in shared-mechanisms JSON |

### Baseline risks to prove, not silently repair

1. Generic `enqueueEmail` can fall through to a direct send when its insert fails. A passing retained test of that behavior is not proof of durable outbox-only delivery.
2. Verification and password-reset helpers still send directly. Their genuine sends cannot supply an authoritative outbox row ID. Creating a cosmetic row would not close that gap.
3. A shared table/dispatcher does not establish a shared marketing lock, cap or high-priority arbitration across all future families.
4. Current preference-driven marketing windows require actual tests against the Master's fixed window.
5. Core heartbeats record last successful runs. A fresh failure/recovery test is still needed to establish the Master's FAILED/RECOVERED observability.
6. Booking email links must be exercised in a browser against current route behavior; source inspection is not G10 evidence.

No runtime change to any of these paths is authorized or made in Part 1.

## Scheduler evidence and limitations

`scheduler-roster.json` lists all **17 core roster jobs**, their intervals and source lines, plus **25 registered cron node definitions**.

At the read-only production snapshot, all 17 core roster names had success heartbeats. Last successful runs are stored in `production-heartbeats.csv`.

GitHub's `jobs-cron.yml` history showed successful scheduled runs at:

- 2026-10-08 14:43:31 UTC, run 37794804842, frozen source head.
- 2026-10-08 14:55:37 UTC, run 37796491908, frozen source head.
- 2026-10-08 15:17:19 UTC, run 37799488585, frozen source head.
- 2026-10-08 15:42:43 UTC, run 37802992869, later GitHub main head.

Two earlier scheduled runs, at 13:19:44 and 13:43:29 UTC, had failed. The later successful runs do not erase those failures.

Classification:

- **PROVEN RUNNING at recorded timestamps:** the 17 core jobs with actual successful heartbeats.
- **UNKNOWN:** registered cron nodes not individually correlated to a job heartbeat/run; legacy timer completeness; the separate Replit Scheduled Deployment's settings, logs and run history.
- **PROVEN NOT RUNNING:** none established by this snapshot. Absence of a heartbeat alone is not that proof.

The trigger script is `scripts/ci/post-internal-jobs.sh`; the existing GitHub workflow invokes it, not a new copy. The occasions job has its separate existing daily workflow.

Human checks remain: Publishing's Scheduled Deployment schedule, timezone, build/run command, timeout and Monitoring run history/logs. Report specific missed slots; a green GitHub run does not prove the independent Replit trigger.

## Certification scorecard

All G1–G10 gates remain **Open for fresh full certification** for the built behavior aliases below. Supporting retained unit assertions are not converted into a delivered-mail certificate.

| Behavior | Supporting fresh evidence | G1–G10 closed |
|---|---|---|
| itinerary_ready | Outcome payload and producer boundaries | 0/10 |
| itinerary_failed | Outcome payload and producer boundaries | 0/10 |
| nudge2h | Follow-up payload/window unit cases | 0/10 |
| followup24h | Follow-up payload/window unit cases | 0/10 |
| reengagement5d | Follow-up payload/window unit cases | 0/10 |
| welcome | Existing source/registry retained; DB proof pending | 0/10 |
| verification | Producer-boundary cases; no authoritative outbox row | 0/10 |
| reset | Producer-boundary cases; no authoritative outbox row | 0/10 |
| canonical booking confirmation | Existing outbox rail; DB/browser/delivery proof pending | 0/10 |
| legacy booking confirmation | Existing outbox rail; DB/browser/delivery proof pending | 0/10 |
| activity | Existing outbox source retained; fresh delivery pending | 0/10 |

S1–S12 remain open for the fresh scenario matrix. No real-clock ledger entry is fabricated and no historical receipt is reused as a fresh result.

## Decisions / holds

| Decision | State |
|---|---|
| D1 last-activity stamp | Approved in principle, but message ends after “neutral, server-written”; complete scope is missing. No runtime stamp in Part 1. |
| D6 development inboxes | Provided; available; values withheld. Not an unresolved inbox request. |
| D7 full Decision Sheet / real-clock isolation | Not supplied. No invented policy or temporary UTC override. |
| Disposable DB-test schema | Clarify permission to reuse retained CREATE/DROP isolation without application schema changes. Exact implementation: `isolated-test-schema-review.md`. |
| New harness CI reachability | Approve the new-file path correction described above, without changing CI or its ratchets. |

A temporary schema is still DDL. The existing harness clones table **structure**, not public customer data, preserves constraints, uses a fingerprint guard and drops its namespace in cleanup. I have not executed that DDL under an ambiguous “no schema changes” instruction.

The new outer runner does not SIGKILL a DB isolation owner on its own watchdog: the retained owner keeps its existing child deadline and cleanup. An external hard kill would bypass finally-cleanup.

## Touch list / no-deletion statement

New test/report files only:

- `scripts/check-automation-golden-baseline.cjs`
- `scripts/verification/automation-baseline-reporter.mjs`
- `scripts/verification/user-automation-baseline.ts`
- `scripts/verification/__tests__/automation-baseline-harness.test.ts`
- `reports/protected-automations.md`
- `reports/automation-part1-baseline.md`
- `reports/real-clock-ledger.md`
- `reports/commerce-direct-senders.md`
- New redacted files under `reports/automation-part1-evidence/`

Existing app/CI/schema/payment file modifications: **none**. Existing deletions: **none**.
The separate user-requested private development configuration change is not part of the proposed code commit.

## Required before completion

Authorize test isolation and correct the new test's CI reachability; run the DB stages; finish shared-policy and scheduler correlation; run fresh real delivered sanity scenarios with real row/provider IDs; inspect received links/post-submit behavior; start viable real-clock rows; complete attack cases and two clean loops. Resolve any baseline defects through a separately approved touch list, not unauthorized runtime edits.
