/**
 * ONE booking-visibility predicate for every earner-console surface (ledger 90, lane FP-5).
 *
 * WHY THIS FILE EXISTS. The console-tabs exercise (docs/testing/CONSOLE_TABS_EXERCISE.md,
 * as-of `f747d0a`) drove one real checkout that failed at the Stripe boundary and left exactly
 * one row behind: a `service_bookings` row at `status='payment_pending'` with
 * `stripe_payment_intent_id IS NULL` — an **unauthorized claim by construction** (§15b). Six
 * console surfaces read that row and five disagreed about what it meant:
 *
 *   Today            → "Pending bookings 0"                      (client filter `status === 'pending'`)
 *   Inbox tile       → "1 Pending"                               (folded payment_pending into Pending)
 *   Inbox queue      → "No bookings waiting"                     (list filtered `status === 'pending'`)
 *   Customers        → "1 booking (1 pending payment)"           (the only honest one)
 *   Money breakdown  → "Your lifetime earnings $83.60"           (NO status filter at all)
 *   Money by-source  → "Direct · 1 booking · $95.00"             (NO status filter at all)
 *
 * Each page had picked its own predicate for the same row. This module is the single predicate
 * they now share, so a new tab cannot invent a sixth answer. It is deliberately in `shared/` —
 * the server aggregations (`inArray(serviceBookings.status, …)`) and the client console pages
 * consume the SAME arrays, never two hand-kept copies.
 *
 * VOCABULARY. `service_bookings.status` is a plain varchar (no DB CHECK — publish-trap
 * avoidance) whose live values are: `payment_pending`, `pending`, `deposit_paid`, `confirmed`,
 * `in_progress`, `completed`, `cancelled`, `refunded`, `failed`, `disputed`.
 *
 * SCOPE (ruling 43 negative space): this module says which rows a surface may COUNT or SUM. It
 * is NOT a state machine and grants no transition — the claim machine
 * (`server/services/checkout-claim.service.ts`) remains the sole author of provisional-claim
 * transitions (§15b/§18b), and `COMPLETION_ALLOWED_FROM_STATUSES`
 * (`server/services/booking-completion.service.ts`) remains the sole authority on what may be
 * completed. Nothing here may be used as a from-state allow-list.
 */

/**
 * PROVISIONAL — checkout wrote the claim row, Stripe never authorized it (§15b).
 *
 * These rows exist so the claim/void/promote machinery has something to key on. They represent
 * NO money and NO obligation on the earner: the traveler has not paid and the earner must not
 * act (a provider Accept on one of these destroyed reclaimable inventory — §18b, ruling 42 SD-1).
 * A surface may DISCLOSE them ("awaiting the traveler's payment"), never bank them and never
 * queue them for action.
 */
export const PROVISIONAL_BOOKING_STATUSES = ["payment_pending"] as const;

/**
 * MONEY-BEARING — an authorization exists, so the row's amounts are real money.
 *
 * The ONLY statuses whose `total_amount` / `platform_fee` / `provider_earnings` may appear under
 * anything labelled earnings, revenue, gross booking value or "by source". A row reaches these
 * only through the shared promotion path (`promotePaidCheckout`) or the owner rail acting on an
 * already-authorized booking.
 *
 * `deposit_paid` is INCLUDED at its FULL booked amounts, deliberately: the deposit/balance split
 * is the PAYMENT SCHEDULE, not a re-split of the charge, and `shared/schema.ts` (ruling 72,
 * migration 200) states that "completion (D8) and earnings math read the full amounts unchanged".
 *
 * DELIBERATELY ABSENT, each for its own reason:
 *   `payment_pending` — no authorization (§15b); the whole point of this module.
 *   `pending`         — the legacy accept/decline rail's birth state; nothing has been charged.
 *   `cancelled` / `refunded` / `failed` / `disputed` — money that is gone, never happened, or is
 *                       contested. Counting any of them as earnings is the same class of lie.
 */
export const EARNING_BOOKING_STATUSES = [
  "confirmed",
  "deposit_paid",
  "in_progress",
  "completed",
] as const;

/**
 * ACTIONABLE — the earner personally owes this row an Accept or a Decline.
 *
 * Exactly `pending`. `payment_pending` is excluded BY RULE, not by omission (§18b): the owner
 * rail may not move a booking out of a provisional state, so offering the button at all is the
 * defect. This set is what the Inbox queue, the Inbox "Pending" tile, Today's "Pending bookings"
 * tile and Today's Action Items all count — one predicate, four surfaces.
 */
