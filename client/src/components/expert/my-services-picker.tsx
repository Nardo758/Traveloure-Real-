import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Check, Search } from "lucide-react";

/** Full provider_services row shape, as returned by GET /api/expert/services (the owner console —
 *  intentionally ungated on approval, D1a/§1, so it can show the whole pipeline). We client-filter
 *  to approved + active below, mirroring the F2 read-gate that public surfaces apply server-side. */
interface OwnedService {
  id: string;
  serviceName: string;
  description?: string | null;
  price?: string | null;
  location?: string | null;
  meetingPoint?: string | null;
  serviceType?: string | null;
  approvalStatus?: string | null;
  status?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationPrecision?: string | null;
}

// Mirrors service-picker-modal.tsx's itemTypeFor for the same target vocabulary.
function itemTypeFor(s: OwnedService): string {
  const t = (s.serviceType || "").toLowerCase();
  if (t.includes("dining") || t.includes("food") || t.includes("restaurant")) return "dining";
  if (t.includes("transport") || t.includes("transfer")) return "transport";
  if (t.includes("hotel") || t.includes("accommodation") || t.includes("stay")) return "hotel";
  return "activity";
}

/**
 * MyServicesPickerCore — the Add panel's "My services" pill (W1-A). Reuses the existing
 * owner-console read (GET /api/expert/services, userId-scoped — no new endpoint) rather than
 * building a second read of the same table, and client-filters to the expert's own
 * approved + active listings (an unapproved/paused listing has no business appearing as
 * bookable inventory on a client's plan). Same write as the Platform-services picker:
 * POST /api/trips/:tripId/itinerary-items, carrying providerServiceId so the plan item stays
 * linked to the real listing — mirrors service-picker-modal.tsx's payload construction,
 * including the 'exact'-precision coordinate gate (§13 — a shared neighborhood centroid must
 * never be presented as this specific stop's own location).
 */
export function MyServicesPickerCore({
  tripId,
  dayNumber,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<OwnedService[]>({
    queryKey: ["/api/expert/services"],
  });

  const approvedActive = (data ?? []).filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  );

  const addMutation = useMutation({
    mutationFn: async (s: OwnedService) => {
      const lat = s.latitude == null ? NaN : typeof s.latitude === "number" ? s.latitude : parseFloat(s.latitude);
      const lng = s.longitude == null ? NaN : typeof s.longitude === "number" ? s.longitude : parseFloat(s.longitude);
      const withCoords = s.locationPrecision === "exact" && Number.isFinite(lat) && Number.isFinite(lng);
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: s.serviceName,
        description: s.description || undefined,
        itemType: itemTypeFor(s),
        locationName: s.meetingPoint || s.location || s.serviceName,
        ...(withCoords ? { latitude: String(s.latitude), longitude: String(s.longitude) } : {}),
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
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/commission`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${s.serviceName} → Day ${dayNumber}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add service", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const services = approvedActive.filter((s) =>
    !q.trim() || s.serviceName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your listings…"
          className="pl-8"
          data-testid="input-my-services-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-my-services-empty">
          {(data ?? []).length === 0
            ? "You don't have any listings yet — create one from the Catalog module."
            : "None of your listings are approved and active yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
              data-testid={`my-service-row-${s.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{s.serviceName}</span>
                  {s.price && (
                    <Badge variant="outline" className="shrink-0 text-xs">${s.price}</Badge>
                  )}
                </div>
                {(s.meetingPoint || s.location) && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3" /> {s.meetingPoint || s.location}
                  </span>
                )}
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
                data-testid={`button-my-service-add-${s.id}`}
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
    </div>
  );
}
