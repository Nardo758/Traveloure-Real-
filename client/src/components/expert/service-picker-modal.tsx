import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Check, Store, Search, Star } from "lucide-react";

interface PlatformService {
  id: string;
  serviceName: string;
  description?: string | null;
  price?: string | null;
  location?: string | null;
  deliveryMethod?: string | null;
  meetingPoint?: string | null;
  serviceType?: string | null;
  averageRating?: string | null;
  reviewCount?: number | null;
}

// Map a service's delivery/type to the workspace itinerary itemType set.
function itemTypeFor(s: PlatformService): string {
  const t = (s.serviceType || "").toLowerCase();
  if (t.includes("dining") || t.includes("food") || t.includes("restaurant")) return "dining";
  if (t.includes("transport") || t.includes("transfer")) return "transport";
  if (t.includes("hotel") || t.includes("accommodation") || t.includes("stay")) return "hotel";
  return "activity";
}

/**
 * "Add Platform Service" — inside the expert trip workspace, browse ALL admin-approved platform
 * services (provider_services) and drop one onto the current trip's itinerary. Defaults to the
 * trip's destination city so the expert sees locally-bookable services first. Writes via the live
 * POST /api/trips/:tripId/itinerary-items, carrying providerServiceId so the plan item stays linked
 * to the real bookable listing. Approval read-gate is server-side (getAllActiveServices).
 */
export function ServicePickerModal({
  tripId,
  dayNumber,
  destination,
  onClose,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  destination: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  // Extract a city token from the trip destination (e.g. "Kyoto, Japan" → "Kyoto").
  const city = (destination || "").split(",")[0].trim();

  const { data, isLoading } = useQuery<PlatformService[]>({
    queryKey: ["/api/services", city, "service-picker"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (city) params.set("location", city);
      const res = await apiRequest("GET", `/api/services?${params.toString()}`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (s: PlatformService) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: s.serviceName,
        description: s.description || undefined,
        itemType: itemTypeFor(s),
        locationName: s.meetingPoint || s.location || s.serviceName,
        estimatedCost: s.price ? String(s.price) : undefined,
        providerServiceId: s.id,
        dayNumber,
        suggestedBy: "expert",
      });
      return res.json();
    },
    onSuccess: (_res, s) => {
      setAdded((prev) => new Set(prev).add(s.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/commission`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${s.serviceName} → Day ${dayNumber}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add service", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const services = (data ?? []).filter((s) =>
    !q.trim() || s.serviceName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            Add Platform Service — Day {dayNumber}
          </DialogTitle>
          <DialogDescription>
            Approved, bookable platform services{city ? ` in ${city}` : ""}. Add one to this trip's itinerary.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services…"
            className="pl-8"
            data-testid="input-service-picker-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No approved platform services{city ? ` in ${city}` : ""} yet.
          </p>
        ) : (
          <div className="space-y-2">
            {services.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
                data-testid={`service-picker-row-${s.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{s.serviceName}</span>
                    {s.price && (
                      <Badge variant="outline" className="shrink-0 text-xs">${s.price}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {(s.meetingPoint || s.location) && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" /> {s.meetingPoint || s.location}
                      </span>
                    )}
                    {s.reviewCount && s.reviewCount > 0 && s.averageRating ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="w-3 h-3 fill-current" /> {s.averageRating} ({s.reviewCount})
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">New</span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{s.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={added.has(s.id) ? "outline" : "default"}
                  disabled={added.has(s.id) || addMutation.isPending}
                  onClick={() => addMutation.mutate(s)}
                  className="shrink-0"
                  data-testid={`button-service-add-${s.id}`}
                >
                  {added.has(s.id) ? (
                    <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
