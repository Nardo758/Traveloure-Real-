import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Link } from "wouter";
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
  Sparkles,
  Star,
  MessageSquare,
  CheckCircle,
  Award,
  ArrowUpRight,
  ChevronRight,
  Gift,
  Sun,
  Snowflake,
  Leaf,
  Flower2,
  Package,
  CreditCard,
  Wallet,
  PlusCircle,
} from "lucide-react";
import { ExpertServiceRecommendations } from "@/components/expert/service-recommendations";

interface AnalyticsDashboard {
  expertProfile: {
    selectedServices: string[];
    specializations: string[];
    destinations: string[];
    city?: string;
    country?: string;
  };
  serviceAlignment: Array<{ name: string; status: string }>;
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    publishedTemplates: number;
    templateRevenue: number;
    pendingBookings: number;
    completedBookings: number;
    totalReviews?: number;
    responseRate?: number;
    avgResponseTime?: string;
    completionRate?: number;
    repeatClients?: number;
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
  monthlyMetrics?: Array<{ month: string; clients: number; revenue: number; rating: number }>;
  recentReviews?: Array<{ id: string; client: string; rating: number; text: string; date: string }>;
}

interface MarketIntelligence {
  expertMarkets?: {
    destinations: string[];
    city?: string;
    country?: string;
  };
  trending: Array<{ destination: string; score: number; reason: string; category: string }>;
  cities: Array<{ name: string; country: string; bestTimeToVisit: string; summary: string }>;
  happeningNow: Array<{ title: string; type: string; location: string; urgency: string }>;
  seasonalDemand: Array<{ season: string; location: string; timing: string; demandIncrease: number; suggestedRateIncrease: number; status: string; daysAway: number }>;
}

interface RevenueOptimizationData {
  summary: {
    totalRevenue: number;
    availableBalance: number;
    pendingBalance: number;
    paidOut: number;
  };
  incomeStreams: {
    serviceBookings: any;
    templateSales: any;
    affiliateCommissions: any;
    tips: any;
    referralBonuses: any;
  };
  projections: {
    currentMonthly: number;
    projectedGrowth: number;
    potentialMax: number;
    avgBookingValue: number;
    monthlyBookings: number;
  };
  insights: Array<{ type: string; title: string; description: string; impact: string; priority: string }>;
}

