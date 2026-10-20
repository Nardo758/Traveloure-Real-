/**
 * SH-1 item 3 (ledger `2026-10-19-sh1-banned-copy`): which cities are LIVE. A city is live only when its market key is
 * in `beta_market_slugs` (platform_settings, #1493) — read by `GET /api/public/live-markets`, never guessed from the
 * TravelPulse rows. The homepage "Cities with momentum" rail shows only when MORE THAN ONE city is live, and then only
 * the live ones (tiles and ticker read the same list).
 */
import { OPERATING_MARKETS } from "./operating-markets";

export const LIVE_MARKETS_ROUTE = "/api/public/live-markets";

/** The fewest live cities the homepage rail needs before it shows at all. */
export const RAIL_MIN_LIVE_CITIES = 2;

/** Pure. The market key a TravelPulse row's city name belongs to, or null when it is not an operating market. */
export function marketKeyForCityName(cityName: string | null | undefined): string | null {
  const name = (cityName ?? "").trim().toLowerCase();
  if (!name) return null;
  return OPERATING_MARKETS.find((m) => m.cityName.toLowerCase() === name)?.marketKey ?? null;
}

/**
 * Pure. The rail's rows: only the cities whose market is live, in the rows' own order — and NONE unless at least
 * `RAIL_MIN_LIVE_CITIES` of them are. A missing or failed live-markets read is an empty list, so the rail hides.
 */
export function liveRailCities<T extends { cityName: string }>(rows: readonly T[], liveMarketKeys: readonly string[] | null | undefined): T[] {
  const live = new Set((liveMarketKeys ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  const kept = rows.filter((r) => {
    const key = marketKeyForCityName(r.cityName);
    return key !== null && live.has(key);
  });
  return kept.length >= RAIL_MIN_LIVE_CITIES ? kept : [];
}
