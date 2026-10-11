/**
 * TC-3c — "A better way there" (ledger `2026-10-11-tc3c-better-way-line`; TC-3 brief rev 1 rules 1, 7). Pure: reads the
 * plan card's `days[].rideSuggestions` (the server's own ranked swaps, TC-3b — `shared/ride-recommender.ts`) and says
 * them. Every sentence the line and the swap card show lives here, ONE home. The client ranks nothing, filters
 * nothing and adds no corridor rule of its own: what the server sent for a pair is what is drawn, and nothing else.
 * Minutes and money are the operator's (rule 7) — never estimated here; a figure the server did not send is omitted.
 */
import type { RideSuggestion } from "@shared/ride-recommender";

export type RideSuggestionView = Omit<RideSuggestion, "score">;

export const RIDE_SWAP_LINE = "A better way there";
export const RIDE_SWAP_CTA = "Swap it in";
export const RIDE_SWAP_DISMISS = "Not this time";
export const RIDE_SWAP_DISMISS_NOTE = "We won't suggest a ride on this leg again for this trip.";
export const RIDE_SWAP_OWNER_ONLY = "Only the plan's owner can swap a ride in.";

type DayWithRides = { activities?: Array<{ id: string }>; rideSuggestions?: RideSuggestionView[] };

/** The server's suggestion for exactly this pair of rows, or null. */
export function rideSuggestionFor(days: readonly DayWithRides[] | null | undefined, prevId: string, nextId: string): RideSuggestionView | null {
  for (const d of days ?? []) {
    for (const s of d.rideSuggestions ?? []) if (s.fromItemId === prevId && s.toItemId === nextId) return s;
  }
  return null;
}

/** "+12 min" / "8 min faster" / "same time"; null when the server sent no leg minutes to compare with. */
export function rideExtraMinutesLine(extraMinutes: number | null | undefined): string | null {
  if (extraMinutes == null || !Number.isFinite(extraMinutes)) return null;
  if (extraMinutes > 0) return `+${extraMinutes} min`;
  if (extraMinutes < 0) return `${-extraMinutes} min faster`;
  return "same time";
}

/** The operator's adult fare, "¥880 per adult"; null when none was stated. */
export function rideFareLine(fare: RideSuggestionView["fare"]): string | null {
  if (!fare || fare.adult == null || !Number.isFinite(fare.adult)) return null;
  const amount = fare.currency === "JPY" ? `¥${Math.round(fare.adult).toLocaleString("en-US")}` : `${fare.adult.toLocaleString("en-US")} ${fare.currency}`;
  return `${amount} per adult`;
}

/** The line under the leg: "A better way there · Sagano Romantic Train 10:02 · +12 min · ¥880 per adult". */
export function rideSwapSummary(s: RideSuggestionView): string {
  return [RIDE_SWAP_LINE, `${s.title} ${s.departure}`, rideExtraMinutesLine(s.extraMinutes), rideFareLine(s.fare)].filter(Boolean).join(" · ");
}

/** The swap card's steps, in travel order. */
export function rideSwapSteps(s: RideSuggestionView): string[] {
  const walk = (m: number) => `${m} min walk`;
  return [
    `Walk to ${s.boardingName ?? "the boarding point"} (${walk(s.walkToMinutes)})`,
    `${s.title}, ${s.departure} → ${s.arrival} (${s.rideMinutes} min)`,
    `Walk on from ${s.exitName ?? "the exit"} (${walk(s.walkFromMinutes)})`,
  ];
}

/** Said only when the server marked it: out one way, back another (rule 3). */
export const RIDE_RETURN_PAIR_LINE = "Pairs with another ride today — out one way, back another.";

/** The ride route's body for this suggestion (the server re-checks the departure against the catalog). */
export function rideInsertBodyFor(s: RideSuggestionView): { serviceId: string; dayNumber: number; afterItemId: string; departureTime: string } {
  return { serviceId: s.serviceId, dayNumber: s.dayNumber, afterItemId: s.fromItemId, departureTime: s.departure };
}
