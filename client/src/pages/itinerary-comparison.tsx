import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { BookThisTripButton } from '@/components/ItineraryComparisonWithBooking';
import { VariantOptionsMenu } from '@/components/booking/VariantActionButtons';
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
  ChevronDown,
  ChevronUp,
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
  Scale,
  Heart,
  Gauge,
  Palette,
  ListOrdered,
  Coffee,
  Share2,
  UserCheck,
  Copy,
  Car,
  Bus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TransportLeg, type TransportLegData, type TransportAlternative } from "@/components/itinerary/TransportLeg";

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

interface ExpertOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
  specialization?: string;
}

interface TransportLegApiResponse {
  id: string;
  legOrder: number | null;
  fromName: string | null;
  toName: string | null;
  recommendedMode: string | null;
  userSelectedMode: string | null;
  distanceDisplay: string | null;
  distanceMeters: number | null;
  estimatedDurationMinutes: number | null;
  estimatedCostUsd: string | number | null;
  energyCost: number | null;
  alternativeModes: TransportAlternative[] | null;
  linkedProductUrl: string | null;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
}

function VariantTransportLegs({ variantId }: { variantId: string }) {
  const [open, setOpen] = useState(false);

  const { data: legs, isLoading } = useQuery<TransportLegData[]>({
    queryKey: ["/api/itinerary-variants", variantId, "transport-legs"],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary-variants/${variantId}/transport-legs`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const raw: TransportLegApiResponse[] = await res.json();
      return raw.map((l): TransportLegData => ({
        id: l.id,
        legOrder: l.legOrder ?? 0,
        fromName: l.fromName ?? "",
        toName: l.toName ?? "",
        recommendedMode: l.recommendedMode ?? "rideshare",
        userSelectedMode: l.userSelectedMode ?? null,
        distanceDisplay: l.distanceDisplay ?? "",
        distanceMeters: l.distanceMeters ?? undefined,
        estimatedDurationMinutes: l.estimatedDurationMinutes ?? 0,
        estimatedCostUsd: l.estimatedCostUsd != null ? parseFloat(String(l.estimatedCostUsd)) : null,
        energyCost: l.energyCost ?? undefined,
        alternativeModes: l.alternativeModes ?? [],
        linkedProductUrl: l.linkedProductUrl ?? null,
        fromLat: l.fromLat ?? null,
        fromLng: l.fromLng ?? null,
        toLat: l.toLat ?? null,
        toLng: l.toLng ?? null,
      }));
    },
    enabled: open,
    retry: false,
    staleTime: 120_000,
  });

  return (
    <div className="space-y-2">
      <button
        className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        data-testid={`button-transport-legs-toggle-${variantId}`}
      >
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-muted-foreground" />
          <span>Transport Legs</span>
          {open && legs && legs.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {legs.length}
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="pt-1">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : legs && legs.length > 0 ? (
            <div className="rounded-md border divide-y divide-border">
              {legs.map(leg => (
                <TransportLeg
                  key={leg.id}
                  leg={leg}
                  readOnly={false}
                  className="py-1.5"
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-3 px-3 text-sm text-muted-foreground rounded-md bg-muted/20 border border-dashed">
              <Bus className="h-4 w-4 shrink-0 opacity-60" />
              <span>No transport legs yet. They are calculated when an AI itinerary is generated from the Transportation tab.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShareVariantButton({ variantId }: { variantId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expertDialogOpen, setExpertDialogOpen] = useState(false);
  const [expertShareUrl, setExpertShareUrl] = useState<string | null>(null);
  const [selectedExpert, setSelectedExpert] = useState<ExpertOption | null>(null);
  const [expertStep, setExpertStep] = useState<"select" | "share">("select");

  const { data: expertsData } = useQuery<any[]>({
    queryKey: ["/api/experts"],
    enabled: expertDialogOpen,
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/itinerary-variants/${variantId}/share`, { permissions: "view" });
      return res as { shareToken: string; shareUrl: string; expiresAt: string };
    },
    onSuccess: (data) => {
      setShareUrl(data.shareUrl);
      navigator.clipboard?.writeText(data.shareUrl).catch(() => {});
      toast({ title: "Share link copied!", description: "Anyone with this link can view this itinerary." });
    },
    onError: () => {
      toast({ title: "Could not create share link", variant: "destructive" });
    },
  });

  const expertShareMutation = useMutation({
    mutationFn: async (expertId?: string) => {
      const res = await apiRequest("POST", `/api/itinerary-variants/${variantId}/share`, {
        permissions: "suggest",
        sharedWithUserId: expertId || null,
      });
      return res as { shareToken: string; shareUrl: string; expiresAt: string };
    },
    onSuccess: (data) => {
      setExpertShareUrl(data.shareUrl);
      setExpertStep("share");
    },
    onError: () => {
      toast({ title: "Could not create expert link", variant: "destructive" });
    },
  });

  const handleExpertOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpertDialogOpen(true);
    setExpertStep("select");
    setExpertShareUrl(null);
    setSelectedExpert(null);
  };

  const handleSelectExpert = (expert: ExpertOption) => {
    setSelectedExpert(expert);
    expertShareMutation.mutate(expert.id);
  };

  const handleSkipExpertSelection = () => {
    expertShareMutation.mutate(undefined);
  };

  const experts: ExpertOption[] = (expertsData || []).slice(0, 6).map((e: any) => ({
    id: e.userId || e.id,
    name: [e.user?.firstName, e.user?.lastName].filter(Boolean).join(" ") || e.user?.email || "Expert",
    avatarUrl: e.user?.profileImageUrl,
    specialization: e.expertForm?.specialization || e.experienceTypes?.[0]?.experienceType?.name,
  }));

  return (
    <>
      <div className="flex gap-1 w-full">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); shareMutation.mutate(); }}
          disabled={shareMutation.isPending}
          className="flex-1 gap-2 text-muted-foreground hover:text-foreground"
          data-testid={`button-share-variant-${variantId}`}
        >
          {shareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          {shareUrl ? "Copied!" : "Share"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExpertOpen}
          className="flex-1 gap-2 text-muted-foreground hover:text-foreground"
          data-testid={`button-send-expert-${variantId}`}
        >
          <UserCheck className="h-4 w-4" />
          Send to Expert
        </Button>
      </div>

      <Dialog open={expertDialogOpen} onOpenChange={setExpertDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send to a Local Expert</DialogTitle>
            <DialogDescription>
              Select a local expert to send this itinerary to, or skip to get a shareable link.
            </DialogDescription>
          </DialogHeader>

          {expertStep === "select" && (
            <div className="space-y-3 py-2">
              {experts.length > 0 ? (
                <div className="space-y-2">
                  {experts.map(expert => (
                    <button
                      key={expert.id}
                      onClick={() => handleSelectExpert(expert)}
                      disabled={expertShareMutation.isPending}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                      data-testid={`expert-option-${expert.id}`}
                    >
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {expert.avatarUrl ? (
                          <img src={expert.avatarUrl} alt={expert.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{expert.name}</p>
                        {expert.specialization && (
                          <p className="text-xs text-muted-foreground truncate">{expert.specialization}</p>
                        )}
                      </div>
                      {expertShareMutation.isPending && selectedExpert?.id === expert.id && (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">No local experts found. Browse experts on the platform.</p>
                  <Button size="sm" variant="outline" onClick={() => { setExpertDialogOpen(false); navigate("/discover"); }}>
                    Find Local Experts
                  </Button>
                </div>
              )}
              <div className="pt-2 border-t">
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleSkipExpertSelection} disabled={expertShareMutation.isPending}>
                  {expertShareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Skip — just generate a link
                </Button>
              </div>
            </div>
          )}

          {expertStep === "share" && expertShareUrl && (
            <div className="space-y-3 py-2">
              {selectedExpert && (
                <p className="text-sm text-muted-foreground">
                  A notification has been sent to <strong>{selectedExpert.name}</strong>. Share this link with them directly for their reference:
                </p>
              )}
              {!selectedExpert && (
                <p className="text-sm text-muted-foreground">Copy this link and send it to any local expert or service provider:</p>
              )}
              <div className="flex gap-2">
                <Input value={expertShareUrl} readOnly className="text-xs font-mono" data-testid="input-expert-share-url" />
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(expertShareUrl).catch(() => {});
                    toast({ title: "Link copied!", description: "Share this with your local expert." });
                  }}
                  data-testid="button-copy-expert-url"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">The expert can review the itinerary, swap transport modes, and submit suggestions. You'll receive a notification with their feedback.</p>
            </div>
          )}

          <DialogFooter>
            {expertStep === "share" && (
              <Button variant="outline" size="sm" onClick={() => setExpertStep("select")}>Back</Button>
            )}
            <Button variant="outline" onClick={() => setExpertDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ItineraryComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id || 'guest';
  const userEmail = user?.email || undefined;
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
  const isMultiCity = destination?.includes(";") || destination?.includes(",") && destination?.split(",").length > 2;
  
  // For multi-city trips, extract just the first city for TravelPulse lookup
  const primaryCity = isMultiCity 
    ? destination?.split(";")[0]?.trim()?.split(",")[0]?.trim() 
    : destination?.split(",")[0]?.trim();
  
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
    queryKey: ["/api/travelpulse/cities", primaryCity],
    enabled: !!primaryCity,
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
    queryKey: ["/api/travelpulse/trending", primaryCity],
    enabled: !!primaryCity,
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
      case "balance_score":
        return Scale;
      case "wellness_score":
        return Heart;
      case "pace_score":
        return Gauge;
      case "diversity_score":
        return Palette;
      case "sequencing_score":
        return ListOrdered;
      case "relaxation_minutes":
        return Coffee;
      case "methodology_summary":
        return Sparkles;
      default:
        return Zap;
    }
  };

  const getMetricColor = (metric: VariantMetric) => {
    // Score-based metrics (higher is better)
    const scoreMetrics = ["balance_score", "wellness_score", "pace_score", "diversity_score", "sequencing_score", "optimization_score"];
    if (scoreMetrics.includes(metric.metricKey)) {
      const value = parseFloat(metric.value) || 0;
      if (value >= 80) return "text-green-600 dark:text-green-400";
      if (value >= 60) return "text-yellow-600 dark:text-yellow-400";
      return "text-orange-600 dark:text-orange-400";
    }
    
    // Comparison-based metrics
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

        {isGenerating && !hasVariants && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Your Plan skeleton */}
            <Card className="border-dashed">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-6 w-32 mt-2" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Building your plan...</span>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>

            {/* AI Optimized skeleton cards */}
            {[1, 2].map((i) => (
              <Card key={i} className={cn("border-dashed relative", i === 1 && "border-green-500/30")}>
                {i === 1 && (
                  <div className="absolute -top-3 left-4">
                    <Badge className="bg-green-600/50">
                      <Award className="h-3 w-3 mr-1" />
                      Recommended
                    </Badge>
                  </div>
                )}
                <CardHeader className="pt-6">
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="bg-primary/10 text-primary/50">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Optimized
                    </Badge>
                  </div>
                  <Skeleton className="h-6 w-40 mt-2" />
                  <Skeleton className="h-4 w-56 mt-1" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <Separator />
                    <div className="flex flex-col items-center justify-center gap-3 py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">
                        {i === 1 ? "Finding best alternatives..." : "Optimizing for savings..."}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
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
              <Card className="mb-4 border-purple-200/50 bg-gradient-to-r from-purple-50/80 to-indigo-50/80 dark:from-purple-950/10 dark:to-indigo-950/10 dark:border-purple-800/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                      {travelPulseIntelligenceLoading ? (
                        <Loader2 className="h-3 w-3 text-purple-600 dark:text-purple-400 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                      Destination Intelligence
                    </span>
                    <span className="text-xs text-purple-600/70 dark:text-purple-400/70">
                      {isMultiCity ? `${primaryCity} + more` : destination}
                    </span>
                    {isMultiCity && (
                      <Badge variant="outline" className="text-[10px] h-4 ml-1 border-purple-200 text-purple-600 dark:border-purple-700 dark:text-purple-400">
                        Multi-city
                      </Badge>
                    )}
                    {travelPulseError && !travelPulseLoading && !travelPulseData?.city && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {isMultiCity ? "Per-city data varies" : "Intel pending"}
                      </span>
                    )}
                  </div>
                  {travelPulseIntelligenceLoading && (
                    <div className="flex gap-3 mt-2 overflow-x-auto">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/60 dark:bg-gray-900/40 rounded px-2 py-1 animate-pulse shrink-0">
                          <div className="h-3 w-12 bg-purple-200/50 dark:bg-purple-800/30 rounded" />
                        </div>
                      ))}
                    </div>
                  )}
                  {travelPulseData?.city && (
                    <div className="mt-3 pt-3 border-t border-purple-200/50 dark:border-purple-800/50">
                      <div className="flex flex-wrap gap-3 text-xs">
                        {travelPulseData.city.pulseScore && (
                          <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3 text-amber-500" />
                            <span className="text-muted-foreground">Pulse:</span>
                            <span className="font-medium text-purple-700 dark:text-purple-300">{travelPulseData.city.pulseScore}/100</span>
                          </div>
                        )}
                        {travelPulseData.city.trendingScore && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-green-500" />
                            <span className="text-muted-foreground">Trending:</span>
                            <span className="font-medium text-green-600 dark:text-green-400">{travelPulseData.city.trendingScore}/100</span>
                          </div>
                        )}
                        {travelPulseData.city.crowdLevel && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-blue-500" />
                            <span className="text-muted-foreground">Crowds:</span>
                            <span className="font-medium capitalize text-blue-600 dark:text-blue-400">{travelPulseData.city.crowdLevel}</span>
                          </div>
                        )}
                        {travelPulseData.city.aiBudgetEstimate && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-emerald-500" />
                            <span className="font-medium text-emerald-600 dark:text-emerald-400 truncate max-w-32">
                              {typeof travelPulseData.city.aiBudgetEstimate === 'string' 
                                ? travelPulseData.city.aiBudgetEstimate 
                                : (travelPulseData.city.aiBudgetEstimate as any)?.midRange || 'Budget varies'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Skeleton for user variant if still loading */}
              {isGenerating && !userVariant && (
                <Card className="border-dashed opacity-80">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-6 w-32 mt-2" />
                    <Skeleton className="h-4 w-48 mt-1" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-center gap-3 py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Building your plan...</span>
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-9 w-full" />
                  </CardFooter>
                </Card>
              )}

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
                      <div className="flex items-center gap-1">
                        {selectedVariantId === userVariant.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                        <VariantOptionsMenu
                          variant={userVariant}
                          comparison={data.comparison}
                          userId={userId}
                        />
                      </div>
                    </div>
                    <CardTitle className="text-lg">{userVariant.name}</CardTitle>
                    <CardDescription>{userVariant.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total Cost</span>
                          <span className="text-xl font-bold">
                            ${parseFloat(userVariant.totalCost || "0").toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {data.comparison.travelers || 1} traveler{(data.comparison.travelers || 1) > 1 ? 's' : ''}
                          </span>
                          <span>
                            ${(parseFloat(userVariant.totalCost || "0") / (data.comparison.travelers || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/person
                          </span>
                        </div>
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
                        <ScrollArea className="h-48">
                          {userVariant.items.slice(0, 6).map((item, idx) => {
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
                          {userVariant.items.length > 6 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              +{userVariant.items.length - 6} more activities...
                            </p>
                          )}
                        </ScrollArea>
                      </div>

                      <Separator />
                      <VariantTransportLegs variantId={userVariant.id} />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                    <BookThisTripButton
                      variant={userVariant}
                      comparison={data.comparison}
                      userId={userId}
                      userEmail={userEmail}
                    />
                    <ShareVariantButton variantId={userVariant.id} />
                  </CardFooter>
                </Card>
              )}

              {/* Show skeleton placeholders for pending AI variants */}
              {isGenerating && aiVariants.length < 2 && (
                <>
                  {Array.from({ length: 2 - aiVariants.length }).map((_, idx) => (
                    <Card key={`skeleton-ai-${idx}`} className="border-dashed opacity-80">
                      <CardHeader className="pt-6">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-24" />
                        </div>
                        <Skeleton className="h-6 w-40 mt-2" />
                        <Skeleton className="h-4 w-56 mt-1" />
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-6 w-16" />
                          </div>
                          <Separator />
                          <div className="flex items-center justify-center gap-3 py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">
                              {idx === 0 ? "Finding best alternatives..." : "Optimizing for savings..."}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Skeleton className="h-9 w-full" />
                      </CardFooter>
                    </Card>
                  ))}
                </>
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
                      <div className="flex items-center gap-1">
                        {selectedVariantId === variant.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                        <VariantOptionsMenu
                          variant={variant}
                          comparison={data.comparison}
                          userId={userId}
                        />
                      </div>
                    </div>
                    <CardTitle className="text-lg">{variant.name}</CardTitle>
                    <CardDescription>{variant.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total Cost</span>
                          <span className="text-xl font-bold text-green-600 dark:text-green-400">
                            ${parseFloat(variant.totalCost || "0").toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {data.comparison.travelers || 1} traveler{(data.comparison.travelers || 1) > 1 ? 's' : ''}
                          </span>
                          <span>
                            ${(parseFloat(variant.totalCost || "0") / (data.comparison.travelers || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/person
                          </span>
                        </div>
                      </div>

                      {variant.metrics && variant.metrics.length > 0 && (() => {
                        // Prioritize showing key comparison metrics
                        const priorityOrder = ["total_cost", "average_rating", "relaxation_minutes", "travel_time"];
                        const sequencingScores = ["balance_score", "wellness_score", "pace_score", "sequencing_score"];
                        
                        // Get priority metrics first, then fill with others
                        const sortedMetrics = [...variant.metrics].sort((a, b) => {
                          const aIdx = priorityOrder.indexOf(a.metricKey);
                          const bIdx = priorityOrder.indexOf(b.metricKey);
                          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                          if (aIdx !== -1) return -1;
                          if (bIdx !== -1) return 1;
                          return 0;
                        });
                        
                        // Get sequencing scores for the compact score display
                        const scores = variant.metrics.filter(m => sequencingScores.includes(m.metricKey));
                        const avgScore = scores.length > 0 
                          ? Math.round(scores.reduce((sum, m) => sum + (parseFloat(m.value) || 0), 0) / scores.length)
                          : null;
                        
                        return (
                          <>
                            <Separator />
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Why it's better</h4>
                                {avgScore !== null && (
                                  <Badge 
                                    variant="outline" 
                                    className={cn(
                                      "text-xs",
                                      avgScore >= 80 ? "border-green-500 text-green-600 dark:text-green-400" :
                                      avgScore >= 60 ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" :
                                      "border-orange-500 text-orange-600 dark:text-orange-400"
                                    )}
                                    data-testid={`badge-traveloure-score-${variant.id}`}
                                  >
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    {avgScore} Traveloure Score
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {sortedMetrics.slice(0, 4).map((metric) => {
                                  const Icon = getMetricIcon(metric.metricKey);
                                  return (
                                    <div key={metric.id} className="flex items-center gap-2" data-testid={`card-metric-${metric.metricKey}`}>
                                      <Icon className={cn("h-4 w-4", getMetricColor(metric))} />
                                      <span className="text-xs truncate">{metric.description}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}

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
                        <ScrollArea className="h-48">
                          {variant.items.slice(0, 6).map((item, idx) => {
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
                          {variant.items.length > 6 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              +{variant.items.length - 6} more activities...
                            </p>
                          )}
                        </ScrollArea>
                      </div>

                      <Separator />
                      <VariantTransportLegs variantId={variant.id} />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                    <BookThisTripButton
                      variant={variant}
                      comparison={data.comparison}
                      userId={userId}
                      userEmail={userEmail}
                    />
                    <ShareVariantButton variantId={variant.id} />
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
                    ${(parseFloat(modalVariant?.totalCost || "0") / (data?.comparison?.travelers || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/person
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {modalVariant?.items?.length} activities
                  </p>
                </div>
              </div>
            </DialogHeader>
            
            <ScrollArea className="flex-1 px-6">
              <div className="py-4 space-y-6">
                {/* Why it's better - Metrics */}
                {modalVariant?.metrics && modalVariant.metrics.length > 0 && (() => {
                  // Separate core metrics from smart sequencing metrics
                  const coreMetricKeys = ["total_cost", "average_rating", "travel_time", "free_time"];
                  const sequencingMetricKeys = ["balance_score", "wellness_score", "pace_score", "diversity_score", "sequencing_score", "relaxation_minutes", "methodology_summary"];
                  
                  const coreMetrics = modalVariant.metrics.filter(m => coreMetricKeys.includes(m.metricKey));
                  const sequencingMetrics = modalVariant.metrics.filter(m => sequencingMetricKeys.includes(m.metricKey));
                  const otherMetrics = modalVariant.metrics.filter(m => !coreMetricKeys.includes(m.metricKey) && !sequencingMetricKeys.includes(m.metricKey));
                  
                  return (
                    <div className="space-y-4">
                      {/* Core Metrics */}
                      {coreMetrics.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 space-y-3">
                          <h4 className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Why it's better
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            {coreMetrics.map((metric) => {
                              const Icon = getMetricIcon(metric.metricKey);
                              return (
                                <div key={metric.id} className="flex items-center gap-2" data-testid={`metric-${metric.metricKey}`}>
                                  <Icon className={cn("h-4 w-4 shrink-0", getMetricColor(metric))} />
                                  <span className="text-sm">{metric.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Smart Sequencing Metrics */}
                      {sequencingMetrics.length > 0 && (
                        <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-4 space-y-3">
                          <h4 className="font-medium text-purple-800 dark:text-purple-200 flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Smart Sequencing
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            {sequencingMetrics.map((metric) => {
                              const Icon = getMetricIcon(metric.metricKey);
                              const scoreValue = parseFloat(metric.value) || 0;
                              const isScoreMetric = ["balance_score", "wellness_score", "pace_score", "diversity_score", "sequencing_score"].includes(metric.metricKey);
                              return (
                                <div key={metric.id} className="flex items-center gap-2" data-testid={`metric-${metric.metricKey}`}>
                                  <Icon className={cn("h-4 w-4 shrink-0", getMetricColor(metric))} />
                                  <div className="flex-1 min-w-0">
                                    {isScoreMetric ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{Math.round(scoreValue)}</span>
                                        <span className="text-xs text-muted-foreground truncate">{metric.description}</span>
                                      </div>
                                    ) : (
                                      <span className="text-sm truncate">{metric.description}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Other Metrics */}
                      {otherMetrics.length > 0 && (
                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {otherMetrics.map((metric) => {
                              const Icon = getMetricIcon(metric.metricKey);
                              return (
                                <div key={metric.id} className="flex items-center gap-2" data-testid={`metric-${metric.metricKey}`}>
                                  <Icon className={cn("h-4 w-4 shrink-0", getMetricColor(metric))} />
                                  <span className="text-sm">{metric.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* AI Reasoning */}
                {modalVariant?.aiReasoning && (
                  <div className="bg-primary/5 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground italic">
                      "{modalVariant.aiReasoning}"
                    </p>
                  </div>
                )}

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
              </div>
            </ScrollArea>
            
            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setModalVariant(null)}>
                Close
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
