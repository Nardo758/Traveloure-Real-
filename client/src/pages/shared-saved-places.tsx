/**
 * A shared list of saved places for one city (board #329, ledger
 * `2026-09-24-saved-places-plan-and-share`). Public and read-only: it reads
 * `GET /api/saved-places/shared/:token`, which returns the city and the places and nothing about
 * the person who saved them. A stopped or unknown link is one "not active" message (§13 — it
 * never says whether the link once existed).
 */
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PlanEntryCta } from "@/components/planning/plan-entry-cta";
import type { SharedSavedPlaces } from "@shared/saved-items";

function typeLabel(contentType: string): string {
  switch (contentType) {
    case "gem":
      return "Local gem";
    case "hotel":
      return "Stay";
    case "activity":
      return "Activity";
    case "service":
      return "Service";
    default:
      return "Place";
  }
}

export default function SharedSavedPlacesPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery<SharedSavedPlaces>({
    queryKey: ["/api/saved-places/shared", token],
    queryFn: async () => {
      const res = await fetch(`/api/saved-places/shared/${encodeURIComponent(token ?? "")}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    retry: false,
    enabled: !!token,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !data ? (
        <Card>
          <CardContent className="py-12 text-center" data-testid="text-shared-places-inactive">
            <p className="font-medium">This link is not active.</p>
            <p className="text-sm text-muted-foreground mt-1">
              The person who shared it may have turned it off.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" /> Shared saved places
            </p>
            <h1 className="text-3xl font-semibold mt-1 flex items-center gap-2" data-testid="text-shared-city">
              <MapPin className="h-6 w-6 text-muted-foreground" />
              {data.city}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data.places.length === 1 ? "1 place" : `${data.places.length} places`} someone saved. This list is
              read-only.
            </p>
          </div>

          {data.places.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-shared-places-empty">
                Nothing is saved in {data.city} right now.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.places.map((place, i) => (
                <Card key={`${place.contentType}-${i}`} className="overflow-hidden" data-testid={`card-shared-place-${i}`}>
                  {place.contentImage && (
                    <img src={place.contentImage} alt={place.contentName} className="w-full h-36 object-cover" loading="lazy" />
                  )}
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{typeLabel(place.contentType)}</p>
                    <p className="font-medium leading-snug">{place.contentName}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 border-t pt-6">
            <p className="text-sm text-muted-foreground flex-1">Going to {data.city}? Start your own plan.</p>
            <PlanEntryCta source={{ city: data.city }} testId="plan-entry-shared-places" />
          </div>
        </>
      )}
    </div>
  );
}
