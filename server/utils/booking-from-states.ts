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
 * ── ACCEPT NEEDS A PAYMENT ON RECORD (ledger `2026-09-24-request-rail-unpaid`) ─────────────────────
 * The owner rail's Accept (`pending → confirmed`) is for a request the traveler has already PAID —
 * the checkout stamps its PaymentIntent before the provider ever sees the row. A `pending` row with
 * NO PaymentIntent is a request nobody paid for (an expert-booking-request, or a quote-born booking
 * still awaiting its charge), and accepting it would confirm a booking around the checkout. Returns
 * the refusal reason, or null when the transition may proceed. It decides nothing about a DECLINE.
 */
export function ownerTransitionRefusal(
  targetStatus: string,
  booking: { stripePaymentIntentId?: string | null },
): "unpaid" | null {
  if (targetStatus === "confirmed" && !booking.stripePaymentIntentId) return "unpaid";
  return null;
}

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
/*
 * ── D-38 ADDS THE DECLARED STATE (ledger `2026-09-15-d36-d39-completion-declared`) ──────────────
 * `completion_declared` descends from `confirmed`: the seller has DECLARED the work done and the
 * traveler's window is OPEN — which is precisely the moment a dispute is FOR. Nothing has minted
 * (D-37 puts the mint at the window's close), so `setBookingEarningsDispute` will flag ZERO rows
 * here, and zero must never be read as "cleared": the block is the status itself, because a
 * `disputed` booking never reaches `completed` and so nothing mints. Brief §11 rule 1: the dispute
 * "claims `['completion_declared','confirmed','completed']`" — plus the acceptance pair above.
 *
 * It is the SAME `disputed` row as a post-completion dispute — same status, same
 * `booking_metadata.disputeReason`, same `GET /api/admin/disputes` queue. No `admin_review`
 * status, no disputes table. The queue tells the two apart by DERIVATION
 * (`disputeStageFor` in `shared/declared-completion-window.ts`), never by a second status.
 */
// MOVED to `shared/declared-completion-window.ts` and RE-EXPORTED here (ledger
// `2026-09-17-surfaces-acceptance-completion`): the slip, My Bookings and the Trip Card must decide
// whether to draw a dispute control from the SAME list the rail guards on, and a client cannot
// import a server module. Every server caller of this name is unchanged; there is still exactly one
// definition. The comment block above is the list's own record and stays with the name.
import { DISPUTABLE_FROM_STATUSES } from "@shared/declared-completion-window";
export { DISPUTABLE_FROM_STATUSES };

/*
 * ── D-7 DECLARED COMPLETION (punchlist D-36/D-37, ruled A; ledger
 * `2026-09-15-d36-d39-completion-declared`) ──────────────────────────────────────────────────────
 * THE DECLARED STATE'S THREE FROM-STATE LISTS. Brief Part II §11 rule 1: "The declaration claims
 * `['confirmed']`; the window's close claims `['completion_declared']`". They live here for this
 * module's own reason — a second rail re-deciding "which statuses may become X" beside the first is
 * the derivation-drift class §18 rule 1 names.
 *
 * NEGATIVE SPACE (§18d): FROM-state lists and nothing else. WHO may declare is the owner rail's own
 * `providerId` gate (§14); WHICH rules may be declared is `OWNER_DECLARED_COMPLETION_RULES` plus the
 * `service_date_timer` arm (`shared/service-fundamentals.ts`, `timerOpensDeclaredWindow`); WHEN the
 * window closes is `declaredCompletionDeadline` (`shared/declared-completion-window.ts`).
 */

/**
 * DECLARE. `confirmed → completion_declared`. One entry, and the narrowness is the point: a
 * declaration is the seller's statement about a paid, accepted booking. It must never consume
 * `awaiting_acceptance` (the traveler's state, D-6), `deposit_paid` (a balance is still owed —
 * completing a half-paid booking is a different question nobody has ruled), a `payment_pending`
 * provisional claim (§15b) or any terminal state. It MINTS NOTHING — this transition is not the
 * money event, which is the whole of what D-7 changed.
 */
