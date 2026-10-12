/**
 * TC-2 Phase 1 (decision-maker, Oct 12, 2026 — ledger `2026-10-12-tc2-affiliate-legs`): the route map the leg
 * resolver reads. Values come from Chrome's coverage read of 12Go and Kiwitaxi (checked 2026-10-12, no prices
 * copied) and the decision-maker's rulings; nothing here is a fee.
 *
 *   · Cities: each a named OpenStreetMap node ("© OpenStreetMap contributors" wherever its point renders) and a
 *     radius. A city whose node is not yet read (`osmNodeId: null`) is left out by `usableCity`, so neither
 *     partner is offered for it — never a guessed centre. The radii are PROPOSED and await the decision-maker's
 *     sanction; Kyoto's must contain Arashiyama (~9 km west of the centre) and exclude Nara (~35 km south).
 *   · Airports: the IATA anchors' own points (`server/data/iata-airports.json`), KIX and ITM.
 *   · 12Go slugs: `12go.asia/en/travel/<from>/<to>`. ITM is `osaka-airport` (`osaka-itami-airport` 404s); ITM's
 *     12Go row is a taxi only, so no 12Go pair leaves ITM. KIX's slug was not in the read and is left null.
 *   · Kiwitaxi: KIX and ITM → Kyoto Station, the clean path only (never `?ref=sf`); the three classes from
 *     kiwitaxi.com/en/japan/kansai-airport-kyoto-train-station, "Choose a Car class", read 12 Oct 2026. Larger
 *     classes are named in the FAQ with no limits, so they are not configured.
 *   · Kinosaki has no direct 12Go trips and is not offered.
 */
import type { TransportAffiliateConfig } from "@shared/transport-affiliate";

export const TRANSPORT_AFFILIATE_CONFIG: TransportAffiliateConfig = {
  cities: [
    { key: "kyoto", name: "Kyoto", twelveGoSlug: "kyoto", osmNodeId: null, point: null, radiusKm: 15 },
    { key: "osaka", name: "Osaka", twelveGoSlug: "osaka", osmNodeId: null, point: null, radiusKm: 15 },
    { key: "nara", name: "Nara", twelveGoSlug: "nara", osmNodeId: null, point: null, radiusKm: 8 },
    { key: "tokyo", name: "Tokyo", twelveGoSlug: "tokyo", osmNodeId: null, point: null, radiusKm: 25 },
    { key: "kanazawa", name: "Kanazawa", twelveGoSlug: "kanazawa", osmNodeId: null, point: null, radiusKm: 10 },
    { key: "hiroshima", name: "Hiroshima", twelveGoSlug: "hiroshima", osmNodeId: null, point: null, radiusKm: 12 },
  ],
  airports: [
    { iata: "KIX", point: { lat: 34.4273, lng: 135.244 }, radiusKm: 3, twelveGoSlug: null },
    { iata: "ITM", point: { lat: 34.7809, lng: 135.4408 }, radiusKm: 3, twelveGoSlug: "osaka-airport" },
  ],
  twelveGoPairs: [
    { from: "KIX", to: "kyoto" },
    { from: "kyoto", to: "osaka" },
    { from: "kyoto", to: "nara" },
    { from: "kyoto", to: "tokyo" },
    { from: "kyoto", to: "kanazawa" },
    { from: "kyoto", to: "hiroshima" },
  ],
  kiwitaxiRoutes: [
    { fromAirport: "KIX", toCity: "kyoto", path: "/en/japan/kansai-airport-kyoto-train-station" },
    { fromAirport: "ITM", toCity: "kyoto", path: "/en/japan/itami-airport-kyoto-train-station" },
  ],
  kiwitaxiClasses: [
    { name: "Comfort", passengers: 4, bags: 3 },
    { name: "Minivan 4PAX", passengers: 4, bags: 4 },
    { name: "Minibus 7PAX", passengers: 7, bags: 7 },
  ],
  kiwitaxiBagNote: "a bag is a standard piece up to 158 cm",
};

/** The registry row each partner key is: the `affiliate_partners` row whose website host is this one. */
export const AFFILIATE_PARTNER_HOSTS: Record<"12go" | "kiwitaxi", string> = {
  "12go": "12go.asia",
  kiwitaxi: "kiwitaxi.com",
};
