/**
 * THE CANONICAL DRIFT VOCABULARY, AND THE ONE PLACE A KIND IS GIVEN A HUMAN SENTENCE.
 *
 * `server/jobs/stripeReconciliation.ts` (§17 — DETECT, DON'T REPAIR) emits one of these kinds per
 * drift fact, and `/admin/reconciliation` renders them for the operator deciding whether money
 * moved. Punchlist **V-28**, ledger `2026-09-15-v27-v28-privacy-kind-labels`.
 *
 * WHY THIS FILE EXISTS AT ALL. The list lived inside `shared/schema.ts`, which re-exports it (so
 * every existing importer is untouched and the job is not changed), and the labels lived in a
 * HAND-WRITTEN map inside the admin page. Nothing tied the two together, so the map fell behind on
 * every kind the job grew: it named ten of seventeen, and the six ready-made kinds (V-3's rail,
 * ledger `2026-09-12-readymade-reconciliation-rail`, plus D-18's announce marker) and D-11's
 * `trip_booking_without_item` rendered as a raw identifier printed twice, with the sentence saying
 * what drifted simply absent. Two lanes landed detection without landing a label; a third would
 * have done the same. A second list beside the first is the derivation-drift class **§18 rule 1**
 * names — so the list and its labels are declared TOGETHER, one file, with no schema/ORM import so
 * a browser page can read it.
 *
 * WHAT ENFORCES THE PAIRING. `RECONCILIATION_KIND_LABELS` is typed
 * `Record<ReconciliationExceptionKind, string>`, so **tsc** fails the day a kind is added without a
 * label — the check is the type, not a lint anybody can forget to run. The unit pin
 * (`client/src/lib/__tests__/reconciliation-kind-labels.test.ts`) asserts the same in both
 * directions at runtime, including that no label is merely the identifier spelled back.
 *
 * §13 — AN UNKNOWN KIND IS PRINTED, NEVER GUESSED. `reconciliationKindLabel` returns the RAW kind
 * string for anything it does not know. It does not fall back to a nearest-looking label, and it
 * does not fall back to "Unknown drift" or "Other": both would be a sentence about a fact the
 * reader does not have. A row from a newer server than the page is honest as its identifier.
 *
 * STATED NEGATIVE SPACE (§18d). This file pairs the LIST with the LABELS. It says nothing about
 * whether the job emits exactly these kinds — the job assigns `ReconciliationExceptionKind`-typed
 * values, so that is tsc's layer — nothing about a kind's severity or rail (those are columns the
 * job writes per row), and nothing about whether a given wording is the BEST one; only that it
 * exists, is not the identifier, and was written from the kind's own docblock below.
 *
 * No DB CHECK over the column (migration-159/171 posture); this module is the source of truth.
 */