export const COMPLETION_DECLARABLE_FROM_STATUSES: readonly string[] = ["confirmed"];

/**
 * THE WINDOW CLOSES. `completion_declared → completed` — the flip that MINTS (D-37), made by the
 * nightly job's `window_elapsed` arm through the ONE completion implementation (`completeBooking`).
 * One entry: a `disputed` row is deliberately NOT here, so a traveler's dispute inside the window
 * stops the timer BY CONSTRUCTION — the guarded UPDATE matches zero rows — and so does every other
 * state. `COMPLETION_ALLOWED_FROM_STATUSES` (`['confirmed']`) is UNCHANGED: it is also the
 * pass-1 candidate predicate, and widening it would hand the timer bookings it may not complete
 * (the D-24 invariant, one state over).
 */
export const DECLARED_WINDOW_CLOSE_FROM_STATUSES: readonly string[] = ["completion_declared"];

/**
 * THE TRAVELER CONFIRMS. `POST /api/bookings/:id/confirm-completion` is the traveler saying "this
 * happened" — the strongest evidence on the platform, and the rail that SHORT-CIRCUITS the window
 * (brief §8: "it must keep short-circuiting the window"). It may consume `confirmed` exactly as
 * before, and now also `completion_declared`: a seller's declaration must not lock the payer OUT
 * of confirming their own booking. Never `awaiting_acceptance` (that is the accept rail's word) and
 * never a terminal or provisional state.
 */
export const TRAVELER_CONFIRMABLE_FROM_STATUSES: readonly string[] = ["confirmed", "completion_declared"];

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
 * that, and D-40's `records_only` hybrid arm moves NO status). D-27's two scheduler transitions DO have
 * lists here now — `ACCEPTANCE_PROMPT_FROM_STATUSES` and `ACCEPTANCE_ESCALATION_FROM_STATUSES`,
 * below — added by ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`.
 */

/**
 * ACCEPT. Only a booking that is actually waiting for the traveler's answer. One entry, and the
 * narrowness is the point: acceptance is what MINTS on the `gates_completion` arm, so it must never
 * be able to consume `confirmed` (which is the timer's state, not the traveler's) or any terminal
 * state.
 */
// MOVED to `shared/acceptance-window.ts` and RE-EXPORTED — see the note on
// `DISPUTABLE_FROM_STATUSES` above. The traveler's ACCEPT and REQUEST REVISION buttons read these.
import { ACCEPTANCE_FROM_STATUSES, REVISION_REQUESTABLE_FROM_STATUSES } from "@shared/acceptance-window";
export { ACCEPTANCE_FROM_STATUSES, REVISION_REQUESTABLE_FROM_STATUSES };

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
 * RE-OPEN (OR OPEN) THE ACCEPTANCE WINDOW. The delivery rail's ONE status flip, to
 * `awaiting_acceptance`.
 *
 * `confirmed` JOINED THIS LIST WITH D-27 (ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`),
 * and the reason it was absent is worth keeping written down because it is the sequencing this lane
 * closes. Until D-27, `confirmed` was the ONLY state the artifact completion path could read: the
 * nightly timer's candidate query keys on it, and `artifact_timer` was in
 * `TIMER_DRIVEN_COMPLETION_RULES`. Moving a booking off `confirmed` on first delivery would have
 * stranded it in a state nothing could leave. D-27 retires that timer as a completion rule, so
 * `confirmed` is no longer a completion state for an artifact — it is the state BEFORE the traveler
 * has been asked — and a provider's first per-booking delivery is exactly the moment to ask.
 *
 * THE SAME TRANSITION HAS TWO CALLERS AND ONE MEANING. The provider's deliver rail makes it from an
 * explicit per-booking delivery; the scheduler's acceptance-prompt arm makes it from the derived
 * listing clock for a booking whose provider delivered through the listing. Both consume this list,
 * both are atomic conditionals, and neither invents a `delivered_at` the other would disagree with
 * (D-26: the listing clock is never written back).
 */
