/**
 * Company facts for /about, /press and /careers (Lane B, decision-maker copy of Sep 27, 2026).
 * Stated ONCE so the three pages cannot disagree about the company, its contact or its markets.
 *
 * The market list is NOT typed here: the pages render city names from `OPERATING_MARKETS`
 * (shared/operating-markets.ts — the ratified source the trend engine and demand rollup use).
 * This file holds only the DISPLAY ORDER the copy uses (Kyoto first), and
 * `client/src/lib/__tests__/company-facts.test.ts` fails if that order stops being exactly the
 * operating markets — a market added or dropped there must be placed here deliberately.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";

export const COMPANY_LEGAL_NAME = "Traveloure LLC";
export const COMPANY_FOUNDED_YEAR = 2023;
export const COMPANY_CITY = "West Palm Beach";
export const COMPANY_HQ = `${COMPANY_CITY}, Florida`;
/** Support, press and careers all reach the same inbox (decision-maker copy). */
export const COMPANY_CONTACT_EMAIL = "Admin@traveloure.com";
/** The date the About page's "where we are" section was last checked against the markets. */
export const ABOUT_LAST_UPDATED = "27 September 2026";

/** The copy's order: Kyoto first, then the rest as the decision-maker listed them. */
export const MARKET_DISPLAY_ORDER = [
  "kyoto",
  "edinburgh",
  "porto",
  "bogota",
  "cartagena",
  "mumbai",
  "goa",
  "jaipur",
] as const;

/** The operating markets in display order. A key with no operating market is dropped, never invented. */
export function marketsInDisplayOrder(markets: readonly OperatingMarket[] = OPERATING_MARKETS): OperatingMarket[] {
  const byKey = new Map(markets.map((m) => [m.marketKey, m]));
  return MARKET_DISPLAY_ORDER.map((k) => byKey.get(k)).filter((m): m is OperatingMarket => Boolean(m));
}

/** "Kyoto, Edinburgh, …, Goa and Jaipur". */
export function marketNameList(markets: readonly OperatingMarket[] = marketsInDisplayOrder()): string {
  const names = markets.map((m) => m.cityName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "eight" for 8 — the count the copy spells out, derived from the list, never typed. */
export function marketCountWord(n: number = marketsInDisplayOrder().length): string {
  return NUMBER_WORDS[n] ?? String(n);
}
