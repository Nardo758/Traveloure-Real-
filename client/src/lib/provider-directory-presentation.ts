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
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  profileImageUrl: string | null;
  serviceCount: number;
  averageRating: number | null;
  reviewCount: number;
  location: string | null;
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
 * Client-side name/handle search — the only filter the directory endpoint can back
 * (no category/location facet on the row). Empty/whitespace query always matches
 * everything, matching the catalog search convention (never an accidental empty result).
 */
export function matchesProviderSearch(query: string, name: string, handle: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return name.toLowerCase().includes(trimmed) || handle.toLowerCase().includes(trimmed);
}
