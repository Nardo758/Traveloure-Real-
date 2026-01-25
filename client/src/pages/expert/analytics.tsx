import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users,
  Clock,
  DollarSign,
  Target,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  MessageSquare,
  Calendar,
  Zap,
  Lightbulb,
  Star
} from "lucide-react";

export default function ExpertAnalytics() {
  const keyMetrics = {
    responseTime: { value: "3 hrs", benchmark: "1 hr", status: "needs_improvement" },
    conversionRate: { value: "42%", benchmark: "55%", status: "needs_improvement" },
    clientRetention: { value: "78%", benchmark: "60%", status: "excellent" },
    avgBookingValue: { value: "$485", benchmark: "$420", status: "good" },
  };

  const conversionFunnel = [
    { stage: "Profile Views", count: 1250, percent: 100 },
    { stage: "Inquiry Started", count: 380, percent: 30.4 },
    { stage: "Responded", count: 365, percent: 96 },
    { stage: "Quote Sent", count: 210, percent: 57.5 },
    { stage: "Booking Made", count: 156, percent: 74.3 },
    { stage: "Trip Completed", count: 142, percent: 91 },
  ];

  const revenueByService = [
    { service: "Trip Planning", revenue: 4200, percentage: 35, clients: 28 },
    { service: "Proposal Planning", revenue: 3600, percentage: 30, clients: 12 },
    { service: "Anniversary Events", revenue: 2100, percentage: 17.5, clients: 18 },
    { service: "Corporate Retreats", revenue: 1500, percentage: 12.5, clients: 4 },
    { service: "Other", revenue: 600, percentage: 5, clients: 8 },
  ];

  const clientAcquisition = [
    { source: "Platform Search", clients: 45, percentage: 38 },
    { source: "Direct Referral", clients: 32, percentage: 27 },
    { source: "Featured Placement", clients: 24, percentage: 20 },
    { source: "Expert Matching", clients: 12, percentage: 10 },
    { source: "Social Media", clients: 6, percentage: 5 },
  ];

  const actionableInsights = [
    {
      type: "urgent",
      title: "Response time is hurting conversions",
      description: "Your 3hr average response time is 3x slower than top performers. Experts who respond in <1hr earn 40% more.",
      action: "Enable quick reply templates",
      impact: "+$1,200/month potential",
    },
    {
      type: "opportunity",
      title: "Add transportation to your services",
      description: "68% of your clients book transportation separately. Adding this service could increase your average booking value by 35%.",
      action: "Add service now",
      impact: "+$170/booking average",
    },
    {
      type: "growth",
      title: "Your proposal planning is a hit",
      description: "You have a 89% conversion rate on proposals - 34% above average. Consider raising rates by 20%.",
      action: "Update pricing",
      impact: "+$720/month potential",
    },
    {
      type: "retention",
      title: "Re-engage past clients",
      description: "12 clients haven't booked in 6+ months. A simple check-in could bring back 30% of them.",
      action: "Send follow-up",
      impact: "3-4 potential bookings",
    },
  ];

  const clientLifetimeValue = {
    average: 1850,
    topClients: 4200,
    repeatRate: 45,
    avgBookingsPerClient: 2.3,
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case "urgent": return "border-red-200 bg-red-50";
      case "opportunity": return "border-amber-200 bg-amber-50";
      case "growth": return "border-green-200 bg-green-50";
      case "retention": return "border-blue-200 bg-blue-50";
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

  return (
    <ExpertLayout title="Analytics">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-analytics-title">
            Business Analytics
          </h1>
          <p className="text-muted-foreground">Actionable insights to grow your business</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={`border ${keyMetrics.responseTime.status === 'needs_improvement' ? 'border-red-200' : ''}`} data-testid="metric-response-time">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                {keyMetrics.responseTime.status === 'needs_improvement' && (
                  <Badge className="bg-red-100 text-red-700 border-red-200">Needs Work</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Avg Response Time</p>
              <p className="text-2xl font-bold text-foreground">{keyMetrics.responseTime.value}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Top experts: {keyMetrics.responseTime.benchmark}
              </p>
            </CardContent>
          </Card>

          <Card className={`border ${keyMetrics.conversionRate.status === 'needs_improvement' ? 'border-amber-200' : ''}`} data-testid="metric-conversion">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Target className="w-5 h-5 text-muted-foreground" />
                {keyMetrics.conversionRate.status === 'needs_improvement' && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">Below Avg</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
              <p className="text-2xl font-bold text-foreground">{keyMetrics.conversionRate.value}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Average: {keyMetrics.conversionRate.benchmark}
              </p>
            </CardContent>
          </Card>

          <Card className="border border-green-200" data-testid="metric-retention">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <Badge className="bg-green-100 text-green-700 border-green-200">Excellent</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Client Retention</p>
              <p className="text-2xl font-bold text-green-600">{keyMetrics.clientRetention.value}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Average: {keyMetrics.clientRetention.benchmark}
              </p>
            </CardContent>
          </Card>

          <Card className="border" data-testid="metric-booking-value">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">Above Avg</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Avg Booking Value</p>
              <p className="text-2xl font-bold text-foreground">{keyMetrics.avgBookingValue.value}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Average: {keyMetrics.avgBookingValue.benchmark}
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
            <TabsTrigger value="acquisition" data-testid="tab-acquisition">Client Acquisition</TabsTrigger>
            <TabsTrigger value="lifetime" data-testid="tab-lifetime">Client Lifetime Value</TabsTrigger>
          </TabsList>

          <TabsContent value="funnel">
            <Card className="border">
              <CardHeader>
                <CardTitle>Conversion Funnel</CardTitle>
                <CardDescription>Track how visitors become paying clients</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {conversionFunnel.map((stage, index) => (
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
                            {stage.percent}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Conversion Tip</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Your inquiry-to-quote conversion (57.5%) is below average (65%). Consider using our AI to draft faster, more personalized quotes.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue">
            <Card className="border">
              <CardHeader>
                <CardTitle>Revenue by Service</CardTitle>
                <CardDescription>See which services drive the most income</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {revenueByService.map((service, index) => (
                    <div key={index} className="p-4 rounded-lg border" data-testid={`service-revenue-${index}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-foreground">{service.service}</p>
                        <p className="font-bold text-foreground">${service.revenue.toLocaleString()}</p>
                      </div>
                      <Progress value={service.percentage} className="h-2 mb-2" />
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{service.percentage}% of total revenue</span>
                        <span>{service.clients} clients</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acquisition">
            <Card className="border">
              <CardHeader>
                <CardTitle>Client Acquisition Sources</CardTitle>
                <CardDescription>Where your clients are coming from</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {clientAcquisition.map((source, index) => (
                    <div key={index} className="flex items-center gap-4" data-testid={`acquisition-source-${index}`}>
                      <div className="w-40 text-sm text-foreground font-medium">{source.source}</div>
                      <div className="flex-1">
                        <Progress value={source.percentage} className="h-4" />
                      </div>
                      <div className="w-24 text-right">
                        <span className="text-sm font-medium">{source.clients} clients</span>
                        <span className="text-xs text-muted-foreground ml-1">({source.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lifetime">
            <Card className="border">
              <CardHeader>
                <CardTitle>Client Lifetime Value</CardTitle>
                <CardDescription>Understand the long-term value of your clients</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-center">
                    <p className="text-sm text-muted-foreground">Average CLV</p>
                    <p className="text-3xl font-bold text-primary">${clientLifetimeValue.average.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Top Client CLV</p>
                    <p className="text-3xl font-bold text-foreground">${clientLifetimeValue.topClients.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Repeat Rate</p>
                    <p className="text-3xl font-bold text-green-600">{clientLifetimeValue.repeatRate}%</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Avg Bookings/Client</p>
                    <p className="text-3xl font-bold text-foreground">{clientLifetimeValue.avgBookingsPerClient}</p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800">You're doing great!</p>
                      <p className="text-sm text-green-700 mt-1">
                        Your 45% repeat rate is 50% above platform average. Keep nurturing these relationships - they're your most valuable asset.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
