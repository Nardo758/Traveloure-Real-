import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  TrendingUp, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Target,
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Sparkles,
  ChevronRight,
  Gift,
  Sun,
  Snowflake,
  Leaf,
  Flower2,
  PlusCircle,
  Star,
  Package,
  CreditCard,
  Wallet
} from "lucide-react";
import { Link } from "wouter";

export default function RevenueOptimizationPage() {
  const earningsProjection = {
    current: 4850,
    projected: 7200,
    potential: 9500,
    nextMonth: 5800,
    percentIncrease: 48,
  };

  const suggestedPricing = {
    currentRate: 75,
    marketAverage: 95,
    topExpertRate: 150,
    suggestedRate: 110,
    potentialIncrease: 47,
  };

  const upsellOpportunities = [
    {
      id: 1,
      title: "Add Transportation Service",
      description: "92% of your clients also book transportation",
      potential: "+$180/trip average",
      adoption: 92,
      icon: Zap,
    },
    {
      id: 2,
      title: "Offer Photography Package",
      description: "68% of proposal clients want photo coordination",
      potential: "+$250/booking",
      adoption: 68,
      icon: Gift,
    },
    {
      id: 3,
      title: "Premium Concierge Add-on",
      description: "High-value clients upgrade 45% of the time",
      potential: "+$400/trip",
      adoption: 45,
      icon: Star,
    },
  ];

  const seasonalDemand = [
    {
      season: "Cherry Blossom Season",
      location: "Kyoto, Japan",
      timing: "March 20 - April 15",
      demandIncrease: 180,
      suggestedRateIncrease: 30,
      icon: Flower2,
      status: "upcoming",
      daysAway: 54,
    },
    {
      season: "Summer Festival Season",
      location: "Tokyo, Japan",
      timing: "July - August",
      demandIncrease: 120,
      suggestedRateIncrease: 20,
      icon: Sun,
      status: "future",
      daysAway: 158,
    },
    {
      season: "Fall Foliage",
      location: "Nikko, Japan",
      timing: "October - November",
      demandIncrease: 150,
      suggestedRateIncrease: 25,
      icon: Leaf,
      status: "future",
      daysAway: 248,
    },
    {
      season: "Winter Illuminations",
      location: "Tokyo, Japan",
      timing: "December - January",
      demandIncrease: 90,
      suggestedRateIncrease: 15,
      icon: Snowflake,
      status: "current",
      daysAway: 0,
    },
  ];

  const passiveIncomeStreams = [
    {
      title: "Itinerary Templates",
      description: "Sell pre-built itineraries on the marketplace",
      monthlyEarnings: 450,
      sales: 23,
      icon: Package,
      status: "active",
    },
    {
      title: "Affiliate Commissions",
      description: "Earn from client bookings automatically",
      monthlyEarnings: 320,
      bookings: 18,
      icon: DollarSign,
      status: "active",
    },
    {
      title: "Sponsored Content",
      description: "Create content for travel brands",
      monthlyEarnings: 0,
      icon: Sparkles,
      status: "available",
    },
  ];

  const instantPayoutBalance = {
    available: 2100,
    pending: 1450,
    processing: 500,
    dailyFee: 1.5,
  };

  const actionableInsights = [
    {
      type: "revenue",
      title: "Raise your rates by 15%",
      description: "You're priced 21% below average for your rating. Top experts in Kyoto charge $110-150/hour.",
      impact: "+$1,200/month potential",
      priority: "high",
    },
    {
      type: "efficiency",
      title: "Bundle your top services",
      description: "Create a 'Complete Japan Experience' package combining your 3 most popular services.",
      impact: "+32% conversion rate",
      priority: "high",
    },
    {
      type: "timing",
      title: "Cherry Blossom preparation",
      description: "Peak season in 54 days. Update your availability and prepare specialty itineraries now.",
      impact: "180% demand increase expected",
      priority: "medium",
    },
    {
      type: "upsell",
      title: "Add photography coordination",
      description: "68% of your proposal clients ask about photography. Add it as a service option.",
      impact: "+$250 per proposal booking",
      priority: "medium",
    },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-700 border-red-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <ExpertLayout title="Revenue Optimization">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-revenue-title">
              Revenue Optimization
            </h1>
            <p className="text-muted-foreground">Maximize your earnings with AI-powered insights</p>
          </div>
          <div className="flex gap-2">
            <Link href="/expert/earnings">
              <Button variant="outline" data-testid="button-view-earnings">
                <Wallet className="w-4 h-4 mr-2" /> View Earnings
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="projections" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="projections" data-testid="tab-projections">Projections</TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
            <TabsTrigger value="passive" data-testid="tab-passive">Passive Income</TabsTrigger>
            <TabsTrigger value="payout" data-testid="tab-payout">Instant Payout</TabsTrigger>
          </TabsList>

          <TabsContent value="projections" className="space-y-6">
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
                      <p className="text-sm text-muted-foreground">Projected (This Month)</p>
                      <p className="text-2xl font-bold text-foreground">${earningsProjection.projected.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Based on current pipeline</p>
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
                      <p className="text-sm text-muted-foreground">If all optimizations applied</p>
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
                      <p className="text-sm text-muted-foreground">Next Month Forecast</p>
                      <p className="text-2xl font-bold text-foreground">${earningsProjection.nextMonth.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Based on bookings</p>
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
                  {actionableInsights.map((insight, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border hover-elevate cursor-pointer transition-all"
                      data-testid={`insight-${index}`}
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
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Upsell Opportunities
                  </CardTitle>
                  <CardDescription>Services your clients frequently request</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {upsellOpportunities.map((opp) => (
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
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              {opp.potential}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{opp.description}</p>
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>Client adoption rate</span>
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
                  {seasonalDemand.map((season, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${season.status === 'current' ? 'border-primary bg-primary/5' : season.status === 'upcoming' ? 'border-amber-300 bg-amber-50' : ''}`}
                      data-testid={`season-${index}`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${season.status === 'current' ? 'bg-primary/20' : 'bg-muted'}`}>
                          <season.icon className={`w-5 h-5 ${season.status === 'current' ? 'text-primary' : 'text-muted-foreground'}`} />
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
                      <div className="mt-3 pt-3 border-t space-y-2">
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <Card className="border">
              <CardHeader>
                <CardTitle>Suggested Pricing Analysis</CardTitle>
                <CardDescription>Based on your expertise, ratings, and market conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Your Current Rate</p>
                    <p className="text-3xl font-bold text-foreground">${suggestedPricing.currentRate}</p>
                    <p className="text-xs text-muted-foreground">/hour</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Market Average</p>
                    <p className="text-3xl font-bold text-foreground">${suggestedPricing.marketAverage}</p>
                    <p className="text-xs text-muted-foreground">/hour</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center bg-green-50 border-green-200">
                    <p className="text-sm text-green-700">Suggested Rate</p>
                    <p className="text-3xl font-bold text-green-600">${suggestedPricing.suggestedRate}</p>
                    <p className="text-xs text-green-600">+{suggestedPricing.potentialIncrease}% increase</p>
                  </div>
                  <div className="p-4 rounded-lg border text-center">
                    <p className="text-sm text-muted-foreground">Top Expert Rate</p>
                    <p className="text-3xl font-bold text-foreground">${suggestedPricing.topExpertRate}</p>
                    <p className="text-xs text-muted-foreground">/hour</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Why you should raise your rates</p>
                      <ul className="text-sm text-blue-700 mt-2 space-y-1">
                        <li>Your 4.9 rating puts you in the top 10% of experts</li>
                        <li>98% response rate shows high reliability</li>
                        <li>156 reviews provide strong social proof</li>
                        <li>Experts with similar profiles charge $100-120/hour</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className="bg-primary" data-testid="button-update-rates">
                    Update My Rates
                  </Button>
                  <Button variant="outline" data-testid="button-view-comparison">
                    View Full Comparison
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="passive" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border" data-testid="card-passive-total">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Passive Income (Monthly)</p>
                      <p className="text-2xl font-bold text-foreground">$770</p>
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" /> +23% this month
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border" data-testid="card-templates-sold">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Templates Sold</p>
                      <p className="text-2xl font-bold text-foreground">23</p>
                      <p className="text-sm text-muted-foreground">This month</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Package className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border" data-testid="card-affiliate-bookings">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Affiliate Bookings</p>
                      <p className="text-2xl font-bold text-foreground">18</p>
                      <p className="text-sm text-muted-foreground">Earning commission</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Users className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border">
                <CardHeader>
                  <CardTitle>Passive Income Streams</CardTitle>
                  <CardDescription>Earn money even when you're not actively working</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        </div>
                      </div>
                      {stream.status === 'available' && (
                        <Button className="w-full mt-3" variant="outline" data-testid={`button-activate-${index}`}>
                          <Sparkles className="w-4 h-4 mr-2" /> Get Started
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border">
                <CardHeader>
                  <CardTitle>Create Itinerary Templates</CardTitle>
                  <CardDescription>Package your expertise and earn royalties</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3 mb-3">
                      <Package className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Sell Your Best Itineraries</p>
                        <p className="text-sm text-muted-foreground">Earn 70% royalty on each sale</p>
                      </div>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-2 mb-4">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Package your expertise once, earn repeatedly
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Travelers customize and book from your templates
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Build your brand and attract new clients
                      </li>
                    </ul>
                    <Button className="w-full bg-primary" data-testid="button-create-template">
                      <PlusCircle className="w-4 h-4 mr-2" /> Create Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payout" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border border-green-200 bg-green-50" data-testid="card-available-balance">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700">Available for Instant Payout</p>
                      <p className="text-3xl font-bold text-green-700">${instantPayoutBalance.available.toLocaleString()}</p>
                      <p className="text-sm text-green-600">Ready to withdraw now</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-green-200 flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-green-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border" data-testid="card-pending-balance">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending (Trips in Progress)</p>
                      <p className="text-2xl font-bold text-foreground">${instantPayoutBalance.pending.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Available after completion</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border" data-testid="card-processing">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Processing</p>
                      <p className="text-2xl font-bold text-foreground">${instantPayoutBalance.processing.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Being transferred</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border">
              <CardHeader>
                <CardTitle>Instant Payout Options</CardTitle>
                <CardDescription>Get your money faster - withdraw anytime</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border hover-elevate cursor-pointer" data-testid="option-instant-payout">
                    <div className="flex items-center gap-3 mb-3">
                      <Zap className="w-6 h-6 text-amber-500" />
                      <div>
                        <p className="font-medium text-foreground">Instant Payout</p>
                        <p className="text-sm text-muted-foreground">Receive within 30 minutes</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-muted-foreground">Fee</span>
                      <span className="text-foreground">{instantPayoutBalance.dailyFee}% (min $0.25)</span>
                    </div>
                    <Button className="w-full bg-primary" data-testid="button-instant-payout">
                      <Zap className="w-4 h-4 mr-2" /> Request Instant Payout
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg border hover-elevate cursor-pointer" data-testid="option-standard-payout">
                    <div className="flex items-center gap-3 mb-3">
                      <Calendar className="w-6 h-6 text-blue-500" />
                      <div>
                        <p className="font-medium text-foreground">Standard Payout</p>
                        <p className="text-sm text-muted-foreground">Receive in 2-3 business days</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-muted-foreground">Fee</span>
                      <span className="text-green-600 font-medium">Free</span>
                    </div>
                    <Button variant="outline" className="w-full" data-testid="button-standard-payout">
                      <Calendar className="w-4 h-4 mr-2" /> Request Standard Payout
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Daily Payout Available</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Enable automatic daily payouts to receive your earnings every day instead of waiting. 
                        Small {instantPayoutBalance.dailyFee}% fee applies.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-enable-daily">
                        Enable Daily Payouts
                      </Button>
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
