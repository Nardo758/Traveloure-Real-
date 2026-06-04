import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, ExternalLink, MapPin, Plus, Star, Wifi, Waves, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { matchedServiceSuggestion } from "@/lib/feed-stream";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Bookability = "platform" | "affiliate" | "browse";

interface BookabilityDotProps {
  level: Bookability;
}

function BookabilityDot({ level }: BookabilityDotProps) {
  const color =
    level === "platform"
      ? "bg-green-400"
      : level === "affiliate"
        ? "bg-blue-400"
        : "bg-gray-400";
  return <span className={cn("w-2 h-2 rounded-full", color)} />;
}

// ─── Gem card ─────────────────────────────────────────────────────────────────

interface CityFeedCardGemProps {
  gem: any;
  city: string;
  scheduledDate?: string | null;
  bookability?: Bookability;
  onAdd?: (item: any) => void;
  compact?: boolean;
  className?: string;
}

export function CityFeedCardGem({
  gem,
  city,
  scheduledDate,
  bookability = "browse",
  onAdd,
  compact = false,
  className,
}: CityFeedCardGemProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);

  if (!loading && !photoUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-gem-${gem.id}`}
    >
      {/* Photo — 4:3 aspect */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {loading && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        {photoUrl && (
          <img
            src={photoUrl}
            alt={gem.placeName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level={bookability} />
        </span>
        {gem.isSecret && (
          <span className="absolute bottom-2 left-2 bg-purple-600/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
            Hidden Gem
          </span>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{gem.placeName}</h3>
          {gem.gemScore !== undefined && (
            <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{Number(gem.gemScore).toFixed(1)}</span>
            </div>
          )}
        </div>

        {gem.description && !compact && (
          <p className="text-xs text-muted-foreground line-clamp-2">{gem.description}</p>
        )}

        {gem.neighborhood && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{gem.neighborhood}</span>
          </div>
        )}

        {/* Matched-service suggestion strip */}
        {!compact && (() => {
          const suggestion = matchedServiceSuggestion(gem.placeType);
          if (!suggestion) return null;
          return (
            <a
              href={suggestion.href}
              className="flex items-center justify-between gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border-t pt-1.5 mt-1"
              data-testid={`suggestion-${gem.id}`}
            >
              <span>{suggestion.icon} {suggestion.label}</span>
              <ChevronRight className="w-3 h-3" />
            </a>
          );
        })()}

        {!compact && (
          <div className="flex gap-1.5 pt-1">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() =>
                onAdd?.({
                  title: gem.placeName,
                  description: gem.description,
                  city,
                  type: "gem",
                  scheduledDate,
                })
              }
              data-testid={`btn-add-gem-${gem.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

interface CityFeedCardEventProps {
  event: any;
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
}

export function CityFeedCardEvent({ event, city, scheduledDate, onAdd, className }: CityFeedCardEventProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const dbImageUrl = event.image || event.imageUrl || null;
  const eventName = event.title || event.name || "";
  const { photoUrl, loading } = useGemPhoto(
    `event-${event.id ?? event.eventId ?? eventName}`,
    eventName,
    city,
    dbImageUrl,
  );

  if (!loading && !photoUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-event-${event.id ?? event.eventId}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            alt={eventName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level="affiliate" />
        </span>
        <span className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
          Event
        </span>
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2">{eventName}</h3>
        {event.date && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
        )}
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() =>
              onAdd?.({
                title: eventName,
                city,
                type: "event",
                scheduledDate,
              })
            }
            data-testid={`btn-add-event-${event.id}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel}
          </Button>
          {event.url && (
            <Button size="sm" variant="outline" className="h-7 px-2" asChild>
              <a href={event.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Supply card (hotel / activity) ──────────────────────────────────────────

interface CityFeedCardSupplyProps {
  item: any;
  kind: "supply-hotel" | "supply-activity";
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
}

export function CityFeedCardSupply({ item, kind, city, scheduledDate, onAdd, className }: CityFeedCardSupplyProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const dbImageUrl = item.media?.[0]?.url || item.imageUrl || null;
  const itemName = item.name || item.title || "";
  const isHotel = kind === "supply-hotel";

  const { photoUrl, loading } = useGemPhoto(
    `supply-${item.id ?? itemName}`,
    itemName,
    city,
    dbImageUrl,
  );

  if (!loading && !photoUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-${kind}-${item.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            alt={itemName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level="platform" />
        </span>
        <span className="absolute top-2 left-2 bg-muted/90 text-foreground text-[10px] font-medium rounded-full px-2 py-0.5">
          {isHotel ? "Hotel" : "Activity"}
        </span>
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2">{itemName}</h3>
        {item.rating && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{item.rating}</span>
          </div>
        )}
        {isHotel && item.amenities && (
          <div className="flex flex-wrap gap-1">
            {(item.amenities as string[]).slice(0, 2).map((a) => (
              <span key={a} className="text-[10px] bg-muted rounded-full px-2 py-0.5 flex items-center gap-0.5">
                {a.toLowerCase().includes("wifi") ? <Wifi className="w-2.5 h-2.5" /> : <Waves className="w-2.5 h-2.5" />}
                {a}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() =>
              onAdd?.({
                title: itemName,
                city,
                type: isHotel ? "hotel" : "activity",
                scheduledDate,
              })
            }
            data-testid={`btn-add-supply-${item.id}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
