/**
 * The free preview's FINDINGS (surface step 4, spec v1.2 §8; rulings R-f, R-l, R-v; ledger
 * `2026-10-03-surface-step4-optimizer-lead`). Reads what the plan already holds and hands it to the
 * pure rules in `shared/optimizer-lead.ts` — no model call, no network.
 *
 *   items    the plan's rows: day, draft time, title; a stop's point is its trusted row coordinate,
 *            else Google's live location fact (LD 57 — read, never copied)
 *   hours    the plan's stored opening-hours facts (`factsForTrip`), with their own checkedAt
 *   anchors  the plan's temporal anchors (the ONE overlap rule validate-schedule uses)
 *   energy   the plan's `energy_tracking` rows (its pace verdict per day)
 *   legs     the plan's own transport legs (the rows the traveler sees) — reachability reads their
 *            minutes and nothing else (Slice A2, `shared/leg-reachability.ts`)
 *
 * R-f: only KINDS and COUNTS leave this module — never a re-sequenced order. Read behind the
 * caller's own plan gate (`GET /api/optimization-preview`, `authorizeTripLogistics`).
 */
import { tripLegsShown } from "./routing/plan-routed-legs.service";
import { legIsRouted } from "./routing/plan-legs";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import {
  cityCrossings,
  closedOnArrival,
  leadFindings,
  paceOver,
  timedEntryConflicts,
  walkingSavedKm,
  type DayPath,
  type Finding,
  type HoursFact,
} from "@shared/optimizer-lead";
import { factPointsForTrip, factsForTrip } from "./content-facts/place-facts.service";
import { storage } from "../storage";
import { legUnreachableFinding, unreachableStops } from "@shared/leg-reachability";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoOf(v: unknown): string | null {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export async function loadOptimizerFindings(tripId: string): Promise<{ findings: Finding[]; hasPricedItems: boolean }> {
  const [trip] = await db.select({ startDate: trips.startDate }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const start = isoOf(trip?.startDate);
  const rows = await db
    .select({
      id: itineraryItems.id,
      title: itineraryItems.title,
      dayNumber: itineraryItems.dayNumber,
      startTime: itineraryItems.startTime,
      endTime: itineraryItems.endTime,
      sortOrder: itineraryItems.sortOrder,
      lat: itineraryItems.latitude,
      lng: itineraryItems.longitude,
      origin: itineraryItems.origin,
      locationName: itineraryItems.locationName,
      locationAddress: itineraryItems.locationAddress,
      itemType: itineraryItems.itemType,
      durationMinutes: itineraryItems.durationMinutes,
      providerServiceId: itineraryItems.providerServiceId,
      bookingId: itineraryItems.bookingId,
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.startTime), asc(itineraryItems.sortOrder));
  const items = rows.filter((r) => r.dayNumber != null && r.itemType !== "accommodation");

  // a. stored hours, each with its own checkedAt. A hard closure counts only from an OFFICIAL source
  // (R-p): a non-Places fact the registry may publish.
  const facts = await factsForTrip(tripId);
  const hours = new Map<string, HoursFact>();
  for (const [itemId, list] of Object.entries(facts)) {
    const h = list.find((f) => f.factType === "hours");
    const desc = (h?.value as any)?.weekdayDescriptions;
    if (!h || !Array.isArray(desc)) continue;
    hours.set(itemId, {
      weekdayDescriptions: desc.map(String),
      checkedAt: h.checkedAt ?? null,
      official: h.origin !== "places_api" && h.publishable === true,
    });
  }
  const timed = items.map((r) => ({
    id: r.id,
    dayNumber: r.dayNumber!,
    dateIso: start ? addDays(start, r.dayNumber! - 1) : null,
    startTime: r.startTime ?? null,
  }));

  // b. the plan's anchors against its timed items — the validate-schedule rule.
  const anchors = await storage.getTemporalAnchors(tripId);
  const scheduled = items.map((r) => ({
    title: r.title,
    dayNumber: r.dayNumber,
    date: start ? addDays(start, r.dayNumber! - 1) : null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
  }));

  // c / d. each day's LOCATED stops in the draft's own order (trusted row point, else the live fact).
  const points = await factPointsForTrip(tripId);
  const byDay = new Map<number, DayPath["points"][number][]>();
  for (const r of items) {
    const own = rowCoordinatesTrusted(r as any) && r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
    const p = own && Number.isFinite(own.lat) && Number.isFinite(own.lng) ? own : points.get(r.id) ?? null;
    if (!p) continue;
    const list = byDay.get(r.dayNumber!) ?? [];
    list.push(p);
    byDay.set(r.dayNumber!, list);
  }
  const days: DayPath[] = Array.from(byDay.entries()).map(([dayNumber, pts]) => ({ dayNumber, points: pts }));

  // e. the plan's own energy verdicts.
  const energy = await storage.getEnergyTracking(tripId);

  // f. reachability: the plan's OWN legs (the rows the traveler sees) against its own times. Step 9a
  // (ledger `2026-10-07-step9a-routing-engine`): the same read rule as the plan — on a routed plan its
  // engine legs count, so the paid lead says how many legs don't fit.
  const legs = await tripLegsShown(tripId);
  const reach = unreachableStops(
    items.map((r) => ({ id: r.id, title: r.title, dayNumber: r.dayNumber, startTime: r.startTime, endTime: r.endTime, durationMinutes: r.durationMinutes ?? null })),
    // Step 9b (L9 as amended, D4 — ledger `2026-10-07-step9b-optimizer-and-rechecks`): each leg says
    // whether its minutes are routed, through the ONE `legIsRouted`; the finding drops "est." only
    // when every leg it counts is.
    legs.map((l: any) => ({ id: l.id, dayNumber: l.dayNumber, fromActivityId: l.fromActivityId, toActivityId: l.toActivityId, estimatedDurationMinutes: l.estimatedDurationMinutes, routed: legIsRouted(l) })),
  );

  const findings = leadFindings([
    legUnreachableFinding(reach.unreachable),
    closedOnArrival(timed, hours, start),
    timedEntryConflicts(anchors as any, scheduled),
    cityCrossings(days),
    walkingSavedKm(days),
    paceOver(energy.map((e) => ({ dayNumber: e.dayNumber, recoveryNeeded: e.recoveryNeeded ?? null }))),
  ]);
  // A PRICED item is one carrying a real price: a catalog listing or a booking — never an AI draft's
  // estimated cost, which is a guess, not a price (§13).
  const hasPricedItems = items.some((r) => !!r.providerServiceId || !!r.bookingId);
  return { findings, hasPricedItems };
}
