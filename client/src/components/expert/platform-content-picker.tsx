import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Plus, Check, Search } from "lucide-react";

/**
 * Teaser-safe row shape returned by GET /api/expert-workspace/platform-content
 * (server/services/content-query.service.ts::searchWorkstationPlatformContent).
 * Never carries itineraryData/gated bodies — id/type/title/description/image/city/lat/lng only,
 * and lat/lng only when the row's own metadata really has them (§13 — never fabricated).
 */
interface PlatformContentItem {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  image: string | null;
  city: string | null;
  latitude?: string;
  longitude?: string;
}
interface PlatformContentResponse { items: PlatformContentItem[] }

// content_registry contentType → the workspace itinerary itemType set (mirrors DmoPickerCore's
// TYPE_TO_ITEM / service-picker-modal's itemTypeFor for the same target vocabulary).
function itemTypeFor(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("restaurant") || t.includes("dining") || t.includes("food")) return "dining";
  if (t.includes("transport")) return "transport";
  if (t.includes("hotel") || t.includes("accommodation") || t.includes("stay")) return "hotel";
  return "activity";
}

function hasRealCoords(item: PlatformContentItem): boolean {
  const lat = item.latitude == null ? NaN : parseFloat(item.latitude);
  const lng = item.longitude == null ? NaN : parseFloat(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * PlatformContentPickerCore — the Add panel's "Platform content" pill (W1-A). Search + list +
 * add over the shared Traveloure content library (content_registry), scoped to the build's
 * destination with an optional free-text query. Same write as every other Add-panel source:
 * POST /api/trips/:tripId/itinerary-items, day-aware.
 */
export function PlatformContentPickerCore({
  tripId,
  destination,
  dayNumber,
  onAdded,
}: {
  tripId: string;
  destination: string;
  dayNumber: number;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const city = (destination || "").split(",")[0].trim();

  // Simple debounce, matching the workspace's own browse-search pattern.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery<PlatformContentResponse>({
    queryKey: ["/api/expert-workspace/platform-content", city, debouncedQ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      const res = await apiRequest("GET", `/api/expert-workspace/platform-content?${params.toString()}`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: PlatformContentItem) => {
      const withCoords = hasRealCoords(item);
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: item.title || "Untitled",
        description: item.description || undefined,
        itemType: itemTypeFor(item.type),
        locationName: item.city || undefined,
        ...(withCoords ? { latitude: item.latitude, longitude: item.longitude } : {}),
        dayNumber,
      });
      return res.json();
    },
    onSuccess: (_res, item) => {
      setAdded((prev) => new Set(prev).add(item.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${item.title || "Item"} → Day ${dayNumber}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search the content library${city ? ` in ${city}` : ""}…`}
          className="pl-8"
          data-testid="input-platform-content-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-platform-content-empty">
          No published content library items{city ? ` for ${city}` : ""} yet.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
              data-testid={`platform-content-row-${it.id}`}
            >
              <div className="min-w-0 flex items-start gap-2.5">
                {it.image ? (
                  <img src={it.image} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-muted shrink-0 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{it.title || "Untitled"}</span>
                    <Badge variant="outline" className="capitalize shrink-0 text-xs">{it.type.replace(/_/g, " ")}</Badge>
                  </div>
                  {it.city && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3" /> {it.city}
                    </span>
                  )}
                  {it.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{it.description}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={added.has(it.id) ? "outline" : "default"}
                disabled={added.has(it.id) || addMutation.isPending}
                onClick={() => addMutation.mutate(it)}
                className="shrink-0"
                data-testid={`button-platform-content-add-${it.id}`}
              >
                {added.has(it.id) ? (
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
