/**
 * My Bookings: whether the page shows the "No bookings yet" empty card, and which tab opens first.
 *
 * Ledger `2026-09-25-p1-approve-and-quotes`: the empty card used to REPLACE the whole tab block
 * whenever the traveler had no bookings and no ready-made purchases, so a traveler whose only
 * row was a QUOTE never saw the Quotes tab — the one home of the quote Accept control (LD 49).
 * A quote is not a booking and is never counted into the booking tabs; it only keeps the tabs
 * on screen and, when it is the only thing there, opens the Quotes tab.
 */
export interface MyBookingsViewInput {
  bookingCount: number;
  purchaseCount: number;
  quoteCount: number;
}

export function myBookingsShowsEmptyState({ bookingCount, purchaseCount, quoteCount }: MyBookingsViewInput): boolean {
  return bookingCount === 0 && purchaseCount === 0 && quoteCount === 0;
}

export function myBookingsDefaultTab({ bookingCount, purchaseCount, quoteCount }: MyBookingsViewInput): "all" | "packages" | "quotes" {
  if (bookingCount > 0) return "all";
  if (purchaseCount > 0) return "packages";
  if (quoteCount > 0) return "quotes";
  return "all";
}
