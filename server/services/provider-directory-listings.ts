/**
 * Which of a provider's listings the /providers directory card names, and which one it may call
 * "Most booked" (ledger `2026-09-23-provider-directory-card`). Pure — the loader in
 * `server/routes/storefront.routes.ts` reads the rows and this decides; no DB, so every rule is
 * proven by `server/__tests__/provider-directory-listings.test.ts`.
 *
 * ORDER: most real bookings first, then the best-rated, then the newest. A "real booking" is a
 * row in `RECORD_BOOKING_STATUSES` (`shared/booking-visibility.ts` — "what may be listed as a real
 * booking"), counted by the loader and never restated here.
 *
 * THE COUNTS NEVER LEAVE THE SERVER. The card shows an ORDER and at most one tag, never a number:
 * a booking count is the provider's business volume, and "1 booking" reads worse than silence.
 *
 * "MOST BOOKED" IS A CLAIM, SO IT IS MADE ONLY WHEN IT IS TRUE (§13): the top listing carries it
 * only when it has at least one booking AND strictly more than every other listing. A tie has no
 * single most-booked listing, and a provider with no bookings has none at all.
 */

export interface DirectoryListingFacts {
  id: string;
  name: string;
  price: string | null;
  showPrice: boolean | null;
  /** The listing's own pricing model and unit, passed through for the card's "/person" suffix. */
  priceType: string | null;
  pricingUnit: string | null;
  /** Rows of this listing in `RECORD_BOOKING_STATUSES`. Internal — never serialised. */
  bookingCount: number;
  /** Mean of APPROVED reviews, or null when there are none. Internal ordering input only. */
  averageRating: number | null;
  createdAt: Date | string | null;
}

export interface DirectoryCardListing {
  id: string;
  name: string;
  /** `null` when the owner hides the price — the card then shows no price for that row. */
  price: string | null;
  priceType: string | null;
  pricingUnit: string | null;
  mostBooked: boolean;
}

export const DIRECTORY_CARD_LISTING_LIMIT = 3;

function time(value: Date | string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function rankDirectoryListings(listings: readonly DirectoryListingFacts[]): DirectoryListingFacts[] {
  return [...listings].sort((a, b) => {
    const byBookings = count(b.bookingCount) - count(a.bookingCount);
    if (byBookings !== 0) return byBookings;
    const ra = a.averageRating ?? -1;
    const rb = b.averageRating ?? -1;
    if (rb !== ra) return rb - ra;
    const byNewest = time(b.createdAt) - time(a.createdAt);
    if (byNewest !== 0) return byNewest;
    return a.id.localeCompare(b.id);
  });
}

/** The listings a card names, in order, with the "Most booked" flag decided once. */
export function directoryCardListings(
  listings: readonly DirectoryListingFacts[],
  limit = DIRECTORY_CARD_LISTING_LIMIT,
): DirectoryCardListing[] {
  const ranked = rankDirectoryListings(listings);
  const top = count(ranked[0]?.bookingCount ?? 0);
  const runnerUp = count(ranked[1]?.bookingCount ?? 0);
  const hasMostBooked = top > 0 && top > runnerUp;
  return ranked.slice(0, limit).map((listing, index) => ({
    id: listing.id,
    name: listing.name,
    price: listing.showPrice === false ? null : listing.price,
    priceType: listing.priceType,
    pricingUnit: listing.pricingUnit,
    mostBooked: hasMostBooked && index === 0,
  }));
}
