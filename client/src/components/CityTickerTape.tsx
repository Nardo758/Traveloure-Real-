import { MapPin, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { usePlanning } from "@/contexts/PlanningContext";
import { getCityDiscoverHref } from "@/lib/city-discover-route";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import "./CityTickerTape.css";

/**
 * §13 history: an earlier version of this ribbon scrolled a HARDCODED 8-city array that
 * matched no seed, no endpoint and contradicted /about, alongside manufactured scarcity
 * ("Limited Expert Spots Available"). It was stripped on Jul 30, 2026 (ff13a330).
 *
 * Restored Aug 18, 2026 at the owner's request — now sourced from the ratified
 * OPERATING_MARKETS config (shared/operating-markets.ts), the same list the trend engine
 * and demand rollup use. The city count is derived, never typed. No scarcity claims.
 */
export function CityTickerTape() {
  const { open: openPlanning } = usePlanning();
  const markets = OPERATING_MARKETS;

  return (
    <div
      className="w-full bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4 overflow-x-hidden"
      data-testid="top-ribbon-banner"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold whitespace-nowrap hidden sm:inline">
              Traveloure is in beta in {markets.length} cities
            </span>
            <span className="font-semibold whitespace-nowrap sm:hidden">
              Beta in {markets.length} cities
            </span>
          </div>

          <div className="ticker-wrapper flex-1 min-w-0 mx-2">
            <div className="ticker-content-inline">
              {[...markets, ...markets, ...markets].map((market, index) => (
                <span
                  key={`${market.marketKey}-${index}`}
                  className="inline-flex items-center gap-1.5 mx-3 whitespace-nowrap"
                  data-testid={`ticker-city-${market.marketKey}-${index}`}
                  aria-hidden={index >= markets.length ? "true" : undefined}
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                  </span>
                  {index < markets.length ? (
                    <Link
                      href={getCityDiscoverHref(market.cityName)}
                      className="rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label={market.cityName}
                      data-testid={`ticker-city-link-${market.marketKey}`}
                    >
                      {market.cityName}
                    </Link>
                  ) : (
                    <span className="font-medium">{market.cityName}</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => openPlanning()}
            className="flex items-center gap-1 font-semibold whitespace-nowrap bg-white/20 hover-elevate px-3 py-1 rounded-full text-xs flex-shrink-0 min-h-[44px] sm:min-h-0"
            data-testid="link-apply-now"
          >
            Start planning
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
