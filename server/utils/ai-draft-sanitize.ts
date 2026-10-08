/**
 * R-w — the ONE storage-time pass over a generated draft (ledger `2026-10-03-rw-ai-place-text`).
 * PURE. Called by `saveGeneratedItinerarySnapshot` for every caller (the free draft, the Grok
 * generate route, the Plus occasion scheduler), so the item rows AND the stored draft JSON
 * (`ai_generated_itineraries`) are cleaned by the same rules before either is written — the
 * "payload, not just the page" half of R-w.
 *
 * Rules (all from `@shared/ai-place-text`, never restated here):
 *   · every location → its ward/area, with brand / hotel / "various locations" segments dropped;
 *     nothing left ⇒ EMPTY, never the plan's city (a venue-less item is a supply slot, not a stop
 *     in the middle of town);
 *   · every description, tip, theme, summary and travel tip → sentences naming a brand or a hotel
 *     are dropped;
 *   · NO PLACE TO STAY (`noLodging`) additionally: no item, meal or leg that mentions lodging at
 *     all, no lodging sentence anywhere, and no accommodation suggestions.
 */
import {
  mentionsLodging,
  namesABrand,
  namesAHotel,
  namesAnEvent,
  reduceUncoveredEvent,
  sanitizeAiLocation,
  sanitizeAiProse,
  type CoveringEvent,
} from "@shared/ai-place-text";
import { normalizedTravelLineTitle } from "@shared/draft-basis";
import type { NormalizedGeneratedCanonicalItem } from "./generated-itinerary";

export interface AiDraftSanitizeOptions {
  /** The traveler has no place to stay ("Draft without a place to stay"). */
  noLodging: boolean;
  /** The plan's destination — its city is kept as an area wherever it appears in a location. */
  city?: string | null;
  /**
   * S9-8: the R-p event facts that COVER the trip's dates (already filtered by the caller). A title
   * naming a festival / matsuri / event not among them is reduced to its non-event fallback, else a
   * supply slot. Absent ⇒ none cover the dates ⇒ every event-named title is reduced.
   */
  coveringEvents?: readonly CoveringEvent[];
}

/** S9-8: one drafted item's title and place, with an uncovered event reduced. */
function reduceEventItem<T extends { title?: unknown; name?: unknown; location?: unknown; description?: unknown }>(it: T, o: AiDraftSanitizeOptions): T {
  const title = String(it.title ?? it.name ?? "");
  const r = reduceUncoveredEvent(title, o.coveringEvents ?? []);
  if (!r.reduced) return it;
  const out: any = { ...it };
  if ("title" in out || !("name" in out)) out.title = r.title;
  if ("name" in out) out.name = r.title;
  // Event sentences go with the event name; a supply slot keeps no place and no prose about one.
  const desc = typeof out.description === "string" ? out.description : "";
  out.description = r.supplySlot ? "" : desc.split(/(?<=[.!?])\s+/).filter((x: string) => !namesAnEvent(x)).join(" ").trim();
  if (r.supplySlot) {
    out.location = "";
    for (const k of ["latitude", "longitude", "lat", "lng", "coordinates"]) if (k in out) out[k] = null;
  }
  return out as T;
}

/**
 * Step 6 (R-aa/R-w on every drafting path): a day's activities from a path that does not go through
 * the snapshot writer (the trip generate route), with each uncovered event-named title reduced by the
 * SAME rule. `locationName` is read and written as the place.
 */
export function reduceUncoveredEventActivities<T extends Record<string, any>>(activities: readonly T[], coveringEvents: readonly CoveringEvent[]): T[] {
  return activities.map((a) => {
    const r: any = reduceEventItem({ ...a, location: a.locationName ?? a.location }, { noLodging: false, coveringEvents });
    const out: any = { ...r };
    if ("locationName" in a) out.locationName = r.location;
    if (!("location" in a)) delete out.location;
    return out as T;
  });
}

/** A title that must not be stored as an item: it names a hotel, or (no lodging) mentions one. */
function dropTitle(title: unknown, o: AiDraftSanitizeOptions): boolean {
  const t = String(title ?? "");
  return namesAHotel(t) || namesABrand(t) || (o.noLodging && mentionsLodging(t));
}

