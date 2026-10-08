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
- Runtime, payment writers, application schema, migrations, fee settings, production settings and existing CI are unchanged. Approved disposable fixture namespaces were created and dropped.
- No protected file was renamed or deleted. No duplicate registry, outbox, dispatcher or scheduled job was created.
- Development inbox settings are available. Their values are never included in this report.
- Their secure-form save modified local `.replit`. No values or private diff were printed. An automatic workspace checkpoint captured that configuration despite no manual staging; do not push this checkpoint history. Any future public PR must start from clean main and transfer only approved test/report changes.

## Fresh measured results

| Check | Result | Evidence / qualification |
|---|---|---|
| Provider-free isolated golden baseline, loop 1 | 143 PASS, zero FAIL | `automation-part1-evidence/golden-1-b63ce214-0f9b-4a73-baa6-3c68b0d3fdcd/results.json` |
| Provider-free isolated golden baseline, loop 2 | 143 PASS, zero FAIL | `automation-part1-evidence/golden-2-a6cb87be-8448-48a5-84d6-3114c6373027/results.json` |
| Retained CI guard commands | 76 PASS, zero FAIL | `automation-part1-evidence/golden-2-8875bc34-5e5d-48a4-b8e6-ac6fa2c190fe/results.json` |
| TypeScript diagnostics | 117; existing CI ceiling 117 | Direct compiler exited 2; diagnostic count is at the ratchet, not a clean typecheck |
| New-tooling diagnostics | Zero in project diagnostic output | The report/test helpers are outside the project's normal type scope; this is not a claim of independent semantic typechecking of every helper |
| Harness safety cases | 7 PASS in each full golden loop | Includes cleanup-suffix parsing and rejection of non-isolated HTTP targets |
| Protected registry | 89 unique nodes | `protected-automations.md`, frozen source hashes in `protected-registry.json` |
| Production core job heartbeat read | 17 job names with recorded successful runs | Read-only; `production-heartbeats.csv`, no result bodies or customer data |
| Real delivered emails this run | Five distinct itinerary mailer scenarios provider-delivered in the latest attempt; no complete mailer loop | `automation-part1-evidence/mail-sanities-1-07c37dff-18cb-4c25-86dc-9ab6608e67cf.json`; IDs below |
| Browser verification this run | Not performed | No fresh post-submit or received-email link proof claimed |
| Completed clean certification loops | Zero | Two clean golden loops are NOT two complete G1–G10/S1–S12 certification loops |

The initial `npx tsc` attempt timed out. The direct compiler completed with 117 diagnostics using:

```sh
node --max-old-space-size=6144 node_modules/typescript/bin/tsc \
  --noEmit --incremental false --pretty false
```

The main type ceiling remains **117**. It has not been raised. Runtime source did not change after that measurement.

### Fresh mail receipt evidence (latest stopped attempt)

All five rows below were real development-namespace outbox rows whose provider `last_event` was **delivered**. They were sent only to the approved monitored QA inbox. The disposable namespace and rows were removed afterwards; the receipt evidence persists without an address, token or key.

| Behavior | Actual outbox row ID | Provider message ID | Provider event |
|---|---:|---|---|
| itinerary_ready | 1219264204 | `01a11c70-948d-782d-8d68-b51066ad75c0` | delivered |
| itinerary_failed | 1219264208 | `01a11c70-ab12-7952-a9a2-8ec68d153290` | delivered |
| itinerary_nudge_2h | 1219264210 | `01a11c70-c67b-7b6d-90a6-f582fca9be07` | delivered |
| itinerary_followup_24h | 1219264215 | `01a11c70-d6b9-7efc-93f5-296fe6a1e6da` | delivered |
| itinerary_reengagement_5d | 1219264220 | `01a11c70-e6ad-726c-b8ec-edac697fad39` | delivered |

The sixth sanity was **not sent**: the signup welcome row was cancelled with `Signup consent absent` because the temporary QA account fixture did not supply signup consent. This is evidence that the existing send-time consent protection acted, **not** evidence that real signup delivery or the signup browser flow works. No booking, activity, verification or password-reset provider receipt was obtained in this run. Six mailer attempts did not produce a complete loop; testing stopped under the brief's failure limit. The five mail receipts do not count as a clean Part 1 loop or genuine 2h/24h/5d elapsed-time proof. A provider-delivered event alone does not establish inbox placement or that a link was opened successfully.

## Golden command and ordered coverage

```sh
MESSAGING_DEV_FINGERPRINT=<independently-verified-development-fingerprint> \
  node scripts/check-automation-golden-baseline.cjs --isolated-db --loop=1
```

The disposable-schema permission is now approved. The command executes all five retained DB stages. Without `--isolated-db` it still fails explicitly rather than silently omitting them.

| Stage | Fresh result |
|---|---|
| Itinerary generation outcome payload | 5 PASS |
| Itinerary marketing follow-up payload | 5 PASS |
| Authoritative generation DB writer suite | 8 PASS in each loop |
| Three follow-up DB suite | 20 PASS in each loop, including isolated real HTTP unsubscribe/consent |
| Signup welcome DB suite | 22 PASS results in each loop |
| Verification / password-reset producer boundaries | 4 PASS |
| Booking confirmation duplicate / payment retry DB suite | 3 PASS in each loop |
| Booking durable delivery / retry DB suite | 3 PASS in each loop |
| Existing outbox retry / lease / cancellation tests | 26 PASS |
| Retained registry contract cases | 38 PASS |
| Registry uniqueness | PASS |
| Cron roster consistency | PASS |
| New test-harness safety cases | 7 PASS in each loop |

