/**
 * `service_bookings` FROM-STATE ALLOW-LISTS — one home, §18b.
 *
 * §18b: "the pre-check is only the error message, the transition itself is the guard." Every one of
 * these lists is the fourth argument of `storage.updateServiceBookingStatus`, which turns the UPDATE
 * into `… WHERE id = ? AND status IN (…)` — so a concurrent writer LOSES and the caller sees
 * `undefined`, never a silent overwrite of a terminal state.
 *
 * WHY THEY LIVE TOGETHER (§18 rule 1). Until ledger `2026-09-15-v23-v25-from-state-guards` exactly
 * ONE rail carried such a list (`OWNER_BOOKING_TRANSITIONS`, declared inline in the `server/routes.ts`
 * monolith), and the two other status writers on the same table — the traveler's dispute and the
 * admin's dispute-reject — carried none at all. A second rail re-deciding "which statuses may become
 * X" beside the first is the derivation-drift class §18 rule 1 names; this module is the one place the
 * question is answered, so a new writer imports a named list rather than inventing one.
 *
 * NEGATIVE SPACE, stated because a list is only as good as what it refuses: these are FROM-state
 * lists, nothing more. They say which current statuses a transition may consume; they say nothing
 * about WHO may ask for it (that is each route's own authorization gate), nothing about the money
 * that rides on the transition (§14/§15), and nothing about statuses this table can hold but no rail
 * here moves (`expired`, a swept claim).
 *
 * `payment_pending` is absent from EVERY list on purpose. A row in `payment_pending` with no
 * `stripe_payment_intent_id` is an UNAUTHORIZED PROVISIONAL CLAIM by construction (§15b / ruling 38)
 * whose sole author is `checkout-claim.service.ts`. Moving one out of that state from anywhere else
 * strands it: `voidClaim` (`status='payment_pending' AND stripe_payment_intent_id IS NULL`) and
 * `promotePaidCheckout` (`status='payment_pending' AND stripe_payment_intent_id=<pi>`) then both match
 * zero rows, and the `vendor_availability_slots.booked_count` the claim consumed has no code path in
 * this repository to give it back.
 */

/**
 * ── SD-1 (provider money-hardening lane, ruling 42): the OWNER rail's FROM-state allow-list ────────
 * The handler previously checked only the TARGET status, never the CURRENT one. `service_bookings`
 * rows in `payment_pending` with no `stripe_payment_intent_id` are UNAUTHORIZED PROVISIONAL CLAIMS
 * by construction (§15b / ruling 38) — written before the Stripe call, and visible to the provider
 * (GET /api/provider/bookings applies no status filter; the calendar renders them "Booked"). A
 * provider clicking Accept on one promoted a purchase nobody had paid for, and — because both
 * recovery predicates key on `status='payment_pending'` — permanently stranded the availability
 * slot the claim had consumed: `voidClaim` and `promotePaidCheckout` both matched 0 rows
 * afterwards, and nothing in the codebase gives `vendor_availability_slots.booked_count` back.
 *
 * A provisional claim is UNACCEPTABLE INPUT — rejected, never promoted. The owner rail does not
 * participate in the claim state machine at all; `checkout-claim.service.ts` remains its sole
 * author. `expired` (a swept claim) and the terminal states are likewise not owner-movable.
 */
export const OWNER_BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  // Accept: only a request-rail booking awaiting the owner's answer.
  confirmed: ["pending"],
  // Decline / cancel: an unanswered request, an already-accepted booking, or a DEPOSIT-PAID one.
  //
  // `deposit_paid` added by ledger `2026-09-03-deposit-paid-cancel`. Its absence was not a policy
  // — it was an omission: a listing that takes deposits produced bookings its own provider could
  // not cancel, answering every attempt with a 409 that named no remedy. The traveler's money sat
  // at Stripe and the claimed availability slot stayed consumed. The RULING is narrow: a provider
  // cancel of a deposit-paid booking refunds exactly what was CAPTURED — the deposit — and
  // nothing else, because the balance was never charged and there is nothing on it to refund.
  //
  // NOTE this still keeps the pre-existing cancel-a-CONFIRMED-booking behaviour verbatim — the
  // missing-refund question on that edge is a SEPARATE, still-unruled finding (audit SD-2 / Q2)
  // and is deliberately not changed here rather than silently altered under cover of this fix.
  // `resolveCapturedDeposit` keys strictly on `status = 'deposit_paid'` for exactly that reason:
  // a booking that has paid its balance is `confirmed`, and stays that sibling gap's business.
  cancelled: ["pending", "confirmed", "deposit_paid"],
};

