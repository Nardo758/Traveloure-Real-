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
import { MARKET_ALIASES } from "../../config/market-aliases.config";

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
 *
 * AMENDED by P0 legs ruling 5 (ledger `2026-10-10-p0-legs-baseline`): when the first segment is not a
 * market, a second pass looks for a market's key, city name or configured alias anywhere in the
 * destination (`resolveMarketByAlias`) — "Arashiyama, Kyoto" and "Kyoto Station" are Kyoto. Still ONE
 * market or NULL: two markets named, or a market's `notIf` word present, resolve to NULL.
 */
export function resolveMarketSlug(destination: string | null | undefined): string | null {
  if (!destination) return null;
  const city = destination.split(",")[0].trim().toLowerCase();
  if (!city) return null;
  const match = OPERATING_MARKETS.find(
    (m) => m.marketKey === city || m.cityName.toLowerCase() === city,
  );
  // P0 ruling 5: a market's `notIf` word ("Cartagena, Spain") vetoes even the exact first-segment match.
  if (match) return vetoedByNotIf(match.marketKey, normaliseForMarketMatch(destination)) ? null : match.marketKey;
  return resolveMarketByAlias(destination);
}

function vetoedByNotIf(marketKey: string, normalisedDestination: string): boolean {
  return (MARKET_ALIASES[marketKey]?.notIf ?? []).some((w) => normalisedDestination.includes(normaliseForMarketMatch(w)));
}

/** Lowercase, accents stripped, every non-alphanumeric run a single space, padded for whole-word tests. */
function normaliseForMarketMatch(text: string): string {
  const flat = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return flat ? ` ${flat} ` : "";
}

/**
 * P0 legs ruling 5 (ledger `2026-10-10-p0-legs-baseline`): the second pass — normalised whole-word
 * containment of a market's key, city name or one of its configured aliases (`MARKET_ALIASES`) anywhere
 * in the destination. Operating markets only; a market's `notIf` word vetoes it; two markets ⇒ null.
 */
export function resolveMarketByAlias(destination: string | null | undefined): string | null {
  const dest = normaliseForMarketMatch(String(destination ?? ""));
  if (!dest) return null;
  const hits = new Set<string>();
  for (const m of OPERATING_MARKETS) {
    const entry = MARKET_ALIASES[m.marketKey];
    if (vetoedByNotIf(m.marketKey, dest)) continue;
    const terms = [m.marketKey, m.cityName, ...(entry?.aliases ?? [])].map(normaliseForMarketMatch).filter(Boolean);
    if (terms.some((t) => dest.includes(t))) hits.add(m.marketKey);
  }
  return hits.size === 1 ? Array.from(hits)[0] : null;
}
