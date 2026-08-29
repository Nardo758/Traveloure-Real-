/**
 * PlanningContext — THE single planning entry (ruling 2026-08-28-single-planning-entry).
 *
 * One globally-mounted planning surface, opened by every "Plan my trip" / "Start
 * planning" CTA via `usePlanning().open(source?)`. Its first step is the CHOOSER,
 * aligned with the pricing ladder:
 *   - Plan it myself   → creates a draft trip (destination required, §13 — never a
 *                        fabricated one) → the slip (/plans/:tripId)
 *   - Plan with AI     → the EXISTING EnhancedPlanningModal flow (dates/preferences/
 *                        generate → comparison) — preserve-exactly on its internals
 *   - Plan with a local→ /experts (?destination= prefilled when known)
 *   - For an occasion  → /plus/occasions — rendered ONLY when PLUS_SALES_ENABLED
 *                        (public flag on /api/pricing); hidden, never teased, when off
 * Returning users with an active trip get "Continue {trip name}" first, which goes to
 * the PLANNING surface (/plans/:tripId), never the details card.
 *
 * `source` carries context (city from a ticker/city-page click, tripId for re-plan) to
 * prefill; `source.branch` deep-opens a branch (the pricing ladder rows use it).
 *
 * Auth: the chooser itself is open to guests. Branches prompt at their EXISTING gates:
 * the AI modal has its own sign-in prompt; "myself" gates on sign-in because the slip
 * route (/plans/:tripId) is a ProtectedRoute; local + occasion surfaces are public/
 * self-gated. Nothing here adds a new auth gate.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Compass, Sparkles, Lamp, CalendarHeart, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useTripContext } from "@/lib/trip-context";
import { apiRequest } from "@/lib/queryClient";
import EnhancedPlanningModal from "@/components/EnhancedPlanningModal";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export type PlanningBranch = "myself" | "ai" | "local" | "occasion";

export interface PlanningSource {
  /** City/destination context from the opener (ticker city, city page, trip re-plan). */
  city?: string;
  country?: string;
  destination?: string;
  /** Re-plan context: the trip this entry belongs to. */
  tripId?: string;
  /** Deep-open a branch, skipping the chooser (pricing ladder rows). */
  branch?: PlanningBranch;
}

interface PlanningApi {
  open: (source?: PlanningSource) => void;
  close: () => void;
}

const PlanningContext = createContext<PlanningApi | null>(null);

export function usePlanning(): PlanningApi {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used within PlanningProvider");
  return ctx;
}

/** Ruling 2 (derive-and-retire): trips.status is a DEAD field — trip phase derives
 *  from dates, the same convention my-trips/admin use. A trip whose end date has
 *  passed lands on the summary card; anything else (including no dates yet) lands on
 *  the planning surface. */
