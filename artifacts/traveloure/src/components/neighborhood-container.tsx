import { Button } from "@/components/ui/button";
import { CityFeedCardGem } from "@/components/city-feed-card";
import { cn } from "@/lib/utils";
import { resolveBookability } from "@shared/bookability";
import { useAskExpert } from "@/lib/use-ask-expert";

interface NeighborhoodLocalExpert {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  packagesCount: number;
}

interface NeighborhoodContainerProps {
  neighborhood: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    gemCount: number;
    serviceCount: number;
    gems: any[];
    localExpert?: NeighborhoodLocalExpert | null;
  };
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
  /** Two soonest upcoming city events — rendered as a mini-list top-right of the header. */
  upcomingEvents?: Array<{ date: string; title: string }>;
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
  upcomingEvents,
}: NeighborhoodContainerProps) {
  // Gems may arrive nested (neighborhood.gems) or via the top-level feed
  // merge. Use whichever gives the higher count so the header is always accurate.
  const askExpert = useAskExpert();
  const gems = neighborhood.gems ?? [];
  const total = Math.max(neighborhood.gemCount ?? 0, gems.length);
  const topGems = gems.slice(0, 4);

  if (total === 0 && topGems.length === 0) return null;

  const localExpert = neighborhood.localExpert ?? null;
  const expertName = localExpert
    ? [localExpert.firstName, localExpert.lastName].filter(Boolean).join(" ") || "Local Expert"
    : null;
  const expertInitials = localExpert
    ? [localExpert.firstName, localExpert.lastName]
        .filter(Boolean)
        .map((n) => (n as string).charAt(0).toUpperCase())
        .join("") || "E"
    : null;

  // Odd-tail rule (F5): gem[0] is the marquee; of the REMAINING gems, an odd
  // count means the LAST gem also spans the full row so the grid ends flush.
  const restCount = topGems.length - 1;
  const oddTailIdx = restCount > 0 && restCount % 2 === 1 ? topGems.length - 1 : -1;

  return (
    <div
      className={cn("rounded-xl border bg-card overflow-hidden", className)}
      data-testid={`neighborhood-container-${neighborhood.slug}`}
    >
      {/* Header */}
      <div className="p-4 flex gap-3.5">
        <div className="w-[60px] h-[60px] rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">
          🗺
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-bold tracking-tight">{neighborhood.name}</h2>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-muted text-muted-foreground">
              Neighborhood
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            <span className="text-primary font-medium">Trending</span> · {total} {total === 1 ? "thing" : "things"} to do
          </div>
          {neighborhood.description && (
            <div className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
              {neighborhood.description}
            </div>
          )}
        </div>
        {upcomingEvents && upcomingEvents.length > 0 && (
          <div className="hidden sm:block flex-shrink-0 text-right max-w-[180px]" data-testid={`upcoming-events-${neighborhood.slug}`}>
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-1">
              Upcoming events
            </div>
            {upcomingEvents.slice(0, 2).map((ev, i) => (
              <div key={`${ev.date}-${i}`} className="text-[11px] text-muted-foreground truncate">
                <span className="text-foreground font-medium">
                  {new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>{" "}
                {ev.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Local Expert row (F8) */}
      {localExpert && (
        <div
          className="mx-4 mb-3 -mt-1 rounded-xl border border-border bg-muted/40 p-2.5 flex items-center gap-2.5"
          data-testid={`neighborhood-local-expert-${neighborhood.slug}`}
        >
          {localExpert.profileImageUrl ? (
            <img
              src={localExpert.profileImageUrl}
              alt={expertName ?? "Local Expert"}
              loading="lazy"
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
              {expertInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {expertName} · Local Expert
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              Knows {neighborhood.name}
              {localExpert.packagesCount > 0 && (
                <> · {localExpert.packagesCount} {localExpert.packagesCount === 1 ? "package" : "packages"} planned</>
              )}
            </p>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs px-3 flex-shrink-0"
            onClick={() => askExpert({ expertId: localExpert.id, city, subject: neighborhood.name })}
            data-testid={`btn-ask-expert-${neighborhood.slug}`}
          >
            Ask about {neighborhood.name}
          </Button>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <Button
          size="sm"
          className="h-8 text-xs px-4"
          asChild
          data-testid={`btn-explore-${neighborhood.slug}`}
        >
          {/* Only /discover/location/:city is registered — the old two-segment link
              (/discover/location/:city/:slug) fell through to the 404 catch-all.
              A neighborhood-focused view is filed; until it exists, land on the city. */}
          <a href={`/discover/location/${encodeURIComponent(city)}`}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topGems.map((gem: any, idx: number) => {
              const isMarquee = idx === 0 || idx === oddTailIdx;
              return (
                <div key={gem.id} className={cn("h-full", isMarquee && "sm:col-span-2")}>
                  <CityFeedCardGem
                    gem={gem}
                    city={city}
                    scheduledDate={scheduledDate}
                    bookability={resolveBookability(gem)}
                    onAdd={onAdd}
                    layout={isMarquee ? "row" : "column"}
                    topPick={idx === 0}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