Every case's result and elapsed milliseconds is in the evidence JSON and the command's table. SKIP, TODO, malformed or zero-test output does not count as PASS.

Historical partial/failed runs remain in the evidence directory and are not relabeled as successes. The original server-only launcher rejection and new-file CI orphan were fixed solely by the approved relocation of our new test. Two initial DB passes exposed a legacy HTTPS-target setup gap; no protected assertion was edited. The retained private HTTP server is used with a namespace-checked worker setup transport bridge. Vitest's worker setup is merged into its existing config through its supported API; no second config or CI copy was created.

After explicit authorization, the same command supports `--isolated-db` with a separately verified development fingerprint. It reuses the retained isolation runner and retained Vitest configs. It does not copy either.

## Resolved new-file guard failure

The approved relocation places only our new test at
`server/automations/messaging/__tests__/automation-baseline-harness.test.ts`,
under an existing CI selector. All 76 guards pass. Existing CI, protected tests and the 33-path historical orphan ratchet are unchanged.

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
| itinerary_ready | Outcome/producer DB cases and one genuine delivered receipt; real-clock/browser proof open | 0/10 |
| itinerary_failed | Outcome/producer DB cases and one genuine delivered receipt; browser proof open | 0/10 |
| nudge2h | Follow-up DB cases and one genuine FAST delivered receipt; 2h real clock open | 0/10 |
| followup24h | Follow-up DB cases and one genuine FAST delivered receipt; 24h real clock open | 0/10 |
| reengagement5d | Follow-up DB cases and one genuine FAST delivered receipt; 5d real clock open | 0/10 |
| welcome | 22 retained DB results per loop, including production recipient-path protection; QA fixture lacked consent, so live proof stopped | 0/10 |
| verification | Producer-boundary cases; no authoritative outbox row | 0/10 |
| reset | Producer-boundary cases; no authoritative outbox row | 0/10 |
| canonical booking confirmation | Retained writer/idempotency and delivery DB suites pass; browser/full lane proof open | 0/10 |
| legacy booking confirmation | Retained shared rail protected; browser/full legacy writer proof open | 0/10 |
| activity | Existing outbox source retained; fresh delivery pending | 0/10 |

S1–S12 remain open for the fresh scenario matrix. No real-clock ledger entry is fabricated and no historical receipt is reused as a fresh result.

## Decisions / holds

| Decision | State |
|---|---|
| D1 last-activity stamp | Approved in principle, but message ends after “neutral, server-written”; complete scope is missing. No runtime stamp in Part 1. |
| D6 development inboxes | Provided; available; values withheld. Not an unresolved inbox request. |
| D7 full Decision Sheet / real-clock isolation | Not supplied. No invented policy or temporary UTC override. |
| Disposable DB-test schema | Approved; retained structure-only isolation executed with fingerprint guard and verified cleanup. |
| New harness CI reachability | Approved; relocated only the new test. Existing CI and ratchets unchanged; 76 guards pass. |

A temporary schema is still DDL. The explicit permission covers retained structure-only fixture cloning, not application or production schema changes. The harness preserves constraints, uses a fingerprint guard and drops its namespace in cleanup. Both successful golden loops had all five namespaces removed; read-only development inspection afterwards reported zero surviving fixture schemas.

Live mailer sanity mode is separate and explicitly opted in, uses only approved QA inboxes, and restores only the existing mail SDK's configuration to the otherwise provider-free retained runner. Its static allowlist banner describes the base environment, not this disclosed QA mail exception. Marketing FAST fixtures use declared UTC preferences permitting 09:00–20:00; actual quiet hours are not overridden. Backdated FAST due times are not real-clock proof. Direct authentication senders have no cosmetic outbox rows; shared booking payload probes do not claim payment-writer or browser proof.

Real-provider idempotency is global across fixture schemas. Restarted clone counters initially collided with a previous provider key; only each disposable fixture's own outbox sequence now gets a randomized starting range. Production sequences, dispatcher idempotency headers and dedupe behavior are untouched.

The new outer runner does not SIGKILL a DB isolation owner on its own watchdog: the retained owner keeps its existing child deadline and cleanup. An external hard kill would bypass finally-cleanup.

## Touch list / no-deletion statement

New test/report files only:

- `scripts/check-automation-golden-baseline.cjs`
- `scripts/verification/automation-baseline-reporter.mjs`
- `scripts/verification/user-automation-baseline.ts`
- `server/automations/messaging/__tests__/automation-baseline-harness.test.ts` (approved relocation of our new test only)
- `reports/protected-automations.md`
- `reports/automation-part1-baseline.md`
- `reports/real-clock-ledger.md`
- `reports/commerce-direct-senders.md`
- New redacted files under `reports/automation-part1-evidence/`

Existing app/CI/schema/payment file modifications: **none**. No protected existing file was deleted; the only path deletion was our own newly created test's approved relocation.
The separate user-requested private development configuration change is not part of the proposed code commit.

## Required before completion

Test isolation and CI relocation are approved and complete. Before certification: repair the *test-only signup consent fixture* under the existing approved touch list; after the six-failure stop, resume real-delivery tests only on a new explicit go. Then obtain delivered receipts and actual outbox IDs for the remaining built paths; inspect received links and signup post-submit behavior in a browser; establish viable, surviving real-clock rows under a confirmed D7 decision; verify scheduler correlation and shared policy/attack cases; complete two clean full G1–G10 and S1–S12 loops. Direct verification/reset still lack authoritative outbox rows in the current runtime. Any runtime fix requires a separately approved scope, not a silent change in Part 1.
