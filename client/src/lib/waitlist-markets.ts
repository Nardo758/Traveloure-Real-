/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): the waitlist's market rules, pure. One waitlist covers every
 * operating market (one row per email + market); the marquee market is `platform_settings.launch_market_slug` and is
 * never hard-coded; a market's status comes from settings through the ONE `marketStatus` (shared/ticker.ts).
 *
 * The visible words here: Wording approved — Leon (Nov 6, 2026).
 */
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { waitlistCityName } from "@shared/launch-waitlist";
import type { MarketStatusSettings } from "@shared/ticker";

/** The sign-up row's three columns. */
export const WAITLIST_SIGNUP_ROW_COPY = {
  travelersHeading: "Travelers",
  travelersLine: (city: string) => `Join the list for ${city}.`,
  expertsHeading: "Local experts",
  expertsLine: "Earn by planning for travelers.",
  providersHeading: "Providers",
  providersLine: "List your service for travelers.",
} as const;

/** The traveler/provider join button when more than one market is ticked. */
export const WAITLIST_JOIN_ANY = "Join the list";

/** "Join the list" for several markets (or none named), else the existing "Join the {City} list". */
export function waitlistJoinButtonLabel(markets: readonly string[]): string {
  if (markets.length > 1) return WAITLIST_JOIN_ANY;
  const city = markets[0] ? waitlistCityName(markets[0]) : null;
  // CITY-1: no named market ⇒ the approved generic "Join the list", never a typed city.
  return city ? `Join the ${city} list` : WAITLIST_JOIN_ANY;
}

/** The page for one market's waitlist. */
export function waitlistMarketPath(slug: string): string {
  return `/waitlist/${slug}`;
}

/** The provider column's door: the provider sign-up for that market. */
export function becomeProviderHref(slug: string): string {
  return `/become-provider?market=${encodeURIComponent(slug)}`;
}

/**
 * The market a /waitlist URL names: `/waitlist` ⇒ the marquee; `/waitlist/:market` ⇒ that key when it is an
 * operating market, else null (the page then sends the visitor to the marquee — never a guessed city).
 */
export function waitlistPageMarket(param: string | null | undefined, marquee: string | null | undefined): string | null {
  const key = (param ?? "").trim().toLowerCase();
  if (!key) return marquee && OPERATING_MARKETS.some((m) => m.marketKey === marquee) ? marquee : null;
  return OPERATING_MARKETS.some((m) => m.marketKey === key) ? key : null;
}

/** Tick or untick a market; the list never goes empty (the last ticked market stays). */
export function toggleWaitlistMarket(list: readonly string[], key: string): string[] {
  if (list.includes(key)) return list.length > 1 ? list.filter((k) => k !== key) : [...list];
  return [...list, key];
}

/** The status settings from the public live-markets answer; anything missing is the honest empty (§13). */
export function statusSettingsFrom(answer: unknown): MarketStatusSettings {
  const a = (answer ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  const dates = a.dates && typeof a.dates === "object" && !Array.isArray(a.dates) ? (a.dates as Record<string, string>) : {};
  return {
    launch: typeof a.launch === "string" ? a.launch : null,
    live: list(a.live),
    beta: Array.isArray(a.beta) ? list(a.beta) : list(a.marketKeys),
    dates,
  };
}

/** `/kyoto` → `/waitlist/kyoto`, keeping the query (`?blocked=1`, `?source=`) and the hash (`#experts`). */
export function kyotoWaitlistTarget(search: string, hash: string): string {
  return `/waitlist/kyoto${search ? (search.startsWith("?") ? search : `?${search}`) : ""}${hash}`;
}
