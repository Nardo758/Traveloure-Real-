import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { queryClient } from "@/lib/queryClient";
import {
  MapPin,
  Plus,
  Loader2,
  Plane,
  LogIn,
} from "lucide-react";

interface Trip {
  id: string;
  title: string;
  destination: string;
  status: string;
  startDate?: string;
  endDate?: string;
}

interface ExperienceItem {
  /** Stable content id when the feed has one; falls back to a title slug. */
  id?: string;
  city?: string;
  title: string;
  description?: string;
  type: "gem" | "neighborhood" | "hotel" | "activity" | "event" | "recommendation";
  scheduledDate?: string | null;
}

interface AddToExperienceDialogProps {
  item: ExperienceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToExperienceDialog({
  item,
  open,
  onOpenChange,
}: AddToExperienceDialogProps) {
  const { user, isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  // Funnel consistency fix: feed content items add straight to the CART (the one
  // planning pipeline) — the trip/experience question is asked once, in the
  // cart's Trip-details step, not at add-time. contentMeta is display-only;
  // no price field is sent (§14 — a client price must never reach a charge).
  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const contentId =
        item.id ||
        item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) ||
        "feed-item";
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contentType: item.type === "recommendation" ? "activity" : item.type,
          contentId,
          contentMeta: {
            name: item.title,
            description: item.description || undefined,
            city: item.city || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to add to cart");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to your trip cart",
        description: `"${item?.title}" is in your cart — plan & optimize whenever you're ready.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Could not add to cart", description: "Please try again." });
    },
  });

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    enabled: open && isAuthenticated,
  });

  const addToTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      if (!item) return;

      // Compute dayNumber from scheduledDate and trip startDate when available.
      // dayNumber is 1-based relative to the trip start date.
      const trip = trips?.find((t) => t.id === tripId);
      let dayNumber = 1;
      if (item.scheduledDate && trip?.startDate) {
        const tripStart = new Date(trip.startDate + "T00:00:00");
        const itemDate = new Date(item.scheduledDate + "T00:00:00");
        const diffMs = itemDate.getTime() - tripStart.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        dayNumber = Math.max(1, diffDays + 1);
      }

      const res = await fetch(`/api/trips/${tripId}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          description: item.description || "",
          itemType: item.type || "experience",
          dayNumber,
          status: "planned",
          notes: `Added from ${item.city || "destination"}`,
          ...(item.scheduledDate ? { scheduledDate: item.scheduledDate } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to add item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Added to trip",
        description: `"${item?.title}" has been added to your itinerary.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to add",
        description: "Could not add this item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const activeTripStatuses = ["planning", "draft", "confirmed"];
  const activeTrips = trips?.filter((t) => activeTripStatuses.includes(t.status)) || [];

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              Sign in to add "{item?.title}" to a trip or create an experience.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                // /auth is not a registered route (guests were 404ing here) —
                // use the app's sign-in modal like every other guest gate.
                openSignInModal();
              }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
        <DialogHeader>
          <DialogTitle>Add to your plan</DialogTitle>
          <DialogDescription>
            Where should "{item?.title}" go?
          </DialogDescription>
        </DialogHeader>

        {/* Primary: straight into the trip cart — same as adding a service. The
            trip/experience question is asked once, in the cart's Trip-details
            step ("What are you planning?"), never at add-time. The old
            "Experience Type" tab (a forced template choice that redirected into
            the builder) is removed — funnel doctrine, Jul 17. */}
        <button
          type="button"
          onClick={() => addToCartMutation.mutate()}
          disabled={addToCartMutation.isPending}
          className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          data-testid="button-add-content-to-cart"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            {addToCartMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">Add to my trip cart</p>
            <p className="text-xs text-muted-foreground">
              Plan &amp; optimize whenever you're ready — nothing to set up now
            </p>
          </div>
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 border-t" />
          or add to a specific trip
          <div className="flex-1 border-t" />
        </div>

        <div className="space-y-3">
            {tripsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="text-center py-8">
                <Plane className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No active trips found.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a trip first to add items.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = "/my-trips";
                  }}
                >
                  Go to My Plans
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeTrips.map((trip) => (
                  <button
                    key={trip.id}
                    className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => addToTripMutation.mutate(trip.id)}
                    disabled={addToTripMutation.isPending}
                    data-testid={`button-select-trip-${trip.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {trip.title || "Untitled Trip"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {trip.destination}
                        </p>
                      </div>
                      {addToTripMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
