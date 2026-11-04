/**
 * C-4 / A-16 (ledger `2026-11-05-lane4-places`; rulings, Nov 5, 2026): `/places/{city}` is the ONE canonical page for a
 * city's reviewed places. `/places`, `/places?city=` and `/hidden-gems` all go to it; a city that is not an operating
 * market is not found. Pure: the server redirect, the SPA route and the sitemap read the same rule.
 *
 * C-5 (rulings and "Wording approved — Leon", Nov 5, 2026): the chip set, in order. "Off the Tourist Path" and
 * "Seasonal Events" are not chips (seasonal events belong with city events); "Local Picks" is gone.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "./operating-markets";

/** The market a `/places/{city}` segment (or a `?city=` value) names: its key or its city name, any case. */
export function placesMarketFor(value: string | null | undefined): OperatingMarket | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  return (
    OPERATING_MARKETS.find(
      (m) => m.marketKey === v || m.cityName.toLowerCase() === v || `${m.cityName}, ${m.country}`.toLowerCase() === v,
    ) ?? null
  );
}

export function placesPath(marketKey: string): string {
  return `/places/${encodeURIComponent(marketKey)}`;
}

/**
 * Where `/places` (or `/hidden-gems`) with an optional `?city=` goes: the named market's page; a city that names no market
 * keeps its own (lower-cased) segment, which then answers not found; no city ⇒ the launch market's page.
 */
export function placesRedirectTarget(city: string | null | undefined, launchMarketKey: string | null | undefined): string {
  const named = (city ?? "").trim();
  if (named) {
    const m = placesMarketFor(named);
    return placesPath(m ? m.marketKey : named.toLowerCase());
  }
  const launch = placesMarketFor(launchMarketKey);
  return placesPath(launch ? launch.marketKey : OPERATING_MARKETS[0].marketKey);
}

/** C-5: the chips, in the approved order — category key → approved label. */
export const PLACES_CHIP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["hidden_viewpoints", "Viewpoints"],
  ["historic_gems", "Historic sites"],
  ["nature_escapes", "Nature"],
  ["local_markets", "Local Markets"],
  ["local_food_secrets", "Local Food"],
  ["street_art", "Street Art"],
  ["sunset_spots", "Sunset Spots"],
  ["secret_beaches", "Beaches"],
  ["cultural_experiences", "Cultural Experiences"],
  ["nightlife_secrets", "Nightlife"],
] as const;

/**
 * A-20: the chips a city shows — only categories that have at least one item there, in the approved order. A category
 * the chip set does not name is never a chip.
 */
export function placesChips(categoriesWithItems: Iterable<string>): Array<{ value: string; label: string }> {
  const have = new Set(categoriesWithItems);
  return PLACES_CHIP_LABELS.filter(([key]) => have.has(key)).map(([value, label]) => ({ value, label }));
}
