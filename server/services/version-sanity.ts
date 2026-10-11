/**
 * V-1 (R437; ledger `2026-10-11-v1-version-sanity`): a version's sanity checks, run after its
 * coordinates are resolved and before it is saved. PURE — no DB, no config read; the thresholds
 * arrive as arguments from `server/config/optimizer-sanity.config.ts`.
 *
 * FLAG ONLY. C1 holds: no stop is moved, dropped or re-timed on the optimizer's own authority, and a
 * time the model set is never cleared (that would manufacture an untimed stop). Each flag type that
 * fires becomes ONE `itinerary_variant_metrics` row on the version, the stop names in its
 * description, plus a log line. No travel minutes (R-h).
 */
import { mapServiceTypeToCategory } from "./smart-sequencing.service";

/** The metrics-mapper categories that are a meal. ONE test, read by the dinner check and by the
 *  activity-anchor filter (a restaurant is never a place to build a day around). */
const DINING_CATEGORIES = new Set(["breakfast", "lunch", "dinner", "dining_light", "dining_heavy", "snack"]);
/** Dining that can never be a dinner, whatever its hour. */
const NEVER_DINNER = new Set(["breakfast", "lunch"]);

export function isDiningServiceType(serviceType: string | null | undefined): boolean {
  if (!serviceType || !serviceType.trim()) return false;
  return DINING_CATEGORIES.has(mapServiceTypeToCategory(serviceType));
}

/** "HH:MM" → minutes after midnight; anything else is no time (§13). */
export function wallClockMinutes(raw: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

export type VersionSanityKey = "untimed_stops" | "duplicate_dinner" | "late_start";

export interface VersionSanityFlag {
  key: VersionSanityKey;
  /** How many stops the flag names. */
  count: number;
  /** The stop names, in plan order — what the metric row's description carries. */
  stopNames: string[];
}

export interface SanityStop {
  name: string;
  serviceType?: string | null;
  dayNumber?: number | null;
  startTime?: string | null;
}

/** The flags one version raises, in a fixed order; an empty list when nothing fires. */
export function versionSanityFlags(
  stops: readonly SanityStop[],
  thresholds: { dinnerFromMinutes: number; latestStartMinutes: number },
): VersionSanityFlag[] {
  const flags: VersionSanityFlag[] = [];
  const named = (s: SanityStop) => (s.name ?? "").trim() || "Unnamed stop";

  const untimed = stops.filter((s) => wallClockMinutes(s.startTime) == null).map(named);
  if (untimed.length) flags.push({ key: "untimed_stops", count: untimed.length, stopNames: untimed });

  // At most one dinner per day: a dining stop (never breakfast or lunch) starting at or after the
  // evening threshold. A day with two or more names every dinner on it.
  const dinnersByDay = new Map<number, string[]>();
  for (const s of stops) {
    const at = wallClockMinutes(s.startTime);
    if (at == null || at < thresholds.dinnerFromMinutes) continue;
    if (!isDiningServiceType(s.serviceType)) continue;
    if (NEVER_DINNER.has(mapServiceTypeToCategory(s.serviceType!))) continue;
    const day = s.dayNumber ?? 1;
    dinnersByDay.set(day, [...(dinnersByDay.get(day) ?? []), named(s)]);
  }
  const duplicate = Array.from(dinnersByDay.entries())
    .filter(([, names]) => names.length > 1)
    .sort(([a], [b]) => a - b)
    .flatMap(([, names]) => names);
  if (duplicate.length) flags.push({ key: "duplicate_dinner", count: duplicate.length, stopNames: duplicate });

  const late = stops
    .filter((s) => {
      const at = wallClockMinutes(s.startTime);
      return at != null && at > thresholds.latestStartMinutes;
    })
    .map(named);
  if (late.length) flags.push({ key: "late_start", count: late.length, stopNames: late });

  return flags;
}

const FLAG_LABELS: Record<VersionSanityKey, string> = {
  untimed_stops: "Stops without a time",
  duplicate_dinner: "More than one dinner on a day",
  late_start: "Stops starting late",
};

export const VERSION_SANITY_KEYS: readonly VersionSanityKey[] = ["untimed_stops", "duplicate_dinner", "late_start"];

/** One `itinerary_variant_metrics` row per flag (no migration — the existing table). */
export function sanityMetricRows(variantId: string, flags: readonly VersionSanityFlag[]) {
  return flags.map((f) => ({
    variantId,
    metricKey: f.key,
    metricLabel: FLAG_LABELS[f.key],
    value: String(f.count),
    unit: "stops",
    betterIsLower: true,
    description: f.stopNames.join(", "),
  }));
}
