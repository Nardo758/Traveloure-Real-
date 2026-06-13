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
 *
 * useUpsellSlot: consumers that need raw data (e.g. discover_location feed-composition
 * layer) can use this hook directly and own their own rendering.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sparkles, ChevronRight } from "lucide-react";
import { useEffect, useRef, Component, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

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
}

export interface SlotCatalogEntry {
  offeringTypeKey: string;
  displayName: string;
  tagline: string | null;
  categoryKey: string;
  isSurprising: boolean;
  seasonTag: string | null;
  coveredBy: { providerServiceId: string; providerName: string; price: string | null; href: string; } | null;
}

export interface SlotResult {
  candidates: UpsellCandidate[];
  /** Offerings the engine filtered out — includes their offeringId so callers can build a "covered" set. */
  suppressed: Array<{ offeringId: string; reason?: string }>;
  /** Catalog entries from discover_date surface — platform offering types with seasonal + coverage info. */
  catalogServices?: SlotCatalogEntry[];
}

interface UpsellSlotProps {
  surface: UpsellSurface;
  tripId?: string;
  contextPayload?: Record<string, unknown>;
  maxItems?: number;
  heading?: string;
  className?: string;
  "data-testid"?: string;
  /**
   * Called each time fresh slot data arrives (including on city/context transitions
   * on the same mounted instance). Use `result.candidates` for what to render;
   * use `result.suppressed` to determine which offering types the engine already
   * has coverage for.
   */
  onSlotData?: (result: SlotResult) => void;
  /**
   * When true, renders nothing (returns null) but still fires onSlotData and
   * logs impressions. Use this on surfaces where the feed composition layer
   * owns rendering of candidates (e.g. discover_location interleaved stream).
   */
  headless?: boolean;
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
  plancard_pretrip:   "/api/upsell/plancard-pretrip",
  plancard_ontrip:    "/api/upsell/plancard-ontrip",
  cart:               "/api/upsell/cart",
  checkout:           "/api/upsell/checkout",
  discover_location:  "/api/upsell/discover-location",
  discover_date:      "/api/upsell/discover-date",
};

const DEFAULT_HEADING: Record<UpsellSurface, string> = {
  plancard_pretrip:  "Complete your plan",
  plancard_ontrip:   "Near you on this trip",
  cart:              "Frequently booked together",
  checkout:          "Add to your trip",
  discover_location: "Recommended for you",
  discover_date:     "Available on this date",
};

interface UseUpsellSlotResult {
  candidates: UpsellCandidate[];
  suppressed: Array<{ offeringId: string; reason?: string }>;
  /** Catalog entries present on discover_date surface responses. */
  catalogServices: SlotCatalogEntry[] | undefined;
  /** True once the server has responded (candidates may still be empty). */
  isResolved: boolean;
  /** Opaque data identity — use for onSlotData deduplication in the component. */
  _rawData: unknown;
  logClick: (offeringId: string) => void;
}

/**
 * Data-only hook for surfaces that own their own rendering.
 * Handles the query, impression logging, and click attribution.
 * Impression fires on each new data response so city-context transitions
 * on a persistent component instance always log correctly.
 */
export function useUpsellSlot(
  surface: UpsellSurface,
  opts: {
    tripId?: string;
    contextPayload?: Record<string, unknown>;
    maxItems?: number;
  } = {},
): UseUpsellSlotResult {
  const { tripId, contextPayload, maxItems } = opts;
  const lastImpressionDataRef = useRef<unknown>(undefined);

  const body: Record<string, unknown> = { surface, ...(contextPayload ?? {}) };
  if (tripId) body.tripId = tripId;

  const { data } = useQuery<{
    candidates: UpsellCandidate[];
    suppressed?: Array<{ offeringId: string; reason?: string }>;
    catalogServices?: SlotCatalogEntry[];
  }>({
    queryKey: [ENDPOINT[surface], tripId, JSON.stringify(contextPayload)],
    queryFn: async () => {
      const res = await apiRequest("POST", ENDPOINT[surface], body);
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
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
    // Fire on each new data response (not just once per mount) so city/context
    // transitions on the same component instance propagate fresh impressions.
    if (candidates.length > 0 && data !== lastImpressionDataRef.current) {
      lastImpressionDataRef.current = data;
      logImpression.mutate(candidates.map((c) => c.offeringId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length]);

  return {
    candidates,
    suppressed: data?.suppressed ?? [],
    catalogServices: data?.catalogServices,
    isResolved: data !== undefined,
    _rawData: data,
    logClick: (offeringId: string) => logClick.mutate(offeringId),
  };
}

export function UpsellSlot({
  surface,
  tripId,
  contextPayload,
  maxItems,
  heading,
  className,
  "data-testid": testId,
  onSlotData,
  headless,
}: UpsellSlotProps) {
  const [, navigate] = useLocation();
  const slotDataFiredRef = useRef<unknown>(undefined);

  const { candidates, suppressed, catalogServices, isResolved, _rawData, logClick } = useUpsellSlot(surface, {
    tripId,
    contextPayload,
    maxItems,
  });

  useEffect(() => {
    // Fire onSlotData each time new data arrives (city/context transitions on
    // the same mounted instance must propagate fresh results to the caller).
    if (isResolved && _rawData !== slotDataFiredRef.current) {
      slotDataFiredRef.current = _rawData;
      onSlotData?.({ candidates, suppressed, catalogServices });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolved, candidates.length]);

  if (headless || candidates.length === 0) return null;

  const label = heading ?? DEFAULT_HEADING[surface];

  const handleExplore = (c: UpsellCandidate) => {
    logClick(c.offeringId);
    navigate(`/discover?categoryKey=${encodeURIComponent(c.categoryKey)}&upsellSource=${surface}`);
  };

  return (
    <div className={className} data-testid={testId ?? `upsell-slot-${surface}`}>
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {label}
        </div>
        <div className="space-y-1.5">
          {candidates.map((c) => (
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
          ))}
        </div>
      </div>
    </div>
  );
}
