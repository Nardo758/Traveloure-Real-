# Commerce automation — carried-forward release blockers

**Current Part 8 decision: DEV-CLOSED WITH BLOCKERS.** The current consolidated
nine-row table (seven classified risks plus two explicit holds) is
[One risk / release-blocker table](automation-part8-verification.md#one-risk--release-blocker-table).
It links the separate [Stripe eligibility proposal #1828](commerce-stripe-provenance-proposal.md)
and [ownership proposal #1829](commerce-owner-provenance-proposal.md).
The historical entries below remain context, not permission to close UNKNOWNs.
Normal reminders and item-change delivery remain blocked; Part 9 is proposal only.

## Historical Parts 4–6 evidence and boundaries

Parts 4, 5 and 6: **DEV-CLOSED; release blocked; not RELEASE-CERTIFIED**.

DEV-CLOSED means built in development, two clean randomized readable-record
subset loops, all open gaps documented here, and release blocked. It does not
mean complete payment lifecycle coverage, real provider delivery or production
verification. Parts 7 and 8 subsequently proceeded under their separate
approvals; current Part 8 classification is linked above.

| Item | Part affected | What is needed | Approval owner / boundary |
|---|---|---|---|
| Stripe activity before local persistence or without reliable lifecycle stamps | 4–6 | Prove local recording and trusted lifecycle timing for every relevant external event. Existing birth/status rows are insufficient. | Founder approval of the separate Stripe provenance proposal; no payment edits here |
| Off-platform partner activity and ambiguous traveler correlation | 4–6 | Proven ownership and reliably stamped conversion/payment lifecycle, including partner-only residual carts | Founder approval of the separate ownership/provenance proposal |
| Fee-ledger ownership, other lifecycle/mapping gaps | 4–6 | Resolve unknown/contradictory typed sources and unproven optimization/comparison records, standalone participant state, contracts/proposals, refunds and entitlements. Content invoices/component states/partial settlements are now readable, not lifecycle-certified. | Separate provenance design and implementation approval from founder |
| Historical birth-only or nullable lifecycle evidence | 4–6 | Audit authoritative updates for Trip Pass renewal, ready-made/template purchases, expert tip/request and every other source; never infer complete lifecycle activity from a stored timestamp | Separate provenance approval; missing dependencies/timestamps/owners stay UNKNOWN |
| Final payment read → provider handoff | 6 | Retain and measure the approved marketing-only exception. Fresh synthetic ordinary windows are 0.325/0.288 ms; deliberately delayed windows are 19.851/18.762 ms. Neither is a production upper bound. | Marketing exception already approved; release still requires provenance and provider proof |
| Must-have item-change payment/send ordering | 5–6 | Separately prove/approve the trusted eligibility instant and ordering. Current eligible rows remain pending with `must_have_payment_ordering_unknown`; the marketing exception is not extended to them. | Founder, separate ordering/provenance track |
| Normal cart-reminder sending blocked; sweep development-only | 4–6 | Keep the verification and production-send gates closed. Meeting DEV-CLOSED does not activate schedules or real transport. | Explicit founder release approval, after release requirements |
| Real network boundary and provider once-only guarantees | 5–6 / 9 | Actual `sendEmail` adapter → mocked Resend SDK method is now proven in isolation (see below). Still prove real provider idempotency, retries, ambiguous acceptance/DB-commit failures, dead-letter/admin-digest behavior and durable once-only outcomes | Separate retry proof scope / Part 9 approval; no real email in this pass |
| Accepted cart email followed by database failure | 4–6 / 9 | Isolated tests reproduce duplicate submissions after a failed cancellation write or a newer retry claim, lost acceptance evidence after rollback, and a misleading cancellation return after a committed send. Synthetic deduplication is not a real-provider guarantee. | Separate founder-approved runtime proposal; release remains blocked |
| Real delivered emails and receipt IDs | 4–6 / 9 | Delivered-message receipts and provider evidence; currently zero real sends/receipts | Part 9 approval using secure monitored QA inboxes |
| Content/rendering and authenticated browser journeys | 5 / later proof | Language/fallback and email-client rendering matrix; authenticated link and unsubscribe flows. Native success-route tests do not prove authentication middleware or browser navigation. | Later proof scope approval |
| Operational visibility and production checks | Release | Authenticated admin visibility, provider outcome counts, production safety and timing checks | Founder deployment/release approval; production untouched |
| Held heartbeat migration | 3 infrastructure / release | Separate registration/deployment decision for the existing held nullable-success SQL. No migration is registered or applied to persistent schemas here. | Founder; boot/release work is separate |
| Value-only change detection and absent historical snapshots | 5 | Preserve documented unobserved A→B→A and target-repeat limits. Missing snapshots/stamps are skipped, never guessed. Any stronger event-history design needs separate approval. | Founder for any expanded design |

## What is no longer an open development blocker

- Actual existing signed webhook action, including its real event processor:
  three same-event deliveries; one processed event; no stale cart reminder.
- Actual existing `/confirm-payment` action: webhook-first, success-first and
  concurrent execution, two fresh loops; mocked Stripe retrieval only.
- Send-time check exceptions, real SQL transaction abort and timeout: persisted
  `check_failed`, zero transport invocation and no later retry resurrection.
- Marketing local-window boundary, final-read crossing, exact-minute hold:
  19:59 allowed, 20:00/08:59 held; no cancellation for quiet hours.
- All 21 presently inventoried readable source descriptors have fresh subset
  proof. This does not certify UNKNOWN sources or writer lifecycle reliability.


## Provider-failure evidence — 2026-10-10

Founder approved the tests-only touch list and the ambiguous-outcome policy
before implementation. Runtime services, payment writers, persistent schemas,
production, schedules and feature flags were not changed. No real sends.

**Test execution passed; the absence-of-duplicate-submission safety claim did
not pass.** These are explicit characterization tests of known blockers, not
release gates that certify safe behavior.

- `server/routes/__tests__/commerce-provider-failure.db.test.ts`: seven scenarios
  in each of two fresh-fixture loops, using the existing queue, immediate
  dispatch, scheduled drain and admin retry paths.
- `server/__tests__/commerce-provider-idempotency.test.ts`: actual `sendEmail`
  adapter with the Resend SDK method mocked. It forwards the original key
  `cart-reminder-${outboxId}` unchanged; different rows have distinct keys.
- Final focused run: **16/16 tests passed**, zero network invocations, verified
  development target, empty constraint-preserving isolated schema created and
  removed. No test runner edit was needed; it already accepts explicit files.
- Retained send-time and addendum suites also passed in the combined run:
  UNKNOWN payment coverage, must-have ordering holds, normal-send blocking,
  quiet hours and pre-handoff faults remain intact.
- Typecheck remains at the existing **117 diagnostics**, with no diagnostics in
  either new test file. This is not a clean project-wide typecheck.

Counts below are **per scenario, per loop**. Provider acceptances are a mock
ledger, not Resend receipts or recipient delivery evidence.

| Scenario | Submissions | Synthetic acceptances | Durable outcome / finding |
|---|---:|---:|---|
| Healthy send held in flight; competing worker/admin claims | 1 | 1 | `sent`, receipt retained; competitors claim zero locked rows |
| Acceptance, then real SQL statement abort | 1 | 1 | `cancelled/check_failed`; later dispatch cannot retry, but acceptance receipt and attempt were rolled back |
| Acceptance, then PostgreSQL COMMIT rejected by a fixture-only deferred trigger | 1 | 1 | Same cancellation; actual deferred COMMIT failure observed, not a mock transaction rejection |
| Real COMMIT succeeds, client acknowledgement is synthetically lost | 1 | 1 | Row remains `sent` with receipt; function incorrectly returns `cancelled` |
| SQL abort, then fallback cancellation write fails | 2 | 1 | Generic outbox catch first records retryable `failed` despite acceptance; competing retries claim once and submit again with the same key |
| New retry finishes before stale fallback cancellation | 2 | 1 | New `sent` row survives stale fallback; duplicate submission still occurred |
| New retry lease exists before stale fallback, with verification transaction paused | 2 | 1 | Stale fallback leaves newer `processing` lease intact; retry then submits again and persists `sent` |

The statement-abort fault is injected **after mocked provider acceptance** by
executing invalid SQL on the actual transaction connection. The deferred trigger
exists only in the disposable fixture schema. The lost-acknowledgement injection
is deliberately separate from confirmed rollback. Durable outcomes are read
through an independent database pool; concurrency is synchronized with barriers,
not timing guesses. Lease expiry is simulated by changing fixture rows only.

The mock records every invocation, checks identical payloads on repeated keys,
and deduplicates its acceptance ledger. **Two submissions and one mock acceptance
must not be described as “sent once.”** Real key retention, expiry, payload
conflicts, provider reconciliation and delivered-message proof remain open.
Similarly, `cancelled/check_failed` after acceptance does not mean “unsent”:
the provider accepted; local acceptance evidence was lost.

## Provider-free SDK adapter proof — 2026-10-10

Founder approved exactly these three files: the new
`server/routes/__tests__/commerce-send-email-sdk.vitest.ts`, its
`vitest.commerce-send-email-sdk.config.ts`, and this report. No existing service,
payment, schema/migration, flag, schedule or production configuration was changed.

The new suite keeps the existing `sendEmail`, commerce verifier, transport
wrapper and messaging registry real. Only the actual Resend `Emails.send`
prototype method is mocked; SDK HTTP submission and network fetch are separately
blocked and asserted unused. It uses an empty, constraint-preserving disposable
development schema, isolated serial defaults and a no-public-fallback search
path. The development target must match an independently supplied fingerprint
before fixture creation. The schema is removed after the suite.

**Result: 16/16 passing checks, comprising two fresh randomized eight-case loops.**

- A thrown commerce check and an actual failing SQL read both return
  `check_failed` through the adapter with zero SDK send calls.
- A timed-out check returns `check_failed` / `check_timeout`; its original
  delayed action completes the final payment read after release without
  resuming SDK send.
- An unsubscribed cancellation reaches the adapter but not SDK send; its
  persisted cancelled outbox row remains unsent through direct/admin replay.
- A replaced server-owned cart sequence returns `superseded` through the
  adapter with zero SDK send calls.
- An eligible readable-record-subset queued marketing row reaches the actual
  adapter through the existing test-only dispatcher seam and invokes mocked
  SDK send exactly once. Recipient, rendered content and idempotency key match;
  the internal guard is not forwarded. Direct/admin replay leaves that count
  at one.
- Turning off the isolated subset override still returns
  `payment_rail_unknown` with zero SDK send calls.
- A must-have item-change row remains pending with
  `must_have_payment_ordering_unknown` and zero SDK send calls.

Run only against the independently verified development target:

```sh
MESSAGING_DEV_FINGERPRINT=<verified-development-fingerprint> \
  npx vitest run --config vitest.commerce-send-email-sdk.config.ts
```

Full repository typecheck still reports the existing 117 errors; neither new
file adds a diagnostic. SDK response IDs in this suite are explicitly mocked,
not delivery receipts. There were zero real email submissions or delivery
receipts. This closes only the isolated adapter-to-mocked-SDK proof gap, not
network/provider once-only guarantees, the UNKNOWN payment rails, must-have
ordering, production verification or Part 9 real-delivery evidence. Parts 4–6
remain **DEV-CLOSED, not RELEASE-CERTIFIED**. Part 7 has not started.

## Readiness

**READY FOR PART 7** under the founder's DEV-CLOSED definition only.
All retained and new Part 6 tests passed two consecutive clean randomized
loops; fresh golden suite 143/143, guards 78/78, typecheck unchanged at 117.
Every deferred gap is explicit above. Part 7 must still be supplied by the
founder before work begins.

## Separate runtime proposals — not implemented or authorized

1. Preserve acceptance/ambiguous-outcome evidence and stop treating a post-
   acceptance persistence or cancellation error as an ordinary retryable send
   failure. Design lease-fenced recovery/hold behavior before changing
   `commerce-send-verification.service.ts` or `email-outbox.service.ts`.
   Require separate founder approval; do not silently add real transport.
2. Make the reported outcome agree with durable state after an uncertain COMMIT:
   propose guarded readback/reconciliation instead of returning cancellation
   when the row is already committed `sent`. Keep a newer claim authoritative
   and do not infer non-delivery from missing local evidence.

Neither proposal extends the marketing payment-ordering exception to must-have
mail, clears UNKNOWN sources, starts Part 7, or authorizes release.

Reproduce the focused proof with the existing verifier, after independently
obtaining the development database fingerprint:

```sh
MESSAGING_DEV_FINGERPRINT=<independently-verified-development-fingerprint> \
  node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/routes/__tests__/commerce-provider-failure.db.test.ts \
  server/__tests__/commerce-provider-idempotency.test.ts
```
