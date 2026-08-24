import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import type { SlipData } from "@/components/plancard/SlipView";
import type { RoutingStatus } from "@/components/plancard/plancard-types";

/**
 * PlanSlipStrip — R-A: the compact one-line strip that caps the dashboard's embedded Plan
 * Card. Reads the SAME `/api/trips/:tripId/plancard` DTO the PlanCard/SlipView family reads
 * (same query key → React Query shares the cache, no extra network round trip once the
 * PlanCard below has fetched). Never widens past its container (plain block width, no
 * fixed/min width) — the caller keeps it inside the PlanCard's own max-width wrapper.
 *
 * §13 honest-or-absent: the tracking ref renders only when the trip actually has one
 * (pre-Lane-S rows are NULL — never invented); routing-status pills come only from real
 * itinerary items, omit zero-count segments, and the whole strip renders nothing when there
 * is neither a ref nor any counted item (nothing real to show yet).
 */
const STATUS_LABELS: Record<RoutingStatus, string> = {
  in_planning: "planning",
  with_expert: "with expert",
  ready_for_checkout: "checkout",
  purchased: "purchased",
};

const ROUTING_ORDER: RoutingStatus[] = ["in_planning", "with_expert", "ready_for_checkout", "purchased"];

export function PlanSlipStrip({ tripId }: { tripId: string }) {
  const { data } = useQuery<SlipData>({
    // Same key PlanCard/SlipView use — shared cache, not a duplicate fetch.
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: !!tripId,
    staleTime: 30000,
  });

  if (!data) return null;

  const days = data.days ?? [];
  const activities = days.flatMap((d) => d.activities ?? []);
  const counts: Record<RoutingStatus, number> = {
    in_planning: 0,
    with_expert: 0,
    ready_for_checkout: 0,
    purchased: 0,
  };
  for (const a of activities) {
    if (a.booking || a.routingStatus === "purchased") counts.purchased++;
    else if (a.routingStatus) counts[a.routingStatus]++;
  }
  const segments = ROUTING_ORDER.map((status) => ({ status, n: counts[status] })).filter((s) => s.n > 0);
  const trackingNumber = data.trip?.trackingNumber || null;

  if (segments.length === 0 && !trackingNumber) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-t-2xl border border-b-0 text-[11px] flex-wrap"
      style={{ borderColor: "#E8E8E2", background: "#FAFAF8" }}
      data-testid={`plan-slip-strip-${tripId}`}
    >
      {trackingNumber && (
        <span className="font-mono" style={{ color: "#7A7A72" }} data-testid="plan-slip-strip-ref">
          {trackingNumber}
        </span>
      )}
      {segments.length > 0 && (
        <span className="flex items-center gap-1.5 flex-wrap" data-testid="plan-slip-strip-counts">
          {segments.map((s, i) => (
            <span key={s.status} className="flex items-center gap-1.5">
              {i > 0 && <span style={{ color: "#AEAEA6" }}>·</span>}
              <span style={{ color: "#7A7A72" }} data-testid={`plan-slip-strip-count-${s.status}`}>
                {s.n} {STATUS_LABELS[s.status]}
              </span>
            </span>
          ))}
        </span>
      )}
      <Link
        href={`/plans/${tripId}`}
        className="ml-auto flex items-center gap-0.5 font-medium hover:underline flex-shrink-0"
        style={{ color: "#E85D55" }}
        data-testid="plan-slip-strip-open"
      >
        Open slip <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
