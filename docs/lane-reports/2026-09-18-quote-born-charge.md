# Lane report — the quote-born booking charge through `/api/checkout`

**Ledger:** `2026-09-18-quote-born-charge` · **Branch:** `task-quote-born-charge` · **Base:** `origin/main` @ `32b0d6ea1`
**Schema:** none. **Migration:** none. **New table/column:** none. **New route:** none. **New Stripe PaymentIntent creation site:** none. **Fee or rate literal:** none.

## What the lane closes

LD 49 filed the charge as its own lane, and `server/services/service-quotes.service.ts` stated the gap in its
own header: *"THE CHARGE. The quote-born booking is BORN unpaid (`pending`); feeding the quoted amount into
`POST /api/checkout`'s line-price derivation … is a separate lane."* Until this landed, an accepted quote
minted a real `service_bookings` row that **no rail on the platform could charge**, and #978's surfaces said
so on screen ("paying for a quoted booking is not available on the site yet").

## The provenance — FOUND, not added

The brief allowed for amending the accept path to write `booking_details.quoteId`. **It was not needed and was
deliberately refused.** `service_quotes.booking_id` is already a server-written link, stamped inside
`acceptQuote`'s own transaction (step 3, beside the claim) and reachable from no request body under any
spelling — `shared/service-quotes.ts` deliberately declares no `createInsertSchema(serviceQuotes)`, so every
column on that table is written by explicit column, never from a parsed body.

The arm therefore **JOINS** `service_bookings → service_quotes ON q.booking_id = b.id`. It has to read that row
anyway to answer gate (d) — is the quote still `accepted` and unexpired — so the join costs nothing, and a
`booking_details.quoteId` mirror would have been a second copy of one fact on a money row: the derivation-drift
class §18 rule 1 names, with no reader the join does not already serve. **No body-supplied quote id is trusted
anywhere.**

## The statement that refuses the concurrent loser

`claimQuoteBornBooking` (`server/services/quote-charge.service.ts`), one atomic conditional:

```sql
UPDATE service_bookings
   SET status = 'payment_pending',
       booking_details = COALESCE(booking_details,'{}'::jsonb) || jsonb_build_object('travelerCharge', …),
       updated_at = NOW()
 WHERE id = ? AND traveler_id = ? AND status = 'pending'
   AND stripe_payment_intent_id IS NULL
RETURNING id
```

`AND status = 'pending'` is the clause that refuses the loser. Two concurrent charges: the first flips the row
out of `pending`, the second matches **zero rows**, is answered 409 `quote_charge_in_progress`, and **never
writes a marker and never reaches Stripe** — so only one PaymentIntent can exist (Q7). `resolveQuoteCharge`'s
read above it is a fast path for the refusal *sentence*, explicitly not the concurrency guard. A retry by the
winner is not refused: the row then reads `alreadyClaimed`, the arm RE-DRIVES against the same row and the same
key, and `createPaymentIntent`'s idempotency returns the SAME PaymentIntent — the cart arm's own posture.

## Two things the claim also does, and why

1. **It stamps the A3 era snapshot** (`booking_details.travelerCharge = {conciergeFee:"0.00"}`). This is
   load-bearing, not tidiness. `travelerChargeBasis` reads that key's PRESENCE (§19d) and three live readers
   branch on it — the cancellation quote, the REFUND CEILING clamp, the checkout re-drive. A quote-born row is
   born WITHOUT it (correctly: `createServiceBookingAtomic` is the client-facing birth rail and §19d strips it
   there), so without this stamp a row charged today would read back as `pre_a3_legacy` and every one of those
   readers would add `platform_fee` — the provider's **withheld** share — to the traveler's side a second time.
   The cart's own claim stamps the same key at the same point in its own spine.
2. **It stamps `balance_due_at`** when — and only when — `resolveBalanceDueAt` (the ONE derivation) resolves
   one. A quote-born row carries no booked slot and no scheduled date, so in practice it resolves NULL and the
   column is left NULL: an honest "the platform holds no date this can key on", never a guessed deadline (§13).

## Files changed

