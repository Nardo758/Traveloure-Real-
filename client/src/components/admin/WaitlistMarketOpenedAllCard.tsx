// WL-1: one admin action per city queues the opening email for travelers, experts and providers.
// The queue and its never-twice dedupe stay the existing per-role route; this card fans out three
// calls from one confirm, so an admin never picks a role.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WAITLIST_MARKET_OPTIONS, waitlistCityName } from "@shared/launch-waitlist";
import { postMarketOpened, type MarketOpenedResult } from "./WaitlistMarketOpenedCard";

export interface RoleCounts { traveler: number; expert: number; provider: number }

export function roleCounts(rows: readonly { role: string }[]): RoleCounts {
  const counts: RoleCounts = { traveler: 0, expert: 0, provider: 0 };
  for (const row of rows) {
    if (row.role === "traveler" || row.role === "expert" || row.role === "provider") counts[row.role] += 1;
  }
  return counts;
}

export function roleCountsLine(counts: RoleCounts): string {
  const n = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  return `${n(counts.traveler, "traveler", "travelers")} · ${n(counts.expert, "expert", "experts")} · ${n(counts.provider, "provider", "providers")}`;
}

export function marketOpenedAllConfirmLine(city: string, counts: RoleCounts): string {
  const n = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  return `Email ${n(counts.traveler, "traveler", "travelers")}, ${n(counts.expert, "expert", "experts")} and ${n(counts.provider, "provider", "providers")} that ${city} is open?`;
}

export function WaitlistMarketOpenedAllCard() {
  const [market, setMarket] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const city = market ? waitlistCityName(market) ?? market : "";
  const entries = useQuery<{ rows: { role: string }[] }>({
    queryKey: [`/api/admin/waitlist/entries?market=${market}`],
    enabled: market !== "",
  });
  const counts = roleCounts(entries.data?.rows ?? []);

  async function confirm() {
    if (!market) return;
    setBusy(true);
    setResult(null);
    let enqueued = 0;
    let skipped = 0;
    for (const role of ["traveler", "expert", "provider"] as const) {
      const r: MarketOpenedResult = await postMarketOpened(market, role, apiRequest);
      if (r.kind === "ok") {
        enqueued += r.enqueued;
        skipped += r.skipped;
      } else {
        setResult(r.message ?? "Could not queue the email.");
        setBusy(false);
        setConfirming(false);
        return;
      }
    }
    setResult(`${enqueued} queued, ${skipped} skipped`);
    setBusy(false);
    setConfirming(false);
  }

  return (
    <Card className="min-w-0" data-testid="card-waitlist-market-opened-all">
      <CardHeader><CardTitle className="break-words">Email the whole city</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <select
          aria-label="City"
          className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
          value={market}
          onChange={(e) => { setMarket(e.target.value); setResult(null); }}
          data-testid="select-market-opened-all-market"
        >
          <option value="">—</option>
          {WAITLIST_MARKET_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>{m.city}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground" data-testid="text-market-opened-all-counts">
          {market ? roleCountsLine(counts) : ""}
        </p>
        <Button disabled={!market || busy} onClick={() => setConfirming(true)} data-testid="button-market-opened-all">
          {market ? `Email ${city} waitlist` : "Email a city waitlist"}
        </Button>
        {result && <p className="text-sm" role="status" data-testid="text-market-opened-all-result">{result}</p>}
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={(o) => { if (!busy) setConfirming(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email the whole city?</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-market-opened-all-confirm">
              {marketOpenAllLine(city, counts)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirm(); }} data-testid="button-market-opened-all-confirm">
              Queue emails
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function marketOpenAllLine(city: string, counts: RoleCounts): string {
  return marketOpenedAllConfirmLine(city, counts);
}
