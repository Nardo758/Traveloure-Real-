# Part 4 — cart reminders: DEV-CLOSED; release blocked

**DEV-CLOSED; not RELEASE-CERTIFIED.** Under the founder's clarified definition,
this means implemented in development, two clean readable-record-subset loops,
all remaining gaps carried as explicit release blockers, and release still blocked.
See [the consolidated release blockers](automation-release-blockers.md).

The Part 6 completion pass re-ran this part's own native and pure-policy tests:
both obtained two clean fresh randomized loops with zero failed/skipped tests.
The original evidence below remains historical evidence, not all-rail certification.
Its 17-source inventory was subsequently extended by four read-only mappings in
Part 6; fresh tests cover the original 17 and the additional four separately.

## Decision and release boundary

Implemented the approved conservative, query-only design. Any recorded traveler
payment/booking activity at or after the current sequence start disqualifies the
reminder, regardless of payment status. This does not establish that money moved.
Direct/tripless and residual partner-only carts are skipped with
`payment_correlation_ambiguous`.

**Normal cart-reminder execution remains blocked.** Known provenance defects are
always UNKNOWN in the paid helper; an empty local ledger is not proof of no payment.
The isolated test-only readable-record override is not release permission.
Provider transport is unavailable for cart reminders. No real emails were sent.
No payment writer, checkout behavior, cart writer, schema, migration registry,
production configuration or feature flag was changed in the original Part 4 scope.
Queue identity and calendar-day reservations use existing outbox JSONB only;
the paid helper never writes payment, booking or cart metadata.

## Implemented safeguards

- One existing `commerce-email-sweep` job and 15-minute internal-jobs scheduler;
  no new scheduler, registry or outbox.
- SELECT-only eligibility checks followed by idempotent outbox insertion using
  the existing commerce-key dedupe contract.
- Closed steps: `cart_reminder_1h`, `cart_reminder_1d`, `cart_reminder_3d`.
  Inclusive idle thresholds; oldest due unsent step first; no fourth step.
- Server activity stamp/sequence only; no guessed timestamps or backfill.
- Current cart ownership, contents, consent, account state, email and sequence
  rechecked at delivery, including existing retry/admin-dispatch paths.
- Claimed authenticated carts only; no guest email capture.
- Cart sending window: 09:00 inclusive–20:00 exclusive, explicitly known local
  timezone, additionally respecting stricter configured quiet hours.
- Shared recipient lock and local-calendar-day marketing reservation with the
  existing itinerary dispatcher. Ambiguous prior attempts retain reservations.
- Eligible cart priority is checked from current stored carts, not merely queue
  order, so itinerary-first processing does not defeat priority.
- The ordinary dispatcher cannot route a cart-reminder family to real transport.
  Generic enqueue bypass and forged fourth-step rows are refused.
- Verification requires both a guarded schema name and matching actual database
  schema; readable-record override and synthetic delivery require test mode.
- Query exceptions bubble to the existing FAILED heartbeat, never false-green
  empty success. Other jobs' heartbeat semantics remain unchanged.

## Rail inventory: READABLE records, not complete lifecycle coverage

The shared paid helper is `readTravelerCommerceActivity`. It only SELECTs.
Birth/update timestamps from stored rows are compared inclusively against the
current server sequence start. Missing ownership/timestamps are UNKNOWN.
Timestamp-without-timezone values follow the ORM's UTC storage convention.

| Local subset | Ownership | Stored times read | Status |
|---|---|---|---|
| Canonical provider booking | service_bookings.traveler_id | created_at, updated_at | READABLE records |
| Legacy booking | bookings.user_id | created_at, updated_at | READABLE records |
| Stripe intent ledger | payment_intents.user_id | created_at, updated_at | READABLE records; lifecycle UNKNOWN |
| Credits | credit_transactions → wallets.user_id | created_at | READABLE records |
| Wallet | wallets.user_id | created_at, updated_at | READABLE records |
| Trip Pass | plan_memberships.user_id | created_at, updated_at | READABLE records; external renewal UNKNOWN |
| Partner request | affiliate_booking_requests.user_id | created_at, updated_at | READABLE records; off-platform updates UNKNOWN |
| Coordination | coordination_states.user_id | created_at, updated_at | READABLE records |
| Coordination booking | coordination_bookings → coordination_states.user_id | created_at, updated_at | READABLE records |
| Coordination credit | coordination_fee_credits.user_id | created_at | READABLE records |
| Ready-made purchase | ready_made_purchases.buyer_id | purchased_at | READABLE birth record |
| Template purchase | template_purchases.buyer_id | purchased_at | READABLE birth record; later lifecycle UNKNOWN |
| Expert tip | expert_tips.traveler_id | created_at | READABLE birth record |
| Expert request | expert_requests.user_id | created_at | READABLE birth record; later handoff/support lifecycle UNKNOWN |
| Booking request | booking_requests.user_id | created_at, updated_at | READABLE records |
| Provider request | provider_booking_requests → trips.user_id | created_at, updated_at | READABLE records |
| Group transaction | trip_transactions → payer participant or trip owner | created_at, updated_at | READABLE records |

These are **17 readable stored-record subsets**, not 17 fully proven payment
rails. Querying a timestamp does not prove every authoritative writer updates it.

### UNKNOWN / separate, unapproved provenance work

1. **Stripe:** external activity before local persistence and existing status
   updates that do not advance `updated_at`. Old local intent rows can change
   after a cart sequence without a reliable locally recorded activity time.