| File | What |
| --- | --- |
| `server/services/quote-charge.service.ts` | **NEW.** `resolveQuoteCharge` (read-only decision — the four gates, the amount, the deposit, the key) and `claimQuoteBornBooking` (the §15 atomic claim). Imports no Stripe, writes nothing else. |
| `shared/service-quotes.ts` | `quoteCheckoutBodySchema` — the third `.strict()` pick-based allowlist beside the request and issue bodies (§19). No amount, price, `userId` or quote id is admissible. |
| `server/routes/payments.routes.ts` | The arm: `chargeQuoteBornBooking`, taken on the PRESENCE of `quoteBookingId` at the top of the existing handler; `quoteBorn` on `authorizeAndPromote`; `promoteAuthorizedCheckout` gains a `clearCart` option. |
| `client/src/lib/quote-copy.ts` | `QUOTE_CHECKOUT_UNAVAILABLE_NOTE` rewritten (it stopped being true), `QUOTE_PAY_ACTION_LABEL`, `quoteChargeRefusalLine`. |
| `client/src/components/quotes/TravelerQuotesPanel.tsx` | The Pay control on the accepted card, mounting the EXISTING `StripeCheckout`, with the SAME `POST /api/bookings/confirm-payment` fallback the cart uses. |
| `server/__tests__/quote-born-charge.db.test.ts` | **NEW**, 11 proofs, wired into its own `build.yml` job on the DB template. |
| `server/__tests__/offering-contract-snapshot.test.ts` | K1 ratchet: `quote-buy-${String(row.id)}` pinned with its reason. |
| `client/src/lib/__tests__/quote-copy.test.ts` | C1 rewritten, C2 added. |
| `.github/workflows/build.yml` | The `quote-born-charge` job. |

## Proofs — Q1–Q11, all green

Q1 order (claim → marker → stamp) + the key · Q2 webhook promotion, double signal is one flip · Q3 client
fallback + N17c (a client-named PI that is not the stamped one promotes and stamps nothing) · Q4 §14 allowlist
· Q5 expired ⇒ 409 with the expiry, no claim, no marker · Q6 ONE 404 for not-yours / missing / not-quote-born ·
Q7 concurrency · Q8 deposit read not re-derived, deposit+balance = full · Q9 TTL sweep (unmarked voids, marked
quarantined) · Q10 the §17 expected charge agrees and §19b clears via the marker · Q11 the K1 ratchet.

The suite makes **no Stripe call**: the one creation site is `createPaymentIntent`, which this lane did not
touch and which `checkout-oneclick.stripe.db.test.ts` proves against real Stripe. Everything that is this
lane's own is proven with the same functions the route calls.

## Deliberately NOT done, and why

* **No traveler service fee on this charge.** The traveler accepted a quote stating ONE number, and the accept
  surface disclosed nothing on top of it. Folding the ruled fee in at charge time would charge more than the
  quote said. Whether a quote-born booking should carry it is a DISCLOSURE decision for the accept surface —
  recorded as open in the ledger and the punchlist, not decided by a charge arm (§13).
* **No pre-apply cart clear for the quote arm.** `promoteAuthorizedCheckout` skips it: this charge was never
  assembled from a cart, and clearing one would discard lines the traveler never bought.
