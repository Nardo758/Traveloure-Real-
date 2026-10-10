# Part 6 — Verify at send

Status: **DEV-CLOSED; not RELEASE-CERTIFIED; release BLOCKED**.

**READY FOR PART 7 — development progression only.** Parts 4, 5 and 6 meet the
founder's clarified DEV-CLOSED definition. Part 7 has not started and will not
start until the founder supplies it.

DEV-CLOSED means implemented in development, two clean readable-record-subset
loops, every open gap documented as a release blocker, and release blocked.
RELEASE-CERTIFIED requires every rule, no UNKNOWN rails, real delivery proof
and production checks. None of Parts 4–6 claims RELEASE-CERTIFIED.

The single [carried-forward release blocker table](automation-release-blockers.md)
is authoritative. Real delivery proof belongs to Part 9. Provenance proposals
remain separate and unapproved for implementation.

## Completion pass: current implementation

- Reused the existing shared read-only paid reader; no second payment checker,
  new mapping or payment writer change. Twenty-one readable descriptors remain
  readable subsets, not certified lifecycle coverage.
- Exceptions, malformed/unknown read results and bounded timeouts fail closed
  with `check_failed`. Raw exception messages are not persisted in recipient
  metadata. A timed-out read has no late transport continuation.
- Real SQL failure rolls back the verification transaction. Its cancellation
  reason is persisted afterward only for the exact original processing lease;
  it cannot overwrite a newer claim or resurrect a terminal row.
- Marketing window is checked during dispatch and synchronously immediately
  before synthetic invocation. Crossing 20:00 after the final payment read holds
  instead of sending; payment remains the last database read before handoff.
- Outside-window rows stay pending without a cancel reason, to the exact next
  eligible minute. An unrestricted recipient resumes at 09:00 local; stricter
  existing preferences are respected. Item-change notices are exempt.
- Item notices verify live target and quoted payload, account/recipient,
  contents/sequence and paid state. A second price change cancels as
  `item_changed`: sequence unchanged, queued quote obsolete. Eligible must-have
  notices still hold with `must_have_payment_ordering_unknown`.
- Existing atomic claims and terminal-cancellation behavior were reused,
  not redesigned. Existing email adapter/helper, registry, scheduler and outbox
  remain; no ordinary email behavior or flag was changed.

## Current per-rule proof

Each suite uses fresh randomized development fixtures and two consecutive clean
loops. Retained Part 6: 24 groups + five hostile categories per loop; addendum:
14 groups; actual-handler suite: four groups. No tests failed or were skipped
in the final pass.

| Rule | Loops / clean | Current evidence and boundary |
|---|---|---|
| paid, cart_empty, unsubscribed, item_changed | 2 / 2 | Each reason persisted; direct/drain/admin replay never sends |
| superseded, account_gone, no_email | 2 / 2 | Current identity/sequence, suspension/deletion and changed address proved |
| payment_correlation_ambiguous | 2 / 2 | Reason persisted, zero invocation |
| Default payment UNKNOWN | 2 / 2 | `payment_rail_unknown`; normal path remains blocked |
| All 21 currently readable descriptors | 2 / 2 | Fresh Part 4 proof for original 17 plus retained Part 6 proof for added four; ownership/birth/lifecycle/time boundaries, never all-rail certification |
| Pre-queue check | 2 / 2 | Stale facts/consent and read faults refuse enqueue |
| Thrown check, real SQL abort, timeout, unknown read | 2 / 2 | `check_failed`; late resolution cannot invoke transport |
| Payment before/after final read | 2 / 2 | Before cancels; after uses measured marketing-only exception |
| Repeated actual signed webhook, three deliveries | 2 / 2 | Default real event processor; one processed event, zero stale cart emails |
| Actual webhook/success action | 2 / 2 | Webhook-first, success-first and concurrent; unchanged actions, mocked Stripe retrieval |
| Sweep intentionally omits a cart | 2 / 2 | Dispatcher independently catches stale facts |
| Cancelled rows terminal | 2 / 2 | Direct, drain, admin retry, forced retry and late check completion |
| Local 19:59, 20:00, 08:59 | 2 / 2 | Sent, held, held; no quiet-hour cancellation |
| Cross 20:00 after final read | 2 / 2 | Final synchronous server-clock guard holds before invoke |
| Hold to exact eligible minute | 2 / 2 | 20:00:59 → 09:00:00, not 09:00:59 |
| Two direct dispatchers plus drain | 2 / 2 | Atomic claim and locks: exactly one synthetic marketing invocation |
| Item-change exemption and second price change | 2 / 2 | Consent off, no timezone, outside window accepted for verification; paid/account/cart/recipient safeguards remain; obsolete quote cancels |
| Must-have payment/send ordering | 2 / 2 safe hold | Actual ordering is an explicit carried-forward release blocker; no must-have provider handoff |
| Real provider/network and delivery receipts | Deferred | Explicit release blocker; real delivery belongs to Part 9, not silently skipped |

