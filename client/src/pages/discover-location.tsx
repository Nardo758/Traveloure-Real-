import { useRef, useEffect, useState } from "react";
import { useParams, useSearch, useLocation, Link } from "wouter";
import { trackCityView } from "@/hooks/use-recently-viewed";
import { useQuery } from "@tanstack/react-query";
import { Layout, NAV_LEAF_ICONS } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { ServiceRequestDialog } from "@/components/service-request-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronRight, Globe, Palmtree, Search, MapPin, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTripContext } from "@/lib/trip-context";
import { cn } from "@/lib/utils";
import { useContentAgentBooking } from "@/hooks/use-content-agent-booking";
import { CityFeedCardGem, CityFeedCardEvent, CityFeedCardSupply, CityFeedCardVendorService } from "@/components/city-feed-card";
import { CityFeedCardExternalStub } from "@/components/city-feed-card-external-stub";
import { CityFeedCardExpert } from "@/components/city-feed-card-expert";
import { CityFeedCardRecommendation } from "@/components/city-feed-card-recommendation";
import { ExpertCard } from "@/components/expert-card";
import { FeedWantedSlotCard } from "@/components/feed/wanted-slot-card";
import { FeedEarnCard } from "@/components/feed/earn-card";
import { FeedReadyMadeCard } from "@/components/feed/ready-made-card";
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
  // Trailhead T4.3: published scraped/DMO stubs for this market + render-time trend headline.
  externalStubs?: SectionResult<{ trendContext: string | null; stubs: any[] }>;
}

interface CityMediaResponse {
  hero: any | null;
  gallery: any[];
  videos: any[];
  byAttraction: Record<string, any[]>;
}

// ─── Teal gradient hero ───────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Earn-grammar header tokens (per-page pattern) ─────────────────────────────
const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Marketplace rail — Destinations (travelpulse) is the current surface here.
const MARKETPLACE_RAIL: { key: string; label: string; url: string }[] = [
  { key: "travelpulse", label: "Destinations", url: "/destinations" },
  { key: "packages", label: "Ready-Made", url: "/ready-made" },
  { key: "events", label: "Events", url: "/events" },
  { key: "services", label: "Services", url: "/services" },
];

/** Compact trip-date range for the read-only "where" field, e.g. "May 3–7". */
function formatTripDates(start?: string, end?: string): string | null {
  if (!start) return null;
  const s = new Date(start + "T12:00:00");
  if (isNaN(s.getTime())) return null;
  const sMonth = MONTH_NAMES[s.getMonth()].slice(0, 3);
  const sDay = s.getDate();
  if (!end) return `${sMonth} ${sDay}`;
  const e = new Date(end + "T12:00:00");
  if (isNaN(e.getTime())) return `${sMonth} ${sDay}`;
  const eMonth = MONTH_NAMES[e.getMonth()].slice(0, 3);
  const eDay = e.getDate();
  if (s.getMonth() === e.getMonth()) return `${sMonth} ${sDay}–${eDay}`;
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
}

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

