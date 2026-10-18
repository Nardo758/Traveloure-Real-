/**
 * FD-4 (ledger `2026-10-18-fd4-share-projection`): THE ONE RULE for what a share read may carry about a
 * plan's stops. A share link is read by people the traveler chose to send it to, so it carries PUBLIC
 * content only (FD-2, LD 65):
 *   - an item is shown only when it is KNOWN public (`itinerary_items.source_class = 'public'`). A `local`
 *     item, an untagged item and an item that cannot be traced to its plan row are all counted, never
 *     named (fail closed, decision-maker Oct 18, 2026);
 *   - a day says how many stops it is not showing (`localCount`), only when that number is above zero;
 *   - a leg is shown only when BOTH of its ends are shown stops — its names and coordinates would
 *     otherwise place a hidden stop;
 *   - per-day map links are rebuilt from the shown stops only;
 *   - expert notes never leave on a share read (`LOCAL_FIELD_NAMES` is what the leak test looks for).
 * Pure: the caller supplies the set of public ids.
 */
import type { VariantFullTripPlan } from "./trip-plan";

/**
 * Field names that only local content carries (a gem's description, a nugget's insight, an expert's item
 * note). The leak test asserts none of them appears anywhere in a share or free-draft response.
 */
export const LOCAL_FIELD_NAMES = [
  "expertNote",
  "expert_note",
  "expertNotes",
  "expert_notes",
  "expertTravelerNote",
  "expert_traveler_note",
  "insight",
  "localTip",
  "local_tip",
  "hiddenGems",
  "gemDescription",
] as const;

export interface ShareStop {
  id: string;
}

/** The count line a day carries: present only when at least one stop is not shown (§13 — zero says nothing). */
export function localCountEntry(hidden: number): { localCount?: number } {
  return hidden > 0 ? { localCount: hidden } : {};
}

/** Split a day's stops into those shown and the number counted. */
export function partitionShareStops<T extends ShareStop>(stops: T[], isPublic: (id: string) => boolean): { shown: T[]; hidden: number } {
  const shown = stops.filter((s) => isPublic(s.id));
  return { shown, hidden: stops.length - shown.length };
}

/** A leg is shown only when both of its ends are shown stops. An end with no id is unknown ⇒ not shown. */
export function legIsShareable(
  leg: { fromActivityId?: string | null; toActivityId?: string | null },
  isPublic: (id: string) => boolean,
): boolean {
  return !!leg.fromActivityId && !!leg.toActivityId && isPublic(leg.fromActivityId) && isPublic(leg.toActivityId);
}

/**
 * FD-1 / FD-4: the gems a FREE draft may hand the model — public, live, draft-eligible only, at most `limit`,
 * name/description/score and nothing else. The ONE projection quick-start's prompt input is built from.
 */
export function freeDraftGemContext(
  gems: Array<Record<string, any>> | null | undefined,
  isEligible: (g: Record<string, any>) => boolean,
  limit = 5,
): Array<{ name: unknown; description: unknown; gemScore: unknown }> {
  return (gems ?? [])
    .filter((g) => isEligible(g))
    .slice(0, limit)
    .map((g) => ({ name: g.placeName, description: g.description, gemScore: g.gemScore }));
}

/** Recursively collect every object key carrying a value (not null, undefined or "") in a JSON value. */
export function collectKeysWithValues(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeysWithValues(v, into);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null && v !== undefined && v !== "") into.add(k);
      collectKeysWithValues(v, into);
    }
  }
  return into;
}

/** The local field names that carry a value anywhere in a response, for the leak test (empty ⇒ clean). */
export function localFieldsIn(value: unknown): string[] {
  const keys = collectKeysWithValues(value);
  return LOCAL_FIELD_NAMES.filter((k) => keys.has(k));
}

/** Is this id (a variant item id, or the plan item id it was copied from) a known-public stop? */
export type SharePublicTest = (id: string) => boolean;

/** Pure: build the test from the variant rows and the public plan-item ids among their sources. */
export function sharePublicTest(
  variantItems: Array<{ id: string; sourceItemId?: string | null }>,
  publicSourceIds: Set<string>,
): SharePublicTest {
  const ids = new Set<string>();
  for (const v of variantItems) {
    if (v.sourceItemId && publicSourceIds.has(v.sourceItemId)) {
      ids.add(v.id);
      ids.add(v.sourceItemId);
    }
  }
  return (id: string) => ids.has(id);
}

/** Per-day count of stops a share does not show, keyed by day number (only days with one or more). */
export type ShareHiddenCounts = Map<number, number>;

/**
 * Pure: the plan a share may carry. Activities are the known-public stops; a day's legs and the plan's
 * flat leg list keep only legs whose two ends are shown stops; `hidden` counts what each day withholds.
 */
export function projectVariantPlanForShare(
  plan: VariantFullTripPlan,
  isPublic: SharePublicTest,
): { plan: VariantFullTripPlan; hidden: ShareHiddenCounts } {
  const hidden: ShareHiddenCounts = new Map();
  const days = plan.days.map((day) => {
    const { shown, hidden: n } = partitionShareStops(day.activities, isPublic);
    if (n > 0) hidden.set(day.dayNumber, n);
    return {
      ...day,
      activities: shown,
      transports: day.transports.filter((l) => legIsShareable(l, isPublic)),
    };
  });
  return {
    plan: { ...plan, days, legs: plan.legs.filter((l) => legIsShareable(l, isPublic)) },
    hidden,
  };
}