Actual-handler tests invoke existing route actions, including genuine webhook
signature verification and the default processor. Stripe lookup is mocked.
Success action receives an authenticated owner fixture; authentication middleware
and browser navigation are not claimed. No payment code was edited.

## Fresh measured marketing window

| Loop / scenario | Verifier return → synthetic invoke, ms | Verifier entry → invoke, ms |
|---|---:|---:|
| 1 ordinary | 0.325 | 8.880 |
| 1 deliberately delayed payment-after-check | 19.851 | 26.957 |
| 1 competing claims | 0.281 | 5.749 |
| 2 ordinary | 0.288 | 6.715 |
| 2 deliberately delayed payment-after-check | 18.762 | 24.953 |
| 2 competing claims | 0.349 | 6.265 |

Delayed cases contain a recorded payment update and at least 15 ms injected pause.
These measure synthetic SDK invocation, not network delivery, a production upper
bound or exact SQL snapshot age. The recorded SQL instant is statement start,
not a globally trusted eligibility instant. Acceptance applies to marketing only.

## Fresh Part Gate and regressions

| Gate | Development status | Evidence / release limit |
|---|---|---|
| G1 Trigger | PASS | Fresh Part 4/5 selection and pre-queue safety; payment UNKNOWNs retained |
| G2 Recipient | PASS | Account/email/ownership/guest safeguards; browser/auth proof deferred |
| G3 Content | PASS | Facts and item envelope; full language/client rendering deferred |
| G4 Once-only | PASS | Atomic claims and actual handler replays; provider ambiguity deferred |
| G5 Cancellation | PASS | Every required reason plus ambiguity/check failure; terminal retries |
| G6 Consent/limits | PASS | Marketing window/cap/priority; item exemptions; exact-minute holds |
| G7 Failure | PASS | SQL abort, JS failure, timeout and unknown read; no send on error |
| G8 Concurrency | PASS | Payment/send orders, real handler actions and competing dispatchers |
| G9 Observability | PASS | Reasons/status/retry and measured window; admin/production proof deferred |
| G10 Proof | PASS for development | Two clean fresh loops per suite; real delivery deferred to Part 9 |

- Final native batch: **7/7 native test cases passed across six isolated schemas**;
  each retains its two-loop protocol, including Part 4 native and pure-policy loops.
- Fresh golden: **143/143 passed**, 13 stages; no failed/skipped tests.
- Fresh guard batch: **78/78 passed**, after a provider-free temporary build.
- Typecheck: **117 before / 117 after**, identical locations/codes; zero errors
  in changed files. Baseline not raised; global typecheck is not clean.
- Development app restarted once and rendered normally in a fresh screenshot.
  Two signed-out requests returned 401. This pass does not claim a new captured
  boot migration count.
- Six disposable schemas removed. Zero real Stripe API calls, provider sends,
  delivered emails or receipt IDs. Synthetic transport is not delivery.

## Completion-pass touch list and failures

Runtime modified:
- `server/services/commerce-send-verification.service.ts`
- `server/services/marketing-delivery-policy.service.ts`

Tests:
- Modified `server/routes/__tests__/commerce-verify-at-send.db.test.ts`
- New `server/routes/__tests__/commerce-send-addendum.db.test.ts`
- New `server/routes/__tests__/commerce-payment-handler-replay.db.test.ts`

