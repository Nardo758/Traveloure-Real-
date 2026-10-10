# Part 8 scenario proof and fault testing

**Current status: DEV-CLOSED WITH BLOCKERS.** 100 rows closed within the documented readable-record scope; the seven historical structural-risk rows remain listed. One is now an accepted, measured inventory residual for marketing reminders only; six remain carried-forward release blockers. This is not RELEASE-CERTIFIED, not an all-rail claim, and not authorization to start Part 9.

Run: e2070336-632d-4d4d-baec-c72125184de2

Development-only, provider-free, fresh randomized scenarios in disposable schemas. The existing database harness owns isolation and cleanup. No runtime, payment writer, checkout, production, feature flag, sender or migration registration changed.

**Scope:** closed payment rows prove recorded birth-signal behavior for named readable descriptors, not execution of authoritative payment writers or all-rail coverage. Fail-closed UNKNOWN tests do not close the all-rail obligation. Actual-handler rows are separate from recorded-signal simulations. Must-have delivery holds are preserved.

The idle boundary is inclusive at 60 minutes / 1 day / 3 days. A 15-minute scheduler normally sends the first reminder at 60–75 minutes; no time compression is used. Price equality means no change; ±1 integer cent is the existing rule, not a new threshold.

## Every matrix row

| ID / rule | Scope | Attempted loops | Clean loops | Current streak | Status |
|---|---|---:|---:|---:|---|
| enqueue.eligible — All readable eligibility conditions passing | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.unsubscribed — Enqueue rejects unsubscribed | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.suspended — Enqueue rejects suspended | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.deleted — Enqueue rejects deleted | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.no_email — Enqueue rejects no_email | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.unknown_timezone — Enqueue rejects unknown_timezone | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.empty — Enqueue rejects empty | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.reject.no_stamp — Enqueue rejects no_stamp | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1h.-1 — cart_reminder_1h: idle threshold -1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1h.0 — cart_reminder_1h: idle threshold 0ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1h.1 — cart_reminder_1h: idle threshold 1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1d.-1 — cart_reminder_1d: idle threshold -1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1d.0 — cart_reminder_1d: idle threshold 0ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_1d.1 — cart_reminder_1d: idle threshold 1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_3d.-1 — cart_reminder_3d: idle threshold -1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_3d.0 — cart_reminder_3d: idle threshold 0ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| idle.cart_reminder_3d.1 — cart_reminder_3d: idle threshold 1ms | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.step_sent — Sent step cannot enqueue again in the same sequence | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.fourth — Fourth reminder is impossible | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| enqueue.item_changed_today — Sent change notice suppresses today's reminder | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sweep.sequential — Two sweeps in a row | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sweep.concurrent — Two sweeps at once | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sweep.empty — Nothing due succeeds with zero enqueues | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.canonical_provider.before_send — canonical_provider: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.canonical_provider.after_send — canonical_provider: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.legacy_booking.before_send — legacy_booking: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.legacy_booking.after_send — legacy_booking: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.stripe_intent_ledger.before_send — stripe_intent_ledger: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.stripe_intent_ledger.after_send — stripe_intent_ledger: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.credits.before_send — credits: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.credits.after_send — credits: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.wallet.before_send — wallet: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.wallet.after_send — wallet: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.trip_pass.before_send — trip_pass: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.trip_pass.after_send — trip_pass: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.partner_request.before_send — partner_request: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.partner_request.after_send — partner_request: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination.before_send — coordination: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination.after_send — coordination: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination_booking.before_send — coordination_booking: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination_booking.after_send — coordination_booking: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination_credit.before_send — coordination_credit: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.coordination_credit.after_send — coordination_credit: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.ready_made_purchase.before_send — ready_made_purchase: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.ready_made_purchase.after_send — ready_made_purchase: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.template_purchase.before_send — template_purchase: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.template_purchase.after_send — template_purchase: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.expert_tip.before_send — expert_tip: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.expert_tip.after_send — expert_tip: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.expert_request.before_send — expert_request: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.expert_request.after_send — expert_request: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.booking_request.before_send — booking_request: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.booking_request.after_send — booking_request: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.provider_request.before_send — provider_request: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.provider_request.after_send — provider_request: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.group_transaction.before_send — group_transaction: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.group_transaction.after_send — group_transaction: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.content_invoice.before_send — content_invoice: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.content_invoice.after_send — content_invoice: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.booking_component.before_send — booking_component: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.booking_component.after_send — booking_component: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.partial_settlement.before_send — partial_settlement: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.partial_settlement.after_send — partial_settlement: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.typed_fee_ledger.before_send — typed_fee_ledger: recorded birth before synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.typed_fee_ledger.after_send — typed_fee_ledger: recorded birth after synthetic send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.cart_empty — Live cancel reason cart_empty; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.unsubscribed — Live cancel reason unsubscribed; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.account_gone — Live cancel reason account_gone; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.no_email — Live cancel reason no_email; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.superseded — Live cancel reason superseded; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.item_changed — Live cancel reason item_changed; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.payment_correlation_ambiguous — Live cancel reason payment_correlation_ambiguous; cancelled row terminal | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.suspended — Suspended account mid-sequence | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.missing_email — Email removed after queue | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| cancel.payment_rail_unknown — Unreadable payment coverage cancels an already queued reminder | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| claim.concurrent — Two dispatchers atomically claim one row; one synthetic handoff | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sellout.before_send — Sell-out before due reminder handoff | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sellout.after_send — Sell-out after due reminder handoff | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| sellout.final_read_handoff — Hostile sell-out between final read and provider handoff | readable-record-subset | 6 | 0 | 0 | STRUCTURAL_RISK |
| price.9.99 — Integer-cent price boundary 9.99 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| price.10.00 — Integer-cent price boundary 10.00 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| price.10.01 — Integer-cent price boundary 10.01 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| change.no_snapshot — Legacy cart without snapshot is skipped, not guessed | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| change.notified_once — Same catalog change queues and marks once | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| change.unsubscribed_eligibility — Change notice exempt from consent and quiet hours | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| change.unsubscribed_sent — Unsubscribed traveler actually receives change notice | unresolved-delivery-guarantee | 6 | 0 | 0 | STRUCTURAL_RISK |
| guest.claim — Guest receives nothing; authenticated claim starts reminders | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| resume.cap — New sequence ignores old step history but respects daily cap | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| quiet.08:59:59 — Quiet-window send boundary 08:59:59 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| quiet.09:00:00 — Quiet-window send boundary 09:00:00 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| quiet.19:59:59 — Quiet-window send boundary 19:59:59 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| quiet.20:00:00 — Quiet-window send boundary 20:00:00 | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| quiet.unknown_at_send — Timezone disappears after queue; no send and reason recorded | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| marketing.cart_priority — Cart beats itinerary reminder for one marketing day | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| marketing.cap_at_send — Another marketing delivery takes the day after queue: no second send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| fault.skipped_sweep — Deliberately skipped cart still cancelled by dispatcher | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| fault.candidate_query — Candidate query exception produces FAILED heartbeat | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| fault.check.initial — Dispatcher initial check throws: terminal cancellation, zero send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| fault.check.final — Dispatcher final check throws: terminal cancellation, zero send | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| payment.residual — Approved marketing-only final-read/payment residual window measured | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| stripe.recorded_replays — Three recorded Stripe-like signals never duplicate email | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| stripe.recorded_competition — Concurrent recorded success signals plus competing dispatchers | readable-record-subset | 2 | 2 | 2 | CLOSED_READABLE_SCOPE |
| unknown.stripe_activity_before_local_persistence_or_unstamped_lifecycle — All-rail coverage gap: stripe_activity_before_local_persistence_or_unstamped_lifecycle | unresolved-payment-coverage | 6 | 0 | 0 | STRUCTURAL_RISK |
| unknown.off_platform_partner_payment_without_local_update — All-rail coverage gap: off_platform_partner_payment_without_local_update | unresolved-payment-coverage | 6 | 0 | 0 | STRUCTURAL_RISK |
| unknown.fee_ledger_source_without_proven_traveler_ownership — All-rail coverage gap: fee_ledger_source_without_proven_traveler_ownership | unresolved-payment-coverage | 6 | 0 | 0 | STRUCTURAL_RISK |
| stripe.actual.replay_3x — Actual payment handlers: replay_3x | unresolved-authoritative-handler-coverage | 6 | 0 | 0 | STRUCTURAL_RISK |
| stripe.actual.webhook_success_together — Actual payment handlers: webhook_success_together | unresolved-authoritative-handler-coverage | 6 | 0 | 0 | STRUCTURAL_RISK |

