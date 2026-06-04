import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink, MapPin, Plus, Star, Wifi, Waves, ChevronRight, Tag, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { matchedServiceSuggestion, gemCategory, type MatchSuggestion } from "@/lib/feed-stream";

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

// ─── Type metadata ─────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  emoji: string;
  tagBg: string;
  tagText: string;
  phBg: string;
  phText: string;
}

function gemTypeMeta(placeType: string | null | undefined): TypeMeta {
  const cat = gemCategory(placeType);
  const t = (placeType ?? "").toLowerCase();

  if (cat === "photo_spots") {
    return { label: "Photo spot", emoji: "📷", tagBg: "bg-teal-50", tagText: "text-teal-700", phBg: "bg-teal-50", phText: "text-teal-600" };
  }
  if (cat === "stay") {
    const isMarquee = ["ryokan", "resort", "boutique"].some((k) => t.includes(k));
    return {
      label: isMarquee ? "Marquee stay" : "Stay",
      emoji: isMarquee ? "🏯" : "🏨",
      tagBg: "bg-blue-50",
      tagText: "text-blue-700",
      phBg: "bg-blue-50",
      phText: "text-blue-600",
    };
  }
  if (cat === "eat") {
    return { label: "Eat", emoji: "🍵", tagBg: "bg-pink-50", tagText: "text-pink-700", phBg: "bg-pink-50", phText: "text-pink-600" };
  }

  // "do" — distinguish landmark, day-trip, and general attraction
  const isLandmark = ["temple", "shrine", "palace", "castle", "landmark", "monument"].some((k) => t.includes(k));
  const isDayTrip = ["day trip", "day-trip", "daytrip"].some((k) => t.includes(k));
  if (isDayTrip) {
    return { label: "Day trip", emoji: "🚌", tagBg: "bg-indigo-50", tagText: "text-indigo-700", phBg: "bg-indigo-50", phText: "text-indigo-600" };
  }
  if (isLandmark) {
    return { label: "Landmark", emoji: "🌉", tagBg: "bg-stone-100", tagText: "text-stone-700", phBg: "bg-stone-100", phText: "text-stone-600" };
  }
  return { label: "Do", emoji: "⛩", tagBg: "bg-amber-50", tagText: "text-amber-800", phBg: "bg-amber-50", phText: "text-amber-700" };
}

// ─── Booking badge ─────────────────────────────────────────────────────────────

function BookingBadge({ level, trending }: { level: Bookability; trending?: boolean }) {
  if (trending) {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-orange-100 text-orange-700 whitespace-nowrap">
        🔥 Trending
      </span>
    );
  }
  if (level === "platform") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-teal-50 text-teal-700 whitespace-nowrap">
        Book on Traveloure
      </span>
    );
  }
  if (level === "affiliate") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-blue-50 text-blue-700 whitespace-nowrap">
        Affiliate link
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-500 whitespace-nowrap">
      Not bookable
    </span>
  );
}

// ─── Match strip ──────────────────────────────────────────────────────────────

