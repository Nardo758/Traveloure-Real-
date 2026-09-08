/**
 * Generic <UpsellSlot surface="..." /> component
 *
 * Extracted from PlanCardUpsellSlot.tsx (plancard-specific surfaces) and extended
 * to cover all upsell surfaces: cart, checkout, discover_location, and more.
 *
 * Surface → endpoint mapping lives here; consumers pass only the surface name.
 *
 * Impression logging: every render that shows ≥1 candidate fires a fire-and-forget
 * POST /api/upsell/impression so the attribution pipeline sees it.
 *
 * Secrecy contract: offeringId and raw categoryKey are NEVER rendered in the DOM —
 * only displayName and tagline reach the user. (Exception: offeringId is used as
 * a React key and in click attribution but never in visible text.)
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sparkles, ChevronRight, Plus, Loader2 } from "lucide-react";
import { useEffect, useRef, Component, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
// The `/services` browse URL contract, stated once and imported by both ends (§18 rule 1).
import { buildServicesBrowseHref } from "@/lib/services-browse";

export type UpsellSurface =
  | "plancard_pretrip"
  | "plancard_ontrip"
  | "cart"
  | "checkout"
  | "discover_location"
  | "discover_date";

export interface UpsellCandidate {
  offeringId: string;
  categoryKey: string;
  displayName: string;
  tagline: string | null;
  reason: string;
  /** Present in the server payload; lets surfaces show the distinct
   *  paid-affiliate disclosure marker. */
  sourceType?: "platform_provider" | "affiliate";
  /** Cart surface only: the concrete approved listing behind this candidate,
   *  so the slot can add it to the cart in place instead of navigating away.
   *  Price is display-only — the charge re-derives server-side at checkout. */
  bookable?: { serviceId: string; serviceName: string | null; price: number | null } | null;
}

export interface SlotResult {
  candidates: UpsellCandidate[];
  /** Offerings the engine filtered out — includes their offeringId so callers can build a "covered" set. */
  suppressed: Array<{ offeringId: string; reason?: string }>;
}

interface UpsellSlotProps {
  surface: UpsellSurface;
  tripId?: string;
  /**
   * The plan's own destination, when the mounting surface holds one (lane L22, ledger
   * `2026-09-07-doors-pass-tripid`; CLAUDE.md Locked Decision 42 **D13** — a door passes what it
   * holds). It rides onto the browse's "where" filter so an upsell explored from a plan is not
   * shown the whole world. **§13: a surface that does not hold a destination passes NOTHING** —
   * the cart and checkout slots pass neither this nor a `tripId`, and the browse is then told
   * honestly that neither is known rather than being handed a placeholder.
   */
  destination?: string | null;
  contextPayload?: Record<string, unknown>;
  maxItems?: number;
  heading?: string;
  className?: string;
  "data-testid"?: string;
  /**
   * When provided, candidates that resolve to a concrete listing (`bookable`)
   * render an in-place "Add" action calling this instead of navigating away —
   * the cart surface uses it so recommendations stay add-to-cart, not a
   * redirect out of the checkout flow. Candidates without a bookable listing
   * keep the browse navigation.
   */
  onAddBookable?: (c: UpsellCandidate) => void;
  /** Offering ids currently being added — shows a pending state on that row. */
  addingOfferingId?: string | null;
  /**
   * Called once with the full slot result after the server responds.
   * Use `result.candidates` for what to render; use `result.suppressed` to
   * determine which offering types the engine already has coverage for
   * (so recruitment widgets can show only truly uncovered categories).
   */
  onSlotData?: (result: SlotResult) => void;
}

interface ErrorBoundaryState { hasError: boolean }
export class UpsellErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

const ENDPOINT: Record<UpsellSurface, string> = {
  plancard_pretrip: "/api/upsell/plancard-pretrip",
  plancard_ontrip: "/api/upsell/plancard-ontrip",
  cart: "/api/upsell/cart",
  checkout: "/api/upsell/checkout",
  discover_location: "/api/upsell/discover-location",
  // Date-mode discover: dateRange is a HARD availability filter server-side
  // (discoverDateBodySchema requires { city, dateRange: { start, end? } } in
  // the contextPayload — city-scoped, not neighborhoodId-scoped).
  discover_date: "/api/upsell/discover-date",
};

const DEFAULT_HEADING: Record<UpsellSurface, string> = {
  plancard_pretrip: "Complete your plan",
  plancard_ontrip: "Near you on this trip",
  cart: "Frequently booked together",
  checkout: "Add to your plan",
  discover_location: "Recommended for you",
  discover_date: "Available on your date",
};

export interface UseUpsellSlotResult {
  candidates: UpsellCandidate[];
  suppressed: Array<{ offeringId: string; reason?: string }>;
  /** True once the server has responded (even with an empty slate). */
  isResolved: boolean;
  /** Fire-and-forget click attribution for a candidate. */
  logClick: (offeringId: string) => void;
}

/**
 * Data layer of the upsell slot: fetch + impression/click attribution,
 * without the default block rendering. Surfaces that render candidates
 * natively (e.g. the Discover feed-composition layer) consume this hook;
 * <UpsellSlot /> remains the default presentation built on top of it.
 */
