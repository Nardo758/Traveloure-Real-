/**
 * /ready-made/:id — the buyer-facing Ready Made Trips detail page (Phase 4).
 *
 * Renders the store's QUALITY STRUCTURE (decision-maker model): branded page header with the
 * Traveloure mark, the declared Type of Plan, hero with its Unsplash credit, then the structured
 * teaser — what's inside (the approval-time insideCounts snapshot), author + shelf section, price.
 * The full itinerary is never shown here: on purchase it clones into the buyer's own editable
 * trip, which is where they see it.
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
 * (store:kyoto-wedding) leads with the mockup's venue-led hero rendering ONLY real DTO fields
 * (title, market, durationDays, bestSeason when present — party size is NOT in the DTO, so it
 * is omitted); `standard` (store:default) is the page exactly as before. The §10 teaser gate is
 * untouched, and the author's preview-as-buyer renders the same branch automatically.
 */
import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LanguageMenu } from "@/components/language-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { StorefrontLink } from "@/components/marketplace/storefront-link";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { planTypeLabel, isCustomPlanType } from "@shared/ready-made-plan-types";
import { resolveFormat } from "@/lib/build-formats/registry";
import { CalendarDays, Loader2, MapPin, ShoppingBag, Sun } from "lucide-react";

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
};

/** The headline plan-type text: the closed vocabulary's label, or — for the one escape from it —
 *  the author's own free-text theme (isCustomPlanType, shared/ready-made-plan-types.ts). */
