# Clock scenario and development safety — proposals only

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**
No restart, sweep, drain, real email, payment/checkout change, flag change,
production access/change, migration rename/registration/application or merge.
Only this written proposal, blocker report and actual-observation ledger updated.

## 1. What actually happened at the 1h mark

Scenario `d88d08e8-baca-4cd8-acfb-6442692f2b5f`:
- Real start: `2026-10-11T05:53:16.241Z`.
- 1h threshold: `2026-10-11T06:53:16.241Z`.
- Read-only checks, completed by `2026-10-11T10:51:03Z`: one retained cart,
  one canonical itinerary correlation, zero outbox rows and zero
  `commerce-email-sweep` heartbeat rows in its owned namespace.
- No scenario sweep/send was authorized or run by this agent; no provider
  receipt is recorded. The inbox/provider was not queried in this check.
- The start controller was deliberately non-sending and installed no timer.
  Therefore no 15-minute runner was operating on this retained namespace.

This is a **missed 1h execution/proof slot**, not a successfully tested
60–75-minute delivery. An eventual overdue send cannot retroactively prove
that timing rule. Keep WAITING; do not invent sent-step history or a receipt.

## 2. Smallest safe sweep execution proposal — WAIT FOR OK

Do not restart the normal application. A POST to its existing authenticated
`/internal/jobs/commerce-email-sweep` is not enough: its DB connection is not
bound to the owned clock namespace and its existing verification gate would
return `disabled`. Do not change its flags/search path to make that call work.

Instead extend the existing verification owner/controller with an explicit,
one-shot **attach to this owned scenario** mode:

1. Independently verify the development DB fingerprint, production rejection,
   namespace, run/account/cart/sequence identity and canonical correlation.
   Require fresh private owner/IPC capability, not a public CLI-selected cart.
2. Bind only the child connection to the retained namespace; no public fallback.
   Validate `current_schema()` before any write. No app imports/startup, public
   database writes, scheduled server, recurring timer or registered second job.
3. Keep provider credentials and approved inbox values out of that child.
   No provider channel at all in the first approved mode.
4. Invoke the existing `runCommerceEmailSweepSchedule()` once, with the existing
   `recordJobSuccess` / `recordCommerceSweepFailure` behavior. Reuse the registered
   job, candidate selection, locks, dedupe and outbox. No rewritten eligibility.
5. Use the real server/DB clock: no `now` override, forced prior step, fabricated
   activity, UNKNOWN bypass or normal reminder activation. Report counts,
   actual skip reasons, heartbeat and actual outbox IDs; then exit.
6. Preserve the owned fixture; do not create a new clock or drop the scenario.
   A guard/identity/check error aborts visibly. Never convert failure to zero due.

**Blocking catalog finding:** public and owned `job_heartbeats.last_success_at`
are both NOT NULL. `recordCommerceSweepFailure()` inserts NULL before its
ON CONFLICT update, so the constraint can reject failure recording even when
a prior heartbeat exists. No false first-success stamp is acceptable.

Separate prerequisite proposal: permit only
`ALTER TABLE automation_msg_748a6c8ec0a411fe.job_heartbeats
 ALTER COLUMN last_success_at DROP NOT NULL`
in this owned fixture, after explicit approval and ownership preflight.
This is NOT a public/application schema change or migration registration/run.
If owned-only DDL is declined, do not run the scenario sweep: failed-heartbeat
guarantees are not currently satisfiable in that namespace.

Proposed touch list:
- `scripts/verification/run-messaging-gate.mjs`: strict retained-owner attach;
  explicitly approved owned-only constraint adjustment, otherwise refuse.
- `scripts/verification/run-commerce-qa-delivery-proof.mjs`: one-shot manifest,
  capability and sanitized outcome/ledger collection; sending remains off.
- New `server/routes/__tests__/commerce-real-clock-sweep.db.test.ts`: native
  owned invocation of the existing registered job and heartbeat functions.
