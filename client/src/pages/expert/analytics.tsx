import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Users,
  Clock,
  DollarSign,
  Target,
  AlertCircle,
  ArrowRight,
  Zap,
  Lightbulb,
  MapPin,
  Calendar,
  Sparkles
} from "lucide-react";

interface AnalyticsDashboard {
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    publishedTemplates: number;
    templateRevenue: number;
    pendingBookings: number;
    completedBookings: number;
  };
  keyMetrics: {
    responseTime: { value: string; benchmark: string; status: string };
    conversionRate: { value: string; benchmark: string; status: string };
    avgRating: { value: string; benchmark: string; status: string };
    avgBookingValue: { value: string; benchmark: string; status: string };
  };
  conversionFunnel: Array<{ stage: string; count: number; percent: number }>;
  revenueByService: Array<{ service: string; revenue: number; bookings: number; percentage: number }>;
  clientLifetimeValue: {
    average: number;
    repeatRate: number;
    avgBookingsPerClient: number;
  };
}

interface MarketIntelligence {
  trending: Array<{ destination: string; score: number; reason: string; category: string }>;
  cities: Array<{ name: string; country: string; bestTimeToVisit: string; summary: string }>;
  happeningNow: Array<{ title: string; type: string; location: string; urgency: string }>;
  seasonalDemand: Array<{ season: string; location: string; timing: string; demandIncrease: number; suggestedRateIncrease: number; status: string; daysAway: number }>;
}

