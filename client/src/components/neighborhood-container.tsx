import { Button } from "@/components/ui/button";
import { CityFeedCardGem, computeBookability } from "@/components/city-feed-card";
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
 * Full .nb neighborhood container matching the gem feed reference design.
 * Large header with icon block, name, trend line, description, CTA buttons,
 * then an inner bento grid with span-2 marquee first gem.
 */
export function NeighborhoodContainer({
  neighborhood,
  city,
  scheduledDate,
  onAdd,
  className,
}: NeighborhoodContainerProps) {
  const total = neighborhood.gemCount;
  const topGems = neighborhood.gems.slice(0, 4);

  if (total === 0 && topGems.length === 0) return null;

  return (
    <div
      className={cn("rounded-xl border bg-card overflow-hidden", className)}
      data-testid={`neighborhood-container-${neighborhood.slug}`}
    >
      {/* Header */}
      <div className="p-4 flex gap-3.5">
        <div className="w-[60px] h-[60px] rounded-xl bg-teal-50 flex items-center justify-center text-2xl flex-shrink-0">
          🗺
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-bold tracking-tight">{neighborhood.name}</h2>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-gray-100 text-gray-500">
              Neighborhood
            </span>
          </div>
          <div className="text-[12px] text-teal-700 mt-0.5">
            trending · {total} {total === 1 ? "thing" : "things"} to do
          </div>
          {neighborhood.description && (
            <div className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
              {neighborhood.description}
            </div>
          )}
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <Button
          size="sm"
          className="h-8 text-xs px-4"
          asChild
          data-testid={`btn-explore-${neighborhood.slug}`}
        >
          <a href={`/discover/location/${encodeURIComponent(city)}/${neighborhood.slug}`}>
            Explore {neighborhood.name}
          </a>
        </Button>
        {onAdd && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-4"
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
            + Add a {neighborhood.name} day
          </Button>
        )}
      </div>

      {/* Inner bento */}
      {topGems.length > 0 && (
        <div className="bg-muted/40 border-t px-4 pt-3.5 pb-4">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest mb-2.5">
            IN {neighborhood.name.toUpperCase()}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {topGems.map((gem: any, idx: number) => (
              <div key={gem.id} className={idx === 0 ? "col-span-2" : ""}>
                <CityFeedCardGem
                  gem={gem}
                  city={city}
                  scheduledDate={scheduledDate}
                  bookability={computeBookability(gem)}
                  onAdd={onAdd}
                  layout={idx === 0 ? "row" : "column"}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
