/**
 * `recordSlipEvent` — the ONE writer for slip funnel events proposed by docs/planning/slip-funnel-events.md
 * §2 principle 3 (ledger `2026-10-18-teaser-copy-events`). A typed wrapper over `trackFunnelEvent`:
 *   · the actor is the session (§14) and must be able to READ the plan — otherwise one 404 (LD 40);
 *   · properties are built from a per-event allowlist — ids and enums only, never text (doc condition 1);
 *   · the common properties `viewerRole` and `market` come from the server, `market` omitted when NULL (§13);
 *   · a per-plan, per-actor hourly cap bounds the client rail (`slipEventsHourlyCap`, config);
 *   · it never fails the view (§15b) — `trackFunnelEvent` catches its own errors.
 * Today it carries the two client events of §3.14–3.15; the earlier event writers keep their own
 * functions until their lanes move onto it.
 */
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { trackFunnelEvent } from "../utils/funnelTracker";
import { slipEventsHourlyCap } from "../config/plan-fit.config";
import { OptionSetError, planRole } from "./plan-option-sets.service";
import { SLIP_LOCAL_TEASER_SHOWN_EVENT, type SlipClientEvent } from "@shared/slip-funnel-events";

const SLIP_STAGE = "SLIP";

/** The per-event property allowlist. Pure. */
export function slipEventProperties(event: SlipClientEvent): Record<string, unknown> {
  if (event.type === SLIP_LOCAL_TEASER_SHOWN_EVENT) {
    return { surface: event.surface, teaserDays: event.teaserDays, viewId: event.viewId };
  }
  return { surface: event.surface, viewId: event.viewId };
}

export async function recordSlipEvent(input: { tripId: string; userId: string; event: SlipClientEvent }): Promise<{ recorded: boolean }> {
  const role = await planRole(input.tripId, input.userId, "read");
  if (!role) throw new OptionSetError(404, "not_found", "No such plan");
  const [{ n }] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM funnel_events
     WHERE user_id = ${input.userId} AND trip_id = ${input.tripId}
       AND event_type = ${input.event.type} AND created_at > now() - interval '1 hour'
  `)).rows as Array<{ n: number }>;
  if (n >= slipEventsHourlyCap()) return { recorded: false };
  const [trip] = await db.select({ market: trips.marketSlug }).from(trips).where(eq(trips.id, input.tripId)).limit(1);
  await trackFunnelEvent({
    userId: input.userId,
    tripId: input.tripId,
    eventType: input.event.type,
    funnelStage: SLIP_STAGE,
    eventData: {
      ...slipEventProperties(input.event),
      viewerRole: role,
      ...(trip?.market ? { market: trip.market } : {}),
    },
  });
  return { recorded: true };
}
