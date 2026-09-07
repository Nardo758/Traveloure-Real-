import { useState } from "react";
import { useTrip } from "@/hooks/use-trips";
import { useParams, Link, useSearch, useLocation } from "wouter";
import { Loader2, Sparkles, ArrowLeft, MapPin, Copy, Check, XCircle, Package, ChevronDown } from "lucide-react";
import { TripLogisticsDashboard } from "@/components/logistics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePlanning } from "@/contexts/PlanningContext";
import { Skeleton } from "@/components/ui/skeleton";
import { type PlanCardData, type PlanCardTrip } from "@/components/plancard/plancard-types";
import { PlanCard } from "@/components/plancard/PlanCard";
import { TripCardRail } from "@/components/plancard/TripCardRail";
import { calendarDateToIso, parseCalendarDate } from "@/lib/calendar-date";
import { slipShareUrl } from "@/lib/slip-rail";

/**
 * THE TRIP CARD IS ONE PAGE (ledger `2026-09-07-trip-card-one-page`; Console & AI Concierge
 * brief §7 anatomy; CLAUDE.md Locked Decision 45 (6)).
 *
 * The Itinerary / Bookings / Logistics `Tabs` shell is gone. The page is: the full-stage
 * `PlanCard` (hero = the SAME `PlanCardHeader` + `MetricStrip` the summary card draws; view bar
 * Plan | Map with "X of Y located"; the day list; the collapsed drawers — Note from your expert ·
 * Budget · Purchases · Change history) in the main column, and `TripCardRail` (Booking agent ·
 * Your expert · Suggestion from your expert · Back to planning) in a 320px right column.
 *
 * WHAT THE TWO DELETED TABS CARRIED, AND WHERE IT WENT:
 *   · Bookings tab — a permanent empty state ("No Bookings Yet"). Purchases now live in the
 *     card's Purchases drawer (every `service_bookings` row on this plan, prepared ≠ booked) and
 *     in the cross-plan Bookings ledger (My bookings).
 *   · Logistics tab — `TripLogisticsDashboard`, which renders REAL data from eight live reads
 *     (participant RSVP + payment + dietary stats, the budget summary and its category
 *     breakdown, the alert summary, the participant roster, the contracts board) plus a Planning
 *     tab whose three panels (temporal anchors, schedule validator, energy budget) also have a
 *     home on the SLIP. The component is mounted here UNCHANGED — it has two other call sites and
 *     editing it would change them too — inside ONE collapsed "Logistics" drawer below the card,
 *     owner-only, mounted only when opened so its reads do not fire on a page that never asks.
 *     That drawer is NOT on the ratified board: it is kept so no real data is lost with the tab,
 *     and it is reported as a deviation for the decision-maker rather than taken silently.
 *
 * The page-level photo hero (`picsum.photos/seed/<destination>` — a photo of nowhere, the §13
 * lie L4 removed from the card's own hero) is gone; the card's typographic hero is the page's.
 */

/**
 * Mobile-lens audit #1 fix (found in behavioral verification): the pre-existing
 * `selectedDay` state below is set via a `useEffect` that fires AFTER first render —
 * so when it fed `initialSelectedDay` directly, PlanCard (whose `useState` initializer
 * only reads its prop once, on mount) could mount before the effect ran and get stuck
 * on the stale value. This is a pure, synchronous version of that exact same "day N of
 * the trip is today" math (not new date logic — mirrors the effect below verbatim) that
 * the itinerary render computes directly at render time from `trip`, which is already
 * guaranteed loaded by the point PlanCard mounts (the page bails out above if !trip) —
 * so there is no effect/state round-trip to race against.
 */
function computeLiveDayNumber(startDate: string | undefined, endDate: string | undefined): number | null {
  if (!startDate || !endDate) return null;
  const now = new Date();
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) return null;
  if (now < start || now > end) return null;
  const daysInto = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(Math.max(daysInto, 1), totalDays);
}

// Phase 3b (row 12): the ProviderService type went with the "Available Services" grid — the
// services surface is /services now, which owns its own Service type.

// Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the Expert / ExpertAdvisor types moved
// with the expert-assign + suggestion-review UI to the slip family (AssignExpertDialog /
// ExpertSuggestionsPanel own their own local types).

