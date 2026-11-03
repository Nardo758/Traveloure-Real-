/**
 * Row PS-6 — the Trip Card's booking copy, one per booked stop (ledger `2026-11-02-ps6-booked-tick-copies-on-card`;
 * Leon, Nov 2 §3: "Booking copies live on the Trip Card, one per stop, links only per CN-1 (no writes to
 * affiliate_booking_requests). The Trip Slip shows only a booked tick.").
 *
 * PURE: it reads rows the traveler's own reads already return and writes nothing.
 *   · platform — the item's `booking` (plancard) matched by id to a row of `GET /api/my-bookings` (the read My
 *     Bookings renders): provider name, confirmation code and confirmed date come from that row.
 *   · partner  — the traveler's `affiliate_booking_requests` row for this item (`GET /api/affiliate-booking-requests/user`,
 *     the read the Trip Card's booking-agent card already makes), matched on `itineraryItemId`. Its status word is the
 *     booking-agent reading (`readBookingAgentStatus` — "Confirmed by {partner}"). The link is the tracked open route,
 *     which resolves the partner URL server-side (§16); the URL never reaches the client.
 *   · stay     — a `purchased` item with a confirmation number and no linked booking (a partner stay booked on the
 *     partner's rail writes its code onto the item).
 * A pending booking shows its status word and NO reference and NO date (§13 — booked only with a confirmation in hand).
 * The copy never offers a Book action.
 */
import { readBookingAgentStatus } from "./booking-agent-status";
import { BOOKING_DETAIL_PATH, ITEM_BOOKING_ACTION_LABELS, bookingConfirmedOrLater, itemBookingState, type ItemBookingLike } from "./item-booking-state";
import { ITEM_BOOKING_LABELS } from "@shared/booking-visibility";

/** The pending word My Bookings already prints for a booking still awaiting confirmation. */
export const BOOKING_COPY_PENDING_LABEL = "Pending";

/** HELD for owner wording approval (the brief named these as existing partner strings; none was in code). */
export const BOOKING_COPY_PARTNER = {
  viewOn: (partner: string) => `View on ${partner}`,
  terms: (partner: string) => `Your booking is with ${partner}, under their terms.`,
} as const;

export interface MyBookingRowLike {
  id: string;
  status?: string | null;
  confirmationCode?: string | null;
  confirmedAt?: string | null;
  provider?: { displayName?: string | null } | null;
}

export interface PartnerRequestRowLike {
  id: string;
  itineraryItemId?: string | null;
  status?: string | null;
  confirmationRef?: string | null;
  partnerName?: string | null;
}

export interface BookingCopyActivity extends ItemBookingLike {
  id: string;
  confirmationNumber?: string | null;
}

export interface BookingCopy {
  kind: "platform" | "partner" | "stay";
  /** Provider or partner name; null when the row does not state one (never guessed). */
  who: string | null;
  /** Confirmation reference — only once confirmed. */
  reference: string | null;
  /** When the booking was confirmed (ISO) — only once confirmed and only where a column records it. */
  confirmedAt: string | null;
  /** The status word. */
  status: string;
  confirmed: boolean;
  link: { href: string; label: string; external: boolean } | null;
  /** "Your booking is with {partner}, under their terms." — partner rows that name their partner. */
  terms: string | null;
}

const clean = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

export function buildBookingCopy(
  a: BookingCopyActivity,
  reads: { myBookings?: readonly MyBookingRowLike[] | null; partnerRequests?: readonly PartnerRequestRowLike[] | null },
): BookingCopy | null {
  const booking = (a.booking ?? null) as { id?: string; status?: string | null } | null;
  if (booking) {
    // Only a booking whose state reads `booked` gets a copy; a dispute keeps its own note and link.
    if (itemBookingState(a) !== "booked") return null;
    const row = reads.myBookings?.find((b) => b.id === booking.id) ?? null;
    const status = row?.status ?? booking.status ?? null;
    const confirmed = bookingConfirmedOrLater(status);
    return {
      kind: "platform",
      who: clean(row?.provider?.displayName),
      reference: confirmed ? clean(row?.confirmationCode) ?? clean(a.confirmationNumber) : null,
      confirmedAt: confirmed ? clean(row?.confirmedAt) : null,
      status: confirmed ? ITEM_BOOKING_LABELS.booked : BOOKING_COPY_PENDING_LABEL,
      confirmed,
      // There is no per-booking page; My Bookings is where a platform booking is managed (BOOKING_DETAIL_PATH).
      link: { href: BOOKING_DETAIL_PATH, label: ITEM_BOOKING_ACTION_LABELS.open_booking, external: false },
      terms: null,
    };
  }
  if (a.endedBooking) return null;
  const request = reads.partnerRequests?.find((r) => r.itineraryItemId === a.id) ?? null;
  if (request) {
    const reading = readBookingAgentStatus(request);
    const confirmed = reading.stage === "confirmed";
    const partner = clean(request.partnerName);
    return {
      kind: "partner",
      who: partner,
      reference: confirmed ? clean(request.confirmationRef) ?? clean(a.confirmationNumber) : null,
      // No column records when the partner confirmed; the request's own dates are not the booking's (§13).
      confirmedAt: null,
      status: reading.label,
      confirmed,
      link: partner
        ? { href: `/api/affiliate-booking-requests/${encodeURIComponent(request.id)}/open`, label: BOOKING_COPY_PARTNER.viewOn(partner), external: true }
        : null,
      terms: confirmed && partner ? BOOKING_COPY_PARTNER.terms(partner) : null,
    };
  }
  const ref = clean(a.confirmationNumber);
  if (a.routingStatus === "purchased" && ref) {
    return { kind: "stay", who: null, reference: ref, confirmedAt: null, status: ITEM_BOOKING_LABELS.booked, confirmed: true, link: null, terms: null };
  }
  return null;
}
