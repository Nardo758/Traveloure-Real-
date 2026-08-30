/**
 * /ready-made/:id — the buyer-facing Ready Made Trips detail page (Phase 4).
 *
 * Continuity rebuild (marketplace-details lane, third and final surface — service-detail.tsx and
 * storefront.tsx are its style siblings). Structure, section copy and layout are transcribed from
 * the live-wired reference at artifacts/traveloure/src/pages/ready-made-detail.tsx (+ its
 * ready-made-detail.css), which the decision-maker has seen rendering live data; the token
 * grammar (navy #193752 / coral #f34d6e / teal #247d78 / gold #a67015 on a #f8faf9 ground,
 * Fraunces headings + DM Sans body) follows the canonical continuity vocabulary service-detail.tsx
 * already uses — the artifacts reference's own literal hex values (#142b45/#fb3b63/#287a79/
 * #b57d13) are the same family, standardized here to match the sibling rebuild. This is a
 * presentation-only rebuild: every data fetch, mutation, testid and piece of purchase logic below
 * is unchanged from the pre-rebuild page. The branded header (logo + language selector) is kept —
 * this route is NOT wrapped in the shared app `<Layout>` (see client/src/App.tsx), so it is this
 * page's only navigation chrome, exactly as before.
 *
 * Renders the store's QUALITY STRUCTURE (decision-maker model): branded page header, the declared
 * Type of Plan, hero with its Unsplash credit, then the structured teaser — what's inside (the
 * approval-time insideCounts snapshot), author + shelf section, price. The full itinerary is
 * never shown here: on purchase it clones into the buyer's own editable trip, which is where they
 * see it.
 *
 * The AUTHOR of a not-yet-approved listing sees this exact page flagged "Preview" (the server
 * returns the same redacted DTO with preview:true) — what they ship is what they previewed.
 * Purchase: the safe 2-step (POST /purchase 202 → shared StripeCheckout → POST /purchase/confirm
 * → redirect into the clone). The client never sends an amount (§14).
 *
 * F4 (distribution formats, §17): this page is the STORE channel surface — it consumes the
 * build-format registry (`resolveFormat("store", …)`) and branches its LEAD section only:
 * `map-strip` (store:kyoto-cultural) leads with an honest neighborhood NAME strip (real
 * city_neighborhoods rows for the listing's market — the DTO carries no coordinates and the
 * teaser gate exposes no itinerary, so no map/pins are fabricated, §13); `venue-hero`
 * (store:kyoto-wedding) leads with a fact strip rendering ONLY real DTO fields (market,
 * durationDays, bestSeason when present — party size is NOT in the DTO, so it is omitted);
 * `standard` (store:default) is the page's default lead (none). The §10 teaser gate is untouched,
 * and the author's preview-as-buyer renders the same branch automatically.
 */
import { useState } from "react";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LanguageMenu } from "@/components/language-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { StorefrontLink } from "@/components/marketplace/storefront-link";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { planTypeDisplay } from "@shared/ready-made-plan-types";
import { resolveFormat } from "@/lib/build-formats/registry";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ConciergeBell,
  Copy,
  FileText,
  Loader2,
  LockKeyhole,
  MapPin,
  Pencil,
  ShoppingBag,
  Sun,
  UserRound,
} from "lucide-react";

interface DetailListing {
  id: string;
  title: string;
  planType: string | null;
  /** Free-text theme label, only meaningful when planType === "custom" (shared/ready-made-plan-types.ts). */
  planTypeCustom: string | null;
  market: string;
  durationDays: number;
  bestSeason: string | null;
  pricingMode: "fixed" | "per_traveler";
  priceCents: number | null;
  heroImageUrl: string | null;
  heroImageMeta: { photographer?: string; profileUrl?: string } | null;
  badge: string | null;
  insideCounts: { days?: number; items?: number; byType?: Record<string, number> } | null;
  authorName: string;
  /** MP-2: the author's storefront handle. Null when unclaimed → no link rendered. */
  authorHandle: string | null;
  section: "trips_by_locals" | "advisor";
}

const TYPE_LABELS: Record<string, string> = {
  activity: "Activities", food: "Food & dining", transport: "Transport",
  accommodation: "Stays", venue: "Venues", note: "Notes",
};