export default function ExpertAnalytics() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab") ?? "opportunities";

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ["/api/expert/analytics/dashboard"],
  });

  const { data: marketIntel, isLoading: marketLoading } = useQuery<MarketIntelligence>({
    queryKey: ["/api/expert/market-intelligence"],
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<RevenueOptimizationData>({
    queryKey: ["/api/expert/revenue-optimization"],
  });

  const { data: referralsData } = useQuery<{ referralCode: string; referrals: any[]; stats: any }>({
    queryKey: ["/api/expert/referrals"],
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-700 border-red-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const overallStats = analytics?.summary || {
    avgRating: 0,
    totalReviews: 0,
    responseRate: 0,
    avgResponseTime: "--",
    completionRate: 0,
    repeatClients: 0,
  };

  const monthlyMetrics = analytics?.monthlyMetrics || [];
  const recentReviews = analytics?.recentReviews || [];

  const achievements = [
    { title: "Top Rated Expert", description: "Maintained 4.9+ rating for 6 months", icon: Star, earned: true },
    { title: "Quick Responder", description: "Average response time under 30 min", icon: Clock, earned: true },
    { title: "Client Favorite", description: "50+ repeat clients", icon: Users, earned: false, progress: 90 },
    { title: "Perfect Score", description: "100 five-star reviews", icon: Award, earned: false, progress: 78 },
  ];

  const revSummary = revenueData?.summary ?? { totalRevenue: 0, availableBalance: 0, pendingBalance: 0, paidOut: 0 };
  const incomeStreams = revenueData?.incomeStreams;
  const projections = revenueData?.projections ?? { currentMonthly: 0, projectedGrowth: 0, potentialMax: 0, avgBookingValue: 0, monthlyBookings: 0 };
  const revenueInsights = revenueData?.insights ?? [];

  const earningsProjection = {
    current: revSummary.totalRevenue,
    projected: projections.projectedGrowth,
    potential: projections.potentialMax,
    nextMonth: Math.round(revSummary.totalRevenue * 1.1),
  };

  const suggestedPricing = {
    currentRate: projections.avgBookingValue > 0 ? Math.round(projections.avgBookingValue) : 75,
    marketAverage: 95,
    topExpertRate: 150,
    suggestedRate: 110,
    potentialIncrease: 47,
  };

  const passiveIncomeStreams = [
    {
      title: incomeStreams?.templateSales?.name || "Itinerary Templates",
      description: incomeStreams?.templateSales?.description || "Sell pre-built itineraries on the marketplace",
      monthlyEarnings: incomeStreams?.templateSales?.revenue || 0,
      icon: Package,
      status: incomeStreams?.templateSales?.status || "setup",
    },
    {
      title: incomeStreams?.affiliateCommissions?.name || "Affiliate Commissions",
      description: incomeStreams?.affiliateCommissions?.description || "Earn from client bookings automatically",
      monthlyEarnings: incomeStreams?.affiliateCommissions?.revenue || 0,
      icon: DollarSign,
      status: incomeStreams?.affiliateCommissions?.status || "available",
    },
    {
      title: incomeStreams?.tips?.name || "Tips",
      description: incomeStreams?.tips?.description || "Gratuity from satisfied travelers",
      monthlyEarnings: incomeStreams?.tips?.revenue || 0,
      icon: Gift,
      status: incomeStreams?.tips?.status || "available",
    },
    {
      title: incomeStreams?.referralBonuses?.name || "Referral Bonuses",
      description: incomeStreams?.referralBonuses?.description || "Earn $50 for each qualified expert referral",
      monthlyEarnings: incomeStreams?.referralBonuses?.revenue || 0,
      icon: Users,
      status: incomeStreams?.referralBonuses?.status || "available",
      referralCode: referralsData?.referralCode,
    },
  ];

  const instantPayoutBalance = {
    available: revSummary.availableBalance,
    pending: revSummary.pendingBalance,
    processing: 0,
    dailyFee: 1.5,
  };

  const actionableRevenueInsights = revenueInsights.length > 0 ? revenueInsights : [
    {
      type: "opportunity",
      title: "Start earning on Traveloure",
      description: "Set up your services and templates to begin generating income.",
      impact: "Unlock multiple income streams",
      priority: "high",
    },
  ];

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
            {(analytics?.expertProfile?.destinations?.length || analytics?.expertProfile?.city || analytics?.serviceAlignment?.length) ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border" data-testid="card-your-markets">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      Your Markets
                    </CardTitle>
                    <CardDescription>Intelligence is filtered for your focus areas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analytics?.expertProfile?.destinations?.map((dest, i) => (
                        <Badge key={i} variant="outline" className="bg-primary/10">
                          {dest}
                        </Badge>
                      ))}
                      {analytics?.expertProfile?.city && (
                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {analytics.expertProfile.city}
                        </Badge>
                      )}
                      {analytics?.expertProfile?.country && (
                        <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {analytics.expertProfile.country}
                        </Badge>
                      )}
                      {!analytics?.expertProfile?.destinations?.length && !analytics?.expertProfile?.city && !analytics?.expertProfile?.country && (
                        <span className="text-sm text-muted-foreground">No markets set - showing global trends</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border" data-testid="card-service-alignment">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      Service Alignment
                    </CardTitle>
                    <CardDescription>Services you selected at signup</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analytics?.serviceAlignment?.map((service, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={service.status === "created"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200"
                          }
                        >
                          {service.name}
                          {service.status === "created" ? " ✓" : " (pending)"}
                        </Badge>
                      ))}
                      {!analytics?.serviceAlignment?.length && (
                        <span className="text-sm text-muted-foreground">No services selected at signup</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

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

            <Tabs defaultValue={tabParam} className="space-y-6">
              <TabsList className="flex flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="opportunities" data-testid="tab-opportunities">Opportunities</TabsTrigger>
                <TabsTrigger value="funnel" data-testid="tab-funnel">Conversion Funnel</TabsTrigger>
                <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue by Service</TabsTrigger>
                <TabsTrigger value="market" data-testid="tab-market">Market Intelligence</TabsTrigger>
                <TabsTrigger value="lifetime" data-testid="tab-lifetime">Client Value</TabsTrigger>
                <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
                <TabsTrigger value="revenue-optimization" data-testid="tab-revenue-optimization">Revenue Optimization</TabsTrigger>
                <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
              </TabsList>

              <TabsContent value="opportunities">
                <ExpertServiceRecommendations />
              </TabsContent>

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
                {marketIntel?.expertMarkets && (marketIntel.expertMarkets.destinations?.length > 0 || marketIntel.expertMarkets.city || marketIntel.expertMarkets.country) && (
                  <div className="mb-4 p-3 rounded-lg border bg-primary/5 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Showing trends for your markets:
                      <span className="font-medium text-foreground ml-1">
                        {[...marketIntel.expertMarkets.destinations || [], marketIntel.expertMarkets.city, marketIntel.expertMarkets.country].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </div>
                )}
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

                    <Card className="border mt-6">
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Performance tab — formerly /expert/performance */}
              <TabsContent value="performance" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {analyticsLoading ? (
                    <>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                      ))}
                    </>
                  ) : (
                    <>
                      <Card className="border" data-testid="card-stat-rating">
                        <CardContent className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Star className="w-5 h-5 text-yellow-500" />
                            <p className="text-2xl font-bold text-foreground">{overallStats.avgRating || "--"}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">Overall Rating</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-stat-reviews">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold text-foreground">{overallStats.totalReviews || 0}</p>
                          <p className="text-xs text-muted-foreground">Total Reviews</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-stat-response-rate">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold text-green-600">{overallStats.responseRate || 0}%</p>
                          <p className="text-xs text-muted-foreground">Response Rate</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-stat-response-time">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold text-foreground">{overallStats.avgResponseTime || "--"}</p>
                          <p className="text-xs text-muted-foreground">Avg Response</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-stat-completion">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold text-green-600">{overallStats.completionRate || 0}%</p>
                          <p className="text-xs text-muted-foreground">Completion Rate</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-stat-repeat">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold text-foreground">{overallStats.repeatClients || 0}%</p>
                          <p className="text-xs text-muted-foreground">Repeat Clients</p>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <Card className="border">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-primary" />
                          Monthly Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analyticsLoading ? (
                          <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                              <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                          </div>
                        ) : monthlyMetrics.length > 0 ? (
                          <div className="space-y-4">
                            {monthlyMetrics.map((month, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                                data-testid={`month-metric-${index}`}
                              >
                                <div>
                                  <p className="font-medium text-foreground">{month.month}</p>
                                  <p className="text-sm text-muted-foreground">{month.clients} clients</p>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                  <span className="font-medium text-green-600">${month.revenue.toLocaleString()}</span>
                                  <span className="flex items-center gap-1">
                                    <Star className="w-4 h-4 text-yellow-500" />
                                    {month.rating}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">No monthly data available</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-primary" />
                          Recent Reviews
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {analyticsLoading ? (
                          <>
                            {[1, 2, 3].map((i) => (
                              <Skeleton key={i} className="h-20 rounded-lg" />
                            ))}
                          </>
                        ) : recentReviews.length > 0 ? (
                          recentReviews.map((review) => (
                            <div
                              key={review.id}
                              className="p-4 rounded-lg border"
                              data-testid={`review-${review.id}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-medium text-foreground">{review.client}</p>
                                <div className="flex items-center gap-1">
                                  {[...Array(review.rating)].map((_, i) => (
                                    <Star key={i} className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">{review.text}</p>
                              <p className="text-xs text-muted-foreground mt-2">{review.date}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">No reviews yet</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border h-fit">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        Achievements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {achievements.map((achievement, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border ${achievement.earned ? "border-green-200 bg-green-50 dark:bg-green-950/20" : ""}`}
                          data-testid={`achievement-${index}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${achievement.earned ? "bg-green-100" : "bg-muted"}`}>
                              <achievement.icon className={`w-5 h-5 ${achievement.earned ? "text-green-600" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className={`font-medium ${achievement.earned ? "text-green-800 dark:text-green-300" : "text-foreground"}`}>
                                  {achievement.title}
                                </p>
                                {achievement.earned && (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{achievement.description}</p>
                              {!achievement.earned && achievement.progress && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                    <span>Progress</span>
                                    <span>{achievement.progress}%</span>
                                  </div>
                                  <Progress value={achievement.progress} className="h-2" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Revenue Optimization tab — formerly /expert/revenue-optimization */}
              <TabsContent value="revenue-optimization" className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground" data-testid="text-revenue-title">Revenue Optimization</h2>
                    <p className="text-muted-foreground text-sm">Maximize your earnings with AI-powered insights</p>
                  </div>
                  <Link href="/expert/earnings">
                    <Button variant="outline" size="sm" data-testid="button-view-earnings">
                      <Wallet className="w-4 h-4 mr-2" /> View Earnings
                    </Button>
                  </Link>
                </div>

                {revenueLoading ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
                    </div>
                    <Skeleton className="h-64 rounded-lg" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="border" data-testid="card-current-month">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">This Month</p>
                              <p className="text-2xl font-bold text-foreground">${earningsProjection.current.toLocaleString()}</p>
                              <p className="text-sm text-green-600 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" /> +15% vs last month
                              </p>
                            </div>
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                              <DollarSign className="w-6 h-6 text-primary" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-projected">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Projected</p>
                              <p className="text-2xl font-bold text-foreground">${earningsProjection.projected.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">Based on pipeline</p>
                            </div>
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                              <TrendingUp className="w-6 h-6 text-blue-600" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-potential">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Potential Maximum</p>
                              <p className="text-2xl font-bold text-green-600">${earningsProjection.potential.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">With optimizations</p>
                            </div>
                            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                              <Target className="w-6 h-6 text-green-600" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-next-month">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Next Month</p>
                              <p className="text-2xl font-bold text-foreground">${earningsProjection.nextMonth.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">Forecast</p>
                            </div>
                            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                              <Calendar className="w-6 h-6 text-purple-600" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            Actionable Insights
                          </CardTitle>
                          <CardDescription>AI-powered recommendations to increase your revenue</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {actionableRevenueInsights.map((insight, index) => (
                            <div
                              key={index}
                              className="p-4 rounded-lg border hover-elevate cursor-pointer transition-all"
                              data-testid={`revenue-insight-${index}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-foreground">{insight.title}</p>
                                    <Badge variant="outline" className={getPriorityColor(insight.priority)}>
                                      {insight.priority}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                                  <p className="text-sm text-green-600 font-medium mt-2">{insight.impact}</p>
                                </div>
                                <Button size="sm" variant="ghost">
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="border">
                        <CardHeader>
                          <CardTitle>Suggested Pricing</CardTitle>
                          <CardDescription>Based on your expertise and market conditions</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg border text-center">
                              <p className="text-xs text-muted-foreground">Your Rate</p>
                              <p className="text-2xl font-bold text-foreground">${suggestedPricing.currentRate}</p>
                              <p className="text-xs text-muted-foreground">/hour</p>
                            </div>
                            <div className="p-3 rounded-lg border text-center bg-green-50 border-green-200">
                              <p className="text-xs text-green-700">Suggested</p>
                              <p className="text-2xl font-bold text-green-600">${suggestedPricing.suggestedRate}</p>
                              <p className="text-xs text-green-600">+{suggestedPricing.potentialIncrease}%</p>
                            </div>
                          </div>
                          <Button className="w-full bg-primary" size="sm" data-testid="button-update-rates">
                            Update My Rates
                          </Button>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="border">
                        <CardHeader>
                          <CardTitle>Passive Income Streams</CardTitle>
                          <CardDescription>Earn money even when you're not actively working</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {passiveIncomeStreams.map((stream, index) => (
                            <div
                              key={index}
                              className="p-4 rounded-lg border"
                              data-testid={`passive-stream-${index}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stream.status === 'active' ? 'bg-green-100' : 'bg-muted'}`}>
                                  <stream.icon className={`w-5 h-5 ${stream.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-foreground">{stream.title}</p>
                                    {stream.status === 'active' ? (
                                      <Badge className="bg-green-100 text-green-700 border-green-200">
                                        ${stream.monthlyEarnings}/mo
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">Available</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">{stream.description}</p>
                                  {(stream as any).referralCode && (
                                    <p className="text-xs text-primary mt-1">Code: {(stream as any).referralCode}</p>
                                  )}
                                </div>
                              </div>
                              {stream.status === 'available' && (
                                <Button className="w-full mt-3" size="sm" variant="outline" data-testid={`button-activate-stream-${index}`}>
                                  <Sparkles className="w-4 h-4 mr-2" /> Get Started
                                </Button>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="border">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-500" />
                            Upsell Opportunities
                          </CardTitle>
                          <CardDescription>Services your clients frequently request</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {[
                            {
                              id: 1,
                              title: "Add Transportation Service",
                              description: "Most clients also need transportation coordination",
                              potential: "+$180/trip average",
                              adoption: 92,
                              icon: Zap,
                            },
                            {
                              id: 2,
                              title: "Offer Photography Package",
                              description: "Many proposal clients want photo coordination",
                              potential: "+$250/booking",
                              adoption: 68,
                              icon: Gift,
                            },
                            {
                              id: 3,
                              title: "Premium Concierge Add-on",
                              description: "High-value clients often upgrade",
                              potential: "+$400/trip",
                              adoption: 45,
                              icon: Star,
                            },
                          ].map((opp) => (
                            <div
                              key={opp.id}
                              className="p-4 rounded-lg border"
                              data-testid={`upsell-${opp.id}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                  <opp.icon className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-foreground">{opp.title}</p>
                                    <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                                      {opp.potential}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">{opp.description}</p>
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                      <span>Client adoption</span>
                                      <span>{opp.adoption}%</span>
                                    </div>
                                    <Progress value={opp.adoption} className="h-2" />
                                  </div>
                                </div>
                              </div>
                              <Button className="w-full mt-3 bg-primary" size="sm" data-testid={`button-add-service-${opp.id}`}>
                                <PlusCircle className="w-4 h-4 mr-2" /> Add This Service
                              </Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary" />
                          Seasonal Demand Forecast
                        </CardTitle>
                        <CardDescription>Adjust your pricing based on upcoming high-demand periods</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {(marketIntel?.seasonalDemand?.length ? marketIntel.seasonalDemand : [
                            {
                              season: "Peak Travel Season",
                              location: "Your Markets",
                              timing: "Varies by destination",
                              demandIncrease: 120,
                              suggestedRateIncrease: 20,
                              status: "upcoming",
                              daysAway: 30,
                              icon: Sun,
                            },
                          ]).map((season: any, index: number) => {
                            const SeasonIcon = season.icon ?? Sun;
                            return (
                              <div
                                key={index}
                                className={`p-4 rounded-lg border ${season.status === 'current' ? 'border-primary bg-primary/5' : season.status === 'upcoming' ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : ''}`}
                                data-testid={`rev-season-${index}`}
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${season.status === 'current' ? 'bg-primary/20' : 'bg-muted'}`}>
                                    <SeasonIcon className={`w-5 h-5 ${season.status === 'current' ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </div>
                                  {season.status === 'current' && (
                                    <Badge className="bg-primary text-primary-foreground">Active Now</Badge>
                                  )}
                                  {season.status === 'upcoming' && (
                                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                                      {season.daysAway} days
                                    </Badge>
                                  )}
                                </div>
                                <p className="font-medium text-foreground">{season.season}</p>
                                <p className="text-sm text-muted-foreground">{season.location}</p>
                                <p className="text-xs text-muted-foreground mt-1">{season.timing}</p>
                                <div className="mt-3 pt-3 border-t space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Demand</span>
                                    <span className="text-green-600 font-medium">+{season.demandIncrease}%</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Suggested Rate</span>
                                    <span className="text-primary font-medium">+{season.suggestedRateIncrease}%</span>
                                  </div>
                                </div>
                                {season.status !== 'current' && (
                                  <Button variant="outline" size="sm" className="w-full mt-3" data-testid={`button-prepare-${index}`}>
                                    Prepare Now
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border border-green-200 bg-green-50 dark:bg-green-950/20" data-testid="card-available-balance">
                        <CardContent className="p-4">
                          <p className="text-sm text-green-700">Available for Payout</p>
                          <p className="text-3xl font-bold text-green-700">${instantPayoutBalance.available.toLocaleString()}</p>
                          <Button size="sm" className="mt-3 bg-green-600 text-white" data-testid="button-instant-payout">
                            <Zap className="w-4 h-4 mr-2" /> Request Payout
                          </Button>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-pending-balance">
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Pending</p>
                          <p className="text-2xl font-bold text-foreground">${instantPayoutBalance.pending.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-1">Available after trip completion</p>
                        </CardContent>
                      </Card>
                      <Card className="border" data-testid="card-processing">
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">Processing</p>
                          <p className="text-2xl font-bold text-foreground">${instantPayoutBalance.processing.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-1">Being transferred</p>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Leaderboard tab — formerly /expert/leaderboard */}
              <TabsContent value="leaderboard">
                <div className="max-w-2xl mx-auto">
                  <Card className="border">
                    <CardContent className="p-12 text-center">
                      <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                          <Award className="w-8 h-8 text-amber-600" />
                        </div>
                      </div>
                      <h2 className="text-2xl font-bold text-foreground mb-2">
                        Leaderboard Coming Soon
                      </h2>
                      <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
                        Expert rankings based on ratings, response time, and client satisfaction will appear here once we have enough data.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Keep delivering exceptional experiences to earn your place on the leaderboard!
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ExpertLayout>
  );
}
