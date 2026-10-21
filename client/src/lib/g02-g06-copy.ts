/** G-06 and the homepage meta (ledger `2026-10-20-g02-g06-copy`). Exact sentences. */

export const HOMEPAGE_META_DESCRIPTION =
  "Plan any trip or occasion with local experts and trusted providers, all in one place.";

export const KYOTO_CITY_DESCRIPTION =
  "Plan your Kyoto days with local experts and trusted providers.";

export function isKyotoCity(city: string | null | undefined): boolean {
  return String(city ?? "").trim().toLowerCase() === "kyoto";
}
