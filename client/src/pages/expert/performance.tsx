/**
 * Performance — Backoffice Phase B4 (ratified v9 spec, module 7).
 *
 * "Performance — which channel earns: short-link clicks → acquisition_ref → bookings,
 * per-offering performance, share-link analytics. Absorbs Share & Promote's measurement
 * half (its creation half stays the Social channel)."
 *
 * This is a loop-closer, not a new data surface: the attribution data is already captured
 * and already has session-scoped read endpoints + shared panel components (EarningsBySourcePanel,
 * LinkAnalyticsPanel — both built for the S5/S6 analytics/earnings pages). This page composes
 * them with a third section, per-offering performance, built directly on the real aggregate
 * columns already returned by GET /api/expert/services (provider_services.bookingsCount /
 * totalRevenue / averageRating / reviewCount — no new backend, §13 honest-data rule: rating
 * renders only when reviewCount > 0, otherwise "New", never a fabricated number).
 */
import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { LinkAnalyticsPanel } from "@/components/backoffice/link-analytics-panel";
import { EarningsBySourcePanel } from "@/components/backoffice/earnings-by-source-panel";
import { PageHeader, EmptyState, StatusBadge } from "@/components/backoffice/primitives";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Star, LayoutList } from "lucide-react";

interface MyServiceRow {
  id: string;
  serviceName?: string;
  title?: string;
  status?: string;
  approvalStatus?: string;
  bookingsCount?: number | null;
  totalRevenue?: string | number | null;
  averageRating?: string | number | null;
  reviewCount?: number | null;
}

function formatRevenue(value: string | number | null | undefined): string {
  const n = value != null ? Number(value) : 0;
  if (!Number.isFinite(n)) return "$0";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function OfferingPerformanceSection() {
  const { data: services, isLoading } = useQuery<MyServiceRow[]>({
    queryKey: ["/api/expert/services"],
  });

  const rows = Array.isArray(services) ? services : [];

  return (
    <section data-testid="section-performance-offerings">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Per-Offering Performance
      </h2>
      <Card className="border border-console-light" data-testid="card-offering-performance">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={LayoutList}
              title="No services yet"
              body="Create a service to start tracking bookings, revenue, and rating per offering."
              testId="empty-performance-offerings"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-console-mid border-b border-console-light">
                    <th className="py-2 pr-3 font-semibold">Offering</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Revenue</th>
                    <th className="py-2 pr-3 font-semibold">Bookings</th>
                    <th className="py-2 font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const reviewCount = row.reviewCount ?? 0;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-console-light last:border-0"
                        data-testid={`performance-row-${row.id}`}
                      >
                        <td className="py-2.5 pr-3 font-medium text-console-darkest">
                          {row.serviceName ?? row.title ?? "Untitled service"}
                        </td>
                        <td className="py-2.5 pr-3">
                          {row.approvalStatus ? <StatusBadge status={row.approvalStatus} /> : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-console-darkest" data-testid={`revenue-${row.id}`}>
                          {formatRevenue(row.totalRevenue)}
                        </td>
                        <td className="py-2.5 pr-3 text-console-darkest" data-testid={`bookings-${row.id}`}>
                          {row.bookingsCount ?? 0}
                        </td>
                        <td className="py-2.5 text-console-darkest" data-testid={`rating-${row.id}`}>
                          {reviewCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                              {Number(row.averageRating ?? 0).toFixed(1)}
                              <span className="text-console-mid">({reviewCount})</span>
                            </span>
                          ) : (
                            <span className="text-console-mid">New</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function ExpertPerformance() {
  return (
    <ExpertLayout title="Performance">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="Performance"
          subtitle="Which channel earns — clicks, attributed bookings, and how each offering performs"
          icon={TrendingUp}
          testId="text-performance-title"
        />

        <section data-testid="section-performance-channel-attribution">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Channel Attribution
          </h2>
          <EarningsBySourcePanel />
        </section>

        <section data-testid="section-performance-link-analytics">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Share-Link Analytics
          </h2>
          <LinkAnalyticsPanel />
        </section>

        <OfferingPerformanceSection />
      </div>
    </ExpertLayout>
  );
}
