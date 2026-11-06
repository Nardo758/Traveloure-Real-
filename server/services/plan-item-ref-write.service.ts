/**
 * CAP-2 Phase 2 (ruling 9; ledger `2026-11-05-cap2-phase2-cards`): "Plan around it" on a city event lands that event
 * on the new plan as an ITEM, through the same resolver every save uses (`resolvePlanItemRef`). The mint already
 * verified the event (`checkMintEvent`); this adds the item. It never fails the mint (§15b): a refusal or an error is
 * logged and the plan stands without the item.
 */
import { logger } from "../infrastructure/logger";
import { storage } from "../storage";
import { planMarkets, resolvePlanItemRef } from "./guest-item-source.service";
import { guestEventPlacement } from "./guest-plan.service";
import type { PlanItemRef } from "@shared/plan-item-ref";

export async function landRefOnNewPlan(
  trip: { id: string; startDate: unknown; endDate: unknown },
  ref: PlanItemRef,
): Promise<{ ok: true; itemId: string } | { ok: false; reason: string }> {
  try {
    const start = String(trip.startDate).slice(0, 10);
    const end = String(trip.endDate).slice(0, 10);
    const planDays = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
    const resolved = await resolvePlanItemRef(ref, { markets: await planMarkets(trip.id), planDays: Number.isFinite(planDays) ? planDays : null });
    if (!resolved.ok) {
      logger.warn({ tripId: trip.id, kind: ref.kind, reason: resolved.reason }, "plan-around: the event did not land as an item (the plan stands)");
      return { ok: false, reason: resolved.reason };
    }
    const src = resolved.source;
    const placement = guestEventPlacement(src.eventDate ?? null, start, end);
    const item = await storage.createItineraryItem(
      {
        tripId: trip.id,
        title: src.title,
        itemType: src.itemType ?? "activity",
        dayNumber: placement?.dayNumber ?? 1,
        status: "planned",
        origin: "traveler",
        ...(placement ? { scheduledDate: placement.scheduledDate } : {}),
        ...(src.startTime ? { startTime: src.startTime } : {}),
        ...(src.locationName ? { locationName: src.locationName } : {}),
        ...(src.latitude != null && src.longitude != null ? { latitude: src.latitude, longitude: src.longitude } : {}),
      } as any,
      src.contentType && src.contentId ? { contentLink: { contentType: src.contentType, contentId: src.contentId } } : {},
    );
    return { ok: true, itemId: (item as any).id };
  } catch (err: any) {
    logger.warn({ tripId: trip.id, kind: ref.kind, err: err?.message }, "plan-around: item write failed (the plan stands)");
    return { ok: false, reason: "error" };
  }
}
