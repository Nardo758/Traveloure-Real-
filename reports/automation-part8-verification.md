# Part 8 scenario proof and fault testing

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

- **sellout.final_read_handoff** (STRUCTURAL_RISK): assertion:Availability changed before handoff: status=sent, syntheticCalls=1; payment-only residual approval does not cover inventory; attempted 6, clean 0. Evidence: automation-part8-evidence/e2070336-632d-4d4d-baec-c72125184de2-loop-6.json.
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

### New inventory handoff failure

When the availability slot is filled **after the final read but before provider invocation**, the row becomes `sent` and the synthetic provider is invoked once. All six final-loop attempts fail the zero-send assertion. The approved residual exception covers marketing **payment** races, not catalog availability changes. No runtime fix or broader exception has been introduced.

The accepted marketing/payment residual was measured at **26.76 ms and 27.53 ms** in the two passing scenarios. These are measured synthetic-fixture observations, **not** a production upper bound.

Two exploratory fixture-validation loops are archived separately in this directory. They exposed fixture/setup errors that were corrected before the final run: fee-ledger enum fields, an itinerary comparison's required fields, using the registered HTTP job route for failure persistence, and placing the quiet-hours check after the activity instant. The inventory failure also occurred in those two exploratory loops: **8 failing observations overall, including 6 consecutive final-loop failures**. The table above counts the final submitted run, not discarded or invented passes.

### Scope and readiness

Only the approved new tests, test runner, verification-only CI step and reports changed. Disposable setup reuses existing fixture DDL for heartbeat nullability and the commerce dedupe index; no shared development schema, production schema or migration registry changed. Direct senders and payment/checkout/booking runtime code were untouched. No real emails or external payment calls were made.

**PART 8 NOT FULLY CLOSED: 100 rows closed, 7 STRUCTURAL RISK rows after six final attempts.** Those seven comprise the new inventory race, three UNKNOWN payment-provenance gaps, two authentic handler-coverage gaps, and the preserved change-notice delivery hold. The latter six remain blockers rather than fabricated successful coverage. Normal commerce sending remains blocked. Part 9 has not started.

Every row includes fresh scenario IDs and observed outcomes in matrix-results.json and the per-loop JSON files. Assertion failures reset the clean streak. Closed rows are not rerun to inflate counts; only unclosed rows continue. Six unclosed attempts are explicitly STRUCTURAL_RISK, not a successful gate. No real delivery receipt is claimed.

**NOT RELEASE-CERTIFIED.** All existing UNKNOWN payment rails, must-have ordering holds, normal commerce-send blocks and accepted Part 7 deferred cleanup remain. No Part 9 activation is authorized by this report. Golden regression/typecheck results are recorded separately after the completed test-only changes.