Reports/evidence:
- `reports/automation-part4-verification.md`
- `reports/automation-part5-verification.md`
- This report and `reports/automation-part6-evidence/verification.json`
- New `reports/automation-release-blockers.md`

No change to the approved optional `email.service.ts` was needed.
No registry, CI or claim-writer edits; existing test wiring guard passes.
Temporary verification worktrees reuse only the four retained Part 1 test/report
harness files over current runtime, not retired runtime/outbox/registry copies.
The standing closure definition was saved in existing project memory before
implementation approval; it is not a runtime change.

Refused/untouched: payment/checkout/booking/cart-authoring writers, payment
metadata, schema/migrations/registration, production, secrets and feature flags.
Existing held heartbeat SQL remains unregistered.

Failures remain explicit:
- A new time assertion appended `Z` to an already normalized timestamp and
  failed with `Invalid time value`. SQL-formatted UTC assertion fixed the
  test, not hold behavior; final two fresh loops passed.
- Optional guard invocation mistakenly used `--guards` instead of
  `--guards-only`. It selected the default suite without DB authorization,
  refusing those stages before fixture writes. Correct guard invocation passed
  78/78; this is not hidden as an initial clean run.
- Temporary build succeeded with existing import.meta/CommonJS warnings.

**Final: READY FOR PART 7.** All three parts are DEV-CLOSED, no required
development rule silently skipped, all release gaps named in one table.
Part 7 remains unstarted until supplied.

---

# Historical Part 6 report — preserved, superseded by the completion pass above

The sections below retain prior measurements, touch lists and failures.
Prior OPEN handler tests and implementation-only status are historical, not
the current status. Current proof and release blockers are defined above.

## Changes

- One shared live-data verifier is used before commerce enqueue and inside the
  existing dispatcher. The sweep also records the shared verifier's skip reason.
- Live checks cover account state, email identity, marketing consent, owned cart
  contents, sequence/activity, catalog price and availability, and the shared
  read-only payment-activity check.
- Reminder facts are server-generated. Their comparison is canonical across
  PostgreSQL JSONB key ordering; changed or malformed facts fail closed.
- Item changes additionally verify the target item, add-time capture identity,
  title, notified values, previous values and the actual subject/HTML/text.
  Marketing unsubscribe does not disqualify an otherwise eligible item change.
- Cancel reasons persist on the outbox row. Direct delivery, the drain and admin
  retry use the same guarded dispatcher. Forced retries cannot resurrect a row
  with a cancellation reason.
- Eligible item-change rows remain pending with
  `must_have_payment_ordering_unknown`. They are NOT handed to a provider.
- A shared last-check callback boundary exists in the email adapter. Synthetic
  marketing tests use that boundary; production SDK/network integration is not
  claimed. Rendering occurs before the last check. Missing/malformed guard
  decisions fail closed.

## Read-only payment coverage and its limits

The existing 17 readable source descriptors remain, with four additional mappings:

| Source | Ownership | Readable timestamps | What remains unproven |
| --- | --- | --- | --- |
| Content invoices | Existing `customer_id` | Birth/update; non-null `paid_at` | All lifecycle writers reliably stamping activity |
| Booking component states | Existing canonical booking → traveler | Birth/update; non-null delivery/acceptance/completion/failure/cancellation/refund dates | Completeness of those lifecycle stamps |
| Bundle partial settlements | Existing canonical booking → traveler | Birth/update; non-null claim/settlement dates | Completeness of lifecycle stamps |
| Typed fee ledger | Explicit service-booking discriminator and source join; optional booking must agree | Append-only birth | Other source kinds and contradictory/dangling ownership |

A birth timestamp is not proof of subsequent lifecycle activity. Nullable owners,
timestamps, missing dependencies and ambiguous correlation remain UNKNOWN.
Untyped fee IDs are never assigned to a traveler merely because an unrelated
booking has the same ID.

The three retained global blockers remain:

1. External Stripe activity before local persistence, and unstamped lifecycle.
2. Partner/off-platform activity without a reliable local update.
3. Incomplete fee-ledger ownership provenance.

