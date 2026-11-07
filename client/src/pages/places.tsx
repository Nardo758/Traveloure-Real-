import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import NotFound from "@/pages/not-found";
import { placesMarketFor } from "@shared/places-path";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gem } from "lucide-react";
import { CityFeedCardGem } from "@/components/city-feed-card";

/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`): the page lists reviewed places only. C-4 (ledger
 * `2026-11-05-lane4-places`): it lives at `/places/{city}`. HELD for Leon: the heading wording.
 *
 * FU-R3-1 (ledger `2026-11-05-fu-r3-places-gems`; ruling, Nov 5, 2026): the gems are the city page's own — the one
 * server read `listTravelerCityGems` (`travel_pulse_hidden_gems`, not withdrawn), served by `GET /api/places/:city`,
 * drawn with the city page's gem card. `ai_discovered_gems` is never read by a public page, so its category chips and
 * destination buttons are gone with it: those gems carry `place_type`, which the C-5 chip set does not name.
 */
export const PLACES_HEADING = (city: string) => `Places to explore in ${city}`;

type PlacesPayload = { city: string; open: boolean; gems: any[] };

export default function HiddenGemsPage({ city }: { city?: string }) {
  // C-4 / A-16: the city is the path's (`/places/{city}`); a city that is not an operating market is not found.
  const market = placesMarketFor(city);
  const { data, isLoading, error } = useQuery<PlacesPayload>({
    queryKey: [`/api/places/${encodeURIComponent(market?.marketKey ?? "")}`],
    enabled: !!market,
  });

  // R3-26: a signed-in member's press opens the same add-to-plan dialog as the city page (`discover-location.tsx`
  // `handleAdd`); the card's own `useBrowseSaveToPlan` still sends a waitlist guest's press to the guest save rail.
  // Before this the card had no `onAdd`, so a signed-in press did nothing and said nothing.
  const [addItem, setAddItem] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const onAdd = (item: any) => {
    setAddItem(item);
    setAddOpen(true);
  };

  if (!market) return <NotFound />;
  const gems = data?.gems ?? [];

  return (
    <div className="container mx-auto py-8 px-4 space-y-8" data-testid="hidden-gems-page">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Gem className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {PLACES_HEADING(market.cityName)}
          </h1>
        </div>
      </div>

      {error ? (
        <Card data-testid="card-gems-error">
          <CardContent className="py-12 text-center">
            <div className="text-destructive mb-4" data-testid="text-error-title">Failed to load local picks</div>
            <p className="text-muted-foreground" data-testid="text-error-message">Please try again later</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : gems.length === 0 ? (
        <Card data-testid="card-gems-empty">
          <CardContent className="py-12 text-center">
            <Gem className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium" data-testid="text-empty-title">Nothing here yet.</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="places-gems">
          {gems.map((gem) => (
            <CityFeedCardGem key={gem.id} gem={gem} city={market.cityName} bookability={gem.bookability} onAdd={onAdd} />
          ))}
        </div>
      )}
      <AddToExperienceDialog item={addItem} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
