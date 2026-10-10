# Part 6 — Verify at send

Status: **development-implemented; NOT certified; release BLOCKED**.

The bounded Part 6 tests passed two fresh randomized loops. A retained Part 3
fixture needs a separately approved test-only correction before the predecessor
suite is clean. No Part 7 work has started.

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
- Part 3 predecessor: **FAILED**, before completing its first loop. Its minimal
  catalog fixture omits price; the strengthened pre-queue check skips the two
  candidates. Actual `[candidates,enqueued,duplicates,skipped]` is
  `[2,0,0,2]`, rather than the old `[2,2,0,0]` expectation. Its assertions have
  NOT been weakened and the file has NOT been edited.

The requested additional touch is
`server/routes/__tests__/commerce-email-sweep.db.test.ts`: complete the catalog
fixture and make its eligibility clock deterministic, retaining all original
idempotency/heartbeat/roster assertions. This is outside the approved Part 6
file list, so it remains paused for approval.

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
- The retained Part 3 catalog-fixture failure is still open as described above.

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
- `.github/workflows/scheduler-jobs-gate.yml`
- The two retained provenance proposals and the existing release-boundary memory

No payment, checkout, booking or cart-authoring writer was changed. No persistent schema,
migration, migration registration, secret, environment or production change was
made. The held heartbeat migration remains unregistered. Add-time snapshots,
queued-notified markers and value-only A→B→A limits remain as in Part 5.
The native harness created and removed disposable development schemas under
the retained approval. The normal development bootstrap also ran when the
existing workflow was restarted; it is not delivery or production evidence.

**Current stop:** approval for the single retained Part 3 test-file extension.
All UNKNOWNs, normal-send blocks and certification holds remain active.
