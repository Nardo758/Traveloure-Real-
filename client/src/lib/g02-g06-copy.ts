/** G-06 and the homepage meta (ledger `2026-10-20-g02-g06-copy`). Exact sentences. */

// K-6 (round 2 rulings, Nov 4, 2026): "with local experts and trusted providers" → "around reviewed places and what's
// on", in both sentences.
export const HOMEPAGE_META_DESCRIPTION =
  "Plan any trip or occasion around reviewed places and what's on, all in one place.";

export const KYOTO_CITY_DESCRIPTION =
  "Plan your Kyoto days around reviewed places and what's on.";

export function isKyotoCity(city: string | null | undefined): boolean {
  return String(city ?? "").trim().toLowerCase() === "kyoto";
}
