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
  RefreshCw,
  ShoppingCart,
  ChevronRight,
  Calendar,
  Loader2,
  Award,
  Target,
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

  const generateMutation = useMutation({
    mutationFn: async () => {
      let baselineItems: any[] = [];
      const storedBaseline = sessionStorage.getItem(`comparison_baseline_${id}`);
      if (storedBaseline) {
        try {
          baselineItems = JSON.parse(storedBaseline);
        } catch (e) {
          console.error("Failed to parse baseline items");
        }
      }
      return apiRequest("POST", `/api/itinerary-comparisons/${id}/generate`, { baselineItems });
    },
    onSuccess: () => {
      toast({ title: "Generating alternatives", description: "AI is creating optimized versions of your itinerary..." });
      refetch();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to generate", description: "Please try again" });
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
          <Button variant="ghost" size="icon" onClick={() => setLocation("/cart")} data-testid="button-back">
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

        {!hasVariants && !isGenerating && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Ready to optimize your itinerary?</h3>
              <p className="text-muted-foreground mb-6">
                Our AI will analyze your selections and generate 2 optimized alternatives with detailed comparisons.
              </p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-alternatives"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Optimized Alternatives
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {hasVariants && (
          <>
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
                        <h4 className="text-sm font-medium">Items ({userVariant.items.length})</h4>
                        <ScrollArea className="h-40">
                          {userVariant.items.map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center justify-between py-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  Day {item.dayNumber}
                                </Badge>
                                <span className="truncate max-w-32">{item.name}</span>
                              </div>
                              <span className="text-muted-foreground">${parseFloat(item.price || "0")}</span>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
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
                      <Badge className="bg-green-600 hover:bg-green-700">
                        <Award className="h-3 w-3 mr-1" />
                        Recommended
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pt-6">
                    <div className="flex items-center justify-between">
                      <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">
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
                        <h4 className="text-sm font-medium">Items ({variant.items.length})</h4>
                        <ScrollArea className="h-32">
                          {variant.items.map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center justify-between py-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  Day {item.dayNumber}
                                </Badge>
                                <span className="truncate max-w-32">{item.name}</span>
                                {item.isReplacement && (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                    New
                                  </Badge>
                                )}
                              </div>
                              <span className="text-muted-foreground">${parseFloat(item.price || "0")}</span>
                            </div>
                          ))}
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

            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || isGenerating}
                data-testid="button-regenerate"
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", isGenerating && "animate-spin")} />
                Regenerate Alternatives
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
