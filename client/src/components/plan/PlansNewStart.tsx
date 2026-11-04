import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketStatusSettings } from "@/lib/signup-mode";
import { PLANS_NEW_START_COPY, startCityOptions } from "@/lib/plans-new-start";
import type { OperatingMarket } from "@shared/operating-markets";

/**
 * A-23 (ledger `2026-11-05-lane4-places`): the empty state of a cold `/plans/new`, signed in or out — "Start a plan",
 * then an inline city pick. The page decides what a pick does (a member's mint, a waitlist guest's plan, an open-mode
 * guest's sign-in record); the plan then asks the dates and the party inline. A refusal's own sentence is shown.
 */
export function PlansNewStart({
  onPick,
  children,
}: {
  onPick: (m: OperatingMarket) => Promise<{ ok: boolean; message?: string } | void>;
  children?: React.ReactNode;
}) {
  const { settings, settled } = useMarketStatusSettings();
  const [starting, setStarting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cities = startCityOptions(settings);
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center space-y-4" data-testid="plans-new-start">
      {children}
      <h1 className="text-2xl font-semibold" data-testid="plans-new-start-heading">{PLANS_NEW_START_COPY.heading}</h1>
      <p className="text-sm text-muted-foreground">{PLANS_NEW_START_COPY.sub}</p>
      {settled && cities.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="City" data-testid="plans-new-cities">
          {cities.map((m) => (
            <Button
              key={m.marketKey}
              type="button"
              variant="outline"
              size="sm"
              disabled={starting !== null}
              onClick={() => {
                setStarting(m.marketKey);
                setMessage(null);
                void onPick(m)
                  .then((out) => {
                    if (out && !out.ok && out.message) setMessage(out.message);
                  })
                  .finally(() => setStarting(null));
              }}
              data-testid={`plans-new-city-${m.marketKey}`}
            >
              <MapPin className="h-3 w-3 mr-1" aria-hidden="true" />
              {m.cityName}
            </Button>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="text-sm text-destructive" role="alert" data-testid="plans-new-start-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
