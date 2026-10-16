// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`): the ribbon itself, drawn from given lines — used by the live
// CityTickerTape (which fetches them and loads the stylesheet) and by /admin/ticker's preview. No fetching here, so
// it renders under node for the tests. An empty list draws nothing (Part A item 5).
import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { TICKER_LEFT_LABEL, type PublicTickerItem, type TickerButton } from "@shared/ticker";

export function TickerRibbon({
  items,
  cityName,
  button,
  onPlan,
}: {
  items: PublicTickerItem[];
  cityName: string;
  button: TickerButton;
  onPlan?: (city: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="w-full bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4 overflow-x-hidden"
      data-testid="top-ribbon-banner"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold whitespace-nowrap" data-testid="text-ticker-label">
              {TICKER_LEFT_LABEL(cityName)}
            </span>
          </div>

          <div className="ticker-wrapper flex-1 min-w-0 mx-2">
            <div className="ticker-content-inline">
              {[...items, ...items, ...items].map((item, index) => {
                const copy = index >= items.length;
                return (
                  <span
                    key={index}
                    className="inline-flex items-center mx-4 whitespace-nowrap"
                    data-testid={`ticker-item-${index}`}
                    aria-hidden={copy ? "true" : undefined}
                  >
                    {item.href && !copy ? (
                      <Link
                        href={item.href}
                        className="rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        data-testid={`ticker-link-${index}`}
                      >
                        {item.text}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.text}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Locked Decision 42 (D13): a door passes what it holds. The ribbon is single-city now (the launch
              market), so its planning door passes that city — the guard's REQUIRED_SOURCE_FIELDS entry and the
              pin in plan-entry-source-fields.test.ts were updated with it (Part A item 8). */}
          {button.kind === "waitlist" ? (
            <Link
              href={button.href}
              className="flex items-center gap-1 font-semibold whitespace-nowrap bg-white/20 hover-elevate px-3 py-1 rounded-full text-xs flex-shrink-0 min-h-[44px] sm:min-h-0"
              data-testid="link-apply-now"
            >
              {button.label}
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onPlan?.(button.city)}
              className="flex items-center gap-1 font-semibold whitespace-nowrap bg-white/20 hover-elevate px-3 py-1 rounded-full text-xs flex-shrink-0 min-h-[44px] sm:min-h-0"
              data-testid="link-apply-now"
            >
              {button.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