- Reports/ledger only for actual execution evidence.
No runtime sweep, route, registry, scheduler, payment or checkout edits.

Proof before executing the real scenario: two fresh isolated loops for wrong
DB/schema/run/cart rejection, forbidden recipient rejection, no provider channel,
success/empty/failed-query heartbeat, dedupe and owner retention. Never use the
retained genuine clock fixture for injected fault tests.

### Proposed real execution slots, conditional on separate authorization

- Today: one explicitly approved overdue observation/enqueue sweep after its
  guards and heartbeat prerequisite are proven. It is not a timely 1h proof.
- Tomorrow, October 12: one-shot invocation at **06:00 UTC / 11:30 IST**, the
  first 15-minute slot after the exact 1d threshold.
- October 14: one-shot invocation at **06:00 UTC / 11:30 IST**, after the exact
  3d threshold, only if prior prerequisites and later authorization hold.

These are proposed slots, **not scheduled**. Later one-off invocations can be
operator-run or individually approved one-shot delayed commands; never a
replacement recurring scheduler. The ordinary endpoint remains disabled and
no other namespace/account can be selected.

A sweep only enqueues; it cannot deliver a receipt. QA-only provider handoff
requires separate explicit authorization and approved parent channel.
UNKNOWN paid checks and normal sending remain blocked. A skipped sweep is
recorded as skipped, not proof of delivery. The unsent 1h prerequisite can
prevent a 1d row; sending the overdue 1h tomorrow can also consume tomorrow's
daily cap. Do not relabel such a send as 1d.

## 3. Development drain safety — not recipient-safe

Read-only public development snapshot:

| Status / recipient type | Rows |
|---|---:|
| Pending, approved monitored QA inboxes | 0 |
| Pending, QA-domain aliases | 0 |
| Pending, other/non-QA/blank recipients | 0 |
| Failed rows, all recipient types | 0 |
| Processing rows, all recipient types | 0 |
| Due claimable rows | 0 |
| Sent, historical | 90 |
| Cancelled | 6 |
| Dead | 2 |
| Retained scenario outbox rows | 0 |

Because pending/failed/processing totals are zero, every recipient subcategory
is zero without reading or printing an address. Counts are a snapshot, not a
permanent safety property.

Evidence:
- `email-outbox.service.ts:333+`: atomic claim filters due/status/commerce
  attempt marker, **not QA recipient**.
- `email-outbox.service.ts:475+`: ordinary families reach `sendEmail`;
  signup/itinerary delegate to their existing verifiers then this sender.
- `email.service.ts:130+`: generic sender checks the global notifications
  setting/provider configuration, **not a development recipient allowlist**.
- `email-outbox.service.ts:780+`: startup schedules a drain, then repeats every
  five minutes. No restart occurred.
- `RESEND_API_KEY`: present in development, name/presence only.
  Both approved inbox setting names are present in development environment;
  their values were not printed.

**Yes, the development drain is capable of handing a non-QA recipient to the
provider when an eligible row/configuration permits it.** Zero rows now does not
make startup safe. No reliance on a global notification kill switch.

### Proposed development-only recipient restriction

Exact allowlist: the two existing approved monitored inbox settings, not an
entire email domain. Empty/missing/invalid settings => deny all. No address
substitution in the normal sender. Every member of a multi-recipient payload
must be allowed. Unknown/ambiguous mailbox syntax fails closed.

Apply before bulk/single claims and again immediately before generic provider
handoff. Disallowed rows stay non-sendable with an explicit operator-visible
reason/count, not a fabricated provider failure/acceptance or silent deletion.
No flags, new settings or production behavior changes. Production must never
read either QA inbox setting and must retain the account's own recipient.

Proposed touch list:
- `server/services/email-outbox.service.ts`: dev claim filtering, immediate
  delivery-path protection, observable blocked-recipient count/reason.
- `server/services/email.service.ts`: dev-only final recipient guard in generic
  transport; production branch unchanged.
