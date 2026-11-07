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
import { AddChecksNotice, type AddedStop } from "@/components/plancard/AddChecksNotice";
import { createdItemIsLocated, planItemRefFromSavedItem } from "@shared/plan-item-ref";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { planSaveRefusalMessage } from "@/lib/plan-save-refusal";
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
  // AP-1 (ledger `2026-10-13-ap1-save-then-warn`): the last saved stop and what its checks found.
  const [checked, setChecked] = useState<AddedStop | null>(null);
  const { data: saved } = useQuery<SavedItemRow[]>({ queryKey: ["/api/saved-items"] });
  const places = savedPlacesForPlan(saved, destination, stops);

  const add = useMutation({
    mutationFn: async (place: SavedItemRow) => {
      const res = await fetch(`/api/trips/${tripId}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // PLAN-2 C1: a saved place that names its row sends that row's PlanItemRef — the server's resolver sets the
        // item's name, point and link. One that names no row of ours is free text: a title with no point and no
        // link, and the success line says it is not on the map.
        body: JSON.stringify(savedPlaceAddBody(place, destination)),
      });
      let res2 = res;
      // A saved id the resolver finds no row for (`unknown_source` — e.g. a partner search result) has no identity of
      // ours: it is added as free text, with no point and no link, and the success line says it is not on the map.
      if (res.status === 400) {
        const refusal = await res.clone().json().catch(() => null);
        if (refusal?.code === "unknown_source") {
          res2 = await fetch(`/api/trips/${tripId}/itinerary-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(savedPlaceAddBody(place, destination, { freeText: true })),
          });
        }
      }
      if (!res2.ok) throw new Error(`${res2.status}: ${await res2.text().catch(() => "")}`);
      const out = await res2.json().catch(() => null);
      return { place, out };
    },
    onSuccess: ({ place, out }) => {
      setAdded((prev) => new Set(prev).add(place.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      // PLAN-2 C1: an add with no point says so — the add-checks notice names it "isn't on the map"; without that
      // notice, A-18's approved line does.
      if (out?.id && out?.addChecks) setChecked({ itemId: out.id, checks: out.addChecks });
      else if (out?.id && !createdItemIsLocated(out)) toast({ title: GUEST_PLAN_COPY.savedNotOnMap });
      else toast({ title: ADDED_TO_PLAN_TITLE, description: `"${place.contentName}" is on day 1 of this plan.` });
    },
    onError: (e: any) => toast({ title: planSaveRefusalMessage(e) ?? "Couldn't add it", variant: "destructive" }),
  });

  if (places.length === 0) return null;

  return (
    <section className={className} data-testid="slip-saved-places">
      <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
        <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
        Your saved places here
        <span className="text-xs text-muted-foreground font-normal">· {places.length}</span>
      </div>
      <AddChecksNotice
        tripId={tripId}
        added={checked}
        onDismiss={() => setChecked(null)}
        onSettled={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
          queryClient.invalidateQueries({ queryKey: ["/api/optimization-preview", { tripId }] });
        }}
        testId="slip-saved-place-checks"
      />
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

/**
 * PLAN-2 C1 (ledger `2026-11-06-plan2-c1-resolver-adds`): the add body for a saved place. With a ref, the body's title
 * and type are ignored by the server (the row names the item); without one it is a typed item with no point.
 */
export function savedPlaceAddBody(
  place: SavedItemRow,
  destination: string | null | undefined,
  opts: { freeText?: boolean } = {},
): Record<string, unknown> {
  const ref = opts.freeText ? null : planItemRefFromSavedItem(place, destination);
  return {
    title: place.contentName,
    description: "",
    itemType: place.contentType === "service" ? "activity" : place.contentType,
    dayNumber: 1,
    status: "planned",
    ...(place.city ? { locationName: place.city } : {}),
    ...(ref ? { ref } : {}),
    addChecks: true,
  };
}
