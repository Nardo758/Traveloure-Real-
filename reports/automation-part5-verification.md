# Part 5 — cart item changes

## Status and boundary

**DEV-CLOSED; not RELEASE-CERTIFIED; release blocked.**

The founder's clarified DEV-CLOSED definition is met by this part's own two
clean native readable-record-subset loops. The Part 6 completion pass freshly
re-ran those two loops: 20 check groups and five hostile scenarios per loop,
zero failures/skips, zero real provider calls. Every open gap is carried in
[the consolidated release blockers](automation-release-blockers.md).

The implementation and release scorecard below describe the original Part 5
scope and historical evidence. Part 6 subsequently replaced the unconditional
dispatcher family hold with live verification and the retained must-have
payment-ordering hold; it does not authorize real transport.

The approved sweep now selects price increases, price decreases and proven
availability loss, then atomically enqueues `cart_item_changed` and records
notified values. It uses existing cart JSONB, `email_outbox`, the commerce
dedupe index, recipient locking, registry and heartbeat.

No payment, booking or checkout writer, schema, migration registration,
production configuration or release switch was changed. No real email was
submitted. There is no provider receipt ID.

The Part 4 read-only paid check is unchanged. All three UNKNOWN blockers remain:
external Stripe activity before persistence, complete booking/cart ownership
correlation, and the final eligibility-read/provider-submit race. Normal cart
reminder sending remains blocked. The approved provenance investigations
remain proposals; their writer/schema recommendations were not implemented.

## Implementation

- Compare the immutable server add-time snapshot, or last queued notified
  values, against current owned provider/slot facts.
- Compare exact money values, not floating-point approximations. Unsupported
  currencies, quotes or uncertain catalog states are skipped.
- Availability means enough slot units for the cart's current requested
  quantity. Exactly enough remains available. A quantity change alone is not
  a catalog change. Notified availability retains stock facts, rather than a
  boolean that becomes misleading after quantity edits.
- Ignore display metadata, schedule formatting, JSON ordering and capacity
  reductions that leave enough units. Never overwrite the snapshot or clock.
- Missing snapshot, missing stamp, malformed quantity, changed/orphaned slot
  context and ambiguous ownership are explicit skips, not guessed backfills.
- A combined price/availability change produces one row. Its key binds owner,
  cart item, capture instant and meaningful target values.
- Insert the outbox row and update its linked notified marker in one
  transaction under the existing recipient lock. Marker failure rolls back
  enqueue. A duplicate does not advance the marker.
- Must-have notices bypass marketing unsubscribe, timezone/window and daily
  cap checks, but not account, ownership or payment safety.
- A notice actually marked sent suppresses cart reminders on that local day
  only. Pending notices do not suppress them; future reminder steps remain.
- Generic enqueue, dispatcher, drain and admin retry cannot send this family.
  Its dispatcher branch cancels with `cart_item_change_release_blocked`
  before provider submission. This is a release hold, **not Part 6
  verify-at-send certification**.

## Per-rule development proof

These are **two clean consecutive final randomized readable-record subset
loops**, not two production or real-delivery loops. The isolated test-only
recorded-rails seam never removes UNKNOWN blockers from the normal path.

| Rule | Final loops | Clean loops | Evidence |
|---|---:|---:|---|
| Default UNKNOWN blocks enqueue and marker | 2 | 2 | No row, no notified change |
| Price up and down | 2 | 2 | Correct direction; repeat queues nothing |
| Availability loss | 2 | 2 | Sold out; enough-unit boundary; insufficient units; no false quantity-only notice |
| Combined change | 2 | 2 | One row, linked notified marker |
| One meaningful target once | 2 | 2 | Repeated selection, sweep and concurrent enqueue |
| Snapshot and activity immutable | 2 | 2 | Before/after equality; display metadata ignored |
| Queue and marker atomic | 2 | 2 | Forced rollback, retry, ID-link assertions for up/down/combined |
| No snapshot/stamp | 2 | 2 | Recorded skip; no backfill |
| Must-have bypass | 2 | 2 | Unsubscribed, unknown timezone, 01:00, existing marketing cap |
| Account/ownership/payment safety | 2 | 2 | Deleted/suspended, cross-owner, guest/claim, inclusive paid boundary, partner ambiguity |
| Same-day cart suppression only | 2 | 2 | Part 4 native loops: pending not suppressed; sent suppressed; later 3d still eligible |
| Fault heartbeat and recovery | 2 | 2 | FAILED after query fault, then genuine success |
| Real transport blocked | 2 | 2 | Zero provider calls through generic/drain/admin paths; production gate refuses |
| All-rail unpaid certification | 0 | 0 | **OPEN — unchanged UNKNOWNs** |
| Real delivery/link/unsubscribe proof | 0 | 0 | **OPEN — no-email boundary** |

