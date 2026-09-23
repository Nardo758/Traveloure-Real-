/**
 * provider-directory-presentation.ts — pure helpers for the /providers directory page.
 *
 * Backed by GET /api/provider-storefronts (server/routes/storefront.routes.ts,
 * loadProviderStorefrontDirectory). The endpoint returns real aggregates only —
 * serviceCount is a count of approved+active provider_services rows, averageRating is
 * null (never a fabricated 0/5) until reviewCount > 0. These helpers never invent a
 * number the row didn't carry (§13) — they only format what's already there.
 */

export interface ProviderStorefrontListing {
  /**
   * No `id`. CLAUDE.md Locked Decision 40 lane 2: `users.id` is INTERNAL and never rides a public
   * payload, so `/api/provider-storefronts` stopped sending one. Every row on this directory has a
   * claimed handle by construction (the endpoint filters `handle IS NOT NULL`), so `handle` is both
   * the row's public identity and its stable React key.
   */
  name: string;
  handle: string;
  bio: string | null;
  profileImageUrl: string | null;
  serviceCount: number;
  averageRating: number | null;
  reviewCount: number;
  location: string | null;
  /**
   * The provider's own business name and type (`service_provider_forms`), trimmed; `null` = not
   * stated, and the card falls back to the person's name and shows no category chip (§13).
   */
  businessName?: string | null;
  category?: string | null;
  /** True only when every bookable listing confirms instantly (server-derived). */
  instantBooking?: boolean;
  /** The Stripe-derived flag the service page's "Verified business" badge reads. */
  businessVerified?: boolean;
  /** Lowest SHOWN positive price over every listing (`@shared/listing-price`), or null. */
  fromPrice?: number | null;
  /**
   * Up to three listings, most-booked first (ledger `2026-09-23-provider-directory-card`). No
   * booking count rides the row — only the order and at most one `mostBooked` flag.
   */
  listings?: ProviderDirectoryListing[];
}

export interface ProviderDirectoryListing {
  id: string;
  name: string;
  /** `null` when the owner hides the price. */
  price: string | null;
  /** Read only through `priceUnitSuffix` (`@/lib/price-unit`, the one unit derivation). */
  priceType?: string | null;
  pricingUnit?: string | null;
  mostBooked: boolean;
}

/**
 * The card's heading. A business is named by its business name; the person behind it is the
 * "Run by" line — omitted when there is no business name (the person IS the heading) or when the
 * two are the same words.
 */
export function providerCardTitle(row: Pick<ProviderStorefrontListing, "name" | "businessName">): {
  title: string;
  runBy: string | null;
} {
  const business = row.businessName?.trim();
  if (!business) return { title: row.name, runBy: null };
  const person = row.name.trim();
  return { title: business, runBy: person && person.toLowerCase() !== business.toLowerCase() ? person : null };
}

/** "$680", "$42.50", or null for a hidden, missing or non-positive price — never "$0". */
export function formatListingPrice(price: string | number | null | undefined): string | null {
  if (price == null) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** How many listings the card does not name ("+N more"), never negative. */
export function moreListingsCount(serviceCount: number, shown: number): number {
  const total = Number.isFinite(serviceCount) ? Math.trunc(serviceCount) : 0;
  return Math.max(0, total - Math.max(0, shown));
}

/** "3 services" / "1 service" / "0 services" — real count only, singular/plural aware. */
export function formatServiceCountLabel(serviceCount: number): string {
  const count = Number.isFinite(serviceCount) ? Math.max(0, Math.trunc(serviceCount)) : 0;
  return `${count} service${count === 1 ? "" : "s"}`;
}

/**
 * Rating display for a provider card. Mirrors the storefront's RatingLine rule: a rating
 * only renders once reviewCount > 0 — reviewCount === 0 (or a null average) is always
 * "New", never a fabricated/zeroed score (§13).
 */
export type ProviderRatingDisplay =
  | { kind: "new" }
  | { kind: "rated"; ratingLabel: string; reviewCountLabel: string };

export function formatProviderRating(
  averageRating: number | null,
  reviewCount: number,
): ProviderRatingDisplay {
  if (!reviewCount || reviewCount <= 0 || averageRating == null) {
    return { kind: "new" };
  }
  return {
    kind: "rated",
    ratingLabel: averageRating.toFixed(1),
    reviewCountLabel: `(${reviewCount})`,
  };
}

/** Two-letter initials for the avatar fallback — never a stock photo (§13). */
export function providerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Client-side text search over what the card itself shows — the person, the handle, and (when
 * the caller passes them) the business name, its type and the listing names. An empty or
 * whitespace query matches everything, the catalog search convention (never an accidental empty
 * result).
 */
export function matchesProviderSearch(
  query: string,
  name: string,
  handle: string,
  ...more: Array<string | null | undefined>
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return [name, handle, ...more].some((field) => !!field && field.toLowerCase().includes(trimmed));
}