export const ACTIONABLE_BOOKING_STATUSES = ["pending"] as const;

/**
 * RECORD — the earner's confirmed/active/finished book of business (Inbox History).
 *
 * Identical membership to `EARNING_BOOKING_STATUSES` today and named separately on purpose: one
 * is "what may be summed as money", the other is "what may be listed as a real booking". They
 * are the same question about the same rows right now; if they ever diverge, the divergence must
 * be a deliberate edit here rather than a silent re-use of the wrong list.
 */
export const RECORD_BOOKING_STATUSES = EARNING_BOOKING_STATUSES;

/**
 * CLOSED — a booking that reached a TERMINAL outcome without being (or after ceasing to be)
 * money for the earner: `cancelled` (an owner decline, or any unpaid cancellation — the
 * `OWNER_BOOKING_TRANSITIONS.cancelled` branch in `routes.ts`) and `refunded` (an owner
 * decline/cancellation on a row that HAD been charged, made whole via
 * `stripePaymentService.refundServiceBooking`). These are exactly the statuses a provider's
 * "Decline" button can put a row into.
 *
 * QA-1 finding: History used `RECORD_BOOKING_STATUSES` alone, so a declined booking had NO
 * home on the console — not counted (correctly — it is not money), but also not SHOWN, so a
 * provider who declined a booking had no visible record that it ever happened. This set is the
 * fix: a real terminal outcome that must be disclosed, never a live queue item and never money.
 *
 * DELIBERATELY ABSENT: `failed` (a §15b provisional claim whose Stripe attempt never
 * succeeded — it never became a real booking the earner engaged with, the same reason
 * `payment_pending` stays out of every set here) and `disputed` (still open/contested, not a
 * closed outcome — it may resolve back to `confirmed` or forward to `refunded`). Widening this
 * set is a deliberate edit, never a silent broadening of "history."
 */
export const CLOSED_BOOKING_STATUSES = ["cancelled", "refunded"] as const;

/**
 * HISTORY — everything that belongs on the earner's Inbox History tab: the real book of
 * business (RECORD) plus its closed/declined outcomes (CLOSED). A provisional §15b claim
 * (`payment_pending`) and the live `pending` request state are excluded by construction — those
 * live on Queue, not History.
 */
export const HISTORY_BOOKING_STATUSES = [
  ...RECORD_BOOKING_STATUSES,
  ...CLOSED_BOOKING_STATUSES,
] as const;

export type BookingStatusLike = string | null | undefined;

const has = (set: readonly string[], status: BookingStatusLike): boolean =>
  typeof status === "string" && set.includes(status);

/** True for a row whose money is real and may be summed under an earnings/revenue label. */
export const isEarningBooking = (status: BookingStatusLike): boolean =>
  has(EARNING_BOOKING_STATUSES, status);

/** True for a row the earner must Accept or Decline. Never true for a provisional claim. */
export const isActionableBooking = (status: BookingStatusLike): boolean =>
  has(ACTIONABLE_BOOKING_STATUSES, status);

/** True for an unauthorized §15b claim — disclose it, never bank it, never queue it. */
export const isProvisionalBooking = (status: BookingStatusLike): boolean =>
  has(PROVISIONAL_BOOKING_STATUSES, status);

/** True for a row that belongs in the earner's booking record (Inbox History). */
export const isRecordBooking = (status: BookingStatusLike): boolean =>
  has(RECORD_BOOKING_STATUSES, status);

/** True for a declined/cancelled/refunded row — a real terminal outcome, never money. */
export const isClosedBooking = (status: BookingStatusLike): boolean =>
  has(CLOSED_BOOKING_STATUSES, status);

/** True for any row that belongs on the Inbox History tab (RECORD ∪ CLOSED). */
export const isHistoryBooking = (status: BookingStatusLike): boolean =>
  has(HISTORY_BOOKING_STATUSES, status);

/**
 * The one label every surface uses for a provisional claim, so the traveler-payment state reads
 * identically on Inbox, Today and Customers. Customers wrote this idiom first ("1 pending
 * payment"); the rest of the console adopts it rather than inventing a second wording.
 */
export const PROVISIONAL_BOOKING_LABEL = "Awaiting payment";

/** The one-line explanation that must accompany the label wherever a count is shown. */
export const PROVISIONAL_BOOKING_HINT =
  "Awaiting the traveler's payment — nothing for you to do.";
