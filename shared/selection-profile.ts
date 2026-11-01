/**
 * Row 306 (CS-3 brief 10, E): the selection profile. Pure rules, no database.
 *
 * What a traveler does in the planner is logged as one row per action, carrying ONLY: the action, the stop type,
 * the neighbourhood, the time of day and the price band. Never a place name, a note, a coordinate, or anything
 * that names or implies religion or health. The profile is plain counts and rules — no machine learning — and
 * the planner and paid Optimize read its traits.
 *
 * Off unless the platform setting `selection_profile` is exactly "true" (anything else is off): while off,
 * nothing is logged and nothing is read.
 */

export const SELECTION_PROFILE_FLAG = "selection_profile";

export const SELECTION_ACTIONS = ["add", "remove", "swap", "move", "skip", "version_kept", "search"] as const;
export type SelectionAction = (typeof SELECTION_ACTIONS)[number];

/**
 * The stop types a row may carry: the plan item's own coarse type. None of them names or implies a religion or
 * a health condition, and nothing finer (a place category, a title) is ever logged.
 */
export const SELECTION_STOP_TYPES = ["activity", "meal", "transport", "accommodation", "free_time"] as const;
export type SelectionStopType = (typeof SELECTION_STOP_TYPES)[number];

export const SELECTION_TIMES_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
export type SelectionTimeOfDay = (typeof SELECTION_TIMES_OF_DAY)[number];

export const SELECTION_PRICE_BANDS = ["free", "low", "mid", "high"] as const;
export type SelectionPriceBand = (typeof SELECTION_PRICE_BANDS)[number];

/** The one row shape. Exactly these fields, nothing more. */
export interface SelectionRow {
  action: SelectionAction;
  stopType: SelectionStopType | null;
  neighbourhood: string | null;
  timeOfDay: SelectionTimeOfDay | null;
  priceBand: SelectionPriceBand | null;
}

export function isSelectionAction(v: unknown): v is SelectionAction {
  return typeof v === "string" && (SELECTION_ACTIONS as readonly string[]).includes(v);
}

export function selectionStopType(itemType: string | null | undefined): SelectionStopType | null {
  const v = (itemType ?? "").trim().toLowerCase();
  return (SELECTION_STOP_TYPES as readonly string[]).includes(v) ? (v as SelectionStopType) : null;
}

/** "09:30" → morning; 12–17 afternoon; 17–21 evening; otherwise night. An unreadable time is no time. */
export function selectionTimeOfDay(startTime: string | null | undefined): SelectionTimeOfDay | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((startTime ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/** Band boundaries come from config (`server/config/selection-profile.config.ts`), in one currency. */
export interface PriceBandBounds {
  currency: string;
  /** Upper bound (inclusive) of "low". */
  lowMax: number;
  /** Upper bound (inclusive) of "mid"; above it is "high". */
  midMax: number;
}

/** A cost in the configured currency becomes a band; another currency or no cost is no band (never converted). */
export function selectionPriceBand(
  cost: string | number | null | undefined,
  currency: string | null | undefined,
  bounds: PriceBandBounds,
): SelectionPriceBand | null {
  if (cost === null || cost === undefined || cost === "") return null;
  const n = Number(cost);
  if (!Number.isFinite(n) || n < 0) return null;
  if ((currency ?? bounds.currency).toUpperCase() !== bounds.currency.toUpperCase()) return null;
  if (n === 0) return "free";
  if (n <= bounds.lowMax) return "low";
  if (n <= bounds.midMax) return "mid";
  return "high";
}

/** A neighbourhood slug: lower-case kebab only; anything else is dropped rather than stored as free text. */
export function selectionNeighbourhood(slug: string | null | undefined): string | null {
  const v = (slug ?? "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 120 ? v : null;
}

/** The trait one profile line names, e.g. { field: "neighbourhood", value: "gion", count: 4 }. */
export interface SelectionTrait {
  field: "stopType" | "neighbourhood" | "timeOfDay" | "priceBand";
  value: string;
  count: number;
}

const POSITIVE: ReadonlySet<SelectionAction> = new Set<SelectionAction>(["add", "version_kept", "swap"]);
const NEGATIVE: ReadonlySet<SelectionAction> = new Set<SelectionAction>(["remove", "skip"]);

/**
 * The profile: for each field, the value picked most often, counted as kept picks minus removals and skips.
 * Moves and searches carry no stop to count. A value below `minCount` is not a trait. At most one trait per
 * field, so the line stays "Built around: …" short. Ties keep the first value met in the newest-first rows.
 */
export function buildSelectionTraits(rows: readonly SelectionRow[], minCount: number): SelectionTrait[] {
  const fields: SelectionTrait["field"][] = ["stopType", "neighbourhood", "timeOfDay", "priceBand"];
  const out: SelectionTrait[] = [];
  for (const field of fields) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const value = r[field];
      if (!value) continue;
      const delta = POSITIVE.has(r.action) ? 1 : NEGATIVE.has(r.action) ? -1 : 0;
      if (delta === 0) continue;
      counts.set(value, (counts.get(value) ?? 0) + delta);
    }
    let best: { value: string; count: number } | null = null;
    for (const [value, count] of Array.from(counts.entries())) {
      if (count >= minCount && (!best || count > best.count)) best = { value, count };
    }
    if (best) out.push({ field, ...best });
  }
  return out;
}

/** The prompt line the planner and Optimize read; "" with no traits, so a prompt with no signal is unchanged. */
export function selectionTraitsPromptLine(traits: readonly SelectionTrait[]): string {
  if (traits.length === 0) return "";
  const parts = traits.map((t) => `${t.field}=${t.value}`);
  return `\nTRAVELER SELECTION PATTERN (counts of this traveler's own past picks; a preference, never a rule): ${parts.join(", ")}`;
}
