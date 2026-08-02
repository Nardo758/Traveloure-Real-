import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * §13: this ribbon previously advertised "Join Our Beta in 8 Cities World Wide"
 * from a hardcoded 8-city array, alongside manufactured scarcity ("Limited
 * Expert Spots Available"). Neither had a source: the city list matched no seed,
 * no endpoint and no other list in the app (/about carried a different 8, both
 * contradicting the ratified one-market launch wedge). Both are removed. The
 * beta status itself is true and stays.
 */
export function CityTickerTape() {
  return (
    <div
      className="w-full bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4 overflow-x-hidden"
      data-testid="top-ribbon-banner"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-center sm:justify-between gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold">
              Traveloure is in beta
            </span>
            <span className="text-white/90 hidden sm:inline">
              — plan a trip with AI or a local expert
            </span>
          </div>

          <Link
            href="/experiences/travel"
            className="flex items-center gap-1 font-semibold whitespace-nowrap bg-white/20 hover-elevate px-3 py-1 rounded-full text-xs flex-shrink-0 min-h-[44px] sm:min-h-0"
            data-testid="link-apply-now"
          >
            Start planning
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
