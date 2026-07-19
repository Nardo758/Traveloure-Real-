import { useRef, useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { trackCityView } from "@/hooks/use-recently-viewed";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, Plus, ArrowLeft, UserCheck, ChevronRight, Sparkles, Info, MapPin, ExternalLink, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { CityFeedCardGem, CityFeedCardEvent, CityFeedCardSupply, CityFeedCardVendorService } from "@/components/city-feed-card";
import { CityFeedCardExpert } from "@/components/city-feed-card-expert";
import { NeighborhoodContainer } from "@/components/neighborhood-container";
import { buildFeedStream, filterFeedStream, type FeedItem } from "@/lib/feed-stream";
import { useAskExpert } from "@/lib/use-ask-expert";
import {
  composeDiscoverFeed,
  defaultIsRelated,
  DEFAULT_FEED_COMPOSITION_CONFIG,
  type FeedCompositionConfig,
  type WantedSlotData,
} from "@/lib/feed-composition";
import { useUpsellSlot } from "@/components/UpsellSlot";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

interface LocationViewPayload {
  city: string;
  country: string | null;
  generatedAt: string;
  hero: SectionResult<any>;
  recommendations: SectionResult<any>;
  enriched?: SectionResult<any>;
  events: SectionResult<any>;
  neighborhoods: SectionResult<any[]>;
  gems: SectionResult<any[]>;
  services?: SectionResult<any[]>;
}

interface CityMediaResponse {
  hero: any | null;
  gallery: any[];
  videos: any[];
  byAttraction: Record<string, any[]>;
}

// ─── Teal gradient hero ───────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * Curated hero images for popular cities — used when no gem photo is available.
 * Keys are lowercase city names.
 */
const CURATED_HERO_IMAGES: Record<string, string> = {
  tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80",
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80",
  paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",
  london: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80",
  "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80",
  barcelona: "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80",
  rome: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80",
  amsterdam: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1200&q=80",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  bangkok: "https://images.unsplash.com/photo-1508009603885-50cf7c8dd0d5?auto=format&fit=crop&w=1200&q=80",
  singapore: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=80",
  dubai: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80",
};

function toTitleCase(str: string): string {
  return str
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

type CoverPhotoCredit = { name: string; url: string } | null;

function PhotoCreditBadge({ credit }: { credit: CoverPhotoCredit }) {
  if (!credit) return null;
  return (
    <a
      href={credit.url}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-2 right-2 z-20 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-white/80 hover:text-white transition-colors"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      data-testid="photo-credit-badge"
    >
      📷 {credit.name}
    </a>
  );
}

function HeroSection({
  city,
  heroData,
  scheduledDate,
  onDismissDate,
  coverPhotoUrl,
  coverPhotoCredit,
}: {
  city: string;
  heroData: any;
  scheduledDate: string | null;
  onDismissDate: () => void;
  coverPhotoUrl?: string | null;
  coverPhotoCredit?: CoverPhotoCredit;
}) {
  const displayCity = toTitleCase(city);
  const cityIntel = heroData?.city;
  const pulse = cityIntel?.pulseScore;
  const highlight = cityIntel?.currentHighlight;
  const highlightEmoji = cityIntel?.highlightEmoji ?? "✨";

  const dateMode = !!scheduledDate;
  const parsedDate = scheduledDate ? new Date(scheduledDate + "T12:00:00") : null;
  const monthIndex = parsedDate ? parsedDate.getMonth() : null;
  const monthName = monthIndex !== null ? MONTH_NAMES[monthIndex] : null;
  const dayOfMonth = parsedDate ? parsedDate.getDate() : null;

  const seasonalEntry = monthIndex !== null && cityIntel?.aiSeasonalHighlights
    ? (cityIntel.aiSeasonalHighlights as Array<{ month: number; rating: string; highlight: string }>)
        .find((s) => s.month === monthIndex + 1) ?? null
    : null;

  const seasonLine = seasonalEntry
    ? `${seasonalEntry.rating}/10 in ${monthName} · ${seasonalEntry.highlight}${cityIntel?.crowdLevel ? ` · ${cityIntel.crowdLevel}` : ""}`
    : highlight
    ? `${highlightEmoji} ${highlight}`
    : null;

  const datePillLabel = parsedDate
    ? `Planning ${monthName} ${dayOfMonth}`
    : null;


  if (dateMode) {
    if (coverPhotoUrl) {
      return (
        <div
          className="relative rounded-xl overflow-hidden px-5 py-4 flex justify-between items-start gap-3 min-h-[96px]"
          style={{
            backgroundImage: `url(${coverPhotoUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          data-testid="section-hero"
        >
          {/* Dark overlay */}
          <div className="absolute inset-0 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(4,52,44,0.82) 0%, rgba(4,52,44,0.55) 100%)" }} />
          <div className="relative z-10">
            <h1
              className="text-[22px] font-medium leading-tight text-white"
              data-testid="text-city-name"
            >
              {displayCity}
            </h1>
            {seasonLine && (
              <div className="text-[13px] mt-1 text-green-200">
                🌸 {seasonLine}
              </div>
            )}
            {datePillLabel && (
              <div
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-0.5 rounded-full text-[12px]"
                style={{ background: "rgba(255,255,255,0.2)", color: "#A7F3D0" }}
              >
                📅 {datePillLabel}
                {/* D7 date-continuity: back to the By-Date calendar
                    (/discover?tab=events) to pick a different date. Additive —
                    the ✕ dismiss below is untouched. */}
                <a
                  href="/discover?tab=events"
                  className="ml-1 underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
                  data-testid="link-change-date"
                >
                  Change date
                </a>
                <button
                  onClick={onDismissDate}
                  className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                  data-testid="button-dismiss-date"
                  aria-label="Clear date"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          {pulse !== undefined && (
            <div className="relative z-10 text-center flex-shrink-0" data-testid="pulse-badge">
              <b className="block text-[20px] font-medium leading-tight text-green-300">{pulse}</b>
              <span className="text-[11px] text-green-400">pulse</span>
            </div>
          )}
          <PhotoCreditBadge credit={coverPhotoCredit ?? null} />
        </div>
      );
    }

    return (
      <div
        className="relative rounded-xl px-5 py-4 flex justify-between items-start gap-3"
        style={{ background: "#E1F5EE" }}
        data-testid="section-hero"
      >
        <div>
          <h1
            className="text-[22px] font-medium leading-tight"
            style={{ color: "#04342C" }}
            data-testid="text-city-name"
          >
            {displayCity}
          </h1>
          {seasonLine && (
            <div className="text-[13px] mt-1" style={{ color: "#0F6E56" }}>
              🌸 {seasonLine}
            </div>
          )}
          {datePillLabel && (
            <div
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-0.5 rounded-full text-[12px]"
              style={{ background: "rgba(255,255,255,0.55)", color: "#0F6E56" }}
            >
              📅 {datePillLabel}
              {/* D7 date-continuity: back to the By-Date calendar
                  (/discover?tab=events) to pick a different date. Additive —
                  the ✕ dismiss below is untouched. */}
              <a
                href="/discover?tab=events"
                className="ml-1 underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
                data-testid="link-change-date"
              >
                Change date
              </a>
              <button
                onClick={onDismissDate}
                className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                data-testid="button-dismiss-date"
                aria-label="Clear date"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        {pulse !== undefined && (
          <div className="text-center flex-shrink-0" data-testid="pulse-badge">
            <b className="block text-[20px] font-medium leading-tight" style={{ color: "#0F6E56" }}>{pulse}</b>
            <span className="text-[11px]" style={{ color: "#0F6E56" }}>pulse</span>
          </div>
        )}
      </div>
    );
  }

  if (coverPhotoUrl) {
    return (
      <div
        className="relative rounded-xl overflow-hidden px-6 py-8 min-h-[160px] flex flex-col justify-end"
        style={{
          backgroundImage: `url(${coverPhotoUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        data-testid="section-hero"
      >
        {/* Dark gradient overlay — bottom-heavy so text is legible */}
        <div
          className="absolute inset-0 rounded-xl"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.10) 100%)" }}
        />
        <div className="relative z-10">
          <h1
            className="text-[34px] font-bold tracking-tight text-white leading-tight drop-shadow"
            data-testid="text-city-name"
          >
            {displayCity}
          </h1>
          {highlight ? (
            <div className="text-sm mt-1 text-white/80">
              {highlightEmoji} {highlight}
            </div>
          ) : null}
        </div>
        {pulse !== undefined && (
          <div
            className="absolute top-5 right-5 z-10 rounded-xl px-3.5 py-2 text-center"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <b className="block text-lg font-bold leading-tight text-green-300">
              {pulse}
            </b>
            <span className="text-[10px] uppercase tracking-widest text-green-400">
              pulse
            </span>
          </div>
        )}
        <PhotoCreditBadge credit={coverPhotoCredit ?? null} />
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden px-6 py-6"
      style={{ background: "linear-gradient(135deg, #0F6E56 0%, #0c5a47 100%)" }}
      data-testid="section-hero"
    >
      <h1
        className="text-[30px] font-bold tracking-tight text-white leading-tight"
        data-testid="text-city-name"
      >
        {displayCity}
      </h1>
      {highlight ? (
        <div className="text-sm mt-1" style={{ color: "#5DCAA5" }}>
          {highlightEmoji} {highlight}
        </div>
      ) : null}
      {pulse !== undefined && (
        <div
          className="absolute top-5 right-5 rounded-xl px-3.5 py-2 text-center"
          style={{ background: "#04342C" }}
        >
          <b
            className="block text-lg font-bold leading-tight"
            style={{ color: "#5DCAA5" }}
          >
            {pulse}
          </b>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "#5DCAA5" }}
          >
            pulse
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({
  heroData,
  neighborhoodCount,
  serviceCount,
}: {
  heroData: any;
  neighborhoodCount: number;
  serviceCount: number;
}) {
  const cityIntel = heroData?.city;
  if (!cityIntel) return null;

  const crowdEmoji = (level: string | undefined): string => {
    if (!level) return "🟢";
    const l = level.toLowerCase();
    if (l.includes("very busy") || l.includes("packed")) return "🔴";
    if (l.includes("busy") || l.includes("high")) return "🟡";
    return "🟢";
  };

  return (
    <div className="flex flex-wrap gap-2.5" data-testid="stats-row">
      {cityIntel.activeTravelers !== undefined && (
        <div className="bg-card border border-border rounded-xl px-3.5 py-2 text-xs text-muted-foreground">
          👥{" "}
          <b className="text-foreground font-semibold">
            {Number(cityIntel.activeTravelers).toLocaleString()}
          </b>{" "}
          travellers here now
        </div>
      )}
      {cityIntel.crowdLevel && (
        <div className="bg-card border border-border rounded-xl px-3.5 py-2 text-xs text-muted-foreground">
          {crowdEmoji(cityIntel.crowdLevel)}{" "}
          <b className="text-foreground font-semibold capitalize">{cityIntel.crowdLevel}</b>{" "}
          crowds
        </div>
      )}
      {serviceCount > 0 && (
        <div className="bg-card border border-border rounded-xl px-3.5 py-2 text-xs text-muted-foreground">
          <b className="text-foreground font-semibold">{serviceCount}</b> services
        </div>
      )}
      {neighborhoodCount > 0 && (
        <div className="bg-card border border-border rounded-xl px-3.5 py-2 text-xs text-muted-foreground">
          <b className="text-foreground font-semibold">{neighborhoodCount}</b> neighborhoods
        </div>
      )}
    </div>
  );
}

// ─── Spine filter bar ─────────────────────────────────────────────────────────

const SPINE_CHIPS = [
  { id: "all", label: "All gems" },
  { id: "eat", label: "Eat" },
  { id: "do", label: "Do" },
  { id: "stay", label: "Stay" },
  { id: "services", label: "Services" },
  { id: "experts", label: "Experts" },
  { id: "events", label: "Events" },
  { id: "photo_spots", label: "Photo spots" },
  { id: "vibe", label: "Vibe" },
];

function SpineFilterBar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b py-2"
      data-testid="spine-filter-bar"
    >
      <div className="flex gap-2 overflow-x-auto pb-0.5 px-0.5 scrollbar-none">
        {SPINE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => onSelect(chip.id)}
            className={cn(
              "flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap border",
              active === chip.id
                ? "border-transparent font-semibold"
                : "bg-card border-border text-muted-foreground hover:bg-muted",
            )}
            style={
              active === chip.id
                ? { background: "#E1F5EE", color: "#0F6E56" }
                : undefined
            }
            data-testid={`spine-chip-${chip.id}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Injected cards (feed-composition layer) ─────────────────────────────────

/** Featured lead expert — placed once, near the top, by composeFeedStream. */
function LeadExpertCard({ expert }: { expert: any }) {
  const packagesCount = Number(expert.packagesCount ?? 0);
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 flex items-center gap-3 h-full"
      data-testid="section-lead-expert"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <UserCheck className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">
          {expert.displayName ?? (`${expert.firstName ?? expert.first_name ?? ""} ${expert.lastName ?? expert.last_name ?? ""}`.trim() || "Local Expert")}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {expert.headline ?? expert.bio?.slice(0, 60) ?? "Featured local expert"}
        </p>
        {packagesCount > 0 && (
          <p className="text-[11px] text-muted-foreground truncate" data-testid="lead-expert-packages">
            📔 {packagesCount} {packagesCount === 1 ? "trip" : "trips"}
          </p>
        )}
      </div>
      <a
        href={`/experts/${expert.id}`}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary whitespace-nowrap"
        data-testid="link-lead-expert-profile"
      >
        View profile <ChevronRight className="w-3 h-3" />
      </a>
    </div>
  );
}

/** Recruitment slot — capped and spaced by composeFeedStream (no walls of "Apply"). */
function WantedSlotCard({ item }: { item: FeedItem }) {
  const { offeringLabel, neighborhoodName, city: slotCity, demandCount, dateContext, neighborhoodId } = item.data as WantedSlotData;
  const isHighDemand = (demandCount ?? 0) >= 5;
  return (
    <div
      className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3 h-full"
      data-testid={`section-recruitment-${neighborhoodId}`}
    >
      <div className="min-w-0">
        {isHighDemand && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 rounded-full px-2 py-0.5 mb-1" data-testid="badge-high-demand">
            🔥 High demand
          </span>
        )}
        <p className="text-xs font-semibold text-primary truncate">
          {offeringLabel} wanted in {neighborhoodName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {demandCount && demandCount > 0
            ? `${demandCount} traveller${demandCount !== 1 ? "s" : ""} in ${neighborhoodName} want this${dateContext ? ` for ${dateContext}` : ""} · Be the first to offer it`
            : `Be the first to offer ${offeringLabel.toLowerCase()} for travellers in ${neighborhoodName}`}
        </p>
      </div>
      <a
        href={`/become-expert?city=${encodeURIComponent(slotCity)}&neighborhood=${encodeURIComponent(neighborhoodName)}&offering=${encodeURIComponent(offeringLabel)}`}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary whitespace-nowrap flex-shrink-0"
        data-testid="link-wanted-apply"
      >
        Apply <ChevronRight className="w-3 h-3" />
      </a>
    </div>
  );
}

/** Ways-to-Earn card — injected exactly once per feed (after composition, insert-only). */
function EarnCard({ city }: { city: string }) {
  const displayCity = toTitleCase(city);
  return (
    <div
      className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-col gap-1.5 h-full"
      data-testid="feed-card-earn"
    >
      <span className="text-[10px] text-primary font-semibold uppercase tracking-widest">
        EARN ON TRAVELOURE
      </span>
      <h3 className="font-semibold text-[15px] leading-tight tracking-tight">
        Know {displayCity} like a local? Offer a service here?
      </h3>
      <p className="text-[12px] text-muted-foreground">
        Local experts share their knowledge; providers list bookable services — both earn on Traveloure.
      </p>
      <div className="flex gap-1.5 pt-1 flex-wrap mt-auto">
        <Button size="sm" className="h-7 text-xs px-3" asChild data-testid="btn-earn-expert">
          <a href="/earn">Become an expert</a>
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs px-3" asChild data-testid="btn-earn-provider">
          <a href="/earn">List a service</a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Package (expert itinerary template) feed card — data from the already-gated
 * public GET /api/expert-templates (approved+published, teaser-redacted).
 * Works in both column and marquee/row form like RecommendationCard.
 */
function PackageCard({
  template,
  layout = "column",
}: {
  template: any;
  layout?: "column" | "row";
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const isRow = layout === "row";

  const priceNum = Number(template.price);
  const priceDisplay = !isNaN(priceNum)
    ? `$${priceNum % 1 === 0 ? priceNum : priceNum.toFixed(2)}`
    : null;

  // §13 honesty: real rating only when reviewCount > 0 — otherwise "New", never a fake number.
  const reviewCount = Number(template.reviewCount ?? 0);
  const rating = reviewCount > 0 && template.averageRating ? Number(template.averageRating) : null;
  const salesCount = Number(template.salesCount ?? 0);

  // The teaser payload carries no expert name — show destination · duration instead.
  const expertName = template.expertName ?? null;
  const destDuration = [template.destination, template.duration ? `${template.duration} days` : null]
    .filter(Boolean)
    .join(" · ");
  const byline = expertName ? `by ${expertName}` : destDuration;

  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground",
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {template.coverImage ? (
        <img
          src={template.coverImage}
          alt={template.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <span className="text-2xl">📔</span>
      )}
    </div>
  );

  const cardBody = (
    <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-primary/10 text-primary">
          Trip
        </span>
        {rating === null && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-muted text-muted-foreground">
            New
          </span>
        )}
      </div>

      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {template.title}
      </h3>

      {byline && <p className="text-[12px] text-muted-foreground line-clamp-1">{byline}</p>}

      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        {priceDisplay && <span className="text-sm font-bold text-foreground">{priceDisplay}</span>}
        {rating !== null && (
          <span data-testid={`package-rating-${template.id}`}>
            ★ {rating.toFixed(1)} ({reviewCount})
          </span>
        )}
        {salesCount > 0 && <span data-testid={`package-sold-${template.id}`}>{salesCount} sold</span>}
      </div>

      <div className="flex gap-1.5 pt-0.5 flex-wrap mt-auto">
        <Button size="sm" className="h-7 text-xs px-3" asChild data-testid={`btn-view-package-${template.id}`}>
          <a href={`/expert-templates/${template.id}`}>View itinerary</a>
        </Button>

        {/* D9: More info modal — additive, "View itinerary" above is untouched.
            Shows the TEASER day list only (itineraryPreview: day + title from
            the server's content gate) — full content stays purchase-gated. */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              data-testid={`button-more-info-package-${template.id}`}
            >
              <Info className="w-3 h-3 mr-1" />
              More info
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{template.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {destDuration && <p className="text-sm text-muted-foreground">{destDuration}</p>}
              {expertName && <p className="text-xs text-muted-foreground">by {expertName}</p>}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {priceDisplay && (
                  <span className="text-base font-bold text-foreground">{priceDisplay}</span>
                )}
                {/* §13: real rating only when review-backed; otherwise an honest "New" */}
                {rating !== null ? (
                  <span data-testid={`modal-package-rating-${template.id}`}>
                    ★ {rating.toFixed(1)} ({reviewCount})
                  </span>
                ) : (
                  <span className="font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    New
                  </span>
                )}
                {salesCount > 0 && <span>{salesCount} sold</span>}
              </div>

              {Array.isArray(template.itineraryPreview) && template.itineraryPreview.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">What's inside (preview)</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {template.itineraryPreview.map((d: any, i: number) => (
                      <div key={i} className="flex items-baseline gap-2 text-xs">
                        <span className="text-muted-foreground flex-shrink-0 font-medium">
                          Day {d.day ?? i + 1}
                        </span>
                        <span className="truncate">{d.title ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Full day-by-day details unlock after purchase.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" asChild data-testid={`modal-view-itinerary-${template.id}`}>
                  <a href={`/expert-templates/${template.id}`}>View itinerary</a>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border border-primary/40 bg-card shadow-sm hover:shadow-md transition-shadow h-full",
        isRow ? "flex flex-row" : "flex flex-col",
      )}
      data-testid={`feed-card-package-${template.id}`}
    >
      {photoArea}
      {cardBody}
    </div>
  );
}

// ─── Inline recommendation card (with impression tracking) ─────────────────

function RecommendationCard({
  candidate,
  city,
  position,
  scheduledDate,
  onAdd,
  onBook,
  recommendedLabel = "Recommended",
  affiliateLabel = "Paid partner",
  layout = "column",
  cardPosition,
}: {
  candidate: any;
  city: string;
  position: number;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  onBook?: (c: { offeringId: string; categoryKey: string }) => void;
  recommendedLabel?: string;
  affiliateLabel?: string;
  layout?: "column" | "row";
  cardPosition?: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const askExpert = useAskExpert();
  const name = candidate.displayName || candidate.categoryKey?.replace(/_/g, " ");
  const isAffiliate = candidate.sourceType === "affiliate";
  const isRow = layout === "row";
  const impressionFiredRef = useRef(false);

  useEffect(() => {
    if (!impressionFiredRef.current) {
      impressionFiredRef.current = true;
      // Repointed: /api/feed/impression never existed (all rec impressions were silently
      // discarded). /api/upsell/impression is the real endpoint; it expects
      // { surface, offeringIds } — the engine's own impression ledger.
      // D1: in date mode the candidates came from the discover_date surface, so
      // the impression ref must carry the same surface the ranking ran on.
      fetch("/api/upsell/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: scheduledDate ? "discover_date" : "discover_location",
          offeringIds: [candidate.offeringId],
        }),
      }).catch(() => {});
    }
  }, [candidate.offeringId, position, city, candidate.sourceType]);

  const { photoUrl, loading } = useGemPhoto(`rec-${position}-${name}`, name, city, null);

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add";

  const meta = (() => {
    const k = `${candidate.categoryKey} ${candidate.displayName}`.toLowerCase();
    if (/photo/.test(k)) return { emoji: "📷", phBg: "bg-teal-50", phText: "text-teal-600" };
    if (/chef|food|culinary|dining|restaurant|tasting/.test(k))
      return { emoji: "🍵", phBg: "bg-pink-50", phText: "text-pink-600" };
    if (/transport|driver|transfer|car/.test(k))
      return { emoji: "🚗", phBg: "bg-blue-50", phText: "text-blue-600" };
    if (/event|ticket|show|concert|festival/.test(k))
      return { emoji: "🎫", phBg: "bg-pink-50", phText: "text-pink-600" };
    if (/wellness|spa|massage|yoga/.test(k))
      return { emoji: "🧘", phBg: "bg-teal-50", phText: "text-teal-600" };
    if (/tour|guide|walk|experience|activit/.test(k))
      return { emoji: "🧭", phBg: "bg-amber-50", phText: "text-amber-700" };
    return { emoji: "✨", phBg: "bg-amber-50", phText: "text-amber-700" };
  })();

  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center",
        meta.phBg,
        meta.phText,
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {!loading && photoUrl && (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {!loading && !photoUrl && <span className="text-2xl">{meta.emoji}</span>}
    </div>
  );

  const cardBody = (
    <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase whitespace-nowrap",
            isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
          )}
        >
          <Sparkles className="w-2.5 h-2.5" />
          {isAffiliate ? affiliateLabel : recommendedLabel}
        </span>
      </div>

      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {name}
      </h3>

      {candidate.tagline && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{candidate.tagline}</p>
      )}

      {candidate.reason && (
        <p className="text-[10px] text-muted-foreground/70 italic truncate">{candidate.reason}</p>
      )}

      <div className="flex gap-1.5 pt-0.5 flex-wrap">
        {onBook && (
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => onBook(candidate)}
            data-testid={`btn-book-rec-${position}`}
          >
            Book
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-3"
          onClick={() =>
            onAdd?.({
              title: name,
              description: candidate.tagline,
              city,
              type: "recommendation",
              scheduledDate,
            })
          }
          data-testid={`btn-add-rec-${position}`}
        >
          <Plus className="w-3 h-3 mr-1" />
          {addLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5"
          onClick={() => askExpert({ city, subject: name })}
          data-testid={`btn-ask-rec-${position}`}
        >
          💬 Ask
        </Button>

        {/* D9: More info modal — additive; Book/Add/Ask above are untouched.
            "Why recommended" is built ONLY from fields actually on the wire
            candidate (offeringId/categoryKey/displayName/tagline/reason/
            sourceType/expertEndorsed): the server's own `reason` string
            (which encodes template REQ/REC, neighborhood/date proximity and
            endorsement) plus the `expertEndorsed` boolean. templateStrength/
            matchType/price never reach the client, so they are not shown —
            §13: real data or nothing. */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              data-testid={`button-more-info-rec-${position}`}
            >
              <Info className="w-3 h-3 mr-1" />
              More info
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* The engine-source disclosure stays visible in the dialog —
                  affiliate candidates keep their "Paid partner" label here too. */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
                  isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
                )}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {isAffiliate ? affiliateLabel : recommendedLabel}
              </span>

              {candidate.tagline && (
                <p className="text-sm text-muted-foreground">{candidate.tagline}</p>
              )}

              {(candidate.reason || candidate.expertEndorsed) && (
                <div className="p-2 rounded-lg bg-muted/50 border border-muted">
                  <p className="text-xs font-medium mb-1">Why you're seeing this</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {candidate.reason && <p data-testid={`modal-rec-reason-${position}`}>{candidate.reason}</p>}
                    {candidate.expertEndorsed === true && (
                      <p data-testid={`modal-rec-endorsed-${position}`}>✓ Endorsed by a local expert</p>
                    )}
                  </div>
                </div>
              )}

              {/* Same handlers as the card's existing Book/Add buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                {onBook && (
                  <Button
                    size="sm"
                    onClick={() => onBook(candidate)}
                    data-testid={`modal-book-rec-${position}`}
                  >
                    Book
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAdd?.({
                      title: name,
                      description: candidate.tagline,
                      city,
                      type: "recommendation",
                      scheduledDate,
                    })
                  }
                  data-testid={`modal-add-rec-${position}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {addLabel}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow h-full",
        isRow ? "flex flex-row" : "flex flex-col",
      )}
      data-testid={`feed-card-rec-${position}`}
    >
      {photoArea}
      {cardBody}
    </div>
  );
}

// ─── Filler card (non-neighborhood) ──────────────────────────────────────────

interface RecLabels {
  recommendedLabel: string;
  affiliateLabel: string;
}

function FillerCard({
  item,
  city,
  scheduledDate,
  onAdd,
  isMarquee,
  cardPosition,
  onBookRec,
  recLabels,
}: {
  item: FeedItem;
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  isMarquee?: boolean;
  cardPosition?: number;
  onBookRec?: (c: { offeringId: string; categoryKey: string }) => void;
  recLabels?: RecLabels;
}) {
  switch (item.kind) {
    case "loose-gem":
      return (
        <CityFeedCardGem
          gem={item.data}
          city={city}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          layout={isMarquee ? "row" : "column"}
          cardPosition={cardPosition}
        />
      );
    case "expert":
      return <CityFeedCardExpert expert={item.data} city={city} cardPosition={cardPosition} />;
    case "event":
      return (
        <CityFeedCardEvent
          event={item.data}
          city={city}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          cardPosition={cardPosition}
        />
      );
    case "supply-hotel":
    case "supply-activity":
      return (
        <CityFeedCardSupply
          item={item.data}
          kind={item.kind}
          city={city}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          cardPosition={cardPosition}
        />
      );
    case "vendor-service":
      return (
        <CityFeedCardVendorService
          service={item.data}
          city={city}
          cardPosition={cardPosition}
        />
      );
    case "recommendation":
      return (
        <RecommendationCard
          candidate={item.data.candidate}
          city={city}
          position={item.data.recIndex}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          onBook={onBookRec}
          recommendedLabel={recLabels?.recommendedLabel}
          affiliateLabel={recLabels?.affiliateLabel}
          layout={isMarquee ? "row" : "column"}
          cardPosition={cardPosition}
        />
      );
    case "wanted-slot":
      return <WantedSlotCard item={item} />;
    case "lead-expert":
      return <LeadExpertCard expert={item.data} />;
    case "earn-card":
      return <EarnCard city={city} />;
    case "package":
      return <PackageCard template={item.data} layout={isMarquee ? "row" : "column"} />;
    default:
      return null;
  }
}

/** The kinds FillerCard can actually render — grid math must only see these (F1: no empty cells). */
const FILLER_KINDS = new Set<FeedItem["kind"]>([
  "loose-gem",
  "expert",
  "event",
  "supply-hotel",
  "supply-activity",
  "vendor-service",
  "recommendation",
  "wanted-slot",
  "lead-expert",
  "earn-card",
  "package",
]);

// ─── Bento feed renderer ──────────────────────────────────────────────────────

/**
 * Groups consecutive filler items into 2-column bento grids.
 * First item in each group = span-2 row layout (marquee).
 * Rhythm: [bento] [neighborhood] [bento] [neighborhood] …
 */
function FeedRenderer({
  items,
  city,
  scheduledDate,
  onAdd,
  onBookRec,
  recLabels,
  upcomingEvents,
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  onBookRec?: (c: { offeringId: string; categoryKey: string }) => void;
  recLabels?: RecLabels;
  upcomingEvents?: Array<{ date: string; title: string }>;
}) {
  // F1: grid math must only see renderable items — an unrenderable kind would
  // occupy a bento cell and render as an empty hole. Neighborhoods and
  // city-separators are section-level (not FillerCard) kinds, so they stay.
  const renderableItems = items.filter(
    (item) =>
      item.kind === "neighborhood" ||
      item.kind === "city-separator" ||
      FILLER_KINDS.has(item.kind),
  );

  if (renderableItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid="feed-empty">
        No items to show yet for {toTitleCase(city)}. Check back soon!
      </p>
    );
  }

  type Section =
    | { type: "neighborhood"; item: FeedItem }
    | { type: "group"; items: FeedItem[] }
    | { type: "city-separator"; item: FeedItem };

  const sections: Section[] = [];
  let currentGroup: FeedItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      sections.push({ type: "group", items: [...currentGroup] });
      currentGroup = [];
    }
  };

  for (const item of renderableItems) {
    if (item.kind === "neighborhood") {
      flushGroup();
      sections.push({ type: "neighborhood", item });
    } else if (item.kind === "city-separator") {
      flushGroup();
      sections.push({ type: "city-separator", item });
    } else if (item.kind === "package") {
      // Packages always render as full-width marquee rows: each is its own
      // single-item group (the approved mockup treatment). Order is preserved —
      // this only affects visual arrangement, never composition.
      flushGroup();
      sections.push({ type: "group", items: [item] });
    } else {
      currentGroup.push(item);
    }
  }
  flushGroup();

  return (
    <div className="space-y-5" data-testid="city-feed">
      {sections.map((section, si) => {
        if (section.type === "neighborhood") {
          return (
            <NeighborhoodContainer
              key={section.item.id}
              neighborhood={section.item.data}
              city={city}
              scheduledDate={scheduledDate}
              onAdd={onAdd}
              upcomingEvents={upcomingEvents}
            />
          );
        }

        if (section.type === "city-separator") {
          return (
            <div
              key={section.item.id}
              className="flex items-center gap-3 py-2"
              data-testid={`separator-${section.item.id}`}
            >
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap px-2">
                More in {section.item.data.cityName}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          );
        }

        // Bento group: first item is span-2 (marquee), rest pair into half-width cells.
        // All items — including lead-expert and wanted-slot — participate in the
        // 2-col grid so the rhythm stays intact. Odd-tail rule (F3): of the items
        // AFTER the marquee, an odd count means the LAST one also spans the full
        // row so groups always end flush. Single column on mobile (F10), order preserved.
        const restCount = section.items.length - 1;
        const oddTailIdx = restCount > 0 && restCount % 2 === 1 ? section.items.length - 1 : -1;
        return (
          <div key={`group-${si}`} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.items.map((item, itemIdx) => {
              const isMarquee = itemIdx === 0 || itemIdx === oddTailIdx;
              return (
                <div
                  key={item.id}
                  className={cn("h-full", isMarquee && "sm:col-span-2")}
                >
                  <FillerCard
                    item={item}
                    city={city}
                    scheduledDate={scheduledDate}
                    onAdd={onAdd}
                    isMarquee={isMarquee}
                    cardPosition={itemIdx}
                    onBookRec={onBookRec}
                    recLabels={recLabels}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Flat filtered feed ───────────────────────────────────────────────────────

function FlatFilteredFeed({
  items,
  city,
  scheduledDate,
  onAdd,
  activeFilter,
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  activeFilter: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid="feed-empty-filtered">
        No {activeFilter.replace("_", " ")} found in {toTitleCase(city)}.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="city-feed-flat">
      {items.map((item, idx) => (
        <div key={item.id} className={idx === 0 ? "col-span-2" : ""}>
          <FillerCard
            item={item}
            city={city}
            scheduledDate={scheduledDate}
            onAdd={onAdd}
            isMarquee={idx === 0}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Date highlight strip ("pulled to top") ───────────────────────────────────

function DateHighlightStrip({
  scheduledDate,
  cityIntel,
  onAdd,
}: {
  scheduledDate: string;
  cityIntel: any;
  onAdd?: (item: any) => void;
}) {
  const parsedDate = new Date(scheduledDate + "T12:00:00");
  const monthIndex = parsedDate.getMonth();
  const monthName = MONTH_NAMES[monthIndex];
  const dayOfMonth = parsedDate.getDate();
  const label = `On ${monthName} ${dayOfMonth} — pulled to the top`;

  const seasonalEntry = cityIntel?.aiSeasonalHighlights
    ? (cityIntel.aiSeasonalHighlights as Array<{ month: number; rating: string; highlight: string }>)
        .find((s) => s.month === monthIndex + 1) ?? null
    : null;

  const highlight: string = (cityIntel?.currentHighlight ?? "").toLowerCase();
  const eventTitle = seasonalEntry?.highlight ?? cityIntel?.currentHighlight ?? "Seasonal highlight";

  type ServiceAddon = { icon: string; label: string; price: string; href: string };
  // D2 honest links: the old `/experiences/photo` and `/experiences/gear` hrefs
  // resolved to the /experiences/:slug route but matched NO real experience
  // template — dead-ish destinations. The companion object carries no service
  // id, so each "Book" now goes to `/discover?tab=services` — the live Browse
  // Services tab (in discover.tsx's VISIBLE_TABS), where these service types
  // are actually searchable. `/local-experts` (festival guide) was already a
  // real routed page and stays.
  const companionService: ServiceAddon | null = (() => {
    if (highlight.includes("blossom") || highlight.includes("sakura") || highlight.includes("cherry"))
      return { icon: "📷", label: "Blossom photo shoot", price: "from ¥12,000", href: "/discover?tab=services" };
    if (highlight.includes("snow") || highlight.includes("winter") || highlight.includes("ski"))
      return { icon: "🎿", label: "Winter gear rental", price: "from ¥4,000", href: "/discover?tab=services" };
    if (highlight.includes("festival") || highlight.includes("matsuri"))
      return { icon: "🎋", label: "Festival guide", price: "from ¥8,000", href: "/local-experts" };
    if (highlight.includes("autumn") || highlight.includes("fall") || highlight.includes("foliage"))
      return { icon: "🍂", label: "Foliage photo tour", price: "from ¥10,000", href: "/discover?tab=services" };
    return null;
  })();

  return (
    <div data-testid="date-highlight-strip">
      <div className="text-[11px] text-muted-foreground mb-2 px-0.5">{label}</div>
      <div className="flex gap-2.5 flex-wrap">
        {/* Seasonal event card */}
        <div
          className="flex-[2_1_240px] flex rounded-xl overflow-hidden border"
          style={{ borderColor: "#9FE1CB", background: "var(--card)" }}
          data-testid="date-seasonal-event-card"
        >
          <div
            className="w-[68px] flex-shrink-0 flex items-center justify-center text-[26px]"
            style={{ background: "#FBEAF0" }}
          >
            🌸
          </div>
          <div className="p-3 flex-1 min-w-0">
            <span
              className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md mb-1.5"
              style={{ background: "#E1F5EE", color: "#085041" }}
            >
              📌 Why you're here
            </span>
            <div className="text-[14px] font-medium mb-2 leading-snug">{eventTitle}</div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                className="h-7 text-[12px] px-3"
                style={{ background: "#185FA5", color: "#fff", border: "none" }}
                data-testid="button-date-event-tickets"
                asChild
              >
                {/* D2 honest link: was /experiences/events — a slug that resolved to
                    the /experiences/:slug route but matched no real experience
                    template. Now points at /discover?tab=events, the live By-Date
                    calendar tab (in discover.tsx's VISIBLE_TABS), where dated
                    events are actually browsable. */}
                <a href="/discover?tab=events">Tickets</a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px] px-3"
                onClick={() =>
                  onAdd?.({
                    title: eventTitle,
                    description: cityIntel?.currentHighlight ?? null,
                    type: "event",
                    scheduledDate,
                  })
                }
                data-testid="button-date-event-add"
              >
                Add to {monthName} {dayOfMonth}
              </Button>
            </div>
          </div>
        </div>

        {/* Companion platform service card */}
        {companionService && (
          <div
            className="flex-[1_1_140px] rounded-xl border p-3"
            style={{ background: "var(--card)" }}
            data-testid="date-companion-service-card"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[18px]">{companionService.icon}</span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide"
                style={{ background: "#f0fdf4", color: "#166534" }}
              >
                PLATFORM
              </span>
            </div>
            <div className="text-[13px] font-medium mb-0.5">{companionService.label}</div>
            <div className="text-[11px] text-muted-foreground mb-2">seasonal · {companionService.price}</div>
            <Button
              size="sm"
              className="h-7 text-[12px] px-3"
              style={{ background: "#0F6E56", color: "#fff", border: "none" }}
              data-testid="button-date-companion-book"
              asChild
            >
              <a href={companionService.href}>Book</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Trip-level complements strip ─────────────────────────────────────────────

interface AddOn {
  icon: string;
  label: string;
  badge: string;
  href: string;
  variant: "platform" | "affiliate";
  isExternal?: boolean;
  partner?: string;
}

function trackAddonClick(partner: string, city: string) {
  fetch("/api/affiliates/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partner, destination: city }),
  }).catch(() => {});
}

function buildAddOns(city: string): AddOn[] {
  const citySlug = encodeURIComponent(city.toLowerCase().replace(/\s+/g, "-"));
  const cityParam = encodeURIComponent(city);

  return [
    {
      icon: "🚖",
      label: "Airport transfer",
      badge: "Book via 12Go",
      href: `https://12go.asia?aff=13805109&destination=${cityParam}&utm_source=traveloure&utm_medium=addon_strip&utm_campaign=${citySlug}`,
      variant: "affiliate",
      isExternal: true,
      partner: "12go",
    },
    {
      icon: "📱",
      label: "eSIM for travel",
      badge: "via Airalo",
      href: `https://www.airalo.com/?utm_source=traveloure&utm_medium=addon_strip&utm_campaign=${citySlug}`,
      variant: "affiliate",
      isExternal: true,
      partner: "airalo",
    },
    {
      icon: "🛡",
      label: "Travel insurance",
      badge: "via SafetyWing",
      href: `https://safetywing.com/nomad-insurance?referenceID=travelpayouts&utm_source=traveloure&utm_medium=addon_strip&utm_campaign=${citySlug}`,
      variant: "affiliate",
      isExternal: true,
      partner: "safetywing",
    },
    {
      icon: "🧳",
      label: "Luggage storage",
      badge: "via Bounce",
      href: `https://usebounce.com/city/${citySlug}?utm_source=traveloure&utm_medium=addon_strip`,
      variant: "affiliate",
      isExternal: true,
      partner: "bounce",
    },
  ];
}

function buildContentAddOn(highlight: string | null | undefined, city: string): AddOn | null {
  if (!highlight) return null;
  const h = highlight.toLowerCase();
  const cityParam = encodeURIComponent(city);

  if (h.includes("blossom") || h.includes("sakura") || h.includes("cherry")) {
    return {
      icon: "👘",
      label: "Kimono rental",
      badge: "↑ for blossom season",
      href: `/experiences?city=${cityParam}&q=kimono+rental`,
      variant: "platform",
      partner: "platform-kimono",
    };
  }
  if (h.includes("snow") || h.includes("winter") || h.includes("ski")) {
    return {
      icon: "🎿",
      label: "Winter gear rental",
      badge: "↑ for winter",
      href: `/experiences?city=${cityParam}&q=winter+gear+rental`,
      variant: "platform",
      partner: "platform-winter-gear",
    };
  }
  if (h.includes("festival") || h.includes("matsuri") || h.includes("carnival")) {
    return {
      icon: "🎋",
      label: "Festival guide",
      badge: "↑ for festival season",
      href: `/experts?city=${cityParam}&specialty=festivals`,
      variant: "platform",
      partner: "platform-festival",
    };
  }
  if (h.includes("autumn") || h.includes("fall") || h.includes("foliage")) {
    return {
      icon: "🍂",
      label: "Foliage photography tour",
      badge: "↑ peak autumn colour",
      href: `/experiences?city=${cityParam}&q=foliage+photography+tour`,
      variant: "platform",
      partner: "platform-foliage",
    };
  }
  return null;
}

function TripComplementsStrip({
  city,
  highlight,
}: {
  city: string;
  highlight?: string | null;
}) {
  const staticAddOns = buildAddOns(city);
  const contentAddOn = buildContentAddOn(highlight, city);
  const addOns: AddOn[] = contentAddOn ? [contentAddOn, ...staticAddOns] : staticAddOns;

  return (
    <div data-testid="trip-complements-strip">
      <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest mb-2.5 px-0.5">
        COMPLETE YOUR {city.toUpperCase()} TRIP · complements any itinerary
      </div>
      <div className="flex gap-2.5 flex-wrap">
        {addOns.map((addon) => (
          <a
            key={addon.label}
            href={addon.href}
            target={addon.isExternal ? "_blank" : undefined}
            rel={addon.isExternal ? "noopener noreferrer" : undefined}
            onClick={() => addon.partner && trackAddonClick(addon.partner, city)}
            className="flex-1 min-w-[150px] bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow"
            data-testid={`addon-${addon.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">{addon.icon}</span>
              <span className="font-semibold text-[13px]">{addon.label}</span>
            </div>
            <span
              className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide",
                addon.variant === "platform"
                  ? "bg-teal-50 text-teal-700"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              {addon.badge}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── D4: Local guides (expert-published DMO content) ────────────────────────────

interface LocalGuide {
  id: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  contentType: string;
  neighborhood: string | null;
  city: string;
  images: string[];
  primaryImageUrl: string | null;
  tags: string[];
  sourceUrl: string | null;
  publishedAt: string | null;
  expertName: string | null;
}

const GUIDE_TYPE_LABEL: Record<string, string> = {
  attraction: "Attraction",
  venue: "Venue",
  restaurant: "Restaurant",
  event: "Event",
  destination: "Neighborhood",
  itinerary: "Itinerary",
  transport: "Getting around",
  other: "Local pick",
};

/**
 * Traveler-facing strip of expert-published DMO content for the city (D4). Renders nothing until an
 * expert publishes at least one guide (the common case early on) — no fabricated/empty state. Each
 * card opens a dialog with the expert's full curated description.
 */
function LocalGuidesSection({ city }: { city: string }) {
  const [openGuide, setOpenGuide] = useState<LocalGuide | null>(null);
  const { data } = useQuery<{ city: string; count: number; guides: LocalGuide[] }>({
    queryKey: ["/api/discover/location", city, "guides"],
    queryFn: async () => {
      const res = await fetch(`/api/discover/location/${encodeURIComponent(city)}/guides`);
      if (!res.ok) throw new Error("Failed to load local guides");
      return res.json();
    },
    enabled: !!city,
  });

  const guides = data?.guides ?? [];
  if (guides.length === 0) return null;

  return (
    <div data-testid="section-local-guides">
      <div className="flex items-center gap-2 mb-1 px-0.5">
        <Compass className="w-4 h-4 text-teal-600" />
        <h2 className="text-lg font-bold tracking-tight">Local guides in {toTitleCase(city)}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3 px-0.5">
        Places worth knowing, curated and published by local experts.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {guides.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setOpenGuide(g)}
            className="text-left bg-card border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow flex flex-col"
            data-testid={`local-guide-${g.id}`}
          >
            <div className="relative h-32 overflow-hidden bg-gradient-to-br from-teal-500/15 to-teal-500/5 flex items-center justify-center">
              {g.primaryImageUrl ? (
                <img src={g.primaryImageUrl} alt={g.name} className="w-full h-full object-cover" />
              ) : (
                <Compass className="w-8 h-8 text-teal-500/30" />
              )}
              <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 tracking-wide">
                {GUIDE_TYPE_LABEL[g.contentType] ?? "Local pick"}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
              <span className="font-semibold text-[14px] leading-tight line-clamp-2">{g.name}</span>
              {g.neighborhood && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3" /> {g.neighborhood}
                </span>
              )}
              {g.shortDescription && (
                <span className="text-[12px] text-muted-foreground line-clamp-2">{g.shortDescription}</span>
              )}
              {g.expertName && (
                <span className="mt-auto pt-1 text-[10px] text-muted-foreground/80">
                  Curated by {g.expertName}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!openGuide} onOpenChange={(o) => !o && setOpenGuide(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {openGuide && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 tracking-wide">
                    {GUIDE_TYPE_LABEL[openGuide.contentType] ?? "Local pick"}
                  </span>
                  {openGuide.name}
                </DialogTitle>
              </DialogHeader>
              {openGuide.primaryImageUrl && (
                <img
                  src={openGuide.primaryImageUrl}
                  alt={openGuide.name}
                  className="w-full h-44 object-cover rounded-lg"
                />
              )}
              {openGuide.neighborhood && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" /> {openGuide.neighborhood}, {toTitleCase(openGuide.city)}
                </p>
              )}
              {openGuide.description && (
                <p className="text-sm leading-relaxed whitespace-pre-line">{openGuide.description}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                {openGuide.expertName ? (
                  <span className="text-xs text-muted-foreground">Curated by {openGuide.expertName}</span>
                ) : <span />}
                {openGuide.sourceUrl && (
                  <a
                    href={openGuide.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 underline underline-offset-2"
                    data-testid="link-guide-source"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoverLocationPage() {
  const params = useParams<{ city: string }>();
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const country = searchParams.get("country");
  const scheduledDate = searchParams.get("date");
  const cityRaw = params?.city ?? "";
  const city = decodeURIComponent(cityRaw);

  useEffect(() => {
    if (city) trackCityView(city, toTitleCase(city));
  }, [city]);

  const handleDismissDate = () => {
    const next = new URLSearchParams(searchString);
    next.delete("date");
    const qs = next.toString();
    navigate(`/discover/location/${cityRaw}${qs ? `?${qs}` : ""}`);
  };

  const [activeFilter, setActiveFilter] = useState("all");

  const [addToExperienceOpen, setAddToExperienceOpen] = useState(false);
  const [addToExperienceItem, setAddToExperienceItem] = useState<any>(null);

  const handleAdd = (item: any) => {
    setAddToExperienceItem(item);
    setAddToExperienceOpen(true);
  };

  // Feed-composition knobs — admin rows (platform_settings), code defaults.
  const { data: feedConfigData } = useQuery<FeedCompositionConfig>({
    queryKey: ["/api/feed-composition-config"],
    queryFn: async () => {
      const res = await fetch("/api/feed-composition-config");
      if (!res.ok) return DEFAULT_FEED_COMPOSITION_CONFIG;
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const feedConfig = feedConfigData ?? DEFAULT_FEED_COMPOSITION_CONFIG;

  // Expert offering types — used to build specific recruitment slot labels
  const { data: expertOfferingTypes } = useQuery<Array<{ offering_type_key: string; display_name: string; service_tier: string }>>({
    queryKey: ["/api/offering-types/experts"],
    queryFn: async () => {
      const res = await fetch("/api/offering-types/experts");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15 * 60_000,
    retry: false,
  });

  const { data, isLoading, error } = useQuery<LocationViewPayload>({
    queryKey: ["/api/discover/location", city, country],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      const res = await fetch(
        `/api/discover/location/${encodeURIComponent(city)}${qs.toString() ? `?${qs.toString()}` : ""}`,
      );
      if (!res.ok) throw new Error(`Location view fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!city,
  });

  const heroCountry = country ?? data?.country ?? null;

  // Media — for Unsplash download tracking compliance only (hero no longer uses photo)
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", city, heroCountry],
    queryFn: async () => {
      const res = await fetch(
        `/api/travelpulse/media/${encodeURIComponent(city)}/${encodeURIComponent(heroCountry ?? "")}`,
      );
      if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!city && !!heroCountry,
  });

  // Experts for this city
  const { data: expertsData } = useQuery<any[]>({
    queryKey: ["/api/experts", { location: city }],
    queryFn: async () => {
      const res = await fetch(`/api/experts?location=${encodeURIComponent(city)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!city,
    staleTime: 10 * 60 * 1000,
  });

  // Packages (expert itinerary templates) for this city — the already-gated
  // public feed (approved+published only, teaser-redacted, quality-ordered).
  const { data: packagesData } = useQuery<any[]>({
    queryKey: ["/api/expert-templates", { destination: city }],
    queryFn: async () => {
      const res = await fetch(`/api/expert-templates?destination=${encodeURIComponent(city)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!city,
    staleTime: 10 * 60 * 1000,
  });

  // Unsplash download tracking (API compliance)
  const trackedDownloadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mediaData) return;
    const unsplashMedia = [
      ...(mediaData.hero?.source === "unsplash" && mediaData.hero?.downloadLocationUrl
        ? [mediaData.hero]
        : []),
      ...mediaData.gallery.filter((m) => m.source === "unsplash" && m.downloadLocationUrl),
    ];
    unsplashMedia.forEach((media) => {
      if (media.downloadLocationUrl && !trackedDownloadsRef.current.has(media.downloadLocationUrl)) {
        trackedDownloadsRef.current.add(media.downloadLocationUrl);
        fetch("/api/travelpulse/media/track-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadLocationUrl: media.downloadLocationUrl }),
        }).catch(() => {});
      }
    });
  }, [mediaData]);

  // ── Derived feed data ───────────────────────────────────────────────────
  const neighborhoods = data?.neighborhoods?.data ?? [];
  const allGems = data?.gems?.data ?? [];
  const experts = expertsData ?? [];
  const events = data?.events?.data?.events ?? [];
  const supplyHotels = data?.recommendations?.data?.hotels ?? [];
  const supplyActivities = data?.recommendations?.data?.activities ?? [];
  const platformServices = data?.services?.data ?? [];

  // ── Engine recommendations (discover_location / discover_date surface) ──
  // expertEndorsedKeys passes local expert IDs so the server boosts offerings
  // endorsed by those experts — the authoritative endorsement signal driving
  // both the slot ranking and the lead-expert pick. Candidates arrive in the
  // engine's ranked order; this page renders them natively, it does not rank.
  //
  // D1 (date mode): when the traveler arrived with a ?date=, the slot switches
  // to the discover_date surface (POST /api/upsell/discover-date), where
  // dateRange is a HARD availability filter, not a ranking weight — offerings
  // whose category needs date-specific inventory with none on the requested
  // date are dropped server-side. Contract (discoverDateBodySchema):
  // { city: string (required, market scope), dateRange: { start: ISO, end?: ISO }
  //   (required), cartItems?, userProfile?, expertEndorsedKeys?, tripId?, … } —
  // city-scoped, NOT neighborhoodId-scoped like discover_location. The response
  // is the same ranked-candidates shape, so rendering below is unchanged.
  // Without a date, the neighborhood-focused discover_location call is
  // exactly as before.
  const upsellSurface = scheduledDate ? ("discover_date" as const) : ("discover_location" as const);
  const expertEndorsedKeys = experts.map((e: any) => String(e.id ?? e.userId ?? e.user_id)).filter(Boolean);
  const discoverySlotResult = useUpsellSlot(upsellSurface, {
    contextPayload: scheduledDate
      ? {
          city,
          dateRange: { start: scheduledDate },
          expertEndorsedKeys,
        }
      : {
          ...(neighborhoods[0]?.id
            ? { neighborhoodId: String(neighborhoods[0].id) }
            : { neighborhoodId: city.toLowerCase().replace(/\s+/g, "-") }),
          expertEndorsedKeys,
        },
    enabled: !!data,
  });

  const handleBookRecommendation = (c: { offeringId: string; categoryKey: string }) => {
    discoverySlotResult.logClick(c.offeringId);
    navigate(`/discover?categoryKey=${encodeURIComponent(c.categoryKey)}&upsellSource=${upsellSurface}`);
  };

  // ── Injected-element payloads for the composition layer ────────────────
  // Lead expert: derived from the top slot candidate's categoryKey — the
  // server ranked the offering endorsed by local experts, so the expert whose
  // specialties overlap the top offering is the authoritative neighbourhood
  // lead. Falls back to the first expert when no overlap is found.
  const leadExpert = experts.length > 0
    ? (() => {
        const topCategoryKey = discoverySlotResult.candidates[0]?.categoryKey ?? "";
        return (topCategoryKey
          ? (experts.find((e: any) =>
              (e.specialties as string[] | undefined)?.some(
                (s) => s.toLowerCase().replace(/\s+/g, "_") === topCategoryKey
              )
            ) ?? experts[0])
          : experts[0]) as any;
      })()
    : null;

  // Exclude the lead-expert from the filler pool to avoid the same person
  // appearing twice (once as kind="expert", once as kind="lead-expert").
  const feedExperts = leadExpert
    ? experts.filter((e: any) => {
        const eId = String(e.id ?? e.userId ?? e.user_id ?? "");
        const lId = String((leadExpert as any).id ?? (leadExpert as any).userId ?? (leadExpert as any).user_id ?? "__none__");
        return eId !== lId;
      })
    : experts;

  const feedItems: FeedItem[] = data
    ? buildFeedStream(neighborhoods, allGems, feedExperts, events, supplyHotels, supplyActivities, platformServices)
    : [];

  // Wanted/recruitment slots: one per neighborhood for offering types the
  // engine found NO coverage for at all ("covered" = ranked candidates +
  // suppressed-but-ranked). The composition layer caps and spaces them —
  // this list is the pool, not the placement.
  const coveredOfferingIds = new Set([
    ...discoverySlotResult.candidates.map((c) => c.offeringId),
    ...discoverySlotResult.suppressed.map((s) => s.offeringId),
  ]);
  const uncoveredOfferings = (expertOfferingTypes ?? []).filter(
    (o) => !coveredOfferingIds.has(o.offering_type_key)
  );
  // Fall back to the full list when slot data hasn't loaded yet (both arrays empty)
  const recruitmentPool = uncoveredOfferings.length > 0 ? uncoveredOfferings : (expertOfferingTypes ?? []);

  // Build raw wanted-slot data (no demand counts yet)
  const rawWantedSlotsData: WantedSlotData[] = neighborhoods.slice(0, 5).map((nb: any, idx: number) => {
    const nbName = nb.name ?? nb.neighborhood_name ?? nb.neighborhoodName ?? toTitleCase(city);
    const offering = recruitmentPool[idx % Math.max(recruitmentPool.length, 1)];
    return {
      offeringLabel: offering?.display_name ?? "Local expert guide",
      offeringKey: offering?.offering_type_key ?? "guide",
      neighborhoodName: nbName,
      city,
      neighborhoodId: String(nb.id ?? nb.slug ?? nbName),
    };
  });

  // Demand counts for wanted-slot enrichment — batch fetch from /api/services/demand
  const wantedOfferingKeys = Array.from(new Set(rawWantedSlotsData.map((s) => s.offeringKey)));
  const { data: demandCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/services/demand", city, wantedOfferingKeys.join(","), scheduledDate ?? ""],
    queryFn: async () => {
      if (!city || wantedOfferingKeys.length === 0) return {};
      const params = new URLSearchParams({ city, offeringTypeKeys: wantedOfferingKeys.join(",") });
      if (scheduledDate) {
        params.set("dateRangeStart", scheduledDate);
        params.set("dateRangeEnd", scheduledDate);
      }
      const res = await fetch(`/api/services/demand?${params}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!city && wantedOfferingKeys.length > 0,
    staleTime: 5 * 60_000,
  });

  // Human-readable date label for WantedSlotCard when a date filter is active
  const dateContext = scheduledDate
    ? new Date(scheduledDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : undefined;

  // Merge demand counts (and date context) into wanted-slot data — sorted descending
  const wantedSlotsData: WantedSlotData[] = rawWantedSlotsData
    .map((slot) => ({
      ...slot,
      demandCount: demandCounts?.[slot.offeringKey] ?? 0,
      dateContext,
    }))
    .sort((a, b) => (b.demandCount ?? 0) - (a.demandCount ?? 0));

  // ── One interleaved stream ──────────────────────────────────────────────
  // The composition layer PLACES the injected elements into the organic
  // stream (admin-configured cadence/cap/spacing); it consumes the engine's
  // ranked order as-is and never re-ranks. Filtered views are deliberate
  // searches — they show organic results only.
  const composedItems =
    activeFilter === "all"
      ? composeDiscoverFeed(
          feedItems,
          discoverySlotResult.candidates,
          wantedSlotsData,
          leadExpert,
          feedConfig,
          defaultIsRelated,
        )
      : filterFeedStream(feedItems, activeFilter);

  // Shape A: expert packages are now first-class engine candidates, ranked in the SAME
  // slate as offering recommendations (server: gatherOfferingCandidates includePackages,
  // OPT-floored so they never crowd out a REQ offering). They arrive through the
  // recommendation channel; re-tag them here as package feed items so they render as
  // PackageCard, joining the thin candidate (offeringId = template.id) to the fetched
  // package data. A candidate with no matching package is dropped (never render a raw id).
  // This SUPERSEDES the old fixed 4/16 package splice + the #205 client-side ranking.
  const packageById = new Map((packagesData ?? []).map((p: any) => [String(p.id), p]));
  const retagged: FeedItem[] = composedItems
    .map((it: any) => {
      if (it.kind === "recommendation" && it.data?.candidate?.sourceType === "expert_package") {
        const pkg = packageById.get(String(it.data.candidate.offeringId));
        return pkg ? ({ kind: "package", id: `package-${pkg.id}`, data: pkg } as FeedItem) : null;
      }
      return it as FeedItem;
    })
    .filter(Boolean) as FeedItem[];
  // Exactly ONE earn-card near position 9 (F7/F9), only on the unfiltered "all" view.
  const filteredItems: FeedItem[] = (() => {
    if (activeFilter !== "all") return retagged;
    const out = [...retagged];
    out.splice(Math.min(9, out.length), 0, { kind: "earn-card", id: "earn-card", data: { city } });
    return out;
  })();

  // Two soonest future-dated city events — the neighborhood header mini-list (F8).
  const upcomingEvents: Array<{ date: string; title: string }> = (() => {
    const now = new Date();
    return (events as any[])
      .filter((e) => {
        if (!e?.date) return false;
        const d = new Date(e.date);
        return !isNaN(d.getTime()) && d >= now;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 2)
      .map((e) => ({ date: e.date as string, title: (e.title || e.name || "") as string }));
  })();

  const currentHighlight = data?.hero?.data?.city?.currentHighlight ?? null;

  // ── Cover photo: highest-scored gem imageUrl → curated map → null ───────
  const coverPhotoUrl: string | null = (() => {
    if (allGems.length > 0) {
      const sorted = [...allGems]
        .filter((g: any) => !!g.imageUrl)
        .sort((a: any, b: any) => (b.gemScore ?? 0) - (a.gemScore ?? 0));
      if (sorted.length > 0) {
        return sorted[0].imageUrl as string;
      }
    }
    return CURATED_HERO_IMAGES[city.toLowerCase()] ?? null;
  })();

  const coverPhotoCredit: CoverPhotoCredit = (() => {
    if (allGems.length > 0) {
      const sorted = [...allGems]
        .filter((g: any) => !!g.imageUrl)
        .sort((a: any, b: any) => (b.gemScore ?? 0) - (a.gemScore ?? 0));
      if (sorted.length > 0) {
        const gem = sorted[0];
        if (gem.imageAttribution) return { name: gem.imageAttribution as string, url: gem.imageUrl as string };
      }
    }
    return null;
  })();

  if (!city) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>No city specified.</AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Back navigation */}
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate("/discover?tab=events");
            }
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          data-testid="btn-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[96px] w-full rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-xl" />
              <Skeleton className="h-9 w-20 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="col-span-2 h-28 rounded-xl" />
              <Skeleton className="h-44 rounded-xl" />
              <Skeleton className="h-44 rounded-xl" />
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {(error as Error).message ?? "Failed to load location view."}
            </AlertDescription>
          </Alert>
        )}

        {data && (
          <div className="space-y-5">
            {/* ── Hero (cover photo or teal gradient fallback) ────────── */}
            <HeroSection
              city={city}
              heroData={data.hero?.data}
              scheduledDate={scheduledDate}
              onDismissDate={handleDismissDate}
              coverPhotoUrl={coverPhotoUrl}
              coverPhotoCredit={coverPhotoCredit}
            />

            {/* ── Stats row ─────────────────────────────────────────── */}
            <StatsRow
              heroData={data.hero?.data}
              neighborhoodCount={neighborhoods.length}
              serviceCount={platformServices.length}
            />

            {/* ── "Pulled to top" date section (date mode only) ─────── */}
            {scheduledDate && (
              <DateHighlightStrip
                scheduledDate={scheduledDate}
                cityIntel={data.hero?.data?.city}
                onAdd={handleAdd}
              />
            )}

            {/* ── Spine filter bar (sticky) ─────────────────────────── */}
            <SpineFilterBar active={activeFilter} onSelect={setActiveFilter} />

            {/* Lead expert, wanted slots, and engine recommendations are no
                longer stacked blocks here — the feed-composition layer
                interleaves them into the organic stream below. Only the
                empty-market recruitment card remains a standalone section
                (there is no feed to interleave into). */}
            {experts.length === 0 && neighborhoods.length === 0 && (
              <div
                className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center"
                data-testid="section-expert-recruitment-generic"
              >
                <p className="text-sm font-semibold text-primary mb-1">
                  Local experts wanted in {toTitleCase(city)}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Know this city well? Travellers are looking for guides, advisors, and service providers here.
                </p>
                <a
                  href={`/become-expert?city=${encodeURIComponent(city)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2"
                  data-testid="link-expert-recruitment-earn"
                >
                  Start earning in {toTitleCase(city)} <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* ── Blended bento feed (one interleaved stream) ───────── */}
            {activeFilter === "all" ? (
              <>
                <FeedRenderer
                  items={filteredItems}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={handleAdd}
                  onBookRec={handleBookRecommendation}
                  recLabels={{
                    recommendedLabel: feedConfig.recommendedLabel,
                    affiliateLabel: feedConfig.affiliateLabel,
                  }}
                  upcomingEvents={upcomingEvents}
                />
                <TripComplementsStrip city={city} highlight={currentHighlight} />
              </>
            ) : (
              <FlatFilteredFeed
                items={filteredItems}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={handleAdd}
                activeFilter={activeFilter}
              />
            )}

            {/* ── D4: expert-published local guides (hidden until published) ── */}
            <LocalGuidesSection city={city} />
          </div>
        )}

        {/* Add-to-experience dialog */}
        <AddToExperienceDialog
          item={addToExperienceItem}
          open={addToExperienceOpen}
          onOpenChange={setAddToExperienceOpen}
        />
      </div>
    </Layout>
  );
}
