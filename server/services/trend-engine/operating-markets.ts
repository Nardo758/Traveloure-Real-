/**
 * operating-markets.ts — Central config for the 8 Phase 1 operating markets.
 *
 * Source of truth for:
 *   - City name / country as stored in travel_pulse_cities
 *   - market_key as used in market_season_calendars
 *   - Centroid lat/lng for geo-based adapters (Open-Meteo, GDELT bounding box)
 *   - Known Wikidata QID and Wikipedia title for entity seeding (pre-confirmed for major cities)
 *   - ISO 3166-1 alpha-2 country code for Nager.Date holiday adapter
 *
 * Never add a market here without a corresponding season calendar seed and Leon sign-off.
 * "Do not start Phase 2 until merge lands" — this config replaces all hardcoded city lists.
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

/** Quick lookup by marketKey */
export function getMarketByKey(key: string): OperatingMarket | undefined {
  return OPERATING_MARKETS.find(m => m.marketKey === key);
}

/** Quick lookup by cityName (case-insensitive) */
export function getMarketByCityName(cityName: string): OperatingMarket | undefined {
  const lower = cityName.toLowerCase();
  return OPERATING_MARKETS.find(m => m.cityName.toLowerCase() === lower);
}

/**
 * Partner Demand Data lane 2A.3 / R8: resolve a free-text `trips.destination` to ONE operating
 * market slug (marketKey) or NULL. Used at trip-write time to stamp `trips.market_slug`, and by
 * the backfill migration's mapping spec (Q3 top-40).
 *
 * §13 / R13 posture: STRICT exact-match on the city segment — a destination that resolves to none
 * of the 8 markets returns NULL (the rollup's honest `unmapped_destination` bucket), NEVER the
 * nearest guess. Q3 showed the real clusters outside the 8 (Lisbon, San Francisco, Paris,
 * Barcelona) plus junk (`l`, `unknown`, `ci test destination`); all of these correctly return NULL.
 * The only real in-set volume today is Kyoto (`kyoto`, `kyoto, japan`), both handled by taking the
 * first comma-segment and matching marketKey OR cityName case-insensitively.
 */
export function resolveMarketSlug(destination: string | null | undefined): string | null {
  if (!destination) return null;
  const city = destination.split(",")[0].trim().toLowerCase();
  if (!city) return null;
  const match = OPERATING_MARKETS.find(
    (m) => m.marketKey === city || m.cityName.toLowerCase() === city,
  );
  return match ? match.marketKey : null;
}
