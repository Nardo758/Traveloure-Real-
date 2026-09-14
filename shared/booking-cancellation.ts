/**
 * THE ONE STATEMENT OF WHICH BOOKING STATUSES A TRAVELER CANCELLATION MAY MOVE OUT OF.
 *
 * Ledger `2026-09-14-transport-card-cancel`; CLAUDE.md §18b (the from-state list belongs ON the
 * statement that performs the transition) and §18 rule 1 (one derivation, many callers).
 *
 * `POST /api/bookings/:id/cancel` is the platform's ONE traveler cancellation rail. Before this
 * module the same two statuses were spelled out in three places — the route's pre-check, the
 * `cancel-preview` route's `cancellable` flag, and `my-bookings.tsx`'s `canCancel` — and a fourth
 * surface (the transport card) needed them too. Four copies of a from-state list is how one
 * surface starts offering a button the server will refuse, or hiding one it would have accepted.
 *
 * WHAT THIS IS NOT. It is not a claim about MONEY. Whether a cancellation refunds anything, and
 * how much, is decided server-side by `cancellation-policy.service.ts` from the booking's own
 * policy and its time-to-start, and is stated to the traveler by the server's own
 * `cancel-preview` / cancel responses. Nothing on this list implies a refund, and no client may
 * derive one from it (§14).
 *
 * NEGATIVE SPACE. This is the from-state list for a TRAVELER cancellation and nothing else. The
 * provider/expert status rail (§18b's `expectedFromStatuses` on
 * `PATCH /api/provider|expert/bookings/:id/status`), the checkout claim machine's
 * `payment_pending` predicates and the refunder's `status <> 'refunded'` claim each carry their
 * own, deliberately — they answer different questions about different actors.
 */

/**
 * The statuses `POST /api/bookings/:id/cancel` accepts a booking IN. Both the route's 400 and the
 * atomic conditional that performs the flip read this list, so the check and the guard can never
 * disagree.
 */
export const BOOKING_CANCELLABLE_FROM_STATUSES = ["pending", "confirmed"] as const;

export type BookingCancellableFromStatus = (typeof BOOKING_CANCELLABLE_FROM_STATUSES)[number];

/**
 * §13 — an ABSENT status is not a cancellable one. A surface with no status to read has not been
 * told the booking is cancellable; it renders no control rather than guessing that it is.
 */
export function isBookingCancellable(status: string | null | undefined): boolean {
  return (
    typeof status === "string" &&
    (BOOKING_CANCELLABLE_FROM_STATUSES as readonly string[]).includes(status)
  );
}
