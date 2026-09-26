/**
 * A CART LINE THE SELLER MUST ACCEPT FIRST — the cart page's words for it.
 *
 * Ledger `2026-09-25-checkout-request-mode`. The server decides which lines these are (ONE
 * predicate, `listingRequiresRequest` in `server/services/buy-action-payload.ts`, which calls
 * `resolveBookingMode`) and ships them on `GET /api/cart` as `requestOnlyItemIds` +
 * `requestOnlyReasons`; checkout refuses them 409 with the same `reason`. This module DECIDES
 * NOTHING — it only says the server's reason out loud and names where the request control lives
 * (§13: a refusal is a sentence, never a greyed-out button).
 *
 * PURE — no React, no fetch.
 */

/** Mirrors the server's `RequestOnlyReason` (the two reasons the refusal body can carry). */
export type RequestOnlyReason = "listing_requires_request" | "listing_not_bookable";

export function isRequestOnlyReason(value: unknown): value is RequestOnlyReason {
  return value === "listing_requires_request" || value === "listing_not_bookable";
}

export const REQUEST_ONLY_LINE_SENTENCE: Record<RequestOnlyReason, string> = {
  listing_requires_request:
    "This listing is booked by request: the provider accepts first, and nothing is charged until then. Ask for it from the listing page, or remove it here to check out the rest.",
  listing_not_bookable:
    "This listing is not open for booking right now. Remove it here to check out the rest.",
};

/** The listing page — where "Request to book" / the quote request lives. */
export function requestOnlyListingHref(serviceId: string): string {
  return `/services/${encodeURIComponent(serviceId)}`;
}
