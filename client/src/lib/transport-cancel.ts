/**
 * THE TRANSPORT CARD'S CANCEL-CONTROL DECISION — one pure function, no money in it.
 *
 * Ledger `2026-09-14-transport-card-cancel`; punchlist R-2. CLAUDE.md §13, §14, §18 rule 1.
 *
 * R-2: `actionButton()` on `TransportBookingCard` opened with
 * `if (isCancelled || isBooked || isConfirmed) return null;`, and the file held no cancel or
 * refund control at all — a traveler who had paid for a platform transport option had nowhere on
 * that surface to undo it, while `POST /api/bookings/:id/cancel` had existed all along.
 *
 * WHAT THIS DECIDES, AND WHAT IT REFUSES TO DECIDE. It answers one question — do we draw the
 * control, and against which booking id — from two facts the SERVER resolved
 * (`serviceBookingId`, `serviceBookingStatus`) plus the surface's own read-only flag. It decides
 * NOTHING about money: no refund amount, no policy, no percentage, no window. Those are the
 * server's, stated by `GET /api/bookings/:id/cancel-preview` before the traveler confirms and by
 * the cancel response afterwards (§14).
 *
 * THE STATUS LIST IS NOT RE-TYPED HERE. `isBookingCancellable` is the shared
 * `@shared/booking-cancellation` predicate that the cancel route's own 400 and its §18b
 * `expectedFromStatuses` guard both read. A second copy on the client is the derivation-drift
 * class §18 rule 1 names: it is how a button appears for a state the server refuses, or
 * disappears for one it would have accepted.
 *
 * §13 — EVERY "NO" CARRIES ITS REASON, and the reasons are different facts. `no-booking` means
 * this viewer has no transport booking of this option (the common case: an unbought option, an
 * affiliate option fulfilled through the booking-agent rail, or a hub read by an expert rather
 * than the traveler). `not-cancellable` means there IS one and it has left the cancellable
 * states — cancelled, refunded, completed. They are never collapsed into one silent `null`,
 * because the surface says different things about them.
 *
 * NEGATIVE SPACE: this is PURE. It does not render, fetch, or know what the transport OPTION's
 * own `bookingStatus` says — that column is the option's vocabulary
 * (`available|booked|confirmed|cancelled`), it is not flipped by a booking cancellation, and
 * reading it here would be a second, disagreeing answer to the same question.
 */
import { isBookingCancellable } from "@shared/booking-cancellation";

export interface TransportCancelInput {
  /** `service_bookings.id`, resolved server-side for the SESSION viewer. Null = none. */
  serviceBookingId?: string | null;
  /** `service_bookings.status`, verbatim from the server. Null = not known. */
  serviceBookingStatus?: string | null;
  /** The surface is a read-only view (a shared plan, an expert's read of the hub). */
  readOnly?: boolean;
}

export type TransportCancelControl =
  | { kind: "cancel"; bookingId: string }
  | { kind: "none"; reason: "read-only" | "no-booking" | "not-cancellable" };

export function transportCancelControl(input: TransportCancelInput): TransportCancelControl {
  if (input.readOnly) return { kind: "none", reason: "read-only" };
  const bookingId = input.serviceBookingId;
  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return { kind: "none", reason: "no-booking" };
  }
  if (!isBookingCancellable(input.serviceBookingStatus)) {
    return { kind: "none", reason: "not-cancellable" };
  }
  return { kind: "cancel", bookingId };
}
