import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Heart, X, MapPin, ArrowRight, Loader2, CalendarPlus, Link2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { groupSavedByCity, savedCityKey, sharedSavedPlacesPath, type SavedItemRow as SavedItem } from "@/lib/saved-items";
import { usePlanning } from "@/contexts/PlanningContext";

interface SavedCityShare {
  id: string;
  city: string;
  cityKey: string;
  token: string;
  createdAt: string;
}

function shareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${sharedSavedPlacesPath(token)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function WishlistSection() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [addDialogItem, setAddDialogItem] = useState<any>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: savedItems, isLoading } = useQuery<SavedItem[]>({
    queryKey: ["/api/saved-items"],
  });
  const planning = usePlanning();

  // Board #329: one read-only link per city. The list of active links is the server's; a city's
  // link is found by the SAME key the groups are built on (`savedCityKey`), never restated.
  const { data: shares } = useQuery<SavedCityShare[]>({
    queryKey: ["/api/saved-items/shares"],
    enabled: !!savedItems && savedItems.length > 0,
  });
  const shareFor = (city: string | null) => {
    const key = savedCityKey(city);
    return key ? (shares ?? []).find((s) => s.cityKey === key) : undefined;
  };

  const shareMutation = useMutation({
    mutationFn: async (city: string) => {
      const res = await apiRequest("POST", "/api/saved-items/shares", { city });
      return (await res.json()) as SavedCityShare;
    },
    onSuccess: async (share) => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-items/shares"] });
      const copied = await copyText(shareUrl(share.token));
      toast({
        title: copied ? "Link copied" : "Link ready",
        description: copied
          ? `Anyone with the link can see your saved places in ${share.city}. They can't change them.`
          : shareUrl(share.token),
      });
    },
    onError: () => toast({ title: "Couldn't create a link", variant: "destructive" }),
  });

  const stopShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await apiRequest("DELETE", `/api/saved-items/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-items/shares"] });
      toast({ title: "Link turned off", description: "The old link no longer shows your places." });
    },
    onError: () => toast({ title: "Couldn't turn off the link", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/saved-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-items"] });
      toast({ title: "Removed from saved" });
    },
    onError: () => {
      toast({ title: "Failed to remove item", variant: "destructive" });
    },
  });

  if (isLoading || !savedItems || savedItems.length === 0) return null;

  return (
    <section className="mb-[22px]" data-testid="wishlist-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5" style={{ color: "#1A1A18" }}>
        <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
        <span>Saved places</span>
        <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F3EE", color: "#7A7A72" }}>
          {savedItems.length}
        </span>
      </div>

      {/* #328: one row per city, most recently saved-to city first; places saved with no city
          sit in one trailing row and are never filed under a guessed city (§13). */}
      {groupSavedByCity(savedItems).map((group) => (
      <div key={group.city ?? "__no_city__"} className="mb-3" data-testid={`wishlist-city-group-${group.city ?? "none"}`}>
      <div className="text-[11px] font-medium mb-1.5 flex items-center gap-1 flex-wrap" style={{ color: "#7A7A72" }}>
        <MapPin className="h-3 w-3" />
        <span>{group.city ?? "No city saved"}</span>
        <span>· {group.items.length}</span>
        {/* #329: a city group can start a plan there, or be shared read-only. Places saved with
            no city get neither — there is no city to plan or to name (§13). */}
        {group.city && (() => {
          const city = group.city;
          const share = shareFor(city);
          return (
            <span className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => planning.open({ city })}
                data-testid={`button-plan-city-${city}`}
              >
                <CalendarPlus className="h-3 w-3 mr-1" />
                Plan this city
              </Button>
              {share ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={async () => {
                      const copied = await copyText(shareUrl(share.token));
                      toast({ title: copied ? "Link copied" : "Link", description: copied ? undefined : shareUrl(share.token) });
                    }}
                    data-testid={`button-copy-share-${city}`}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => stopShareMutation.mutate(share.id)}
                    disabled={stopShareMutation.isPending}
                    data-testid={`button-stop-share-${city}`}
                  >
                    Stop sharing
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => shareMutation.mutate(city)}
                  disabled={shareMutation.isPending}
                  data-testid={`button-share-city-${city}`}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Share
                </Button>
              )}
            </span>
          );
        })()}
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {group.items.map((item) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-[160px] rounded-xl border bg-white overflow-hidden"
            style={{ border: "0.5px solid #E8E8E2" }}
            data-testid={`wishlist-card-${item.id}`}
          >
            {/* Image or placeholder */}
            <div className="relative h-[80px] bg-muted overflow-hidden">
              {item.contentImage ? (
                <img
                  src={item.contentImage}
                  alt={item.contentName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
                  <Heart className="h-6 w-6 text-rose-200" />
                </div>
              )}
              {/* Remove button */}
              <button
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 hover:bg-white shadow-sm transition-colors"
                onClick={() => removeMutation.mutate(item.id)}
                disabled={removeMutation.isPending}
                data-testid={`button-remove-saved-${item.id}`}
                aria-label="Remove from saved"
              >
                {removeMutation.isPending && removeMutation.variables === item.id ? (
                  <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                ) : (
                  <X className="h-3 w-3 text-gray-500" />
                )}
              </button>
            </div>

            <div className="p-2">
              <p className="text-[12px] font-semibold leading-snug line-clamp-2" style={{ color: "#1A1A18" }}>
                {item.contentName}
              </p>
              {item.city && (
                <p className="text-[10px] mt-0.5 flex items-center gap-0.5" style={{ color: "#7A7A72" }}>
                  <MapPin className="h-2.5 w-2.5" />{item.city}
                </p>
              )}
              <div className="flex gap-1 mt-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => {
                    setAddDialogItem({
                      title: item.contentName,
                      type: item.contentType,
                      city: item.city ?? undefined,
                    });
                    setAddDialogOpen(true);
                  }}
                  data-testid={`button-add-to-trip-${item.id}`}
                >
                  + Trip
                </Button>
                {item.city && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-6 px-2 flex-shrink-0"
                    onClick={() => navigate(`/discover/location/${encodeURIComponent(item.city!)}`)}
                    data-testid={`button-explore-city-${item.id}`}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
      ))}

      <AddToExperienceDialog
        item={addDialogItem}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </section>
  );
}
