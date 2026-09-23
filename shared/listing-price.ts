/**
 * The lowest price a traveler can actually see across a set of listings — ONE rule, two callers:
 * the storefront booking panel's "From" line (`client/src/lib/storefront-booking-panel.ts`, which
 * re-exports it) and the provider directory card's "From" figure (`loadProviderStorefrontDirectory`,
 * which computes it over every listing, not only the three the card names). Two copies would
 * disagree the day one of them learned a new way a price can be hidden (§18 rule 1).
 *
 * A hidden price, a missing price and a non-positive price are all "not a price" (§13): the
 * answer is `null` rather than "$0", and a price the owner chose to hide is never revealed.
 */
export interface PricedListing {
  price: string | number | null;
  /** `false` means the owner hides the price everywhere. Absent = shown (the column default). */
  showPrice?: boolean | null;
}

export function lowestListedPrice(listings: readonly PricedListing[]): number | null {
  let lowest: number | null = null;
  for (const s of listings) {
    if (s.showPrice === false || s.price == null) continue;
    const n = Number(s.price);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (lowest === null || n < lowest) lowest = n;
  }
  return lowest;
}