export function sanitizeCanonicalItems(
  items: readonly NormalizedGeneratedCanonicalItem[],
  o: AiDraftSanitizeOptions,
): NormalizedGeneratedCanonicalItem[] {
  const lastDay = items.reduce((m, it) => Math.max(m, Number(it.dayNumber) || 0), 0);
  return items
    .filter((it) => !dropTitle(it.title, o))
    .map((it) => {
      // Ledger `2026-10-08-arrival-title-normalized`: the plan's own travel line stores our wording.
      const title = normalizedTravelLineTitle(String(it.title ?? ""), o.city, Number(it.dayNumber), lastDay);
      return reduceEventItem(
        {
          ...it,
          ...(title !== it.title ? { title, name: title } : {}),
          location: sanitizeAiLocation(it.location, o.city) ?? "",
          description: sanitizeAiProse(it.description, o) ?? "",
        },
        o,
      );
    });
}

/**
 * Ledger `2026-10-08-arrival-title-normalized`: a day list's travel lines (day 1's arrival, the last
 * day's departure) store our own wording. Reads and writes `title` and/or `name`, whichever the
 * activity carries; the day number is the day's `day`/`dayNumber`, else its 1-based position.
 */
export function withNormalizedTravelTitles<D extends Record<string, any>>(days: readonly D[], destination: string | null | undefined): D[] {
  const dayNum = (d: any, i: number) => Number(d?.day ?? d?.dayNumber) || i + 1;
  const lastDay = days.reduce((m, d, i) => Math.max(m, dayNum(d, i)), 0);
  return days.map((d, i) => {
    if (!Array.isArray(d?.activities)) return d;
    const n = dayNum(d, i);
    return {
      ...d,
      activities: d.activities.map((a: any) => {
        const before = String(a?.title ?? a?.name ?? "");
        const title = normalizedTravelLineTitle(before, destination, n, lastDay);
        if (title === before) return a;
        const out: any = { ...a };
        if ("title" in out || !("name" in out)) out.title = title;
        if ("name" in out) out.name = title;
        return out;
      }),
    };
  });
}

function cleanActivity(a: any, o: AiDraftSanitizeOptions): any {
  const out: any = { ...a, location: sanitizeAiLocation(a?.location, o.city) ?? "" };
  for (const k of ["description", "tips"] as const) {
    if (k in out) out[k] = sanitizeAiProse(out[k], o) ?? "";
  }
  return reduceEventItem(out, o);
}

function mealMentions(m: any, o: AiDraftSanitizeOptions): boolean {
  const text = [m?.suggestion, m?.name, m?.location, m?.description].filter(Boolean).join(" ");
  return namesAHotel(text) || namesABrand(text) || (o.noLodging && mentionsLodging(text));
}

function legMentions(l: any, o: AiDraftSanitizeOptions): boolean {
  const text = [l?.from, l?.to].filter(Boolean).join(" ");
  return namesAHotel(text) || namesABrand(text) || (o.noLodging && mentionsLodging(text));
}

/** The stored draft JSON (`generatedPlan`), cleaned by the same rules as the rows. */
export function sanitizeGeneratedPlan<T extends Record<string, any>>(plan: T, o: AiDraftSanitizeOptions): T {
  const days = withNormalizedTravelTitles(Array.isArray(plan.itineraryData) ? plan.itineraryData : [], o.city);
  const itineraryData = days.map((d: any) => ({
    ...d,
    ...(typeof d?.theme === "string" ? { theme: sanitizeAiProse(d.theme, o) ?? "" } : {}),
    ...(Array.isArray(d?.activities)
      ? { activities: d.activities.filter((a: any) => !dropTitle(a?.name ?? a?.title, o)).map((a: any) => cleanActivity(a, o)) }
      : {}),
    ...(Array.isArray(d?.meals) ? { meals: d.meals.filter((m: any) => !mealMentions(m, o)) } : {}),
    ...(Array.isArray(d?.transportation) ? { transportation: d.transportation.filter((l: any) => !legMentions(l, o)) } : {}),
  }));
  const out: Record<string, any> = { ...plan, itineraryData };
  if (typeof plan.summary === "string") out.summary = sanitizeAiProse(plan.summary, o) ?? "";
  if (Array.isArray(plan.travelTips)) {
    out.travelTips = plan.travelTips.map((t: unknown) => sanitizeAiProse(String(t ?? ""), o)).filter((t: string | null): t is string => !!t);
  }
  if (o.noLodging) out.accommodationSuggestions = [];
  return out as T;
}
