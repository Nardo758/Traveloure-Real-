import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink, MapPin, Plus, Star, Wifi, Waves, ChevronRight, Tag, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { matchedServiceSuggestion } from "@/lib/feed-stream";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Bookability = "platform" | "affiliate" | "browse";

/**
 * Derive bookability state from a data record's URL/ID fields.
 * - "platform"  → has an internal provider service ID (in-app booking)
 * - "affiliate" → has an external affiliate / booking URL
 * - "browse"    → no bookable link found
 */
export function computeBookability(data: any): Bookability {
  if (!data) return "browse";
  if (data.providerServiceId || data.platformBookingUrl) return "platform";
  if (data.affiliateUrl || data.affiliateLink || data.bookingUrl || data.externalUrl) return "affiliate";
  return "browse";
}

/**
 * Build srcSet + sizes for retina delivery.
 * Unsplash URLs accept a `w` query parameter — we emit 800w and 1600w variants.
 * All other URLs fall back to a single-source srcSet (browser picks 1x).
 */
function buildSrcSet(url: string | null | undefined): { srcSet?: string; sizes: string } {
  const sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
  if (!url) return { sizes };
  if (url.includes("unsplash.com") || url.includes("images.unsplash.com")) {
    const [base, qs = ""] = url.split("?");
    const p1 = new URLSearchParams(qs);
    p1.set("w", "800");
    const p2 = new URLSearchParams(qs);
    p2.set("w", "1600");
    return { srcSet: `${base}?${p1} 800w, ${base}?${p2} 1600w`, sizes };
  }
  return { sizes };
}

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
  const label =
    level === "platform" ? "Platform booking" : level === "affiliate" ? "Affiliate link" : "Browse only";
  return <span className={cn("w-2 h-2 rounded-full", color)} title={label} />;
}

/** Reusable matched-service suggestion row rendered at the bottom of any card body. */
function MatchedServiceStrip({
  suggestion,
  id,
}: {
  suggestion: { label: string; icon: string; href: string };
  id: string;
}) {
  return (
    <a
      href={suggestion.href}
      className="flex items-center justify-between gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border-t pt-1.5 mt-1"
      data-testid={`suggestion-${id}`}
    >
      <span>
        {suggestion.icon} {suggestion.label}
      </span>
      <ChevronRight className="w-3 h-3 flex-shrink-0" />
    </a>
  );
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
  bookability,
  onAdd,
  compact = false,
  className,
}: CityFeedCardGemProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);

  if (!loading && !photoUrl) return null;

  // Derive bookability from data if caller didn't supply an explicit override
  const resolvedBookability: Bookability = bookability ?? computeBookability(gem);
  const suggestion = matchedServiceSuggestion(gem.placeType);
  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

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
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            srcSet={srcSet}
            sizes={sizes}
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
          <BookabilityDot level={resolvedBookability} />
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
        {!compact && suggestion && <MatchedServiceStrip suggestion={suggestion} id={gem.id} />}

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

  // Events with external URLs are affiliate-bookable
  const bookability: Bookability = computeBookability({ ...event, externalUrl: event.url });
  const eventSuggestion = { label: "Get a local guide", icon: "🏅", href: "/local-experts" };
  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

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
            srcSet={srcSet}
            sizes={sizes}
            alt={eventName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level={bookability} />
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

        {/* Matched-service suggestion strip */}
        <MatchedServiceStrip suggestion={eventSuggestion} id={`event-${event.id ?? event.eventId}`} />

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

// ─── Vendor Service card (platform-bookable provider_services) ────────────────

interface CityFeedCardVendorServiceProps {
  service: any;
  city: string;
  className?: string;
}

/**
 * Card for a platform-seeded vendor service (wedding, corporate, experience).
 * Shows a "platform" bookability dot always; additionally renders an external
 * "Visit Website" button when the vendor's form has a booking_link or website.
 */
export function CityFeedCardVendorService({ service, city, className }: CityFeedCardVendorServiceProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const imageUrl = service.serviceImage || service.vendorPhoto || null;
  const { photoUrl, loading } = useGemPhoto(
    `vsvc-${service.id}`,
    service.serviceName,
    city,
    imageUrl,
  );

  const externalUrl: string | null = service.vendorBookingLink || service.vendorWebsite || null;
  const bookability: Bookability = "platform";

  const tag: string | null = (() => {
    const tags: string[] = service.contentAffinityTags ?? [];
    if (tags.length > 0) return tags[0];
    if (service.categoryName) return service.categoryName;
    return service.serviceType ?? null;
  })();

  const priceDisplay: string | null = (() => {
    if (!service.price) return null;
    const n = parseFloat(service.price);
    if (isNaN(n)) return null;
    if (n < 1) return "Custom quote";
    return `$${n % 1 === 0 ? n : n.toFixed(0)}`;
  })();

  const { srcSet, sizes } = buildSrcSet(photoUrl);

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-vendor-svc-${service.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            srcSet={srcSet}
            sizes={sizes}
            alt={service.serviceName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        {!photoUrl && !loading && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Tag className="w-8 h-8 text-primary/40" />
          </div>
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level={bookability} />
        </span>
        {service.isFeatured && (
          <span className="absolute top-2 left-2 bg-amber-500/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
            Featured
          </span>
        )}
        {!service.isFeatured && tag && (
          <span className="absolute top-2 left-2 bg-primary/80 text-white text-[10px] font-medium rounded-full px-2 py-0.5 capitalize">
            {tag}
          </span>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{service.serviceName}</h3>
          {service.averageRating && (
            <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{Number(service.averageRating).toFixed(1)}</span>
            </div>
          )}
        </div>

        {service.shortDescription && (
          <p className="text-xs text-muted-foreground line-clamp-2">{service.shortDescription}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          {service.neighborhood && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="capitalize">{service.neighborhood.replace(/-/g, " ")}</span>
            </div>
          )}
          {priceDisplay && (
            <span className="text-xs font-semibold text-primary flex-shrink-0">{priceDisplay}</span>
          )}
        </div>

        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => (window.location.href = `/services/${service.id}`)}
            data-testid={`btn-inquire-svc-${service.id}`}
          >
            Inquire
          </Button>
          {externalUrl && (
            <Button size="sm" variant="outline" className="h-7 px-2 flex-shrink-0" asChild>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`btn-website-svc-${service.id}`}>
                <Globe className="w-3 h-3" />
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

  // Supply items are always platform-booked (sourced from Viator/platform catalog)
  const bookability: Bookability = "platform";
  const supplySuggestion = isHotel
    ? { label: "Book airport transfer", icon: "🚖", href: "/experiences/transport" }
    : { label: "Get a local guide", icon: "🏅", href: "/local-experts" };
  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

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
            srcSet={srcSet}
            sizes={sizes}
            alt={itemName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
          <BookabilityDot level={bookability} />
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

        {/* Matched-service suggestion strip */}
        <MatchedServiceStrip suggestion={supplySuggestion} id={`supply-${item.id}`} />

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
