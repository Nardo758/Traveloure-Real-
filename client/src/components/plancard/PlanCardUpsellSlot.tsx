/**
 * PlanCard upsell slot — thin wrapper around the generic <UpsellSlot /> that
 * preserves the existing API so PlanCard.tsx callers need no changes.
 *
 * Surfaces supported here:
 *   - pretrip: trip not started yet  → "what's missing" gap-fill
 *   - ontrip:  trip in progress       → "near you" live nudge
 *
 * Window gating (only render inside the relevant time window) is kept here
 * because it is plancard-specific logic not relevant to other surfaces.
 */

import { useQuery } from "@tanstack/react-query";
import { UpsellSlot, upsellSlotQueryOptions } from "@/components/UpsellSlot";
import { parseTripDate } from "@/lib/calendar-date";
import type { UpsellLine } from "@shared/upsell-line";

export type UpsellSurface = "plancard_pretrip" | "plancard_ontrip";

interface PlanCardUpsellSlotProps {
  tripId: string;
  /**
   * The plan's own destination (lane L22, ledger `2026-09-07-doors-pass-tripid`; LD 42 D13).
   * Optional because a caller that does not hold one must pass NOTHING (§13).
   */
  destination?: string | null;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  surface: UpsellSurface;
}

export function inWindow(surface: UpsellSurface, startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  // F-1: DATE columns arrive as "YYYY-MM-DD"; `new Date()` reads those as UTC midnight, which
  // shifts the window a day west of UTC. parseTripDate reads them as LOCAL midnight.
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  if (!start || !end) return false;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return surface === "plancard_pretrip" ? now < start : now >= start && now <= end;
}

/**
 * Row 179: the on-trip read's per-leg lines, keyed by item id. The SAME query (and key) the on-trip slot runs, under
 * the SAME window, so nothing is fetched twice and no impression is logged by the card. Not in the window, or
 * not enabled ⇒ an empty map.
 */
export function usePlanCardUpsellLines(opts: {
  tripId: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
}): Map<string, UpsellLine> {
  const active = opts.enabled && inWindow("plancard_ontrip", opts.startDate, opts.endDate);
  const { data } = useQuery({
    ...upsellSlotQueryOptions("plancard_ontrip", opts.tripId, { templateKey: opts.eventType ?? "travel" }),
    enabled: active,
  });
  const out = new Map<string, UpsellLine>();
  if (!active) return out;
  for (const line of data?.lines ?? []) if (!out.has(line.itemId)) out.set(line.itemId, line);
  return out;
}

export function PlanCardUpsellSlot({
  tripId,
  destination,
  eventType,
  startDate,
  endDate,
  surface,
}: PlanCardUpsellSlotProps) {
  const active = inWindow(surface, startDate, endDate);
  if (!active) return null;

  return (
    <div className="px-5 pb-1" data-testid={`upsell-slot-${surface}-${tripId}`}>
      <UpsellSlot
        surface={surface}
        tripId={tripId}
        destination={destination}
        contextPayload={{ templateKey: eventType ?? "travel" }}
      />
    </div>
  );
}
