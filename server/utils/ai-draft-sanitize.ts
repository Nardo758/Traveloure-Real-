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
 *   · LG-2 Ask 9 (ledger `2026-10-18-lg2-banned-phrases`; rules in `@shared/banned-copy`): a title carrying a
 *     banned phrase is reworded, and one left with nothing and no place name is not stored (left for
 *     regeneration); a description or tip sentence carrying one is dropped;
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
import { dropBannedSentences, rewordBannedTitle } from "@shared/banned-copy";
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
  /**
   * LG-2 Ask 9: incremented once per item NOT STORED because the banned-phrase rule emptied its title and it had no
   * place name (left for regeneration). The caller logs it; counts only. Absent ⇒ not counted.
   */
  drops?: BannedCopyDrops;
}

/** The count of items the banned-phrase rule left for regeneration (decision-maker, Oct 18, 2026). */
export interface BannedCopyDrops {
  bannedTitleNoPlace: number;
}
export function newBannedCopyDrops(): BannedCopyDrops {
  return { bannedTitleNoPlace: 0 };
}
/** The one log line for the count; says nothing when nothing was dropped. */
export function logBannedCopyDrops(path: string, drops: BannedCopyDrops): void {
  if (drops.bannedTitleNoPlace > 0) {
    console.info(`[banned-copy] ${path}: ${drops.bannedTitleNoPlace} item(s) not stored — title emptied by the banned-phrase rule, no place name`);
  }
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
 * LG-2 Ask 9: one item's title reworded and its description/tips cleaned of banned phrases (`@shared/banned-copy`),
 * or `null` when the title is left with nothing and the item has no place name — left for regeneration, never a
 * placeholder phrase. Reads and writes `title` and/or `name`, whichever the item carries.
 */
function withoutBannedCopy<T extends Record<string, any>>(it: T, place: unknown, drops?: BannedCopyDrops): T | null {
  const before = String(it.title ?? it.name ?? "");
  const title = rewordBannedTitle(before, typeof place === "string" ? place : null);
  if (title === null) {
    if (drops) drops.bannedTitleNoPlace += 1;
    return null;
  }
  const out: any = { ...it };
  if (title !== before) {
    if ("title" in out || !("name" in out)) out.title = title;
    if ("name" in out) out.name = title;
  }
  for (const k of ["description", "tips"] as const) {
    if (typeof out[k] === "string") out[k] = dropBannedSentences(out[k]);
  }
  return out as T;
}

/**
 * Step 6 (R-aa/R-w on every drafting path): a day's activities from a path that does not go through
 * the snapshot writer (the trip generate route), with each uncovered event-named title reduced by the
 * SAME rule. `locationName` is read and written as the place.
 */
export function reduceUncoveredEventActivities<T extends Record<string, any>>(
  activities: readonly T[],
  coveringEvents: readonly CoveringEvent[],
  drops?: BannedCopyDrops,
): T[] {
  return activities.flatMap((a) => {
    const r: any = reduceEventItem({ ...a, location: a.locationName ?? a.location }, { noLodging: false, coveringEvents });
    // LG-2 Ask 9: this path skips the snapshot writer, so it takes the banned-phrase rule here too.
    const cleaned: any = withoutBannedCopy(r, r.location, drops);
    if (!cleaned) return [];
    const out: any = { ...cleaned };
    if ("locationName" in a) out.locationName = cleaned.location;
    if (!("location" in a)) delete out.location;
    return [out as T];
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
      const reduced = reduceEventItem(
        {
          ...it,
          ...(title !== it.title ? { title, name: title } : {}),
          location: sanitizeAiLocation(it.location, o.city) ?? "",
          description: sanitizeAiProse(it.description, o) ?? "",
        },
        o,
      );
      return withoutBannedCopy(reduced, reduced.location, o.drops);
    })
    .filter((it): it is NormalizedGeneratedCanonicalItem => it !== null);
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
  const reduced = reduceEventItem(out, o);
  return withoutBannedCopy(reduced, reduced.location, o.drops);
}

function mealMentions(m: any, o: AiDraftSanitizeOptions): boolean {
  const text = [m?.suggestion, m?.name, m?.location, m?.description].filter(Boolean).join(" ");
  return namesAHotel(text) || namesABrand(text) || (o.noLodging && mentionsLodging(text));
}

function legMentions(l: any, o: AiDraftSanitizeOptions): boolean {
  const text = [l?.from, l?.to].filter(Boolean).join(" ");
  return namesAHotel(text) || namesABrand(text) || (o.noLodging && mentionsLodging(text));
}

/**
 * The stored draft JSON (`generatedPlan`), cleaned by the same rules as the rows. It never counts `drops`: the JSON
 * holds the same items as the rows, which are counted once by `sanitizeCanonicalItems`.
 */
export function sanitizeGeneratedPlan<T extends Record<string, any>>(plan: T, opts: AiDraftSanitizeOptions): T {
  const o: AiDraftSanitizeOptions = { ...opts, drops: undefined };
  const days = withNormalizedTravelTitles(Array.isArray(plan.itineraryData) ? plan.itineraryData : [], o.city);
  const itineraryData = days.map((d: any) => ({
    ...d,
    ...(typeof d?.theme === "string" ? { theme: dropBannedSentences(sanitizeAiProse(d.theme, o) ?? "") } : {}),
    ...(Array.isArray(d?.activities)
      ? { activities: d.activities.filter((a: any) => !dropTitle(a?.name ?? a?.title, o)).map((a: any) => cleanActivity(a, o)).filter((a: any) => a !== null) }
      : {}),
    ...(Array.isArray(d?.meals) ? { meals: d.meals.filter((m: any) => !mealMentions(m, o)) } : {}),
    ...(Array.isArray(d?.transportation) ? { transportation: d.transportation.filter((l: any) => !legMentions(l, o)) } : {}),
  }));
  const out: Record<string, any> = { ...plan, itineraryData };
  if (typeof plan.summary === "string") out.summary = dropBannedSentences(sanitizeAiProse(plan.summary, o) ?? "");
  if (Array.isArray(plan.travelTips)) {
    out.travelTips = plan.travelTips
      .map((t: unknown) => dropBannedSentences(sanitizeAiProse(String(t ?? ""), o) ?? ""))
      .filter((t: string) => !!t);
  }
  if (o.noLodging) out.accommodationSuggestions = [];
  return out as T;
}