export const ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES: readonly string[] = [
  "confirmed",
  "revision_requested",
];

/*
 * ── D-27 (punchlist D-27, ruled A; ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`) ─────
 * THE SCHEDULER'S TWO ARTIFACT TRANSITIONS. `artifact_timer` retires as a COMPLETION rule and
 * becomes an ACCEPTANCE-PROMPT rule, so the nightly job stops flipping artifacts to `completed` and
 * instead (a) ASKS and (b) ESCALATES. Both lists live here for this module's own reason: a second
 * rail re-deciding "which statuses may become X" is the derivation-drift class §18 rule 1 names.
 */

/**
 * (a) ASK. `confirmed -> awaiting_acceptance`, once a delivery instant EXISTS. One entry, and the
 * narrowness is the point: a booking that has already been asked is not asked again (the transition
 * itself is the guard, §15 — a second pass matches zero rows), and no terminal or provisional state
 * is ever prompted.
 */
export const ACCEPTANCE_PROMPT_FROM_STATUSES: readonly string[] = ["confirmed"];

/**
 * (b) ESCALATE. `awaiting_acceptance -> disputed`, once the derived acceptance deadline has passed.
 *
 * THE TARGET IS THE EXISTING ADMIN DISPUTE QUEUE (`GET /api/admin/disputes`, `WHERE status =
 * 'disputed'`) — never a second queue and never a new `admin_review` status. A second queue would
 * be a second place a human has to look for work that has the same shape: money in escrow, nothing
 * minted, and a decision only a person can make.
 *
 * `revision_requested` is DELIBERATELY ABSENT. A booking waiting on the SELLER is not a booking
 * nobody answered — the traveler answered, and asked for a change. Escalating it would file the
 * seller's silence under the traveler's, and the two are different facts with different remedies.
 * Whether an ignored revision request escalates on its own clock is NOT ruled and is not invented
 * here; the traveler's own dispute rail already covers it (`DISPUTABLE_FROM_STATUSES` includes
 * `revision_requested`).
 */
export const ACCEPTANCE_ESCALATION_FROM_STATUSES: readonly string[] = ["awaiting_acceptance"];

/**
 * THE D-40 HYBRID ARM'S WRITE STATES. A `records_only` acceptance moves NO status — the booking
 * keeps `service_date_timer` and nothing mints — so this list bounds only when `accepted_at` may be
 * stamped and a revision row written on such a booking: the paid-equivalent states, for the same
 * reason the delivery list uses them.
 */
// MOVED to `shared/acceptance-window.ts` and RE-EXPORTED — same reason: D-40's hybrid arm draws the
// same two buttons, and its from-state list must not be copied onto a client.
import { ARTIFACT_RECORD_ONLY_STATUSES } from "@shared/acceptance-window";
export { ARTIFACT_RECORD_ONLY_STATUSES };

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

/**
 * ── LD 46 / D-27's MONEY OUTCOME — WHICH BOOKINGS AN ADMIN MAY REFUND AS "RESOLVED FOR THE TRAVELER
 * ON A REJECTED ARTIFACT" (ledger `2026-09-17-ld50-remainder-and-artifact-refund`) ─────────────────
 *
 * A traveler's REJECTION of a delivered artifact does not itself move money: D-27 routes a rejection
 * to ASK and then ESCALATE into the existing admin dispute queue, and §14 wants the actor of a money
 * movement to be a session with standing. The refund is therefore the ADMIN's resolution of that
 * dispute, and the ONLY state it may consume is the one the dispute writers create — the same single
 * entry `DISPUTE_REJECT_FROM_STATUSES` uses, for the same reason: this is the money-riskiest write on
 * the rail, and a wider list would let it refund a booking no dispute ever reached.
 *
 * Both dispute writers land here: the traveler's own `POST /api/bookings/:id/dispute` and the D-27
 * escalation (`awaiting_acceptance → disputed`, `systemDisputeReason = acceptance_window_elapsed`).
 * The rail cannot tell them apart and deliberately does not try — an admin reads the queue and decides.
 */
