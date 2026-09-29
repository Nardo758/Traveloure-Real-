/**
 * landing-hero.tsx — HERO v2 (landing-build lane, Phase 2 commit 1).
 * Visual of record: docs/design/landing-earn-mock.html "HERO v2"; behavior contract:
 * docs/design/LANDING_SPEC.md.
 *
 * Billboard photos are curated and credited from shared/landing-billboard.ts. The representative
 * photo label identifies the pictured market; the compact expert / gem / service captions and
 * actions use the live hero feed's city independently (the photo is not a listing photo).
 *
 * Override (follow-up 4, ledger `2026-09-28-billboard-override-listing`): when a real expert passes
 * the byline gate for a tile's market (GET /api/landing/billboard-experts, decided server-side), THAT
 * tile renders the expert's live listing instead — title, own lines, price as the storefront card
 * shows it, photo — with "Plan with @handle" and "View listing". Per market and per tile; a tile
 * without a qualifying expert keeps its credited photo. The live payload (GET /api/landing/hero)
 * feeds the ticker, Wanted strip, and the compact card captions/actions.
 *
 * "Where do you want to begin?" pills: the nav's BROWSE and FIND HELP sections (the same eight
 * destinations the removed entry tiles carried), read from nav-config, never retyped.
 *
 * Typed search: STATIC CURATED titles (decision-maker ruled — no UGC; source of truth is
 * LANDING_SPEC.md §Typed-search titles). Rotates via the shared useRotation hook (8s,
 * pause on hover/focus, still under prefers-reduced-motion); stops the moment the input
 * focuses; submits to /services?q=&location= and NEVER writes trip context.
 *
 * "Plan my trip" calls the SAME handler the old hero used — setPlanningOpen(true) via the
 * onPlanTrip prop → EnhancedPlanningModal (preserve-exactly, LANDING_SPEC.md).
 */
import { Fragment, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search, Sparkles } from "lucide-react";
import { useRotation } from "@/hooks/use-rotation";
import { getCityDiscoverHref } from "@/lib/city-discover-route";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { navGroupsConfig, type NavLeafConfig } from "@/lib/nav-config";
import type { LandingHeroPayload } from "@shared/landing-hero";
import {
  BILLBOARD_TILES,
  billboardLabel,
  resolveBillboardCredit,
  type BillboardCredit,
  type BillboardTile,
  type PhotoAttribution,
} from "@shared/landing-billboard";
import type { PlanningSource } from "@/contexts/PlanningContext";
import type { BillboardOverride } from "@shared/landing-billboard-override";
import { derivePreviewPrice } from "@/lib/catalog-preview-presentation";
import { earnerProfilePath } from "@/lib/earner-address";
// The ONE credit record for the repo's landing photos — never retyped into the tiles.
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
// Source of truth: docs/design/LANDING_SPEC.md §Typed-search titles (ruled: static
// curated, market-spread, no UGC). Edit the spec first, then mirror here.
const TYPED_SEARCH_TITLES = [
  "A rainy-day tea itinerary in Kyoto",
  "Porto wine cellars a local would pick",
  "Sunset sailing out of Cartagena's old port",
  "Street food after dark in Mumbai",
  "Edinburgh closes and hidden courtyards",
  "A slow morning in Goa's spice villages",
  "Block-printing with a maker in Jaipur",
  "Bogotá coffee farms in a day",
];

type LandingHeroData = LandingHeroPayload;

/**
 * "Where do you want to begin?" — two rows of pills under the hero buttons (landing reorder,
 * ledger `2026-09-28-landing-reorder`). They replace the former eight-tile EntryStrips section
 * and DERIVE from the same navGroupsConfig BROWSE / FIND HELP sections the navbar reads, so the
 * pill set is the old tile set by construction and a route rename can never strand one (§18
 * rule 1). Labels use the nav's own i18n keys.
 */
export function heroBeginRows(): Array<{ key: "browse" | "findHelp"; items: NavLeafConfig[] }> {
  const section = (title: string) => {
    for (const group of navGroupsConfig) {
      for (const s of group.sections ?? []) if (s.title.toUpperCase() === title) return s.items;
    }
    return [];
  };
  return [
    { key: "browse", items: section("BROWSE") },
    { key: "findHelp", items: section("FIND HELP") },
  ];
}

