/**
 * Provider Performance — Console IA C9 (§17 17→9 collapse, the provider nine-module stamp).
 *
 * C9 mirrors the expert C6 fold: this page HOSTS the Analytics page as a tab — a mount, not
 * an extraction (analytics.tsx stays intact as a component, lazy-loaded here so its bundle
 * only loads when the tab opens). This page reads ?tab= (overview | analytics); the embedded
 * analytics page has no internal ?tab= reading of its own (unlike the expert analytics
 * page's 9-tab picker), so no ?sub= seam is needed. /provider/analytics redirects to
 * /provider/performance?tab=analytics.
 */
import { lazy, Suspense, useState } from "react";
import { useSearch } from "wouter";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Star,
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
  Calendar,
  MessageSquare,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { ProviderServiceRecommendations } from "@/components/provider/service-recommendations";

// C9: lazy so the analytics bundle only loads when its tab is opened (App.tsx dropped its
// own ProviderAnalytics lazy import — this is the only mount). Named …Page to avoid
// colliding with the ProviderAnalytics response interface below.
const ProviderAnalyticsPage = lazy(() => import("@/pages/provider/analytics"));

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
    // §13: real computed aggregates, not fabricated literals. status "ok" means
    // categoryAvg/topPerformerAvg are real numbers over `sampleSize` comparable listings;
    // "no_data" means sampleSize was too small (<5) and both are null — render honestly,
    // never fall back to a made-up number.
    status: "ok" | "no_data";
    sampleSize: number;
    categoryAvg: number | null;
    topPerformerAvg: number | null;
  };
}

// §06d Reviews tab response shapes.
interface ProviderReview {
  id: string;
  rating: number;
  reviewText: string | null;
  createdAt: string;
  providerReply: string | null;
  providerRepliedAt: string | null;
  serviceId: string;
  serviceName: string;
  travelerName: string;
}

interface ProviderReviewsResponse {
  reviews: ProviderReview[];
  summary: { total: number; avgRating: number; awaitingReply: number };
}

// Demand tab response shapes (§10/§11/§12, GET /api/me/demand-signals /
// POST+GET /api/me/business-advisor — server/routes/demand.routes.ts). Every section is
// independently null/empty-honest (§13): a market with no matching rows renders its own empty
// line rather than borrowing another market's data.
interface DemandSignalRow {
  kind: string;
  label: string;
  count: number;
  detail?: string;
}

interface CrowdMonthRow {
  month: number;
  monthLabel: string;
  crowdLevel: string | null;
  rating: string | null;
}

interface UpcomingEventRow {
  id: string;
  title: string;
  eventType: string | null;
  startMonth: number | null;
  endMonth: number | null;
  specificDate: string | null;
}

interface DemandSignalsResponse {
  market: string | null;
  lowSignal: boolean;
  signals: DemandSignalRow[];
  crowd: CrowdMonthRow[] | null;
  events: UpcomingEventRow[] | null;
}

interface BusinessAdvisorResponse {
  narration: string;
  generatedAt: string;
  stale?: boolean;
  cached?: boolean;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Crowd-level → bar height. Covers both source vocabularies that can appear in destination_seasons
// (destination-calendar's Low/Medium/High and TravelPulse's quiet/moderate/busy/packed) — an
// unrecognized value still renders a real (mid) bar rather than disappearing.
const CROWD_HEIGHT_PCT: Record<string, number> = {
  low: 25, quiet: 25,
  medium: 55, moderate: 55,
  high: 80, busy: 80,
  packed: 100, very_high: 100,
};
function crowdHeightPct(level: string | null): number {
  if (!level) return 12;
  return CROWD_HEIGHT_PCT[level.toLowerCase()] ?? 45;
}

export default function ProviderPerformance() {
  const search = useSearch();
  const tabQuery = new URLSearchParams(search).get("tab");
  const tabParam =
    tabQuery === "analytics" ? "analytics" :
    tabQuery === "reviews" ? "reviews" :
    tabQuery === "demand" ? "demand" :
    "overview";

  const { data: analytics, isLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
  });

