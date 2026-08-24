// Item 2 Phase 2 (ledger 2026-08-23-item2-affiliate): the PURE eligibility guard for the
// "Book via your Traveloure agent" CTA on an affiliate-grounded itinerary item.
//
// Split out DB-free / React-free so it unit-tests, and so the eligibility rule lives in ONE place
// (the component below only renders what this returns). Presence-guarded exactly like
// primary-action.ts's book_ride branch: the field is read if/when the server lane (Phase 2b)
// populates it, and until then this returns null for every item and the CTA never appears.
//
// §16 posture: the client never holds the affiliate URL — only an opaque server-minted
// `bookingToken`, which the booking-agent rail resolves back to the URL server-side. No token ⇒
// nothing is bookable here, so we render nothing rather than a dead button (§13).

/** The affiliate grounding the server stamps onto an itinerary item it matched to a partner product.
 *  Present ONLY on a grounded affiliate item; absent on every other item (a self-contained contract,
 *  mirrored on PlanCardActivity). */
export interface AffiliateBookingInfo {
  /** affiliate_products.id the item was grounded to (soft ref; server-owned). */
  productId: string;
  /** Opaque server-minted vault token — the ONLY booking handle the client ever holds (§16). */
  bookingToken: string;
  /** The row's CTA classifier: `affiliate_bookable` → this agent-rail CTA; `in_platform_bookable`
   *  → add-to-cart (handled elsewhere); anything else / unclassified → not bookable here (§13). */
  bookingType: string;
  partnerName?: string | null;
  title?: string | null;
  price?: number | null;
}

/** Anything carrying an optional affiliate grounding — kept structural so this helper imports nothing. */
export interface AffiliateGroundable {
  affiliateBooking?: AffiliateBookingInfo | null;
}

/**
 * The affiliate booking to offer on this item via the agent rail, or null. Returns non-null ONLY
 * when the item was grounded to an `affiliate_bookable` product AND carries a real opaque token —
 * so an `in_platform_bookable` row, an unclassified row, or a token-less row never renders the
 * agent CTA (fail-closed, §13/§16).
 */
export function resolveAffiliateBooking(item: AffiliateGroundable): AffiliateBookingInfo | null {
  const a = item.affiliateBooking;
  if (!a) return null;
  if (a.bookingType !== "affiliate_bookable") return null;
  if (!a.bookingToken) return null;
  return a;
}