export const ARTIFACT_REJECTION_REFUND_FROM_STATUSES: readonly string[] = ["disputed"];

/*
 * ── D-34 (punchlist D-32..D-35, ruled A; ledger `2026-09-16-d32-d35-bundle-components`) ─────────
 * A BUNDLE COMPLETES PARTIALLY. `confirmed → partially_completed` — the parent flip a bundle takes
 * when every component has an answer, at least one was delivered and at least one was NOT
 * (`deriveBundleOutcome` in `shared/bundle-component-states.ts` is the ONE derivation). It is the
 * money event for the delivered share: `storage.updateServiceBookingStatus` mints ONCE over the
 * REDUCED figures inside the same transaction (D-35). One entry, and the narrowness is the point —
 * a bundle already `completed`, `refunded` or `disputed` is never re-decided by a component write.
 *
 * WHAT DELIBERATELY DID NOT CHANGE, each stated because D-34's brief text names it:
 *   - `COMPLETION_ALLOWED_FROM_STATUSES` (`booking-completion.service.ts`) is NOT widened. The brief
 *     added `partially_completed` "so a late-delivered component can still complete the parent", but
 *     the state is REACHED ONLY when no component is `pending` — a component is `failed` by an
 *     atomic `WHERE status = 'pending'` claim and never comes back — so there is no late component
 *     left to complete, and widening the timer's candidate predicate would hand the nightly job a
 *     state it can never complete (the D-24 invariant, one state over).
 *   - `DISPUTABLE_FROM_STATUSES` does NOT gain it. Not ruled, and not safe to infer:
 *     `DISPUTE_REJECT_FROM_STATUSES` restores a dispute to `completed`, which would misstate a
 *     partial parent, and the dispute route's time bound anchors on `completed_at`, which a partial
 *     parent never stamps. A per-component dispute inherits D-6/D-7 (brief §2 rule 7) and is its
 *     own lane.
 *   - `TERMINAL_STATUSES` (`stripeReconciliation.ts`) does NOT gain it — a partially completed
 *     bundle still owes a component refund, and §17 must keep seeing it as paid.
 */
export const PARTIAL_COMPLETION_FROM_STATUSES: readonly string[] = ["confirmed"];

/*
 * ── THE ALL-UNDELIVERED PARENT (decision-maker ruling 2026-09-17; ledger
 * `2026-09-17-all-undelivered-parent`) ───────────────────────────────────────────────────────────
 * WHEN THE LAST DELIVERABLE COMPONENT OF A BUNDLE BECOMES TERMINAL-UNDELIVERED AND NONE REMAIN
 * DELIVERABLE, THE PARENT IS CANCELLED. `confirmed → cancelled`, taken by the ONE component writer
 * inside `storage.updateServiceBookingStatus` — so the flip, the booking's slot release and the
 * bookings-count decrement are the SAME transaction, and the transition itself is the guard (§15/§18b):
 * a retry, a concurrent last-flip and a re-drive all match zero rows and release nothing twice.
 *
 * ONE ENTRY, and the narrowness is the point — the same single entry `PARTIAL_COMPLETION_FROM_STATUSES`
 * carries, for the same reason. `confirmed` is the only state a LIVE bundle can be in when a component
 * write reaches this rail: `pending` is an unauthorized checkout claim the claim machine owns (§15b,
 * §18b), and `completed` / `partially_completed` / `refunded` / `disputed` / `cancelled` are all
 * decided rows a component write must never re-decide. A bundle already cancelled here matches nothing,
 * which is exactly what makes the release exactly-once.
 *
 * DELIBERATELY NOT `BOOKING_CANCELLABLE_FROM_STATUSES` (`["pending", "confirmed"]`, the traveler's
 * whole-row cancel): that list admits `pending`, and this rail must never terminalise a provisional
 * claim.
 */
export const ALL_UNDELIVERED_CANCEL_FROM_STATUSES: readonly string[] = ["confirmed"];