/**
 * ── V-23 (punchlist §2; ledger `2026-09-15-v23-v25-from-state-guards`) ────────────────────────────
 * WHICH BOOKINGS THE TRAVELER MAY DISPUTE. `POST /api/bookings/:id/dispute` called the writer with
 * THREE arguments, so its guard fell back to `eq(id)` — an unconditional UPDATE. Every status was
 * disputable, including a `payment_pending` provisional claim (the stranding described above, one
 * rail over from SD-1) and every terminal state.
 *
 * A dispute is a claim about a service the traveler PAID FOR and did not receive as sold, and its
 * whole effect is to pull the earner's money back to `held` (`setBookingEarningsDispute`). So the
 * list is the paid-equivalent, completed-shaped statuses and nothing else:
 *   - `confirmed`     — accepted and paid; the money is in escrow, which is what a dispute freezes.
 *   - `deposit_paid`  — a real capture has happened, so there is something to hold back.
 *   - `completed`     — the ordinary case; the `completed_at` clearance-window cutoff at the route
 *                       is what bounds it in TIME (escrow decisions 3+4), and this list is what
 *                       bounds it in STATE. Both are needed: neither implies the other.
 *
 * DELIBERATELY ABSENT, each for its own reason — the refusals are the content of this list:
 *   - `payment_pending` — a provisional claim, never the traveler's to move (§15b; see above).
 *   - `pending`         — a request nobody has accepted and nobody has charged. There is no money to
 *                         hold back, so a "dispute" here is a cancellation wearing the wrong word.
 *   - `cancelled` / `refunded` — the traveler already has their remedy; re-opening a terminal row
 *                         would block a release that has already happened.
 *   - `disputed`        — already disputed. A second flip records nothing new and would let two
 *                         concurrent requests both believe they opened the dispute.
 *   - `expired`         — a swept claim; it never held money.
 */
/*
 * ── D-6 ACCEPTANCE ADDS TWO STATUSES TO THIS LIST (ledger `2026-09-15-d24-d26-acceptance-columns`)
 * `awaiting_acceptance` and `revision_requested` descend from `confirmed`, so the money is in
 * escrow exactly as it is there and NOTHING has minted — which is the whole predicate above. A
 * traveler who believes the delivered artifact is not what was sold must have a remedy that is
 * neither "accept it" nor "ask for a revision", and a traveler whose revision request is ignored
 * must have one too.
 *
 * A REVISION REQUEST IS STILL NEVER A DISPUTE, and adding these does not blur that: a revision is
 * an entitlement the listing SOLD (`provider_services.revisions_included`), it writes a
 * `booking_revision_requests` row and flips to `revision_requested`; a dispute is a CLAIM that
 * something went wrong, it writes `booking_metadata.disputeReason`, it flips to `disputed` and it
 * marks the earner's `dispute_state='open'`. Different word, different surface, different
 * consequence. The two rails share nothing but this table.
 *
 * The route's `completed_at` cutoff is unaffected: neither status has a `completed_at`, so the
 * time bound simply does not apply (its own comment already says so), and the STATE bound is this
 * list.
 */
export const DISPUTABLE_FROM_STATUSES: readonly string[] = [
  "confirmed",
  "deposit_paid",
  "completed",
  "awaiting_acceptance",
  "revision_requested",
];