function HeroBand({
  city,
  heroData,
  country,
  scheduledDate,
  onDismissDate,
}: {
  city: string;
  heroData: any;
  country: string | null;
  scheduledDate: string | null;
  onDismissDate: () => void;
}) {
  const displayCity = toTitleCase(city);
  const cityIntel = heroData?.city;
  const pulse = cityIntel?.pulseScore;
  const crowdLevel = cityIntel?.crowdLevel;
  const highlight = cityIntel?.currentHighlight;
  const highlightEmoji = cityIntel?.highlightEmoji ?? "✨";

  const parsedDate = scheduledDate ? new Date(scheduledDate + "T12:00:00") : null;
  const monthIndex = parsedDate ? parsedDate.getMonth() : null;
  const monthName = monthIndex !== null ? MONTH_NAMES[monthIndex] : null;
  const dayOfMonth = parsedDate ? parsedDate.getDate() : null;

  const seasonalEntry = monthIndex !== null && cityIntel?.aiSeasonalHighlights
    ? (cityIntel.aiSeasonalHighlights as Array<{ month: number; rating: string; highlight: string }>)
        .find((s) => s.month === monthIndex + 1) ?? null
    : null;

  const seasonLine = seasonalEntry
    ? `${seasonalEntry.rating}/10 in ${monthName} · ${seasonalEntry.highlight}${crowdLevel ? ` · ${crowdLevel}` : ""}`
    : highlight
    ? `${highlightEmoji} ${highlight}`
    : null;

  // Band sub (Phase 2d): the AUTHORED destination line when one exists — the
  // same copy field chain the section headings read — else the seasonal line,
  // else the fixed marketplace line. Never the generic "Plan your trip to…".
  const authoredLine: string | null =
    cityIntel?.editorialTitle ?? cityIntel?.headline ?? cityIntel?.tagline ??
    heroData?.editorialTitle ?? heroData?.headline ?? heroData?.tagline ?? null;
  const subLine: string =
    authoredLine ??
    seasonLine ??
    `Local experts, bookable services, and what's on in ${displayCity}.`;

  const datePillLabel = parsedDate ? `Planning ${monthName} ${dayOfMonth}` : null;

  // Muted mono eyebrow: DESTINATION · {COUNTRY} · TREND {n} · CROWD {level} —
  // each fragment omitted when its source is null (§13). The TREND fragment
  // carries the preserved pulse-badge testid.
  const eyebrowFragments: (string | JSX.Element)[] = ["DESTINATION"];
  if (country) eyebrowFragments.push(country.toUpperCase());
  if (pulse !== undefined && pulse !== null)
    eyebrowFragments.push(<span data-testid="pulse-badge">TREND {pulse}</span>);
  if (crowdLevel) eyebrowFragments.push(`CROWD ${String(crowdLevel).toUpperCase()}`);

  const Tile = NAV_LEAF_ICONS["Destinations"] ?? Palmtree;

  return (
    <section
      className="border-b border-[color:var(--earn-border)] bg-[var(--earn-card)] py-[26px]"
      data-testid="section-hero"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 text-left">
            <span className="w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)] grid place-items-center shrink-0">
              <Tile className="w-[22px] h-[22px]" />
            </span>
            <div>
              {/* Coral-ink TEXT eyebrow — the mock's treatment (Phase 2d reversal:
                  the coral-only rule governs BUTTONS; text eyebrows stay coral). */}
              <div
                className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)] mb-1"
                style={{ fontFamily: EARN_MONO }}
              >
                {eyebrowFragments.map((frag, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {frag}
                  </span>
                ))}
              </div>
              <h1
                style={{ fontFamily: FRAUNCES }}
                className="text-[30px] font-semibold text-[color:var(--earn-navy)] leading-tight"
              >
                <span data-testid="text-city-name">{displayCity}</span>
              </h1>
              <p className="text-sm text-[color:var(--earn-muted)] mt-1 max-w-[60ch]">
                {subLine}
              </p>
              {datePillLabel && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-0.5 rounded-full text-[12px] bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
                  📅 {datePillLabel}
                  <a
                    href="/events"
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
          </div>
          <nav className="md:text-right" aria-label="Marketplace surfaces">
            <p
              className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-muted)] mb-2"
              style={{ fontFamily: EARN_MONO }}
            >
              Marketplace
            </p>
            <div className="flex flex-wrap md:justify-end gap-1.5" style={{ fontFamily: EARN_MONO }}>
              {MARKETPLACE_RAIL.map(({ key, label, url }) => {
                const active = key === "travelpulse";
                return (
                  <Link
                    key={key}
                    href={url}
                    className={cn(
                      "text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors",
                      active
                        ? "bg-[var(--earn-navy)] text-white font-semibold"
                        : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]",
                    )}
                    aria-current={active ? "page" : undefined}
                    data-testid={`marketplace-route-${key}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </section>
  );
}

// ─── Filters popover (price + sort ONLY — Phase 2c) ───────────────────────────

/** Price bands the popover offers. A tile with NO price is outside the priced
 *  domain and is never dropped by a price filter (§13 — a filter narrows the
 *  priced inventory, it doesn't punish editorial tiles for having no price). */
const PRICE_OPTIONS: { id: string; label: string; min: number; max: number }[] = [
  { id: "any", label: "Any price", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under50", label: "Under $50", min: 0, max: 50 },
  { id: "50to150", label: "$50–150", min: 50, max: 150 },
  { id: "over150", label: "$150+", min: 150, max: Number.POSITIVE_INFINITY },
];

const SORT_OPTIONS: { id: string; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
];

/**
 * The Filters popover now holds ONLY price and sort (Phase 2c) — the gem-type
 * spine chips moved out to the always-visible `spine-filter-bar` rail.
 */
function FiltersPopover({
  price,
  onPrice,
  sort,
  onSort,
}: {
  price: string;
  onPrice: (id: string) => void;
  sort: string;
  onSort: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 whitespace-nowrap"
          data-testid="button-filters"
        >
          <SlidersHorizontal className="w-4 h-4 mr-1.5" />
          Filters +
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] space-y-3"
        data-testid="popover-filters"
      >
        <div>
          <p className="font-medium text-sm mb-2">Price</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onPrice(opt.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap border",
                  price === opt.id
                    ? "border-transparent font-semibold bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                    : "bg-[var(--earn-card)] border-[color:var(--earn-border)] text-[color:var(--earn-muted)] hover:bg-[var(--earn-chip)]",
                )}
                data-testid={`price-option-${opt.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="font-medium text-sm mb-2">Sort</p>
          <div className="flex flex-col gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSort(opt.id)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[12.5px] text-left transition-colors",
                  sort === opt.id
                    ? "font-semibold bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                    : "text-[color:var(--earn-muted)] hover:bg-[var(--earn-chip)]",
                )}
                data-testid={`sort-option-${opt.id}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Spine filter chips (rendered inside FiltersPopover above) ────────────────

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

/**
 * Does one tile match a spine chip? DELEGATES to the canonical
 * `filterFeedStream` predicate (feed-stream.ts) on a single-item stream so the
 * category mapping (incl. the FP-1/B4b accommodation-shape rule) is never
 * re-implemented here — restating it would be §18-rule-1 derivation drift.
 * `lead-expert` is the same person as an expert, so it tests as one.
 */
function chipMatches(item: FeedItem, chipId: string): boolean {
  if (chipId === "all") return true;
  const probe: FeedItem = item.kind === "lead-expert" ? { ...item, kind: "expert" } : item;
  return filterFeedStream([probe], chipId).length > 0;
}

/**
 * A tile's price when it carries a REAL one (§13 — never inferred): used by the
 * popover's price filter and price sorts. Editorial tiles (gems, recs, panels)
 * have no price and return null — the price filter leaves them alone and price
 * sorts keep them after the priced tiles in stream order.
 */
function extractTilePrice(item: FeedItem): number | null {
  const d: any = item.data ?? {};
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return !isNaN(n) && n > 0 ? n : null;
  };
  switch (item.kind) {
    case "vendor-service":
      return num(d.price);
    case "package":
      return num(d.price);
    case "event":
      if (d.isFree) return 0;
      return num(d.minPrice);
    case "supply-hotel":
    case "supply-activity":
      return num(d.price) ?? num(d.pricePerNight) ?? num(d.priceFrom);
    default:
      return null;
  }
}

function priceMatches(item: FeedItem, priceId: string): boolean {
  if (priceId === "any") return true;
  const band = PRICE_OPTIONS.find((o) => o.id === priceId);
  if (!band) return true;
  const p = extractTilePrice(item);
  if (p === null) return true; // unpriced tiles are outside the priced domain
  return p >= band.min && p < band.max;
}

/** Stable price sort over a tagged run — priced tiles ordered, unpriced keep stream order after them. */
function sortTaggedRunByPrice<T extends { item: FeedItem }>(run: T[], dir: "asc" | "desc"): T[] {
  return run
    .map((entry, i) => ({ entry, i, p: extractTilePrice(entry.item) }))
    .sort((a, b) => {
      if (a.p === null && b.p === null) return a.i - b.i;
      if (a.p === null) return 1;
      if (b.p === null) return -1;
      const d = dir === "asc" ? a.p - b.p : b.p - a.p;
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.entry);
}

/**
 * The always-visible spine chip rail (Phase 2c — moved out of the Filters
 * popover). Earn-tokened: teal fill on the active chip, a mono live-stock count
 * badge per chip (§13: the badge renders only when the count is > 0 — an absent
 * badge is honest zero, never a fabricated number). "All gems" is the default.
 */
function SpineChipRail({
  active,
  counts,
  onSelect,
}: {
  active: string;
  counts: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="spine-filter-bar">
      {SPINE_CHIPS.map((chip) => {
        const count = counts[chip.id] ?? 0;
        const isActive = active === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onSelect(chip.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap border",
              isActive
                ? "border-transparent font-semibold bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                : "bg-[var(--earn-card)] border-[color:var(--earn-border)] text-[color:var(--earn-muted)] hover:bg-[var(--earn-chip)]",
            )}
            data-testid={`spine-chip-${chip.id}`}
          >
            {chip.label}
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10.5px] font-semibold leading-none",
                  isActive
                    ? "bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                    : "bg-[var(--earn-chip)] text-[color:var(--earn-muted)]",
                )}
                style={{ fontFamily: EARN_MONO }}
                data-testid={`spine-chip-count-${chip.id}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Injected cards ─────────────────────────────────────────────────────────
// The former inline LeadExpertCard / WantedSlotCard / EarnCard / PackageCard /
// RecommendationCard have been converged onto the card family + feed/* panels
// (city-feed bento, Phase 2): recommendation → CityFeedCardRecommendation,
// package → FeedReadyMadeCard, wanted-slot → FeedWantedSlotCard, earn →
// FeedEarnCard, lead-expert → ExpertCard variant="anchor". BentoTile below
// dispatches to them; the anchor treatment is chosen by the bento renderer.
// ─── Filler card (non-neighborhood) ──────────────────────────────────────────

interface RecLabels {
  recommendedLabel: string;
  affiliateLabel: string;
}

/**
 * Renders ONE bento tile. Dispatches by feed kind onto the converged card
 * family + feed/* panels. `isAnchor` renders the lead treatment for the tile
 * that heads a neighbourhood bento (an expert → the dark-gradient ExpertCard
 * anchor; anything else → its normal family card, span-emphasised by the grid).
 */
function BentoTile({
  item,
  city,
  scheduledDate,
  onAdd,
  isAnchor,
  isMarquee,
  cardPosition,
  onBookRec,
  recLabels,
}: {
  item: FeedItem;
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  isAnchor?: boolean;
  isMarquee?: boolean;
  cardPosition?: number;
  onBookRec?: (c: { offeringId: string; categoryKey: string }) => void;
  recLabels?: RecLabels;
}) {
  // Anchor expert → the dark-gradient ExpertCard anchor treatment (col-span-2
  // row-span-2 lead of the neighbourhood bento) — unchanged geometry, full
  // density. Every OTHER bento tile renders its family card at compact density
  // (2026-08-26-bento-compact-density).
  if (isAnchor && (item.kind === "lead-expert" || item.kind === "expert")) {
    return <ExpertCard expert={item.data} variant="anchor" />;
  }

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
          density="compact"
        />
      );
    case "expert":
    case "lead-expert":
      return <CityFeedCardExpert expert={item.data} city={city} cardPosition={cardPosition} density="compact" />;
    case "event":
      return (
        <CityFeedCardEvent
          event={item.data}
          city={city}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          cardPosition={cardPosition}
          density="compact"
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
          density="compact"
        />
      );
    case "vendor-service":
      return (
        <CityFeedCardVendorService
          service={item.data}
          city={city}
          cardPosition={cardPosition}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          density="compact"
        />
      );
    case "recommendation":
      return (
        <CityFeedCardRecommendation
          candidate={item.data.candidate}
          city={city}
          position={item.data.recIndex}
          scheduledDate={scheduledDate}
          onAdd={onAdd}
          onBook={onBookRec ? (c) => onBookRec(c) : undefined}
          recommendedLabel={recLabels?.recommendedLabel}
          affiliateLabel={recLabels?.affiliateLabel}
          layout={isMarquee ? "row" : "column"}
          cardPosition={cardPosition}
          density="compact"
        />
      );
    case "wanted-slot":
      return <FeedWantedSlotCard item={item} density="compact" />;
    case "earn-card":
      return <FeedEarnCard city={city} density="compact" />;
    case "package":
      return <FeedReadyMadeCard template={item.data} layout={isMarquee ? "row" : "column"} density="compact" />;
    case "external-stub":
      return <CityFeedCardExternalStub stub={item.data} city={city} density="compact" />;
    default:
      return null;
  }
}

/** The kinds a bento tile can actually render — grid math must only see these (F1: no empty cells). */
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
  "external-stub",
]);

