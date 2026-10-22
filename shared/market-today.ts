/**
 * SH-1 Launch PR 5, Q14.1/Q14.2/Q15.3 (ledger `2026-10-22-sh1-launch-pr5`): ONE market-local "today" and ONE clamp,
 * read by the night picker (client) and the plan mint (server) alike (§18 rule 1).
 *
 * `MARKET_TIMEZONES` moved here from `server/services/trend-engine/operating-markets.ts`, which re-exports it, so the
 * client can read a market's calendar day without a second copy of the map. An unknown or absent market has no local
 * calendar to claim and reads UTC (Q14.2), never the viewer's zone. Pure; callers pass `now`.
 */
import { localDate } from "./city-events";

/** IANA timezone per operating market, keyed by marketKey. */
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

/** Pure. Today (YYYY-MM-DD) in the market's zone; an unknown or absent market reads UTC today. */
export function marketToday(marketKey: string | null | undefined, now: Date = new Date()): string {
  const zone = marketKey ? MARKET_TIMEZONES[marketKey.toLowerCase()] : undefined;
  return localDate(now, zone ?? "UTC");
}

/** Pure. The later of `dateIso` and the market's today — a plan never starts on a day already over there. */
export function clampToMarketToday(dateIso: string, marketKey: string | null | undefined, now: Date = new Date()): string {
  const today = marketToday(marketKey, now);
  return dateIso < today ? today : dateIso;
}

/**
 * Pure. SH-1 Launch Q14.3: has an event fully ended in its market? `lastDates` are the local last days of the event's
 * live rows — one for a single event, every show for a series of shows. Ended = every one is before the market's today.
 * No dates ⇒ not answerable ⇒ treated as ended (a plan is never minted around an event nobody can date).
 */
export function eventHasEnded(lastDates: readonly string[], marketKey: string | null | undefined, now: Date = new Date()): boolean {
  if (lastDates.length === 0) return true;
  const today = marketToday(marketKey, now);
  return lastDates.every((d) => d < today);
}