/*
 * ── D-6 (punchlist D-24/D-25/D-26, option A; ledger `2026-09-15-d24-d26-acceptance-columns`) ─────
 * THE ACCEPTANCE RAILS' FROM-STATE LISTS. They live here for the reason this module exists: a
 * second rail re-deciding "which statuses may become X" beside the first is the derivation-drift
 * class §18 rule 1 names.
 *
 * NEGATIVE SPACE, stated so green means green-within-stated-bounds (§18d): these are FROM-state
 * lists and nothing else. They say nothing about WHO may ask (the accept and revision rails gate on
 * `traveler_id` from the session, the delivery rail on `provider_id` — §14), nothing about WHETHER
 * the listing takes acceptance at all (`acceptanceModeFor` in `shared/acceptance-window.ts` answers
 * that, and D-40's `records_only` hybrid arm moves NO status), and nothing about the escalation to
 * admin review, which is D-27's lane and has no list here because this lane writes none of it.
 */

/**
 * ACCEPT. Only a booking that is actually waiting for the traveler's answer. One entry, and the
 * narrowness is the point: acceptance is what MINTS on the `gates_completion` arm, so it must never
 * be able to consume `confirmed` (which is the timer's state, not the traveler's) or any terminal
 * state.
 */
export const ACCEPTANCE_FROM_STATUSES: readonly string[] = ["awaiting_acceptance"];

/** REQUEST A REVISION. The same single state, for the same reason. */
export const REVISION_REQUESTABLE_FROM_STATUSES: readonly string[] = ["awaiting_acceptance"];

/**
 * DELIVER (or RE-DELIVER) THE ARTIFACT — the statuses in which a provider may set the per-booking
 * pointer and stamp `delivered_at`. Paid-equivalent states only: a `payment_pending` provisional
 * claim is never delivered against (§15b), and a terminal row is not re-opened by an upload.
 *
 * NOTE what is NOT here: this list permits the WRITE of the delivery facts. The only STATUS FLIP
 * the delivery rail performs is the one below.
 */
export const ARTIFACT_DELIVERY_FROM_STATUSES: readonly string[] = [
  "confirmed",
  "deposit_paid",
  "awaiting_acceptance",
  "revision_requested",
];

/**
 * RE-OPEN THE ACCEPTANCE WINDOW. The delivery rail's ONE status flip:
 * `revision_requested` -> `awaiting_acceptance`.
 *
 * `confirmed` is DELIBERATELY ABSENT, and it is the sequencing decision this lane is most likely to
 * be read wrong on. Moving `confirmed` -> `awaiting_acceptance` on first delivery is D-27's lane
 * (the `artifact_timer` amendment: the job's artifact arm targets `awaiting_acceptance`). Doing it
 * here would take every artifact booking OFF the only completion path that exists today — the
 * timer's candidate query keys on `confirmed` — and strand it in a state nothing can leave until
 * D-27 ships. So first delivery stamps the delivery facts and leaves the status alone.
 */
export const ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES: readonly string[] = ["revision_requested"];

/**
 * THE D-40 HYBRID ARM'S WRITE STATES. A `records_only` acceptance moves NO status — the booking
 * keeps `service_date_timer` and nothing mints — so this list bounds only when `accepted_at` may be
 * stamped and a revision row written on such a booking: the paid-equivalent states, for the same
 * reason the delivery list uses them.
 */
export const ARTIFACT_RECORD_ONLY_STATUSES: readonly string[] = ["confirmed", "deposit_paid"];

/**
 * ── V-24 (punchlist §2; ledger `2026-09-15-v23-v25-from-state-guards`) ────────────────────────────
 * WHICH BOOKINGS AN ADMIN'S DISPUTE-REJECT MAY RESTORE. `POST /api/admin/disputes/:bookingId/reject`
 * called the writer with TWO arguments, and the target status is `completed` — which inside
 * `updateServiceBookingStatus` STAMPS `completed_at` and MINTS held earnings
 * (`mintCompletionEarningsForBooking`) in the same transaction. So rejecting a dispute on a row that
 * had since been refunded, cancelled or swept minted earnings against it.
 *
 * Rejecting a dispute means "the traveler's claim is not upheld, put the booking back where the
 * dispute found it", so the ONLY state it may consume is the one the dispute itself created. One
 * entry, and the narrowness is the point: this is the money-riskiest write on the rail.
 */
export const DISPUTE_REJECT_FROM_STATUSES: readonly string[] = ["disputed"];
