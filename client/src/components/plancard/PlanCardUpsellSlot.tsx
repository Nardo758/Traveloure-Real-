import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sparkles, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/**
 * PlanCard upsell slot (Phase A) — consumes the existing upsell engine surfaces
 * (Master-Brief Phase 5): POST /api/upsell/plancard-pretrip | /plancard-ontrip.
 *
 * One slot per temporal state (mutually exclusive by definition):
 *   - pretrip: trip not started yet  → "what's missing" gap-fill
 *   - ontrip:  trip in progress       → "near you" live nudge
 * Renders nothing outside its window or when the engine returns no candidates
 * (slot_config can disable a surface server-side).
 *
 * A candidate is an offering TYPE (displayName/tagline/reason), not a priced
 * product — so the CTA is "Explore" (browse the category), not a one-click buy.
 * Explore fires a fire-and-forget click log for impression→click attribution
 * (POST /api/upsell/click, owned by the upsell lane) before navigating.
 */

export type UpsellSurface = "plancard_pretrip" | "plancard_ontrip";

interface UpsellCandidate {
  offeringId: string;
  categoryKey: string;
  displayName: string;
  tagline: string | null;
  reason: string;
}

interface PlanCardUpsellSlotProps {
  tripId: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  surface: UpsellSurface;
}

const ENDPOINT: Record<UpsellSurface, string> = {
  plancard_pretrip: "/api/upsell/plancard-pretrip",
  plancard_ontrip: "/api/upsell/plancard-ontrip",
};

function inWindow(surface: UpsellSurface, startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  return surface === "plancard_pretrip" ? now < start : now >= start && now <= end;
}

export function PlanCardUpsellSlot({ tripId, eventType, startDate, endDate, surface }: PlanCardUpsellSlotProps) {
  const [, navigate] = useLocation();
  const active = inWindow(surface, startDate, endDate);

  const { data } = useQuery<{ candidates: UpsellCandidate[] }>({
    queryKey: [ENDPOINT[surface], tripId],
    queryFn: async () => {
      // templateKey mirrors server resolveTemplateKey (identity-with-default);
      // cartItems/userProfile default server-side (v1 — already-in-plan suppression deferred).
      const res = await apiRequest("POST", ENDPOINT[surface], {
        tripId,
        templateKey: eventType ?? "travel",
      });
      return res.json();
    },
    enabled: active,
    staleTime: 5 * 60_000,
  });

  // Fire-and-forget attribution. The endpoint lands via the upsell lane; until
  // then this no-ops (the slot is gated to publish behind that endpoint).
  const logClick = useMutation({
    mutationFn: (offeringId: string) =>
      apiRequest("POST", "/api/upsell/click", { tripId, surface, offeringId }),
  });

  if (!active) return null;
  const candidates = data?.candidates ?? [];
  if (candidates.length === 0) return null;

  const heading = surface === "plancard_pretrip" ? "Complete your plan" : "Near you on this trip";

  const handleExplore = (c: UpsellCandidate) => {
    logClick.mutate(c.offeringId);
    navigate(`/discover?category=${encodeURIComponent(c.categoryKey)}&upsellSource=${surface}`);
  };

  return (
    <div className="px-5 pb-1" data-testid={`upsell-slot-${surface}-${tripId}`}>
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {heading}
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
                {c.tagline && <div className="text-[11px] text-muted-foreground truncate">{c.tagline}</div>}
                {c.reason && <div className="text-[10px] text-muted-foreground/70 italic truncate">{c.reason}</div>}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
