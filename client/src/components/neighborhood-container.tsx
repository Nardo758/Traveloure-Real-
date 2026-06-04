import { Button } from "@/components/ui/button";
import { MapPin, Plus, ArrowRight } from "lucide-react";
import { CityFeedCardGem } from "@/components/city-feed-card";
import type { Bookability } from "@/components/city-feed-card";
import { cn } from "@/lib/utils";

interface NeighborhoodContainerProps {
  neighborhood: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    gemCount: number;
    serviceCount: number;
    gems: any[];
  };
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
}

/**
 * Slim-header grouped bento container for a neighborhood.
 * Shows a 2-3 column mini-bento of the neighborhood's top gems using CityFeedCard.
 * Light visual grouping — not a full-bleed divider.
 */
export function NeighborhoodContainer({
  neighborhood,
  city,
  scheduledDate,
  onAdd,
  className,
}: NeighborhoodContainerProps) {
  const total = neighborhood.gemCount;
  // Only show gems that already have a photo URL in the DB in the bento.
  // Gems without imageUrl are hidden per spec ("card with no photo is hidden");
  // when there are none with photos, we still surface the neighborhood header.
  const gemsWithPhoto = neighborhood.gems.filter((g: any) => !!g.imageUrl);
  const topGems = gemsWithPhoto.slice(0, 3);

  if (total === 0 && topGems.length === 0) return null;

  return (
    <div
      className={cn("rounded-xl border bg-muted/30 overflow-hidden", className)}
      data-testid={`neighborhood-container-${neighborhood.slug}`}
    >
      {/* Slim header band */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/50 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="font-semibold text-sm truncate">{neighborhood.name}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {total} {total === 1 ? "place" : "places"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onAdd && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={() =>
                onAdd({
                  title: `A day in ${neighborhood.name}`,
                  description: neighborhood.description,
                  city,
                  type: "neighborhood",
                  scheduledDate,
                })
              }
              data-testid={`btn-add-day-${neighborhood.slug}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add a day
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" asChild>
            <a href={`/discover/location/${encodeURIComponent(city)}/${neighborhood.slug}`}>
              Explore
              <ArrowRight className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </div>
      </div>

      {/* Mini bento of top gems (only when photos are available) */}
      {topGems.length > 0 && (
        <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {topGems.map((gem: any) => (
            <CityFeedCardGem
              key={gem.id}
              gem={gem}
              city={city}
              compact
              scheduledDate={scheduledDate}
              bookability={"browse" as Bookability}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