export function planningRouteForTrip(tripId: string, endDate?: string): string {
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`);
    if (!isNaN(end.getTime()) && end.getTime() < Date.now()) return `/trip/${tripId}`;
  }
  return `/plans/${tripId}`;
}

function sourceDestination(source: PlanningSource | null): string {
  if (!source) return "";
  if (source.destination) return source.destination;
  if (source.city) return source.country ? `${source.city}, ${source.country}` : source.city;
  return "";
}

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [tripCtx] = useTripContext();
  const [, setLocation] = useLocation();

  const [chooserOpen, setChooserOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [source, setSource] = useState<PlanningSource | null>(null);
  const [step, setStep] = useState<"choose" | "myself">("choose");
  const [myselfDestination, setMyselfDestination] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // PLUS_SALES_ENABLED rides the public pricing bundle (§8 posture — no literals here).
  const { data: pricing } = useQuery<{ plusSalesEnabled?: boolean }>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60_000,
  });
  const plusSalesEnabled = pricing?.plusSalesEnabled === true;

  const startAi = useCallback(() => {
    setChooserOpen(false);
    setAiOpen(true);
  }, []);

  const startMyself = useCallback(
    (src: PlanningSource | null) => {
      // The slip (/plans/:tripId) is a ProtectedRoute — sign-in IS the existing gate.
      if (!user) {
        setChooserOpen(false);
        openSignInModal();
        return;
      }
      setMyselfDestination(sourceDestination(src));
      setCreateError(null);
      setStep("myself");
      setChooserOpen(true);
    },
    [user, openSignInModal],
  );

  const startLocal = useCallback(
    (src: PlanningSource | null) => {
      setChooserOpen(false);
      const dest = sourceDestination(src);
      setLocation(dest ? `/experts?destination=${encodeURIComponent(dest)}` : "/experts");
    },
    [setLocation],
  );

  const startOccasion = useCallback(() => {
    setChooserOpen(false);
    setLocation("/plus/occasions");
  }, [setLocation]);

  const runBranch = useCallback(
    (branch: PlanningBranch, src: PlanningSource | null) => {
      if (branch === "ai") startAi();
      else if (branch === "myself") startMyself(src);
      else if (branch === "local") startLocal(src);
      else if (branch === "occasion") startOccasion();
    },
    [startAi, startMyself, startLocal, startOccasion],
  );

  const open = useCallback(
    (src?: PlanningSource) => {
      const next = src ?? null;
      setSource(next);
      setStep("choose");
      setCreateError(null);
      if (next?.branch) {
        runBranch(next.branch, next);
        return;
      }
      setChooserOpen(true);
    },
    [runBranch],
  );

  const close = useCallback(() => {
    setChooserOpen(false);
    setAiOpen(false);
    setStep("choose");
  }, []);

  const createDraftTrip = useCallback(async () => {
    const destination = myselfDestination.trim();
    if (!destination) {
      setCreateError("Where are you going? A destination starts the plan.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiRequest("POST", "/api/trips", {
        title: `${destination.split(",")[0].trim()} trip`,
        destination,
      });
      const trip = await res.json();
      setChooserOpen(false);
      setStep("choose");
      setLocation(`/plans/${trip.id}`);
    } catch (err: any) {
      setCreateError(err?.message || "Couldn't create the trip. Please try again.");
    } finally {
      setCreating(false);
    }
  }, [myselfDestination, setLocation]);

  const continueHref = tripCtx.tripId
    ? planningRouteForTrip(tripCtx.tripId, tripCtx.endDate)
    : null;
  const continueLabel = tripCtx.tripId
    ? `Continue ${tripCtx.title || (tripCtx.destination ? `your ${tripCtx.destination.split(",")[0]} trip` : "your trip")}`
    : null;

  const api = useMemo(() => ({ open, close }), [open, close]);

  const initialDestination = useMemo(() => {
    const dest = sourceDestination(source);
    if (!dest) return null;
    const [city, ...rest] = dest.split(",");
    return { city: city.trim(), country: rest.join(",").trim(), cityId: null };
  }, [source]);

  const optionRow =
    "flex w-full items-start gap-3 rounded-lg border border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--earn-teal-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const optionTile =
    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]";
  const optionMeta = { fontFamily: EARN_MONO, color: "var(--earn-muted)" } as const;

  return (
    <PlanningContext.Provider value={api}>
      {children}

      <Dialog open={chooserOpen} onOpenChange={(v) => (v ? setChooserOpen(true) : close())}>
        <DialogContent className="max-w-md" data-testid="dialog-planning-chooser">
          {step === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>How do you want to plan?</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2 pt-1">
                {continueHref && (
                  <button
                    type="button"
                    className={optionRow}
                    onClick={() => {
                      setChooserOpen(false);
                      setLocation(continueHref);
                    }}
                    data-testid="planning-option-continue"
                  >
                    <span className={optionTile}><ArrowRight className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[color:var(--earn-ink)]">
                        {continueLabel}
                      </span>
                      <span className="block text-[11px]" style={optionMeta}>
                        pick up where you left off
                      </span>
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className={optionRow}
                  onClick={() => startMyself(source)}
                  data-testid="planning-option-myself"
                >
                  <span className={optionTile}><Compass className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[color:var(--earn-ink)]">Plan it myself</span>
                    <span className="block text-[11px]" style={optionMeta}>
                      free · browse and build your own slip
                    </span>
                  </span>
                </button>

                {/* The one coral primary of the chooser (earn grammar). */}
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-white transition-colors bg-[color:var(--earn-coral-ink)] border-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={startAi}
                  data-testid="planning-option-ai"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Plan with AI</span>
                    <span className="block text-[11px] text-white/80" style={{ fontFamily: EARN_MONO }}>
                      dates + preferences → a full draft itinerary
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className={optionRow}
                  onClick={() => startLocal(source)}
                  data-testid="planning-option-local"
                >
                  <span className={optionTile}><Lamp className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[color:var(--earn-ink)]">Plan with a local</span>
                    <span className="block text-[11px]" style={optionMeta}>
                      experts who live there build it with you
                    </span>
                  </span>
                </button>

                {plusSalesEnabled && (
                  <button
                    type="button"
                    className={optionRow}
                    onClick={startOccasion}
                    data-testid="planning-option-occasion"
                  >
                    <span className={optionTile}><CalendarHeart className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[color:var(--earn-ink)]">For an occasion</span>
                      <span className="block text-[11px]" style={optionMeta}>
                        Plus builds a plan before every date you register
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Where to?</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 pt-1">
                <Input
                  value={myselfDestination}
                  onChange={(e) => setMyselfDestination(e.target.value)}
                  placeholder="City or destination"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createDraftTrip();
                  }}
                  data-testid="input-planning-destination"
                />
                {createError && (
                  <p className="text-xs text-destructive" data-testid="text-planning-create-error">
                    {createError}
                  </p>
                )}
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep("choose")} data-testid="button-planning-back">
                    Back
                  </Button>
                  <Button
                    size="sm"
                    disabled={creating}
                    onClick={() => void createDraftTrip()}
                    data-testid="button-planning-create-trip"
                  >
                    {creating ? "Creating…" : "Start the slip"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {aiOpen && (
        <EnhancedPlanningModal
          isOpen={aiOpen}
          onClose={() => setAiOpen(false)}
          initialDestination={initialDestination}
          userId={user?.id || ""}
        />
      )}
    </PlanningContext.Provider>
  );
}