  const metrics = [
    {
      label: "Total Revenue",
      value: `$${(analytics?.summary?.totalRevenue || 0).toLocaleString()}`,
      icon: DollarSign,
      suffix: ""
    },
    {
      label: "Total Bookings",
      value: analytics?.summary?.totalBookings?.toString() || "0",
      icon: Calendar,
      suffix: ""
    },
    {
      label: "Average Rating",
      value: (analytics?.summary?.avgRating || 0).toFixed(1),
      icon: Star,
      suffix: "/5"
    },
    {
      label: "Active Services",
      value: analytics?.summary?.activeServices?.toString() || "0",
      icon: TrendingUp,
      suffix: ""
    },
  ];

  // D5 (UX audit Jul 29): "Below Average" was rendered even for an account with zero
  // bookings (avgBookingValue 0 always fails the benchmark check) — a judgment against
  // no data, not a real comparison. `no_data` is a distinct, honest status (§13 pattern).
  // benchmark is now `null` when the server has no comparable-listing sample (<5) for this
  // provider's category — that is also honestly "no_data", never compared against a fallback.
  const getBenchmarkStatus = (value: number, benchmark: number | null) => {
    if (value <= 0 || benchmark === null) return "no_data";
    if (value >= benchmark * 1.2) return "excellent";
    if (value >= benchmark) return "good";
    return "needs_improvement";
  };

  const benchmarkHasData = analytics?.benchmarks?.status === "ok";
  const categoryAvg = analytics?.benchmarks?.categoryAvg ?? null;
  const topPerformerAvg = analytics?.benchmarks?.topPerformerAvg ?? null;
  const benchmarkSampleSize = analytics?.benchmarks?.sampleSize ?? 0;

