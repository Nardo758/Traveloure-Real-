/**
 * LinkAnalyticsPanel — S5 earner link analytics (docs/backoffice/mockups/mockup-analytics-dashboard.html,
 * "Link Views / Link Clicks" + "Bookings (Your Link) vs Discover" slice).
 *
 * Reads GET /api/me/link-analytics?days=<range> (short-links.routes.ts) — session-scoped (§14),
 * real data only (§13): no fabricated benchmarks, honest empty state when the earner has no
 * share links yet. `clicks` is a LIFETIME counter (no per-day click log exists) while
 * bookings/revenue respect the selected range — labeled honestly rather than implying clicks
 * are range-filtered.
 *
 * Shared between /expert/analytics and /provider/analytics — one component, both roles.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link2, MousePointerClick, ShoppingCart, DollarSign, Percent } from "lucide-react";

const RANGE_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "365 days" },
] as const;

interface LinkRow {
  code: string;
  targetType: string;
  targetId: string | null;
  clicks: number;
  bookings: number;
  revenue: number;
}

interface LinkAnalyticsResponse {
  range: { days: number; since: string };
  clicksAreLifetime: boolean;
  links: LinkRow[];
  totals: {
    totalClicks: number;
    totalBookings: number;
    totalRevenue: number;
    conversionRate: number | null;
  };
}

const TARGET_LABEL: Record<string, string> = {
  storefront: "Storefront",
  service: "Service",
  template: "Itinerary Template",
  ready_made: "Ready Made Trip",
};

export function LinkAnalyticsPanel() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery<LinkAnalyticsResponse>({
    queryKey: ["/api/me/link-analytics", { days }],
  });

  const totals = data?.totals;
  const links = data?.links ?? [];
  const hasLinks = links.length > 0;

  return (
    <Card className="border" data-testid="card-link-analytics">
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Share Link Analytics
          </CardTitle>
          <CardDescription>
            Clicks, bookings, and revenue attributed to the share links you've created.
          </CardDescription>
        </div>
        <div className="flex gap-1" role="group" aria-label="Range">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={days === opt.value ? "default" : "outline"}
              onClick={() => setDays(opt.value)}
              data-testid={`button-range-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !hasLinks ? (
          <p className="text-center text-muted-foreground text-sm py-8" data-testid="text-no-links">
            No share links yet — create one from My Offerings.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              Clicks are lifetime totals (no per-day click history is tracked yet). Bookings and
              revenue reflect the last {days} days.
            </p>

            {/* Funnel stat tiles: clicks -> bookings -> revenue */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-violet-50 rounded-lg border border-violet-100" data-testid="stat-total-clicks">
                <div className="flex items-center gap-2 mb-1">
                  <MousePointerClick className="w-4 h-4 text-violet-500" />
                  <p className="text-xs text-muted-foreground font-medium">Clicks (lifetime)</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{(totals?.totalClicks ?? 0).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100" data-testid="stat-total-bookings">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-muted-foreground font-medium">Bookings ({days}d)</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{(totals?.totalBookings ?? 0).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100" data-testid="stat-total-revenue">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground font-medium">Revenue ({days}d)</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  ${(totals?.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100" data-testid="stat-conversion-rate">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-muted-foreground font-medium">Conversion</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {totals?.conversionRate == null ? "—" : `${(totals.conversionRate * 100).toFixed(1)}%`}
                </p>
              </div>
            </div>

            {/* Per-link table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-semibold">Link</th>
                    <th className="py-2 pr-3 font-semibold">Target</th>
                    <th className="py-2 pr-3 font-semibold">Clicks</th>
                    <th className="py-2 pr-3 font-semibold">Bookings</th>
                    <th className="py-2 font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((row) => (
                    <tr key={row.code} className="border-b last:border-0" data-testid={`link-row-${row.code}`}>
                      <td className="py-2.5 pr-3 font-mono text-xs">/r/{row.code}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="outline" className="text-xs">
                          {TARGET_LABEL[row.targetType] ?? row.targetType}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3">{row.clicks.toLocaleString()}</td>
                      <td className="py-2.5 pr-3">{row.bookings.toLocaleString()}</td>
                      <td className="py-2.5">
                        ${row.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