- New `server/__tests__/email-outbox-dev-recipient-safety.test.ts`.
- Owned DB proof in new `server/routes/__tests__/commerce-dev-drain-safety.db.test.ts`.

Two clean loops: all families on drain, bulk/single/immediate claims, mixed
arrays, changed recipient between claim/handoff, missing settings, non-QA row,
approved inbox, and production recipient unchanged/no QA-setting reads.
No real email during verification.

This protects the drain, not all direct auth/vendor senders. Existing direct
senders bypassing generic transport are outside this edit proposal. A normal
server restart still needs separate approval and a read-only startup-path safety
review; do not claim that one generic guard protects every direct sender.

## 4. Quiet hours — stored, unchanged

Actual stored path: `preferences.itineraryMarketing.timeZone = Asia/Kolkata`.
It is not a top-level timezone field.

- 1d: `2026-10-12T05:53:16.241Z` = **October 12, 11:23:16.241 IST**.
- Proposed following slot: **11:30 IST**, inside **09:00 inclusive–20:00 exclusive**.
- Therefore timezone alone adds no hold at 1d; other guards still apply.
- If execution occurs at/after 20:00 IST, marketing waits until the next day
  at 09:00 IST (03:30 UTC), then a valid sweep/drain invocation and all guards.
- If the same-day cap is already consumed, the next local day/window applies.

Timezone and clock were not changed. UNKNOWN rails, prior-step history and
daily cap can still prevent the email.

## 5. Uncertain acceptance visibility

Existing path: `loadDeadEmailSummary()` in `email-outbox.service.ts` selects
`status='dead'`; the admin digest scheduler loads it and passes it to the
existing email renderer. A successfully recorded
`dead/provider_acceptance_unknown` appears there.

Gaps:
1. If fallback write fails, `processing/intent` is fenced but absent from that
   dead-only report. A later admin status reset can also remove a marker-bearing
   row from the dead-only result without authorizing a resend.
2. Current digest copy says dead emails were never delivered and suggests retry.
   That is not truthful for provider acceptance uncertainty.
3. A scheduled digest is a path, not proof that a person received/read it.
   No digest email was sent/queried in this audit.

Public development currently has zero `commerceDeliveryAttempt` markers.
The two historical dead rows are not claimed as uncertain provider attempts.
Fresh fault proof remains archived; its disposable fixtures were cleaned up.

Development-only proposal:
- Add a separate **uncertain/held intent** section independent of row status;
  include valid intent/uncertain markers and malformed markers, excluding proven
  non-invocation/known completed delivery as appropriate.
- Show row ID, family, phase, age, error and known provider receipt ID; do not
  state “never delivered.” Say “provider outcome uncertain; automatic resend blocked.”
- Disable ordinary retry guidance for these entries; reconciliation is a
  separately approved operator action, not an automatic sender.
- Produce a read-only local JSON/HTML report for human inspection without
  emailing an admin under the present hold. Do not rely solely on a digest.

Touch list: `server/services/email-outbox.service.ts` (summary DTO/query),
`server/services/admin-digest-scheduler.service.ts` (existing payload/counters),
`server/services/email.service.ts` (truthful renderer), and new
`server/__tests__/commerce-uncertain-intent-report.test.ts`.
Two clean loops: dead, processing, failed/reset, malformed, accepted/sent and
not_invoked cases; failed report query visible as error, no send/retry side effect.
No implementation today.

## 6. Main cart-projection — still proposal only

Fresh fetched main: `c3f24d65d9d37e83735dff078680ef7453955c7d`.
Review head: `0dacba55172961cab68fbca3da2fe948233fba14`.