/**
 * The listing's experience type for the format resolver, derived from the closed
 * READY_MADE_PLAN_TYPES vocabulary (the DTO's only type field). Event plan types map onto the
 * resolver's event vocabulary (the same words the client/store registry keys use); the
 * itinerary plan types are all "travel". Unknown/null → null (falls through the resolver chain).
 */
const PLAN_TYPE_EXPERIENCE: Record<string, string> = {
  wedding_plan: "wedding",
  proposal_plan: "proposal",
  corporate_retreat_plan: "corporate",
  birthday_plan: "birthday",
  hiking_itinerary: "travel",
  road_trip_itinerary: "travel",
  city_itinerary: "travel",
  food_culture_itinerary: "travel",
  // Aug 2026 vocabulary expansion (ledger 2026-08-22-ready-made-themes closed the drift: these
  // 10 keys existed in the vocabulary but not here, so their listings resolved with a null
  // experience type). Romance & Honeymoon maps onto the registered "honeymoon" event family;
  // the rest are travel-shaped itineraries. `custom` stays unmapped by design — free text
  // carries no resolvable event vocabulary, so it falls through the resolver chain honestly.
  adventure_outdoors: "travel",
  romance_honeymoon: "honeymoon",
  family_trip: "travel",
  wellness_retreat: "travel",
  photography_tour: "travel",
  nightlife_entertainment: "travel",
  cultural_heritage: "travel",
  beach_island: "travel",
  festival_seasonal: "travel",
  shopping_style: "travel",
};

interface CityNeighborhood {
  id: string;
  city: string;
  name: string;
}

/**
 * store:kyoto-cultural lead — the honest lighter variant of the mockup's map strip. The store
 * DTO carries no coordinates and the teaser gate exposes no itinerary items, so there is
 * nothing real to pin on a map (MapControlCenter renders from trip activities with lat/lng —
 * unavailable here by design). Instead: the REAL neighborhood names for the listing's market
 * from the live /api/city-neighborhoods catalog. Renders nothing when the market has no
 * neighborhood rows — never a fabricated strip (§13).
 */
