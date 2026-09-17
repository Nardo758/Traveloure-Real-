# Lane report — `2026-09-17-ld50-remainder-and-artifact-refund`

Three parts, one PR, **no migration and no schema change**. Branch `task-ld50-remainder`, cut from
`origin/main` and merged with `origin/task-bundle-component-traveler-cancel` (PR #966, migration 309)
before any work, so this diff carries that lane's rows and shrinks to nothing once #966 lands.

---

## Part A — the `refunded` writer, and what capacity a component actually holds

### A1 — `booking_component_states.status = 'refunded'` now has ONE writer

It was DECLARED so readers read it correctly and written by nothing, so a component whose allocation had
actually gone back to the traveler read `failed` or `cancelled` forever. The writer is the **D-51 promote**
(`promoteBundlePartialSettlement`), stamping it in the **same UPDATE** as `refunded_at` /
`refund_amount_cents` / `stripe_refund_id`, under the same `settled_at IS NULL` guard that already makes the
promote exactly-once, with the from-state `status IN ('failed','cancelled')` **inside the statement** (§18b).
It is stamped for every component the settlement refunded something for; a component refunded **0** (a late
strict cancel) is not stamped at all — nothing was refunded (§13).

Nothing about who ended the component or why is lost: `failed_at` / `failure_reason`, `cancelled_at` /
`cancel_reason` and the pinned `cancel_refund_percent` stay on the row beside `refund_amount_cents`, and the
settlement row's immutable `component_outcomes` names both outcomes verbatim.

**One consequence had to be handled, and is.** `deriveBundlePartialSettlement` REFUSES a `refunded` component
by name (`component_already_refunded` — "handed to a human, never refunded twice"), so re-deriving after a
promote would turn a plain retry into a refusal. `issueBundlePartialSettlement` therefore answers a retry
**from the settled row before deriving anything** — correct on the ruling's own terms ("the settlement amount
and component outcome set are immutable after successful settlement"). The sweep's candidate scan already
excludes promoted rows, and the flip + reduced mint only ever runs from `confirmed`, so no reader's amount
can move.

### A2 — capacity: a §13 statement, not a release, because nothing reserves capacity per component

Verified against every writer on `main`:

- the checkout claims capacity **per cart line** (`storage.bookSlot(item.slotId, units)`), and a bundle is
  ONE cart line — so a bundle booking holds one slot claim (or one per night for a stay), recorded on the
  booking as `slot_id` / `booking_details.claimedSlotIds` + `claimedSlotUnits`;
- the purchase-time component snapshot (`booking_details.bundleComponents`) carries `id`, `serviceName` and
  `priceCents` and **no slot**;
- `booking_component_states` (migrations 306/307/309) has **no slot column**.

So a failed or cancelled component has nothing to give back, and releasing the BOOKING's own claim would be
wrong twice over: the bundle still occupies its window, and D-51 rules that a partial settlement *"must not
use the terminal whole-row `refunded` state **or release all reserved capacity**"*.

What landed is the honest half: both component writers now STATE the fact on their evidence —
`componentCapacity: { released: 0, reason: "no_component_capacity_reserved", bookingReservedSlotIds,
bookingReservedUnitsPerSlot }` — read through the ONE `deriveClaimedSlotIds` / `deriveClaimedSlotUnits`
deciders and never restated (§18 rule 1). An operator reading a failed component can see that no capacity was
stranded and none was wrongly handed back.

**Per the brief's stop-and-report clause: a per-component release needs a per-component slot record — a
column on `booking_component_states`, or a `slotId` on the snapshot entry written by the checkout composer.
That is a schema/composer decision nobody has ratified, so it was NOT invented** (a reader for a fact no
writer produces is the speculative shape §18c refuses). S20 pins the schema and the composer, so a lane that
adds one has to come back and read this rule. If it is ever added, the release goes through the EXISTING
`storage.releaseSlot(id, units)` (V-26) inside the component's own atomic flip, whose `status = 'pending'`
predicate already makes the winner unique and the release exactly-once.

---

## Part B — the whole-row cancel quotes the SNAPSHOT (OC-B1's last stated gap)

`quoteCancellationForBooking` joined `provider_services.cancellation_policy_type` **live**, so a seller who
tightened their policy tightened it retroactively for every outstanding booking — the exact move migration
291 was recorded to stop, and which the component-cancel rail already refused to make.

Both rails now read the same pinned tier through the same structural parse. `readSnapshotPolicyType` is the
**one** read of `policy.cancellationPolicyType`; `resolveBookingCancellationPolicy` (whole-row) and
`resolveSnapshottedCancellationTerms` (component) both call it. B4 pins that exactly one structural parse
exists in the module.

The quote NAMES which record answered — `policySource: "purchase_snapshot" | "live_listing"` — and that rides
automatically to `/api/bookings/:id/cancel-preview`, `/api/bookings/:id/cancel` and the traveler refund rail
in `server/routes/bookings.ts`, all three of which already call the one quote.

**§13 — the fallback is explicit and logged.** A row with NO snapshot (pre-291, or a booking whose snapshot
composition failed — §15b lets a snapshot fail without failing the booking) has no pinned tier. Refusing the
cancellation for that would strand every legacy traveler behind a record-keeping gap they had no part in, so
the live listing is read, the source is named on the quote, and one notice is logged per resolution. A
snapshot whose policy is NULL is a **different fact** — the listing declared none — and takes the ONE
normalizer's stance (flexible, `policyDefaulted: true`), which is `purchase_snapshot`, not a fallback. The
component rail keeps REFUSING instead, correctly: it exists only for bundles bought after 307, which are
snapshotted by construction.

No amount changed shape: the basis is still `travelerChargeForRow`'s composition, and the traveler service
fee still rides the refund separately at the same tier percent.

---

## Part C — the refund on a rejected artifact

### The coordinator's reading, stated so the decision-maker can correct it

A traveler's **rejection of an artifact does not itself move money.** LD 46 / D-27 already routes a rejection
to ASK (`confirmed → awaiting_acceptance`) and then ESCALATE (`awaiting_acceptance → disputed`) through the
ONE dispute writer, into the existing admin dispute queue; §14 wants the actor of a money movement to be a
session with standing. **The refund is therefore the ADMIN's dispute-resolution outcome — "resolved for the
traveler on a rejected artifact" — and it is a full refund of what that booking's traveler was charged.**

C1 pins the first half both behaviourally (the escalation makes no Stripe call, writes no `refunds` row and
reverses nothing) and structurally (neither acceptance module names a refund rail).

### The rail

A **third action on the existing dispute rail** — `POST /api/admin/disputes/:bookingId/refund-rejected-artifact`,
under §2's blanket guard plus the explicit role check every action there carries — because that rail spells
one resolution outcome per route (`/reject`, `/uphold`). No new queue, no new status, no new table, no
migration. It is deliberately not `/uphold`, whose claim is `status <> 'refunded'` (any state may refund) and
whose key is `refund-sb-<id>`.

### The spine (`server/services/artifact-rejection-refund.service.ts`)

1. **Ledger reversals first** (the `/uphold` order — idempotent, so a Stripe failure leaves a fully reversed
   ledger that a retry re-confirms).
2. **ONE §15b atomic conditional taken BEFORE the Stripe call**:
   `UPDATE service_bookings SET status='refunded', … WHERE id = ? AND status IN ('disputed')`
   (`ARTIFACT_REJECTION_REFUND_FROM_STATUSES` — the single entry `DISPUTE_REJECT_FROM_STATUSES` already uses,
   for the same reason). In the **same transaction** it moves every not-yet-refunded
   `booking_component_states` row to `refunded`.
3. **ONE more caller of the ONE `stripe.refunds.create` site** (`createStripeRefundForBooking`, via the new
   `stripePaymentService.refundRejectedArtifact`) under the key `artifact-reject-refund-<bookingId>`. The
   repo-wide count of `stripe.refunds.create` call sites is unchanged at 3.
4. **ONE audit writer**, `recordIssuedRefund` — the `refunds` row and the traveler-service-fee `reversal` leg.
5. A Stripe **failure** reverts the claim to `disputed` so an admin may retry — `refundServiceBooking`'s
   posture, safe for the same reason: the key is amount-unambiguous, so a retry rebuilds the same key and a
   refund that landed invisibly is returned rather than re-issued.

**The amount is server-derived** from the row through the ONE `travelerChargeForRow` composition plus the
row's own `travelerServiceFee` snapshot (a made-whole outcome refunds the fee in full). The body is a
`.strict()` pick of an optional admin note that reaches the audit log and nothing else (§19); the actor is the
admin session (§14).

**The seller is never paid**, in two independent layers: the reversals above, and the fact that no mint can
fire for the row afterwards — the mint runs only inside `storage.updateServiceBookingStatus` for `completed` /
`partially_completed`, and C6 pins that every from-state list reaching either excludes `refunded`, then drives
a completion attempt that changes nothing.

**§13.** `refunded: true` is returned only with a Stripe refund id in hand; a retry reports `alreadyRefunded`
and claims NO id, because it issued none; a booking with no PaymentIntent is refused `no_payment_intent`
(custody unknown, never assumed); a row charged nothing is refused `nothing_charged` rather than sent to
Stripe with a zero amount; a row no dispute reached is refused `wrong_status` with its state stated.

---

## Proofs

| Suite | Proofs |
| --- | --- |
| `server/__tests__/whole-row-cancel-and-artifact-refund.db.test.ts` (new, wired into `acceptance-rails`) | **B1** post-purchase policy edit moves nothing; **B2** a NULL-policy snapshot is a different fact; **B3** the pre-291 fallback is named and logged; **B4** one parse, both rails, server-derived amount; **C1** a rejection alone moves no money; **C2** the admin outcome end to end; **C3** two concurrent resolutions ⇒ one refund; **C4** a retry ⇒ zero new Stripe calls; **C5** from-state + custody refusals; **C6** the seller is never paid |
| `server/__tests__/bundle-partial-settlement.db.test.ts` | **S18** the `refunded` stamp + the retry that is not re-derived + the sweep skipping a promoted row; **S19** exactly-once under concurrent promotes, one statement, from-state inside it; **S20** capacity releases nothing, says so, and the reason is structural. S2 / S12 / S13 re-pinned for the new status. 20/20 |
| `server/__tests__/bundle-component-states.db.test.ts` | C3 re-pinned (the failed component now settles to `refunded`; `failed_at` / `failure_reason` still carry the seller's answer). 10/10 |
| `server/__tests__/offering-contract-snapshot.test.ts` | K1's idempotency-key set ratcheted by exactly one, with its reason beside it. 14/14 |

Neighbours re-run green and unmodified: `acceptance-rails.db` 20/20, `declared-completion.db` 16/16,
`checkout-payment-promotion.db` 19/19, `checkout-claim-sweep.db` 9/9, `reconciliation-detection.db` 47/47,
`booking-birth-provenance.db` 12/12, `shared/bundle-partial-settlement` 9/9,
`shared/bundle-component-states` 6/6, `cancellation-policy` 10/10.

## Validation

`tsc --noEmit` **129 errors == baseline** · `npm run build` clean · `check-money-endpoints` (+ `--self-test`)
· `phase2-fee-gate` · `check-decision-guards` · `check-test-files-wired` (+ `--self-test`,
`test-orphan-ratchet: OK`, baseline 33 unchanged) · `check-duplicate-migration-prefixes` ·
`grep -c replit.local package-lock.json` = 0 · mutation-auth manifest + coverage regenerated for the ONE new
rail · migrations 001–309 applied from an EMPTY local Postgres (no new migration in this lane).

## Left, named

- **No surface** calls the new admin rail; the dispute queue's UI is a separate lane, as are the settlement's
  seller and traveler surfaces.
- A **component-cancel preview endpoint** is still unbuilt; it must reuse `resolveSnapshottedCancellationTerms`,
  never the whole-row quote.
- The **pre-307 snapshot fallback** in `reducedBundleFigures` still reads a `cancelled` component as fully
  undelivered (stated, and unreachable through any writer of this rail).
- **A per-component slot record does not exist** — see Part A2. Adding one is a schema/composer decision.
- **NEW FINDING, not fixed:** an `all_undelivered` bundle — every component failed or cancelled — stays
  `confirmed`, holding the provider's slot, until a traveler or admin acts on the whole row. What the parent
  status should become in that case is unruled, so nothing was changed.

## Proposed CLAUDE.md sentences (not applied — the decision-maker owns that file)

> **§15 addendum.** `booking_component_states.status = 'refunded'` means THIS COMPONENT'S MONEY IS SETTLED and
> has exactly two writers, both of which are the money settling: the D-51 partial-settlement promote (in the
> same UPDATE as the refund columns, under `settled_at IS NULL`) and the admin's artifact-rejection refund.
> A component refunded 0 is never stamped. Because the settlement derivation refuses a `refunded` component by
> name, **a promoted settlement is answered from its own row and never re-derived.**

> **§14 addendum (OC-B1).** A cancellation quote reads the tier PINNED on
> `service_bookings.offering_contract_snapshot`, never the live listing; both the whole-row and the
> per-component rails read it through ONE parse. A pre-291 row with no snapshot falls back to the live listing
> **explicitly, named on the response and logged** — never silently.

> **Locked Decision 46 addendum.** A traveler's rejection of an artifact moves NO money: it ASKs and then
> ESCALATEs into the admin dispute queue. The refund is the ADMIN's resolution outcome — a full refund through
> the shared Stripe refund site under `artifact-reject-refund-<bookingId>`, claimed from the `disputed`
> from-state before the call, with the booking and its components moved to `refunded` in that statement and no
> seller payout ever minted.
