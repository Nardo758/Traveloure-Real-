/**
 * operating-markets.ts — Central config for the 8 Phase 1 operating markets.
 *
 * The market DATA (interface + OPERATING_MARKETS) moved to shared/operating-markets.ts
 * (Aug 18, 2026) so the client's beta-market ticker renders from the same ratified list —
 * §13: no hardcoded city lists anywhere. This module re-exports it unchanged, so every
 * existing server import keeps working; server-only helpers (timezones, slug resolution)
 * stay here.
 *
 * Never add a market without a corresponding season calendar seed and Leon sign-off.
 * "Do not start Phase 2 until merge lands" — this config replaces all hardcoded city lists.
 */

export { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";

/**
 * Partner Demand 2B (ledger 2026-08-18-partner-demand-2b): IANA timezone per operating market, so
 * the demand rollup's daily grain uses the MARKET-LOCAL date (not UTC) — a slip observed at 23:30
 * in Kyoto belongs to that Kyoto day, not the next UTC day. Keyed by marketKey; the `unmapped`
 * bucket has no single timezone and uses UTC (documented honestly at the rollup, R13).
 */
export const MARKET_TIMEZONES: Readonly<Record<string, string>> = {
  kyoto: "Asia/Tokyo",
  goa: "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  jaipur: "Asia/Kolkata",
  edinburgh: "Europe/London",
  porto: "Europe/Lisbon",
  bogota: "America/Bogota",
  cartagena: "America/Bogota",
};

/** The IANA timezone for a market slug, or "UTC" for the unmapped bucket / an unknown slug (§13 —
 *  an unknown market has no local calendar to claim, so it falls back to UTC honestly). */
export function timezoneForMarket(marketSlug: string | null | undefined): string {
  return (marketSlug && MARKET_TIMEZONES[marketSlug]) || "UTC";
}

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
