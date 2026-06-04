import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, Star, Calendar, ExternalLink, Hotel, Compass } from "lucide-react";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { gemCategory } from "@/lib/feed-stream";
import { cn } from "@/lib/utils";

/**
 * Bookability level for a card.
 * green  = platform-bookable (direct booking flow)
 * blue   = affiliate link
 * grey   = browse-only
 */
export type Bookability = "platform" | "affiliate" | "browse";

function BookabilityDot({ level }: { level: Bookability }) {
  return (
    <span
      title={level === "platform" ? "Book directly" : level === "affiliate" ? "Partner booking" : "Browse only"}
      className={cn(
        "inline-block w-2.5 h-2.5 rounded-full flex-shrink-0",
        level === "platform" && "bg-green-500",
        level === "affiliate" && "bg-blue-500",
        level === "browse" && "bg-gray-400",
      )}
      data-testid={`badge-bookability-${level}`}
    />
  );
}

function matchedServiceLabel(placeType: string | null | undefined): string | null {
  const cat = gemCategory(placeType);
  if (cat === "photo_spots") return "Find a photographer";
  if (cat === "stay") return "Book transport";
  if (cat === "do") return "Hire a guide";
  if (cat === "eat") return "Reserve a table";
  return null;
}

interface PhotoSkeletonProps {
  className?: string;
}
function PhotoSkeleton({ className }: PhotoSkeletonProps) {
  return (
    <div className={cn("bg-muted animate-pulse", className)} />
  );
}

interface CityFeedCardGemProps {
  gem: any;
  city: string;
  compact?: boolean;
  scheduledDate?: string | null;
  bookability?: Bookability;
  onAdd?: (item: any) => void;
  className?: string;
}

/**
 * Photo-led card for a hidden gem.
 * - Blur-up LQIP skeleton while loading
 * - lazy-loaded below the fold
 * - Bookability badge dot
 * - Matched-service suggestion strip
 * - Action buttons (Add / Ask)
 */
export function CityFeedCardGem({
  gem,
  city,
  compact = false,
  scheduledDate,
  bookability = "browse",
  onAdd,
  className,
}: CityFeedCardGemProps) {
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);
  const [imgLoaded, setImgLoaded] = useState(false);

  if (!loading && !photoUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";

  const serviceHint = matchedServiceLabel(gem.placeType);

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-gem-${gem.id}`}
    >
      {/* Photo — 4:3 standard aspect */}
      <div className={cn("relative overflow-hidden bg-muted", compact ? "aspect-[4/3]" : "aspect-[4/3]")}>
        {loading && <PhotoSkeleton className="absolute inset-0" />}
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
        {/* Bookability dot — top-right */}
        <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
          <BookabilityDot level={bookability} />
        </span>
        {/* Category badge */}
        {gem.placeType && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium rounded-full px-2 py-0.5 capitalize">
            {gem.placeType.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{gem.placeName}</h3>
          {gem.localRating && (
            <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{gem.localRating}</span>
            </div>
          )}
        </div>

        {!compact && gem.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{gem.description}</p>
        )}

        {/* Matched-service suggestion */}
        {serviceHint && (
          <p className="text-[11px] text-primary/80 font-medium">{serviceHint}</p>
        )}

        {/* Actions */}
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
          <Button size="sm" variant="outline" className="h-7 px-2" data-testid={`btn-expert-gem-${gem.id}`}>
            <Search className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CityFeedCardEventProps {
  event: any;
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
}

export function CityFeedCardEvent({ event, city, scheduledDate, onAdd, className }: CityFeedCardEventProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const imageUrl = event.image || event.imageUrl || null;

  if (!imageUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
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
        <img
          src={imageUrl}
          alt={event.title || event.name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
        />
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level="affiliate" />
        </span>
        <span className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
          Event
        </span>
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2">{event.title || event.name}</h3>
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
                title: event.title || event.name,
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
  const imageUrl = item.media?.[0]?.url || item.imageUrl || null;
  const isHotel = kind === "supply-hotel";

  if (!imageUrl) return null;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
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
        <img
          src={imageUrl}
          alt={item.name || item.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
        />
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level="platform" />
        </span>
        <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
          {isHotel ? "Stay" : "Do"}
        </span>
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start gap-1">
          {isHotel ? <Hotel className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" /> : <Compass className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />}
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{item.name || item.title}</h3>
        </div>
        {item.aiReasons?.[0] && (
          <p className="text-xs text-muted-foreground line-clamp-2 italic">{item.aiReasons[0]}</p>
        )}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" className="h-7 text-xs px-3">Book</Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={() =>
              onAdd?.({
                title: item.name || item.title,
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