export default function TripDetails() {
  const { id } = useParams();
  const searchStr = useSearch();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(searchStr);
  // `?tab=` and `?section=` still arrive from the `/itinerary/:id` redirects in App.tsx; with no
  // tab shell they select nothing and are ignored.
  const justOptimized = searchParams.get("optimized") === "1";
  const { data: trip, isLoading, isError: tripError, refetch: refetchTrip } = useTrip(id || "");
  // The Generate/Regenerate buttons previously called useOptimizeTrip → the
  // nonexistent POST /api/trips/:id/optimize (Vite catch-all → error). Repointed at
  // the live generate-itinerary endpoint so a trip with no plan can actually self-generate.
  const {
    data: plancardData,
    isLoading: itineraryLoading,
    isError: itineraryError,
    refetch: refetchItinerary,
  } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${id}/plancard`],
    enabled: !!id,
  });
  // T1-1: gates the regenerate confirmation dialog — true only once there's a plan with actual
  // activities to lose. First generation (no itinerary yet) skips the dialog entirely.
  const hasExistingItineraryItems = !!plancardData?.days?.some(
    (day) => (day.activities?.length ?? 0) > 0,
  );
  const { toast } = useToast();
  const { open: openPlanning } = usePlanning();
  // Phase 3b: showAnchorCapture removed with the flight/hotel capture (moved to the slip, row 13).
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the expert-picker + reject-suggestion
  // state moved to the slip family (AssignExpertDialog / ExpertSuggestionsPanel). Rows 8/9/10/11.
  // G7: "Plan ready" banner
  const [showOptimizedBanner, setShowOptimizedBanner] = useState(justOptimized);

  // Mobile-lens audit #1: this effect used to compute "today's day" into a page-level
  // `selectedDay` state that nothing read (the original audit finding) — then, once wired
  // to PlanCard, turned out to race PlanCard's mount (effects run after first paint, but
  // PlanCard's day-index `useState` initializer only reads its prop once, on mount).
  // Replaced by the synchronous `computeLiveDayNumber` helper above, called directly where
  // `initialSelectedDay` is computed for `<PlanCard>` below — same math, no effect/state
  // round-trip to race.

  const shareMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/share`);
      return res.json() as Promise<{ success: boolean; shareToken: string }>;
    },
    onSuccess: (data) => {
      // S10: ONE builder of the token link, shared with the slip's Share card (§18 rule 1).
      const link = slipShareUrl(window.location.origin, data.shareToken);
      setShareLink(link);
      setShareOpen(true);
    },
    onError: () => {
      toast({ title: "Could not create share link", variant: "destructive" });
    },
  });

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with friends." });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // G7: Reuse the canonical plan-card query above for optimization metadata.
  const optimizationDelta = plancardData?.optimizationDelta ?? null;

  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the guest-invite data layer
  // (user-experiences query, linkedExperience, isEventTrip, createGuestListMutation) moved to
  // the slip family with the Guests surface (SlipLogisticsSection owns it now — row 14).

  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the expert-assign picker and the
  // expert-suggestion review data layer (trip-experts / offering-types / suggestions queries,
  // reviewSuggestionMutation, assignExpertMutation) relocated to the slip family —
  // AssignExpertDialog + ExpertSuggestionsPanel own them now (rows 10/11). The advisor query,
  // the advisor card and the duplicate EscalationCTA (rows 8/9) are dropped here; the assigned
  // expert is surfaced by the family's advisor strip on the summary card (A10/A12) and the
  // full-stage EscalationCTA (B10) — both must-not-regress, both already rendering.

  // Open destination in maps — L4 trip-card honesty (ledger `2026-09-07-trip-card-honesty`):
  // ONE maps handoff (`lib/navigate.ts`), and since this lane it is the CARD's own Maps control
  // (desktop button + mobile bottom bar) — the page-level duplicates went with the photo hero.

  // Phase 3b (row 12; ledger 2026-08-31-manifest-is-the-boundary): the on-trip Add-to-cart rail
  // (servicesResult query, handleAddToCart, addToCartMutation) was removed with the "Available
  // Services for Your Trip" grid. Adding a service to this trip is now the /services grid's job —
  // its Add-to-trip targets the active trip via POST /api/trips/:tripId/itinerary-items.

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // Mobile-lens audit #6: useTrip resolves a real 404 as `data: null` (no error) — only a
  // genuine fetch/network/server failure sets isError. So this branch is reached ONLY on a
  // failed request, and stays inside this page (never the app's auth-gate fall-through to
  // the marketing homepage + "Sign in to continue" modal the audit reproduced). "Trip not
  // found" below is unchanged for the real 404 case.
  if (tripError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" data-testid="trip-network-error">
        <h2 className="text-2xl font-bold">Can't reach Traveloure</h2>
        <p className="text-muted-foreground max-w-sm">
          We couldn't load this trip. Check your connection and try again.
        </p>
        <Button onClick={() => refetchTrip()} data-testid="button-retry-trip-fetch">
          Retry
        </Button>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Trip not found</h2>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the Trip Card does not exist before Make
  // final. A trip with NO final renders an honest notice + one action to the slip, and NOTHING else —
  // planning lives on /plans/:tripId, never on /trip/:id. This is the sentence that closes the
  // flow-audit's "/trip/:id is a second planning surface" finding (Locked Decision 42 D8).
  // `plancardData.trip.finalVersion` is the source of truth: null ⇒ no final has ever been cut
  // (finalizedAt alone can't tell "never finalized" from "reopened"). We wait for the plancard
  // query to resolve so the notice never flashes ahead of data; an errored/absent payload falls
  // through to the normal render. NOTE: this is a NOTICE with one action, not an automatic
  // redirect — journey-1 and the finalize spec both assert the notice; the D8 wording says
  // "redirect", and the difference is recorded in the lane's ledger row rather than changed here.
  if (!itineraryLoading && plancardData != null && plancardData.trip?.finalVersion == null) {
    return (
      <div
        className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center"
        data-testid="trip-not-final-notice"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Not final yet</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          Your plan for {trip.destination} is on the slip. Finish it there and make it final — your
          Trip Card appears here once you do.
        </p>
        <Link href={`/plans/${trip.id}`}>
          <Button data-testid="button-go-to-slip">Go to your plan</Button>
        </Link>
      </div>
    );
  }

  // The page's own role reading: the plancard DTO's `tripRole` (the server's answer). The rail's
  // every read is owner-gated, so it mounts for the owner only.
  const isOwner = plancardData?.tripRole === "owner";

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="trip-card-page">
      {/* Top row — Back only. The photo hero, "Open in Maps" and "Share with friends" that sat
          here are the card's own now (hero, Maps button, Share control). */}
      <div className="container mx-auto px-4 pt-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      {/* G7: "Plan ready" banner — shown after optimization redirect */}
      {showOptimizedBanner && (
        <div className="container mx-auto px-4 mt-3 relative z-20">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg,#1a7f5a,#2aab7c)", color: "#fff" }}
            data-testid="banner-plan-ready"
          >
            <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Your optimized plan is ready</p>
              <p className="text-xs opacity-90 mt-0.5">
                AI Optimizer · just now
                {optimizationDelta?.savings != null && optimizationDelta.savings > 0 && (
                  <> · saved <strong>${Math.round(optimizationDelta.savings)}</strong></>
                )}
                {optimizationDelta?.savingsPercent != null && optimizationDelta.savingsPercent > 0 && (
                  <> · <strong>{Math.round(optimizationDelta.savingsPercent)}%</strong> tighter schedule</>
                )}
                {optimizationDelta?.starRatingDelta != null && optimizationDelta.starRatingDelta > 0 && (
                  <> · ⭐ +{optimizationDelta.starRatingDelta.toFixed(1)} rating</>
                )}
              </p>
            </div>
            <button
              onClick={() => {
                setShowOptimizedBanner(false);
                // Remove ?optimized=1 from URL without a full reload
                const params = new URLSearchParams(searchStr);
                params.delete("optimized");
                const newQ = params.toString();
                setLocation(`/trip/${id}${newQ ? `?${newQ}` : ""}`);
              }}
              className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
              data-testid="button-dismiss-optimized-banner"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}

      {/* ONE PAGE: main column (the card) + the 320px rail at lg. Below lg the rail follows the
          card, two-up at sm so it is not four screens of scrolling. */}
      <div className="container mx-auto px-4 mt-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="min-w-0 space-y-4">
            {/* Phase 3b (row 13): the flight/hotel-time capture moved to the slip
                (SlipLogisticsSection) — anchors are planning input, so they live where
                planning happens, not on the finalized Trip Card. */}
            {itineraryLoading ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </div>
                    <div className="ml-6 pl-6 border-l-2 border-border space-y-3">
                      {[1, 2, 3].map((j) => (
                        <Skeleton key={j} className="h-16 rounded-xl" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : itineraryError ? (
              /* Mobile-lens audit #6: a failed itinerary fetch previously fell into the
                 "No Itinerary Yet" branch below, wrongly inviting the traveler to
                 generate a fresh (destructive) plan during a network blip. Distinct
                 honest error + retry instead. */
              <div className="text-center py-16" data-testid="itinerary-network-error">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Can't reach Traveloure</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  We couldn't load your itinerary. Check your connection and try again.
                </p>
                <Button onClick={() => refetchItinerary()} data-testid="button-retry-itinerary-fetch">
                  Retry
                </Button>
              </div>
            ) : !hasExistingItineraryItems ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Itinerary Yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Generate a personalized day-by-day plan for {trip.destination} using AI.
                </p>
                {/* Phase 3b (drift-audit §C row 5): the on-card "Generate My Itinerary"
                    (destructive generate) is removed — planning/generation lives on the slip,
                    never the card. The planning entry stays as a single link. */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() =>
                      // Locked Decision 42 (D13), ledger `2026-09-05-doors-source-fields`:
                      // a door passes what it HOLDS. This one holds the trip row, so it adds
                      // the occasion the plan already carries — `trips.experience_type`, the
                      // coarse machine key (D1's `experience_type_id` is a wave-3 lane and
                      // this row does not have it yet). §13: `experienceType` is nullable and
                      // is passed through AS IS — undefined when the plan never stated one,
                      // never a nearest-looking key chosen here to fill the field.
                      openPlanning({
                        branch: "ai",
                        destination: trip?.destination,
                        tripId: trip?.id,
                        experienceType: trip?.experienceType ?? undefined,
                      })
                    }
                    data-testid="button-plan-with-preferences"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    Plan with Preferences
                  </Button>
                </div>
              </div>
            ) : (
              (() => {
                const planCardTrip: PlanCardTrip = {
                  id: trip.id,
                  destination: trip.destination ?? "",
                  title: trip.title ?? undefined,
                  startDate: calendarDateToIso(trip.startDate),
                  endDate: calendarDateToIso(trip.endDate),
                  numberOfTravelers: trip.numberOfTravelers ?? 1,
                  budget: trip.budget ?? undefined,
                  eventType: trip.eventType ?? undefined,
                };
                const liveDayNumber = computeLiveDayNumber(trip.startDate, trip.endDate);
                const initialDayIndex = liveDayNumber == null
                  ? -1
                  : (plancardData?.days ?? []).findIndex((day) => day.dayNum === liveDayNumber);

                return (
                  <PlanCard
                    role="owner"
                    stage="full"
                    trip={planCardTrip}
                    initialSelectedDay={initialDayIndex >= 0 ? initialDayIndex : 0}
                    // The rail owns "Suggestion from your expert" on this page — one mount.
                    suggestionsHome="rail"
                    // The token share rail (S10) is the card's Share control on this page.
                    onShare={() => shareMutation.mutate(trip.id)}
                  />
                );
              })()
            )}

            {/* LOGISTICS — the former tab's REAL data, kept in one collapsed drawer (see the
                file header). Owner-only, collapsed by default, mounted only when opened so its
                eight reads do not fire on a page that never asks for them. */}
            {isOwner && id && (
              <Collapsible open={logisticsOpen} onOpenChange={setLogisticsOpen} className="border border-border rounded-xl bg-card overflow-hidden" data-testid="trip-card-logistics-drawer">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full min-h-11 flex items-center justify-between gap-2 px-4 py-3 text-left"
                    data-testid="trip-card-logistics-drawer-trigger"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                      <Package className="w-3.5 h-3.5 text-muted-foreground" />
                      Logistics
                      <span className="font-mono text-[10px] font-normal text-muted-foreground">participants · budget · contracts</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${logisticsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-2 border-t border-border/40">
                    {logisticsOpen && (
                      <TripLogisticsDashboard
                        tripId={id}
                        tripName={trip?.title || trip?.destination || "Trip"}
                        budget={typeof trip?.budget === "number" ? trip.budget : 0}
                        destination={trip?.destination || "destination"}
                      />
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* THE RIGHT RAIL (320px at lg). Owner-only; every read it makes is owner-gated. */}
          <aside className="min-w-0 lg:sticky lg:top-4" data-testid="trip-card-rail-column">
            <TripCardRail
              trip={{
                id: trip.id,
                title: trip.title ?? null,
                destination: trip.destination ?? null,
                startDate: calendarDateToIso(trip.startDate) || null,
                endDate: calendarDateToIso(trip.endDate) || null,
                finalizedAt: plancardData?.trip?.finalizedAt ?? null,
              }}
              isOwner={isOwner}
            />
          </aside>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-share-trip">
          <DialogHeader>
            <DialogTitle>Share your trip plan</DialogTitle>
            <DialogDescription>
              Anyone with this link can view your itinerary for {trip?.destination}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <Input
              readOnly
              value={shareLink ?? ""}
              className="text-sm"
              data-testid="input-share-link"
              onFocus={(e) => e.target.select()}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLink}
              data-testid="button-copy-link"
              className="shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Friends can view the itinerary without signing in. Only you can make changes.
          </p>
        </DialogContent>
      </Dialog>

      {/* Stage 3.1 re-plan now rides the global planning entry (ruling
          2026-08-28-single-planning-entry): the button above deep-opens the AI
          branch with this trip's destination — same modal, one mount, in
          PlanningProvider. */}

      {/* Phase 3b (drift-audit §C row 5): the Regenerate confirmation dialog is removed along with
          every on-card Regenerate/Generate affordance. */}
    </div>
  );
}
