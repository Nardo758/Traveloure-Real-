import { useQuery } from "@tanstack/react-query";
import { usePlanning } from "@/contexts/PlanningContext";
import { launchCityName, tickerButton, type PublicTickerItem } from "@shared/ticker";
import { TickerRibbon } from "./ticker-ribbon";
import "./CityTickerTape.css";

export { TickerRibbon };

/**
 * LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the launch-market ribbon, Kyoto only, run from
 * /admin/ticker. Its lines come from `GET /api/public/ticker` — active, inside their window, linking only to live
 * pages — and nothing here is typed in code. The left label names the launch market from the
 * `launch_market_slug` setting (never a count of cities), and the right button follows the traveler sign-up
 * switch. An empty list, or a launch market that names no operating city, draws NO ribbon at all (§13).
 *
 * §13 history: the ribbon once scrolled a hardcoded 8-city array with scarcity claims (stripped Jul 30, 2026), then
 * all eight operating markets with a city count (Aug 18). Part A (Oct 15) ruled it single-city and true today.
 */
interface SignupModeAnswer {
  mode: "waitlist" | "open";
  launchMarketSlug: string | null;
}

export function CityTickerTape() {
  const { open: openPlanning } = usePlanning();
  const signup = useQuery<SignupModeAnswer>({ queryKey: ["/api/public/signup-mode"], staleTime: 30_000 });
  const slug = signup.data?.launchMarketSlug ?? null;
  const cityName = launchCityName(slug);
  const ticker = useQuery<{ items: PublicTickerItem[] }>({
    queryKey: [`/api/public/ticker?market=${encodeURIComponent(slug ?? "")}`],
    enabled: !!slug && !!cityName,
    staleTime: 30_000,
  });
  if (!slug || !cityName || !ticker.data) return null;
  return (
    <TickerRibbon
      items={ticker.data.items}
      cityName={cityName}
      button={tickerButton(signup.data?.mode, slug, cityName)}
      onPlan={(city) => openPlanning({ city })}
    />
  );
}
