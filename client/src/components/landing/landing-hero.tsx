/**
 * landing-hero.tsx — HERO v2 (landing-build lane, Phase 2 commit 1).
 * Visual of record: docs/design/landing-earn-mock.html "HERO v2"; behavior contract:
 * docs/design/LANDING_SPEC.md.
 *
 * Live hero — honest by construction (§13): the bento tiles render the nullable legs of
 * GET /api/landing/hero (server-composed from the top city's real feed rows). A null leg
 * renders NO tile — the grid collapses to what exists; nothing is fabricated. The mock's
 * Tile gradients remain the fallback art direction when a source row has no image.
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
import { Search, Sparkles } from "lucide-react";
import { useRotation } from "@/hooks/use-rotation";
import { getCityDiscoverHref } from "@/lib/city-discover-route";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { isReferencePhoto } from "@/lib/photo-provenance";
import { ReferencePhotoChip } from "@/components/ui/reference-photo-chip";

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

interface LandingHeroData {
  city: string | null;
  trend: number | null;
  crowd: string | null;
  anchorExpert: {
    name: string;
    handle: string | null;
    fromPriceCents: number | null;
    imageUrl?: string;
  } | null;
  gem: { name: string; score: number | null; imageUrl?: string } | null;
  service: { name: string; priceCents: number | null; imageUrl?: string } | null;
  wanted: { title: string; neighborhood: string } | null;
}

function centsToDollarsLabel(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function LandingHero({ onPlanTrip }: { onPlanTrip: () => void }) {
  const [, navigate] = useLocation();
  const { data: hero } = useQuery<LandingHeroData>({ queryKey: ["/api/landing/hero"] });

  // Typed search — rotation stops on hover AND the moment the input focuses.
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHovered, setSearchHovered] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const titleIndex = useRotation(TYPED_SEARCH_TITLES.length, {
    paused: searchFocused || searchHovered,
  });
  const currentTitle = TYPED_SEARCH_TITLES[titleIndex];

  const submitSearch = () => {
    const q = typedValue.trim() || currentTitle;
    const params = new URLSearchParams({ q });
    if (hero?.city) params.set("location", hero.city);
    // Browses Services; never writes trip context (LANDING_SPEC.md).
    navigate(`/services?${params.toString()}`);
  };

  const anchor = hero?.anchorExpert ?? null;
  const gem = hero?.gem ?? null;
  const service = hero?.service ?? null;
  const wanted = hero?.wanted ?? null;
  const anchorFrom = centsToDollarsLabel(anchor?.fromPriceCents ?? null);
  const servicePrice = centsToDollarsLabel(service?.priceCents ?? null);
  const anchorFirstName = anchor?.name?.split(" ")[0] ?? null;
  const marketNames = OPERATING_MARKETS.slice(0, 4);

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
            Plan the trip a local would take.
          </h1>
          <p className="mb-[18px] mt-3 max-w-[500px] text-[17px]" style={{ color: "#3C4652" }}>
            Build a plan with AI, then hand the parts that matter to someone who actually lives
            there.
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
              Plan my trip
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
        </div>

        {/* Right: live ticker + bento. Tiles render ONLY when their leg exists. */}
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
            {anchor && (
              <div
                className="relative row-span-2 flex min-h-[310px] flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white"
                style={{
                  background:
                    "linear-gradient(180deg,rgba(30,58,95,.1) 0%,rgba(13,33,55,.92) 100%),linear-gradient(160deg,#7C6A63,#1E3A5F)",
                }}
                data-testid="hero-tile-anchor"
              >
                {anchor.imageUrl && (
                  <img
                    src={anchor.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                {anchor.imageUrl && (
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(180deg,rgba(30,58,95,.12) 0%,rgba(13,33,55,.92) 100%)" }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85"
                  style={{ fontFamily: EARN_MONO }}
                >
                  Local expert{hero?.city ? ` · ${hero.city}` : ""}
                </span>
                <b className="relative z-10 text-[20px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES }}>
                  {anchor.name}
                </b>
                {anchorFrom &&
                  (anchor.handle ? (
                    <Link
                      href={`/s/${anchor.handle}`}
                      className="relative z-10 mt-2 inline-block self-start rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                      style={{ background: "var(--earn-coral-ink)" }}
                      data-testid="hero-anchor-cta"
                    >
                      Plan with {anchorFirstName} · from {anchorFrom}
                    </Link>
                  ) : (
                    <span
                      className="relative z-10 mt-2 inline-block self-start rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                      style={{ background: "var(--earn-coral-ink)" }}
                    >
                      Plan with {anchorFirstName} · from {anchorFrom}
                    </span>
                  ))}
              </div>
            )}

            {gem && (
              <div
                className="relative flex min-h-[150px] flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white"
                style={{
                  background:
                    "linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.6)),linear-gradient(135deg,#B9C8D8,#7C97B4)",
                }}
                data-testid="hero-tile-gem"
              >
                {gem.imageUrl && (
                  <img
                    src={gem.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                {gem.imageUrl && (
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.6))" }}
                    aria-hidden="true"
                  />
                )}
                {gem.score !== null && (
                  <span
                    className="absolute z-10 right-2.5 top-2.5 rounded-[8px] bg-white px-[7px] py-[3px] text-[11px] font-semibold"
                    style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}
                  >
                    {gem.score}
                  </span>
                )}
                {/* Tier-1 reference-photo chip (2026-09-01-photo-tiers): the hero gem tile is a
                    TEASER surface — a stock/places image is labeled until an attributed real
                    photo replaces it (top-left; score badge holds the top-right). */}
                {gem.imageUrl && isReferencePhoto({ url: gem.imageUrl }) && (
                  <ReferencePhotoChip className="left-2.5 top-2.5" testId="hero-gem-reference-photo" />
                )}
                <span
                  className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85"
                  style={{ fontFamily: EARN_MONO }}
                >
                  Hidden gem
                </span>
                <b className="relative z-10 text-[14px] leading-tight" style={{ textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>
                  {gem.name}
                </b>
              </div>
            )}

            {service && (
              <div
                className="relative flex min-h-[150px] flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white"
                style={{
                  background:
                    "linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.6)),linear-gradient(135deg,#E5C6B6,#B97C7C)",
                }}
                data-testid="hero-tile-service"
              >
                {service.imageUrl && (
                  <img
                    src={service.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                {service.imageUrl && (
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.6))" }}
                    aria-hidden="true"
                  />
                )}
                {servicePrice && (
                  <span
                    className="absolute z-10 right-2.5 top-2.5 rounded-[8px] bg-white px-[7px] py-[3px] text-[11px] font-semibold"
                    style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}
                  >
                    {servicePrice}
                  </span>
                )}
                <span
                  className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85"
                  style={{ fontFamily: EARN_MONO }}
                >
                  Book on Traveloure
                </span>
                <b className="relative z-10 text-[14px] leading-tight" style={{ textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>
                  {service.name}
                </b>
              </div>
            )}

            {wanted && (
              <div
                className="col-span-2 flex items-center justify-between gap-3 rounded-[14px] border border-dashed px-3.5 py-2.5"
                style={{
                  background: "var(--earn-ground, #FAFAF8)",
                  borderColor: "var(--earn-border-dash, #D8D8D0)",
                  color: "var(--earn-ink)",
                }}
                data-testid="hero-tile-wanted"
              >
                <span className="flex flex-col">
                  <span
                    className="text-[9px] font-medium uppercase tracking-[0.1em]"
                    style={{ fontFamily: EARN_MONO, color: "var(--earn-gold-ink, #8A6D1D)" }}
                  >
                    Wanted in {wanted.neighborhood}
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
                  Offer this
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
