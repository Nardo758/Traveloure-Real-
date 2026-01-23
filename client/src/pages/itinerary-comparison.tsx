import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Check,
  Clock,
  DollarSign,
  Star,
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  MapPin,
  Zap,
  ShoppingCart,
  ChevronRight,
  Calendar,
  Loader2,
  Award,
  Target,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Train,
  Ticket,
  Users,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VariantItem {
  id: string;
  dayNumber: number;
  timeSlot: string;
  startTime: string;
  endTime: string;
  name: string;
  description: string;
  serviceType: string;
  price: string;
  rating: string;
  location: string;
  duration: number;
  travelTimeFromPrevious: number;
  isReplacement: boolean;
  replacementReason: string | null;
}

interface VariantMetric {
  id: string;
  metricKey: string;
  metricLabel: string;
  value: string;
  unit: string;
  betterIsLower: boolean;
  comparison: string;
  improvementPercentage: string;
  description: string;
}

interface Variant {
  id: string;
  name: string;
  description: string;
  source: string;
  status: string;
  totalCost: string;
  totalTravelTime: number;
  averageRating: string;
  freeTimeMinutes: number;
  optimizationScore: number;
  aiReasoning: string;
  sortOrder: number;
  items: VariantItem[];
  metrics: VariantMetric[];
}

interface Comparison {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  travelers: number;
  status: string;
  selectedVariantId: string | null;
}

interface ComparisonData {
  comparison: Comparison;
  variants: Variant[];
}