## Master scorecard

No gate is claimed fully closed merely because a queue assertion passed.
**RELEASE-CERTIFIED: NO; do not release.** This release scorecard is not the
DEV-CLOSED gate.

| Gate | Status | Proven / still missing |
|---|---|---|
| G1 Trigger | Partial | Price/stock selection and fail-closed defaults proved; complete rail eligibility OPEN |
| G2 Recipient | Partial | Current owned QA account, known email, guest/claim and deleted/suspended checks; changed-address/bounce send-time proof OPEN |
| G3 Content | Partial | Escaped title, unit-price facts, plain text/HTML, safe absolute `/cart` link; language/fallback matrix and email-client rendering OPEN |
| G4 Once-only | Partial | Unique queue target, concurrent queue and rollback/retry; actual provider once-only proof OPEN |
| G5 Cancellation | Partial | Account/paid selection guards and unconditional family release hold; real mid-send cancellation/supersession OPEN |
| G6 Consent/limits | Partial | Must-have selection bypass and same-day cart suppression; real cross-family delivery ordering OPEN |
| G7 Failure | Partial | Query failure/FAILED heartbeat and recovery; this family's provider retry/dead/admin-digest proof OPEN |
| G8 Concurrency | Partial | Two enqueue workers, marker rollback, repeated sweeps; action-versus-provider-submit orderings OPEN |
| G9 Observability | Partial | Sweep counters/reason codes, heartbeat and held-row cancellation; authenticated admin visibility and real sent counts OPEN |
| G10 Real proof | OPEN | Zero real emails, no provider receipt; authenticated email-link and unsubscribe browser flows not proved |

Structural release risk remains the incomplete payment/owner provenance and
send-time race. More identical queue loops cannot close those gaps. Part 6 was
separately approved; writer redesign and release activation are not authorized
by this report.

## Scenarios and hostile cases

Each final loop used fresh randomized owners, plans, services, cart items and
sequences. Each has 20 named check groups and these five hostile scenarios:

1. Orphaned selected slot: no inferred replacement.
2. Cross-owner plan: no enqueue.
3. Custom-quote price: no guessed numeric change.
4. Currency, decimal and JSON semantics: uncertain data skipped, harmless
   formatting ignored.
5. Catalog-query fault: FAILED heartbeat, not an empty green run; recovery
   records real success.

Additional stock attack: remaining units below requested quantity even while
the slot still has space. Variations cover exactly enough, insufficient,
further depletion, quantity-only edits, and later loss after a queued notice.
Legacy null/zero/negative quantities fail closed.

| Master family | Coverage |
|---|---|
| S1 | Supported happy-path queue cases; real send OPEN |
| S2 | Repeated selection, repeat sweep, concurrent queue, retry after rollback |
| S3 | Concurrent enqueue proved; full send races OPEN |
| S4 | Deleted/suspended and recorded activity suppression; send supersession OPEN |
| S5 | Must-have bypass and marketing-day interaction; language fallback OPEN |
| S6 | Guest/claim, owned account and deleted/suspended; changed email/bounce at send OPEN |
| S7 | Missing snapshot/stamp, malformed quantity, escaping and uncertain catalog data; full content matrix OPEN |
| S8 | Query fault and transaction rollback; provider outage/dead/digest OPEN |
| S9 | No one-hour idle requirement for item changes; restart smoke; stopped-job/DST/real-send recovery OPEN |
| S10 | Ownership, isolation, generic-send and production guards; authenticated link/token/rate-limit matrix OPEN |
| S11 | HTML/text assertions; `/cart` guest-page screenshot; email-client mobile/desktop/dark-mode OPEN |
| S12 | Golden and native predecessor suites pass |

