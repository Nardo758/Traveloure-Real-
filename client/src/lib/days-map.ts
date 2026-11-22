/**
 * A7 part 1 - the map beside the days (board R3_DaysBoard; Leon's go, Nov 21, 2026).
 *
 * "Days and map" is the list view with a pins-only map beside it, at desktop width. It is the view a plan with
 * stops opens on there (Leon, Nov 21, 2026: the board's default); "Days only" hides the map to widen the days.
 * The rules here are pure: which chips the map shows, which stops a chip draws and in what order, the count
 * line under the map, and what the URL says.
 *
 *   - "All days" draws every day's stops in day order, so the numbers follow the days left to right.
 *   - A day chip draws that day's stops only, numbered from 1.
 *   - The count reads the SAME located predicate the pins read (`isLocated`); a stop with no coordinates is
 *     counted in the total and never guessed onto the map.
 *
 * "Days only" is the choice that needs saying, so it is the one the URL carries (`?view=days&beside=none`); with
 * no word the map is beside the days. It is not saved to the account: the saved planner is still one of
 * `PLAN_VIEWS` ("days", "map"), which this slice does not change.
 */
import type { PlanCardActivity, PlanCardDay } from "@/components/plancard/plancard-types";
import type { PlanDayStop } from "@/lib/map-scene";
import { mapDayChipLabel } from "@/lib/map-days";

/** New wording (board R3_DaysBoard). Listed in the PR body for Leon's stamp. */
export const DAYS_MAP_COPY = {
  view: "Days and map",
  allDays: "All days",
  browse: "Browse nearby",
} as const;

/** The URL's word for hiding the map beside the days ("Days only"). */
export const DAYS_MAP_PARAM = "beside" as const;
export const DAYS_MAP_PARAM_HIDDEN = "none" as const;

/** "all", or one day's number. */
export type DaysMapKey = "all" | number;

export interface DaysMapChip {
  key: DaysMapKey;
  label: string;
}

/** The map is beside the days unless the URL says "Days only". */
export function daysMapFromUrl(search: string | null | undefined): boolean {
  try {
    return new URLSearchParams(search ?? "").get(DAYS_MAP_PARAM) !== DAYS_MAP_PARAM_HIDDEN;
  } catch {
    return true;
  }
}

/**
 * The chips over the map. A one-day plan has nothing to choose between, so it gets none; otherwise "All days"
 * leads and each day follows in order, labelled as the map view's own chips are ("Tue", "Tue 8" when chosen,
 * "Day 2" on a plan with no dates).
 */
export function daysMapChips(days: readonly Pick<PlanCardDay, "dayNum" | "dateIso">[], selected: DaysMapKey): DaysMapChip[] {
  if (days.length < 2) return [];
  return [
    { key: "all", label: DAYS_MAP_COPY.allDays },
    ...days.map((d) => ({ key: d.dayNum as DaysMapKey, label: mapDayChipLabel(d, selected === d.dayNum) })),
  ];
}

/** A chip that no longer names a day on the plan (the day was removed) falls back to "All days". */
export function daysMapKey(days: readonly Pick<PlanCardDay, "dayNum">[], chosen: DaysMapKey): DaysMapKey {
  return chosen !== "all" && days.some((d) => d.dayNum === chosen) ? chosen : "all";
}

/** The activities a chip covers, in the order they are numbered. */
export function daysMapActivities(days: readonly PlanCardDay[], key: DaysMapKey): PlanCardActivity[] {
  const shown = key === "all" ? days : days.filter((d) => d.dayNum === key);
  return shown.flatMap((d) => d.activities ?? []);
}

/** The same activities as the scene builder's stops. */
export function daysMapStops(days: readonly PlanCardDay[], key: DaysMapKey): PlanDayStop[] {
  return daysMapActivities(days, key).map((a) => ({
    id: a.id,
    name: a.name,
    time: a.time ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    supplySlot: !!(a as { supplySlot?: boolean }).supplySlot,
  }));
}

/** "5 of 5 stops on the map". Nothing to count draws no line. */
export function daysMapCountLine(located: number, total: number): string | null {
  if (total <= 0) return null;
  return `${located} of ${total} ${total === 1 ? "stop" : "stops"} on the map`;
}