function HeroBeginPills() {
  const { t } = useTranslation("nav");
  const rows = heroBeginRows().filter((row) => row.items.length > 0);
  if (rows.length === 0) return null;
  const marker = { browse: t("hero.beginBrowse", "Browse"), findHelp: t("hero.beginFindHelp", "Find help") };
  return (
    <div className="mt-6" data-testid="hero-begin">
      <p className="mb-2.5 text-[17px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
        {t("hero.beginPrompt", "Where do you want to begin?")}
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start" data-testid={`hero-begin-${row.key}`}>
            <span
              className="w-[76px] shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] sm:pt-[9px]"
              style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}
            >
              {marker[row.key]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {row.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-[32px] items-center rounded-full border bg-white px-3 text-[12px] hover:border-[color:var(--earn-teal)] hover:text-[color:var(--earn-teal-ink)]"
                  style={{ fontFamily: EARN_MONO, borderColor: "var(--earn-border)", color: "var(--earn-ink)" }}
                  data-testid={`hero-pill-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  {item.i18nKey ? t(item.i18nKey, item.name) : item.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The billboard (landing reorder, ledger `2026-09-28-landing-reorder`, item 5): the curated tiles
 * of shared/landing-billboard.ts whose photo credit resolves from ATTRIBUTION.json. A tile whose
 * photo has no entry is not rendered (§13: never an uncredited photo).
 */
export function resolveBillboardTiles(
  attributions: readonly PhotoAttribution[] = LANDING_PHOTO_ATTRIBUTION as PhotoAttribution[],
): Array<BillboardTile & { credit: BillboardCredit }> {
  return BILLBOARD_TILES.flatMap((tile) => {
    const credit = resolveBillboardCredit(tile.imagePath, attributions);
    return credit ? [{ ...tile, credit }] : [];
  });
}

/** The PlanningSource a tile's "Start this plan" opens: the tile's occasion and its market. */
export function billboardPlanSource(tile: BillboardTile): PlanningSource | null {
  const market = OPERATING_MARKETS.find((m) => m.marketKey === tile.marketKey);
  if (!market) return null;
  return { door: "billboard", experienceSlug: tile.occasionSlug, city: market.cityName, country: market.country };
}

/**
 * "Plan with <handle>" on an overridden tile (follow-up 4, ledger
 * `2026-09-28-billboard-override-listing`): a NEW plan with the tile's occasion and market pre-set,
 * finished as "plan with a local" and returned to that expert (Locked Decision 42 D5/D15) — the
 * slip is minted, then the traveler lands on the expert's storefront carrying `?tripId=`, where
 * the one storefront request rail assigns the expert (Locked Decision 32(b), `ensureTripAdvisorRow`).
 * The landing writes no advisor row itself: a door grants nothing. Door `billboard` (follow-up 1).
 */
export function billboardOverridePlanSource(tile: BillboardTile, override: BillboardOverride): PlanningSource | null {
  const base = billboardPlanSource(tile);
  if (!base) return null;
  return { ...base, branch: "local", returnTo: { kind: "expert", handle: override.handle } };
}

function TilePhoto({ src, onFail }: { src: string; onFail: () => void }) {
  return (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
      loading="eager"
      onError={onFail}
    />
  );
}

function TileShade() {
  return (
    <div
      className="absolute inset-0"
      style={{ background: "linear-gradient(180deg,rgba(13,33,55,.15) 0%,rgba(13,33,55,.9) 100%)" }}
      aria-hidden="true"
    />
  );
}

function TileCredit({ tileKey, credit }: { tileKey: string; credit: BillboardCredit }) {
  return (
    <a
      href={credit.source}
      target="_blank"
      rel="noopener noreferrer"
      className="relative z-10 mt-2 text-[9.5px] opacity-75 hover:underline"
      style={{ fontFamily: EARN_MONO }}
      data-testid={`hero-billboard-credit-${tileKey}`}
    >
      Photo: {credit.creator} · {credit.site}
    </a>
  );
}

const TILE_FRAME = "relative flex flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white";
const TILE_GROUND = { background: "linear-gradient(160deg,#7C6A63,#1E3A5F)" };

function centsToDollarsLabel(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Credited representative photos, with the original compact live/fallback text hierarchy. */
function CuratedTileCard({
  tile,
  large,
  kind,
  hero,
}: {
  tile: BillboardTile & { credit: BillboardCredit };
  large: boolean;
  kind: "expert" | "gem" | "service";
  hero: LandingHeroData | null;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const market = OPERATING_MARKETS.find((m) => m.marketKey === tile.marketKey);
  if (!market) return null;
  const liveCity = hero?.city?.trim() || market.cityName;
  const anchor = kind === "expert" ? hero?.anchorExpert : null;
  const gem = kind === "gem" ? hero?.gem : null;
  const service = kind === "service" ? hero?.service : null;
  const storefront = anchor?.handle ? earnerProfilePath({ handle: anchor.handle }) : null;
  const expertPrice = centsToDollarsLabel(anchor?.fromPriceCents);
  const servicePrice = centsToDollarsLabel(service?.priceCents);
  const caption =
    kind === "expert" && anchor
      ? `Local expert${hero?.city ? ` · ${liveCity}` : ""}`
      : kind === "gem" && gem
        ? "Hidden gem"
        : kind === "service" && service
          ? "Book on Traveloure"
          : "Representative destination";
  const title =
    kind === "expert"
      ? anchor?.name ?? liveCity
      : kind === "gem"
        ? gem?.name ?? liveCity
        : service?.name ?? `Ways to explore ${liveCity}`;
  return (
    <div
      className={`${TILE_FRAME} ${large ? "row-span-2 min-h-[330px]" : "min-h-[220px]"}`}
      style={TILE_GROUND}
      data-testid={`hero-billboard-${tile.key}`}
    >
      {!photoFailed && <TilePhoto src={tile.imagePath} onFail={() => setPhotoFailed(true)} />}
      <TileShade />
      <span
        className="absolute left-2.5 top-2.5 z-10 rounded-[6px] bg-black/45 px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.1em]"
        style={{ fontFamily: EARN_MONO }}
        data-testid={`hero-billboard-label-${tile.key}`}
      >
        {billboardLabel(market.cityName)}
      </span>
      {kind === "gem" && gem?.score != null && (
        <span
          className="absolute right-2.5 top-2.5 z-10 rounded-[8px] bg-white px-[7px] py-[3px] text-[11px] font-semibold"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}
        >
          {gem.score}
        </span>
      )}
      {kind === "service" && servicePrice && (
        <span
          className="absolute right-2.5 top-2.5 z-10 rounded-[8px] bg-white px-[7px] py-[3px] text-[11px] font-semibold"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}
        >
          {servicePrice}
        </span>
      )}
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        {caption}
      </span>
      <b className={`relative z-10 font-semibold leading-tight ${large ? "text-[20px]" : "text-[15px]"}`} style={{ fontFamily: FRAUNCES }}>
        {title}
      </b>
      {kind === "expert" && (
        storefront ? (
          <Link
            href={storefront}
            className="relative z-10 mt-2 inline-flex min-h-[32px] items-center self-start rounded-[7px] px-2.5 text-[12px] font-semibold text-white"
            style={{ background: "var(--earn-coral-ink)" }}
            data-testid="hero-anchor-cta"
          >
            Plan with {anchor!.name.split(" ")[0]}{expertPrice ? ` · from ${expertPrice}` : ""}
          </Link>
        ) : (
          <Link
            href={getCityDiscoverHref(liveCity)}
            className="relative z-10 mt-2 inline-flex min-h-[32px] items-center self-start rounded-[7px] border border-white/70 bg-black/20 px-2.5 text-[12px] font-semibold text-white"
            data-testid="hero-anchor-browse"
          >
            Browse {liveCity}
          </Link>
        )
      )}
      <TileCredit tileKey={tile.key} credit={tile.credit} />
    </div>
  );
}

/**
 * An OVERRIDDEN tile — a byline-gated expert's LIVE LISTING (follow-up 4). Every value is the
 * listing's own: its title, its lines, and the price as the storefront card shows it
 * (`derivePreviewPrice`, the storefront's own derivation — never typed here; hidden when the
 * listing hides it). The listing's photo carries no third-party credit because it is the owner's
 * own; with no listing photo, or when it fails to load, the tile keeps its market's repo photo and
 * that photo's credit.
 */
function OverrideTileCard({
  tile,
  large,
  override,
  onStartPlan,
}: {
  tile: BillboardTile & { credit: BillboardCredit };
  large: boolean;
  override: BillboardOverride;
  onStartPlan: (source: PlanningSource) => void;
}) {
  const [listingPhotoFailed, setListingPhotoFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const market = OPERATING_MARKETS.find((m) => m.marketKey === tile.marketKey);
  if (!market) return null;
  const { listing } = override;
  const usesListingPhoto = !!listing.imageUrl && !listingPhotoFailed;
  const price = derivePreviewPrice(listing);
  const storefront = earnerProfilePath({ handle: override.handle });
  return (
    <div
      className={`${TILE_FRAME} pt-10 ${large ? "row-span-2 min-h-[330px]" : "min-h-[220px]"}`}
      style={TILE_GROUND}
      data-testid={`hero-billboard-${tile.key}`}
      data-override="listing"
    >
      {usesListingPhoto ? (
        <TilePhoto src={listing.imageUrl!} onFail={() => setListingPhotoFailed(true)} />
      ) : (
        !fallbackFailed && <TilePhoto src={tile.imagePath} onFail={() => setFallbackFailed(true)} />
      )}
      <TileShade />
      <span
        className="absolute left-2.5 top-2.5 z-10 rounded-[6px] bg-black/45 px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.1em]"
        style={{ fontFamily: EARN_MONO }}
        data-testid={`hero-billboard-label-${tile.key}`}
      >
        {override.roleLabel} · @{override.handle}
      </span>
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        {market.cityName}
      </span>
      <b
        className={`relative z-10 font-semibold leading-tight ${large ? "text-[20px]" : "text-[15px]"}`}
        style={{ fontFamily: FRAUNCES }}
        data-testid={`hero-billboard-listing-title-${tile.key}`}
      >
        {listing.title}
      </b>
      {listing.lines.length > 0 && (
        <ul className="relative z-10 mt-1.5 space-y-0.5 text-[12px] leading-snug opacity-90">
          {listing.lines.map((line) => (
            <li key={line} className="line-clamp-2">{line}</li>
          ))}
        </ul>
      )}
      {!price.hidden && (
        <span className="relative z-10 mt-1.5 text-[13px] font-semibold" data-testid={`hero-billboard-price-${tile.key}`}>
          {price.text}
          {price.unit ? <span className="ml-1 text-[11px] font-normal opacity-80">{price.unit}</span> : null}
        </span>
      )}
      <div className="relative z-10 mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            const source = billboardOverridePlanSource(tile, override);
            if (source) onStartPlan(source);
          }}
          className="inline-flex min-h-[32px] items-center rounded-[7px] px-2.5 text-[12px] font-semibold text-white"
          style={{ background: "var(--earn-coral-ink)" }}
          data-testid={`hero-billboard-plan-with-${tile.key}`}
        >
          Plan with @{override.handle}
        </button>
        {storefront && (
          <Link
            href={storefront}
            className="inline-flex min-h-[32px] items-center rounded-[7px] border border-white/70 bg-black/20 px-2.5 text-[12px] font-semibold text-white"
            data-testid={`hero-billboard-view-listing-${tile.key}`}
          >
            View listing
          </Link>
        )}
      </div>
      {!usesListingPhoto && !fallbackFailed && <TileCredit tileKey={tile.key} credit={tile.credit} />}
    </div>
  );
}

export function LandingHero({
  onPlanTrip,
  onStartPlan,
}: {
  onPlanTrip: () => void;
  onStartPlan: (source: PlanningSource) => void;
}) {
  const { data: hero } = useQuery<LandingHeroData>({ queryKey: ["/api/landing/hero"] });
  const { data: override } = useQuery<{ overrides: BillboardOverride[] }>({ queryKey: ["/api/landing/billboard-experts"] });
  return (
    <LandingHeroContent
      hero={hero ?? null}
      onPlanTrip={onPlanTrip}
      onStartPlan={onStartPlan}
      overrides={override?.overrides ?? []}
    />
  );
}

export function LandingHeroContent({
  hero,
  onPlanTrip,
  onStartPlan = () => {},
  overrides = [],
}: {
  hero: LandingHeroData | null;
  onPlanTrip: () => void;
  onStartPlan?: (source: PlanningSource) => void;
  overrides?: readonly BillboardOverride[];
}) {
  const { t } = useTranslation("nav");
  const [, navigate] = useLocation();
  // Typed search — rotation stops on hover AND the moment the input focuses.
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHovered, setSearchHovered] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const titleIndex = useRotation(TYPED_SEARCH_TITLES.length, {
    paused: searchFocused || searchHovered,
  });
  const currentTitle = TYPED_SEARCH_TITLES[titleIndex];
  const wantedSlots = hero?.wanted ?? [];
  const [wantedFocused, setWantedFocused] = useState(false);
  const [wantedHovered, setWantedHovered] = useState(false);
  const wantedIndex = useRotation(Math.max(wantedSlots.length, 1), {
    paused: wantedSlots.length <= 1 || wantedFocused || wantedHovered,
  });
  const wanted = wantedSlots[wantedIndex] ?? null;

  const submitSearch = () => {
    const q = typedValue.trim() || currentTitle;
    const params = new URLSearchParams({ q });
    if (hero?.city) params.set("location", hero.city);
    // Browses Services; never writes trip context (LANDING_SPEC.md).
    navigate(`/services?${params.toString()}`);
  };

  const marketNames = OPERATING_MARKETS.slice(0, 4);
  const tiles = resolveBillboardTiles();

  const tickerParts = hero?.city
    ? [
        hero.city,
        hero.trend && hero.trend > 0 ? `trend ${hero.trend}` : null,
        hero.crowd ? `crowd ${hero.crowd}` : null,
      ].filter(Boolean)
    : [];

  return (
    <section
      className="w-full px-4"
      style={{ background: "var(--earn-ground, #FAFAF8)" }}
      data-testid="landing-hero"
    >
      <div
        className="mx-auto grid max-w-[1180px] items-center gap-10 py-12 lg:grid-cols-2"
        style={{ paddingBottom: 34 }}
      >
        {/* Left: pitch + typed search + CTAs */}
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{
              fontFamily: EARN_MONO,
              color: "var(--earn-teal-ink)",
              background: "var(--earn-teal-wash)",
              borderColor: "#BFDCDC",
            }}
            data-testid="hero-beta-pill"
          >
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--earn-green, #5DCAA5)" }} />
            Beta in {OPERATING_MARKETS.length} operating markets
          </span>
          <h1
            className="mt-3 text-[40px] font-semibold leading-[1.03] tracking-[-0.015em] sm:text-[54px]"
            style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
          >
            {t("hero.headline", "Any experience. Anywhere. Planned like a local.")}
          </h1>
          <p className="mb-[18px] mt-3 max-w-[500px] text-[17px]" style={{ color: "#3C4652" }}>
            {t(
              "hero.subhead",
              "Tell us the occasion and where in the world you want it. We build the plan around it, and someone who lives there does the rest.",
            )}
          </p>

          <div
            className="flex max-w-[520px] items-center gap-2.5 border-b-[1.5px] px-0.5 py-2.5"
            style={{ borderColor: "var(--earn-ink, #1A1A18)" }}
            onMouseEnter={() => setSearchHovered(true)}
            onMouseLeave={() => setSearchHovered(false)}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: "var(--earn-muted)" }} />
            <input
              type="text"
              value={typedValue}
              placeholder={currentTitle}
              onChange={(e) => setTypedValue(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              aria-label="Search services"
              className="w-full bg-transparent text-[16px] outline-none placeholder:opacity-80"
              style={{ color: "var(--earn-ink)" }}
              data-testid="hero-typed-search"
            />
            <span
              className="ml-auto whitespace-nowrap text-[10.5px] tracking-[0.06em]"
              style={{ fontFamily: EARN_MONO, color: "var(--earn-faint, #9AA1A9)" }}
            >
              ↵ to browse
            </span>
          </div>
          <p
            className="mb-[18px] mt-1.5 text-[11px]"
            style={{ fontFamily: EARN_MONO, color: "var(--earn-faint, #9AA1A9)" }}
          >
            Curated searches from our {OPERATING_MARKETS.length} markets. Stops the moment you
            focus. Browses Services; never writes to your trip.
          </p>

          <div className="flex gap-2.5">
            {/* Coral 1 of 3 (ruled): the primary Plan-my-trip CTA. Same handler as ever. */}
            <button
              type="button"
              onClick={onPlanTrip}
              className="inline-flex items-center gap-2 rounded-[10px] px-[18px] py-3 text-[14px] font-semibold text-white"
              style={{ background: "var(--earn-coral-ink)" }}
              data-testid="button-plan-trip"
            >
              <Sparkles className="h-4 w-4" />
              {t("hero.startPlanning", "Start planning")}
            </button>
            <Link
              href="/experts"
              className="inline-flex items-center rounded-[10px] border px-[18px] py-3 text-[14px] font-semibold"
              style={{ borderColor: "var(--earn-border, #E4E4DE)", color: "var(--earn-ink)", background: "#fff" }}
              data-testid="button-browse-experts"
            >
              Browse local experts
            </Link>
          </div>

          <HeroBeginPills />
        </div>

        {/* Right: live ticker + stable bento. Missing live legs become honest representative cards. */}
        <div>
          {tickerParts.length > 0 && (
            <div
              className="mb-2.5 flex items-center gap-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em]"
              style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}
              data-testid="hero-ticker"
            >
              <i
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--earn-green, #5DCAA5)", boxShadow: "0 0 0 4px rgba(93,202,165,.18)" }}
              />
              {tickerParts.join(" · ")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5" data-testid="hero-bento">
            {tiles.map((tile, i) => (
              (() => {
                const taken = overrides.find((o) => o.tileKey === tile.key && o.marketKey === tile.marketKey);
                return taken ? (
                  <OverrideTileCard key={tile.key} tile={tile} large={i === 0} override={taken} onStartPlan={onStartPlan} />
                ) : (
                  <CuratedTileCard
                    key={tile.key}
                    tile={tile}
                    large={i === 0}
                    kind={i === 0 ? "expert" : i === 1 ? "gem" : "service"}
                    hero={hero}
                  />
                );
              })()
            ))}

            {wanted && (
              <div
                className="col-span-2 flex items-center justify-between gap-3 rounded-[14px] border border-dashed px-3.5 py-2.5"
                style={{
                  background: "var(--earn-ground, #FAFAF8)",
                  borderColor: "var(--earn-border-dash, #D8D8D0)",
                  color: "var(--earn-ink)",
                }}
                data-testid="hero-tile-wanted"
                onMouseEnter={() => setWantedHovered(true)}
                onMouseLeave={() => setWantedHovered(false)}
                onFocusCapture={() => setWantedFocused(true)}
                onBlurCapture={() => setWantedFocused(false)}
              >
                <span className="flex flex-col">
                  <span
                    className="text-[9px] font-medium uppercase tracking-[0.1em]"
                    style={{ fontFamily: EARN_MONO, color: "var(--earn-gold-ink, #8A6D1D)" }}
                  >
                    Wanted in {wanted.city}
                  </span>
                  <b className="text-[13px]">{wanted.title}</b>
                </span>
                <Link
                  href="/earn"
                  className="whitespace-nowrap rounded-[7px] border px-[9px] py-[5px] text-[12px] font-semibold"
                  style={{
                    color: "var(--earn-gold-ink, #8A6D1D)",
                    borderColor: "#F0DCA6",
                    background: "var(--earn-gold-wash, #FBF3DC)",
                  }}
                  data-testid="hero-wanted-cta"
                >
                  Ways to earn
                </Link>
              </div>
            )}
          </div>

          <div
            className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10.5px]"
            style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}
          >
            <span>{hero?.city ? `live from the ${hero.city} feed` : "live feed warming up"}</span>
            <span
              className="flex items-center gap-1 whitespace-nowrap uppercase tracking-[0.14em]"
              data-testid="hero-market-ticker"
            >
              {marketNames.map((market, index) => (
                <Fragment key={market.marketKey}>
                  {index > 0 && (
                    <span className="text-[color:var(--earn-muted)]" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <Link
                    href={getCityDiscoverHref(market.cityName)}
                    className="rounded-sm text-[color:var(--earn-muted)] hover:text-[color:var(--earn-teal-ink)] hover:underline focus:text-[color:var(--earn-teal-ink)] focus-visible:text-[color:var(--earn-teal-ink)] focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--earn-teal)]"
                    aria-label={market.cityName}
                    data-testid={`hero-market-link-${market.marketKey}`}
                  >
                    {market.cityName}
                  </Link>
                </Fragment>
              ))}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
