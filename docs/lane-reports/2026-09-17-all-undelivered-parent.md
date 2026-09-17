# Lane report — `2026-09-17-all-undelivered-parent`

**Ruling:** decision-maker, 2026-09-17. **Money-adjacent** (refund + slot release). **NO schema, NO
migration, NO new status value** (`cancelled` already exists — the publish-trap posture), **NO new
Stripe call site, NO new refund path.**

## What was broken

The LD 50 remainder lane recorded it and left it open: a bundle whose EVERY component ended
`failed` or traveler-`cancelled` derived `all_undelivered`, said so on the response
(`parentOutcome`), and **stopped**. The D-51 settlement owned only the PARTIAL case, and the
whole-row refund rail was said to own this one while **nothing drove it**. So the parent stayed
`confirmed` — a live row holding the provider's slot capacity — with the traveler's money
unrefunded, until a human acted. Nothing threw and nothing logged.

## What landed

**ONE implementation, TWO callers (§18 rule 1).** `settleBundleAllUndelivered`
(`server/services/booking-completion.service.ts`), called from `recordBundleComponentFailure` (the
seller's `POST …/bookings/:id/component-failed`) and `recordBundleComponentCancellation` (the
traveler's `POST /api/bookings/:id/components/:componentServiceId/cancel`), and nowhere else.

1. **Re-derive server-side.** The cause comes from the component ROWS through the ONE derivation
   `deriveAllUndeliveredCause` (`shared/bundle-component-states.ts`) — `seller_failed` /
   `traveler_cancelled` / `mixed`, and **NULL** for anything that is not all-undelivered. A NULL
   falls through to `resolveCompletionEligibility` for the NAMED refusal; the caller's opinion is
   never trusted.
2. **The flip is ONE call and the transition is the guard (§15/§18b).**
   `storage.updateServiceBookingStatus(id, "cancelled", "all_undelivered:<cause>",
   ALL_UNDELIVERED_CANCEL_FROM_STATUSES)`. The from-state list has ONE entry, `confirmed` — the same
   single entry `PARTIAL_COMPLETION_FROM_STATUSES` carries, and deliberately **not**
   `BOOKING_CANCELLABLE_FROM_STATUSES`, which admits `pending` and would let this rail terminalise an
   unauthorized checkout claim (§15b).
3. **The slot release is that statement's own transaction** — the existing
   first-transition-into-cancelled release through the ONE `deriveClaimedSlotIds` /
   `deriveClaimedSlotUnits` readers, READ and never restated. No second release path was added.
4. **Provenance after the flip (§15b), as a MERGE not a column:**
   `booking_details.allUndelivered = { at, cause, componentIds }` written with `||`, the components
   NAMED and never counted, plus a `booking_all_undelivered` diary row.
5. **The money is the EXISTING D-51 leg**, `issueBundlePartialSettlement`: each component at its OWN
   pinned answer — a `failed` one at its full allocation (seller nonperformance is never excused by a
   cancellation policy), a traveler-`cancelled` one at the percent its SNAPSHOTTED policy pinned —
   plus the same proportional share of every traveler-paid fee, as ONE Stripe refund under the
   unchanged claim → refund → promote spine.

**Two narrownesses carry step 5, and both are load-bearing.** The settlement's status gate admits
`cancelled` ONLY for a row carrying the marker this writer merges (`isAllUndeliveredCancel`), so an
ordinary whole-row cancellation is still `wrong_status` and can never be refunded twice; and
`deriveBundlePartialSettlement`'s `nothing_delivered` refusal is opted out of by an explicit INPUT
(`allowNothingDelivered`, default `false`) that only this caller passes, so every existing caller's
answer is byte-for-byte unchanged.

**Recovery**, because a fix that only stops new rows says nothing about a process that dies mid-rail:
the nightly sweep's candidate scan now also takes a `cancelled` row carrying the MARKER (never
`cancelled` alone), and a re-drive of the writer on a row already cancelled-and-all-undelivered
completes a missing marker and drives the idempotent money leg rather than refusing.

## §13 — what this deliberately does NOT do

- **NOTHING MINTS.** A cancelled parent mints no earning, exactly as every other cancel does. The
  retained remainder of a late strict traveler-cancel is recorded on the immutable settlement row's
  `sellerEarningCents` and is **not** minted: minting on a cancelled parent is a new money event
  nobody has ratified. U7 asserts zero ledger rows.
- **A bundle with one deliverable component left is untouched**, and **a bundle whose components
  cannot be enumerated triggers nothing** — "we cannot enumerate it" is not "nothing was delivered".
- **No cause is ever guessed.** NULL is never written as a default, and a retry reports the PINNED
  cause off the record, never a re-derivation (a component's status moves under a settlement).

## Files

- `shared/bundle-component-states.ts` — `deriveAllUndeliveredCause` (pure, the ONE derivation).
- `shared/bundle-partial-settlement.ts` — `allowNothingDelivered` opt-in on the derivation.
- `server/utils/booking-from-states.ts` — `ALL_UNDELIVERED_CANCEL_FROM_STATUSES`.
- `server/services/booking-completion.service.ts` — the writer, the marker reader/writer, two callers.
- `server/services/bundle-partial-settlement.service.ts` — the marker-gated status arm, the sweep scan.
- `server/services/item-transition-log.service.ts` — the `booking_all_undelivered` diary event type.
- `server/routes.ts` — `allUndelivered` surfaced present-only-when-attempted on both rails' responses.
- `server/__tests__/bundle-all-undelivered.db.test.ts` — U1–U8, wired in `build.yml`.
- `server/__tests__/bundle-component-states.db.test.ts` — C3c re-pinned (D-34 itself did not widen).

## Validation (all run locally before push)

| check | result |
|---|---|
| `npx tsc --noEmit` | 129 errors — baseline unchanged |
| `npm run build` | exit 0 |
| `check-decision-guards.cjs` | OK (0 deferred) |
| `check-money-endpoints.cjs --self-test` + scan | 37/37 fixtures, scan exit 0 |
| `phase2-fee-gate.sh` | exit 0 |
| `check-test-files-wired.cjs --self-test` + scan | 12/12, `test-orphan-ratchet: OK` (baseline 33) |
| `check-duplicate-migration-prefixes.cjs` | OK |
| migration chain-integrity | 2/2 |
| migrations from EMPTY (local Postgres) | 309/309 applied |
| `npm run check:mutation-auth` | 597 rails verified — **rail set unchanged** |
| `grep -c replit.local package-lock.json` | 0 |
| **U1–U8 (new)** | **8/8** |
| S1–S20 bundle partial settlement | 20/20 |
| C1–C6 bundle component rails | 10/10 |
| SP1–SP9 / B-P1–B-P6 (pure) | 9/9, 6/6 |
| checkout sweep / promotion | 9/9, 19/19 |
| whole-row cancel + artifact refund | 10/10 |
| declared completion (W1–W10b) | 16/16 |

## Left, named, not built

- **No notification** is written to the traveler or the seller for the parent cancel — the surfaces
  lane owns it, and inventing one here would be a second author of that rail's copy.
- **`revertPurchasedItemsForBooking` is not called** on this path. It is the whole-row cancel rail's
  own step and was not ruled on here.
- **Minting a retained remainder on a cancelled parent** needs its own ruling (see §13 above).
- The marker-less window between the flip and the merge is a few milliseconds and is covered by the
  writer's own recovery arm, not by the sweep (which keys on the marker).
