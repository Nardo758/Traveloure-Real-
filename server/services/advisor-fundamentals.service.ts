/**
 * Advisor Fundamentals (Workstation Advisor tab, decision-maker-ratified check list, Aug 9 2026).
 * Deterministic, rules-only checks over a trip's itinerary_items (+ transport_legs /
 * service_bookings where noted) — no AI, no invented facts (§13). A check with insufficient data
 * is OMITTED with a reason, never guessed.
 *
 * `Coord`/`parseCoord`/`LODGING_PATTERN`/`isLodgingShaped` are EXTRACTED here (not duplicated) —
 * `server/routes/advisor.routes.ts` imports them from this module for its own route-efficiency /
 * stay-anchor computations, so there is exactly one definition of "located" and one definition of
 * "lodging-shaped" in the advisor lane.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips, transportLegs, providerServices, serviceCategories, serviceBookings } from "@shared/schema";
import { parseActivityTimeToMinutes } from "../utils/itinerary-time";

// ─── Geometry / lodging predicates (extracted — the single definitions the advisor lane shares) ──

export interface Coord {
  lat: number;
  lng: number;
}

/** Finite, in-range, non-(0,0) coordinate — the LOCATED-item predicate the advisor lane shares. */
export function parseCoord(latRaw: unknown, lngRaw: unknown): Coord | null {
  if (latRaw === null || latRaw === undefined || lngRaw === null || lngRaw === undefined) return null;
  const lat = parseFloat(String(latRaw));
  const lng = parseFloat(String(lngRaw));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // Null Island — never a real located item
  return { lat, lng };
}

// §16 funnel doctrine: platform inventory only. Grepped real data before writing this: no
// serviceType value is literally "hotel"/"lodging" today, so this matches the same words the
// /api/search/experiences category bridge (shared/constants/providerCategories.ts) uses against
// serviceType AND the joined service_categories name/slug, PLUS `productShape = 'property'`
// (migration 153) — the structural marker for an accommodation storefront listing. No value is
// invented to make this match; an empty result is honestly empty (§13).
export const LODGING_PATTERN = /hotel|lodg|accommodat|resort|hostel|\binn\b/i;

export function isLodgingShaped(row: {
  serviceType: string | null;
  productShape: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}): boolean {
  if (row.productShape === "property") return true;
  if (row.serviceType && LODGING_PATTERN.test(row.serviceType)) return true;
  if (row.categoryName && LODGING_PATTERN.test(row.categoryName)) return true;
  if (row.categorySlug && LODGING_PATTERN.test(row.categorySlug)) return true;
  return false;
}

// Food-shaped item predicate — stated once, reused by every check that needs it.
const FOOD_RE = /restaurant|dining|dinner|lunch|breakfast|brunch|caf[eé]|bistro|eatery|\bfood\b|kaiseki|izakaya/i;
function isFoodItem(item: { itemType: string | null; title: string | null; description: string | null }): boolean {
  if (item.itemType === "meal" || item.itemType === "restaurant" || item.itemType === "dining") return true;
  if (item.title && FOOD_RE.test(item.title)) return true;
  if (item.description && FOOD_RE.test(item.description)) return true;
  return false;
}

// Transport/arrival-shaped item predicate — stated once. itemType 'transport' is the ONLY
// enum-real value (itineraryItemTypeEnum, shared/schema.ts); 'flight'/'transfer' never occur as a
// stored itemType, so they are matched via the title/description regex instead, per spec.
const TRANSPORT_RE = /flight|transfer|shuttle|\btaxi\b|\btrain\b|airport|arrival|departure/i;
function isTransportItem(item: { itemType: string | null; title: string | null; description: string | null }): boolean {
  if (item.itemType === "transport" || item.itemType === "flight" || item.itemType === "transfer") return true;
  if (item.title && TRANSPORT_RE.test(item.title)) return true;
  if (item.description && TRANSPORT_RE.test(item.description)) return true;
  return false;
}

// ─── Public contract ───────────────────────────────────────────────────────────────────────────

export type FundamentalsTier = 1 | 2 | 3;
export type FundamentalsCta = "stays" | "editor" | "distribute";

