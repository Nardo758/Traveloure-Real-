/**
 * A-23 (ledger `2026-11-05-lane4-places`; ruling and "Wording approved — Leon", Nov 5, 2026): a cold `/plans/new` is a
 * real empty state — "Start a plan", an inline city pick, then the plan's own dates and party chips. Pure: the cities
 * offered and the start the pick makes.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import type { MarketStatusSettings } from "@shared/ticker";
import { planEntryDestination } from "./plan-entry";

export const PLANS_NEW_START_COPY = {
  heading: "Start a plan",
  sub: "Pick a city, then set your dates and who's coming.",
} as const;

/** The cities a plan can start in: the marquee first, then the live markets (the server refuses any other at the mint). */
export function startCityOptions(settings: MarketStatusSettings): OperatingMarket[] {
  const open = new Set<string>([...(settings.launch ? [settings.launch] : []), ...settings.live]);
  return OPERATING_MARKETS.filter((m) => open.has(m.marketKey)).sort(
    (a, b) => Number(b.marketKey === settings.launch) - Number(a.marketKey === settings.launch),
  );
}

/** The start a city pick makes: the city only — no occasion, no dates, no party (the plan asks those inline). */
export function startForCity(m: OperatingMarket) {
  return {
    destination: planEntryDestination(m),
    city: m.cityName,
    country: m.country,
    occasionSlug: null,
    view: "map" as const,
    occasionAsked: false,
  };
}
