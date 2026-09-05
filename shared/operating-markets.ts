/**
 * operating-markets.ts (shared) — Central config for the 8 Phase 1 operating markets.
 *
 * MOVED here from server/services/trend-engine/operating-markets.ts (Aug 18, 2026) so the
 * client can render the beta-market list from the SAME ratified source the trend engine and
 * demand rollup use — §13: no hardcoded city lists on the marketing surface. The server module
 * re-exports everything from here; server-only helpers (timezones, market-slug resolution)
 * stay on the server side.
 *
 * Source of truth for:
 *   - City name / country as stored in travel_pulse_cities
 *   - market_key as used in market_season_calendars
 *   - Centroid lat/lng for geo-based adapters (Open-Meteo, GDELT bounding box)
 *   - Known Wikidata QID and Wikipedia title for entity seeding (pre-confirmed for major cities)
 *   - ISO 3166-1 alpha-2 country code for Nager.Date holiday adapter
 *
 * Never add a market here without a corresponding season calendar seed and Leon sign-off.
 */

export interface OperatingMarket {
  readonly cityName: string;
  readonly country: string;
  readonly marketKey: string;
  readonly lat: number;
  readonly lng: number;
  readonly wikidataQid: string;
  readonly wikipediaTitle: string;
  readonly countryCode: string; // ISO 3166-1 alpha-2 for Nager.Date
}

export const OPERATING_MARKETS: readonly OperatingMarket[] = [
  {
    cityName:       'Kyoto',
    country:        'Japan',
    marketKey:      'kyoto',
    lat:            35.0116,
    lng:            135.7681,
    wikidataQid:    'Q34600',
    wikipediaTitle: 'Kyoto',
    countryCode:    'JP',
  },
  {
    cityName:       'Goa',
    country:        'India',
    marketKey:      'goa',
    lat:            15.2993,
    lng:            74.1240,
    wikidataQid:    'Q1171',
    wikipediaTitle: 'Goa',
    countryCode:    'IN',
  },
  {
    cityName:       'Mumbai',
    country:        'India',
    marketKey:      'mumbai',
    lat:            19.0760,
    lng:            72.8777,
    wikidataQid:    'Q1156',
    wikipediaTitle: 'Mumbai',
    countryCode:    'IN',
  },
  {
    cityName:       'Jaipur',
    country:        'India',
    marketKey:      'jaipur',
    lat:            26.9124,
    lng:            75.7873,
    wikidataQid:    'Q39443',
    wikipediaTitle: 'Jaipur',
    countryCode:    'IN',
  },
  {
    cityName:       'Edinburgh',
    country:        'United Kingdom',
    marketKey:      'edinburgh',
    lat:            55.9533,
    lng:            -3.1883,
    wikidataQid:    'Q23436',
    wikipediaTitle: 'Edinburgh',
    countryCode:    'GB',
  },
  {
    cityName:       'Porto',
    country:        'Portugal',
    marketKey:      'porto',
    lat:            41.1579,
    lng:            -8.6291,
    wikidataQid:    'Q36433',
    wikipediaTitle: 'Porto',
    countryCode:    'PT',
  },
  {
    cityName:       'Bogotá',
    country:        'Colombia',
    marketKey:      'bogota',
    lat:            4.7110,
    lng:            -74.0721,
    wikidataQid:    'Q2841',
    wikipediaTitle: 'Bogotá',
    countryCode:    'CO',
  },
  {
    cityName:       'Cartagena',
    country:        'Colombia',
    marketKey:      'cartagena',
    lat:            10.3910,
    lng:            -75.4794,
    wikidataQid:    'Q28180',
    wikipediaTitle: 'Cartagena, Colombia',
    countryCode:    'CO',
  },
] as const;

/**
 * "City, Country" labels for the 8 markets — DERIVED from the list above, never hand-listed,
 * so a market added or renamed there cannot drift from what a signup surface offers.
 *
 * Added by ledger `2026-09-04-earn-contained-fixes` (gap 6 of the Ways-to-Earn audit): the
 * expert application's destination picker carried its OWN hardcoded ten cities — Paris, Dubai,
 * Sydney and seven more — and **Kyoto, the flagship launch market, was not among them**. An
 * applicant could not state the one destination the platform most needs covered. This is that
 * picker's source, and it is the module's own stated purpose (see the header: the client renders
 * the market list from the SAME ratified source the trend engine uses, never a second copy).
 *
 * These are the markets the platform OPERATES in, not the only places an expert may know. A
 * surface that offers only these must say so rather than implying the list is the world (§13).
 */
export const OPERATING_MARKET_DESTINATIONS: readonly string[] = OPERATING_MARKETS.map(
  (m) => `${m.cityName}, ${m.country}`,
);

/**
 * The bare CITY NAMES of the 8 markets — the exact strings `users.home_city` stores, DERIVED from
 * the list above and never hand-listed (ledger `2026-09-05-slip-events-first-render`).
 *
 * It was previously computed privately inside `server/routes/occasions.routes.ts`, which was fine
 * while `PATCH /api/me/home-city` was the ONLY door to that column. It is not any more: the
 * traveler Profile page now sets a home city too (see the note on `canonicalMarketName`), and two
 * surfaces offering "the operating markets" from two lists is the drift class §18 rule 1 names.
 */
export const OPERATING_MARKET_CITY_NAMES: readonly string[] = OPERATING_MARKETS.map(
  (m) => m.cityName,
);

/**
 * Match a submitted home city to an operating market case-insensitively, returning the CANONICAL
 * spelling, or `null` when it is not one of the 8.
 *
 * ── WHY IT LIVES HERE (ledger `2026-09-05-slip-events-first-render`) ──────────────────────────
 * `users.home_city` had exactly ONE writer — `PATCH /api/me/home-city` in `occasions.routes.ts`,
 * reachable only from the Plus occasions surface — so a traveler who never opened Plus had no way
 * to state a home city at all, and CLAUDE.md Locked Decision 38's date-night home-city
 * pre-fill on step 2 could never fire for them. The route itself is a plain `isAuthenticated`
 * route with no Plus gate, so the fix is a second SURFACE on the SAME writer, not a second writer.
 * This function moved out of that route file so the Profile page's picker and the route's
 * validation read one list and one matcher; the route calls it, and there is still exactly one
 * author of the column.
 *
 * §13 — an unmatched value is REFUSED (`null`), never coerced to a nearest market. A home city the
 * platform does not operate in is an honest "we cannot store that", and a surface offering only
 * these 8 must say so rather than implying the list is the world.
 */
export function canonicalMarketName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  return OPERATING_MARKET_CITY_NAMES.find((m) => m.toLowerCase() === needle) ?? null;
}
