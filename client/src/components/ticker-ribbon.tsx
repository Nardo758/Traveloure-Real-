// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`): the ribbon itself, drawn from given lines — used by the live
// CityTickerTape (which fetches them and loads the stylesheet) and by /admin/ticker's preview. No fetching here, so
// it renders under node for the tests. An empty list draws nothing (Part A item 5).
import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { betaLabel, type PublicTickerItem, type TickerButton } from "@shared/ticker";

export function TickerRibbon({
  items,
  cityName,
  betaCities = [],
  button,
  onPlan,
  showLabel = true,
}: {
  items: PublicTickerItem[];
  cityName: string;
  /** LW-1f-b: the beta list's city names (the server's `betaCities`); empty ⇒ the launch city. */
  betaCities?: readonly string[];
  button: TickerButton;
  onPlan?: (city: string) => void;
  /** R3-11: false on the landing page, whose hero pill already says the beta line (it renders once there). */
  showLabel?: boolean;
}) {
  if (items.length === 0) return null;
  // R3-11 (round 3 ruling): the beta line is said once. A ticker line that only repeats the label (migration 384 seeds
  // "Now in beta in Kyoto" as a line) is not scrolled beside it, and on the landing the hero pill says it instead.
  const label = betaLabel(betaCities, cityName);
  const lines = items.filter((item) => !label || item.text.trim().toLowerCase() !== label.toLowerCase());
  if (!showLabel && lines.length === 0) return null;
  return (
    <div
      className="w-full bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4 overflow-x-hidden"
      data-testid="top-ribbon-banner"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 text-sm">
          {/* LW-1f-b: on a phone the label wraps (never truncates a city name) and keeps at most ~45% of the row, so
              the lines still scroll beside a two- or three-city label. */}
          {showLabel && (
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0 max-w-[45%] sm:max-w-none">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold leading-tight whitespace-normal sm:whitespace-nowrap" data-testid="text-ticker-label">
              {label}
            </span>
          </div>
          )}

          <div className="ticker-wrapper flex-1 min-w-0 mx-2">
            <div className="ticker-content-inline">
              {[...lines, ...lines, ...lines].map((item, index) => {
                const copy = index >= lines.length;
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