2. **Partner payments:** an off-platform conversion may lack a local update or
   a proven traveler link. A partner-only residual cart is not evidence of unpaid.
3. **Ownership/lifecycle gaps:** fee-ledger sources without proven traveler
   ownership; optimization records (`itinerary_comparisons`, `optimizer_runs`),
   refunds/component settlements, standalone participant payment state,
   contracts/proposals, content invoices and entitlements are not independently
   mapped/certified by this 17-source helper. Existing intent/booking rows must not
   be assumed to cover these surfaces.
4. **Final-read/send race:** the recipient lock is not a universal payment-writer
   lock. A later payment commit after the final SELECT is not ruled out by the
   two tested payment/sweep orderings. Full safe-delivery certification requires
   an approved timing/serialization policy, not just another passing SELECT test.

The default UNKNOWN blockers remain in force. Resolving these issues needs a
separate approved provenance lane before any payment-writer/schema changes or
removal of release blockers.

## Fresh proof and loop counts

All fixtures were randomized, isolated and provider-free. Two complete clean
loops were obtained in the retained final integration run. The positive cases
explicitly prove the readable-record subset ONLY.

| Rule/proof | Final loops | Clean loops | Evidence / limit |
|---|---:|---:|---|
| 17 stored-record sources before / exactly at / after sequence start | 2 | 2 | Native PostgreSQL; default `allowed` remains false |
| Nullable activity timestamps | 2 | 2 | Native NULL for 16 sources; ready-made purchased_at is NOT NULL |
| Missing/malformed timestamps | 2 | 2 | Eight pure malformed/missing cases per loop; fail closed |
| Known email, consent, active account, current cart/scope eligibility | 2 | 2 | Eleven native eligibility scenarios per loop |
| Direct/tripless and partner-only ambiguity | 2 | 2 | Native current-cart recheck |
| 1h / 1d / 3d just below / at / above idle thresholds | 2 | 2 | Nine pure boundary assertions per loop |
| Exact local window boundaries and invalid timezone | 2 | 2 | Six pure local-boundary cases plus native skip checks |
| Shared daily cap and resumed sequence | 2 | 2 | Native; new sequence does not bypass today's cap |
| Itinerary-first and cart-first priority | 2 | 2 | Actual itinerary dispatcher with synthetic transport only |
| Payment-first and sweep-first orderings | 2 | 2 | Native barriers; stale queued row canceled before synthetic send |
| Guest before/after authenticated claim | 2 | 2 | Existing atomic claim helper; new sequence initially not idle |
| Fourth reminder impossible | 2 | 2 | Closed pure catalog, forged native row and generic enqueue refusal |
| Sequential/concurrent dedupe and heartbeat success/failure | 2 | 2 | Fresh retained Part 3 regression loops; zero duplicate rows |
| Default UNKNOWN coverage blocks delivery | 2 | 2 | No readable-subset override for this assertion |
| Complete all-rail safety / final-read-send race | 0 | 0 | **BLOCKED / NOT CERTIFIED** |
| Real delivery | 0 | 0 | **Not run: explicit no-email decision** |

Native suite final result: **3/3 tests passed** (each contains the documented
two-loop proof). Earlier attempts failed fixture setup: Kyoto-only market
constraint, dispatcher-approved synthetic recipient, and itinerary status
(`generated`/`selected`, not `ready`). None justified weakening runtime guards.
The fixture's itinerary item now also preserves its provider-service link.

## Regression and quality gates

- Retained golden regression: **143/143 passed**, provider-free.
- Guard batch: initial **75/78**; two bundle guards lacked a built artifact and
  one linkage guard correctly rejected the incomplete new native fixture.
  Temporary-worktree build and linked-fixture correction followed by targeted
  reruns passed all three. Effective result: **78/78 passing checks**; original
  failures remain recorded in evidence.
- Typecheck: **117 diagnostics**, unchanged Part 1 baseline; zero diagnostics
  in changed files. Baseline was not raised; this is not a clean global tsc.
- Build succeeded in the temporary verification worktree.
- Development workflow restarted once; server started. Public landing rendered;
  signed-out authentication probes returned expected 401 responses.
- Disposable schemas were removed. No monitored inbox address, key or token
  appears in these reports.

Golden verification used only the four previously approved retained harness
files in a temporary worktree over the current runtime. No old runtime, outbox,
registry or CI copy was imported into this workspace.

## Changed files

Runtime: `server/services/{commerce-email-sweep,email-outbox,itinerary-followup}.service.ts`;
new `server/services/{cart-reminder,marketing-delivery-policy}.service.ts` and
`server/services/cart-reminder-email.ts`.

Registry/scheduler: `server/automations/messaging/commerce-email-sweep.ts`,
`scripts/ci/post-internal-jobs.sh`, `.github/workflows/scheduler-jobs-gate.yml`.

Tests: `server/routes/__tests__/commerce-email-sweep.db.test.ts`;
new `server/routes/__tests__/cart-reminders.db.test.ts`.

Reports: this file and `reports/automation-part4-evidence/`.

The pre-existing held heartbeat SQL remains unregistered; Part 4 adds no
migration. No release, merge or production activation is authorized by this proof.

## Sanitized evidence

- `automation-part4-evidence/native-readable-subset.json`
- `automation-part4-evidence/pure-policy.json`
- `automation-part4-evidence/part3-regression.json`
- `automation-part4-evidence/golden.json`
- `automation-part4-evidence/guards.json` (includes first-run failure status)
- `automation-part4-evidence/typecheck.json`
