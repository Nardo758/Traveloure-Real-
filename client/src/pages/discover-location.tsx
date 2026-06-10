import { useRef, useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Plus, ArrowLeft, UserCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CityFeedCardGem, CityFeedCardEvent, CityFeedCardSupply, CityFeedCardVendorService } from "@/components/city-feed-card";
import { CityFeedCardExpert } from "@/components/city-feed-card-expert";
import { NeighborhoodContainer } from "@/components/neighborhood-container";
import { buildFeedStream, filterFeedStream, type FeedItem } from "@/lib/feed-stream";
import { UpsellSlot } from "@/components/UpsellSlot";

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
          travelers here now
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

// ─── Filler card (non-neighborhood) ──────────────────────────────────────────

function FillerCard({
  item,
  city,
  scheduledDate,
  onAdd,
  isMarquee,
}: {
  item: FeedItem;
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  isMarquee?: boolean;
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
        />
      );
    case "expert":
      return <CityFeedCardExpert expert={item.data} city={city} />;
    case "event":
      return (
        <CityFeedCardEvent
          event={item.data}
          city={city}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
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
        />
      );
    case "vendor-service":
      return (
        <CityFeedCardVendorService
          service={item.data}
          city={city}
        />
      );
    default:
      return null;
  }
}

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
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
}) {
  if (items.length === 0) {
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

  for (const item of items) {
    if (item.kind === "neighborhood") {
      flushGroup();
      sections.push({ type: "neighborhood", item });
    } else if (item.kind === "city-separator") {
      flushGroup();
      sections.push({ type: "city-separator", item });
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

        // Bento group: first item is span-2 (marquee), rest are half-width
        return (
          <div key={`group-${si}`} className="grid grid-cols-2 gap-3">
            {section.items.map((item, itemIdx) => (
              <div
                key={item.id}
                className={itemIdx === 0 ? "col-span-2" : ""}
              >
                <FillerCard
                  item={item}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={onAdd}
                  isMarquee={itemIdx === 0}
                />
              </div>
            ))}
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
}: {
  scheduledDate: string;
  cityIntel: any;
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
  const companionService: ServiceAddon | null = (() => {
    if (highlight.includes("blossom") || highlight.includes("sakura") || highlight.includes("cherry"))
      return { icon: "📷", label: "Blossom photo shoot", price: "from ¥12,000", href: "/experiences/photo" };
    if (highlight.includes("snow") || highlight.includes("winter") || highlight.includes("ski"))
      return { icon: "🎿", label: "Winter gear rental", price: "from ¥4,000", href: "/experiences/gear" };
    if (highlight.includes("festival") || highlight.includes("matsuri"))
      return { icon: "🎋", label: "Festival guide", price: "from ¥8,000", href: "/local-experts" };
    if (highlight.includes("autumn") || highlight.includes("fall") || highlight.includes("foliage"))
      return { icon: "🍂", label: "Foliage photo tour", price: "from ¥10,000", href: "/experiences/photo" };
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
                <a href="/experiences/events">Tickets</a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px] px-3"
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

  const feedItems: FeedItem[] = data
    ? buildFeedStream(neighborhoods, allGems, experts, events, supplyHotels, supplyActivities, platformServices)
    : [];

  const filteredItems =
    activeFilter === "all" ? feedItems : filterFeedStream(feedItems, activeFilter);

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
              />
            )}

            {/* ── Spine filter bar (sticky) ─────────────────────────── */}
            <SpineFilterBar active={activeFilter} onSelect={setActiveFilter} />

            {/* ── Spine: featured lead expert for this neighborhood/city ── */}
            {experts.length > 0 && (
              <div
                className="rounded-xl border border-border bg-card p-3 flex items-center gap-3"
                data-testid="section-lead-expert"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {experts[0].displayName ?? (`${experts[0].firstName ?? ""} ${experts[0].lastName ?? ""}`.trim() || "Local Expert")}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {experts[0].headline ?? experts[0].bio?.slice(0, 60) ?? "Featured local expert"}
                  </p>
                </div>
                <a
                  href={`/experts/${experts[0].id}`}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary whitespace-nowrap"
                  data-testid="link-lead-expert-profile"
                >
                  View profile <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* ── Spine: "offering wanted in city" recruitment slots ─── */}
            {experts.length === 0 && (
              <div
                className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center"
                data-testid="section-expert-recruitment"
              >
                <p className="text-sm font-semibold text-primary mb-1">
                  Local experts wanted in {toTitleCase(city)}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Know this city well? Travellers are looking for guides, advisors, and service providers here.
                </p>
                <a
                  href={`/earn?track=expert&city=${encodeURIComponent(city)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2"
                  data-testid="link-expert-recruitment-earn"
                >
                  Start earning in {toTitleCase(city)} <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* ── Spine: UpsellSlot recommendation cards ────────────── */}
            <UpsellSlot
              surface="discover_location"
              contextPayload={{ city, country: heroCountry ?? undefined }}
              className="px-0"
              data-testid="upsell-slot-discover-location"
            />

            {/* ── Blended bento feed ────────────────────────────────── */}
            {activeFilter === "all" ? (
              <>
                <FeedRenderer
                  items={filteredItems}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={handleAdd}
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
