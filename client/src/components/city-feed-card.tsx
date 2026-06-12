import { useState } from "react";
import { useImpressionTracker } from "@/hooks/use-impression-tracker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar, ExternalLink, MapPin, Plus, Star, CheckCircle2, Wifi, Waves, Globe, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateGuestSessionId } from "@/lib/guest-session";
import { gemCategory, type MatchSuggestion } from "@/lib/feed-stream";
import { resolveBookability, type Bookability } from "@shared/bookability";

// Bookability (native | deeplink | info_only) is DERIVED, never stored. The single
// source of truth is `resolveBookability` in @shared/bookability — both this client
// and the server (location-view payload) read it.

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
  if (level === "native") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-teal-50 text-teal-700 whitespace-nowrap">
        Book on Traveloure
      </span>
    );
  }
  if (level === "deeplink") {
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
  city,
}: {
  suggestion: MatchSuggestion;
  id: string;
  city?: string;
}) {
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isRequest = suggestion.isRequest === true;

  async function handleRequest() {
    if (requested || submitting || !suggestion.offeringTypeKey) return;
    setSubmitting(true);
    try {
      const resp = await fetch("/api/services/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringTypeKey: suggestion.offeringTypeKey,
          city: city ?? "",
          guestSessionId: getOrCreateGuestSessionId(),
        }),
      });
      if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
      setRequested(true);
      toast({
        title: "Request recorded",
        description: `We'll notify you when ${suggestion.matchText} becomes available.`,
      });
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="border-t border-dashed border-border pt-2 mt-1 flex items-center gap-2 flex-wrap"
      data-testid={`suggestion-${id}`}
    >
      <span className="text-[11px] text-muted-foreground flex-1 min-w-[100px]">
        {suggestion.icon}{" "}
        {isRequest ? (
          <span className="text-foreground font-semibold">{suggestion.matchText}</span>
        ) : (
          <>
            matched:{" "}
            <strong className="text-foreground font-semibold">{suggestion.matchText}</strong>
          </>
        )}
      </span>
      {isRequest ? (
        requested ? (
          <span
            className="flex items-center gap-1 text-[11px] text-green-700 font-semibold flex-shrink-0"
            data-testid={`status-requested-service-${id}`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Requested
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2.5 flex-shrink-0 font-semibold border-dashed"
            disabled={submitting}
            data-testid={`btn-request-service-${id}`}
            data-offering-type={suggestion.offeringTypeKey}
            onClick={handleRequest}
          >
            {suggestion.actionLabel}
          </Button>
        )
      ) : (
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
      )}
    </div>
  );
}

// ─── More Info Sheet ──────────────────────────────────────────────────────────

type MoreInfoCardType = "gem" | "event" | "vendor-service" | "supply";

interface MoreInfoSheetProps {
  open: boolean;
  onClose: () => void;
  cardType: MoreInfoCardType;
  data: any;
}

