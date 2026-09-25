/**
 * "Your saved places here" on the slip (board #329, ledger `2026-09-24-saved-places-plan-and-share`).
 *
 * "Plan this city" opens the ONE planning modal with the city; the places come in HERE, on the
 * plan the modal minted — and on any other plan the owner has in that city — rather than being
 * carried through the modal. Owner only: these are the viewer's own saved places. Each is added
 * through the same `POST /api/trips/:tripId/itinerary-items` body the Add-to-plan dialog sends, so
 * there is no second add rail (LD 39). Renders nothing when no saved place matches (§13).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ADDED_TO_PLAN_TITLE } from "@/lib/plan-vocabulary";
import {
  planHasItemNamed,
  savedPlacesForPlan,
  type SavedItemRow,
} from "@/lib/saved-items";

export function SlipSavedPlaces({
  tripId,
  destination,
  stops,
  itemNames,
  className,
}: {
  tripId: string;
  destination: string | null | undefined;
  stops: ReadonlyArray<{ name?: string | null; city?: string | null }> | null | undefined;
  itemNames: readonly string[];
  className?: string;
}) {
  const { toast } = useToast();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const { data: saved } = useQuery<SavedItemRow[]>({ queryKey: ["/api/saved-items"] });
  const places = savedPlacesForPlan(saved, destination, stops);

  const add = useMutation({
    mutationFn: async (place: SavedItemRow) => {
      const res = await fetch(`/api/trips/${tripId}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: place.contentName,
          description: "",
          itemType: place.contentType,
          dayNumber: 1,
          status: "planned",
          ...(place.city ? { locationName: place.city } : {}),
        }),
      });
      if (!res.ok) throw new Error("add failed");
      return place;
    },
    onSuccess: (place) => {
      setAdded((prev) => new Set(prev).add(place.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      toast({ title: ADDED_TO_PLAN_TITLE, description: `"${place.contentName}" is on day 1 of this plan.` });
    },
    onError: () => toast({ title: "Couldn't add it", variant: "destructive" }),
  });

  if (places.length === 0) return null;

  return (
    <section className={className} data-testid="slip-saved-places">
      <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
        <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
        Your saved places here
        <span className="text-xs text-muted-foreground font-normal">· {places.length}</span>
      </div>
      <ul className="divide-y rounded-lg border">
        {places.map((place) => {
          const justAdded = added.has(place.id);
          const onPlan = !justAdded && planHasItemNamed(itemNames, place.contentName);
          return (
            <li key={place.id} className="flex items-center gap-3 px-3 py-2" data-testid={`slip-saved-place-${place.id}`}>
              {place.contentImage ? (
                <img src={place.contentImage} alt="" className="h-9 w-9 rounded object-cover shrink-0" loading="lazy" />
              ) : (
                <div className="h-9 w-9 rounded bg-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{place.contentName}</p>
                {onPlan && <p className="text-xs text-muted-foreground">A place with this name is on this plan</p>}
              </div>
              {justAdded ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`slip-saved-place-added-${place.id}`}>
                  <Check className="h-3.5 w-3.5" /> Added
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={add.isPending}
                  onClick={() => add.mutate(place)}
                  data-testid={`button-slip-add-saved-${place.id}`}
                >
                  {add.isPending && add.variables?.id === place.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </>
                  )}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