export interface FundamentalsCheck {
  key: string;
  tier: FundamentalsTier;
  dayNumber?: number;
  message: string;
  cta?: FundamentalsCta;
  data?: Record<string, unknown>;
}

export interface FundamentalsOmission {
  key: string;
  reason: string;
}

export interface AdvisorFundamentalsResult {
  checks: FundamentalsCheck[];
  omitted: FundamentalsOmission[];
  tripDays: number;
}

interface FundamentalsItem {
  id: string;
  dayNumber: number;
  sortOrder: number | null;
  title: string;
  description: string | null;
  itemType: string | null;
  latitude: string | null;
  longitude: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  energyLevel: string | null;
  providerServiceId: string | null;
  bookingId: string | null;
  expertNote: string | null;
}

/** minutes-since-midnight, or null when unparseable/absent (adapts the shared +Infinity-sentinel
 *  parser back to the "insufficient data" null contract this file's checks want — same adaptation
 *  transport-gap.service.ts already makes). */
function minutesOf(t: string | null | undefined): number | null {
  const m = parseActivityTimeToMinutes(t);
  return Number.isFinite(m) ? m : null;
}

export async function computeAdvisorFundamentals(tripId: string): Promise<AdvisorFundamentalsResult> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) {
    // Caller (the route) is expected to have already 404'd on a missing trip via the
    // authorization gate's own lookup; this is a defensive fallback, never reached in practice.
    return { checks: [], omitted: [{ key: "trip", reason: "trip not found" }], tripDays: 0 };
  }

  const rawItems = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(itineraryItems.dayNumber, itineraryItems.sortOrder);

  const items: FundamentalsItem[] = rawItems.map((it) => ({
    id: it.id,
    dayNumber: it.dayNumber,
    sortOrder: it.sortOrder,
    title: it.title,
    description: it.description,
    itemType: it.itemType,
    latitude: it.latitude,
    longitude: it.longitude,
    startTime: it.startTime,
    endTime: it.endTime,
    durationMinutes: it.durationMinutes,
    energyLevel: it.energyLevel,
    providerServiceId: it.providerServiceId,
    bookingId: it.bookingId,
    expertNote: it.expertNote,
  }));

  // tripDays derivation (stated honestly, per-response, in `data` where relevant): the LARGER of
  // (a) the trip's own date span (Math.ceil(end-start) + 1 — the same formula
  // POST /api/trips/:tripId/anchor-suggestions already uses, server/routes/trips.routes.ts) and
  // (b) the highest dayNumber any item actually carries — so an itinerary that already runs past
  // the trip's currently-set dates is never truncated, and a trip with no items yet still gets its
  // real calendar span.
  const maxItemDayNumber = items.length > 0 ? Math.max(...items.map((i) => i.dayNumber)) : 0;
  const start = new Date(trip.startDate as unknown as string);
  const end = new Date(trip.endDate as unknown as string);
  const dateSpanDays = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
    : Math.max(1, maxItemDayNumber);
  const tripDays = Math.max(maxItemDayNumber, dateSpanDays);

  const byDay = new Map<number, FundamentalsItem[]>();
  for (const item of items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list);
  }
  for (const list of Array.from(byDay.values())) {
    list.sort((a: FundamentalsItem, b: FundamentalsItem) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
  }

  const checks: FundamentalsCheck[] = [];
  const omitted: FundamentalsOmission[] = [];

  // ── Tier 1 ──────────────────────────────────────────────────────────────────────────────────

  // no_stay: a multi-day trip with no lodging-shaped item AND no non-cancelled service_bookings
  // row (joined via serviceId → provider_services) that is itself lodging-shaped. LogBookingForm
  // (the Workstation's "log a completed off-platform booking" affordance) writes an itinerary
  // ITEM, not a service_bookings row (audited: server/routes/trips.routes.ts's
  // POST /api/trips/:tripId/itinerary-items is its only write path) — so a logged hotel booking is
  // already covered by the item-title/itemType check below; the service_bookings join covers the
  // separate case of a REAL platform checkout for lodging.
  if (tripDays >= 2) {
    const hasLodgingItem = items.some(
      (i) => i.itemType === "accommodation" || LODGING_PATTERN.test(i.title || "") || (i.description ? LODGING_PATTERN.test(i.description) : false),
    );
    let hasLodgingBooking = false;
    if (!hasLodgingItem) {
      const bookingRows = await db
        .select({
          serviceType: providerServices.serviceType,
          productShape: providerServices.productShape,
          categoryName: serviceCategories.name,
          categorySlug: serviceCategories.slug,
        })
        .from(serviceBookings)
        .innerJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
        .leftJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
        .where(and(eq(serviceBookings.tripId, tripId), ne(serviceBookings.status, "cancelled")));
      hasLodgingBooking = bookingRows.some((r) => isLodgingShaped(r));
    }
    if (!hasLodgingItem && !hasLodgingBooking) {
      checks.push({
        key: "no_stay",
        tier: 1,
        message: `This ${tripDays}-day trip has no lodging on the plan yet.`,
        cta: "stays",
      });
    }
  }

  // empty_day: any dayNumber in [1..tripDays] with zero items.
  for (let d = 1; d <= tripDays; d++) {
    if (!byDay.has(d) || byDay.get(d)!.length === 0) {
      checks.push({
        key: "empty_day",
        tier: 1,
        dayNumber: d,
        message: `Day ${d} has no items yet.`,
        cta: "editor",
        data: { tripDaysDerivation: tripDays === maxItemDayNumber ? "max_item_day" : "date_span" },
      });
    }
  }

  // unroutable_items: same "located" predicate the routing-blocked card uses (parseCoord),
  // computed server-side. One trip-level entry with the count and titles.
  const unrouted = items.filter((i) => parseCoord(i.latitude, i.longitude) === null);
  if (unrouted.length > 0) {
    checks.push({
      key: "unroutable_items",
      tier: 1,
      message: `${unrouted.length} item${unrouted.length === 1 ? "" : "s"} can't be routed because ${unrouted.length === 1 ? "it has" : "they have"} no location set.`,
      cta: "editor",
      data: {
        count: unrouted.length,
        items: unrouted.map((i) => ({ id: i.id, dayNumber: i.dayNumber, title: i.title })),
      },
    });
  }

  // ── Tier 2 ──────────────────────────────────────────────────────────────────────────────────

  // no_meals_day: a day with >=2 non-food items and zero food items.
  for (let d = 1; d <= tripDays; d++) {
    const dayItems = byDay.get(d) ?? [];
    if (dayItems.length === 0) continue;
    const foodCount = dayItems.filter(isFoodItem).length;
    const nonFoodCount = dayItems.length - foodCount;
    if (nonFoodCount >= 2 && foodCount === 0) {
      checks.push({
        key: "no_meals_day",
        tier: 2,
        dayNumber: d,
        message: `Day ${d} has ${nonFoodCount} activities planned but no meals.`,
      });
    }
  }

  // no_arrival_departure: day 1 missing an arrival-shaped item AND/OR the last day missing a
  // departure-shaped item. ONE trip-level entry naming which end(s) are missing.
  {
    const day1Items = byDay.get(1) ?? [];
    const lastDayItems = byDay.get(tripDays) ?? [];
    const hasArrival = day1Items.some(isTransportItem);
    const hasDeparture = lastDayItems.some(isTransportItem);
    const missing: string[] = [];
    if (!hasArrival) missing.push("arrival");
    if (!hasDeparture) missing.push("departure");
    if (missing.length > 0) {
      const parts: string[] = [];
      if (!hasArrival) parts.push(`no arrival transport logged for Day 1`);
      if (!hasDeparture) parts.push(`no departure transport logged for the last day (Day ${tripDays})`);
      checks.push({
        key: "no_arrival_departure",
        tier: 2,
        message: `This trip has ${parts.join(" and ")}.`,
        data: { missing },
      });
    }
  }

  // transport_gap_day: reuse the EXISTING transport-gap machinery (server/services/transport-gap.service.ts)
  // — one entry per day that has flagged (non-skipped) gap pairs, with the gap count. The
  // "insufficient_data" skips that engine reports are NOT gaps and are deliberately not surfaced
  // here (they are the engine's own honest omission, not a fundamentals finding).
  {
    const { analyzeTransportGaps } = await import("./transport-gap.service");
    const gapAnalysis = await analyzeTransportGaps(tripId);
    for (const day of gapAnalysis.days) {
      if (day.pairs.length > 0) {
        checks.push({
          key: "transport_gap_day",
          tier: 2,
          dayNumber: day.dayNumber,
          message: `Day ${day.dayNumber} has ${day.pairs.length} transport gap${day.pairs.length === 1 ? "" : "s"} between stops.`,
          data: { gapCount: day.pairs.length },
        });
      }
    }
  }

  // overloaded_day: a day with >=7 items.
  const OVERLOAD_THRESHOLD = 7;
  for (let d = 1; d <= tripDays; d++) {
    const count = (byDay.get(d) ?? []).length;
    if (count >= OVERLOAD_THRESHOLD) {
      checks.push({
        key: "overloaded_day",
        tier: 2,
        dayNumber: d,
        message: `Day ${d} has ${count} stops — most days work best under ${OVERLOAD_THRESHOLD}.`,
        data: { count, threshold: OVERLOAD_THRESHOLD },
      });
    }
  }

  // time_conflict: two items on the same day where both carry a real startTime AND endTime and
  // the intervals overlap. Entry per conflicting pair, capped at 5.
  {
    const TIME_CONFLICT_CAP = 5;
    let hitCap = false;
    outer: for (let d = 1; d <= tripDays; d++) {
      const dayItems = byDay.get(d) ?? [];
      const timed = dayItems
        .map((i) => ({ item: i, s: minutesOf(i.startTime), e: minutesOf(i.endTime) }))
        .filter((x): x is { item: FundamentalsItem; s: number; e: number } => x.s !== null && x.e !== null);
      for (let i = 0; i < timed.length; i++) {
        for (let j = i + 1; j < timed.length; j++) {
          const a = timed[i];
          const b = timed[j];
          if (a.s < b.e && b.s < a.e) {
            if (checks.filter((c) => c.key === "time_conflict").length >= TIME_CONFLICT_CAP) {
              hitCap = true;
              break outer;
            }
            checks.push({
              key: "time_conflict",
              tier: 2,
              dayNumber: d,
              message: `Day ${d}: "${a.item.title}" (${a.item.startTime}–${a.item.endTime}) overlaps with "${b.item.title}" (${b.item.startTime}–${b.item.endTime}).`,
              data: { itemIds: [a.item.id, b.item.id] },
            });
          }
        }
      }
    }
    if (hitCap) {
      const last = checks.filter((c) => c.key === "time_conflict").pop();
      if (last) last.data = { ...(last.data ?? {}), capped: true, cap: TIME_CONFLICT_CAP };
    }
  }

  // logistics_heavy_day: ONLY when the day has >=2 items with durationMinutes set AND trip-scoped
  // transport_legs rows exist for that day. activityMinutes/(activityMinutes+legMinutes) < 0.6.
  {
    const legs = await db
      .select({ dayNumber: transportLegs.dayNumber, estimatedDurationMinutes: transportLegs.estimatedDurationMinutes })
      .from(transportLegs)
      .where(and(eq(transportLegs.tripId, tripId), isNull(transportLegs.variantId)));
    const legMinutesByDay = new Map<number, number>();
    for (const leg of legs) {
      legMinutesByDay.set(leg.dayNumber, (legMinutesByDay.get(leg.dayNumber) ?? 0) + (leg.estimatedDurationMinutes ?? 0));
    }

    let anyDayQualified = false;
    for (let d = 1; d <= tripDays; d++) {
      const dayItems = byDay.get(d) ?? [];
      const timedItems = dayItems.filter((i) => i.durationMinutes != null);
      const legMinutes = legMinutesByDay.get(d);
      if (timedItems.length < 2 || legMinutes === undefined) continue;
      anyDayQualified = true;
      const activityMinutes = timedItems.reduce((sum, i) => sum + (i.durationMinutes ?? 0), 0);
      const total = activityMinutes + legMinutes;
      const ratio = total > 0 ? activityMinutes / total : 1;
      if (ratio < 0.6) {
        checks.push({
          key: "logistics_heavy_day",
          tier: 2,
          dayNumber: d,
          message: `Day ${d} spends about ${Math.round(ratio * 100)}% of its scheduled time on activities versus travel — most of the day may go to getting around.`,
          data: { activityMinutes, legMinutes, ratio: Math.round(ratio * 1000) / 1000 },
        });
      }
    }
    if (!anyDayQualified) {
      omitted.push({ key: "logistics_heavy_day", reason: "needs item durations and transport legs" });
    }
  }

  // energy_overload: >=3 consecutive items (by in-day position) with energyLevel 'high'/'very_high'.
  {
    const HIGH_ENERGY = new Set(["high", "very_high"]);
    const ENERGY_RUN_THRESHOLD = 3;
    const anyEnergySet = items.some((i) => i.energyLevel != null);
    for (let d = 1; d <= tripDays; d++) {
      const dayItems = byDay.get(d) ?? [];
      let runStart = -1;
      for (let i = 0; i <= dayItems.length; i++) {
        const isHigh = i < dayItems.length && HIGH_ENERGY.has(dayItems[i].energyLevel || "");
        if (isHigh) {
          if (runStart === -1) runStart = i;
        } else {
          if (runStart !== -1) {
            const runLen = i - runStart;
            if (runLen >= ENERGY_RUN_THRESHOLD) {
              checks.push({
                key: "energy_overload",
                tier: 2,
                dayNumber: d,
                message: `Day ${d} has ${runLen} high-energy items in a row starting with "${dayItems[runStart].title}" — travelers may want a breather in between.`,
                data: { runLength: runLen, startItemId: dayItems[runStart].id },
              });
            }
            runStart = -1;
          }
        }
      }
    }
    if (!anyEnergySet && items.length > 0) {
      omitted.push({ key: "energy_overload", reason: "no items on this trip have an energy level set" });
    }
  }

  // ── Tier 3 ──────────────────────────────────────────────────────────────────────────────────

  // unbooked_bookables: items linked to a platform service (providerServiceId) with no booking
  // logged (bookingId IS NULL — migration 159's canonical item↔booking key, stamped only at
  // checkout confirm; see shared/schema.ts's itineraryItems.bookingId comment).
  for (const item of items) {
    if (item.providerServiceId && !item.bookingId) {
      checks.push({
        key: "unbooked_bookables",
        tier: 3,
        dayNumber: item.dayNumber,
        message: `"${item.title}" (Day ${item.dayNumber}) is linked to a bookable service but has no booking logged yet.`,
        data: { itemId: item.id, providerServiceId: item.providerServiceId },
      });
    }
  }

  // no_times_day: a day with >=2 items and zero startTimes.
  for (let d = 1; d <= tripDays; d++) {
    const dayItems = byDay.get(d) ?? [];
    if (dayItems.length >= 2 && dayItems.every((i) => minutesOf(i.startTime) === null)) {
      checks.push({
        key: "no_times_day",
        tier: 3,
        dayNumber: d,
        message: `Day ${d} has ${dayItems.length} items but no start times set.`,
      });
    }
  }

  // distribute_readiness: destination unset, no expertTravelerNote (§21 delivery note), or zero
  // items carrying an expertNote. ONE trip-level entry listing what's missing; only emitted when
  // at least one is missing.
  {
    const missing: string[] = [];
    if (!trip.destination || trip.destination.trim() === "") missing.push("destination");
    if (!trip.expertTravelerNote || trip.expertTravelerNote.trim() === "") missing.push("expert_traveler_note");
    if (!items.some((i) => i.expertNote && i.expertNote.trim() !== "")) missing.push("item_expert_notes");
    if (missing.length > 0) {
      const labels: Record<string, string> = {
        destination: "a destination",
        expert_traveler_note: "a note to the traveler",
        item_expert_notes: "any per-item expert notes",
      };
      checks.push({
        key: "distribute_readiness",
        tier: 3,
        message: `Before distributing this plan, consider adding: ${missing.map((m) => labels[m]).join(", ")}.`,
        cta: "distribute",
        data: { missing },
      });
    }
  }

  // Deterministic ordering: tier, then day (trip-level entries last within a tier), then key.
  checks.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ad = a.dayNumber ?? Number.MAX_SAFE_INTEGER;
    const bd = b.dayNumber ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.key.localeCompare(b.key);
  });

  return { checks, omitted, tripDays };
}
