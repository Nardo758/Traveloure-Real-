/**
 * /ready-made/:id — the buyer-facing Ready Made Trips detail page (Phase 4).
 *
 * Renders the store's QUALITY STRUCTURE (decision-maker model): shared app navigation, the
 * declared Type of Plan, hero with its Unsplash credit, then the structured
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { StorefrontLink } from "@/components/marketplace/storefront-link";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { planTypeDisplay } from "@shared/ready-made-plan-types";
import { resolveFormat } from "@/lib/build-formats/registry";
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock3, ConciergeBell, Copy, FileText,
  Loader2, LockKeyhole, MapPin, Pencil, ShoppingBag, Sun, UserRound,
} from "lucide-react";
import "./ready-made-detail.css";

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
  const [purchasing, setPurchasing] = useState(false);
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
    setPurchasing(true);
    try {
      const res = await fetch(`/api/ready-made/${id}/purchase`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.purchase?.cloneTripId) {
        // Already purchased → straight to the canonical editable Trip Slip.
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
    } catch {
      toast({ title: "Purchase unavailable", description: "We couldn't reach checkout. Check your connection and try again.", variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const copyTripLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Trip link copied" });
    } catch {
      toast({ title: "Could not copy link", description: "Copy the address from your browser instead.", variant: "destructive" });
    }
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
      <div className="rmd-live rmd-state" aria-busy="true" aria-label="Loading trip">
        <Skeleton className="h-5 w-40" /><Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-80 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !listing) {
    return (
      <div className="rmd-live rmd-state rmd-error-state">
        <h1 className="text-xl font-semibold mb-2">Trip not found</h1>
        <p className="text-muted-foreground mb-4">It may have been removed or isn't available yet.</p>
        <Button asChild variant="outline"><Link href="/ready-made">Browse Ready Made Trips</Link></Button>
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
    <div className="rmd-live">
      <nav className="rmd-breadcrumb" aria-label="Breadcrumb">
        <Link href="/ready-made"><ArrowLeft aria-hidden="true" /> Marketplace</Link>
        <span aria-hidden="true">/</span><strong>Ready-Made Trips</strong>
      </nav>

      {isPreview && (
        <div className="rmd-preview" data-testid="banner-preview">
          <strong>Buyer preview</strong> — this is exactly what shoppers will see once approved. Purchasing is disabled.
        </div>
      )}

      <section className="rmd-intro">
        <div>
          <p className="rmd-plan-type" data-testid="text-plan-type">
            {planTypeDisplay(listing.planType, listing.planTypeCustom)}
          </p>
          <h1 data-testid="text-rm-title">{listing.title}</h1>
          <p className="rmd-deck">
            A complete, thoughtfully built plan for {listing.market} — ready to become your own editable trip.
          </p>
        </div>
        <div className="rmd-author">
          <span className="rmd-author-avatar" aria-hidden="true">{listing.authorName.charAt(0).toUpperCase()}</span>
          <div>
            <span>Built by {listing.authorName}</span>
            <small>{listing.section === "trips_by_locals" ? "Local perspective" : "Trip planner"} · fixed plan</small>
          </div>
          <Badge variant="secondary" data-testid="badge-rm-section" className="sr-only">
            {listing.section === "trips_by_locals" ? `Trip by a Local — ${listing.authorName}` : `By Trip Planner ${listing.authorName}`}
          </Badge>
        </div>
      </section>

      {lead === "venue-hero" && (
        <div className="rmd-format-lead" data-testid="lead-venue-hero">
          <span>{listing.market}</span>
          <strong>{listing.durationDays} days</strong>
          {listing.bestSeason && <span>Date window: {listing.bestSeason}</span>}
        </div>
      )}
      {lead === "map-strip" && <NeighborhoodStrip market={listing.market} />}

      {(listing.heroImageUrl || !teaserMapFailed) && (
        <figure className="rmd-hero">
          <div className={`rmd-hero-photo ${listing.heroImageUrl ? "" : "rmd-hero-photo--fallback"}`}>
            {listing.heroImageUrl ? (
              <img src={listing.heroImageUrl} alt={listing.title} data-testid="img-rm-hero" />
            ) : (
              <div className="rmd-hero-fallback-content">
                <span>Ready-Made Trip</span>
                <strong>{listing.market}</strong>
                <small>A thoughtfully built route, ready to make your own.</small>
              </div>
            )}
            {listing.heroImageUrl && (
              <div className="rmd-hero-caption">
                <span>{listing.market}</span>
                <strong>{listing.title}</strong>
              </div>
            )}
          </div>
          {!teaserMapFailed && (
            <div className="rmd-route" data-testid="section-route-teaser">
              <div className="rmd-route-label"><span>Route preview</span><span>{listing.market.split(",")[0]}</span></div>
              <img
                src={teaserMapUrl}
                alt="General route preview without stop details"
                data-testid="img-route-teaser"
                onError={() => setTeaserMapFailed(true)}
              />
              <div className="rmd-route-lock"><LockKeyhole aria-hidden="true" /> Stops unlock with purchase</div>
              <small>Traveloure map · © OpenStreetMap contributors</small>
            </div>
          )}
          {listing.heroImageMeta?.photographer && (
            <figcaption>
              Photo by <a href={listing.heroImageMeta.profileUrl} target="_blank" rel="noreferrer">{listing.heroImageMeta.photographer}</a> on Unsplash
            </figcaption>
          )}
        </figure>
      )}

      <div className="rmd-layout">
        <main className="rmd-content">
          <section className="rmd-card">
            <h2>Know what you’re buying</h2>
            <p className="rmd-section-intro">The shape and scope are public. Exact stop names, timing, and the day-by-day route stay private until this trip is yours.</p>
            <div className="rmd-facts">
              <div><strong><MapPin aria-hidden="true" />{listing.market}</strong><span>Destination</span></div>
              <div><strong><CalendarDays aria-hidden="true" />{listing.durationDays} days</strong><span>Planned length</span></div>
              <div><strong><Clock3 aria-hidden="true" />Flexible</strong><span>Start date</span></div>
              {listing.bestSeason && <div><strong><Sun aria-hidden="true" />{listing.bestSeason}</strong><span>Best season</span></div>}
            </div>
            <div className="rmd-boundary">
              <LockKeyhole aria-hidden="true" />
              <div><strong>The itinerary is protected</strong><span>You can preview its scope, but never its private stops before purchase.</span></div>
            </div>
          </section>

          <section className="rmd-card">
            <h2>What’s included</h2>
            <p className="rmd-section-intro">A useful contents snapshot, without revealing the itinerary itself.</p>
            {inside?.days ? (
              <div className="rmd-counts" data-testid="inside-counts">
                <div><strong>{inside.days}</strong><span>planned days</span></div>
                {typeof inside.items === "number" && <div><strong>{inside.items}</strong><span>itinerary items</span></div>}
                {Object.entries(inside.byType ?? {}).map(([type, n]) => (
                  <div key={type}><strong>{n}</strong><span>{TYPE_LABELS[type] ?? type}</span></div>
                ))}
              </div>
            ) : (
              <p className="rmd-empty">Contents are finalized at approval.</p>
            )}
            <div className="rmd-editable">
              <Pencil aria-hidden="true" />
              <p><strong>Unlocked means fully yours.</strong> After checkout, the complete plan is copied to your Trip Slip. Re-date it, edit every item, and book from your own trip.</p>
            </div>
            <div className="rmd-concierge" data-testid="text-concierge-promise">
              <ConciergeBell aria-hidden="true" />
              <p><strong>Includes 1 consultation + 1 revision.</strong> Request it from your Trip Slip after purchase.</p>
            </div>
          </section>

          <StorefrontLink
            handle={listing.authorHandle}
            name={listing.authorName}
            sellerNoun={listing.section === "trips_by_locals" ? "local expert" : "trip planner"}
            data-testid="link-rm-storefront"
          />
        </main>

        <aside className="rmd-buy-card" aria-label="Purchase this trip">
          <p className="rmd-eyebrow">One-time purchase</p>
          <h2>Make this plan yours</h2>
          <div className="rmd-price" data-testid="text-rm-price">
            {price === null ? "—" : `$${price}`}
            {listing.pricingMode === "per_traveler" && <span> / traveler</span>}
          </div>
          <p className="rmd-price-note">No recurring fee · copied into your editable trips</p>
          <Button
            size="lg"
            onClick={startPurchase}
            disabled={isPreview || price === null || purchasing}
            data-testid="button-buy-rm"
            className="rmd-buy-button"
          >
            {purchasing ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
            {isPreview ? "Preview only" : purchasing ? "Preparing checkout…" : "Get this trip"}
          </Button>
          <div className="rmd-benefits">
            <span><Pencil aria-hidden="true" />Edit every itinerary item</span>
            <span><FileText aria-hidden="true" />Keep it in your Trip Slip</span>
            <span><UserRound aria-hidden="true" />Consult the expert after purchase</span>
            <span><CheckCircle2 aria-hidden="true" />Pay once, keep the plan</span>
          </div>
          <Button variant="outline" className="rmd-copy-button" onClick={copyTripLink}>
            <Copy aria-hidden="true" /> Copy trip link
          </Button>
        </aside>
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
