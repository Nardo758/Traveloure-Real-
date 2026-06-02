import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  MapPin,
  Star,
  Clock,
  ExternalLink,
  Plus,
  ShoppingCart,
  Loader2,
  Sparkles,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";

interface CuratedItem {
  id: string;
  sourceId: string;
  type: "affiliate" | "curated";
  contentCategory: string;
  title: string;
  description: string;
  cover_image: string | null;
  price: string | null;
  price_display: string | null;
  affiliate_url: string | null;
  source: string;
  rating: number | null;
  city: string | null;
  country: string | null;
  duration: string | null;
  highlights: string[];
  metadata: Record<string, any>;
  tracking: {
    productId: string | null;
    partnerId: string | null;
    isAffiliateTracked: boolean;
  };
}

interface CuratedContentResponse {
  items: CuratedItem[];
  total: number;
}

interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface CuratedContentSectionProps {
  destination: string;
  tab?: string;
  className?: string;
  label?: string;
}

function AddToTripDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CuratedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    enabled: open,
  });

  const addItemMutation = useMutation({
    mutationFn: async (tripId: string) => {
      if (!item) return;
      return apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: item.title,
        description: item.description || "",
        itemType: item.contentCategory || "experience",
        dayNumber: 1,
        status: "planned",
        estimatedCost: item.price || null,
        currency: "USD",
        notes: `Source: ${item.source}${item.affiliate_url ? ` | Booking: ${item.affiliate_url}` : ""}`,
        sourceUrl: item.affiliate_url || null,
      });
    },
    onSuccess: (_, tripId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary-items"] });
      toast({
        title: "Added to trip",
        description: `"${item?.title}" has been added to your itinerary.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to add",
        description: "Could not add this item to your trip. Please try again.",
        variant: "destructive",
      });
    },
  });

  const activeTripStatuses = ["planning", "draft", "confirmed"];
  const activeTrips = trips?.filter(t => activeTripStatuses.includes(t.status)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-to-trip">
        <DialogHeader>
          <DialogTitle>Add to a Trip</DialogTitle>
          <DialogDescription>
            Choose which trip to add "{item?.title}" to.
          </DialogDescription>
        </DialogHeader>
        {tripsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : activeTrips.length === 0 ? (
          <div className="text-center py-8">
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No active trips found.</p>
            <p className="text-xs text-muted-foreground mt-1">Create a trip first to add items.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {activeTrips.map(trip => (
              <button
                key={trip.id}
                className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => addItemMutation.mutate(trip.id)}
                disabled={addItemMutation.isPending}
                data-testid={`button-select-trip-${trip.id}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{trip.title || "Untitled Trip"}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {trip.destination}
                    </p>
                  </div>
                  {addItemMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CuratedCard({
  item,
  onAddToTrip,
}: {
  item: CuratedItem;
  onAddToTrip: (item: CuratedItem) => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isAffiliate = !!item.affiliate_url;

  const trackClickMutation = useMutation({
    mutationFn: async () => {
      if (!isAffiliate) return;
      // Use only validated FK-backed identifiers from the API response.
      // affiliate_products items supply productId (FK → affiliate_products.id).
      // content_registry items supply partnerId from metadata (FK → affiliate_partners.id)
      // only when present; otherwise isAffiliateTracked=false and we skip the API call.
      if (!item.tracking?.isAffiliateTracked) return;
      const trackPayload: Record<string, any> = { initiatedBy: "user" };
      if (item.tracking.productId) trackPayload.productId = item.tracking.productId;
      if (item.tracking.partnerId) trackPayload.partnerId = item.tracking.partnerId;
      try {
        await apiRequest("POST", "/api/affiliate/track-click", trackPayload);
      } catch {
        // Non-blocking — proceed even if tracking fails
      }
    },
  });

  const handleBookViaTraveloure = async () => {
    toast({
      title: "Opening booking page…",
      description: "You're being redirected to our partner's site to complete your booking.",
      duration: 3000,
    });
    await trackClickMutation.mutateAsync().catch(() => {});
    if (item.affiliate_url) {
      window.open(item.affiliate_url, "_blank", "noopener,noreferrer");
    }
  };

  const stripeCheckoutMutation = useMutation({
    mutationFn: async () => {
      // Only send itemId + itemType — price/title/currency resolved server-side
      const res = await apiRequest("POST", "/api/content/checkout", {
        itemId: item.sourceId,
        itemType: item.type,
      });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Checkout unavailable", description: "Could not open checkout. Try Add to Trip instead.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({
        title: "Checkout failed",
        description: "Unable to start checkout. Please sign in or try again.",
        variant: "destructive",
      });
    },
  });

  const handleBookNow = () => {
    if (isAffiliate) {
      handleBookViaTraveloure();
    } else if (item.price && parseFloat(item.price) > 0) {
      // Non-affiliate curated items with a price → Stripe Checkout Session
      stripeCheckoutMutation.mutate();
    } else {
      // No price available → navigate to experience planner with destination
      const dest = item.city || item.country || "";
      const planUrl = `/experiences/travel/new${dest ? `?destination=${encodeURIComponent(dest)}` : ""}`;
      toast({
        title: "Opening trip planner…",
        description: `Plan your trip to ${dest || "this destination"}.`,
        duration: 2500,
      });
      navigate(planUrl);
    }
  };

  const fallbackImage = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <Card className="overflow-hidden h-full flex flex-col hover:shadow-md transition-shadow" data-testid={`card-curated-${item.id}`}>
        <div className="relative h-44 overflow-hidden flex-shrink-0">
          <img
            src={item.cover_image || fallbackImage}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).src = fallbackImage; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
            <Badge className="bg-[#FF385C] text-white border-0 text-[10px] px-2 py-0.5">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              Curated
            </Badge>
            {isAffiliate && (
              <Badge className="bg-white/90 text-gray-700 border-0 text-[10px] px-2 py-0.5">
                via Partner
              </Badge>
            )}
          </div>
          {item.rating && (
            <div className="absolute top-2 right-2 bg-white/90 rounded-md px-1.5 py-0.5 flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-semibold text-gray-800">{item.rating.toFixed(1)}</span>
            </div>
          )}
          {(item.city || item.country) && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs">
              <MapPin className="w-3 h-3" />
              <span>{item.city || item.country}</span>
            </div>
          )}
        </div>

        <CardContent className="p-3 flex flex-col flex-1">
          <h4 className="font-semibold text-sm line-clamp-2 mb-1" data-testid={`text-curated-title-${item.id}`}>
            {item.title}
          </h4>
          {item.source && (
            <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wide" data-testid={`text-curated-source-${item.id}`}>
              {item.source}
            </p>
          )}
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap mb-3">
            {item.duration && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.duration}
              </span>
            )}
            {item.price_display && (
              <span className="text-sm font-bold text-foreground ml-auto">
                {item.price_display}
              </span>
            )}
          </div>

          <div className="flex gap-2 mt-auto">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8"
              onClick={() => onAddToTrip(item)}
              data-testid={`button-add-trip-${item.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add to Trip
            </Button>
            {isAffiliate && item.tracking?.isAffiliateTracked ? (
              // Tracked affiliate — click is recorded in affiliate_clicks before redirect
              <Button
                size="sm"
                className="flex-1 text-xs h-8 bg-[#FF385C] hover:bg-[#E23350]"
                onClick={handleBookViaTraveloure}
                disabled={trackClickMutation.isPending}
                data-testid={`button-book-via-traveloure-${item.id}`}
              >
                {trackClickMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    Book via Traveloure
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </>
                )}
              </Button>
            ) : isAffiliate ? (
              // Affiliate URL present but no valid tracking identifiers — plain Visit link
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs h-8"
                onClick={() => window.open(item.affiliate_url!, "_blank", "noopener,noreferrer")}
                data-testid={`button-visit-partner-${item.id}`}
              >
                Visit Partner
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            ) : (
              // Non-affiliate curated item — Stripe checkout or trip planner
              <Button
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={handleBookNow}
                disabled={stripeCheckoutMutation.isPending}
                data-testid={`button-book-now-${item.id}`}
              >
                {stripeCheckoutMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Book Now
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function CuratedContentSection({
  destination,
  tab,
  className = "",
  label = "Curated Experiences",
}: CuratedContentSectionProps) {
  const { user } = useAuth();
  const [addToTripItem, setAddToTripItem] = useState<CuratedItem | null>(null);
  const [addToTripOpen, setAddToTripOpen] = useState(false);

  const params = new URLSearchParams({ destination });
  if (tab) params.set("tab", tab);

  const { data, isLoading } = useQuery<CuratedContentResponse>({
    queryKey: ["/api/content/discover", destination, tab],
    queryFn: async () => {
      const res = await fetch(`/api/content/discover?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch curated content");
      return res.json();
    },
    enabled: !!destination,
    staleTime: 5 * 60 * 1000,
  });

  const items = data?.items || [];

  if (isLoading) {
    return (
      <div className={`mb-6 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[#FF385C]" />
          <h3 className="text-sm font-semibold">{label}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!destination || items.length === 0) return null;

  const handleAddToTrip = (item: CuratedItem) => {
    if (!user) return;
    setAddToTripItem(item);
    setAddToTripOpen(true);
  };

  return (
    <div className={`mb-6 ${className}`} data-testid="section-curated-content">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#FF385C]" />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Badge className="text-[10px] bg-[#FF385C]/10 text-[#FF385C] border-[#FF385C]/20 hover:bg-[#FF385C]/10 ml-1">
          {items.length} available
        </Badge>
        <span className="text-xs text-muted-foreground">in {destination}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <CuratedCard
            key={item.id}
            item={item}
            onAddToTrip={handleAddToTrip}
          />
        ))}
      </div>

      <AddToTripDialog
        item={addToTripItem}
        open={addToTripOpen}
        onOpenChange={setAddToTripOpen}
      />
    </div>
  );
}
