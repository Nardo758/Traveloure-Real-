# Commerce automation — carried-forward release blockers

Parts 4, 5 and 6: **DEV-CLOSED; release blocked; not RELEASE-CERTIFIED**.

DEV-CLOSED means built in development, two clean randomized readable-record
subset loops, all open gaps documented here, and release blocked. It does not
mean complete payment lifecycle coverage, real provider delivery or production
verification. Part 7 has not started.

| Item | Part affected | What is needed | Approval owner / boundary |
|---|---|---|---|
| Stripe activity before local persistence or without reliable lifecycle stamps | 4–6 | Prove local recording and trusted lifecycle timing for every relevant external event. Existing birth/status rows are insufficient. | Founder approval of the separate Stripe provenance proposal; no payment edits here |
| Off-platform partner activity and ambiguous traveler correlation | 4–6 | Proven ownership and reliably stamped conversion/payment lifecycle, including partner-only residual carts | Founder approval of the separate ownership/provenance proposal |
| Fee-ledger ownership, other lifecycle/mapping gaps | 4–6 | Resolve unknown/contradictory typed sources and unproven optimization/comparison records, standalone participant state, contracts/proposals, refunds and entitlements. Content invoices/component states/partial settlements are now readable, not lifecycle-certified. | Separate provenance design and implementation approval from founder |
| Historical birth-only or nullable lifecycle evidence | 4–6 | Audit authoritative updates for Trip Pass renewal, ready-made/template purchases, expert tip/request and every other source; never infer complete lifecycle activity from a stored timestamp | Separate provenance approval; missing dependencies/timestamps/owners stay UNKNOWN |
| Final payment read → provider handoff | 6 | Retain and measure the approved marketing-only exception. Fresh synthetic ordinary windows are 0.325/0.288 ms; deliberately delayed windows are 19.851/18.762 ms. Neither is a production upper bound. | Marketing exception already approved; release still requires provenance and provider proof |
| Must-have item-change payment/send ordering | 5–6 | Separately prove/approve the trusted eligibility instant and ordering. Current eligible rows remain pending with `must_have_payment_ordering_unknown`; the marketing exception is not extended to them. | Founder, separate ordering/provenance track |
| Normal cart-reminder sending blocked; sweep development-only | 4–6 | Keep the verification and production-send gates closed. Meeting DEV-CLOSED does not activate schedules or real transport. | Explicit founder release approval, after release requirements |
| Real SDK/network boundary and provider once-only guarantees | 5–6 / 9 | Mock the actual Resend SDK path, then prove real provider idempotency, retries, ambiguous acceptance/DB-commit failures, dead-letter/admin-digest behavior and durable once-only outcomes | Separate test scope / Part 9 approval; no real email in this pass |
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

## Readiness

**READY FOR PART 7** under the founder's DEV-CLOSED definition only.
All retained and new Part 6 tests passed two consecutive clean randomized
loops; fresh golden suite 143/143, guards 78/78, typecheck unchanged at 117.
Every deferred gap is explicit above. Part 7 must still be supplied by the
founder before work begins.
