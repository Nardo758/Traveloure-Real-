/**
 * EarningsBySourcePanel — S6 dashboard "earnings by source" split.
 *
 * Reads GET /api/me/earnings-by-source (short-links.routes.ts) — session-scoped (§14), lifetime,
 * real data only (§13). Bookings created before source-attribution tracking landed (S4) read
 * 'direct' by column default, not because they were measured as direct acquisitions — the panel
 * always shows a caveat rather than presenting that default as a measured fact.
 *
 * Shared between /provider/earnings and /expert/earnings — one component, both roles.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Compass, Share2 } from "lucide-react";

interface SourceBucket {
  source: "direct" | "link" | "cross_sell";
  label: string;
  count: number;
  revenue: number;
}

interface EarningsBySourceResponse {
  buckets: SourceBucket[];
  totals: { count: number; revenue: number };
  preAttributionCaveat: boolean;
}

const BUCKET_ICON: Record<string, typeof Link2> = {
  direct: Compass,
  link: Link2,
  cross_sell: Share2,
};

export function EarningsBySourcePanel() {
  const { data, isLoading } = useQuery<EarningsBySourceResponse>({
    queryKey: ["/api/me/earnings-by-source"],
  });

  const buckets = data?.buckets ?? [];
  const hasBookings = (data?.totals?.count ?? 0) > 0;

  return (
    <Card className="border border-console-light" data-testid="card-earnings-by-source">
      <CardHeader>
        <CardTitle className="text-lg">Earnings by Source</CardTitle>
        <CardDescription>Where your booking revenue came from — lifetime totals.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !hasBookings ? (
          <p className="text-center text-console-mid text-sm py-8" data-testid="text-no-source-bookings">
            No bookings yet.
          </p>
        ) : (
          <div className="space-y-2">
            {buckets.map((b) => {
              const Icon = BUCKET_ICON[b.source] ?? Compass;
              return (
                <div
                  key={b.source}
                  className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                  data-testid={`row-source-${b.source}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-console-darkest">{b.label}</p>
                      <p className="text-xs text-console-mid">
                        {b.count.toLocaleString()} booking{b.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-console-darkest" data-testid={`text-source-revenue-${b.source}`}>
                    ${b.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
            {data?.preAttributionCaveat && (
              <p className="text-xs text-console-mid pt-1" data-testid="text-source-caveat">
                Bookings made before source tracking launched are counted under Direct by default
                and may not reflect the true acquisition channel.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