**Twenty-one readable descriptors do not constitute all-rail certification.**
The recorded-readable-subset override works only in a disposable development
test schema and does not bypass the production boundary.

## Per-rule final proof

Each final loop uses new randomized account/cart/item/sequence fixtures. The
native Part 6 suite has **24 check groups and five hostile categories per loop**.

| Rule | Final loops | Consecutive clean loops | Scope/result |
| --- | ---: | ---: | --- |
| `paid` cancellation | 2 | 2 | Recorded payment signal; reason stored |
| `cart_empty` cancellation | 2 | 2 | Live cart removed |
| `unsubscribed` cancellation | 2 | 2 | Marketing only |
| `item_changed` cancellation | 2 | 2 | Changed price/stock/facts or quoted payload |
| `superseded` cancellation | 2 | 2 | Replaced sequence |
| `account_gone` cancellation | 2 | 2 | Missing/suspended identity |
| `no_email` cancellation | 2 | 2 | Missing/changed recipient |
| Payment before final check | 2 | 2 | Cancels, zero transport invocations |
| Payment after final check | 2 | 2 | Accepted marketing-only window measured |
| Three repeated recorded Stripe-like signals | 2 | 2 | No duplicate email; **not actual webhook replay** |
| Concurrent recorded success signals | 2 | 2 | No duplicate email; **not actual webhook/success-page execution** |
| Concurrent delivery claims | 2 | 2 | Exactly one synthetic marketing invocation |
| Deliberately skipped sweep | 2 | 2 | Dispatcher still cancels stale item facts |
| Cancelled-row direct/drain/admin replay | 2 | 2 | No resurrection or later send |
| Pre-queue item and reminder checks | 2 | 2 | Stale item facts/withdrawn consent refused |
| Item-change consent exemption and timing hold | 2 | 2 | Checked, still no must-have provider handoff |
| Four added read-only mappings | 2 | 2 | Owner/other owner, inclusive time boundary, lifecycle/ownership gaps |
| Canonical/malformed JSONB facts | 2 | 2 | Reordered keys accepted; changed/malformed content refused |
| SDK-boundary guard function | 2 | 2 | False/null/malformed decisions never invoke synthetic transport |
| Retained Part 3 sweep regression | 2 | 2 | Complete catalog fixture; controlled clock; original assertions retained |
| Actual Stripe webhook replay | 0 | 0 | **OPEN** |
| Actual webhook + success-page concurrency | 0 | 0 | **OPEN** |
| Must-have payment/send ordering | 0 | 0 | **BLOCKED; not inferred from marketing proof** |
| Real delivered emails/provider receipts | 0 | 0 | **OPEN; real sends not authorized in this bounded scope** |

Hostile cases per loop: legacy row without server facts, forged digest, forced
retry of a cancelled row, last-verifier failure, and attempted default-UNKNOWN
or production bypass. Additional variations cover corrupted target values,
corrupted quoted HTML, reordered keys and malformed item arrays.

## Measured marketing window

Final recorded-payment SQL returns its database **statement-start timestamp**.
That is not an exact global eligibility timestamp and does not establish
external payment completeness or cross-source lifecycle reliability.

The monotonic measurement is taken immediately before invoking synthetic
transport. The final payment read lies within the full verifier duration:

| Loop/scenario | Verifier return → invocation (ms) | Verifier entry → invocation (ms) |
| --- | ---: | ---: |
| 1, ordinary | 0.063 | 5.893 |
| 1, deliberate payment-after-check pause | 20.022 | 26.162 |
| 1, competing claims | 0.009 | 5.581 |
| 2, ordinary | 0.011 | 6.275 |
| 2, deliberate payment-after-check pause | 18.898 | 24.102 |
| 2, competing claims | 0.010 | 7.052 |

The deliberately paused tests include a recorded payment update and at least
15 ms of injected delay. They prove the accepted ordering, not a production
latency bound. These figures are **synthetic SDK-invocation measurements**, not
HTTP transmission, delivery receipt or exact SQL-snapshot-age measurements.
The approved exception applies to marketing only.