function NeighborhoodStrip({ market }: { market: string }) {
  // Fetch all pages so neighborhoods beyond the first 200 rows are included.
  const { data: allHoods = [] } = useQuery<CityNeighborhood[]>({
    queryKey: ["/api/city-neighborhoods", "all"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const PAGE = 200;
      let all: CityNeighborhood[] = [];
      let offset = 0;
      for (;;) {
        const res = await fetch(`/api/city-neighborhoods?limit=${PAGE}&offset=${offset}`);
        const json = await res.json() as { data: CityNeighborhood[]; hasMore: boolean };
        all = all.concat(json.data);
        if (!json.hasMore) break;
        offset += PAGE;
      }
      return all;
    },
  });
  const city = market.split(",")[0].trim().toLowerCase();
  const hoods = allHoods.filter((n) => n.city.trim().toLowerCase() === city);
  if (hoods.length === 0) return null;
  return (
    <div className="mb-3.5 rounded-[10px] border border-[#dfe7e4] bg-white px-4 py-3" data-testid="lead-map-strip">
      <div className="flex items-center gap-[6px] text-[10px] font-bold uppercase tracking-[0.08em] text-[#738091] mb-2">
        <MapPin className="w-3.5 h-3.5 text-[#247d78]" /> Neighborhoods of {market.split(",")[0].trim()}
      </div>
      <div className="flex flex-wrap gap-[7px]">
        {hoods.map((n) => (
          <span
            key={n.id}
            className="inline-flex items-center rounded-full border border-[#b9ded8] bg-[#eaf7f5] text-[#247d78] text-[11px] font-medium px-2.5 py-1"
          >
            {n.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReadyMadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [paymentIntent, setPaymentIntent] = useState<{ clientSecret: string; paymentIntentId: string; amount: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Teaser map section is additive — a broken image must never ship on a listing page, so a
  // load failure hides the whole section rather than showing a broken-image block.
  const [teaserMapFailed, setTeaserMapFailed] = useState(false);

  const { data, isLoading, error } = useQuery<{ listing: DetailListing; preview: boolean }>({
    queryKey: [`/api/ready-made/${id}`],
    retry: false,
  });
  const listing = data?.listing;
  const isPreview = data?.preview === true;

  const startPurchase = async () => {
    if (!user) {
      toast({ title: "Sign in to buy this trip", description: "You need an account so the trip can be copied into your plans." });
      return;
    }
    const res = await fetch(`/api/ready-made/${id}/purchase`, {
      method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.purchase?.cloneTripId) {
      // Already purchased → straight to the canonical Trip Slip (matches the confirm redirect).
      navigate(`/plans/${body.purchase.cloneTripId}`);
      return;
    }
    if (res.status !== 202) {
      toast({ title: "Purchase unavailable", description: body.message ?? "Please try again.", variant: "destructive" });
      return;
    }
    setPaymentIntent({
      clientSecret: body.clientSecret,
      paymentIntentId: body.paymentIntentId,
      amount: body.listing?.priceCents ?? listing?.priceCents ?? 0,
    });
  };

  const handleStripeSuccess = async (paymentIntentId: string) => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/ready-made/${id}/purchase/confirm`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ paymentIntentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Confirmation failed");
      setPaymentIntent(null);
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip is yours!", description: "We copied it into your plans — every day is editable." });
      if (body.redirect) navigate(body.redirect);
    } catch (e: any) {
      toast({ title: "Payment confirmed but delivery failed", description: `${e.message} — retry from this page; you will not be charged twice.`, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  // Presentational-only: mirrors storefront.tsx's own copyLink pattern. Not a money/purchase
  // path — just a clipboard convenience for the current URL.
  const copyTripLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({ title: "Trip link copied" });
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8faf9]" style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}>
        <div className="max-w-[1180px] mx-auto px-6 pt-14 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-14 w-2/3" />
          <Skeleton className="h-[330px] w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !listing) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center" style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}>
        <div className="max-w-md mx-auto px-6 py-16 text-center">
          <h1 className="text-[#193752] font-semibold text-[24px] mb-2" style={{ fontFamily: "Fraunces, serif" }}>Trip not found</h1>
          <p className="text-[#738091] text-[13px] mb-6">It may have been removed or isn't available yet.</p>
          <Button asChild className="rounded-[8px] bg-[#f34d6e] hover:bg-[#f34d6e]/90 border border-[#f34d6e] text-white font-bold text-[12px]">
            <Link href="/ready-made">Browse Ready Made Trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  const inside = listing.insideCounts;
  const price = listing.priceCents === null ? null : (listing.priceCents / 100).toFixed(2);

  // F4: this page is the STORE channel surface — resolve the distribution format from the
  // listing's own DTO fields (planType → experience type, market) and branch the LEAD only.
  // Unmatched listings resolve store:default → "standard" → no lead strip at all.
  const experienceType = listing.planType ? PLAN_TYPE_EXPERIENCE[listing.planType] ?? null : null;
  const storeFormat = resolveFormat("store", experienceType, listing.market);
  const lead = (storeFormat.layout?.lead as "map-strip" | "venue-hero" | "standard" | undefined) ?? "standard";

  // Public teaser-map endpoint: a sibling of this listing's own detail GET
  // (queryKey [`/api/ready-made/${id}`]) under the same route family — no itinerary/coordinates
  // ever reach this page's DTO (§10 teaser gate), so the SVG is rendered server-side instead.
  const teaserMapUrl = `/api/ready-made/${id}/teaser-map.svg`;
  const showRouteTeaser = !teaserMapFailed;
  const authorBadgeLabel = listing.section === "trips_by_locals" ? `Trip by a Local — ${listing.authorName}` : `By Trip Planner ${listing.authorName}`;

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#193752]" style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}>
      {/* ── Branded page header — this route carries no shared app Layout, so this is the
          page's only navigation chrome (unchanged from the pre-rebuild page). ── */}
      <div className="border-b border-[#dfe7e4] bg-white">
        <div className="max-w-[1180px] mx-auto flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center" data-testid="link-rm-logo">
            <TraveloureLogo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#738091]">Ready Made Trips</span>
            {/* Ruling 116 (distribution-language audit P2): a link/QR recipient can switch the UI
                language here like on every other landing — same ONE selector (ruling 60 (b)). */}
            <LanguageMenu />
          </div>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-6 pb-[72px]">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-[9px] pt-[22px] pb-[10px] text-[#738091] text-[12px]" aria-label="Breadcrumb">
          <Link href="/ready-made" className="inline-flex items-center gap-[6px] hover:text-[#f34d6e] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Marketplace
          </Link>
          <span aria-hidden="true">/</span>
          <strong className="text-[#193752] font-semibold">Ready-Made Trips</strong>
        </nav>

        {isPreview && (
          <div className="my-2.5 rounded-[9px] border border-[#f4d38b] bg-[#fff8e8] px-[14px] py-[11px] text-[12px] text-[#875d0b]" data-testid="banner-preview">
            <strong className="font-bold">Buyer preview</strong> — this is exactly what shoppers will see once approved. Purchasing is disabled.
          </div>
        )}

        {/* Intro — kicker + title + deck, author block aligned right */}
        <section className="grid lg:grid-cols-[minmax(0,1fr)_auto] items-end gap-6 lg:gap-8 py-6">
          <div>
            <p className="text-[#f34d6e] text-[11px] font-extrabold tracking-[0.08em] uppercase mb-2" data-testid="text-plan-type">
              {planTypeDisplay(listing.planType, listing.planTypeCustom)}
            </p>
            <h1
              className="text-[#193752] font-semibold text-[38px] lg:text-[58px] leading-[0.98] tracking-[-0.055em] max-w-[780px]"
              style={{ fontFamily: "Fraunces, serif" }}
              data-testid="text-rm-title"
            >
              {listing.title}
            </h1>
            <p className="text-[#738091] text-[14px] leading-[1.55] max-w-[650px] mt-[13px]">
              A complete, thoughtfully built plan for {listing.market} — ready to become your own editable trip.
            </p>
          </div>
          <div className="flex items-center gap-[9px] text-[#247d78] pb-[3px]">
            <span className="grid place-items-center w-[34px] h-[34px] shrink-0 rounded-full bg-[#eaf7f5] font-extrabold" aria-hidden="true">
              {listing.authorName.charAt(0).toUpperCase()}
            </span>
            <div className="grid gap-[2px]">
              <span className="text-[12px] font-bold">Built by {listing.authorName}</span>
              <small className="text-[#738091] text-[10px]">
                {listing.section === "trips_by_locals" ? "Local perspective" : "Trip planner"} · fixed plan
              </small>
            </div>
            {/* Real author/section label, kept for assistive tech + tests; the visible block
                above says the same thing in the continuity design's voice. */}
            <span className="sr-only" data-testid="badge-rm-section">{authorBadgeLabel}</span>
          </div>
        </section>

        {/* store:kyoto-wedding lead — a fact strip rendering only real DTO fields. */}
        {lead === "venue-hero" && (
          <div
            className="flex flex-wrap items-center gap-x-[18px] gap-y-2 rounded-[10px] bg-[#7A2E3B] text-white text-[12px] px-[15px] py-3 mb-3.5"
            data-testid="lead-venue-hero"
          >
            <span>{listing.market}</span>
            <strong className="font-bold">{listing.durationDays} days</strong>
            {listing.bestSeason && <span>Date window: {listing.bestSeason}</span>}
          </div>
        )}
        {/* store:kyoto-cultural lead — the neighborhood strip band. */}
        {lead === "map-strip" && <NeighborhoodStrip market={listing.market} />}

        {/* Hero — two-panel: real cover photo (or an honest abstract placeholder, §13) beside
            the route teaser (server-rendered SVG, no itinerary/pins exposed pre-purchase). A
            teaser-map load failure collapses the hero to one column; if there is also no cover
            photo, the whole hero is skipped rather than shipping an empty/broken block. */}
        {(listing.heroImageUrl || showRouteTeaser) && (
          <figure
            className={`relative grid ${showRouteTeaser ? "lg:grid-cols-[1.35fr_0.65fr]" : ""} min-h-[220px] lg:min-h-[330px] rounded-2xl overflow-hidden border border-[#dfe7e4] bg-[#183d4a] mb-2`}
            aria-label="Trip overview"
          >
            <div className="relative min-h-[220px] lg:min-h-[330px] overflow-hidden bg-[#dbe9e4]">
              {listing.heroImageUrl ? (
                <>
                  <img
                    src={listing.heroImageUrl}
                    alt={listing.title}
                    className="w-full h-full min-h-[220px] lg:min-h-[330px] object-cover"
                    data-testid="img-rm-hero"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(180deg, transparent 35%, rgba(12,35,46,0.58) 100%)" }}
                    aria-hidden="true"
                  />
                  <div className="absolute z-[1] left-5 right-5 lg:left-7 lg:right-7 bottom-5 lg:bottom-7 text-white">
                    <span className="block mb-[7px] text-[10px] font-extrabold uppercase tracking-[0.08em]">{listing.market}</span>
                    <strong className="block max-w-[500px] font-semibold text-[24px] lg:text-[30px] leading-[1.04] tracking-[-0.035em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {listing.title}
                    </strong>
                  </div>
                </>
              ) : (
                <div
                  className="flex items-end min-h-[220px] lg:min-h-[330px] p-7"
                  style={{
                    background:
                      "radial-gradient(circle at 78% 20%, rgba(255,255,255,0.24) 0 1px, transparent 2px), radial-gradient(circle at 24% 38%, rgba(255,255,255,0.16) 0 1px, transparent 2px), linear-gradient(145deg, #247d78 0%, #183d4a 58%, #193752 100%)",
                    backgroundSize: "80px 80px, 110px 110px, auto",
                  }}
                >
                  <div className="relative z-[1] grid gap-2 text-white">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-75">Ready-Made Trip</span>
                    <strong className="font-semibold text-[32px] lg:text-[38px] leading-none tracking-[-0.045em]" style={{ fontFamily: "Fraunces, serif" }}>
                      {listing.market}
                    </strong>
                    <small className="max-w-[230px] text-[11px] leading-[1.45] opacity-80">A thoughtfully built route, ready to make your own.</small>
                  </div>
                </div>
              )}
            </div>

            {showRouteTeaser && (
              <div className="relative min-w-0 overflow-hidden bg-[#183d4a] text-[#effaf6] p-5" data-testid="section-route-teaser">
                <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] opacity-70">
                  <span>Route preview</span>
                  <span>{listing.market.split(",")[0].trim()}</span>
                </div>
                <img
                  src={teaserMapUrl}
                  alt="General route preview without stop details"
                  className="block w-full h-[180px] lg:h-[235px] mt-4 rounded-[10px] object-cover opacity-80"
                  data-testid="img-route-teaser"
                  onError={() => setTeaserMapFailed(true)}
                />
                <div className="absolute z-[1] left-[30px] right-[30px] bottom-9 flex items-center gap-[7px] rounded-[8px] border border-white/20 bg-[rgba(10,35,43,0.78)] px-2.5 py-2 text-[11px]">
                  <LockKeyhole className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Stops unlock with purchase
                </div>
                <small className="absolute z-[1] left-5 bottom-[11px] text-[9px] opacity-65">Traveloure map · © OpenStreetMap contributors</small>
              </div>
            )}

            {listing.heroImageMeta?.photographer && (
              <figcaption className="absolute z-[2] left-[10px] top-[10px] rounded-[5px] bg-[rgba(20,43,69,0.62)] px-[7px] py-1 text-[9px] text-white">
                Photo by{" "}
                <a className="underline" href={listing.heroImageMeta.profileUrl} target="_blank" rel="noreferrer">
                  {listing.heroImageMeta.photographer}
                </a>{" "}
                on Unsplash
              </figcaption>
            )}
          </figure>
        )}

        {/* Two-column layout: main content + sticky buy card. */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start mt-6">
          <main className="min-w-0">
            {/* Know what you're buying — real facts, honest boundary notice (the full itinerary
                is never shown here; it clones into the buyer's own trip on purchase). */}
            <RmCard>
              <RmSectionHeading>Know what you're buying</RmSectionHeading>
              <p className="text-[#738091] text-[13px] leading-[1.5] mt-2 mb-[19px]">
                The shape and scope are public. Exact stop names, timing, and the day-by-day route
                stay private until this trip is yours.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px]">
                <RmFact icon={MapPin} label="Destination" value={listing.market} />
                <RmFact icon={CalendarDays} label="Planned length" value={`${listing.durationDays} day${listing.durationDays === 1 ? "" : "s"}`} />
                <RmFact icon={Clock3} label="Start date" value="Flexible" />
                {listing.bestSeason && <RmFact icon={Sun} label="Best season" value={listing.bestSeason} />}
              </div>
              <div className="flex gap-[11px] mt-[19px] p-[14px] rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#f8fafb]">
                <LockKeyhole className="w-[17px] h-[17px] shrink-0 text-[#a67015]" aria-hidden="true" />
                <div className="grid gap-[3px]">
                  <strong className="text-[#193752] text-[12px] font-semibold">The itinerary is protected</strong>
                  <span className="text-[#738091] text-[11px] leading-[1.4]">You can preview its scope, but never its private stops before purchase.</span>
                </div>
              </div>
            </RmCard>

            {/* What's included — the approval-time snapshot; honest empty state if none. */}
            <RmCard>
              <RmSectionHeading>What's included</RmSectionHeading>
              <p className="text-[#738091] text-[13px] leading-[1.5] mt-2 mb-[19px]">
                A useful contents snapshot, without revealing the itinerary itself.
              </p>
              {inside?.days ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="inside-counts">
                  <RmCount label="planned days" value={inside.days} />
                  {typeof inside.items === "number" && <RmCount label="itinerary items" value={inside.items} />}
                  {Object.entries(inside.byType ?? {}).map(([type, n]) => (
                    <RmCount key={type} label={TYPE_LABELS[type] ?? type} value={n} />
                  ))}
                </div>
              ) : (
                <p className="rounded-[8px] bg-[#f5f7f8] p-[14px] text-[#738091] text-[12px]">Contents are finalized at approval.</p>
              )}
              <div className="flex items-start gap-[10px] mt-[18px] p-[14px] rounded-[9px] border border-[#e4e7ec] text-[#475467] text-[12px] leading-[1.45]">
                <Pencil className="w-4 h-4 shrink-0 mt-0.5 text-[#247d78]" aria-hidden="true" />
                <p className="m-0">
                  <span className="font-semibold text-[#193752]">Unlocked means fully yours.</span> After checkout, the
                  complete plan is copied to your Trip Slip. Re-date it, edit every item, and book from your own trip.
                </p>
              </div>
              {/* Ledger 2026-08-22-concierge-p3: the refund line is replaced by the concierge promise —
                  static copy, since every ready-made purchase carries the same entitlement (§13: promise
                  only what is true for all). */}
              <div
                className="flex items-start gap-[10px] mt-[14px] rounded-[9px] bg-[#eaf7f5] px-[14px] py-[14px] text-[#286b68] text-[12px] leading-[1.45]"
                data-testid="text-concierge-promise"
              >
                <ConciergeBell className="w-4 h-4 shrink-0 mt-0.5 text-[#247d78]" aria-hidden="true" />
                <p className="m-0">
                  <span className="font-semibold text-[#193752]">Includes 1 consultation + 1 revision.</span> Request it
                  from your Trip Slip after purchase.
                </p>
              </div>
            </RmCard>

            {/* MP-2 return path: "I like this — show me everything this expert offers."
                Renders nothing when the author has not claimed a handle (no dead links). */}
            <StorefrontLink
              handle={listing.authorHandle}
              name={listing.authorName}
              sellerNoun={listing.section === "trips_by_locals" ? "local expert" : "trip planner"}
              data-testid="link-rm-storefront"
            />
          </main>

          {/* Buy card — sticky price + CTA, continuity design's booking hierarchy. */}
          <aside className="lg:sticky lg:top-[18px]">
            <RmCard className="shadow-[0_15px_40px_rgba(20,43,69,0.06)]">
              <p className="text-[#f34d6e] text-[11px] font-extrabold tracking-[0.08em] uppercase mb-2">One-time purchase</p>
              <h2 className="text-[#193752] font-semibold text-[23px] leading-[1.1] tracking-[-0.035em]" style={{ fontFamily: "Fraunces, serif" }}>
                Make this plan yours
              </h2>
              <div className="mt-[17px]">
                <strong className="text-[#193752] font-semibold text-[34px] leading-none" style={{ fontFamily: "Fraunces, serif" }} data-testid="text-rm-price">
                  {price === null ? "—" : `$${price}`}
                </strong>
                {listing.pricingMode === "per_traveler" && price !== null && (
                  <span className="ml-1.5 text-[#738091] text-[12px] font-normal">/ traveler</span>
                )}
              </div>
              <p className="text-[#738091] text-[11px] mt-[7px] mb-[18px]">No recurring fee · copied into your editable trips</p>
              <Button
                size="lg"
                onClick={startPurchase}
                disabled={isPreview || price === null}
                data-testid="button-buy-rm"
                className="w-full min-h-[46px] rounded-[8px] bg-[#f34d6e] hover:bg-[#f34d6e]/90 border border-[#f34d6e] text-white font-bold text-[12px] shadow-[0_5px_14px_rgba(243,77,110,0.18)] gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                {isPreview ? "Preview only" : "Get this trip"}
              </Button>
              <div className="grid gap-[11px] mt-[19px] pt-[17px] border-t border-[#e4e7ec] text-[#475467] text-[11px]">
                <span className="flex items-center gap-2"><Pencil className="w-3.5 h-3.5 text-[#247d78]" aria-hidden="true" /> Edit every itinerary item</span>
                <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[#247d78]" aria-hidden="true" /> Keep it in your Trip Slip</span>
                <span className="flex items-center gap-2"><UserRound className="w-3.5 h-3.5 text-[#247d78]" aria-hidden="true" /> Consult the expert after purchase</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#247d78]" aria-hidden="true" /> Pay once, keep the plan</span>
              </div>
              <Button
                variant="outline"
                className="w-full mt-[14px] rounded-[8px] border border-[#dfe7e4] bg-white hover:bg-[#f8faf9] text-[#193752] font-bold text-[12px] gap-2"
                onClick={copyTripLink}
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy trip link
              </Button>
            </RmCard>
          </aside>
        </div>
      </div>

      <Dialog open={!!paymentIntent} onOpenChange={(open) => !open && !confirming && setPaymentIntent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Complete your purchase</DialogTitle></DialogHeader>
          {confirming ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Copying the trip into your plans…
            </div>
          ) : (
            paymentIntent && (
              <StripeCheckout
                paymentIntent={paymentIntent}
                bookingIds={[]}
                onSuccess={handleStripeSuccess}
                onError={(e) => toast({ title: "Payment failed", description: e, variant: "destructive" })}
                onCancel={() => setPaymentIntent(null)}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page-local presentation helpers (continuity design, transcribed from
// artifacts/traveloure/src/pages/ready-made-detail.tsx + .css as page-scoped Tailwind arbitrary
// values — the same pattern service-detail.tsx uses). Not extracted to a shared file: each
// marketplace-details lane is pure-client and page-scoped, rebuilt concurrently by sibling lanes.
function RmCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-[#dfe7e4] rounded-[12px] bg-white p-[22px] mb-[15px] ${className}`}>
      {children}
    </section>
  );
}

function RmSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[#193752] font-semibold text-[23px] leading-[1.1] tracking-[-0.035em]" style={{ fontFamily: "Fraunces, serif" }}>
      {children}
    </h2>
  );
}

function RmFact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-[#e4e7ec] pt-[11px]">
      <strong className="flex items-center gap-[5px] text-[#193752] text-[12px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">
        <Icon className="w-[13px] h-[13px] shrink-0 text-[#247d78]" aria-hidden="true" />
        {value}
      </strong>
      <span className="block mt-1 text-[#738091] text-[10px]">{label}</span>
    </div>
  );
}

function RmCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] bg-[#f2f6f8] p-3">
      <strong className="block text-[#193752] font-semibold text-[22px] leading-none" style={{ fontFamily: "Fraunces, serif" }}>{value}</strong>
      <span className="block mt-[5px] text-[#738091] text-[10px] leading-[1.25]">{label}</span>
    </div>
  );
}
