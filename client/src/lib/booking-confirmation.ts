/**
 * The post-payment page's two small decisions (board #533, #1293). Pure.
 */

/** `?bookings=a,b,c` → at most 20 well-formed ids; anything else is dropped. */
export function parseBookingIdsParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)))).slice(0, 20);
}

/**
 * What a booking's status means to the traveler right after paying. "Confirmed" is said only for
 * `confirmed`; a request-to-book listing is paid but still `pending` the provider's answer, and
 * says so — with no promised response time, because nothing enforces one (§13).
 */
export function bookingStatusSentence(status: string | null | undefined): string {
  switch (status) {
    case "confirmed":
      return "Confirmed.";
    case "pending":
      return "Paid — waiting for the provider to confirm. We'll notify you when they do.";
    case "payment_pending":
      return "Payment is still being confirmed with your bank.";
    case "deposit_paid":
      return "Deposit paid — the balance is due later.";
    default:
      return "Booked.";
  }
}

/** Where a paid checkout lands: the confirmation page with its bookings, or My Bookings if none. */
export function bookingConfirmationPath(bookingIds: readonly string[]): string {
  const ids = parseBookingIdsParam(bookingIds.join(","));
  return ids.length > 0 ? `/booking/confirmation?bookings=${encodeURIComponent(ids.join(","))}` : "/bookings";
}