function MatchedServiceStrip({
  suggestion,
  id,
}: {
  suggestion: MatchSuggestion;
  id: string;
}) {
  return (
    <div
      className="border-t border-dashed border-border pt-2 mt-1 flex items-center gap-2 flex-wrap"
      data-testid={`suggestion-${id}`}
    >
      <span className="text-[11px] text-muted-foreground flex-1 min-w-[100px]">
        {suggestion.icon} matched:{" "}
        <strong className="text-foreground font-semibold">{suggestion.matchText}</strong>
      </span>
      <Button
        size="sm"
        className={cn(
          "h-6 text-[11px] px-2.5 flex-shrink-0 font-semibold",
          suggestion.actionVariant === "affiliate"
            ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
            : "",
        )}
        asChild
      >
        <a href={suggestion.href}>{suggestion.actionLabel}</a>
      </Button>
    </div>
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
  layout?: "column" | "row";
  className?: string;
}

export function CityFeedCardGem({
  gem,
  city,
  scheduledDate,
  bookability,
  onAdd,
  compact = false,
  layout = "column",
  className,
}: CityFeedCardGemProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);

  const resolvedBookability: Bookability = bookability ?? computeBookability(gem);
  const suggestion = matchedServiceSuggestion(gem.placeType);
  const typeMeta = gemTypeMeta(gem.placeType);
  const isTrending = gem.gemScore !== undefined && Number(gem.gemScore) >= 8.5;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  const isRow = layout === "row";

  // Photo / placeholder area
  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center",
        typeMeta.phBg,
        typeMeta.phText,
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {!loading && photoUrl && (
        <img
          src={photoUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={gem.placeName}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {!loading && !photoUrl && (
        <span className="text-2xl">{typeMeta.emoji}</span>
      )}
      {gem.isSecret && (
        <span className="absolute bottom-1.5 left-1.5 bg-purple-600/90 text-white text-[9px] font-medium rounded px-1.5 py-0.5">
          Hidden Gem
        </span>
      )}
    </div>
  );

  // Card body
  const cardBody = (
    <div className={cn("p-3 flex flex-col gap-1.5 flex-1 min-w-0")}>
      {/* Type tag + booking badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
            typeMeta.tagBg,
            typeMeta.tagText,
          )}
        >
          {typeMeta.label}
        </span>
        <BookingBadge level={resolvedBookability} trending={isTrending} />
      </div>

      {/* Name */}
      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {gem.placeName}
      </h3>

      {/* Description — only in column layout, non-compact */}
      {!compact && !isRow && gem.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{gem.description}</p>
      )}

      {/* Row layout description */}
      {isRow && gem.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{gem.description}</p>
      )}

      {/* Neighborhood tag */}
      {gem.neighborhood && !isRow && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span>{gem.neighborhood}</span>
        </div>
      )}

      {/* Matched-service suggestion strip */}
      {!compact && suggestion && <MatchedServiceStrip suggestion={suggestion} id={gem.id} />}

      {/* Actions */}
      {!compact && (
        <div className="flex gap-1.5 pt-0.5 flex-wrap">
          {resolvedBookability !== "browse" && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              asChild
            >
              <a href={suggestion?.href ?? "#"}>
                {resolvedBookability === "affiliate" ? "Reserve" : "Book"}
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3"
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
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            asChild
            data-testid={`btn-ask-gem-${gem.id}`}
          >
            <a href="/local-experts">💬 Ask</a>
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        isRow ? "flex flex-row" : "flex flex-col",
        className,
      )}
      data-testid={`feed-card-gem-${gem.id}`}
    >
      {photoArea}
      {cardBody}
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

  const bookability: Bookability = computeBookability({ ...event, externalUrl: event.url });
  const eventSuggestion: MatchSuggestion = {
    icon: "🎫",
    matchText: "tickets available",
    actionLabel: "Tickets",
    actionVariant: "affiliate",
    href: event.url || "/experiences",
  };
  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col",
        className,
      )}
      data-testid={`feed-card-event-${event.id ?? event.eventId}`}
    >
      <div className="h-[104px] relative overflow-hidden bg-pink-50 flex items-center justify-center text-pink-600 flex-shrink-0">
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            srcSet={srcSet}
            sizes={sizes}
            alt={eventName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        {!loading && !photoUrl && <span className="text-2xl">🏮</span>}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-pink-50 text-pink-700">
            Event{event.date ? ` · ${new Date(event.date).toLocaleDateString("en-US", { month: "short" })}` : ""}
          </span>
          <BookingBadge level={bookability} />
        </div>

        <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{eventName}</h3>

        {event.date && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
        )}

        <MatchedServiceStrip suggestion={eventSuggestion} id={`event-${event.id ?? event.eventId}`} />

        <div className="flex gap-1.5 pt-0.5 flex-wrap">
          {event.url && (
            <Button size="sm" className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700" asChild>
              <a href={event.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3 mr-1" />
                Tickets
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3"
            onClick={() => onAdd?.({ title: eventName, city, type: "event", scheduledDate })}
            data-testid={`btn-add-event-${event.id}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" asChild>
            <a href="/local-experts">💬 Ask</a>
          </Button>
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
          <BookingBadge level={bookability} />
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

  const supplySuggestion: MatchSuggestion = isHotel
    ? {
        icon: "🚗",
        matchText: "private car from city centre · ¥9,000",
        actionLabel: "Book both",
        actionVariant: "platform",
        href: "/experiences/transport",
      }
    : {
        icon: "🧭",
        matchText: "local guide · ¥6,000",
        actionLabel: "Book guide",
        actionVariant: "platform",
        href: "/local-experts",
      };

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col",
        className,
      )}
      data-testid={`feed-card-${kind}-${item.id}`}
    >
      <div
        className={cn(
          "h-[104px] relative overflow-hidden flex items-center justify-center text-2xl flex-shrink-0",
          isHotel ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-700",
        )}
      >
        {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
        {photoUrl && (
          <img
            src={photoUrl}
            srcSet={srcSet}
            sizes={sizes}
            alt={itemName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        {!loading && !photoUrl && <span>{isHotel ? "🏨" : "🎯"}</span>}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
            isHotel ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800",
          )}>
            {isHotel ? "Hotel" : "Activity"}
          </span>
          <BookingBadge level="platform" />
        </div>

        <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{itemName}</h3>

        {item.rating && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
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

        <MatchedServiceStrip suggestion={supplySuggestion} id={`supply-${item.id}`} />

        <div className="flex gap-1.5 pt-0.5 flex-wrap">
          <Button size="sm" className="h-7 text-xs px-3">Book</Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3"
            onClick={() => onAdd?.({ title: itemName, city, type: isHotel ? "hotel" : "activity", scheduledDate })}
            data-testid={`btn-add-supply-${item.id}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" asChild>
            <a href="/local-experts">💬 Ask</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
