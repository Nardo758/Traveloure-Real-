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