// ─── Bento span algorithm ─────────────────────────────────────────────────────

// Which desktop col-span class a tile carries (the desktop min-width variant = the
// 4-col bento). These MUST be complete literal strings — Tailwind's JIT scans source text and
// cannot see a class assembled from a template literal (a `${BP}:col-span-2`
// build produced the right DOM attribute but NO generated CSS, collapsing the
// anchor to one column). The pixel value is a CSS breakpoint, not a fee.
const COL_SPAN_CLASS: Record<number, string> = {
  1: "",
  2: "min-[900px]:col-span-2", // fee-literal-ok: Tailwind responsive breakpoint, not a fee
  3: "min-[900px]:col-span-3", // fee-literal-ok: Tailwind responsive breakpoint, not a fee
  4: "min-[900px]:col-span-4", // fee-literal-ok: Tailwind responsive breakpoint, not a fee
};

/** A tile placed in the bento, carrying its resolved desktop spans. */
interface PlacedTile {
  item: FeedItem;
  /** Original position in the neighbourhood's stream run (order-preservation proof). */
  order: number;
  colSpan: number;
  /** 2 only for the tall lead-expert anchor (the mock's full-section-height lead). */
  rowSpan: number;
  isAnchor: boolean;
}

/**
 * Assign spans over the 4-wide grid (Phase 2d rules):
 *  - the anchor is col-span-2; a lead-EXPERT anchor is additionally row-span-2
 *    (the mock's full-section-height lead) — a ready-made or gem fallback
 *    anchor stays 2×1;
 *  - every ready-made is col-span-2 (photo-left 2×1); everything else starts 1;
 *  - NO tile is ever stretched past col-span-2. A mid-grid hole is avoided by
 *    widening a 1-wide tile in the closing row by one column (never past 2);
 *    the LAST row is allowed to run short — an honest short row beats a
 *    stretched lone tile.
 * Row capacities account for the tall anchor: while it spans rows 1–2, those
 * rows have 2 free columns beside it. Computed purely from the tile sequence
 * (never re-ranked).
 */
