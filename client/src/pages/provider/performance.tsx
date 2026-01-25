import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { 
  Star, 
  TrendingUp, 
  DollarSign,
  Users,
  BarChart3,
  ArrowUpRight,
  Calendar
} from "lucide-react";

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

export default function ProviderPerformance() {
  const { data: analytics, isLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
  });

  const metrics = [
    { 
      label: "Total Revenue", 
      value: `$${(analytics?.summary?.totalRevenue || 0).toLocaleString()}`, 
      icon: DollarSign, 
      change: "+12%", 
      positive: true,
      suffix: ""
    },
    { 
      label: "Total Bookings", 
      value: analytics?.summary?.totalBookings?.toString() || "0", 
      icon: Calendar, 
      change: "+8%", 
      positive: true,
      suffix: ""
    },
    { 
      label: "Average Rating", 
      value: (analytics?.summary?.avgRating || 0).toFixed(1), 
      icon: Star, 
      change: "+0.2", 
      positive: true,
      suffix: "/5"
    },
    { 
      label: "Active Services", 
      value: analytics?.summary?.activeServices?.toString() || "0", 
      icon: TrendingUp, 
      change: "+1", 
      positive: true,
      suffix: ""
    },
  ];

  const getBenchmarkStatus = (value: number, benchmark: number) => {
    if (value >= benchmark * 1.2) return "excellent";
    if (value >= benchmark) return "good";
    return "needs_improvement";
  };

  return (
    <ProviderLayout title="Performance">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-performance-title">
            Performance Analytics
          </h1>
          <p className="text-muted-foreground">Track your business performance and compare with benchmarks</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((metric) => (
                <Card key={metric.label} data-testid={`card-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{metric.label}</p>
                        <p className="text-2xl font-bold text-foreground">
                          {metric.value}{metric.suffix}
                        </p>
                        <div className={`flex items-center gap-1 text-sm ${metric.positive ? "text-green-600" : "text-red-600"}`}>
                          <ArrowUpRight className="w-4 h-4" />
                          {metric.change} vs last month
                        </div>
                      </div>
                      <metric.icon className={`w-8 h-8 ${metric.label === "Average Rating" ? "text-amber-500 fill-amber-500" : "text-primary"}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Monthly Performance
                  </CardTitle>
                  <CardDescription>Revenue and bookings by month</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(analytics?.monthlyRevenue || []).map((month, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-4"
                      data-testid={`row-month-${index}`}
                    >
                      <div className="w-12 text-sm font-medium text-muted-foreground">{month.month}</div>
                      <div className="flex-1">
                        <Progress value={(month.revenue / (analytics?.summary?.totalRevenue || 1)) * 100 * 8} className="h-4" />
                      </div>
                      <div className="text-right w-28">
                        <p className="text-sm font-medium">${month.revenue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{month.bookings} bookings</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Booking Value Benchmarks
                  </CardTitle>
                  <CardDescription>Compare your performance with peers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border" data-testid="benchmark-your-avg">
                      <div>
                        <p className="font-medium text-foreground">Your Average</p>
                        <p className="text-sm text-muted-foreground">Booking value</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-foreground">${Math.round(analytics?.benchmarks?.avgBookingValue || 0)}</p>
                        <Badge 
                          className={
                            getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, analytics?.benchmarks?.categoryAvg || 280) === "excellent"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, analytics?.benchmarks?.categoryAvg || 280) === "good"
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : "bg-amber-100 text-amber-700 border-amber-200"
                          }
                        >
                          {getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, analytics?.benchmarks?.categoryAvg || 280) === "excellent"
                            ? "Excellent"
                            : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, analytics?.benchmarks?.categoryAvg || 280) === "good"
                            ? "Good"
                            : "Below Average"
                          }
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30" data-testid="benchmark-category-avg">
                      <div>
                        <p className="font-medium text-foreground">Category Average</p>
                        <p className="text-sm text-muted-foreground">Similar providers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-muted-foreground">${analytics?.benchmarks?.categoryAvg || 280}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30" data-testid="benchmark-top-performer">
                      <div>
                        <p className="font-medium text-foreground">Top Performers</p>
                        <p className="text-sm text-muted-foreground">Top 10%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-muted-foreground">${analytics?.benchmarks?.topPerformerAvg || 450}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Service Performance
                  </CardTitle>
                  <CardDescription>Performance breakdown by service</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {(analytics?.servicePerformance || []).length > 0 ? (
                  <div className="space-y-4">
                    {analytics?.servicePerformance.map((service, index) => (
                      <div 
                        key={service.id || index}
                        className="flex items-center gap-4 p-4 rounded-lg border"
                        data-testid={`row-service-${index}`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{service.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span>{service.bookings} bookings</span>
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              {service.rating.toFixed(1)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {service.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">${service.revenue.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">revenue</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No service performance data yet.</p>
                    <p className="text-sm mt-1">Create services and start accepting bookings to see insights.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-4xl font-bold text-foreground">{analytics?.summary?.pendingBookings || 0}</div>
                  <p className="text-muted-foreground mt-1">Pending Bookings</p>
                  <Button className="mt-4" variant="outline" size="sm" data-testid="button-view-pending">
                    View Pending
                  </Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6 text-center">
                  <div className="text-4xl font-bold text-green-600">{analytics?.summary?.completedBookings || 0}</div>
                  <p className="text-muted-foreground mt-1">Completed Bookings</p>
                  <Button className="mt-4" variant="outline" size="sm" data-testid="button-view-completed">
                    View History
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </ProviderLayout>
  );
}