  return (
    <ProviderLayout title="Performance">
      <Tabs defaultValue={tabParam} className="w-full">
        <div className="p-6 pb-0">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-performance-title">
              Performance
            </h1>
            <p className="text-muted-foreground">Track your business performance and compare with benchmarks</p>
          </div>
          <TabsList data-testid="tabs-performance">
            <TabsTrigger value="overview" data-testid="tab-performance-overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-performance-analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reviews" data-testid="tab-performance-reviews">Reviews</TabsTrigger>
            <TabsTrigger value="demand" data-testid="tab-performance-demand">Demand</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="p-6 space-y-6">
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
                  {!benchmarkHasData && (
                    <p className="text-sm text-muted-foreground" data-testid="text-benchmark-no-data">
                      Not enough comparable listings in your market yet.
                    </p>
                  )}
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
                            getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "excellent"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "good"
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "no_data"
                              ? "bg-muted text-muted-foreground border-border"
                              : "bg-amber-100 text-amber-700 border-amber-200"
                          }
                        >
                          {getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "excellent"
                            ? "Excellent"
                            : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "good"
                            ? "Good"
                            : getBenchmarkStatus(analytics?.benchmarks?.avgBookingValue || 0, categoryAvg) === "no_data"
                            ? "No data yet"
                            : "Below Average"
                          }
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30" data-testid="benchmark-category-avg">
                      <div>
                        <p className="font-medium text-foreground">Category Average</p>
                        <p className="text-sm text-muted-foreground">
                          {benchmarkHasData ? `Similar providers (n=${benchmarkSampleSize} listings)` : "Similar providers"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-muted-foreground">
                          {categoryAvg !== null ? `$${categoryAvg}` : "No data yet"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30" data-testid="benchmark-top-performer">
                      <div>
                        <p className="font-medium text-foreground">Top Quartile</p>
                        <p className="text-sm text-muted-foreground">
                          {benchmarkHasData ? `Top 25% average (n=${benchmarkSampleSize} listings)` : "Top 25% average"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-muted-foreground">
                          {topPerformerAvg !== null ? `$${topPerformerAvg}` : "No data yet"}
                        </p>
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

            <ProviderServiceRecommendations />

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
        </TabsContent>

        {/* C9: the analytics page rendered embedded — no second ProviderLayout (its embedded
            seam skips the shell). Its content carries its own p-6. */}
        <TabsContent value="analytics" data-testid="content-performance-analytics">
          <Suspense
            fallback={
              <div className="p-6 space-y-4">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <ProviderAnalyticsPage embedded />
          </Suspense>
        </TabsContent>

        {/* §06d Reviews tab — GET /api/me/reviews (session provider's reviews across all their
            services), PATCH /api/me/reviews/:id/reply to post/edit the public reply. */}
        <TabsContent value="reviews" data-testid="content-performance-reviews">
          <div className="p-6">
            <ReviewsTab />
          </div>
        </TabsContent>

        {/* Demand tab (§10/§11/§12) — GET /api/me/demand-signals (signals + crowd/seasonality +
            upcoming events, all independently null/empty-honest) and the Business Advisor card
            (POST /api/me/business-advisor, on-demand AI narration over server-assembled facts). */}
        <TabsContent value="demand" data-testid="content-performance-demand">
          <DemandTab />
        </TabsContent>
      </Tabs>
    </ProviderLayout>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`}
        />
      ))}
    </div>
  );
}

function ReviewReplyRow({ review }: { review: ProviderReview }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");

  const replyMutation = useMutation({
    mutationFn: (reply: string) =>
      apiRequest("PATCH", `/api/me/reviews/${review.id}/reply`, { reply }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/reviews"] });
      toast({ title: "Reply posted" });
      setDraft("");
    },
    onError: () => toast({ title: "Failed to post reply", variant: "destructive" }),
  });

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid={`row-review-${review.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm">{review.travelerName}</span>
            <span className="text-muted-foreground text-xs">on</span>
            <span className="text-sm font-medium truncate max-w-[220px]">{review.serviceName}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Stars rating={review.rating} />
            <span className="text-xs text-muted-foreground">
              {format(new Date(review.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          {review.reviewText ? (
            <p className="text-sm text-foreground">{review.reviewText}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No review text.</p>
          )}
        </div>
      </div>

      {review.providerReply ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <MessageSquare className="w-3 h-3" />
            Your reply (public)
            {review.providerRepliedAt && (
              <span className="font-normal opacity-70">
                {format(new Date(review.providerRepliedAt), "MMM d, yyyy")}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground">{review.providerReply}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Write a public reply to this review…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm h-20"
            maxLength={1000}
            data-testid={`input-reply-${review.id}`}
          />
          <Button
            size="sm"
            disabled={!draft.trim() || replyMutation.isPending}
            onClick={() => replyMutation.mutate(draft.trim())}
            data-testid={`button-post-reply-${review.id}`}
          >
            {replyMutation.isPending ? "Posting…" : "Post reply"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewsTab() {
  const { data, isLoading } = useQuery<ProviderReviewsResponse>({
    queryKey: ["/api/me/reviews"],
  });

  const reviews = data?.reviews ?? [];
  const summary = data?.summary ?? { total: 0, avgRating: 0, awaitingReply: 0 };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-reviews-average">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average</p>
                <p className="text-2xl font-bold text-foreground">{summary.avgRating.toFixed(1)}<span className="text-base font-normal text-muted-foreground">/5</span></p>
              </div>
              <Star className="w-8 h-8 text-amber-500 fill-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-reviews-total">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-foreground">{summary.total}</p>
              </div>
              <Users className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card
          data-testid="card-reviews-awaiting"
          className={summary.awaitingReply > 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Awaiting reply</p>
                <p className={`text-2xl font-bold ${summary.awaitingReply > 0 ? "text-amber-700 dark:text-amber-500" : "text-foreground"}`}>
                  {summary.awaitingReply}
                </p>
              </div>
              {summary.awaitingReply > 0 ? (
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              ) : (
                <MessageSquare className="w-8 h-8 text-primary" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-reviews-empty">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No reviews yet — they appear after completed bookings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewReplyRow key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

function DemandTab() {
  const { data, isLoading, isError } = useQuery<DemandSignalsResponse>({
    queryKey: ["/api/me/demand-signals"],
  });

  // Business Advisor GET can 204 ("no advice generated yet") — a bare res.json() would throw on
  // the empty body, so this is a custom queryFn that reads the status first (same pattern the
  // trip Advisor narration card uses in client/src/pages/expert/workspace.tsx).
  const { data: advisor, isLoading: advisorGetLoading } = useQuery<BusinessAdvisorResponse | null>({
    queryKey: ["/api/me/business-advisor"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/business-advisor");
      if (res.status === 204) return null;
      return res.json();
    },
  });

  // POST is strictly on-demand — only the button below ever fires it. A 502 is surfaced as the
  // server's own honest inline message, verbatim, never auto-retried.
  const advisorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/me/business-advisor", {});
      return res.json() as Promise<BusinessAdvisorResponse>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/me/business-advisor"], result);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="text-center text-muted-foreground py-12" data-testid="text-demand-unavailable">
          Demand data is unavailable right now.
        </p>
      </div>
    );
  }

  if (!data.market) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-muted-foreground" data-testid="text-demand-no-market">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Add a city to one of your listings to see demand signals for your market.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground" data-testid="text-demand-market">
          Demand in {data.market}
        </h2>
        <p className="text-sm text-muted-foreground">Real traveler search and build activity in your market.</p>
      </div>

      {/* Demand signals — server-side minimum-event threshold (>=3/kind); lowSignal covers both
          "nothing yet" and "not enough yet" with one honest line (§13). */}
      <Card data-testid="card-demand-signals">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Demand signals
          </CardTitle>
          <CardDescription>Real search and build activity logged for {data.market}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.signals.length > 0 ? (
            <div className="space-y-3">
              {data.signals.map((s) => (
                <div
                  key={s.kind}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                  data-testid={`row-signal-${s.kind}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{s.label}</p>
                    {s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">Source: demand_signal_events · {s.kind}</p>
                  </div>
                  <Badge variant="outline" data-testid={`badge-signal-count-${s.kind}`}>{s.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-signals-low">
              Not enough signal yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Crowd / seasonality — 12-month bar strip, only months actually present render. */}
      <Card data-testid="card-demand-crowd">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Crowd & seasonality
          </CardTitle>
          <CardDescription>TravelPulse monthly crowd levels for {data.market}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.crowd && data.crowd.length > 0 ? (
            <div className="flex items-end gap-2 h-32" data-testid="chart-crowd-strip">
              {data.crowd.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" data-testid={`bar-crowd-${m.month}`}>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${crowdHeightPct(m.crowdLevel)}%` }}
                      title={m.crowdLevel ?? "unknown"}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.monthLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-crowd-empty">
              No seasonality data on record for {data.market} yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming events — destination_events, approved only. */}
      <Card data-testid="card-demand-events">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Upcoming destination events
          </CardTitle>
          <CardDescription>Approved calendar events for {data.market}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.events && data.events.length > 0 ? (
            <div className="space-y-2">
              {data.events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                  data-testid={`row-event-${e.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{e.title}</p>
                    {e.eventType && (
                      <p className="text-xs text-muted-foreground capitalize">{e.eventType.replace(/_/g, " ")}</p>
                    )}
                  </div>
                  {e.startMonth && (
                    <Badge variant="outline">
                      {MONTH_NAMES[e.startMonth - 1] ?? e.startMonth}
                      {e.endMonth && e.endMonth !== e.startMonth ? `–${MONTH_NAMES[e.endMonth - 1] ?? e.endMonth}` : ""}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-events-empty">
              No upcoming events on record for {data.market} yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Business Advisor — on-demand AI narration over the same server-assembled facts
          (listing health, benchmarks, link stats, demand signals). */}
      <Card data-testid="card-business-advisor">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Business Advisor
          </CardTitle>
          <CardDescription>AI advice grounded in your listings, benchmarks, links, and local demand</CardDescription>
        </CardHeader>
        <CardContent>
          {advisorMutation.isPending ? (
            <p className="text-sm text-muted-foreground" data-testid="text-advisor-loading">Reading your business…</p>
          ) : advisorMutation.isError ? (
            <p className="text-sm text-muted-foreground italic" data-testid="text-advisor-error">
              Advice unavailable right now
            </p>
          ) : advisor ? (
            <div>
              <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="text-advisor-narration">
                {advisor.narration}
              </p>
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-advisor-generated-at">
                Generated {format(new Date(advisor.generatedAt), "MMM d, yyyy")}
              </p>
              {advisor.stale && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => advisorMutation.mutate()}
                  data-testid="button-refresh-advice"
                >
                  Refresh advice
                </Button>
              )}
            </div>
          ) : (
            <Button
              onClick={() => advisorMutation.mutate()}
              disabled={advisorGetLoading}
              data-testid="button-get-advice"
            >
              Get advice on my business
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