function assignBentoSpans(tiles: { item: FeedItem; order: number; isAnchor: boolean }[]): PlacedTile[] {
  const n = tiles.length;
  if (n === 0) return [];

  const isExpertAnchor = (t: { item: FeedItem; isAnchor: boolean }) =>
    t.isAnchor && (t.item.kind === "lead-expert" || t.item.kind === "expert");

  const base = tiles.map((t) => (t.isAnchor || t.item.kind === "package" ? 2 : 1));
  const rowSpans = tiles.map((t) => (isExpertAnchor(t) ? 2 : 1));

  // Pack the NON-anchor tiles (the anchor is placed first by the grid) through
  // a row-capacity sequence: a tall anchor leaves capacity 2 in its two rows; a
  // 2×1 anchor leaves capacity 2 in its single row; rows after that are full 4s.
  const startIdx = tiles[0]?.isAnchor ? 1 : 0;
  const besideAnchorRows = startIdx === 1 ? (rowSpans[0] === 2 ? 2 : 1) : 0;
  let rowNumber = 0; // 0-based row counter for capacity lookup
  const capacityOf = (r: number) => (r < besideAnchorRows ? 2 : 4);

  let rowTiles: number[] = []; // indices (into tiles) of the current row
  let used = 0;
  const closeRow = (deficit: number) => {
    // Fill a mid-grid short row by widening ONE 1-wide tile per missing column
    // (cap col-span-2). With tile widths ∈ {1,2} the deficit is always coverable.
    let need = deficit;
    for (let k = rowTiles.length - 1; k >= 0 && need > 0; k--) {
      const idx = rowTiles[k];
      if (base[idx] === 1) {
        base[idx] = 2;
        need -= 1;
      }
    }
    rowTiles = [];
    used = 0;
    rowNumber += 1;
  };

  for (let i = startIdx; i < n; i++) {
    const cap = capacityOf(rowNumber);
    const s = Math.min(base[i], 2);
    if (used + s > cap) closeRow(cap - used);
    rowTiles.push(i);
    used += s;
    if (used === capacityOf(rowNumber)) closeRow(0);
  }
  // The FINAL row stays as-is — a short last row is fine (Phase 2d).

  return tiles.map((t, i) => ({
    item: t.item,
    order: t.order,
    colSpan: Math.min(base[i], 2),
    rowSpan: rowSpans[i],
    isAnchor: t.isAnchor,
  }));
}

/**
 * Build the ordered tile list for a neighbourhood bento from an already-TAGGED
 * run ({item, order} — order = the tile's position in the neighbourhood's
 * merged stream run, assigned BEFORE any chip/price filtering so it stays the
 * order-preservation proof). The ONLY reorder is the anchor — the run's lead
 * local expert if it has one, else the top ready-made, else the first tile —
 * floated to the visual lead. Under an explicit price sort the user's sort IS
 * the order, so the float is disabled and the first tile anchors naturally.
 */
function buildBentoTiles(
  tagged: { item: FeedItem; order: number }[],
  floatAnchor: boolean = true,
): PlacedTile[] {
  if (tagged.length === 0) return [];
  const withAnchor = tagged.map((t) => ({ ...t, isAnchor: false }));

  let anchorIdx = 0;
  if (floatAnchor) {
    anchorIdx = withAnchor.findIndex((t) => t.item.kind === "lead-expert" || t.item.kind === "expert");
    if (anchorIdx < 0) anchorIdx = withAnchor.findIndex((t) => t.item.kind === "package");
    if (anchorIdx < 0) anchorIdx = 0;
  }

  withAnchor[anchorIdx].isAnchor = true;
  const anchor = withAnchor[anchorIdx];
  const rest = withAnchor.filter((_, i) => i !== anchorIdx);
  return assignBentoSpans([anchor, ...rest]);
}

// ─── Neighbourhood bento group ────────────────────────────────────────────────

/**
 * One bento group: the coral eyebrow / editorial Fraunces heading / "See all"
 * link (when the group belongs to a neighbourhood), then the bento grid
 * (four columns on desktop, two on tablet, one on mobile).
 * Membership and order come straight from the composed stream — the
 * grid only assigns spans and floats the anchor.
 */
