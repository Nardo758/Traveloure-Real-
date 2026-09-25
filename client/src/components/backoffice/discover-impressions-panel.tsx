/**
 * "On Discover" — how often an earner's own listings were seen on Discover (board #621, earner
 * half; ledger `2026-09-25-discover-impressions-earner`). Mounted on both Performance pages.
 *
 * Reads GET /api/me/discover-impressions, which is scoped to the SESSION user's own listings on
 * the server; this panel computes no rate. §13: click-through shows only where the server returned
 * one — it is counted from the date card clicks began to be linked to what was seen, and before
 * that the panel says so rather than printing 0%.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type WindowKey = "7" | "30" | "90" | "all";

interface Group {
  key: string | null;
  impressions: number;
  sessions: number;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

interface ListingRow {
  serviceId: string;
  serviceName: string;
  impressions: number;
  sessions: number;
  averagePosition: number | null;
  lastSeen: string;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

interface EarnerReport {
  window: WindowKey;
  linkingSince: string | null;
  totals: Group;
  byCity: Group[];
  listings: ListingRow[];
}

const WINDOW_LABELS: Record<WindowKey, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  all: "All time",
};

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Rate({ row, testId }: { row: Pick<Group, "clickThroughRate" | "impressionsClicked" | "impressionsSinceLinking">; testId: string }) {
  if (row.clickThroughRate == null) return <span className="text-console-mid" data-testid={testId}>—</span>;
  return (
    <span data-testid={testId}>
      {row.clickThroughRate}%{" "}
      <span className="text-xs text-console-mid">
        ({row.impressionsClicked} of {row.impressionsSinceLinking})
      </span>
    </span>
  );
}

export function DiscoverImpressionsPanel() {
  const [windowKey, setWindowKey] = useState<WindowKey>("30");
  const { data, isLoading, isError } = useQuery<EarnerReport>({
    queryKey: ["/api/me/discover-impressions", windowKey],
    queryFn: async () => {
      const res = await fetch(`/api/me/discover-impressions?window=${windowKey}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const linkingSince = formatDate(data?.linkingSince);

  return (
    <Card className="border border-console-light" data-testid="card-discover-impressions">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-console-mid">
              How often your listings appeared on Discover city pages. Each listing counts once per visitor session.
            </p>
          </div>
          <div className="w-40" data-testid="select-discover-window">
            <Select value={windowKey} onValueChange={(v) => setWindowKey(v as WindowKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOW_LABELS) as WindowKey[]).map((w) => (
                  <SelectItem key={w} value={w}>{WINDOW_LABELS[w]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isError ? (
          <p className="text-sm text-red-600">Could not load Discover impressions.</p>
        ) : isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : data.totals.impressions === 0 ? (
          <div className="text-center py-6 text-sm text-console-mid" data-testid="text-discover-empty">
            <Eye className="h-6 w-6 mx-auto mb-2 opacity-60" />
            None of your listings appeared on Discover in this period.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-console-mid">Impressions</p>
                <p className="text-xl font-semibold" data-testid="stat-discover-impressions">{data.totals.impressions.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-console-mid">Visitor sessions</p>
                <p className="text-xl font-semibold" data-testid="stat-discover-sessions">{data.totals.sessions.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-console-mid">Click-through</p>
                <p className="text-xl font-semibold"><Rate row={data.totals} testId="stat-discover-ctr" /></p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-console-mid border-b">
                    <th className="py-2 pr-3 font-medium">Listing</th>
                    <th className="py-2 pr-3 font-medium text-right">Impressions</th>
                    <th className="py-2 pr-3 font-medium text-right">Avg. position</th>
                    <th className="py-2 pr-3 font-medium">Last seen</th>
                    <th className="py-2 font-medium text-right">Click-through</th>
                  </tr>
                </thead>
                <tbody>
                  {data.listings.map((row) => (
                    <tr key={row.serviceId} className="border-b last:border-0" data-testid={`row-discover-listing-${row.serviceId}`}>
                      <td className="py-2 pr-3">{row.serviceName}</td>
                      <td className="py-2 pr-3 text-right">{row.impressions.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right">{row.averagePosition ?? <span className="text-console-mid">—</span>}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(row.lastSeen) ?? "—"}</td>
                      <td className="py-2 text-right"><Rate row={row} testId={`rate-discover-listing-${row.serviceId}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.byCity.length > 1 && (
              <p className="text-xs text-console-mid" data-testid="text-discover-cities">
                Seen in {data.byCity.map((c) => `${c.key ?? "no city recorded"} (${c.impressions})`).join(" · ")}
              </p>
            )}
          </>
        )}

        <p className="text-xs text-console-mid" data-testid="text-discover-linking">
          {linkingSince
            ? `Click-through counts Book or website presses on your listing card, starting ${linkingSince}. Earlier presses were never linked to a card.`
            : "Click-through isn't available yet: no press has been linked to a Discover card."}
        </p>
      </CardContent>
    </Card>
  );
}
