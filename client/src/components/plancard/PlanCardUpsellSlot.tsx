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
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
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