## Regression and guard results

- Golden baseline before: **143/143 passed**.
- Golden after current runtime changes: **143/143 passed**.
- Existing guard batch after building the temporary verification bundle:
  **78/78 passed**.
- Development app restarted once and served the landing page successfully.
  Boot reported **zero newly applied migrations**. The signed-out screenshot
  rendered normally; its two unauthenticated requests returned 401.
- Typecheck: **117 before / 117 after**; identical diagnostic locations and
  codes, zero diagnostics in the changed files. Existing typecheck errors
  remain; this is not a claim of a clean typecheck.
- Part 4 predecessor: two native loops and two pure-policy loops passed.
- Part 5 predecessor: two native loops passed.
- Part 3 predecessor after the separately approved fixture correction:
  **two clean randomized loops passed**, including sequential/concurrent dedupe,
  success and failed heartbeats, no-due/empty sweeps, five hostile scenarios,
  registry/roster checks, unchanged legacy-job heartbeat behavior and zero
  delivery calls. Its original assertions are unchanged.

The approved additional touch was
`server/routes/__tests__/commerce-email-sweep.db.test.ts`. Its catalog fixture
now supplies fixed price, active status and availability. A disposable-test
clock fixes eligibility at noon in Tokyo; idle/current activity use that clock,
while actual heartbeat timing assertions retain real wall time. The previous
test clock is restored on cleanup. No runtime file was changed for this correction.

## Failures and corrections, not hidden

- A missing development-database fingerprint initially caused the isolation
  harness to refuse before fixture DDL. The independent development fingerprint
  was verified; no production database was involved.
- An incomplete new quiet-hours fixture was rejected; its test preferences
  were corrected.
- Raw object serialization falsely rejected JSONB round-tripped facts.
  Canonical tuple comparison fixed this; reordered/changed/malformed variations
  were re-proven.
- The old Part 5 marker-failure fixture was now rejected before insert.
  It was corrected to inject zero marker rows **after the real insert**, retaining
  rollback proof rather than weakening the assertion.
- The old Part 5 unconditional-cancellation expectation was corrected: current
  quotes are held; obsolete quotes are cancelled.
- Two bundle guards initially lacked the temporary snapshot's compiled client.
  A provider-free temporary build supplied it; the full batch then passed 78/78.
- The retained Part 3 catalog fixture originally produced
  `[candidates,enqueued,duplicates,skipped]=[2,0,0,2]` instead of `[2,2,0,0]`.
  The founder approved completing that fixture and controlling its eligibility
  clock. The corrected original assertions passed two fresh clean loops.

## Exact changed files

New:

- `server/services/commerce-send-verification.service.ts`
- `server/routes/__tests__/commerce-verify-at-send.db.test.ts`
- This report and `reports/automation-part6-evidence/verification.json`

Modified:

- `server/services/email-outbox.service.ts`
- `server/services/cart-reminder.service.ts`
- `server/services/cart-item-change.service.ts`
- `server/services/commerce-email-sweep.service.ts`
- `server/services/email.service.ts`
- `server/routes/__tests__/cart-reminders.db.test.ts`
- `server/routes/__tests__/cart-item-changes.db.test.ts`
- `server/routes/__tests__/commerce-email-sweep.db.test.ts` (separately approved fixture-only extension)
- `.github/workflows/scheduler-jobs-gate.yml`
- The two retained provenance proposals and the existing release-boundary memory

No payment, checkout, booking or cart-authoring writer was changed. No persistent schema,
migration, migration registration, secret, environment or production change was
made. The held heartbeat migration remains unregistered. Add-time snapshots,
queued-notified markers and value-only A→B→A limits remain as in Part 5.
The native harness created and removed disposable development schemas under
the retained approval. The normal development bootstrap also ran when the
existing workflow was restarted; it is not delivery or production evidence.

**Remaining holds:** complete payment provenance, actual Stripe-handler replay
and webhook/success-page concurrency, mocked real-SDK integration, must-have
payment/send ordering, and authorized real-delivery receipts. The fixture
blocker is cleared; all UNKNOWNs, normal-send blocks and certification holds
remain active.
