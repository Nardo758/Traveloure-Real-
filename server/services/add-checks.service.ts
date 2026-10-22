/**
 * AP-1 — save, then say what we checked (decision-maker, Oct 13, 2026; ledger `2026-10-13-ap1-save-then-warn`).
 *
 *   startHandAddLookup  ONE Places lookup for a stop the traveler just added on the slip — fire-and-forget after
 *                       the save, never failing it (§15b). It runs the SAME engine the draft uses
 *                       (`enrichPlanItems`): the Places switch and the named-place gate apply, the result is a
 *                       PF-1 outcome row (trigger `hand_add`), a place whose facts any plan already holds is
 *                       reused at no charge, and a place covered by a stored official hours fact is never billed
 *                       (`official_fact`). The plan's hand-added stops share a daily budget of billed lookups —
 *                       `placesLookupsPerDraft()` per plan per UTC day, counted from the outcome rows — and a stop
 *                       past it is capped (`plan_day_cap`) and reads "Hours not checked for this stop".
 *   loadStopChecks      the per-stop check read: the stop's hours lines and the way into it, with `pending` while
 *                       the lookup or the debounced leg recompute is still arriving.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, placeLookupOutcomes } from "@shared/schema";
import { storage } from "../storage";
import { placesLookupsPerDraft } from "../config/content-facts.config";
import { enrichPlanItems, officialHoursStoredFor, type PlacesCallGate } from "./content-facts/place-facts.service";
import type { SourceAdapter } from "./content-facts/source-adapter";
import { loadStopHoursChecked } from "./optimizer-lead.service";
import { tripGetsRoutedLegs, tripLegsShown } from "./routing/plan-routed-legs.service";
import { legIsRouted, planLegsSkipReason, routedFactsOf } from "./routing/plan-legs";
import { routingAdapter } from "./routing/index";
import { enqueuePlanLegRecompute } from "./routing/plan-legs-queue";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { haversineMeters } from "@shared/geo";
import { normalizeLegMode, straightLineMinutes } from "@shared/travel-speeds";
import { defaultRoutedMode, marketHasTransitCoverage, routedLegLine } from "@shared/routing-engine";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import { ADD_CHECKS_WINDOW_MS, stopChecksPending, stopReach, type StopChecks, type StopHoursCheck } from "@shared/add-checks";

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The billed hand-add lookups this plan has made today (UTC). A row counts when the lookup went past the
 * cache (`cache = 'miss'`) and produced an answer row — conservative: a miss whose ID search found no place
 * spends no money but is counted, so the budget errs toward spending less, never more.
 */
