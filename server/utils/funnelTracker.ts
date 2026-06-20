import { db } from "../db";
import { funnelEvents } from "../../shared/schema";

export async function trackFunnelEvent(params: {
  userId?: string | number;
  sessionId?: string;
  eventType: string;
  funnelStage: string; // "T0"–"T7" or "T1_ACCOUNT_CREATED" — normalized to "TX" prefix
  tripId?: string | number;
  expertRequestId?: number;
  bookingId?: string | number;
  source?: string;
  refToken?: string;
  eventData?: Record<string, unknown>;
}): Promise<void> {
  try {
    const {
      userId, sessionId, eventType, funnelStage,
      tripId, expertRequestId, bookingId, source, refToken, eventData,
    } = params;

    // Normalize to "TX" prefix — existing schema is stage varchar(4)
    const stage = funnelStage.split("_")[0].slice(0, 4);

    // Fold extra context into properties — existing schema has no separate columns for these
    const extra: Record<string, unknown> = {};
    if (expertRequestId !== undefined) extra.expertRequestId = expertRequestId;
    if (bookingId !== undefined) extra.bookingId = String(bookingId);
    if (source !== undefined) extra.source = source;
    if (refToken !== undefined) extra.refToken = refToken;
    if (eventData) Object.assign(extra, eventData);

    await db.insert(funnelEvents).values({
      userId: userId !== undefined ? String(userId) : undefined,
      sessionId,
      eventType,
      stage,
      tripId: tripId !== undefined ? String(tripId) : undefined,
      properties: Object.keys(extra).length > 0 ? extra : undefined,
    });
  } catch (err) {
    // Never block the main flow for analytics
    console.error("[FUNNEL TRACK ERROR]", err);
  }
}
