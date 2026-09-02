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

import { UpsellSlot } from "@/components/UpsellSlot";
import { parseTripDate } from "@/lib/calendar-date";

export type UpsellSurface = "plancard_pretrip" | "plancard_ontrip";

interface PlanCardUpsellSlotProps {
  tripId: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  surface: UpsellSurface;
}

function inWindow(surface: UpsellSurface, startDate?: string, endDate?: string): boolean {
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

export function PlanCardUpsellSlot({
  tripId,
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
        contextPayload={{ templateKey: eventType ?? "travel" }}
      />
    </div>
  );
}
