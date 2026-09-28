/**
 * landing-hero.tsx — HERO v2 (landing-build lane, Phase 2 commit 1).
 * Visual of record: docs/design/landing-earn-mock.html "HERO v2"; behavior contract:
 * docs/design/LANDING_SPEC.md.
 *
 * Billboard (landing reorder, ledger `2026-09-28-landing-reorder`, item 5): the three tiles are
 * CURATED rows from shared/landing-billboard.ts — occasion, market, a repo photo, a headline and
 * three lines — never a live listing, expert name, price or avatar. Each photo is credited from
 * public/images/landing/ATTRIBUTION.json and a photo with no entry is not rendered. A tile says
 * "Representative photo · <market>" until a real expert who passes the byline gate
 * (GET /api/landing/billboard-experts) takes it, and only then shows their initial. "Start this
 * plan" opens a NEW plan with the tile's occasion and market pre-set. The live payload
 * (GET /api/landing/hero) now feeds only the ticker line and the Wanted strip.
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
  type BillboardExpert,
  type BillboardTile,
  type PhotoAttribution,
} from "@shared/landing-billboard";
import type { PlanningSource } from "@/contexts/PlanningContext";
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

function BillboardTileCard({
  tile,
  large,
  expert,
  onStartPlan,
}: {
  tile: BillboardTile & { credit: BillboardCredit };
  large: boolean;
  expert: BillboardExpert | null;
  onStartPlan: (source: PlanningSource) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const market = OPERATING_MARKETS.find((m) => m.marketKey === tile.marketKey);
  if (!market) return null;
  return (
    <div
      className={`relative flex flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white ${large ? "row-span-2 min-h-[330px]" : "min-h-[220px]"}`}
      style={{ background: "linear-gradient(160deg,#7C6A63,#1E3A5F)" }}
      data-testid={`hero-billboard-${tile.key}`}
    >
      {!photoFailed && (
        <img
          src={tile.imagePath}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          onError={() => setPhotoFailed(true)}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg,rgba(13,33,55,.15) 0%,rgba(13,33,55,.9) 100%)" }}
        aria-hidden="true"
      />
      <span
        className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-[6px] bg-black/45 px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.1em]"
        style={{ fontFamily: EARN_MONO }}
        data-testid={`hero-billboard-label-${tile.key}`}
      >
        {expert ? (
          <Link
            href={`/s/${expert.handle}`}
            className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-semibold"
            style={{ color: "var(--earn-navy)" }}
            aria-label={`Local expert @${expert.handle}`}
            data-testid={`hero-billboard-expert-${tile.key}`}
          >
            {expert.initial}
          </Link>
        ) : null}
        {expert ? `Local expert · ${market.cityName}` : billboardLabel(market.cityName)}
      </span>
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        {tile.occasionLabel} · {market.cityName}
      </span>
      <b className={`relative z-10 font-semibold leading-tight ${large ? "text-[20px]" : "text-[15px]"}`} style={{ fontFamily: FRAUNCES }}>
        {tile.headline}
      </b>
      <ul className="relative z-10 mt-1.5 space-y-0.5 text-[12px] leading-snug opacity-90">
        {tile.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const source = billboardPlanSource(tile);
          if (source) onStartPlan(source);
        }}
        className="relative z-10 mt-2.5 inline-flex min-h-[32px] items-center self-start rounded-[7px] border border-white/70 bg-black/20 px-2.5 text-[12px] font-semibold text-white"
        data-testid={`hero-billboard-start-${tile.key}`}
      >
        Start this plan
      </button>
      <a
        href={tile.credit.source}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 mt-2 text-[9.5px] opacity-75 hover:underline"
        style={{ fontFamily: EARN_MONO }}
        data-testid={`hero-billboard-credit-${tile.key}`}
      >
        Photo: {tile.credit.creator} · {tile.credit.site}
      </a>
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
  const { data: override } = useQuery<{ experts: BillboardExpert[] }>({ queryKey: ["/api/landing/billboard-experts"] });
  return (
    <LandingHeroContent
      hero={hero ?? null}
      onPlanTrip={onPlanTrip}
      onStartPlan={onStartPlan}
      experts={override?.experts ?? []}
    />
  );
}

export function LandingHeroContent({
  hero,
  onPlanTrip,
  onStartPlan = () => {},
  experts = [],
}: {
  hero: LandingHeroData | null;
  onPlanTrip: () => void;
  onStartPlan?: (source: PlanningSource) => void;
  experts?: readonly BillboardExpert[];
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
              <BillboardTileCard
                key={tile.key}
                tile={tile}
                large={i === 0}
                expert={experts.find((e) => e.marketKey === tile.marketKey) ?? null}
                onStartPlan={onStartPlan}
              />
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
