/**
 * Transport-gap checker (QA_PUNCH_LIST item 21 — decision-maker directive Aug 1, 2026: "AI should
 * catch transport gaps", external-source emphasis). Rules-FIRST, deterministic, no LLM — cheap and
 * honest, matching the §18 L4 "engine proposes, expert confirms" posture already proven for
 * transport legs.
 *
 * Depends on item 20 (shared/content-logistics.ts): the envelope is the signal source for whether
 * an item's own SOURCE ever asserted transport is provided.
 *
 * For each day, orders LOCATED items chronologically (startTime, then sortOrder as the tiebreak —
 * deliberately NOT storage.getItineraryItems' own (sortOrder, startTime) order, since gap timing
 * math needs the real clock sequence, not manual authoring order) and walks consecutive pairs,
 * flagging:
 *   transport_gap        — no CONFIRMED transport_legs row covers this pair AND the arriving
 *                           item's transport.provided !== 'yes' (unknown/null counts as NOT
 *                           provided — never assumed covered, §13).
 *   timing_infeasible     — the estimated arrival (prev start + prev duration, +travel) is after
 *                           the next item's start time.
 *   missing_pickup_detail — transport IS provided but neither the item nor its linked service has
 *                           a pickup point on record.
 * A pair missing coordinates or start times on either endpoint is SKIPPED with an honest
 * `insufficient_data` note — never guessed (§13, mirrors trip-transport-legs.service.ts's own
 * "missing_coordinates" skip for the leg-proposal engine).
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { providerServices, type ItineraryItem } from "@shared/schema";
import { storage } from "../storage";
import { itineraryIntelligenceService } from "./itinerary-intelligence.service";
import { getTripTransportLegs } from "./trip-transport-legs.service";
import { envelopeFromItineraryItem, envelopeFromProviderService, type TransportProvided } from "@shared/content-logistics";

/** Fallback assumption ONLY for the "available gap" math when the departing item has no recorded
 *  duration — always surfaced back to the caller via `assumedPrevDuration` so a card can label it
 *  as an assumption rather than silently treating it as fact (§13). */
const ASSUMED_DURATION_FALLBACK_MINUTES = 60;

export type TransportGapFlag = "transport_gap" | "timing_infeasible" | "missing_pickup_detail";

export interface TransportGapPair {
  dayNumber: number;
  fromItemId: string;
  fromTitle: string;
  toItemId: string;
  toTitle: string;
  flags: TransportGapFlag[];
  /** True when the departing item had no durationMinutes and the 60-minute fallback was used to
   *  compute the available gap — the caller MUST surface this, never treat it as a hard fact. */
  assumedPrevDuration: boolean;
  availableGapMinutes: number;
  estimatedTravelMinutes: number;
  estimatedTravelMode: string;
}

export interface TransportGapSkip {
  dayNumber: number;
  fromItemId: string;
  fromTitle: string;
  toItemId: string;
  toTitle: string;
  reason: "insufficient_data";
  detail: "missing_coordinates" | "missing_start_time";
}

export interface TransportGapDayResult {
  dayNumber: number;
  pairs: TransportGapPair[];
  skipped: TransportGapSkip[];
}

export interface TransportGapAnalysis {
  tripId: string;
  days: TransportGapDayResult[];
}

/** Mirrors trip-transport-legs.service.ts's own realCoord: rejects null/NaN/out-of-range and the
 *  (0,0) "Null Island" sentinel — the SAME "located" test the leg-proposal engine uses, so this
 *  checker and the "Propose leg" action it triggers agree on which pairs are routable. */
function realCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const la = typeof lat === "number" ? lat : parseFloat(String(lat));
  const ln = typeof lng === "number" ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