## Open evidence and structural risks

- **sellout.final_read_handoff** (historical STRUCTURAL_RISK; now ACCEPTED RESIDUAL for marketing only): the original zero-send assertion failed six times. The founder subsequently accepted the measured inventory window for 1h/1d/3d reminders, not for cart_item_changed. Two new clean measurement loops are recorded separately; this is not a fix and does not turn the historical matrix into 101 closed rows.
- **change.unsubscribed_sent** (STRUCTURAL_RISK): must_have_payment_ordering_unknown; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
- **unknown.stripe_activity_before_local_persistence_or_unstamped_lifecycle** (STRUCTURAL_RISK): stripe_activity_before_local_persistence_or_unstamped_lifecycle; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
- **unknown.off_platform_partner_payment_without_local_update** (STRUCTURAL_RISK): off_platform_partner_payment_without_local_update; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
- **unknown.fee_ledger_source_without_proven_traveler_ownership** (STRUCTURAL_RISK): fee_ledger_source_without_proven_traveler_ownership; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
- **stripe.actual.replay_3x** (STRUCTURAL_RISK): authentic-handler-writer-proof-not-established; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
- **stripe.actual.webhook_success_together** (STRUCTURAL_RISK): authentic-handler-writer-proof-not-established; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.

## Evidence and release boundary