Both full versions:
[main](https://github.com/Nardo758/Traveloure-Real-/blob/c3f24d65d9d37e83735dff078680ef7453955c7d/server/services/cart-projection.service.ts),
[review](https://github.com/Nardo758/Traveloure-Real-/blob/0dacba55172961cab68fbca3da2fe948233fba14/server/services/cart-projection.service.ts).

Preserve main's `stampItemSourceClass`, ownership/routing, refusal/pricing,
item values and transaction boundaries. Combine, do not wholesale replace,
the branch's activity-origin argument, atomic add/update/delete clock writes,
immutable snapshots and display/background neutrality. Main import includes
source-class helper and Drizzle operators; branch additionally needs `sql`
and activity helpers. Both belong in the reconciled version.

Exact touch list:
- `server/services/cart-projection.service.ts`.
- `server/__tests__/cart-email-state.db.test.ts`.
- Regenerate, never manually choose:
  `generated/security/mutation-auth-manifest.json`,
  `generated/security/mutation-auth-inventory.md`,
  `generated/security/mutation-auth-coverage.json`,
  `generated/security/mutation-auth-coverage.md`.

Proof: main's cart/guest/source-class tests and two fresh cart-clock/snapshot
loops; quantity/remove/conversion concurrency; all existing gates; no new
diagnostics against the approved baseline. Founder approval **and main-owner
review** required before implementation. No main overwrite/reset/merge.

## 7. Held migration 360 — updated number proposal

Fresh main registry/file maximum is **369**, including
`369_tc3_ride_seed.sql`. Its 360 remains `360_occasion_descriptions.sql`.
Propose the next currently free number **370**, subject to recheck at approval:

`server/migrations/360_job_heartbeats_nullable_success.sql`
→ `server/migrations/370_job_heartbeats_nullable_success.sql`.

Only SQL: `ALTER TABLE job_heartbeats ALTER COLUMN last_success_at DROP NOT NULL;`
Touch list at renumber approval: held file rename and references in reports.
Registry edits/application are **separate, still held**; no automatic register.
Proof: fresh collision/registry check, identical SQL bytes, no executable
registry entry, and owned failure-heartbeat proof if separately approved.
No new table/column, payment change, global DDL or production operation.

## 8. Real-provider once-only proof — still proposal only

Provider documentation supports idempotency with finite 24-hour retention and
changed-payload/concurrent-key conflicts. No forever-dedupe claim.

**Additional exact-key gap:** existing QA parent sends
`commerce-qa:{runId}:{loop}:{family}`, whereas the dispatcher supplies
`cart-reminder-{outboxRowId}`. Existing deliveries therefore do not prove the
actual production row-derived key path end-to-end.

Propose a dedicated QA proof, not normal cart-reminder activation:
- Two fresh owned scenarios with distinct, explicitly reserved owned outbox IDs
  and a reviewed collision plan. Do not touch public sequences or row IDs.
- Bind the approved monitored recipient, immutable payload and actual dispatcher
  key to the private parent capability. Forward that validated key unchanged;
  no retry key rotation or payload substitution after first handoff.
- Real QA acceptance followed by owned receipt-persistence failure; demonstrate
  durable intent/visible uncertainty, zero automatic resubmissions under
  competing drains/admin attempts and expired lease/24h age.
- Separately test documented same-key/same-payload provider retry behavior only
  within approved provider retention; do not describe this diagnostic API call
  as an application auto-retry. Capture actual provider receipt/delivery evidence.
- Test lost DB acknowledgement after committed receipt; no duplicate send.
  Mark failures/rejections truthfully; wait for two clean loops.

Exact proposed touch list:
- `scripts/verification/run-commerce-qa-delivery-proof.mjs`.
- `scripts/verification/run-messaging-gate.mjs`.
- New `server/routes/__tests__/commerce-real-provider-once-proof.db.test.ts`.
- Provider/evidence and real-clock ledgers, not production dispatch code.

Before any live QA email: explicit founder sending authorization, owned scope,
recipient restriction, visible uncertain intents and reviewed key-collision
plan. No arbitrary recipient, real traveler, public drain, app startup,
payment writer, schema/registry release or global feature flag. Until then only
mocked two-loop harness verification. A genuine clock delivery is a separate
chronological proof; simulated age cannot establish next-day delivery.

**FINAL: DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**