function LocalsVsTouristsBar({ localRating, touristMentions }: { localRating?: number; touristMentions?: number }) {
  if (!localRating && !touristMentions) return null;
  const total = (localRating ?? 0) + (touristMentions ?? 0);
  if (total === 0) return null;
  const localPct = Math.round(((localRating ?? 0) / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
        <span>Locals {localPct}%</span>
        <span>Tourists {100 - localPct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
        <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${localPct}%` }} />
      </div>
    </div>
  );
}

function MoreInfoSheet({ open, onClose, cardType, data }: MoreInfoSheetProps) {
  const renderGemContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {data.description && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
        </div>
      )}

      {Array.isArray(data.bestFor) && data.bestFor.length > 2 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">Best for</p>
          <div className="flex flex-wrap gap-1.5">
            {(data.bestFor as string[]).map((tag) => (
              <span key={tag} className="text-[11px] bg-amber-50 text-amber-800 rounded-full px-2.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.address && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Address</p>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(data.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1.5 text-[13px] text-blue-600 hover:underline"
            data-testid="link-gem-address"
          >
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {data.address}
          </a>
        </div>
      )}

      <LocalsVsTouristsBar localRating={data.localRating} touristMentions={data.touristMentions} />

      {(data.discoveryStatus || data.daysUntilMainstream != null) && (
        <div className="bg-purple-50 rounded-lg px-3 py-2.5">
          {data.discoveryStatus && (
            <p className="text-[12px] font-semibold text-purple-700 capitalize">{data.discoveryStatus}</p>
          )}
          {data.daysUntilMainstream != null && (
            <p className="text-[12px] text-purple-600 mt-0.5">
              Goes mainstream in ~{data.daysUntilMainstream} days
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderEventContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {(data.description || data.shortDescription) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description || data.shortDescription}</p>
        </div>
      )}

      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">Highlights</p>
          <ul className="flex flex-col gap-1">
            {(data.highlights as string[]).map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <span className="text-amber-500 mt-0.5">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.venueName || data.venueAddress) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Venue</p>
          {data.venueName && <p className="text-[13px] text-foreground">{data.venueName}</p>}
          {data.venueAddress && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(data.venueAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-[13px] text-blue-600 hover:underline mt-0.5"
              data-testid="link-event-venue"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {data.venueAddress}
            </a>
          )}
        </div>
      )}

      {data.tips && (
        <div className="bg-amber-50 rounded-lg px-3 py-2.5">
          <p className="text-[12px] font-semibold text-amber-700 mb-0.5">Tips</p>
          <p className="text-[13px] text-amber-800 leading-relaxed">{data.tips}</p>
        </div>
      )}

      {(data.category || data.subcategory) && (
        <div className="flex gap-2">
          {data.category && (
            <span className="text-[11px] bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground capitalize">{data.category}</span>
          )}
          {data.subcategory && (
            <span className="text-[11px] bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground capitalize">{data.subcategory}</span>
          )}
        </div>
      )}
    </div>
  );

  const renderVendorServiceContent = () => (
    <div className="flex flex-col gap-4 pt-2">
      {data.description && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
        </div>
      )}

      {Array.isArray(data.whatIncluded) && data.whatIncluded.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">What's included</p>
          <ul className="flex flex-col gap-1">
            {(data.whatIncluded as string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.requirements && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Requirements</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.requirements}</p>
        </div>
      )}

      {(data.meetingPoint || data.pickupAvailable != null) && (
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">Meeting point</p>
          {data.meetingPoint && <p className="text-[13px] text-muted-foreground">{data.meetingPoint}</p>}
          {data.pickupAvailable != null && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {data.pickupAvailable ? "✓ Hotel pickup available" : "No pickup — self-arrival"}
            </p>
          )}
        </div>
      )}

      {data.cancellationPolicy && (
        <div className="bg-muted rounded-lg px-3 py-2.5">
          <p className="text-[12px] font-semibold text-foreground mb-0.5">Cancellation policy</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{data.cancellationPolicy}</p>
        </div>
      )}
    </div>
  );

  const renderSupplyContent = () => {
    const isHotel = data._kind === "supply-hotel";
    return (
      <div className="flex flex-col gap-4 pt-2">
        {data.description && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">About</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{data.description}</p>
          </div>
        )}

        {data.address && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1">Address</p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(data.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-[13px] text-blue-600 hover:underline"
              data-testid="link-supply-address"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {data.address}
            </a>
          </div>
        )}

        {isHotel && Array.isArray(data.amenities) && data.amenities.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-foreground mb-1.5">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {(data.amenities as string[]).map((a) => (
                <span key={a} className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  {a.toLowerCase().includes("wifi") ? <Wifi className="w-2.5 h-2.5" /> : <Waves className="w-2.5 h-2.5" />}
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {(data.rating || data.reviewCount) && (
          <div className="bg-amber-50 rounded-lg px-3 py-2.5">
            <p className="text-[12px] font-semibold text-amber-700 mb-0.5">Guest reviews</p>
            <div className="flex items-center gap-1.5">
              {data.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-[14px] font-bold text-foreground">{data.rating}</span>
                </div>
              )}
              {data.reviewCount && (
                <span className="text-[12px] text-muted-foreground">· {Number(data.reviewCount).toLocaleString()} reviews</span>
              )}
            </div>
          </div>
        )}

        {!isHotel && data.durationMinutes && (
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Duration: {data.durationMinutes >= 60
              ? `${Math.floor(data.durationMinutes / 60)}h ${data.durationMinutes % 60 > 0 ? `${data.durationMinutes % 60}m` : ""}`
              : `${data.durationMinutes}m`}
            </span>
          </div>
        )}
      </div>
    );
  };

  const titleMap: Record<MoreInfoCardType, string> = {
    gem: data.placeName ?? "Gem details",
    event: data.title ?? data.name ?? "Event details",
    "vendor-service": data.serviceName ?? "Service details",
    supply: data.name ?? data.title ?? "Details",
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl px-5 pb-8">
        <SheetHeader className="mb-2">
          <SheetTitle className="text-left text-[17px] leading-snug pr-8">{titleMap[cardType]}</SheetTitle>
        </SheetHeader>
        {cardType === "gem" && renderGemContent()}
        {cardType === "event" && renderEventContent()}
        {cardType === "vendor-service" && renderVendorServiceContent()}
        {cardType === "supply" && renderSupplyContent()}
      </SheetContent>
    </Sheet>
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
  cardPosition?: number;
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
  cardPosition,
}: CityFeedCardGemProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { photoUrl, loading } = useGemPhoto(gem.id, gem.placeName, city, gem.imageUrl);

  const resolvedBookability: Bookability = bookability ?? resolveBookability(gem);
  const { data: suggestion } = useQuery<MatchSuggestion | null>({
    queryKey: [`/api/gems/${gem.id}/matched-service`],
    staleTime: 5 * 60 * 1000,
  });
  const typeMeta = gemTypeMeta(gem.placeType);
  const isTrending = gem.gemScore !== undefined && Number(gem.gemScore) >= 8.5;

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  const isRow = layout === "row";

  const { ref: impressionRef, getImpressionId } = useImpressionTracker("gem", gem.id, city, cardPosition);

  // Body copy: prefer whyLocalsLoveIt, fall back to description
  const bodyText = gem.whyLocalsLoveIt || gem.description;

  // bestFor chips — show first 2 on card face
  const bestForFace: string[] = Array.isArray(gem.bestFor) ? (gem.bestFor as string[]).slice(0, 2) : [];

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
      {/* Type tag + booking badge + priceRange */}
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
        {gem.priceRange && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600" data-testid={`gem-price-range-${gem.id}`}>
            {gem.priceRange}
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {gem.placeName}
      </h3>

      {/* Body copy: whyLocalsLoveIt or description — column layout */}
      {!compact && !isRow && bodyText && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{bodyText}</p>
      )}

      {/* Row layout body copy */}
      {isRow && bodyText && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{bodyText}</p>
      )}

      {/* bestFor chips */}
      {!compact && bestForFace.length > 0 && (
        <div className="flex gap-1 flex-wrap" data-testid={`gem-best-for-chips-${gem.id}`}>
          {bestForFace.map((tag) => (
            <span key={tag} className="text-[10px] bg-amber-50 text-amber-800 rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Neighborhood tag */}
      {gem.neighborhood && !isRow && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span>{gem.neighborhood}</span>
        </div>
      )}

      {/* Matched-service suggestion strip */}
      {!compact && suggestion && <MatchedServiceStrip suggestion={suggestion} id={gem.id} city={city} />}

      {/* Actions */}
      {!compact && (
        <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
          {resolvedBookability !== "info_only" && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              asChild
              onClick={() => {
                const impId = getImpressionId();
                if (impId) {
                  fetch("/api/affiliates/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ partner: "discover", destination: city, impressionId: impId }),
                  }).catch(() => {});
                }
              }}
            >
              <a href={suggestion?.href ?? "#"}>
                {resolvedBookability === "deeplink" ? "Reserve" : "Book"}
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
                sourceImpressionId: getImpressionId(),
                sourceContentId: gem.id,
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
          <button
            onClick={() => setSheetOpen(true)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            data-testid={`btn-more-info-gem-${gem.id}`}
          >
            More info
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        ref={impressionRef}
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
      <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="gem" data={gem} />
    </>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

interface CityFeedCardEventProps {
  event: any;
  city: string;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  className?: string;
  cardPosition?: number;
}

export function CityFeedCardEvent({ event, city, scheduledDate, onAdd, className, cardPosition }: CityFeedCardEventProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dbImageUrl = event.image || event.imageUrl || null;
  const eventName = event.title || event.name || "";
  const { photoUrl, loading } = useGemPhoto(
    `event-${event.id ?? event.eventId ?? eventName}`,
    eventName,
    city,
    dbImageUrl,
  );

  const bookability: Bookability = resolveBookability({ ...event, externalUrl: event.url });
  const { ref: impressionRefEvt, getImpressionId: getImpIdEvt } = useImpressionTracker(
    "event",
    String(event.id ?? event.eventId ?? eventName),
    city,
    cardPosition,
  );
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

  // Price chip
  const priceChip = event.isFree
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-green-50 text-green-700" data-testid={`event-free-badge-${event.id}`}>Free</span>
    : (event.priceRange || event.minPrice)
      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600" data-testid={`event-price-${event.id}`}>{event.priceRange ?? `From $${event.minPrice}`}</span>
      : null;

  return (
    <>
      <div
        ref={impressionRefEvt}
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
            {priceChip}
          </div>

          <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{eventName}</h3>

          {/* 2-line description */}
          {(event.description || event.shortDescription) && (
            <p className="text-[12px] text-muted-foreground line-clamp-2" data-testid={`event-description-${event.id}`}>
              {event.description || event.shortDescription}
            </p>
          )}

          {event.date && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          )}

          {/* Venue name */}
          {event.venueName && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`event-venue-${event.id}`}>
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{event.venueName}</span>
            </div>
          )}

          <MatchedServiceStrip suggestion={eventSuggestion} id={`event-${event.id ?? event.eventId}`} />

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            {event.url && (
              <Button
                size="sm"
                className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700"
                asChild
                onClick={() => {
                  const impId = getImpIdEvt();
                  if (impId) {
                    fetch("/api/affiliates/track", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ partner: "discover-event", destination: city, impressionId: impId }),
                    }).catch(() => {});
                  }
                }}
              >
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
              onClick={() => onAdd?.({
                title: eventName,
                city,
                type: "event",
                scheduledDate,
                sourceImpressionId: getImpIdEvt(),
                sourceContentId: String(event.id ?? event.eventId ?? ""),
              })}
              data-testid={`btn-add-event-${event.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" asChild>
              <a href="/local-experts">💬 Ask</a>
            </Button>
            <button
              onClick={() => setSheetOpen(true)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              data-testid={`btn-more-info-event-${event.id}`}
            >
              More info
            </button>
          </div>
        </div>
      </div>
      <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="event" data={event} />
    </>
  );
}

// ─── Vendor Service card ──────────────────────────────────────────────────────

interface CityFeedCardVendorServiceProps {
  service: any;
  city: string;
  className?: string;
}

export function CityFeedCardVendorService({ service, city, className }: CityFeedCardVendorServiceProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const imageUrl = service.serviceImage || service.vendorPhoto || null;
  const { photoUrl, loading } = useGemPhoto(`vsvc-${service.id}`, service.serviceName, city, imageUrl);

  const externalUrl: string | null = service.vendorBookingLink || service.vendorWebsite || null;

  const tag: string = (() => {
    const tags: string[] = service.contentAffinityTags ?? [];
    if (tags.length > 0) return tags[0];
    if (service.categoryName) return service.categoryName;
    return service.serviceType ?? "Service";
  })();

  const priceDisplay: string | null = (() => {
    if (!service.price) return null;
    const n = parseFloat(service.price);
    if (isNaN(n)) return null;
    if (n < 1) return "Custom quote";
    return `$${n % 1 === 0 ? n : n.toFixed(0)}`;
  })();

  const { srcSet, sizes } = buildSrcSet(photoUrl);

  // whatIncluded chips — first 2 on card face
  const includedFace: string[] = Array.isArray(service.whatIncluded)
    ? (service.whatIncluded as string[]).slice(0, 2)
    : [];

  return (
    <>
      <div
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col",
          className,
        )}
        data-testid={`feed-card-vendor-svc-${service.id}`}
      >
        <div className="h-[104px] relative overflow-hidden bg-teal-50 flex items-center justify-center text-teal-600 flex-shrink-0">
          {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
          {photoUrl && (
            <img
              src={photoUrl}
              srcSet={srcSet}
              sizes={sizes}
              alt={service.serviceName}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {!photoUrl && !loading && (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Tag className="w-8 h-8 text-primary/40" />
            </div>
          )}
          <span className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
            <BookingBadge level={resolveBookability({ externalUrl })} />
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

        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-teal-50 text-teal-700 capitalize">
              {tag}
            </span>
            <BookingBadge level="native" />
          </div>

          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{service.serviceName}</h3>
            {service.averageRating && (
              <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{Number(service.averageRating).toFixed(1)}</span>
              </div>
            )}
          </div>

          {service.shortDescription && (
            <p className="text-[12px] text-muted-foreground line-clamp-2">{service.shortDescription}</p>
          )}

          {/* whatIncluded chips */}
          {includedFace.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid={`svc-included-chips-${service.id}`}>
              {includedFace.map((item) => (
                <span key={item} className="text-[10px] bg-green-50 text-green-700 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {item}
                </span>
              ))}
            </div>
          )}

          {/* deliveryTimeframe chip */}
          {service.deliveryTimeframe && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`svc-delivery-${service.id}`}>
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{service.deliveryTimeframe}</span>
            </div>
          )}

          {priceDisplay && (
            <span className="text-sm font-bold text-foreground">{priceDisplay}</span>
          )}

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => (window.location.href = `/services/${service.id}`)}
              data-testid={`btn-inquire-svc-${service.id}`}
            >
              Inquire
            </Button>
            {externalUrl && (
              <Button size="sm" variant="outline" className="h-7 px-2" asChild>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`btn-website-svc-${service.id}`}>
                  <Globe className="w-3 h-3" />
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" asChild>
              <a href="/local-experts">💬 Ask</a>
            </Button>
            <button
              onClick={() => setSheetOpen(true)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              data-testid={`btn-more-info-svc-${service.id}`}
            >
              More info
            </button>
          </div>
        </div>
      </div>
      <MoreInfoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cardType="vendor-service" data={service} />
    </>
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
  cardPosition?: number;
}

export function CityFeedCardSupply({ item, kind, city, scheduledDate, onAdd, className, cardPosition }: CityFeedCardSupplyProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dbImageUrl = item.media?.[0]?.url || item.imageUrl || null;
  const itemName = item.name || item.title || "";
  const isHotel = kind === "supply-hotel";

  const { photoUrl, loading } = useGemPhoto(
    `supply-${item.id ?? itemName}`,
    itemName,
    city,
    dbImageUrl,
  );

  const { ref: impressionRefSupply, getImpressionId: getImpIdSupply } = useImpressionTracker(
    kind,
    String(item.id ?? itemName),
    city,
    cardPosition,
  );

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";
  const { srcSet, sizes } = buildSrcSet(photoUrl);

  // Price chip
  const priceText = item.price
    ? (typeof item.price === "string" ? item.price : `$${item.price}`)
    : item.priceRange ?? null;

  // Duration for activities
  const durationLabel = !isHotel && item.durationMinutes
    ? item.durationMinutes >= 60
      ? `${Math.floor(item.durationMinutes / 60)}h${item.durationMinutes % 60 > 0 ? ` ${item.durationMinutes % 60}m` : ""}`
      : `${item.durationMinutes}m`
    : null;

  // reviewCount: show alongside star rating
  const reviewCountLabel = item.reviewCount
    ? ` · ${Number(item.reviewCount).toLocaleString()} reviews`
    : "";

  return (
    <>
      <div
        ref={impressionRefSupply}
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
              isHotel ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800",
            )}>
              {isHotel ? "Hotel" : "Activity"}
            </span>
            <BookingBadge level="native" />
            {priceText && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-gray-100 text-gray-600"
                data-testid={`supply-price-${item.id}`}
              >
                {priceText}
              </span>
            )}
          </div>

          <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">{itemName}</h3>

          {/* 2-line description */}
          {item.description && (
            <p className="text-[12px] text-muted-foreground line-clamp-2" data-testid={`supply-description-${item.id}`}>
              {item.description}
            </p>
          )}

          {/* Star rating + reviewCount */}
          {item.rating && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`supply-rating-${item.id}`}>
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{item.rating}{reviewCountLabel}</span>
            </div>
          )}

          {/* Duration chip for activities */}
          {durationLabel && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`supply-duration-${item.id}`}>
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>{durationLabel}</span>
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

          <div className="flex gap-1.5 pt-0.5 flex-wrap items-center">
            <Button size="sm" className="h-7 text-xs px-3">Book</Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-3"
              onClick={() => onAdd?.({
                title: itemName,
                city,
                type: isHotel ? "hotel" : "activity",
                scheduledDate,
                sourceImpressionId: getImpIdSupply(),
                sourceContentId: String(item.id ?? ""),
              })}
              data-testid={`btn-add-supply-${item.id}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" asChild>
              <a href="/local-experts">💬 Ask</a>
            </Button>
            <button
              onClick={() => setSheetOpen(true)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              data-testid={`btn-more-info-supply-${item.id}`}
            >
              More info
            </button>
          </div>
        </div>
      </div>
      <MoreInfoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        cardType="supply"
        data={{ ...item, _kind: kind }}
      />
    </>
  );
}