export default function ItineraryComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [modalVariant, setModalVariant] = useState<Variant | null>(null);
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [expertNotes, setExpertNotes] = useState("");

  const getBookingType = (serviceType: string): "inApp" | "partner" => {
    const partnerTypes = ["transport", "ground_transport", "train", "bus", "ferry", "event", "entertainment", "concert", "show"];
    return partnerTypes.some(t => serviceType?.toLowerCase().includes(t)) ? "partner" : "inApp";
  };

  const getPartnerUrl = (item: VariantItem): string | null => {
    if (getBookingType(item.serviceType) !== "partner") return null;
    const twelveGoAffiliateId = "13805109";
    const impactCatalogId = "15532";
    if (["transport", "ground_transport", "train", "bus", "ferry"].some(t => item.serviceType?.toLowerCase().includes(t))) {
      return `https://12go.co/en/travel?affiliate_id=${twelveGoAffiliateId}`;
    }
    if (["event", "entertainment", "concert", "show"].some(t => item.serviceType?.toLowerCase().includes(t))) {
      return `https://feverup.com/en?utm_source=impact&utm_medium=affiliate&utm_campaign=${impactCatalogId}`;
    }
    return null;
  };

  const expertBookingMutation = useMutation({
    mutationFn: async (data: { tripId: string; notes: string }) => {
      return apiRequest("POST", "/api/expert-booking-requests", data);
    },
    onSuccess: () => {
      setShowExpertDialog(false);
      setExpertNotes("");
      toast({
        title: "Request Sent",
        description: "An expert will review your itinerary and handle all bookings.",
      });
    },
    onError: () => {
      toast({
        title: "Request Failed",
        description: "Unable to submit your request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleExpertBookingRequest = () => {
    if (id) {
      expertBookingMutation.mutate({ tripId: id, notes: expertNotes });
    }
  };

  const { data, isLoading, refetch } = useQuery<ComparisonData>({
    queryKey: ["/api/itinerary-comparisons", id],
    enabled: !!id && !!user,
    refetchInterval: (query) => {
      const data = query.state.data as ComparisonData | undefined;
      if (data?.comparison?.status === "generating") {
        return 2000;
      }
      return false;
    },
  });

  const destination = data?.comparison?.destination;
  
  const { data: travelPulseData, isLoading: travelPulseLoading, isError: travelPulseError } = useQuery<{
    city?: {
      name: string;
      country: string;
      pulseScore?: number;
      trendingScore?: number;
      crowdLevel?: string;
      weatherScore?: number;
      aiSeasonalHighlights?: string;
      aiUpcomingEvents?: string;
      aiTravelTips?: string;
      aiLocalInsights?: string;
      aiBudgetEstimate?: string;
      aiMustSeeAttractions?: string;
    };
  }>({
    queryKey: ["/api/travelpulse/cities", destination],
    enabled: !!destination,
  });

  const { data: trendingData, isLoading: trendingLoading } = useQuery<{
    experiences?: Array<{
      id: string;
      name: string;
      type: string;
      trendingScore: number;
      reason?: string;
    }>;
  }>({
    queryKey: ["/api/travelpulse/trending", destination],
    enabled: !!destination,
  });

  const travelPulseIntelligenceLoading = travelPulseLoading || trendingLoading;

  const retryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/itinerary-comparisons/${id}/generate`, { baselineItems: [] });
    },
    onSuccess: () => {
      toast({ title: "Regenerating alternatives", description: "AI is creating optimized versions..." });
      refetch();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to regenerate", description: "Please try again" });
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (variantId: string) => {
      return apiRequest("POST", `/api/itinerary-comparisons/${id}/select`, { variantId });
    },
    onSuccess: () => {
      toast({ title: "Itinerary selected", description: "Your chosen plan has been saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/itinerary-comparisons", id] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to select", description: "Please try again" });
    },
  });

  const applyToCartMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/itinerary-comparisons/${id}/apply-to-cart`);
    },
    onSuccess: () => {
      toast({ title: "Cart updated", description: "Your selected itinerary has been added to cart" });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setLocation("/cart");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update cart", description: "Please try again" });
    },
  });

  useEffect(() => {
    if (data?.comparison?.selectedVariantId) {
      setSelectedVariantId(data.comparison.selectedVariantId);
    }
  }, [data]);

  if (authLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    setLocation("/api/login");
    return null;
  }

  const isGenerating = data?.comparison?.status === "generating";
  const hasFailed = data?.comparison?.status === "failed";
  const hasVariants = data?.variants && data.variants.length > 0;
  const userVariant = data?.variants?.find((v) => v.source === "user");
  const aiVariants = data?.variants?.filter((v) => v.source === "ai_optimized") || [];

  const getMetricIcon = (key: string) => {
    switch (key) {
      case "total_cost":
        return DollarSign;
      case "average_rating":
        return Star;
      case "travel_time":
        return Clock;
      case "free_time":
        return Calendar;
      case "optimization_score":
        return Target;
      default:
        return Zap;
    }
  };

  const getMetricColor = (metric: VariantMetric) => {
    if (!metric.comparison) return "text-muted-foreground";
    if (metric.comparison === "saves" || metric.comparison === "better") {
      return "text-green-600 dark:text-green-400";
    }
    if (metric.comparison === "costs more" || metric.comparison === "lower") {
      return "text-orange-600 dark:text-orange-400";
    }
    return "text-muted-foreground";
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data?.comparison?.title || "Itinerary Comparison"}</h1>
            <p className="text-muted-foreground">
              {data?.comparison?.destination} - {data?.comparison?.travelers || 1} traveler(s)
            </p>
          </div>
        </div>

        {isGenerating && (
          <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div>
                  <h3 className="font-semibold">AI is optimizing your itinerary...</h3>
                  <p className="text-sm text-muted-foreground">
                    This usually takes 30-60 seconds. We're analyzing your selections and finding better alternatives.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {hasFailed && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h3 className="text-lg font-semibold mb-2">Generation failed</h3>
              <p className="text-muted-foreground mb-6">
                Something went wrong while optimizing your itinerary. Please try again.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setLocation("/cart")}
                  data-testid="button-back-to-cart"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Cart
                </Button>
                <Button
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  data-testid="button-retry"
                >
                  {retryMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasVariants && !isGenerating && !hasFailed && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No itinerary data found</h3>
              <p className="text-muted-foreground mb-6">
                It looks like the comparison is empty. Please go back to your cart and try again.
              </p>
              <Button
                variant="outline"
                onClick={() => setLocation("/cart")}
                data-testid="button-back-to-cart"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Cart
              </Button>
            </CardContent>
          </Card>
        )}

        {hasVariants && (
          <>
            {destination && (
              <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 dark:border-purple-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                      {travelPulseIntelligenceLoading ? (
                        <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base text-purple-800 dark:text-purple-200">
                        AI-Powered Destination Intelligence
                      </CardTitle>
                      <CardDescription className="text-purple-600 dark:text-purple-400">
                        Real-time insights for {destination} powered by xAI Grok
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {travelPulseIntelligenceLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3 animate-pulse">
                          <div className="h-4 w-20 bg-purple-200/50 dark:bg-purple-800/30 rounded mb-2" />
                          <div className="h-6 w-12 bg-purple-200/50 dark:bg-purple-800/30 rounded" />
                        </div>
                      ))}
                    </div>
                  )}
                  {travelPulseError && !travelPulseLoading && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      Unable to load destination intelligence. Comparison data is still available below.
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {travelPulseData?.city?.pulseScore && (
                      <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="h-4 w-4 text-amber-500" />
                          <span className="text-xs font-medium text-muted-foreground">Pulse Score</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                            {travelPulseData.city.pulseScore}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      </div>
                    )}
                    {travelPulseData?.city?.trendingScore && (
                      <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-xs font-medium text-muted-foreground">Trending</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {travelPulseData.city.trendingScore}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      </div>
                    )}
                    {travelPulseData?.city?.crowdLevel && (
                      <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="h-4 w-4 text-blue-500" />
                          <span className="text-xs font-medium text-muted-foreground">Crowd Level</span>
                        </div>
                        <span className="text-lg font-semibold capitalize text-blue-600 dark:text-blue-400">
                          {travelPulseData.city.crowdLevel}
                        </span>
                      </div>
                    )}
                    {travelPulseData?.city?.aiBudgetEstimate && (
                      <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs font-medium text-muted-foreground">Budget Estimate</span>
                        </div>
                        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 line-clamp-2">
                          {travelPulseData.city.aiBudgetEstimate}
                        </span>
                      </div>
                    )}
                  </div>

                  {(travelPulseData?.city?.aiTravelTips || travelPulseData?.city?.aiLocalInsights) && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {travelPulseData?.city?.aiTravelTips && (
                        <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Travel Tips
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {travelPulseData.city.aiTravelTips}
                          </p>
                        </div>
                      )}
                      {travelPulseData?.city?.aiLocalInsights && (
                        <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Local Insights
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {travelPulseData.city.aiLocalInsights}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {trendingData?.experiences && trendingData.experiences.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Trending Experiences
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {trendingData.experiences.slice(0, 5).map((exp) => (
                          <Badge key={exp.id} variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                            {exp.name}
                            {exp.trendingScore > 80 && <Zap className="h-3 w-3 ml-1 text-amber-500" />}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {travelPulseData?.city?.aiMustSeeAttractions && (
                    <div className="mt-4 bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                        <Star className="h-3 w-3" /> Must-See Attractions
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {travelPulseData.city.aiMustSeeAttractions}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {userVariant && (
                <Card
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedVariantId === userVariant.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedVariantId(userVariant.id)}
                  data-testid={`card-variant-${userVariant.id}`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Your Plan</Badge>
                      {selectedVariantId === userVariant.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <CardTitle className="text-lg">{userVariant.name}</CardTitle>
                    <CardDescription>{userVariant.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Cost</span>
                        <span className="text-xl font-bold">
                          ${parseFloat(userVariant.totalCost || "0").toLocaleString()}
                        </span>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Items ({userVariant.items.length})</h4>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalVariant(userVariant);
                            }}
                            data-testid={`button-view-plan-${userVariant.id}`}
                          >
                            <Maximize2 className="h-3 w-3 mr-1" />
                            View Full Plan
                          </Button>
                        </div>
                        <ScrollArea className="h-32">
                          {userVariant.items.slice(0, 4).map((item, idx) => {
                            const bookingType = getBookingType(item.serviceType);
                            return (
                              <div key={item.id || idx} className="py-2 text-sm border-b last:border-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      Day {item.dayNumber}
                                    </Badge>
                                    <span className="truncate max-w-32">
                                      {item.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {bookingType === "partner" ? (
                                      <Badge className="bg-blue-100 text-blue-700 text-xs shrink-0">
                                        {item.serviceType?.toLowerCase().includes("transport") ? (
                                          <><Train className="h-2.5 w-2.5 mr-1" />12Go</>
                                        ) : (
                                          <><Ticket className="h-2.5 w-2.5 mr-1" />Fever</>
                                        )}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                                        <Check className="h-2.5 w-2.5 mr-1" />In-App
                                      </Badge>
                                    )}
                                    <span className="text-muted-foreground">${parseFloat(item.price || "0")}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {userVariant.items.length > 4 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              +{userVariant.items.length - 4} more activities...
                            </p>
                          )}
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      variant={selectedVariantId === userVariant.id ? "default" : "outline"}
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectMutation.mutate(userVariant.id);
                      }}
                      disabled={selectMutation.isPending}
                      data-testid={`button-select-${userVariant.id}`}
                    >
                      {selectedVariantId === userVariant.id ? "Selected" : "Select This Plan"}
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {aiVariants.map((variant, index) => (
                <Card
                  key={variant.id}
                  className={cn(
                    "cursor-pointer transition-all relative",
                    selectedVariantId === variant.id && "ring-2 ring-primary",
                    index === 0 && "border-green-500/50"
                  )}
                  onClick={() => setSelectedVariantId(variant.id)}
                  data-testid={`card-variant-${variant.id}`}
                >
                  {index === 0 && (
                    <div className="absolute -top-3 left-4">
                      <Badge className="bg-green-600">
                        <Award className="h-3 w-3 mr-1" />
                        Recommended
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pt-6">
                    <div className="flex items-center justify-between">
                      <Badge variant="default" className="bg-primary/10 text-primary">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI Optimized
                      </Badge>
                      {selectedVariantId === variant.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <CardTitle className="text-lg">{variant.name}</CardTitle>
                    <CardDescription>{variant.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Cost</span>
                        <span className="text-xl font-bold text-green-600 dark:text-green-400">
                          ${parseFloat(variant.totalCost || "0").toLocaleString()}
                        </span>
                      </div>

                      {variant.metrics && variant.metrics.length > 0 && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Why it's better</h4>
                            <div className="grid grid-cols-2 gap-2">
                              {variant.metrics.slice(0, 4).map((metric) => {
                                const Icon = getMetricIcon(metric.metricKey);
                                return (
                                  <div key={metric.id} className="flex items-center gap-2">
                                    <Icon className={cn("h-4 w-4", getMetricColor(metric))} />
                                    <span className="text-xs truncate">{metric.description}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      {variant.aiReasoning && (
                        <>
                          <Separator />
                          <p className="text-sm text-muted-foreground italic">"{variant.aiReasoning}"</p>
                        </>
                      )}

                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Items ({variant.items.length})</h4>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalVariant(variant);
                            }}
                            data-testid={`button-view-plan-${variant.id}`}
                          >
                            <Maximize2 className="h-3 w-3 mr-1" />
                            View Full Plan
                          </Button>
                        </div>
                        <ScrollArea className="h-32">
                          {variant.items.slice(0, 4).map((item, idx) => {
                            const bookingType = getBookingType(item.serviceType);
                            return (
                              <div key={item.id || idx} className="py-2 text-sm border-b last:border-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      Day {item.dayNumber}
                                    </Badge>
                                    <span className="truncate max-w-32">
                                      {item.name}
                                    </span>
                                    {item.isReplacement && (
                                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 shrink-0">
                                        New
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {bookingType === "partner" ? (
                                      <Badge className="bg-blue-100 text-blue-700 text-xs shrink-0">
                                        {item.serviceType?.toLowerCase().includes("transport") ? (
                                          <><Train className="h-2.5 w-2.5 mr-1" />12Go</>
                                        ) : (
                                          <><Ticket className="h-2.5 w-2.5 mr-1" />Fever</>
                                        )}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                                        <Check className="h-2.5 w-2.5 mr-1" />In-App
                                      </Badge>
                                    )}
                                    <span className="text-muted-foreground">${parseFloat(item.price || "0")}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {variant.items.length > 4 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              +{variant.items.length - 4} more activities...
                            </p>
                          )}
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant={selectedVariantId === variant.id ? "default" : "outline"}
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectMutation.mutate(variant.id);
                      }}
                      disabled={selectMutation.isPending}
                      data-testid={`button-select-${variant.id}`}
                    >
                      {selectedVariantId === variant.id ? "Selected" : "Select This Plan"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>

            {data?.comparison?.selectedVariantId && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Check className="h-8 w-8 text-primary" />
                      <div>
                        <h3 className="font-semibold">Plan Selected</h3>
                        <p className="text-sm text-muted-foreground">
                          Ready to proceed with your{" "}
                          {data.variants.find((v) => v.id === data.comparison.selectedVariantId)?.name || "selected"}{" "}
                          plan
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => applyToCartMutation.mutate()}
                      disabled={applyToCartMutation.isPending}
                      data-testid="button-apply-to-cart"
                    >
                      {applyToCartMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="mr-2 h-4 w-4" />
                      )}
                      Apply to Cart & Checkout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mt-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                    <Users className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                      Let an Expert Book Everything
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                      Our travel experts can handle all bookings for your selected plan - hotels, activities, 
                      ground transport, and event tickets. They'll coordinate everything and confirm details with you.
                    </p>
                    <Button 
                      variant="outline"
                      className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/50"
                      onClick={() => setShowExpertDialog(true)}
                      data-testid="button-expert-booking"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Request Expert Booking
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

          </>
        )}

        {/* Full-Page Itinerary Modal */}
        <Dialog open={!!modalVariant} onOpenChange={() => setModalVariant(null)}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    {modalVariant?.source === "ai" && (
                      <Badge variant="default" className="bg-primary/10 text-primary">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI Optimized
                      </Badge>
                    )}
                    {modalVariant?.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {modalVariant?.description}
                  </DialogDescription>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ${parseFloat(modalVariant?.totalCost || "0").toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {modalVariant?.items?.length} activities
                  </p>
                </div>
              </div>
            </DialogHeader>
            
            <ScrollArea className="flex-1 px-6">
              <div className="py-4 space-y-6">
                {/* Group items by day */}
                {modalVariant && (() => {
                  const dayGroups = modalVariant.items.reduce((acc, item) => {
                    const day = item.dayNumber;
                    if (!acc[day]) acc[day] = [];
                    acc[day].push(item);
                    return acc;
                  }, {} as Record<number, VariantItem[]>);
                  
                  const sortedDays = Object.keys(dayGroups)
                    .map(Number)
                    .sort((a, b) => a - b);
                  
                  return sortedDays.map((dayNum) => (
                    <div key={dayNum} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm font-semibold">
                          <Calendar className="h-3.5 w-3.5 mr-1" />
                          Day {dayNum}
                        </Badge>
                        <Separator className="flex-1" />
                      </div>
                      
                      <div className="space-y-3 pl-4">
                        {dayGroups[dayNum]
                          .sort((a, b) => (a.startTime || a.timeSlot || "").localeCompare(b.startTime || b.timeSlot || ""))
                          .map((item, idx) => {
                            const bookingType = getBookingType(item.serviceType);
                            const partnerUrl = getPartnerUrl(item);
                            return (
                              <div 
                                key={item.id || idx} 
                                className="bg-muted/30 rounded-lg p-4 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-medium">{item.name}</h4>
                                      {item.isReplacement && (
                                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                                          New
                                        </Badge>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="text-sm text-muted-foreground">{item.description}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="font-semibold">${parseFloat(item.price || "0")}</span>
                                    {bookingType === "partner" ? (
                                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                                        {item.serviceType?.toLowerCase().includes("transport") ? (
                                          <><Train className="h-2.5 w-2.5 mr-1" />12Go</>
                                        ) : (
                                          <><Ticket className="h-2.5 w-2.5 mr-1" />Fever</>
                                        )}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-700 text-xs">
                                        <Check className="h-2.5 w-2.5 mr-1" />Book on Traveloure
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    {item.startTime} - {item.endTime}
                                  </span>
                                  {item.duration > 0 && (
                                    <span>({item.duration} mins)</span>
                                  )}
                                  {item.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3.5 w-3.5" />
                                      {item.location}
                                    </span>
                                  )}
                                  {item.rating && (
                                    <span className="flex items-center gap-1">
                                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                      {item.rating}
                                    </span>
                                  )}
                                </div>
                                
                                {item.replacementReason && (
                                  <p className="text-sm text-green-600 dark:text-green-400 italic">
                                    {item.replacementReason}
                                  </p>
                                )}
                                
                                {partnerUrl && (
                                  <a 
                                    href={partnerUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                  >
                                    Book on Partner Site <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ));
                })()}
                
                {/* AI Reasoning */}
                {modalVariant?.aiReasoning && (
                  <div className="bg-primary/5 rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Recommendation
                    </h4>
                    <p className="text-sm text-muted-foreground italic">
                      "{modalVariant.aiReasoning}"
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setModalVariant(null)}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  if (modalVariant) {
                    selectMutation.mutate(modalVariant.id);
                    setModalVariant(null);
                  }
                }}
                disabled={selectMutation.isPending}
              >
                {selectedVariantId === modalVariant?.id ? "Selected" : "Select This Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-600" />
                Request Expert Booking Assistance
              </DialogTitle>
              <DialogDescription>
                Let our travel experts handle all bookings for your itinerary. They'll coordinate 
                both on-site and partner bookings, ensuring everything is confirmed before your trip.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4">
                <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">What's included:</h4>
                <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                  <li className="flex items-center gap-2"><Check className="h-3 w-3" />All hotel and accommodation bookings</li>
                  <li className="flex items-center gap-2"><Check className="h-3 w-3" />Tour and activity reservations</li>
                  <li className="flex items-center gap-2"><Check className="h-3 w-3" />Ground transportation (trains, buses, ferries via 12Go)</li>
                  <li className="flex items-center gap-2"><Check className="h-3 w-3" />Event and show tickets (via Fever)</li>
                  <li className="flex items-center gap-2"><Check className="h-3 w-3" />Restaurant reservations</li>
                </ul>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Special requests or notes (optional)</label>
                <Textarea
                  value={expertNotes}
                  onChange={(e) => setExpertNotes(e.target.value)}
                  placeholder="Any specific preferences, dietary requirements, or special requests..."
                  className="min-h-20"
                  data-testid="input-expert-notes"
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                An expert will contact you within 24 hours to confirm details and payment.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExpertDialog(false)}>Cancel</Button>
              <Button 
                onClick={handleExpertBookingRequest}
                disabled={expertBookingMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-confirm-expert-booking"
              >
                {expertBookingMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <><Users className="mr-2 h-4 w-4" />Submit Request</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
