import { ProviderLayout } from "@/components/provider-layout";
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

export default function ProviderAnalytics() {
  const { data: analytics, isLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
  });

  const metrics = [
    {
      label: "Total Revenue",
      value: `$${(analytics?.summary?.totalRevenue || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "text-green-600",
      change: "+12%",
      trend: "up" as const,
    },
    {
      label: "Total Bookings",
      value: analytics?.summary?.totalBookings || 0,
      icon: Users,
      color: "text-blue-600",
      change: "+5%",
      trend: "up" as const,
    },
    {
      label: "Avg Rating",
      value: (analytics?.summary?.avgRating || 0).toFixed(1),
      icon: BarChart3,
      color: "text-amber-600",
      change: "-2%",
      trend: "down" as const,
    },
    {
      label: "Completion Rate",
      value: "94%",
      icon: TrendingUp,
      color: "text-purple-600",
      change: "+3%",
      trend: "up" as const,
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
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Track your performance metrics and insights</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">{metric.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{metric.value}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {metric.trend === "up" ? (
                        <ArrowUpRight className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-600" />
                      )}
                      <span className={metric.trend === "up" ? "text-green-600 text-sm font-semibold" : "text-red-600 text-sm font-semibold"}>
                        {metric.change}
                      </span>
                    </div>
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
                    <p className="text-xs text-gray-600 mt-2">{month.month}</p>
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
                        <p className="text-sm font-semibold text-gray-900">{service.title}</p>
                        <Badge variant="outline" className="text-xs">
                          ${service.revenue}
                        </Badge>
                      </div>
                      <Progress value={(service.revenue / 5000) * 100} className="h-2" />
                      <p className="text-xs text-gray-600 mt-1">
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
                <p className="text-sm text-gray-600">Your Avg Booking Value</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${(analytics?.benchmarks?.avgBookingValue || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-600">Category Average</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${(analytics?.benchmarks?.categoryAvg || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-gray-600">Top Performer Average</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${(analytics?.benchmarks?.topPerformerAvg || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Recommendations */}
        <ProviderServiceRecommendations />
      </div>
    </ProviderLayout>
  );
}