export default function ExpertAnalytics() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ["/api/expert/analytics/dashboard"],
  });

  const { data: marketIntel, isLoading: marketLoading } = useQuery<MarketIntelligence>({
    queryKey: ["/api/expert/market-intelligence"],
  });

  const isLoading = analyticsLoading || marketLoading;

  const actionableInsights = [
    {
      type: "opportunity",
      title: "Trending destinations to promote",
      description: marketIntel?.trending?.[0] 
        ? `${marketIntel.trending[0].destination} is trending - ${marketIntel.trending[0].reason}`
        : "Check market trends for new opportunities",
      action: "View trends",
      impact: "Increase visibility",
    },
    {
      type: "growth",
      title: "Optimize your conversion rate",
      description: analytics?.keyMetrics?.conversionRate?.status === "needs_improvement"
        ? "Your conversion rate is below average. Consider faster response times and competitive pricing."
        : "Your conversion rate is healthy. Keep up the good work!",
      action: "View funnel",
      impact: analytics?.keyMetrics?.conversionRate?.value || "N/A",
    },
    {
      type: "retention",
      title: "Client lifetime value opportunity",
      description: `Average CLV is $${analytics?.clientLifetimeValue?.average || 0}. Repeat rate: ${analytics?.clientLifetimeValue?.repeatRate || 0}%`,
      action: "Re-engage clients",
      impact: "Increase repeat bookings",
    },
  ];

  const getInsightColor = (type: string) => {
    switch (type) {
      case "urgent": return "border-red-200 bg-red-50 dark:bg-red-950/20";
      case "opportunity": return "border-amber-200 bg-amber-50 dark:bg-amber-950/20";
      case "growth": return "border-green-200 bg-green-50 dark:bg-green-950/20";
      case "retention": return "border-blue-200 bg-blue-50 dark:bg-blue-950/20";
      default: return "border-gray-200";
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "urgent": return <AlertCircle className="w-5 h-5 text-red-600" />;
      case "opportunity": return <Zap className="w-5 h-5 text-amber-600" />;
      case "growth": return <TrendingUp className="w-5 h-5 text-green-600" />;
      case "retention": return <Users className="w-5 h-5 text-blue-600" />;
      default: return <Lightbulb className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "excellent": return <Badge className="bg-green-100 text-green-700 border-green-200">Excellent</Badge>;
      case "good": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Good</Badge>;
      case "needs_improvement": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Needs Work</Badge>;
      default: return null;
    }
  };

  return (
    <ExpertLayout title="Analytics">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-analytics-title">
            Business Analytics
          </h1>
          <p className="text-muted-foreground">Real-time insights from your data nervous system</p>
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
              <Card className="border" data-testid="metric-total-revenue">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <Badge className="bg-green-100 text-green-700 border-green-200">Revenue</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-foreground">${(analytics?.summary?.totalRevenue || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Templates: ${(analytics?.summary?.templateRevenue || 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <Card className="border" data-testid="metric-conversion">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Target className="w-5 h-5 text-muted-foreground" />
                    {getStatusBadge(analytics?.keyMetrics?.conversionRate?.status || "")}
                  </div>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                  <p className="text-2xl font-bold text-foreground">{analytics?.keyMetrics?.conversionRate?.value || "0%"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Benchmark: {analytics?.keyMetrics?.conversionRate?.benchmark || "55%"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border" data-testid="metric-rating">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    {getStatusBadge(analytics?.keyMetrics?.avgRating?.status || "")}
                  </div>
                  <p className="text-sm text-muted-foreground">Average Rating</p>
                  <p className="text-2xl font-bold text-foreground">{analytics?.keyMetrics?.avgRating?.value || "0"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Benchmark: {analytics?.keyMetrics?.avgRating?.benchmark || "4.5"}
                  </p>
                </CardContent>
              </Card>

              <Card className="border" data-testid="metric-booking-value">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    {getStatusBadge(analytics?.keyMetrics?.avgBookingValue?.status || "")}
                  </div>
                  <p className="text-sm text-muted-foreground">Avg Booking Value</p>
                  <p className="text-2xl font-bold text-foreground">{analytics?.keyMetrics?.avgBookingValue?.value || "$0"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Benchmark: {analytics?.keyMetrics?.avgBookingValue?.benchmark || "$350"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  Actionable Insights
                </CardTitle>
                <CardDescription>AI-powered recommendations based on your data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionableInsights.map((insight, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${getInsightColor(insight.type)}`}
                    data-testid={`insight-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      {getInsightIcon(insight.type)}
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{insight.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                        <div className="flex items-center gap-4 mt-3">
                          <Button size="sm" variant="outline" data-testid={`button-insight-${index}`}>
                            {insight.action} <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                          <span className="text-sm text-green-600 font-medium">{insight.impact}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Tabs defaultValue="funnel" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
                <TabsTrigger value="funnel" data-testid="tab-funnel">Conversion Funnel</TabsTrigger>
                <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue by Service</TabsTrigger>
                <TabsTrigger value="market" data-testid="tab-market">Market Intelligence</TabsTrigger>
                <TabsTrigger value="lifetime" data-testid="tab-lifetime">Client Value</TabsTrigger>
              </TabsList>

              <TabsContent value="funnel">
                <Card className="border">
                  <CardHeader>
                    <CardTitle>Conversion Funnel</CardTitle>
                    <CardDescription>Track how visitors become paying clients</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(analytics?.conversionFunnel || []).map((stage, index) => (
                        <div key={index} className="flex items-center gap-4" data-testid={`funnel-stage-${index}`}>
                          <div className="w-32 text-sm text-muted-foreground">{stage.stage}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Progress value={stage.percent} className="h-6 flex-1" />
                              <span className="text-sm font-medium w-16 text-right">{stage.count}</span>
                            </div>
                          </div>
                          <div className="w-16 text-right">
                            {index > 0 && (
                              <span className={`text-sm ${stage.percent >= 70 ? 'text-green-600' : stage.percent >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {stage.percent.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="revenue">
                <Card className="border">
                  <CardHeader>
                    <CardTitle>Revenue by Service</CardTitle>
                    <CardDescription>See which services generate the most income</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(analytics?.revenueByService || []).length > 0 ? (
                      <div className="space-y-4">
                        {analytics?.revenueByService.map((item, index) => (
                          <div key={index} className="flex items-center gap-4" data-testid={`revenue-service-${index}`}>
                            <div className="w-40 text-sm text-foreground font-medium truncate">{item.service}</div>
                            <div className="flex-1">
                              <Progress value={item.percentage} className="h-4" />
                            </div>
                            <div className="w-24 text-right">
                              <p className="text-sm font-medium">${item.revenue.toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">{item.bookings} bookings</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No revenue data yet. Start accepting bookings to see insights.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="market">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Trending Destinations
                      </CardTitle>
                      <CardDescription>Popular destinations travelers are searching for</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(marketIntel?.trending || []).slice(0, 5).map((item, index) => (
                          <div key={index} className="flex items-center gap-3 p-3 rounded-lg border hover-elevate" data-testid={`trending-${index}`}>
                            <MapPin className="w-4 h-4 text-primary" />
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{item.destination}</p>
                              <p className="text-xs text-muted-foreground">{item.reason}</p>
                            </div>
                            <Badge variant="outline">{item.category}</Badge>
                          </div>
                        ))}
                        {(!marketIntel?.trending || marketIntel.trending.length === 0) && (
                          <p className="text-muted-foreground text-center py-4">Market data loading...</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-amber-500" />
                        Seasonal Demand Forecast
                      </CardTitle>
                      <CardDescription>Upcoming high-demand periods</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(marketIntel?.seasonalDemand || []).map((season, index) => (
                          <div key={index} className="p-3 rounded-lg border" data-testid={`season-${index}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-medium text-foreground">{season.season}</p>
                              <Badge variant="outline" className={season.status === 'upcoming' ? 'bg-amber-100 text-amber-700' : ''}>
                                {season.daysAway} days
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{season.location} - {season.timing}</p>
                            <div className="flex gap-4 mt-2 text-xs">
                              <span className="text-green-600">+{season.demandIncrease}% demand</span>
                              <span className="text-primary">+{season.suggestedRateIncrease}% rate suggested</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="lifetime">
                <Card className="border">
                  <CardHeader>
                    <CardTitle>Client Lifetime Value</CardTitle>
                    <CardDescription>Understanding your client relationships</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-6 rounded-lg border">
                        <p className="text-3xl font-bold text-foreground">${analytics?.clientLifetimeValue?.average || 0}</p>
                        <p className="text-sm text-muted-foreground mt-1">Average CLV</p>
                      </div>
                      <div className="text-center p-6 rounded-lg border">
                        <p className="text-3xl font-bold text-foreground">{analytics?.clientLifetimeValue?.repeatRate || 0}%</p>
                        <p className="text-sm text-muted-foreground mt-1">Repeat Rate</p>
                      </div>
                      <div className="text-center p-6 rounded-lg border">
                        <p className="text-3xl font-bold text-foreground">{analytics?.clientLifetimeValue?.avgBookingsPerClient || 0}</p>
                        <p className="text-sm text-muted-foreground mt-1">Avg Bookings/Client</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ExpertLayout>
  );
}
