# Part 10 approved development remediation — results

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Dispatcher repair and non-sending QA start mode were approved. Main
reconciliation, held migration rename/registration, real provider sending,
production changes and merge were not approved and were not performed.

## Reproduce / repair / reproduce

The unchanged reviewed checkpoint was extracted into `/tmp` and tested through
the existing isolated-development owner with independently confirmed database
fingerprint. No checkout/reset of main, payment writer execution or live
transport. Fresh baseline: **15/15 reported entries**, including two randomized
loops reproducing duplicate submissions following acceptance and DB failure.
Evidence: `automation-part10-evidence/remediation-before.log`.

Approved implementation commits attempt intent before any provider handoff.
Uncertain acceptance is held against automatic retries; durable sent evidence
wins over a lost acknowledgement. The original row-derived provider key remains.
No schema, column, migration, payment writer or checkout change.

Final fault/retained suite: **26/26 reported entries, zero skipped/failed**:
23 fault-suite entries (22 leaf cases + parent), plus three retained suite entries.
The retained suites contain their own two-loop assertions; parent counts are
not unique behavior counts. Evidence: `remediation-proof.log`.

| Rule / scenario | Loops | Clean consecutive loops | Status / actual outcome |
|---|---:|---:|---|
| Healthy in-flight send / competing worker and admin claims | 2 | 2 | Fixed: one submission, committed intent visible to independent observer, zero competing claims |
| Actual SQL abort after acceptance | 2 | 2 | Fixed: durable attempt survives; `dead/provider_acceptance_unknown`; no automatic second submission |
| Actual deferred COMMIT rejection after acceptance | 2 | 2 | Fixed: same uncertainty hold and retry fence; no receipt invented |
| COMMIT succeeds / acknowledgement lost | 2 | 2 | Fixed: durable `sent`/receipt retained; truthful `sent` returned |
| SQL abort plus failed fallback write | 2 | 2 | Fixed duplicate risk: `processing/intent` survives; expired lease/admin drains cannot resend |
| New sent state before stale fallback | 2 | 2 | Fixed: newer terminal state not overwritten; no second submission |
| Forced newer owner token / lease before stale fallback | 2 | 2 | Fixed: owner-token fence prevents stale overwrite; no normal reclaim is possible |
| Actual intent SQL failure before handoff | 2 | 2 | Fixed: zero provider calls, no half-written intent |
| Crash/expired or malformed intent, including beyond 24 hours | 2 | 2 | Fixed automatic retry risk: zero provider calls |
| Intent COMMIT succeeds / its acknowledgement lost | 2 | 2 | Fixed: zero handoffs; confirmed durable intent remains held |
| Proven pre-handoff quiet-hours deferral / later safe resume | 2 | 2 | Satisfied: `pending/not_invoked`, unused daily reservation restored, then exactly one submission |
| Existing Part 6 live verification / cancel reasons / readable rails | 2 | 2 | Satisfied in retained verifier; UNKNOWN rails remain blocked |
| Existing Part 6 error/timeouts/atomic claims/quiet hours/item exemption | 2 | 2 | Satisfied in retained addendum; must-have item delivery remains held |
| Existing Part 8 randomized scenario/fault matrix | 2 | 2 | Satisfied on existing readable-record scope; not all-rail certification |

Also rerun separately under owned schemas: corrected Part 2 cart-email-state,
Part 3 sweep, Part 4 reminders, Part 5 item changes and payment handler replay.
All six reported parent entries passed (reminder suite has two); their retained
internal loop assertions remain intact. Evidence:
`remediation-retained-*.log`. Separate replay isolation avoids mistaking its
deliberate unrelated handler fixtures for a false commerce-drain result.

Known non-invocation is distinguished from uncertainty. Only a completed,
versioned `not_invoked` attempt can resume a pending quiet-hours row. Its
provider key does not change. Unfinished, uncertain, malformed and unknown-version
attempts never qualify for automatic reuse. Ordinary cancelled rows remain
terminal. A sender throwing a cancellation-shaped exception after invocation
is treated as uncertain, not proof of no send.

A known pre-handoff cancellation restores the previous marketing reservation;
an uncertain provider attempt retains its reservation. This preserves the
daily cap without inventing a send or unnecessarily consuming a day for a
proven non-invocation.

## SDK contract and residual window

SDK + approved QA isolation suites: **5/5 reported entries**.
Evidence: `remediation-sdk-proof.log`.
The existing Part 9 QA controller also passed a fresh **two-loop dry run**:
`automation-part9-evidence/proof-ae5e9bad-e40a-469b-87d0-041b1f6803bc.json`.
Actual delivery count is **zero**, `realTransport:false`. This is synthetic
harness verification, not delivery proof; the item notice remains template-only.
Two internal randomized-key contract loops cover a same-key retry below 24h,
changed-payload conflict, expiration at 24h, immediate subsequent retry and a
synthetic concurrent-key conflict. All transport remains mocked/network-blocked.
Official provider semantics remain documented in the proposal.

