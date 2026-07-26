import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  MousePointerClick,
  Eye,
  ShoppingCart,
} from "lucide-react";
import { ProviderServiceRecommendations } from "@/components/provider/service-recommendations";

interface ProviderAnalytics {
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    pendingBookings: number;
    completedBookings: number;
  };
  monthlyRevenue: Array<{ month: string; revenue: number; bookings: number }>;
  servicePerformance: Array<{
    id: string;
    title: string;
    revenue: number;
    bookings: number;
    rating: number;
    status: string;
  }>;
  benchmarks: {
    avgBookingValue: number;
    categoryAvg: number;
    topPerformerAvg: number;
  };
}

interface CrossSellStats {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  byService: Array<{
    serviceId: string;
    serviceName: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
  }>;
}

export default function ProviderAnalytics() {
  const { data: analytics, isLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
  });

  const { data: crossSell, isLoading: crossSellLoading } = useQuery<CrossSellStats>({
    queryKey: ["/api/cross-sell-events/provider-stats"],
  });

  const metrics = [
    {
      label: "Total Revenue",
      value: `$${(analytics?.summary?.totalRevenue || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      label: "Total Bookings",
      value: analytics?.summary?.totalBookings || 0,
      icon: Users,
      color: "text-blue-600",
    },
    {
      label: "Avg Rating",
      value: (analytics?.summary?.avgRating || 0).toFixed(1),
      icon: BarChart3,
      color: "text-amber-600",
    },
    {
      label: "Active Services",
      value: analytics?.summary?.activeServices || 0,
      icon: TrendingUp,
      color: "text-purple-600",
    },
  ];

  if (isLoading) {
    return (
      <ProviderLayout title="Analytics">
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title="Analytics">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-console-darkest">Analytics Dashboard</h1>
          <p className="text-console-dark mt-1">Track your performance metrics and insights</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-console-dark">{metric.label}</p>
                    <p className="text-2xl font-bold text-console-darkest mt-2">{metric.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-opacity-10 ${metric.color}`} style={{ backgroundColor: metric.color + "15" }}>
                    <metric.icon className={`w-6 h-6 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts & Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Revenue */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue Trend</CardTitle>
              <CardDescription>Your revenue over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 h-64 flex items-end justify-between gap-2">
                {(analytics?.monthlyRevenue || []).map((month, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                      style={{
                        height: `${(month.revenue / Math.max(...(analytics?.monthlyRevenue || []).map(m => m.revenue))) * 100}%`,
                        minHeight: "20px",
                      }}
                      title={`${month.month}: $${month.revenue}`}
                    />
                    <p className="text-xs text-console-dark mt-2">{month.month}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Service Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Service Performance</CardTitle>
              <CardDescription>Revenue and bookings by service</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(analytics?.servicePerformance || []).slice(0, 4).map((service) => (
                  <div key={service.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-console-darkest">{service.title}</p>
                        <Badge variant="outline" className="text-xs">
                          ${service.revenue}
                        </Badge>
                      </div>
                      <Progress value={(service.revenue / 5000) * 100} className="h-2" />
                      <p className="text-xs text-console-dark mt-1">
                        {service.bookings} bookings • {service.rating} ★
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Industry Benchmarks */}
        <Card>
          <CardHeader>
            <CardTitle>Industry Benchmarks</CardTitle>
            <CardDescription>How you compare to other providers in your category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-console-dark">Your Avg Booking Value</p>
                <p className="text-2xl font-bold text-console-darkest mt-2">
                  ${(analytics?.benchmarks?.avgBookingValue || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-console-dark">Category Average</p>
                <p className="text-2xl font-bold text-console-darkest mt-2">
                  ${(analytics?.benchmarks?.categoryAvg || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-console-dark">Top Performer Average</p>
                <p className="text-2xl font-bold text-console-darkest mt-2">
                  ${(analytics?.benchmarks?.topPerformerAvg || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cross-sell Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MousePointerClick className="w-5 h-5 text-violet-600" />
              Cross-Sell Performance
            </CardTitle>
            <CardDescription>
              Impressions, clicks, and bookings your services receive from "Users also book" strips
            </CardDescription>
          </CardHeader>
          <CardContent>
            {crossSellLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100" data-testid="crosssell-impressions">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="w-4 h-4 text-blue-500" />
                      <p className="text-xs text-console-mid font-medium">Impressions</p>
                    </div>
                    <p className="text-2xl font-bold text-console-darkest">{(crossSell?.impressions ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-violet-50 rounded-lg border border-violet-100" data-testid="crosssell-clicks">
                    <div className="flex items-center gap-2 mb-1">
                      <MousePointerClick className="w-4 h-4 text-violet-500" />
                      <p className="text-xs text-console-mid font-medium">Clicks</p>
                    </div>
                    <p className="text-2xl font-bold text-console-darkest">{(crossSell?.clicks ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100" data-testid="crosssell-ctr">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                      <p className="text-xs text-console-mid font-medium">CTR</p>
                    </div>
                    <p className="text-2xl font-bold text-console-darkest">{crossSell?.ctr ?? 0}%</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100" data-testid="crosssell-bookings">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingCart className="w-4 h-4 text-green-500" />
                      <p className="text-xs text-console-mid font-medium">Bookings via Cross-Sell</p>
                    </div>
                    <p className="text-2xl font-bold text-console-darkest">{(crossSell?.conversions ?? 0).toLocaleString()}</p>
                  </div>
                </div>

                {(crossSell?.byService?.length ?? 0) > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-console-dark">By Service</p>
                    {(crossSell?.byService ?? []).map((row) => (
                      <div key={row.serviceId} className="flex items-center justify-between py-2 border-b border-console-light last:border-0" data-testid={`crosssell-service-${row.serviceId}`}>
                        <p className="text-sm font-medium text-console-dark truncate max-w-[200px]">{row.serviceName}</p>
                        <div className="flex items-center gap-4 text-sm text-console-mid">
                          <span>{row.impressions.toLocaleString()} views</span>
                          <span>{row.clicks.toLocaleString()} clicks</span>
                          <Badge variant="outline" className="text-xs">{row.ctr}% CTR</Badge>
                          <span className="text-green-600 font-medium">{row.conversions} bookings</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(crossSell?.impressions ?? 0) === 0 && (
                  <p className="text-center text-console-mid text-sm py-4">
                    No cross-sell data yet — data populates as travellers view the "Users also book" strip.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Service Recommendations */}
        <ProviderServiceRecommendations />
      </div>
    </ProviderLayout>
  );
}