### Fresh regression checks

| Check | Result | Evidence |
|---|---|---|
| Golden regression | 143/143 reported PASS entries; 0 failures | automation-part8-evidence/golden-regression/results.json |
| Static guard batch | 78/78 PASS | automation-part8-evidence/static-guards/results.json |
| Retained Parts 2–6 suites | 13/13 top-level Node tests; 0 failures, 0 skips; grouped suites retain their two internal randomized loops | automation-part8-evidence/retained-regression.log |
| Typecheck | 117 errors, exactly the Part 1 baseline; not a clean typecheck | automation-part8-evidence/typecheck.log |
| Isolation cleanup | Confirmed for all six final matrix loops and the retained database run | Per-loop logs and retained-regression.log |

The golden total includes parent/registry/guard entries; it is **not** 143 unique database cases. Native golden artifacts were relocated into the approved Part 8 evidence directory without changing results.

### Historical inventory failure and subsequent decision

When the availability slot is filled **after the final read but before provider invocation**, the row becomes `sent` and the synthetic provider is invoked once. All six original final-loop attempts failed the zero-send assertion under the earlier payment-only exception. The founder has now expressly accepted this inventory residual for marketing reminders only. No runtime fix has been introduced; cart_item_changed remains blocked.

The accepted marketing/payment residual was measured at **26.76 ms and 27.53 ms** in the two passing scenarios. These are measured synthetic-fixture observations, **not** a production upper bound.

Two exploratory fixture-validation loops are archived separately in this directory. They exposed fixture/setup errors that were corrected before the final run: fee-ledger enum fields, an itinerary comparison's required fields, using the registered HTTP job route for failure persistence, and placing the quiet-hours check after the activity instant. The inventory failure also occurred in those two exploratory loops: **8 failing observations overall, including 6 consecutive final-loop failures**. The table above counts the final submitted run, not discarded or invented passes.