/** The canonical drift vocabulary — see the file header. */
export const RECONCILIATION_EXCEPTION_KINDS = [
  // ── CART rail (service_bookings) ──────────────────────────────────────────────────────────
  /** A PaymentIntent succeeded and NO service_bookings row can be resolved from it (neither by
   *  stamped PI id nor by its own `bookingIds` metadata). Customer billed, no record. */
  "pi_succeeded_no_booking",
  /** A PaymentIntent succeeded but its booking is still an unpromoted claim. The ONE case the
   *  job may hand to the shared promotion; recorded as an exception when that fails. */
  "pi_succeeded_claim_provisional",
  /** A PaymentIntent succeeded and its booking is VOIDED/terminal (ruling 39's late-signal
   *  reconciliation-exception state). Never resurrected — a human decides refund vs. re-book. */
  "pi_succeeded_booking_voided",
  /** A booking is `confirmed` (or otherwise paid-equivalent) with NO PaymentIntent stamped. */
  "booking_confirmed_no_pi",
  /** A booking is `confirmed` but its PaymentIntent is not in a succeeded state at Stripe. */
  "booking_confirmed_pi_not_succeeded",
  /** Stripe's captured amount and the server-derived total of the PI's booking rows disagree. */
  "amount_mismatch",
  /** Stripe holds a refund whose reversal never landed in the DB (`refunds` row / status). */
  "refund_not_reversed",
  /** PS15 / ruling 46 — UNVERIFIABLE PAYMENT PROVENANCE. A booking carries a
   *  `stripe_payment_intent_id` with NO `bookingDetails.stripeAttemptAt` marker behind it.
   *
   *  Every PI the checkout spine writes is preceded by that §15b pre-flight marker
   *  (`markStripeAttempt` runs immediately before `paymentIntents.create`; `stampAuthorization`
   *  and the ordering-1 `resolveAndStamp` only ever act on rows that already carry it). A stamped
   *  row WITHOUT it was written by something that is not the spine — the PS15 mass-assignment on
   *  `POST /api/bookings` (closed by ruling 46), a seed (`beta-reviews-bookings.ts` mints synthetic
   *  `pi_…` values), or a row predating ruling 38.
   *
   *  Those are INDISTINGUISHABLE after the fact, and that is the whole point of the classification:
   *  the platform cannot prove the id came from Stripe, so it neither trusts it nor repairs it
   *  (§17 DETECT, DON'T REPAIR). It is a `warning`, not `critical` — the row may be perfectly fine;
   *  what is not fine is that nothing can tell. */
  "payment_provenance_unverified",
  /** D-11 / ledger `2026-09-15-d11-no-item-booking-exception` — A TRIP-LEVEL OBLIGATION THE PLAN
   *  DOES NOT KNOW ABOUT. The booking NAMES a trip (`trip_id`), no `itinerary_items.booking_id`
   *  points at it, and it carries no `booking_details.noItemReason` naming one of the ratified
   *  classes (`transport_commerce`, `expert_booking_request` — see `shared/no-item-booking.ts`).
   *
   *  Under LD 39 `itinerary_items` is the ONE store of a plan's contents and `booking_id`
   *  (migration 159) is the item→booking link, so such a row is a purchase the slip renders with
   *  no place in the itinerary: it cannot be reordered, the refund reversal edge
   *  (`revertItemsOnRefund`, which keys on `booking_id`) cannot reach it, and it carries no
   *  `origin`. The 2026-09-15 ruling makes it a MIGRATION EXCEPTION — marked and audited — rather
   *  than a supported pattern, so an UNMARKED one is reported here.
   *
   *  `warning`, not `critical`: the money may be perfectly correct — this is a plan-integrity
   *  fact, not a payment one. NO BACKFILL and NO REPAIR (§17/§19b): a row born before the marks
   *  existed is indistinguishable from one born outside the classes, and inventing a reason for
   *  it would manufacture exactly the fact the mark exists to state. In-flight claims
   *  (`payment_pending`) and rows that are no longer obligations (`cancelled`/`expired`/
   *  `refunded`) are out of the predicate — see `NO_ITEM_EXEMPT_STATUSES` in the job. */
  "trip_booking_without_item",
  // ── READY-MADE rail (`ready_made_purchases`) ──────────────────────────────────────────────
  // The store lane (CLAUDE.md "ready_made_trips is the single store lane") was invisible to this
  // job for the same reason cart checkout once was: disjoint id spaces. A ready-made PaymentIntent
  // carries `metadata.type='ready_made_purchase'` and NO `bookingIds`, and its purchase row lives
  // in `ready_made_purchases` — so every cart-rail query matched zero rows and errored on nothing.
  // Kinds are `rm_`-prefixed rather than reusing the cart vocabulary: a kind names WHAT IS KNOWN,
  // and "a booking is unpromoted" and "a purchase was never cloned" are different facts about
  // different tables (the legacy rail sets the same precedent with its own two names).
  /** A PaymentIntent Stripe says SUCCEEDED, self-identified as a ready-made purchase by its own
   *  metadata, with NO `ready_made_purchases` row on that PaymentIntent id — money taken with
   *  nothing recorded, no clone, and no author earning. The most serious classification on this
   *  rail. The row now has TWO writers (ledger 2026-09-12-readymade-recovery-path):
   *  `POST /api/ready-made/:id/purchase/confirm` (the buyer's own browser) and the
   *  `payment_intent.succeeded` webhook, both driving the ONE shared
   *  `recordAndFulfilReadyMadePurchase`. Before that, the confirm call was the ONLY writer and a
   *  closed tab between capture and confirm lost the purchase outright. So this kind should now
   *  fire far less often; when it does it means the delivery never arrived, or the PaymentIntent
   *  is UNRESOLVABLE (deleted listing / missing buyer), which is deliberately never invented into
   *  a purchase (§13). */
  "rm_pi_succeeded_no_purchase",
  /** A purchase is `paid` with NO `clone_trip_id` — captured and never delivered. `status='paid'`
   *  means `fulfillReadyMadePurchase`'s atomic paid→cloned claim never took, so the buyer has no
   *  trip and the author has no earning. Reported only after a fulfilment GRACE, because the row
   *  is legitimately `paid`-with-no-clone for the milliseconds between the confirm INSERT and the
   *  fulfil that follows it in the same request. */
  "rm_purchase_paid_not_cloned",
  /** `price_paid_cents` on the row and the amount Stripe captured disagree. */
  "rm_amount_mismatch",
  /** A purchase row is live (`paid`/`cloned`) but its PaymentIntent is not succeeded at Stripe.
   *  Only ever raised for a PaymentIntent this pass actually saw — an unseen PI is older than the
   *  window, not drift (the cart rail's own discipline). */
  "rm_purchase_pi_not_succeeded",
  /** Stripe holds a refund against a ready-made PaymentIntent whose purchase is still `paid` or
   *  `cloned` — the money went back and the buyer still holds the product, with the author's
   *  earning unreversed. Typically a refund issued straight from the Stripe dashboard, which no
   *  platform code path knows about. */
  "rm_refund_not_reversed",
  /** D-18 / ledger `2026-09-15-d18-announced-marker` — A DELIVERED PURCHASE THE BUYER WAS NEVER
   *  TOLD ABOUT, AND THE RE-DRIVE COULD NOT TELL THEM EITHER.
   *
   *  The purchase is `cloned` — money captured, clone trip committed, author credited — and
   *  `ready_made_purchases.notified_at` (migration 297) is still NULL past
   *  `READY_MADE_ANNOUNCE_GRACE_MS`. That is the LIVENESS gap ledger
   *  `2026-09-14-readymade-notifications` stated out loud: a process dying between the
   *  `paid → cloned` claim and the send leaves a buyer who paid and heard nothing, with nothing
   *  recording the fact and nothing able to retry it.
   *
   *  RAISED ONLY AFTER THE §17 HAND-OFF FAILED. The job hands the row to the ONE shared sender
   *  (`notifyBuyerOfReadyMadeDelivery` — recovery arriving late, §17's one narrow exception) and
   *  reports this kind only when the announcement still does not exist afterwards. The ordinary
   *  case therefore SELF-HEALS on the pass that finds it and records no exception at all; a row
   *  here means the SENDER could not write the buyer's notification row, which is a different and
   *  worse fact than "nobody had told them yet".
   *
   *  `warning`, not `critical`: the money is correct and the product was delivered. What is wrong
   *  is that the buyer does not know. The job NEVER writes `notified_at` itself — a detector that
   *  stamped "announced" without sending anything would silence its own finding (§17). */
  "rm_delivery_not_announced",
  // ── LEGACY rail (`bookings` — still live via /booking-demo and process-cart) ───────────────
  "stripe_charge_no_booking",
  "booking_no_stripe_charge",
] as const;
export type ReconciliationExceptionKind = (typeof RECONCILIATION_EXCEPTION_KINDS)[number];

