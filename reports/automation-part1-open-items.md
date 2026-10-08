# Part 1 — open-item verification report

**Actual reset-expiry update:** after the native 60-minute deadline, the retained issued token was rejected with HTTP 400. This is native API proof; browser expiry remains unverified.

Checked 2026-10-08T18:55:27.562Z. **PART 1 REMAINS OPEN. No production certification; Part 2 not started.**

## Scope and changes

Only new test/verification/report files and our prior reports changed. Application runtime, authoritative writers, production, payments, fee policy, secrets and registered migrations are unchanged. Approved randomized fixtures live in a retained isolated development schema; no public-table customer data was copied. Monitored-inbox substitution happens only at the development harness's provider boundary. Production never receives this substitution. No recipient addresses or credentials are included here.

## Item states

| Requested item | State | Evidence / remaining gap |
|---|---|---|
| Issued-message browser links | OPEN | Native signup post-submit and account email links checked in both loops. Wrong welcome CTA reproduced. Itinerary ready HTML rendered once; actual comparison route retries ended in browser-worker timeouts. Remaining nine comparison CTAs, all wrong-owner UI checks, six unsubscribe links, and remaining renders unchecked. Not attributed to fixture absence or declared an app rejection. |
| Booking/payment writer inventory and tests | OPEN | Read-only inventory: 211 financial candidate sites across 767 scanned runtime TS files, each with source/line and coverage label. Dynamic/indirect caller completeness and untested rails remain unresolved; this is not certified exhaustive runtime coverage. Eight new native legacy scenarios ran: six once-only passes, two concurrent failures. No live Stripe write. |
| Real-clock starts | PARTIAL | Eight genuine starts, two real-clock native/provider passes, six WAITING. Stopped scheduled-job recovery not started. Future WAITING alone is not a closure blocker. |
| Per-type gates and attacks | OPEN | 11 built types, 110 gate entries and 132 scenario entries, each with loop states/counts/limitations. Zero whole automations certified; no future commerce type counted failed. |

## Fresh checks

- Golden loop 1: **146 PASS / 0 FAIL**.
- Golden loop 2: **146 PASS / 0 FAIL**.
- Guard batch: **76 PASS / 0 FAIL**; evidence golden-1-cb473b11-fe38-4d3c-9561-318d4caac38f/results.json.
- Project typecheck: **117 diagnostics, baseline 117**; no new harness diagnostics within project tsc scope. Project includes client/shared/server; script helpers are also executed/transpiled separately, not falsely claimed as part of that tsc scope.
- Independent current provider reads: **55/55 confirmed delivered**, all 55 HTML bodies matched issued SDK payloads. These include incidental signup/auth messages, not 55 separate automation rules or inbox-placement proof.
- Browser account journey: fresh native signup and real issued verification/reset flows checked twice; replay/tamper rejected.
- Itinerary browser continuation: unable after genuine href retries timed out and browser worker reset; no additional tester or fabricated success.

## Reproduced runtime defects — deferred, not fixed

1. **Welcome Browse experts misroutes** to /become-expert via /travel-experts in both loops. Proposed separately; no runtime change.
2. **Concurrent legacy payment-success handlers** create two traveler confirmation rows and two simulated sends with different codes; one disagrees with final booking confirmation code, both loops. Sequential triple delivery and page-before-webhook / webhook-before-page passed. Provider retrieval/email are explicit simulations for these writer tests, not G10 delivery proof.
3. **Verification/reset have no outbox row** in the native direct send path: mandatory G10 row guarantee cannot close within this authorization.
4. **Valid auth links act as bearer links** independently of signed-in account. This fails the stated strict cross-account expectation; whether that requirement applies to bearer links needs an explicit policy ruling, not an inferred vulnerability or a silent waiver.

## Native writer proof mapping

- server/routes/bookings.ts:263/370: real authenticated legacy confirm-payment HTTP path exercised in both page/webhook orderings; cart branch NOT COVERED by these cases.
- server/services/booking.service.ts: confirmBookingPayment: retained ledger/idempotency suite plus new native HTTP/core ordering tests. Provider-alert helper tests are NOT traveler-confirmation writer proof.
- server/services/stripe-payment.service.ts:918/1025/1050/1085: legacy success-core status/code mutation and traveler enqueue exercised sequentially and concurrently. Signed webhook HTTP boundary, canonical/balance/ready-made branches NOT COVERED here. Payment-intent SQL touching a nonexistent synthetic PI row is not actual payment-state mutation proof.
- server/services/email-outbox.service.ts:470: native legacy traveler enqueue used; concurrent duplicate reproduced, so coverage is not a pass.
- Credits, Trip Pass, additional admin/sweep/refund/canonical rails retain individual NOT COVERED/UNKNOWN labels in payment-writer-coverage.md. No claim that two old suites cover them.

## Real-clock records

See real-clock-ledger.md for actual start/due/check timestamps, scenario/outbox/token IDs and receipt IDs. Retry delivery: 01a11cc5-c2e5-7c22-a635-858fcfe6411e; generation-timeout failure notice: 01a11cc5-d8e3-77ed-8629-7f0e4713df60. Both provider events delivered; repeats sent nothing. No scheduler/cadence or browser expiry proof inferred.

## Evidence and limits

- automation-part1-evidence/browser-account-links.json
- automation-part1-evidence/browser-itinerary-links.json
- automation-part1-evidence/legacy-writers-loop-1.json and loop-2.json
- automation-part1-evidence/open-provider-receipts.json (IDs/statuses/body-equality only)
- automation-part1-gate-scorecard.md and payment-writer-coverage.md

Retained screenshots referenced by browser reports were masked; early unmasked/unsafe observations are excluded from evidence. No live capture, refund, production mutation, schema migration, mail registry/outbox copy, or Part 2 work was performed. Closure is blocked by reproducible defects and incomplete writer/browser/attack proof, not merely by future clock waits.

## Additional native unsubscribe HTTP proof

6/6 cases passed. Actual issued links in both loops: GET did not opt out (scanner-safe); explicit POST disabled the token's target, left the other signed-in account's preferences unchanged, repeat was safe, and tampered path token was rejected. This uses the native opaque bearer UUID, not an invented or claimed cryptographic signature. This is HTTP/state proof, **not browser proof or session-bound wrong-person denial**. Browser unsubscribe remains unverified. Evidence: automation-part1-evidence/unsubscribe-api.json.
