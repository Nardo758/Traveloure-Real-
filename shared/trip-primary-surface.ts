// Trip Card primary-surface rule — Console Realign ruling R-F
// (docs/briefs/CONSOLE_REALIGN_BRIEF.md).
//
// Pure, date-derived, no fetches. The slip's "Trip Card is now the primary surface" decision is
// one of three OR'd conditions, ALL real (§13 — no invented progress, no synthetic status):
//   1. `finalizedAt` is set — the traveler explicitly pressed "Finalize plan".
//   2. `now >= startDate - 48h` — the T-48h auto-handover window (the DEFAULT when Finalize was
//      never pressed; the scheduler's last-call nudge fires on the same clock).
//   3. The trip is underway (`startDate <= now <= endDate`).
//
// Deliberately does NOT read `trips.status` (dead field, CLAUDE.md §13 / Lane 3 Option B) — trip
// phase and this rule are both date-derived, matching the existing `derivePhase` convention in
// client/src/components/plancard/SlipView.tsx.

export const TRIP_CARD_HANDOVER_WINDOW_MS = 48 * 60 * 60 * 1000; // T-48h

export interface TripCardPrimaryInput {
  /** ISO timestamp string, Date, or null/undefined — mirrors the DTO's `finalizedAt` field. */
  finalizedAt?: string | Date | null;
  /** ISO date/timestamp string, or Date — the trip's startDate. */
  startDate?: string | Date | null;
  /** ISO date/timestamp string, or Date — the trip's endDate. */
  endDate?: string | Date | null;
  /** Defaults to `new Date()` — pass explicitly for deterministic tests. */
  now?: Date;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * `finalized_at ∨ now ≥ startDate−48h ∨ underway → Trip Card is primary`.
 *
 * Returns false (Slip stays primary) when there's nothing real to derive a date arm from
 * (no parseable startDate/endDate) and the trip was never finalized — honest default, never a
 * fabricated "primary" state.
 */
export function tripCardIsPrimary(input: TripCardPrimaryInput): boolean {
  if (input.finalizedAt) return true;

  const now = input.now ?? new Date();
  const start = toDate(input.startDate);
  const end = toDate(input.endDate);

  if (start) {
    const handoverAt = new Date(start.getTime() - TRIP_CARD_HANDOVER_WINDOW_MS);
    if (now >= handoverAt) return true;
  }

  if (start && end && now >= start && now <= end) return true;

  return false;
}

/**
 * True when the date arm (window-or-underway) ALONE already forces Trip Card primary, independent
 * of `finalizedAt`. The slip uses this to decide whether "Back to planning" (which only clears
 * `finalizedAt`) would have any visible effect — inside the T-48h window / underway, reopening is
 * a no-op for surface selection, so the button is hidden rather than offering a false reversal.
 */
export function tripCardForcedPrimaryByDateAlone(
  input: Omit<TripCardPrimaryInput, "finalizedAt">,
): boolean {
  return tripCardIsPrimary({ ...input, finalizedAt: null });
}