/** "HH:MM" → minutes since midnight, or null when unparseable/absent. */
function minutesFromTimeString(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Same pair identity as trip-transport-legs.service.ts's private `pairKey` — kept in sync
 *  deliberately (not exported from there) so a confirmed leg is matched to the exact gap it
 *  covers. */
function pairKey(dayNumber: number, fromId: string | null | undefined, toId: string | null | undefined): string {
  return `${dayNumber}|${fromId ?? ""}|${toId ?? ""}`;
}

export async function analyzeTransportGaps(tripId: string): Promise<TransportGapAnalysis> {
  const items = await storage.getItineraryItems(tripId);

  // Only CONFIRMED legs count as "covered" — a merely-proposed (machine-guessed, unconfirmed) leg
  // is not a real arrangement yet (§18 D1a-analog: never treat a proposal as coverage).
  const confirmedLegs = await getTripTransportLegs(tripId);
  const confirmedPairs = new Set(
    confirmedLegs.map((l: any) => pairKey(l.dayNumber, l.fromActivityId, l.toActivityId)),
  );

  // Batch-fetch linked provider_services for items whose OWN transportProvided/pickupPoint is
  // unset but carry a providerServiceId — the fallback-to-source read the envelope model implies
  // (an item added before migration 166, or via a source that predates the write-side carry,
  // still has a real answer sitting on its linked listing).
  const serviceIds = Array.from(
    new Set(
      items
        .filter((i) => i.providerServiceId && (i.transportProvided == null || i.pickupPoint == null))
        .map((i) => i.providerServiceId as string),
    ),
  );
  const servicesById = new Map<string, typeof providerServices.$inferSelect>();
  if (serviceIds.length > 0) {
    const rows = await db.select().from(providerServices).where(inArray(providerServices.id, serviceIds));
    for (const row of rows) servicesById.set(row.id, row);
  }

  function resolvedTransport(item: ItineraryItem): { provided: TransportProvided; pickupPoint: string | null } {
    const own = envelopeFromItineraryItem(item);
    // Fallback to the linked listing's own envelope ONLY for whichever of the two facts the item
    // itself never captured — never overrides a fact the item DOES carry (e.g. an item explicitly
    // marked transport 'no' stays 'no' even if its linked service says 'yes').
    const linked = item.providerServiceId ? servicesById.get(item.providerServiceId) : undefined;
    const linkedEnvelope = linked ? envelopeFromProviderService(linked) : null;
    return {
      provided: own.transport.provided ?? linkedEnvelope?.transport.provided ?? null,
      pickupPoint: own.transport.pickupPoint ?? linkedEnvelope?.transport.pickupPoint ?? null,
    };
  }

  const byDay = new Map<number, ItineraryItem[]>();
  for (const item of items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list);
  }

  const days: TransportGapDayResult[] = [];

  for (const dayNumber of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    // Chronological order (startTime, then sortOrder tiebreak) — the real clock sequence, not the
    // authoring/sortOrder sequence, is what gap-timing math needs.
    const dayItems = [...(byDay.get(dayNumber) ?? [])].sort((a, b) => {
      const at = minutesFromTimeString(a.startTime) ?? Number.MAX_SAFE_INTEGER;
      const bt = minutesFromTimeString(b.startTime) ?? Number.MAX_SAFE_INTEGER;
      if (at !== bt) return at - bt;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    const pairs: TransportGapPair[] = [];
    const skipped: TransportGapSkip[] = [];

    for (let i = 0; i < dayItems.length - 1; i++) {
      const from = dayItems[i];
      const to = dayItems[i + 1];

      const fromCoord = realCoord(from.latitude, from.longitude);
      const toCoord = realCoord(to.latitude, to.longitude);
      if (!fromCoord || !toCoord) {
        skipped.push({
          dayNumber, fromItemId: from.id, fromTitle: from.title, toItemId: to.id, toTitle: to.title,
          reason: "insufficient_data", detail: "missing_coordinates",
        });
        continue;
      }

      const fromStart = minutesFromTimeString(from.startTime);
      const toStart = minutesFromTimeString(to.startTime);
      if (fromStart === null || toStart === null) {
        skipped.push({
          dayNumber, fromItemId: from.id, fromTitle: from.title, toItemId: to.id, toTitle: to.title,
          reason: "insufficient_data", detail: "missing_start_time",
        });
        continue;
      }

      const assumedPrevDuration = from.durationMinutes == null;
      const prevDuration = from.durationMinutes ?? ASSUMED_DURATION_FALLBACK_MINUTES;
      const availableGapMinutes = toStart - (fromStart + prevDuration);

      // The underlying estimator behind POST /api/itinerary/estimate-travel, called directly
      // (not over HTTP) — straight-line-distance-based, default mode "driving" (the same default
      // the estimator itself uses when no mode is specified).
      const estimate = itineraryIntelligenceService.estimateTravelTime(
        fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng, "driving",
      );

      const flags: TransportGapFlag[] = [];

      const covered = confirmedPairs.has(pairKey(dayNumber, from.id, to.id));
      const toTransport = resolvedTransport(to);
      if (!covered && toTransport.provided !== "yes") {
        flags.push("transport_gap");
      }

      const estimatedArrivalMinutes = fromStart + prevDuration + estimate.durationMinutes;
      if (estimatedArrivalMinutes > toStart) {
        flags.push("timing_infeasible");
      }

      if (toTransport.provided === "yes" && !toTransport.pickupPoint) {
        flags.push("missing_pickup_detail");
      }

      if (flags.length > 0) {
        pairs.push({
          dayNumber,
          fromItemId: from.id, fromTitle: from.title,
          toItemId: to.id, toTitle: to.title,
          flags,
          assumedPrevDuration,
          availableGapMinutes,
          estimatedTravelMinutes: estimate.durationMinutes,
          estimatedTravelMode: estimate.mode,
        });
      }
    }

    if (pairs.length > 0 || skipped.length > 0) {
      days.push({ dayNumber, pairs, skipped });
    }
  }

  return { tripId, days };
}
