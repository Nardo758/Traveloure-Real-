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

// ── Step 6 finalize smoke (ledger `2026-10-04-step6-trip-card`) ─────────────────────────────────────
/**
 * ONE answer to "is the Trip Card ready?", read by the slip's banner, the T-48h nudge and the card
 * itself, so "Your Trip Card is ready" and the card's own state can never disagree. The card has
 * something of its own to show only once a final version exists (`trip_finals`); before that the
 * date arm can make the card PRIMARY but there is nothing to read on it, so the words are "make it
 * final", never "ready".
 *   ready         — a final version exists (the card renders it)
 *   finalize_now  — the card would be primary by date, but no final exists yet
 *   null          — the slip is primary; no banner
 */
export type TripCardBannerState = "ready" | "finalize_now" | null;

export function tripCardBannerState(
  input: TripCardPrimaryInput & { finalVersion: number | null | undefined; datesConfirmed?: boolean },
): TripCardBannerState {
  if (!tripCardIsPrimary(input)) return null;
  if (input.finalVersion != null) return "ready";
  return tripStartsSoon(input) ? "finalize_now" : null;
}

/**
 * B1 (ledger `2026-10-08-starts-soon-needs-real-dates`): "Your trip starts soon" is a claim about a
 * REAL start that is still AHEAD. It is said only when (a) somebody chose the dates — a placeholder
 * window (`trips.dates_confirmed_at` NULL, LD 30 as amended; E1's mint-day window) starts "today"
 * only because the columns demand a day, so the date arm would otherwise fire on every new undated
 * plan — and (b) the start is still in the future: a trip already underway or over has not "started
 * soon". Neither case invents a different banner: the slip simply says nothing (§13).
 * `datesConfirmed` is the plancard DTO's boolean; `false` withholds the line. A caller that does not
 * pass it states nothing about the dates, and only the future-start half applies.
 */
export function tripStartsSoon(input: TripCardPrimaryInput & { datesConfirmed?: boolean }): boolean {
  if (input.datesConfirmed === false) return false;
  const start = toDate(input.startDate);
  if (!start) return false;
  return start.getTime() > (input.now ?? new Date()).getTime();
}

/** The card page's own reading: a final exists ⇒ the card renders it; none ⇒ "Not final yet". */
export function tripCardHasFinal(finalVersion: number | null | undefined): boolean {
  return finalVersion != null;
}

export const TRIP_CARD_READY_TITLE = "Your Trip Card is ready";
export const TRIP_CARD_FINALIZE_NOW_TITLE = "Your trip starts soon · make your plan final";

/** The T-48h nudge's words, by the same rule. */
export function tripCardNudgeCopy(hasFinal: boolean, destination: string | null | undefined): { title: string; message: string; path: "card" | "slip" } {
  const where = destination || "your trip";
  return hasFinal
    ? { title: TRIP_CARD_READY_TITLE, message: `Your Trip Card for ${where} is ready to view.`, path: "card" }
    : { title: TRIP_CARD_FINALIZE_NOW_TITLE, message: `Your plan for ${where} isn't final yet. Finish it and make it final to get your Trip Card.`, path: "slip" };
}
