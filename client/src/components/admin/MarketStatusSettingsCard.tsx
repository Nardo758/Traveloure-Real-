/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): the marquee market and each market's status, set by hand.
 *   · Marquee market — `launch_market_slug` (leads the home page, /experiences, the waitlist and the nav). Never
 *     hard-coded.
 *   · Live markets — `live_market_slugs`. Empty by default: being the marquee does not make a market live.
 *   · Launch month — `market_launch_dates` (key → YYYY-MM). A month shows "Opening {Month yyyy}" for a market that is
 *     neither live nor beta; no month, no date shown.
 * Every value is checked by the server's validators (admin.routes.ts) before it is saved.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { LAUNCH_MARKET_SLUG_SETTING } from "@shared/launch-signup";
import {
  LIVE_MARKET_SLUGS_SETTING,
  MARKET_LAUNCH_DATES_SETTING,
  liveMarketSlugs,
  marketLaunchDates,
} from "@shared/ticker";
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";

const SETTINGS_KEY = ["/api/admin/platform-settings"];

type Row = { setting_key: string; setting_value: string | null };

export function MarketStatusSettingsCard() {
  const { data: rows } = useQuery<Row[]>({ queryKey: SETTINGS_KEY });
  const value = (key: string) => rows?.find((r) => r.setting_key === key)?.setting_value ?? null;
  const storedLaunch = value(LAUNCH_MARKET_SLUG_SETTING) ?? "";
  const storedLive = liveMarketSlugs(value(LIVE_MARKET_SLUGS_SETTING));
  const storedDates = marketLaunchDates(value(MARKET_LAUNCH_DATES_SETTING));
  const [launch, setLaunch] = useState<string | null>(null);
  const [live, setLive] = useState<string[] | null>(null);
  const [dates, setDates] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosenLaunch = launch ?? storedLaunch;
  const chosenLive = live ?? storedLive;
  const chosenDates = dates ?? storedDates;

  const save = useMutation({
    mutationFn: async () => {
      if (chosenLaunch && chosenLaunch !== storedLaunch) {
        await apiRequest("PATCH", `/api/admin/platform-settings/${LAUNCH_MARKET_SLUG_SETTING}`, { settingValue: chosenLaunch });
      }
      await apiRequest("PATCH", `/api/admin/platform-settings/${LIVE_MARKET_SLUGS_SETTING}`, { settingValue: JSON.stringify(chosenLive) });
      const cleanDates = Object.fromEntries(Object.entries(chosenDates).filter(([, m]) => m));
      await apiRequest("PATCH", `/api/admin/platform-settings/${MARKET_LAUNCH_DATES_SETTING}`, { settingValue: JSON.stringify(cleanDates) });
    },
    onSuccess: () => {
      setError(null);
      setLaunch(null);
      setLive(null);
      setDates(null);
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      queryClient.invalidateQueries({ queryKey: [LIVE_MARKETS_ROUTE] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Card data-testid="card-market-status">
      <CardHeader>
        <CardTitle>Markets</CardTitle>
        <CardDescription>The marquee market, which markets are live, and a launch month for a market not open yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="select-marquee-market">Marquee market</Label>
          <select
            id="select-marquee-market"
            value={chosenLaunch}
            onChange={(e) => setLaunch(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-marquee-market"
          >
            {!chosenLaunch && <option value="" />}
            {OPERATING_MARKETS.map((m) => (
              <option key={m.marketKey} value={m.marketKey}>{m.cityName}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Live markets and launch months</p>
          {OPERATING_MARKETS.map((m) => (
            <div key={m.marketKey} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex w-40 items-center gap-2">
                <Checkbox
                  checked={chosenLive.includes(m.marketKey)}
                  onCheckedChange={(v) =>
                    setLive(OPERATING_MARKETS.map((x) => x.marketKey).filter((k) => (k === m.marketKey ? v === true : chosenLive.includes(k))))
                  }
                  data-testid={`checkbox-live-market-${m.marketKey}`}
                />
                {m.cityName}
              </label>
              <Input
                type="month"
                aria-label={`${m.cityName} launch month`}
                className="w-44"
                value={chosenDates[m.marketKey] ?? ""}
                onChange={(e) => setDates({ ...chosenDates, [m.marketKey]: e.target.value })}
                data-testid={`input-launch-month-${m.marketKey}`}
              />
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive" data-testid="text-market-status-error">{error}</p>}
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-market-status">Save</Button>
      </CardContent>
    </Card>
  );
}