function planTypeDisplay(listing: Pick<DetailListing, "planType" | "planTypeCustom">): string {
  if (isCustomPlanType(listing.planType)) {
    return listing.planTypeCustom?.trim() || "Trip plan";
  }
  return planTypeLabel(listing.planType) ?? "Trip plan";
}

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
  const { data } = useQuery<CityNeighborhood[]>({ queryKey: ["/api/city-neighborhoods"] });
  const city = market.split(",")[0].trim().toLowerCase();
  const hoods = (data ?? []).filter((n) => n.city.trim().toLowerCase() === city);
  if (hoods.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-border bg-muted/40 px-4 py-3" data-testid="lead-map-strip">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <MapPin className="w-3.5 h-3.5" /> Neighborhoods of {market.split(",")[0].trim()}
      </div>
      <div className="flex flex-wrap gap-2">
        {hoods.map((n) => (
          <Badge key={n.id} variant="outline">{n.name}</Badge>
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
      navigate(`/trip/${body.purchase.cloneTripId}?tab=itinerary`);
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

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full rounded-2xl" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !listing) {
    return (
      <div className="max-w-3xl mx-auto p-10 text-center">
        <h1 className="text-xl font-semibold mb-2">Trip not found</h1>
        <p className="text-muted-foreground mb-4">It may have been removed or isn't available yet.</p>
        <Button asChild variant="outline"><Link href="/discover">Browse Ready Made Trips</Link></Button>
      </div>
    );
  }

  const inside = listing.insideCounts;
  const price = listing.priceCents === null ? null : (listing.priceCents / 100).toFixed(2);

  // F4: this page is the STORE channel surface — resolve the distribution format from the
  // listing's own DTO fields (planType → experience type, market) and branch the LEAD only.
  // Unmatched listings resolve store:default → "standard" → the page exactly as before.
  const experienceType = listing.planType ? PLAN_TYPE_EXPERIENCE[listing.planType] ?? null : null;
  const storeFormat = resolveFormat("store", experienceType, listing.market);
  const lead = (storeFormat.layout?.lead as "map-strip" | "venue-hero" | "standard" | undefined) ?? "standard";

  // Public teaser-map endpoint: a sibling of this listing's own detail GET
  // (queryKey [`/api/ready-made/${id}`]) under the same route family — no itinerary/coordinates
  // ever reach this page's DTO (§10 teaser gate), so the SVG is rendered server-side instead.
  const teaserMapUrl = `/api/ready-made/${id}/teaser-map.svg`;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {/* ── Branded page header — the quality structure's frame ── */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
        <Link href="/" className="flex items-center gap-2" data-testid="link-rm-logo">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "#E85D55" }}>
            <span className="text-white text-[16px] font-bold">T</span>
          </div>
          <span className="font-semibold text-foreground">Traveloure</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Ready Made Trips</span>
          {/* Ruling 116 (distribution-language audit P2): a link/QR recipient can switch the UI
              language here like on every other landing — same ONE selector (ruling 60 (b)). */}
          <LanguageMenu />
        </div>
      </div>

      {isPreview && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800" data-testid="banner-preview">
          Preview — this is exactly what buyers will see once your listing is approved. Purchasing is disabled.
        </div>
      )}

      {lead === "venue-hero" ? (
        /* store:kyoto-wedding lead — the mockup's venue-led hero. Facts row renders ONLY real
           DTO fields: durationDays always exists; bestSeason (the date window) only when the
           listing carries it; party size is NOT in the DTO, so it is never shown (§13). */
        <div
          className="rounded-2xl p-6 sm:p-8 mb-4 text-white bg-gradient-to-br from-[#7A2E3B] to-[#B4434F]"
          data-testid="lead-venue-hero"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-white/80" data-testid="text-plan-type">
            {planTypeDisplay(listing)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1" data-testid="text-rm-title">
            {listing.title} — {listing.market}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/90 mt-3">
            <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" />{listing.durationDays} days</span>
            {listing.bestSeason && <span className="flex items-center gap-1"><Sun className="w-4 h-4" />Date window: {listing.bestSeason}</span>}
          </div>
        </div>
      ) : (
        <>
          {/* Type of Plan — the structure's headline */}
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-plan-type">
            {planTypeDisplay(listing)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-1 mb-3" data-testid="text-rm-title">{listing.title}</h1>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
        {/* The venue hero already carries market/duration/season — don't repeat them below it. */}
        {lead !== "venue-hero" && (
          <>
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{listing.market}</span>
            <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" />{listing.durationDays} days</span>
            {listing.bestSeason && <span className="flex items-center gap-1"><Sun className="w-4 h-4" />Best in {listing.bestSeason}</span>}
          </>
        )}
        <Badge variant="secondary" data-testid="badge-rm-section">
          {listing.section === "trips_by_locals" ? `Trip by a Local — ${listing.authorName}` : `By Trip Planner ${listing.authorName}`}
        </Badge>
        {listing.badge && <Badge>{listing.badge}</Badge>}
      </div>

      {/* store:kyoto-cultural lead — the neighborhood strip band above the existing content. */}
      {lead === "map-strip" && <NeighborhoodStrip market={listing.market} />}

      {listing.heroImageUrl && (
        <div className="mb-5">
          <img src={listing.heroImageUrl} alt={listing.title} className="w-full h-64 sm:h-80 object-cover rounded-2xl" data-testid="img-rm-hero" />
          {listing.heroImageMeta?.photographer && (
            <div className="text-[11px] text-muted-foreground mt-1">
              Photo by <a className="underline" href={listing.heroImageMeta.profileUrl} target="_blank" rel="noreferrer">{listing.heroImageMeta.photographer}</a> on Unsplash
            </div>
          )}
        </div>
      )}

      {/* Teaser map — public teaser-map.svg for this listing. No itinerary/pins are exposed
          pre-purchase (the SVG bakes only geography + generic route shape); a load failure hides
          the whole section (a broken-image block must never ship on a listing page, §13/§17). */}
      {!teaserMapFailed && (
        <div className="mb-5" data-testid="section-route-teaser">
          <div className="relative overflow-hidden rounded-2xl border border-border">
            <img
              src={teaserMapUrl}
              alt="Route preview"
              className="w-full h-auto block"
              data-testid="img-route-teaser"
              onError={() => setTeaserMapFailed(true)}
            />
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
              Stops unlock with purchase
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Traveloure map · © OpenStreetMap contributors
          </div>
        </div>
      )}

      {/* What's inside — the approval-time snapshot; honest empty state if none. */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-2">What's inside</h2>
          {inside?.days ? (
            <div className="flex flex-wrap gap-2" data-testid="inside-counts">
              <Badge variant="outline">{inside.days} planned days</Badge>
              <Badge variant="outline">{inside.items} itinerary items</Badge>
              {Object.entries(inside.byType ?? {}).map(([type, n]) => (
                <Badge key={type} variant="outline">{n} {TYPE_LABELS[type] ?? type}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Contents are finalized at approval.</p>
          )}
          <p className="text-sm text-muted-foreground mt-3">
            Buying this trip copies the full day-by-day plan into your own trips — every item editable,
            re-dateable, and bookable. Refundable for 7 days.
          </p>
        </CardContent>
      </Card>

      {/* Price + buy */}
      <div className="flex items-center justify-between rounded-xl border border-border p-4 mb-8">
        <div>
          <div className="text-2xl font-bold" data-testid="text-rm-price">
            {price === null ? "—" : `$${price}`}
            {listing.pricingMode === "per_traveler" && <span className="text-sm font-normal text-muted-foreground"> / traveler</span>}
          </div>
          <div className="text-xs text-muted-foreground">One-time purchase · yours to edit</div>
        </div>
        <Button size="lg" onClick={startPurchase} disabled={isPreview || price === null} data-testid="button-buy-rm" className="gap-2">
          <ShoppingBag className="w-4 h-4" />
          {isPreview ? "Preview only" : "Get this trip"}
        </Button>
      </div>

      {/* MP-2 return path: "I like this — show me everything this expert offers."
          Renders nothing when the author has not claimed a handle (no dead links). */}
      <StorefrontLink
        handle={listing.authorHandle}
        name={listing.authorName}
        sellerNoun={listing.section === "trips_by_locals" ? "local expert" : "trip planner"}
        data-testid="link-rm-storefront"
      />

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