export async function handAddLookupsToday(tripId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(placeLookupOutcomes)
    .where(
      and(
        eq(placeLookupOutcomes.tripId, tripId),
        eq(placeLookupOutcomes.runTrigger, "hand_add"),
        eq(placeLookupOutcomes.cache, "miss"),
        inArray(placeLookupOutcomes.outcome, ["attached", "unmatched", "no_place"]),
        gte(placeLookupOutcomes.runStartedAt, startOfUtcDay(now)),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Test seam: an injected Places adapter (and gate) in place of the live one. */
export interface HandAddLookupDeps {
  adapters?: SourceAdapter[];
  placesGate?: PlacesCallGate;
}

/** Run the one hand-add lookup. Never throws; the caller does not await it. */
export async function startHandAddLookup(tripId: string, itemId: string, deps: HandAddLookupDeps = {}): Promise<void> {
  try {
    const trip = await storage.getTrip(tripId);
    const [item] = await db.select().from(itineraryItems).where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
    if (!trip || !item) return;
    const budget = Math.max(0, placesLookupsPerDraft() - (await handAddLookupsToday(tripId)));
    const city = (trip.destination ?? "").split(",")[0].trim() || null;
    const out = await enrichPlanItems({
      tripId,
      market: (trip as any).marketSlug ?? null,
      city,
      items: [
        {
          id: item.id,
          title: item.title,
          type: item.itemType ?? null,
          dayNumber: item.dayNumber ?? null,
          locationName: item.locationName ?? null,
          googlePlaceId: item.googlePlaceId ?? null,
        },
      ],
      trigger: "hand_add",
      billedBudget: budget,
      billedCapReason: "plan_day_cap",
      officialCovers: officialHoursStoredFor,
      ...(deps.adapters ? { adapters: deps.adapters } : {}),
      ...(deps.placesGate ? { placesGate: deps.placesGate } : {}),
    });
    // A lookup that attached facts may have given the stop its point — let the leg engine see it (debounced).
    if (out.recorded > 0) enqueuePlanLegRecompute(tripId);
  } catch (err) {
    console.error(`[add-checks] hand-add lookup failed plan_id=${tripId} item_id=${itemId}:`, (err as Error)?.message ?? err);
  }
}

/** Has a lookup run reported on this item since it was saved? */
async function lookupReported(tripId: string, itemId: string, since: Date): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(placeLookupOutcomes)
    .where(and(eq(placeLookupOutcomes.tripId, tripId), eq(placeLookupOutcomes.itineraryItemId, itemId), gte(placeLookupOutcomes.runStartedAt, since)));
  return Number(row?.n ?? 0) > 0;
}

/** The per-stop check read. null = no such stop on this plan. Read behind the caller's own plan gate. */
export async function loadStopChecks(tripId: string, itemId: string, now: Date = new Date()): Promise<StopChecks | null> {
  const trip = await storage.getTrip(tripId);
  if (!trip) return null;
  const [item] = await db
    .select({ id: itineraryItems.id, createdAt: itineraryItems.createdAt, dayNumber: itineraryItems.dayNumber })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
    .limit(1);
  if (!item) return null;
  const savedAt = item.createdAt ? new Date(item.createdAt as any) : now;
  const withinWindow = now.getTime() - savedAt.getTime() < ADD_CHECKS_WINDOW_MS;

  // Hours — the findings' own lines for this stop, and each one's fix (row 124: the plan check narrowed to this stop,
  // so a closed date is checked whether or not the stop states a time).
  const h = await loadStopHoursChecked(tripId, itemId);
  let hours: StopHoursCheck;
  if (h.checked) hours = { status: "checked", lines: h.lines, ...(h.caveat ? { caveat: h.caveat } : {}), ...(h.fixes.length ? { fixes: h.fixes } : {}) };
  else if (!h.hasTime) hours = { status: "no_time" };
  else if (withinWindow && !(await lookupReported(tripId, itemId, savedAt))) hours = { status: "pending" };
  else hours = { status: "not_checked" };

  // Reach — the stop before this one that day, in the engine's own order and with the engine's own points.
  const { loadPlanLegContext } = await import("./routing/plan-legs-engine.service");
  const [ctx, routedPlan, legs] = await Promise.all([loadPlanLegContext(tripId, trip), tripGetsRoutedLegs(tripId), tripLegsShown(tripId)]);
  const day = ctx.stops.filter((s) => s.dayNumber === item.dayNumber && !(ctx.stay && s.id === ctx.stay.id));
  const idx = day.findIndex((s) => s.id === itemId);
  const self = idx >= 0 ? day[idx] : null;
  const prev = idx > 0 ? day[idx - 1] : null;
  let reach: StopChecks["reach"] = null;
  if (self && prev) {
    const shown = (legs as any[]).find((l) => l.dayNumber === item.dayNumber && l.fromActivityId === prev.id && l.toActivityId === itemId) ?? null;
    let leg: Parameters<typeof stopReach>[0]["leg"] = null;
    if (shown && Number(shown.estimatedDurationMinutes) > 0) {
      const mode = normalizeLegMode(shown.userSelectedMode ?? shown.selectedMode ?? shown.recommendedMode ?? null);
      const facts = legIsRouted(shown) ? routedFactsOf(shown) : null;
      const minutes = Number(shown.estimatedDurationMinutes);
      const routedLine =
        facts && mode
          ? routedLegLine(
              { mode: mode as any, route: { durationMin: minutes, distanceM: Number(shown.distanceMeters ?? 0), line: facts.line, fare: facts.fare, provenance: facts.provenance } as any },
              trip.timezone ?? null,
            )
          : null;
      leg = { routedLine, minutes, mode };
    }
    const origin = prev.exitPoint ?? prev.point;
    let straight: Parameters<typeof stopReach>[0]["straight"] = null;
    if (!routedPlan && origin && self.point) {
      const meters = haversineMeters(origin.lat, origin.lng, self.point.lat, self.point.lng);
      const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[String((trip as any).marketSlug ?? "").toLowerCase()];
      // The engine's own default mode for the pair (walk ≤ 1.2 km, else transit where the market has it).
      const mode = normalizeLegMode(defaultRoutedMode(origin, self.point, marketHasTransitCoverage(profile?.availableModes))) ?? "walk";
      straight = { minutes: straightLineMinutes(meters, mode), mode };
    }
    const skip = routedPlan
      ? planLegsSkipReason({ engineOn: !!routingAdapter(), qualifies: true, tripExists: true, datesConfirmed: planDatesAreConfirmed((trip as any).datesConfirmedAt ?? null) })
      : null;
    reach = stopReach({
      routedPlan,
      skip,
      prev: { title: prev.name, located: !!prev.point },
      self: { title: self.name, located: !!self.point },
      leg,
      straight,
      withinWindow,
    });
  }
  const checks = { itemId, hours, reach, routedPlan };
  return { ...checks, pending: stopChecksPending(checks) };
}

/**
 * What the item POST runs after a slip add has been SAVED (the monolith route calls this and nothing else, so a
 * test proves the same sequence): start the lookup unawaited, then answer the first check read. Never throws.
 */
export async function addChecksAfterSave(tripId: string, itemId: string, deps: HandAddLookupDeps = {}): Promise<{ lookup: Promise<void>; checks: StopChecks | null }> {
  const lookup = startHandAddLookup(tripId, itemId, deps);
  const checks = await loadStopChecksSafe(tripId, itemId);
  return { lookup, checks };
}

/** Never throws: the POST response's `addChecks` is additive, so a failed read leaves it out. */
export async function loadStopChecksSafe(tripId: string, itemId: string): Promise<StopChecks | null> {
  try {
    return await loadStopChecks(tripId, itemId);
  } catch (err) {
    console.error(`[add-checks] check read failed plan_id=${tripId} item_id=${itemId}:`, (err as Error)?.message ?? err);
    return null;
  }
}
