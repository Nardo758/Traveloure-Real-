// CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): which /deals cards are listed. Pure, so the page and its test
// read one rule.
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { marketIsOpen, type MarketStatusSettings } from "@shared/ticker";

/** CITY-1: the operating market a deal's destination names, else null. */
export function dealMarketKey(destination: string | null | undefined): string | null {
  const dest = (destination ?? "").toLowerCase();
  if (!dest) return null;
  return OPERATING_MARKETS.find((m) => dest.includes(m.cityName.toLowerCase()) || dest.includes(m.marketKey))?.marketKey ?? null;
}

/**
 * CITY-1, pure: deals in an OPEN market (the marquee or a live one) are listed; a deal for a city we do not operate
 * in is dropped; a deal in an operating market that is not open is not listed — that market shows its status.
 */
export function dealsForMarkets<T extends { destination: string }>(
  deals: readonly T[],
  settings: MarketStatusSettings,
): { shown: T[]; closedMarkets: string[] } {
  const shown: T[] = [];
  const closed: string[] = [];
  for (const d of deals) {
    const key = dealMarketKey(d.destination);
    if (!key) continue;
    if (marketIsOpen(key, settings)) shown.push(d);
    else if (!closed.includes(key)) closed.push(key);
  }
  return { shown, closedMarkets: closed };
}