Logged post-final-read/provider-invoke intervals in the fresh suite range from
**0.278 to 23.988 ms**, including injected payment interleavings. They demonstrate
a nonzero residual window, not a production latency bound. No DB intent write
was added after the final paid check. Marketing-only acceptance is unchanged;
must-have and UNKNOWN-rail holds remain.

Mocks cannot establish real Resend acceptance/deduplication, retention behavior,
ambiguous network outcome or delivered receipt. Real-provider proof remains
Open under the explicit no-email hold.

## Fresh gates

| Gate | Result | Evidence |
|---|---|---|
| Golden regression, including itinerary DB proof and signup | 143/143 reported entries, no failures | `automation-part1-evidence/golden-1-faee06b0-c910-48ef-aff7-7a87bad8a997/results.json` |
| Guard batch | 78/78, no failures | `automation-part1-evidence/golden-1-0554c23f-ff6f-4768-a2eb-95c37a9bba91/results.json` |
| Typecheck | 117 existing diagnostics, identical normalized diagnostic multiset; zero additions/removals | `remediation-typecheck-comparison.json` and `remediation-typecheck-final.log` |
| New module diagnostics | None | Same fresh typecheck |
| Mutation-auth inventory | No route changed; existing generated outputs not reconciled | Exact touch list below |
| Existing app visitor screenshot | Public page renders; signed-out requests return existing 401s | Development preview only, not a deployed-code proof |

No global clean-build claim. Initial setup/invocation failures and corrected
runs are retained as sanitized evidence, not passing counts. One command used
the wrong guard flag and correctly failed DB authorization instead of writing
public fixtures; the final `--guards-only` run is the actual guard result.

The normal development workflow was not restarted: its boot schedules a real
outbox drain with inherited provider credentials. Under the no-real-email hold,
native provider-free isolated execution is the verification boundary. A full
combined app boot is not claimed; it remains for an approved safe integration
or release-validation stage. No scheduler or feature flag was changed to make
a boot appear safe.

## Genuine real-clock scenario

First start attempt failed on a missing mandatory fixture end date and was
cleaned up by the existing schema owner. The corrected genuine fixture is
retained under explicit ownership. No shifted clock or synthesized send history.

| Field | Value |
|---|---|
| Scenario ID | `d88d08e8-baca-4cd8-acfb-6442692f2b5f` |
| Run ID | `d5dcaccc-abdb-401a-b3ab-1a72d24ec98a` |
| Real start | `2026-10-11T05:53:16.241Z` |
| Exact 1h threshold | `2026-10-11T06:53:16.241Z` |
| Exact 1d threshold | `2026-10-12T05:53:16.241Z` |
| Exact 3d threshold | `2026-10-14T05:53:16.241Z` |
| Fixture timezone | `Asia/Kolkata` |
| Inbox binding | `SIGNUP_QA_TEST_INBOX` — name only |
| Outbox rows at start | 0 |
| Earlier real 1h send | Not done; no history fabricated |
| Emails sent/scheduled by setup | 0 |
| Status | **WAITING. NEXT-DAY PROVEN: NO** |

An independent read-only development database check confirmed the retained
namespace still has **one cart, one canonical itinerary correlation and zero
outbox rows** after the start controller exited.

The normal app's public search path does not include the owned fixture namespace.
Setup has no provider channel; child credentials/inbox values are absent and
network is blocked. Cart birth uses the existing authoritative storage writer;
existing materialization preserves its actual clock while creating canonical
owned itinerary correlation. Approved live checks/UNKNOWN holds still apply.
Future delivery, reuse and cleanup require explicit authorized QA ownership.
No new scheduler or public/application schema change.

## Exact files changed and holds

Runtime:
- `server/services/commerce-send-verification.service.ts`
- `server/services/email-outbox.service.ts`

QA harness / tests:
- `scripts/verification/run-commerce-qa-delivery-proof.mjs`
- `scripts/verification/run-messaging-gate.mjs`
- `server/routes/__tests__/commerce-provider-failure.db.test.ts`
- `server/__tests__/commerce-provider-idempotency.test.ts`
- New `server/routes/__tests__/commerce-real-clock-start.db.test.ts`

Reports/ledger/evidence updated separately. `email.service.ts`, cart writers,
cart-projection, payment/checkout/booking code, application schema, migration
files/registry, flags, production, direct senders and generated auth-conflict
files were **not changed**.

Remaining holds: main-owner conflict review; provisional migration 369 rename
and registration approval; UNKNOWN payment rails and provenance proposals;
must-have payment/inventory ordering; approved marketing residual window;
genuine next-day delivered proof (including real preceding-step history);
real-provider uncertainty/recovery validation; production/scheduler checks;
normal cart-reminder activation; actual human merge ledger.

If best-effort dead-letter recording fails, intent can remain `processing`
but non-sendable. The existing dead-letter panel only lists `dead`; manual
intent reconciliation/operational visibility needs a separately approved
follow-up. At-most-once submission fencing does not promise automatic recovery
or delivery of every interrupted attempt.

**Part 4 genuinely complete: NOT CLAIMED. No new Parts started.**