/**
 * ONE PLAIN-LANGUAGE SENTENCE PER KIND, written from the docblocks above. Exhaustive BY TYPE: a
 * new kind with no entry here does not compile. An ops surface that shows only the enum name makes
 * the reader look up what it means, which is how a critical row gets skimmed past.
 */
export const RECONCILIATION_KIND_LABELS: Record<ReconciliationExceptionKind, string> = {
  // ── CART rail ─────────────────────────────────────────────────────────────────────────────
  pi_succeeded_no_booking: "Payment succeeded — NO booking exists",
  pi_succeeded_claim_provisional: "Payment succeeded — booking still an unpromoted claim",
  pi_succeeded_booking_voided: "Payment succeeded — booking is voided/terminal",
  booking_confirmed_no_pi: "Booking says paid — no PaymentIntent at all",
  booking_confirmed_pi_not_succeeded: "Booking says paid — PaymentIntent not succeeded",
  amount_mismatch: "Charged amount ≠ server-derived total",
  refund_not_reversed: "Stripe refund with no reversal in the database",
  payment_provenance_unverified: "PaymentIntent id the checkout never wrote — provenance unverifiable",
  trip_booking_without_item: "Booking names a trip — no itinerary item points at it",
  // ── READY-MADE rail ───────────────────────────────────────────────────────────────────────
  rm_pi_succeeded_no_purchase: "Ready-made: payment succeeded — NO purchase recorded",
  rm_purchase_paid_not_cloned: "Ready-made: purchase paid — trip never cloned to the buyer",
  rm_amount_mismatch: "Ready-made: recorded price ≠ amount Stripe captured",
  rm_purchase_pi_not_succeeded: "Ready-made: purchase live — PaymentIntent not succeeded",
  rm_refund_not_reversed: "Ready-made: Stripe refund — purchase still paid/cloned",
  rm_delivery_not_announced: "Ready-made: trip delivered — buyer was never told",
  // ── LEGACY rail ───────────────────────────────────────────────────────────────────────────
  stripe_charge_no_booking: "Legacy: Stripe charge — no matching booking",
  booking_no_stripe_charge: "Legacy: booking confirmed — no Stripe charge",
};

/** Whether this build knows the kind — for a surface that wants to say so, never for a fallback.
 *  `hasOwnProperty`, not `in` and not a truthy index: the value arrives from an API response, and
 *  a plain lookup would answer `toString`/`constructor` out of `Object.prototype` and render a
 *  function where a drift sentence belongs. */
export function isKnownReconciliationKind(kind: string): kind is ReconciliationExceptionKind {
  return Object.prototype.hasOwnProperty.call(RECONCILIATION_KIND_LABELS, kind);
}

/**
 * The ONE reader. A kind this module declares renders its sentence; ANY other string renders
 * ITSELF — §13, see the file header. Takes a plain `string` deliberately: the value arrives from
 * an API response, so the page cannot assume it is one of the declared kinds, and narrowing it at
 * the boundary with a cast would be the assumption written down rather than checked.
 */
export function reconciliationKindLabel(kind: string): string {
  return isKnownReconciliationKind(kind) ? RECONCILIATION_KIND_LABELS[kind] : kind;
}