### Scope and readiness

Only the approved new tests, test runner, verification-only CI step and reports changed. Disposable setup reuses existing fixture DDL for heartbeat nullability and the commerce dedupe index; no shared development schema, production schema or migration registry changed. Direct senders and payment/checkout/booking runtime code were untouched. No real emails or external payment calls were made.

**DEV-CLOSED WITH BLOCKERS: 100 rows closed, 7 historical structural risks classified below.** The accepted marketing residual is not a fixed rule. The three UNKNOWN payment-provenance gaps, two authentic handler-coverage gaps and change-notice delivery hold are still actual release blockers. Normal commerce sending remains blocked. Part 9 has not started.

## Decision addendum: residual measurements

Evidence: `automation-part8-evidence/inventory-decision-measurements.json`, run `f0c70568-8407-4145-a438-41aee2ddef3b`, with its two referenced per-loop JSON/log files.

| Family | Availability read returned → synthetic provider invocation, loop 1 / 2 | Final verifier returned → invocation, loop 1 / 2 | Classification |
|---|---:|---:|---|
| cart_reminder_1h | 36.637 / 24.702 ms | 30.688 / 17.106 ms | Accepted marketing-only residual; not fixed |
| cart_reminder_1d | 10.548 / 15.154 ms | 4.414 / 6.066 ms | Accepted marketing-only residual; not fixed |
| cart_reminder_3d | 9.733 / 13.276 ms | 5.081 / 4.539 ms | Accepted marketing-only residual; not fixed |
| cart_item_changed | Actual handoff: N/A; held | Prospective read→boundary: 19.442 / 19.170 ms | NOT accepted; pending; zero provider calls |
| Marketing payment residual | Not an inventory read measurement | 25.628 / 31.907 ms | Existing accepted payment residual |

The item-change prospective measurement deliberately includes a slot sell-out plus a 10 ms injected delay after a read-only verifier. It is not an actual dispatcher handoff, production latency or permission to send. Both loops confirmed the actual dispatcher leaves the change row pending with `must_have_payment_ordering_unknown`.

Instrumentation observes completion of the existing cart/catalog SELECT, then the existing synthetic provider entry. It does not record a database-internal snapshot instant. The full availability gap includes the required later payment read; the smaller post-verifier gap excludes that read. Neither is a production maximum.

The existing dispatcher already renders before the final verifier, performs no reservation write after that verifier and runs the required payment read last, followed by the synchronous quiet-hours check and provider handoff. We retained that ordering: making the catalog query later or combining queries would change runtime sender behavior, which this dispatch prohibits. The test adds no runtime work.

**Two clean randomized measurement loops** passed for all three reminder steps and the held change notice; each disposable schema was removed. Four preceding measurement-fixture attempts failed (raw SQL `last_error` was mistakenly treated as a camel-case field, and one diagnostic mistakenly treated `skipped` counts as an array). Their sanitized evidence is retained; they are not clean loops and are not new payment/inventory fixes. Only the measurement test and documentation changed.

## One risk / release-blocker table

The six carried-forward rows below retain their original six attempts / zero clean loops. Recorded signals and fail-closed suppression do not close them.

