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
 */
import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { planTypeLabel } from "@shared/ready-made-plan-types";
import { CalendarDays, Loader2, MapPin, ShoppingBag, Sun } from "lucide-react";

interface DetailListing {
  id: string;
  title: string;
  planType: string | null;
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
  section: "trips_by_locals" | "advisor";
}

const TYPE_LABELS: Record<string, string> = {
  activity: "Activities", food: "Food & dining", transport: "Transport",
  accommodation: "Stays", venue: "Venues", note: "Notes",
};

export default function ReadyMadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [paymentIntent, setPaymentIntent] = useState<{ clientSecret: string; paymentIntentId: string; amount: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

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
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Ready Made Trips</span>
      </div>

      {isPreview && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800" data-testid="banner-preview">
          Preview — this is exactly what buyers will see once your listing is approved. Purchasing is disabled.
        </div>
      )}

      {/* Type of Plan — the structure's headline */}
      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground" data-testid="text-plan-type">
        {planTypeLabel(listing.planType) ?? "Trip plan"}
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-1 mb-3" data-testid="text-rm-title">{listing.title}</h1>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{listing.market}</span>
        <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" />{listing.durationDays} days</span>
        {listing.bestSeason && <span className="flex items-center gap-1"><Sun className="w-4 h-4" />Best in {listing.bestSeason}</span>}
        <Badge variant="secondary" data-testid="badge-rm-section">
          {listing.section === "trips_by_locals" ? `Trip by a Local — ${listing.authorName}` : `By Trip Planner ${listing.authorName}`}
        </Badge>
        {listing.badge && <Badge>{listing.badge}</Badge>}
      </div>

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