* **No `booking_details.quoteId`.** See above.
* **Out of scope, verified unchanged:** balance payment for a quote-born deposit rides the existing §15d rail
  (`canPayBalance` is owner/`payer`-role on the booking's trip and reads no cart line; `POST
  /api/bookings/:id/pay-balance` reads `balance_amount` off the row); refunds and cancellation ride the existing
  whole-row rails, which key on the booking row and its PaymentIntent, not on a cart line. Neither refuses a
  quote-born row.

## Proposed CLAUDE.md sentence (CLAUDE.md untouched — decision-maker appends)

Append to Locked Decision 49:

> **THE QUOTE-BORN CHARGE HAS LANDED, AS ONE ARM ON THE EXISTING CHECKOUT (ledger
> `2026-09-18-quote-born-charge`; no schema, no migration).** `POST /api/checkout` takes
> `{ quoteBookingId }` behind a `.strict()` pick-based allowlist (§19) and from the claim onward the
> row travels the SAME §15 spine a cart row does — the §15b marker, the ONE `createPaymentIntent`
> (wallets per LD 43 (c), key `quote-buy-<bookingId>`), the atomic `stampAuthorization`, and
> `promotePaidCheckout` as the ONE promotion reached by the webhook and the client fallback with no
> change to either. **THE PROVENANCE IS `service_quotes.booking_id`, NOT A SECOND COPY:** the arm
> JOINS to the quote it must read anyway, and a body-supplied quote id is never trusted. **THE CLAIM
> IS THE GUARD:** one atomic conditional `… WHERE id = ? AND traveler_id = ? AND status = 'pending'
> AND stripe_payment_intent_id IS NULL`, so two concurrent charges yield ONE PaymentIntent and the
> loser is refused before any marker. That claim ALSO stamps the A3 era snapshot
> (`booking_details.travelerCharge`), without which the refund ceiling, the cancellation quote and the
> re-drive would read a row charged today as pre-A3 and bill `platform_fee` — the provider's withheld
> share — to the traveler a second time. **§14:** the amount is the ROW's (the quote's), never the
> listing's live price and never the body's; the deposit split is READ, never re-derived. **§13:**
> missing / not yours / not quote-born is ONE 404; an accepted quote past its expiry is 409
> `quote_expired` with the expiry stated and is NEVER repriced. **DELIBERATELY NOT FOLDED IN:** the
> ruled traveler service fee — the quote stated one number and the accept surface disclosed no fee on
> top, so that is a disclosure decision for the accept surface, recorded open.

---

## Fee amendment (2026-09-19, ledger `2026-09-19-quote-born-traveler-fee`)

The "Deliberately NOT done" section above recorded, verbatim: *"No traveler service fee on this
charge... Whether a quote-born booking should carry it is a DISCLOSURE decision for the accept
surface — recorded as open in the ledger and the punchlist, not decided by a charge arm (§13)."*

**The decision-maker has now decided it, overriding that open item:** a quote-born booking carries
the SAME ruled traveler service fee (ledger `2026-09-02-traveler-fee-applies-everywhere`) as every
other service booking — 7% of the quote's own base price, capped by the `traveler_service_fee`
band's `max_amount`, resolved and disclosed no differently than the cart's own line — and it is
waived by an active Trip Pass exactly as on the cart.

**What changed, file by file:**

* `server/services/fee-resolution.service.ts` — new `resolveTravelerServiceFeeSnapshot(subtotal,
  waiverBasis)`, extracted from the cart loop's own inline computation in `payments.routes.ts`
  (§18 rule 1: one implementation, two callers). It resolves `resolveTravelerServiceFee`
  UNCONDITIONALLY (so `wouldHaveBeen` always names the real band-priced amount, never 0-because-
  waived) and applies the waiver on top for `charged`.
* `server/routes/payments.routes.ts` — the cart loop's inline `feeWaived`/`feeWaiverBasis`/
  `travelerFeeResolved`/`feeChargedAmt` computation now calls the shared snapshot builder instead
  (behaviour and every existing response field byte-identical); `authorizeAndPromote` gains an
  additive-only `travelerServiceFeeDisclosure` argument that echoes `{travelerServiceFee,
  coveredByTripPass}` on its JSON response only when a caller passes one (today: the quote-born
  arm's two success branches).
* `server/services/quote-charge.service.ts` — `resolveQuoteCharge` now reads `b.trip_id`, resolves
  the fee snapshot (best-effort Trip Pass check, never failing the charge), and returns
  `travelerServiceFee` + `coveredByTripPass` on the plan; the deposit `chargeAmount` folds the fee
  in (`deposit_amount + travelerServiceFee.charged`), matching Ruling D's "assessed once, at the
  deposit charge" posture, because `authorizeAndPromote` treats a supplied `chargeAmount` as the
  final amount due now rather than adding `travelerFeeTotal` on top of it. `claimQuoteBornBooking`
  takes a now-REQUIRED `travelerServiceFee` parameter and stamps it into `booking_details` in the
  SAME statement as the A3 snapshot, so the existing `recordTravelerServiceFeeLedger` (already
  called inside `authorizeAndPromote` for every checkout) writes the `traveler_service_fee` /
  `fee_waiver` legs for a quote-born row with no change to that writer. The module's header is
  rewritten in place to record this override rather than leaving the superseded reasoning in place
  uncorrected.
* `client/src/lib/quote-copy.ts` + `TravelerQuotesPanel.tsx` — a new `quoteTravelerFeeLine` reads
  the server's `travelerServiceFee`/`coveredByTripPass` off the pay response and renders it in the
  payment sheet, above the Stripe Payment Element — before the traveler completes payment. No
  client-computed amount; an unanswered fee renders nothing (§13), never a guessed $0.

**Tests:** `quote-born-charge.db.test.ts` Q1–Q11 updated in place (every `claimQuoteBornBooking`
call site now passes a real, resolved `travelerServiceFee`; Q8's deposit assertion now accounts for
the fee riding on top of the deposit — the ruling's own arithmetic, not a loosened proof) plus new
Q12 (fee added/snapshotted/stamped, band-derived, re-drive reads the stamp back), Q13 (Trip Pass
waiver end to end, via a fixture that directly associates a trip since no live lane does today —
stated as such), Q14 (the fee is read from `fee_bands`, not a literal — proven by editing the
band's rate and observing the resolved fee change, restored in a `finally`). `quote-copy.test.ts`
gains F1–F4 for `quoteTravelerFeeLine`. K1's key-template pin (`quote-buy-<bookingId>`) is
unchanged — this amendment adds no new idempotency key.

**Negative space, unchanged by this amendment:** the balance leg (`pay-balance`) still adds
nothing, because the fee is assessed once at the deposit charge; refunds and cancellation still
ride the existing whole-row rails, which read the fee back off the row's own stamped snapshot like
everything else on it.
