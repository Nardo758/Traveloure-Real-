/**
 * TC-3b — THE ONE WRITER of `transport_option_events` (ledger `2026-10-11-tc3b-ride-recommender`; migration 370).
 * Insert-only, ON CONFLICT DO NOTHING on (trip, corridor, service, event): `offered` lands once however often the
 * plan card is read, and a retried accept or skip writes nothing new. Never throws (§15b): a failed event write
 * never fails the read or the insert it rides on.
 */
import { db } from "../db";
import { transportOptionEvents } from "@shared/schema";
import type { TransportOptionEventKind } from "@shared/transport-option-events";

export interface TransportOptionEventInput {
  tripId: string;
  corridorKey: string;
  serviceId: string;
  event: TransportOptionEventKind;
  dayNumber?: number | null;
  legId?: string | null;
  occasion?: string | null;
}

export async function recordTransportOptionEvents(rows: readonly TransportOptionEventInput[]): Promise<void> {
  if (!rows.length) return;
  try {
    await db
      .insert(transportOptionEvents)
      .values(rows.map((r) => ({
        tripId: r.tripId,
        corridorKey: r.corridorKey,
        serviceId: r.serviceId,
        event: r.event,
        dayNumber: r.dayNumber ?? null,
        legId: r.legId ?? null,
        occasion: r.occasion ? String(r.occasion).slice(0, 50) : null,
      })))
      .onConflictDoNothing();
  } catch (err: any) {
    console.warn(`[transport-option-events] not recorded (${rows[0].event}, trip ${rows[0].tripId}): ${String(err?.message ?? err).slice(0, 200)}`);
  }
}