## Loop and correction log

The native harness was invoked four times, with fresh fixtures for each
invocation. Re-proofs are retained as such, not described as delivered emails.

| Verification attempt | Result and correction |
|---|---|
| Initial proof | Failed in first loop: raw PostgreSQL outbox ID is a string, JSON marker ID a number. Normalized the assertion; added down/combined marker-link variations. The separate reminder proof also needed prior 1h/1d history to test 3d. |
| Corrected proof | Two clean readable-subset loops. Hostile review subsequently found insufficient-requested-unit stock was not distinguished from any stock remaining. |
| Stock re-proof | Two clean fresh loops after preserving stock facts and quantity-aware comparison. Typecheck then found two unknown-to-number arguments. Added explicit integer validation, not an unchecked cast. |
| Final re-proof | Two clean fresh loops including malformed quantity variations; no new attack finding. Final typecheck is at baseline. |

Final native scenario IDs:
- `ba78fe95-94dd-4c70-a715-4f150dd822c3`
- `34c46b17-1d7a-40c7-a08b-d73d4b0ea4e8`

The Part 4 test's original 3d expectation was a fixture defect: the existing
reminder selector chooses the earliest due **unsent** step. Its runtime
behavior was not changed.

## Known limits

- A→B→A entirely between observations is invisible. No event history is
  invented.
- An observed return to a target value already noticed for the same item and
  capture instant is deduped; it is not a new historical event version.
- Catalog deletion or slot identity/schedule changes that remove reliable
  comparison context cannot be called a proven availability loss. Such items
  are absent or skipped. Snapshot JSON does not retain the selected slot ID.
- Supported evidence is current USD numeric provider prices and trustworthy
  slot/status facts. Quote, currency and context ambiguity stay explicit.

## Touch list

Added:
- `server/services/cart-item-change.service.ts`
- `server/services/cart-item-change-email.ts`
- `server/routes/__tests__/cart-item-changes.db.test.ts`
- `reports/automation-part5-verification.md`
- `reports/automation-part5-evidence/verification.json`
- `reports/automation-part5-evidence/guards.json`

Changed:
- `server/services/cart-email-state.service.ts` — additional read-only clock helper
- `server/services/commerce-email-sweep.service.ts` — item-change branch and separate counters
- `server/services/email-outbox.service.ts` — atomic queue/marker helper and family hold
- `server/services/marketing-delivery-policy.service.ts` — sent-local-day lookup
- `server/services/cart-reminder.service.ts` — same-day item-notice suppression only
- `server/automations/messaging/commerce-email-sweep.ts` — existing descriptor
- `server/routes/__tests__/cart-reminders.db.test.ts` — new suppression proofs
- `.github/workflows/scheduler-jobs-gate.yml` — one new native suite beside existing selectors

No files deleted, no modules replaced, no second outbox/registry/scheduler.
Existing project memory was updated with the stock-facts decision only.

## Regression and evidence

| Check | Result |
|---|---|
| Golden BEFORE | 143 passed, 0 failed |
| Golden AFTER stock change | 143 passed, 0 failed |
| Final Part 5 native | 1 native test; two fresh 20-group loops; 0 failed/skipped |
| Part 4 native | 2 tests passed, 0 failed/skipped; existing two-loop protocol retained |
| Part 3 native | 1 test passed, 0 failed/skipped |
| Final guard batch | 78/78 passed |
| Typecheck | Before 117; final 117; changed-file diagnostics 0. Not a globally clean typecheck. |
| Disposable schemas | Removed by all completed native runs |
| Development app | Restarted; guest `/cart` rendered; anonymous auth probes returned expected 401s |
| Real emails / receipts | 0 / none |

Golden checks ran in a temporary worktree with the four retained
verification-only harness files. No retired harness files were restored into
the workspace. The final small type-narrowing guard does not change the
golden's valid-quantity paths; final native proofs cover its rejected legacy
quantities.

Machine-readable results:
- `automation-part5-evidence/verification.json`
- `automation-part5-evidence/guards.json`

Production was not changed or published. The held commerce migration remains
unregistered.