export function useUpsellSlot(
  surface: UpsellSurface,
  opts: { tripId?: string; contextPayload?: Record<string, unknown>; maxItems?: number; enabled?: boolean } = {},
): UseUpsellSlotResult {
  const { tripId, contextPayload, maxItems, enabled = true } = opts;
  const impressionFiredRef = useRef(false);

  const body: Record<string, unknown> = { surface, ...(contextPayload ?? {}) };
  if (tripId) body.tripId = tripId;

  const { data } = useQuery<{ candidates: UpsellCandidate[]; suppressed?: Array<{ offeringId: string; reason?: string }> }>({
    queryKey: [ENDPOINT[surface], tripId, JSON.stringify(contextPayload)],
    queryFn: async () => {
      const res = await apiRequest("POST", ENDPOINT[surface], body);
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });

  const logClick = useMutation({
    mutationFn: (offeringId: string) =>
      apiRequest("POST", "/api/upsell/click", { surface, offeringId, tripId }),
  });

  const logImpression = useMutation({
    mutationFn: (offeringIds: string[]) =>
      apiRequest("POST", "/api/upsell/impression", { surface, offeringIds, tripId }),
  });

  const candidates = (data?.candidates ?? []).slice(0, maxItems);

  useEffect(() => {
    if (candidates.length > 0 && !impressionFiredRef.current) {
      impressionFiredRef.current = true;
      logImpression.mutate(candidates.map((c) => c.offeringId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length]);

  return {
    candidates,
    suppressed: data?.suppressed ?? [],
    isResolved: data !== undefined,
    logClick: (offeringId: string) => logClick.mutate(offeringId),
  };
}

export function UpsellSlot({
  surface,
  tripId,
  destination,
  contextPayload,
  maxItems,
  heading,
  className,
  "data-testid": testId,
  onSlotData,
  onAddBookable,
  addingOfferingId,
}: UpsellSlotProps) {
  const [, navigate] = useLocation();
  const slotDataFiredRef = useRef(false);

  const { candidates, suppressed, isResolved, logClick } = useUpsellSlot(surface, {
    tripId,
    contextPayload,
    maxItems,
  });

  useEffect(() => {
    if (isResolved && !slotDataFiredRef.current) {
      slotDataFiredRef.current = true;
      onSlotData?.({ candidates, suppressed });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolved]);

  if (candidates.length === 0) return null;

  const label = heading ?? DEFAULT_HEADING[surface];

  /**
   * THE DOOR PASSES THE PLAN IT IS STANDING ON (lane L22, ledger
   * `2026-09-07-doors-pass-tripid`; CLAUDE.md Locked Decision 42 **D13**, Locked Decision 39).
   *
   * THE DEFECT (brief §11.3 F6/F9). This navigated to `/services?categoryKey=…&upsellSource=…`
   * and nothing else — while the component was already holding the `tripId` it fetches its own
   * candidates with. So an upsell explored from a plan arrived at a browse that had never heard of
   * that plan: its Add to plan fell through to the trip-less guest cart, and its "where" filter
   * fell back to the client pen, which may describe a different plan entirely.
   *
   * The href is built by the ONE builder both ends of this contract import (§18 rule 1) — a second
   * hand-assembled query string here is how a link starts carrying a param the page ignores, which
   * renders as a perfectly ordinary unfiltered browse with nothing to give it away.
   *
   * §13: `tripId` and `destination` are dropped when absent. The cart and checkout slots hold
   * neither, and pass neither — an absent param is how the browse is told "not known".
   */
  const handleExplore = (c: UpsellCandidate) => {
    logClick(c.offeringId);
    navigate(
      buildServicesBrowseHref({
        categoryKey: c.categoryKey,
        tripId,
        location: destination,
        upsellSource: surface,
      }),
    );
  };

  return (
    <div className={className} data-testid={testId ?? `upsell-slot-${surface}`}>
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {label}
        </div>
        <div className="space-y-1.5">
          {candidates.map((c) => {
            const addInPlace = Boolean(onAddBookable && c.bookable?.serviceId);
            if (addInPlace) {
              const priceNum = c.bookable?.price;
              return (
                <div
                  key={c.offeringId}
                  className="w-full flex items-center gap-2 text-left p-2 rounded-lg"
                  data-testid={`upsell-candidate-${surface}-${c.offeringId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {c.bookable?.serviceName || c.displayName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.displayName}
                      {typeof priceNum === "number" && Number.isFinite(priceNum) && (
                        <> · ${priceNum.toFixed(0)}</>
                      )}
                    </div>
                    {c.reason && (
                      <div className="text-[10px] text-muted-foreground/70 italic truncate">{c.reason}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logClick(c.offeringId);
                      onAddBookable?.(c);
                    }}
                    disabled={addingOfferingId === c.offeringId}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-60 flex-shrink-0"
                    data-testid={`upsell-add-${surface}-${c.offeringId}`}
                  >
                    {addingOfferingId === c.offeringId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Add
                  </button>
                </div>
              );
            }
            return (
              <button
                key={c.offeringId}
                type="button"
                onClick={() => handleExplore(c)}
                className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid={`upsell-candidate-${surface}-${c.offeringId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-foreground truncate">{c.displayName}</div>
                  {c.tagline && (
                    <div className="text-[11px] text-muted-foreground truncate">{c.tagline}</div>
                  )}
                  {c.reason && (
                    <div className="text-[10px] text-muted-foreground/70 italic truncate">{c.reason}</div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