| Item / matrix row | Classification | Parts affected | What is missing / what closes it | Approval owner |
|---|---|---|---|---|
| sellout.final_read_handoff | ACCEPTED RESIDUAL, marketing only; historical risk retained | 6, 8; future 9 | Measured twice as above, not fixed. Acceptance never extends to cart_item_changed. Production release still needs other blockers closed. | Founder: accepted marketing window; separate release approval |
| change.unsubscribed_sent | CARRIED-FORWARD RELEASE BLOCKER | 5, 6, 8, 9 | Exemption is verified, but actual delivery is held by must-have payment ordering. Needs approved timing/provenance guarantee, two clean genuine delivery loops, provider-delivered evidence. | Founder; payment-provenance implementation owner |
| unknown.stripe_activity_before_local_persistence_or_unstamped_lifecycle | CARRIED-FORWARD RELEASE BLOCKER | 4, 5, 6, 8, 9 | Readable local births cannot prove upstream activity or unstamped lifecycle changes. Approve and prove trusted eligibility instant / reliable provenance; do not weaken UNKNOWN. [Proposal #1828: Stripe eligibility timing](commerce-stripe-provenance-proposal.md), [proposal #1829: ownership/provenance](commerce-owner-provenance-proposal.md). | Founder approves exact writer/schema scope separately |
| unknown.off_platform_partner_payment_without_local_update | CARRIED-FORWARD RELEASE BLOCKER | 4, 5, 6, 8, 9 | No local evidence of partner-only payment. Needs approved authoritative evidence or a separately approved safe eligibility policy; [#1828](commerce-stripe-provenance-proposal.md) / [#1829](commerce-owner-provenance-proposal.md) track. | Founder; provenance / partner-integration owner |
| unknown.fee_ledger_source_without_proven_traveler_ownership | CARRIED-FORWARD RELEASE BLOCKER | 4, 5, 6, 8, 9 | Fee birth does not establish traveler/cart ownership reliably. Needs proven existing joins or separately approved minimal provenance changes; [#1828](commerce-stripe-provenance-proposal.md) / [#1829](commerce-owner-provenance-proposal.md) track. | Founder; provenance implementation owner |
| stripe.actual.replay_3x | CARRIED-FORWARD RELEASE BLOCKER | 6, 8, 9 certification | Real authenticated handler/writer replay has not been exercised. Need safe isolated actual-handler execution three times, persisted evidence and no duplicate email. An entry probe / recorded row is not equivalent. | Founder approves safe handler harness; QA proves it |
| stripe.actual.webhook_success_together | CARRIED-FORWARD RELEASE BLOCKER | 6, 8, 9 certification | Actual webhook and actual success path have not been exercised concurrently. Need both authoritative paths and observed race/duplicate outcomes in approved isolation. | Founder approves harness scope; QA proves it |
| Normal cart-reminder sending remains blocked | GLOBAL RELEASE HOLD | 4–9 | All-rail safety, genuine delivery evidence and explicit release approval still missing. Development proof is not activation. | Founder |
| Item-change inventory residual / time-qualified copy | ADDITIONAL MUST-HAVE HOLD within the inventory risk | 5, 6, 9 | No inventory residual accepted. Actual handoff remains absent. Founder must decide time-qualified wording and policy; copy alone cannot resolve payment ordering. | Founder |

Suggested item-change wording, **proposal only**:

> “When we checked at {date}, {time} {time zone}, {item} was priced at {price} {currency} and its availability was {availability}. Price and availability may change before you book. Review the current details in your cart.”

For a loss: “When we checked at {date}, {time} {time zone}, {item} had no availability for the quantity in your cart.” Never use the add-time snapshot's captured_at as the current check time; the approved copy would need a server-authored timestamp from the live check. Unknown traveler timezone must be labelled explicitly as UTC, not inferred. This wording is not implemented and does not remove any hold.

## Part 9 preparation — proposal only

See `automation-part9-delivery-proposal.md` for the smallest opt-in disposable-schema QA delivery harness, exact proposed files / process-local flags, off-state proof and limits. No Part 9 code, flag or transport was built or enabled. In particular, transport-only proof of an item-change template is not end-to-end dispatcher proof.

Every row includes fresh scenario IDs and observed outcomes in matrix-results.json and the per-loop JSON files. Assertion failures reset the clean streak. Closed rows are not rerun to inflate counts; only unclosed rows continue. Six unclosed attempts are explicitly STRUCTURAL_RISK, not a successful gate. No real delivery receipt is claimed.

**NOT RELEASE-CERTIFIED.** All existing UNKNOWN payment rails, must-have ordering holds, normal commerce-send blocks and accepted Part 7 deferred cleanup remain. No Part 9 activation is authorized by this report. Golden regression/typecheck results are recorded separately after the completed test-only changes.
