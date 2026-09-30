/**
 * THE ONE SPEEDS TABLE (Track A step A8; ledger `2026-09-30-a8-travel-time-service`, R228).
 *
 * Every straight-line travel answer on the platform reads this table and nothing else. The three
 * walking speeds that existed before (80 m/min in plan-fit's estimate, 75 m/min in the booking
 * options, 5 km/h in itinerary-intelligence) and the 5/25/40 km/h table collapse to one row per
 * mode. A straight-line answer is an ESTIMATE and every surface labels it "est." (§13).
 *
 * Pure and dependency-free (shared/geo.ts imports it, so it must import nothing from geo).
 */

export const LEG_MODES = ["walk", "cycle", "transit", "drive"] as const;
export type LegMode = (typeof LEG_MODES)[number];

/** km/h per mode. `walk` is 4.8 km/h ⇒ exactly 80 m/min, the figure plan-fit already stated. */
export const TRAVEL_SPEEDS_KMH: Readonly<Record<LegMode, number>> = Object.freeze({
  walk: 4.8,
  cycle: 15,
  transit: 25,
  drive: 40,
});

export function metersPerMinute(mode: LegMode): number {
  return (TRAVEL_SPEEDS_KMH[mode] * 1000) / 60;
}

/** The straight-line estimate for a mode: whole minutes, never below 1. */
export function straightLineMinutes(meters: number, mode: LegMode): number {
  return Math.max(1, Math.round(meters / metersPerMinute(mode)));
}

/**
 * The legacy mode spellings stored on `transport_legs` and used by older callers ("walking",
 * "driving", …) mapped onto the four modes. An unknown spelling is null — never guessed.
 */
export function normalizeLegMode(raw: string | null | undefined): LegMode | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "walk" || s === "walking" || s === "foot") return "walk";
  if (s === "cycle" || s === "cycling" || s === "bike" || s === "bicycle") return "cycle";
  if (s === "transit" || s === "train" || s === "subway" || s === "metro" || s === "bus" || s === "rail") return "transit";
  if (s === "drive" || s === "driving" || s === "car" || s === "taxi" || s === "rideshare") return "drive";
  return null;
}

/** The legacy spelling a `transport_legs` row carries for each mode (readers already know these). */
export const LEG_MODE_STORED: Readonly<Record<LegMode, string>> = Object.freeze({
  walk: "walking",
  cycle: "cycling",
  transit: "transit",
  drive: "driving",
});

/**
 * The mode a leg takes when the traveler has chosen none: walk when the straight line is within the
 * walk threshold, transit above it — the SAME rule plan-fit applies (shared/plan-fit.ts), so the two
 * per-day numbers measure comparable legs.
 */
export function defaultLegMode(straightLineMeters: number, walkThresholdMeters: number): LegMode {
  return straightLineMeters <= walkThresholdMeters ? "walk" : "transit";
}