function BentoGroup({
  taggedRun,
  neighbourhood,
  city,
  scheduledDate,
  floatAnchor = true,
  seeAllHref,
  onSeeAll,
  onAdd,
  onBookRec,
  recLabels,
}: {
  taggedRun: { item: FeedItem; order: number }[];
  neighbourhood: any | null;
  city: string;
  scheduledDate: string | null;
  floatAnchor?: boolean;
  /** Real URL for the See-all link (middle-click / gate-friendly); onSeeAll does the SPA nav. */
  seeAllHref?: (slug: string) => string;
  onSeeAll?: (slug: string) => void;
  onAdd: (item: any) => void;
  onBookRec?: (c: { offeringId: string; categoryKey: string }) => void;
  recLabels?: RecLabels;
}) {
  const placed = buildBentoTiles(taggedRun, floatAnchor);
  if (placed.length === 0) return null;

  const nbName: string | null = neighbourhood
    ? (neighbourhood.name ?? neighbourhood.neighborhood_name ?? neighbourhood.neighborhoodName ?? null)
    : null;
  const nbSlug: string | null = neighbourhood
    ? String(neighbourhood.slug ?? neighbourhood.id ?? nbName ?? "")
    : null;
  // Phase 2c: the bento section is the ONE rendering per neighbourhood, so the
  // legacy header card's tagline (description) joins the heading fallback chain.
  const heading: string | null = neighbourhood
    ? (neighbourhood.editorialTitle ?? neighbourhood.headline ?? neighbourhood.tagline ?? neighbourhood.description ?? nbName ?? null)
    : null;

  return (
    <section
      id={nbSlug ? `bento-nb-${nbSlug}` : undefined}
      data-testid={nbSlug ? `bento-section-${nbSlug}` : "bento-intro"}
      data-bento-neighbourhood={nbSlug ?? ""}
    >
      {neighbourhood && nbName && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--earn-coral-ink)", fontFamily: EARN_MONO }}
              data-testid={`bento-eyebrow-${nbSlug}`}
            >
              {nbName.toUpperCase()} · {placed.length}
            </div>
            <h3
              className="text-[22px] font-semibold leading-tight"
              style={{ color: "var(--earn-navy)", fontFamily: FRAUNCES }}
            >
              {heading}
            </h3>
          </div>
          {/* See-all FILTERS the feed to this section (2026-08-26-see-all-is-filter):
              it sets ?neighborhood=<slug> on the SAME route (no new route/query key).
              A real href backs middle-click + the hardcoded-links gate; onClick does
              the SPA nav so browser-back clears the filter. */}
          {nbSlug && (
            <a
              href={seeAllHref ? seeAllHref(nbSlug) : `/discover/location/${encodeURIComponent(city)}`}
              onClick={(e) => {
                if (onSeeAll) {
                  e.preventDefault();
                  onSeeAll(nbSlug);
                }
              }}
              className="shrink-0 whitespace-nowrap text-[12px] font-semibold hover:underline"
              style={{ color: "var(--earn-navy)" }}
              data-testid={`bento-see-all-${nbSlug}`}
            >
              See all in {nbName} →
            </a>
          )}
        </div>
      )}

      {/* Rows are minmax(172px,auto): at least the ratified 172px, growing to fit
          the converged family card — a tile never clips its card. A tile is ONE
          row; only the tall lead-expert anchor spans two (rowSpan 2). Literal
          classes only (Tailwind JIT scans source). */}
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 min-[900px]:grid-cols-4 min-[900px]:auto-rows-[minmax(172px,auto)] gap-[14px]">
        {placed.map((tile) => (
          <div
            key={tile.item.id}
            className={cn(
              "h-full min-w-0 overflow-hidden",
              tile.rowSpan === 2 && "min-[900px]:row-span-2", // fee-literal-ok: Tailwind responsive breakpoint, not a fee
              COL_SPAN_CLASS[tile.colSpan] ?? "",
            )}
            data-testid={`bento-tile-${tile.item.id}`}
            data-bento-role={tile.isAnchor ? "anchor" : "tile"}
            data-order={tile.order}
            data-col-span={tile.colSpan}
            data-row-span={tile.rowSpan}
          >
            <BentoTile
              item={tile.item}
              city={city}
              scheduledDate={scheduledDate}
              onAdd={onAdd}
              isAnchor={tile.isAnchor}
              isMarquee={tile.colSpan >= 2}
              cardPosition={tile.order}
              onBookRec={onBookRec}
              recLabels={recLabels}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Bento feed renderer ──────────────────────────────────────────────────────

/** A neighbourhood's nested gems as loose-gem tiles — the bento section is the
 *  ONE rendering per neighbourhood (Phase 2c), so its child gems join the run.
 *  Same top-4 exposure the legacy "IN {nb}" list had. */
function nestedGemItems(neighbourhood: any): FeedItem[] {
  return ((neighbourhood?.gems ?? []) as any[])
    .slice(0, 4)
    .map((g) => ({ kind: "loose-gem" as FeedItem["kind"], id: `gem-${g.id}`, data: g }));
}

/**
 * Blended-feed renderer (city-feed bento, Phase 2; single-rendering + chip
 * filtering in Phase 2c).
 *
 * Walks the ALREADY-COMPOSED stream in order — it NEVER re-orders or drops on
 * the default view. A neighbourhood marker OPENS its bento section: the
 * neighbourhood's own nested gems become the run's leading tiles (the legacy
 * NeighborhoodContainer + "IN {nb}" list are gone — the bento is the only
 * rendering), followed by the marker's trailing filler run in stream order.
 * A run before the first neighbourhood is the intro bento (no heading);
 * city-separators are preserved.
 *
 * Chip / price filtering happens HERE, per section, AFTER order tagging: a
 * spine chip filters every bento to that kind and a neighbourhood with no
 * matches drops out entirely. An explicit price sort reorders tiles within
 * each section (the one user-commanded reorder; the composed stream itself is
 * never re-ranked).
 */
function FeedRenderer({
  items,
  city,
  scheduledDate,
  activeFilter = "all",
  priceFilter = "any",
  sortMode = "recommended",
  neighbourhoodFilter = null,
  onNeighbourhoodFilter,
  neighbourhoodHref,
  onAdd,
  onBookRec,
  recLabels,
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  activeFilter?: string;
  priceFilter?: string;
  sortMode?: string;
  /** Active `?neighborhood=<slug>` filter (2026-08-26-see-all-is-filter), or null. */
  neighbourhoodFilter?: string | null;
  onNeighbourhoodFilter?: (slug: string | null) => void;
  neighbourhoodHref?: (slug: string | null) => string;
  onAdd: (item: any) => void;
  onBookRec?: (c: { offeringId: string; categoryKey: string }) => void;
  recLabels?: RecLabels;
}) {
  // F1: grid math must only see renderable items — an unrenderable kind would
  // occupy a bento cell and render as an empty hole. Neighborhoods and
  // city-separators are section-level kinds, so they stay.
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

  type GroupSection = { type: "group"; items: FeedItem[]; neighbourhood: any | null };
  type SepSection = { type: "city-separator"; item: FeedItem };
  type Section = GroupSection | SepSection;

  const sections: Section[] = [];
  let currentGroup: FeedItem[] = [];
  let currentNeighbourhood: any | null = null;

  const flushGroup = () => {
    if (currentGroup.length > 0 || currentNeighbourhood) {
      sections.push({ type: "group", items: [...currentGroup], neighbourhood: currentNeighbourhood });
    }
    currentGroup = [];
    currentNeighbourhood = null;
  };

  for (const item of renderableItems) {
    if (item.kind === "neighborhood") {
      flushGroup();
      currentNeighbourhood = item.data;
      // The neighbourhood's own gems lead its bento run (single rendering).
      currentGroup.push(...nestedGemItems(item.data));
    } else if (item.kind === "city-separator") {
      flushGroup();
      sections.push({ type: "city-separator", item });
    } else {
      currentGroup.push(item);
    }
  }
  flushGroup();

  // Phase 2d: a wanted slot NAMES a specific neighbourhood — re-home it to that
  // neighbourhood's own section. Composition places injected panels by cadence,
  // blind to sections, which is how "Local guide wanted in Gion" landed inside
  // Arashiyama's bento. A recruitment panel is not organic ranking, so moving
  // it to the section it names is a correctness fix, not a re-rank; a slot
  // naming no rendered section stays where it fell.
  const sectionKey = (nb: any): string | null =>
    nb ? String(nb.slug ?? nb.id ?? nb.name ?? "") || null : null;
  const groupByKey = new Map<string, GroupSection>();
  for (const s of sections) {
    if (s.type === "group" && s.neighbourhood) {
      const k = sectionKey(s.neighbourhood);
      if (k && !groupByKey.has(k)) groupByKey.set(k, s);
    }
  }
  for (const s of sections) {
    if (s.type !== "group") continue;
    const keep: FeedItem[] = [];
    for (const it of s.items) {
      const slotNb = it.kind === "wanted-slot" ? String((it.data as any)?.neighborhoodId ?? "") : "";
      const home = slotNb ? groupByKey.get(slotNb) : undefined;
      if (home && home !== s) home.items.push(it);
      else keep.push(it);
    }
    s.items = keep;
  }

  // Tag stream orders FIRST (the order-preservation proof), then filter per
  // section — a filtered-out tile leaves a gap in the order sequence, never a
  // reorder. Empty sections drop out (the chip's drop-out rule).
  const renderedSections = sections
    .map((section) => {
      if (section.type !== "group") return section;
      let tagged = section.items.map((item, order) => ({ item, order }));
      if (activeFilter !== "all") tagged = tagged.filter((t) => chipMatches(t.item, activeFilter));
      if (priceFilter !== "any") tagged = tagged.filter((t) => priceMatches(t.item, priceFilter));
      if (sortMode === "price_asc") tagged = sortTaggedRunByPrice(tagged, "asc");
      if (sortMode === "price_desc") tagged = sortTaggedRunByPrice(tagged, "desc");
      return { ...section, taggedRun: tagged } as GroupSection & { taggedRun: { item: FeedItem; order: number }[] };
    })
    .filter((s) => s.type !== "group" || (s as any).taggedRun.length > 0);

  // Mono jump list — the neighbourhoods that render under the gem/price filters
  // (drop-out aware), computed BEFORE the neighbourhood-only narrowing so a
  // filtered view can still list — and switch between — every neighbourhood.
  const jumpTargets = renderedSections
    .filter((s): s is GroupSection & { taggedRun: any[] } => s.type === "group" && !!s.neighbourhood)
    .map((s) => ({
      slug: String(s.neighbourhood.slug ?? s.neighbourhood.id ?? ""),
      name: (s.neighbourhood.name ?? s.neighbourhood.neighborhood_name ?? s.neighbourhood.neighborhoodName ?? "") as string,
    }))
    .filter((t) => t.slug && t.name);

  // See-all-as-filter: when ?neighborhood=<slug> is set, render ONLY that
  // section (and no separators). Gem/price filters still apply within it; the
  // jump list stays visible so `All neighbourhoods` restores.
  const nbFilterActive = !!neighbourhoodFilter && jumpTargets.some((t) => t.slug === neighbourhoodFilter);
  const displaySections = nbFilterActive
    ? renderedSections.filter(
        (s) => s.type === "group" && sectionKey(s.neighbourhood) === neighbourhoodFilter,
      )
    : renderedSections;

  const anyGroupRendered = displaySections.some((s) => s.type === "group");

  const jumpNav = jumpTargets.length > 0 && (
    <nav
      className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]"
      style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}
      aria-label="Jump to neighbourhood"
      data-testid="neighbourhood-jump-list"
      data-nb-filter={neighbourhoodFilter ?? ""}
    >
      {nbFilterActive && (
        <span className="inline-flex items-center gap-1.5">
          <a
            href={neighbourhoodHref ? neighbourhoodHref(null) : `/discover/location/${encodeURIComponent(city)}`}
            onClick={(e) => {
              if (onNeighbourhoodFilter) {
                e.preventDefault();
                onNeighbourhoodFilter(null);
              }
            }}
            className="font-semibold hover:underline hover:text-[color:var(--earn-ink)]"
            data-testid="jump-all-neighbourhoods"
          >
            All neighbourhoods
          </a>
          <span aria-hidden>·</span>
        </span>
      )}
      {jumpTargets.map((t, i) => {
        const isActive = neighbourhoodFilter === t.slug;
        // Under a filter each item is itself a filter link (switch sections);
        // with no filter it is an in-page anchor scroll (Phase 2d behaviour).
        return (
          <span key={t.slug} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>·</span>}
            {nbFilterActive ? (
              <a
                href={neighbourhoodHref ? neighbourhoodHref(t.slug) : `#bento-nb-${t.slug}`}
                onClick={(e) => {
                  if (onNeighbourhoodFilter) {
                    e.preventDefault();
                    onNeighbourhoodFilter(t.slug);
                  }
                }}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "hover:underline hover:text-[color:var(--earn-ink)]",
                  isActive && "font-semibold text-[color:var(--earn-teal-ink)]",
                )}
                data-testid={`jump-${t.slug}`}
                data-active={isActive ? "true" : "false"}
              >
                {t.name}
              </a>
            ) : (
              <a
                href={`#bento-nb-${t.slug}`}
                className="hover:underline hover:text-[color:var(--earn-ink)]"
                data-testid={`jump-${t.slug}`}
                data-active="false"
              >
                {t.name}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );

  if (!anyGroupRendered) {
    return (
      <div data-testid="city-feed">
        {jumpNav}
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="feed-empty-filtered">
          {nbFilterActive
            ? `No ${activeFilter === "all" ? "" : activeFilter.replace("_", " ") + " "}matches in this neighbourhood.`
            : `No ${activeFilter.replace("_", " ")} found in ${toTitleCase(city)}.`}
        </p>
      </div>
    );
  }

  return (
    // The jump list sits tight above the first section (the first eyebrow lands
    // within ~one search-row height of the chip rail — Phase 2d); sections keep
    // their own rhythm in the inner wrapper.
    <div data-testid="city-feed">
      {jumpNav}
      <div className="space-y-6">
      {displaySections.map((section, si) => {
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

        return (
          <BentoGroup
            key={`group-${si}`}
            taggedRun={(section as any).taggedRun}
            neighbourhood={section.neighbourhood}
            city={city}
            scheduledDate={scheduledDate}
            floatAnchor={sortMode === "recommended"}
            seeAllHref={neighbourhoodHref ? (slug) => neighbourhoodHref(slug) : undefined}
            onSeeAll={onNeighbourhoodFilter ? (slug) => onNeighbourhoodFilter(slug) : undefined}
            onAdd={onAdd}
            onBookRec={onBookRec}
            recLabels={recLabels}
          />
        );
      })}
      </div>
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
  // id, so each "Book" now goes to `/services` — the live Browse
  // Services tab (in discover.tsx's VISIBLE_TABS), where these service types
  // are actually searchable. `/local-experts` (festival guide) was already a
  // real routed page and stays.
  const companionService: ServiceAddon | null = (() => {
    if (highlight.includes("blossom") || highlight.includes("sakura") || highlight.includes("cherry"))
      return { icon: "📷", label: "Blossom photo shoot", price: "from ¥12,000", href: "/services" };
    if (highlight.includes("snow") || highlight.includes("winter") || highlight.includes("ski"))
      return { icon: "🎿", label: "Winter gear rental", price: "from ¥4,000", href: "/services" };
    if (highlight.includes("festival") || highlight.includes("matsuri"))
      return { icon: "🎋", label: "Festival guide", price: "from ¥8,000", href: "/local-experts" };
    if (highlight.includes("autumn") || highlight.includes("fall") || highlight.includes("foliage"))
      return { icon: "🍂", label: "Foliage photo tour", price: "from ¥10,000", href: "/services" };
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
                    template. Now points at /events, the live By-Date
                    calendar tab (in discover.tsx's VISIBLE_TABS), where dated
                    events are actually browsable. */}
                <a href="/events">Tickets</a>
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
  /** Absent when the add-on books through the agent rail (§16) instead of linking out. */
  href?: string;
  variant: "platform" | "affiliate";
  isExternal?: boolean;
  partner?: string;
  /**
   * §16: partner-fulfilled BOOKING add-ons route through the in-platform booking-agent rail
   * (the server builds the deep link) instead of carrying a client-built affiliate URL.
   */
  agentPartner?: "12go";
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
      // §16: was a raw outbound booking CTA with the 12Go affiliate id built in client code.
      // Now a booking-agent hand-off — the server constructs the 12Go deep link server-side.
      icon: "🚖",
      label: "Airport transfer",
      badge: "Book via agent",
      variant: "affiliate",
      partner: "12go",
      agentPartner: "12go",
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
        {addOns.map((addon) =>
          addon.agentPartner ? (
            <AddOnAgentCard key={addon.label} addon={addon} city={city} />
          ) : (
            <a
              key={addon.label}
              href={addon.href}
              target={addon.isExternal ? "_blank" : undefined}
              rel={addon.isExternal ? "noopener noreferrer" : undefined}
              onClick={() => addon.partner && trackAddonClick(addon.partner, city)}
              className="flex-1 min-w-[150px] bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow"
              data-testid={`addon-${addon.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <AddOnFace addon={addon} />
            </a>
          ),
        )}
      </div>
    </div>
  );
}

function AddOnFace({ addon }: { addon: AddOn }) {
  return (
    <>
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
    </>
  );
}

/**
 * §16: partner-fulfilled booking add-on — routes through the booking-agent rail instead of
 * a client-built affiliate URL. Own component so the hook isn't called inside a map.
 */
function AddOnAgentCard({ addon, city }: { addon: AddOn; city: string }) {
  const agentBooking = useContentAgentBooking({
    itemName: `${addon.label} — ${city}`,
    itemDescription: "Trains, buses, ferries and transfers via 12Go Asia",
    partnerName: "12Go Asia",
    partnerCategory: "ground-transport",
    partnerRoute: { partner: "12go", destination: city },
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (addon.partner) trackAddonClick(addon.partner, city);
        agentBooking.book();
      }}
      disabled={agentBooking.isPending || agentBooking.requested}
      className="flex-1 min-w-[150px] bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow text-left"
      data-testid={`addon-${addon.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <AddOnFace
        addon={agentBooking.requested ? { ...addon, badge: "Request sent" } : addon}
      />
    </button>
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
  const displayCity = toTitleCase(city);

  // Trip context feeds the read-only "where" field (city + trip dates); the
  // "where" field never WRITES the trip — browse is fixed to the route's city.
  const [tripCtx] = useTripContext();

  useEffect(() => {
    if (city) trackCityView(city, toTitleCase(city));
  }, [city]);

  const handleDismissDate = () => {
    const next = new URLSearchParams(searchString);
    next.delete("date");
    const qs = next.toString();
    navigate(`/discover/location/${cityRaw}${qs ? `?${qs}` : ""}`);
  };

  // See-all-as-filter (2026-08-26-see-all-is-filter): the active neighbourhood
  // lives in the URL (?neighborhood=<slug>), NOT a new route — so it survives a
  // reload and browser-back clears it. `buildNeighbourhoodHref` preserves every
  // other param (date/country); `setNeighbourhoodFilter` navigates to it.
  const neighbourhoodFilter = searchParams.get("neighborhood");
  const buildNeighbourhoodHref = (slug: string | null): string => {
    const next = new URLSearchParams(searchString);
    if (slug) next.set("neighborhood", slug);
    else next.delete("neighborhood");
    const qs = next.toString();
    return `/discover/location/${cityRaw}${qs ? `?${qs}` : ""}`;
  };
  const setNeighbourhoodFilter = (slug: string | null) => {
    navigate(buildNeighbourhoodHref(slug));
  };

  const [activeFilter, setActiveFilter] = useState("all");
  // Popover filters (Phase 2c): price band + sort. Defaults are pass-throughs.
  const [priceFilter, setPriceFilter] = useState("any");
  const [sortMode, setSortMode] = useState("recommended");
  // Free-text "what" search — a light, client-side narrow of the page (never a
  // trip write, never a new query param). Empty query = byte-identical to before.
  const [searchQuery, setSearchQuery] = useState("");

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
  // Trailhead T4.3: published external stubs + the render-time trend headline.
  const externalStubs = data?.externalStubs?.data?.stubs ?? [];
  const externalTrendContext = data?.externalStubs?.data?.trendContext ?? null;

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
    // Carry the FEED's city into the services surface as `location` (the param the
    // /services page filters on — discover.tsx:772). Without it, Book-now dropped
    // which city the traveller was browsing and landed on an un-scoped catalog.
    navigate(
      `/services?categoryKey=${encodeURIComponent(c.categoryKey)}&location=${encodeURIComponent(city)}&upsellSource=${upsellSurface}`,
    );
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

  // FP-1 / B4 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1): the mixed "all" feed keeps its
  // 4-service balance cap; a spine chip is a deliberate search and must show EVERY matching
  // approved listing, not a sample of four (that cap is why a whole approved Kyoto catalog was
  // invisible on Kyoto's own page even once it reached the payload). The same deliberate-search
  // posture applies to experts under the Experts chip: the full list, not the lead-excluded
  // filler slice (there is no separate lead-expert injection to dedupe against off "all").
  const feedItems: FeedItem[] = data
    ? buildFeedStream(
        neighborhoods, allGems,
        activeFilter === "all" ? feedExperts : experts,
        events, supplyHotels, supplyActivities, platformServices,
        undefined,
        activeFilter === "all" ? undefined : Number.POSITIVE_INFINITY,
      )
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
  // searches — they show organic results only, but keep the neighbourhood
  // STRUCTURE: the stream passes through untouched and the bento renderer
  // filters each section per-tile (chipMatches), dropping neighbourhoods with
  // no matches (Phase 2c — no more dissolved flat grid).
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
      : feedItems;

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
  // Trailhead T4.3: published external stubs as distinct, non-bookable feed items.
  const externalStubItems: FeedItem[] = (externalStubs as any[]).map((s) => ({
    kind: "external-stub" as FeedItem["kind"],
    id: `external-stub-${s.id}`,
    data: s,
  }));

  // Exactly ONE earn-card near position 9 (F7/F9), only on the unfiltered "all" view.
  const filteredItems: FeedItem[] = (() => {
    if (activeFilter !== "all") return retagged;
    const out = [...retagged];
    out.splice(Math.min(9, out.length), 0, { kind: "earn-card", id: "earn-card", data: { city } });
    // External stubs are woven in after the earn-card region (append — they never displace a
    // native card or the rec cadence). Distinct card treatment (CityFeedCardExternalStub) keeps
    // them visibly separate from bookable listings.
    if (externalStubItems.length > 0) {
      out.splice(Math.min(12, out.length), 0, ...externalStubItems);
    }
    return out;
  })();

  // ── Header: read-only "where" value (city + trip dates) ─────────────────
  const whereValue = (() => {
    const range = formatTripDates(tripCtx.startDate, tripCtx.endDate);
    return range ? `${displayCity} · ${range}` : displayCity;
  })();

  // ── Spine chip live-stock counts (§13: real counts from the loaded data) ──
  // Counted over the DELIBERATE-SEARCH stream (full experts, uncapped services —
  // exactly what selecting the chip shows) with each neighbourhood's nested gems
  // expanded to their bento exposure. Zero renders NO badge, never a fabricated
  // number.
  const chipCounts: Record<string, number> = (() => {
    if (!data) return {};
    const searchStream = buildFeedStream(
      neighborhoods, allGems, experts, events, supplyHotels, supplyActivities, platformServices,
      undefined,
      Number.POSITIVE_INFINITY,
    );
    const countable: FeedItem[] = searchStream.flatMap((it) => {
      if (it.kind === "neighborhood")
        return ((it.data?.gems ?? []) as any[])
          .slice(0, 4)
          .map((g) => ({ kind: "loose-gem" as FeedItem["kind"], id: `gem-${g.id}`, data: g }));
      if (it.kind === "city-separator") return [];
      return [it];
    });
    return Object.fromEntries(
      SPINE_CHIPS.map((c) => [
        c.id,
        c.id === "all" ? countable.length : countable.filter((it) => chipMatches(it, c.id)).length,
      ]),
    );
  })();

  // ── Header: light client-side narrow from the "what" search ─────────────
  // Empty query is a pure passthrough (behaviour unchanged). A non-empty query
  // keeps structural items (neighbourhood sections + separators) and narrows the
  // free-standing content cards by visible text. Never reorders, never mutates.
  const searchNeedle = searchQuery.trim().toLowerCase();
  const visibleItems: FeedItem[] = searchNeedle
    ? filteredItems.filter((it) => {
        if (it.kind === "neighborhood" || it.kind === "city-separator") return true;
        const d: any = it.data ?? {};
        const hay = [
          d.title, d.name, d.displayName, d.tagline, d.headline, d.category, d.categoryKey,
          d.candidate?.displayName, d.candidate?.tagline, d.offeringLabel, d.neighborhoodName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(searchNeedle);
      })
    : filteredItems;

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
      {/* ── Band (earn-grammar header + Marketplace rail) — FULL-BLEED ─────
          The band section carries its own inner `container max-w-6xl`, so it
          lives OUTSIDE the narrower body wrapper below and spans the viewport
          edge-to-edge, matching /destinations (ruling #3, 2026-08-26). */}
      {data && (
        <HeroBand
          city={city}
          heroData={data.hero?.data}
          country={heroCountry}
          scheduledDate={scheduledDate}
          onDismissDate={handleDismissDate}
        />
      )}

      {/* Phase 2d: no ← Back — the Marketplace rail and browser back cover it;
          no stats row — crowd level lives in the band eyebrow and the counts on
          the chips. The feed starts right under the search row + chip rail. */}
      <div className="container mx-auto px-4 py-6 max-w-5xl">
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
          <div className="space-y-4">
            {/* ── "Pulled to top" date section (date mode only) ─────── */}
            {scheduledDate && (
              <DateHighlightStrip
                scheduledDate={scheduledDate}
                cityIntel={data.hero?.data?.city}
                onAdd={handleAdd}
              />
            )}

            {/* ── Two-field search + Filters popover ────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_auto] gap-2 max-w-4xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--earn-muted)]" />
                <Input
                  placeholder={`What do you need help with in ${displayCity}?`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10"
                  data-testid="input-search"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--earn-muted)]" />
                <Input
                  readOnly
                  value={whereValue}
                  aria-label="Where you are browsing"
                  className="pl-9 h-10"
                  data-testid="input-location"
                />
              </div>
              <FiltersPopover
                price={priceFilter}
                onPrice={setPriceFilter}
                sort={sortMode}
                onSort={setSortMode}
              />
            </div>

            {/* ── Spine chip rail (Phase 2c — the visible gem-type filter) ── */}
            <SpineChipRail active={activeFilter} counts={chipCounts} onSelect={setActiveFilter} />

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

            {/* Trailhead T4.4: render-time trend headline for external content — honest ceiling
                ("‹Market› is trending · ‹Event› approaching"), server-computed, never stored, only
                shown when published external stubs exist for this market. */}
            {externalTrendContext && externalStubs.length > 0 && (
              <div
                data-testid="external-trend-context"
                className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{externalTrendContext}</span>
              </div>
            )}

            {/* ── Blended bento feed (one interleaved stream) ─────────
                The bento is the ONLY rendering under every chip (Phase 2c):
                a chip filters each neighbourhood's bento to that kind and
                empty neighbourhoods drop out — no dissolved flat grid. */}
            <FeedRenderer
              items={visibleItems}
              city={city}
              scheduledDate={scheduledDate}
              activeFilter={activeFilter}
              priceFilter={priceFilter}
              sortMode={sortMode}
              neighbourhoodFilter={neighbourhoodFilter}
              onNeighbourhoodFilter={setNeighbourhoodFilter}
              neighbourhoodHref={buildNeighbourhoodHref}
              onAdd={handleAdd}
              onBookRec={handleBookRecommendation}
              recLabels={{
                recommendedLabel: feedConfig.recommendedLabel,
                affiliateLabel: feedConfig.affiliateLabel,
              }}
            />
            {activeFilter === "all" && !neighbourhoodFilter && (
              <TripComplementsStrip city={city} highlight={currentHighlight} />
            )}

            {/* Request-a-service footer — a "nothing here matches" moment gets a
                forward action instead of a dead end (POST /api/service-requests). */}
            <div
              className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center"
              data-testid="section-service-request"
            >
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Can't find what you're looking for in {toTitleCase(city)}?
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Tell us the experience you want and we'll try to source it for you.
              </p>
              <ServiceRequestDialog city={toTitleCase(city)} />
            </div>
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
