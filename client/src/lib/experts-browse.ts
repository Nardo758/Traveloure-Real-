/**
 * `/experts?…` — THE ONE BUILDER of the expert-browse href (§18 rule 1).
 *
 * A sibling of `buildServicesBrowseHref` in `./services-browse`, with the same §13 posture and
 * deliberately NOT folded into it: that module addresses `/services` with a `categoryKey`, this one
 * addresses `/experts` with a `destination`. Two different browses are two hrefs, not one decision
 * stated twice — but they must not drift in how they treat an ABSENT field, which is why this file
 * repeats that rule in full rather than assuming a reader has seen the other.
 *
 * WHY THE `tripId` MATTERS HERE MORE THAN ANYWHERE ELSE. `/experts` reads `?tripId=` and carries it
 * into each expert's detail page, where `POST /api/expert-booking-requests` REQUIRES it (Locked
 * Decision 32 (b)). Without it the detail page's request CTA re-opens the planning modal, so a
 * traveler who just finished that modal is returned to the step they finished — the loop Locked
 * Decision 42 **D5** exists to close (`docs/briefs/EXPERT_HANDOFF_IS_A_LOOP.md`).
 */

export const EXPERTS_BROWSE_PATH = "/experts";
export const EXPERTS_BROWSE_DESTINATION_PARAM = "destination";
export const EXPERTS_BROWSE_TRIP_PARAM = "tripId";

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** What a door may hand the expert browse. Every field optional; ABSENT means "not known". */
export interface ExpertsBrowseTarget {
  /** The city to pre-select — the PLAN's own destination, never a placeholder. */
  destination?: string | null;
  /** The plan this browse is staffing — a HANDOFF, never a grant. */
  tripId?: string | null;
}

/**
 * **§13 — A DOOR PASSES ONLY WHAT IS TRUE** (Locked Decision 42 **D13**). Every field is dropped
 * when it trims to nothing, so an absent param is how the browse is told "not known".
 *
 * That rule is load-bearing in BOTH directions here:
 *  - an empty `tripId` would be a handoff to a plan nobody named, and `?tripId=undefined` is worse
 *    than no param at all — the detail page would carry a string the server must then refuse;
 *  - an empty `destination` would be a city nobody chose, and the browse would filter by it.
 *
 * A mint the traveler refused at the sign-in gate, or one that failed, yields no `tripId` — and
 * this then produces exactly the browse the `local` branch has always shown.
 */
export function buildExpertsBrowseHref(target: ExpertsBrowseTarget): string {
  const params = new URLSearchParams();
  const pairs: Array<[string, unknown]> = [
    [EXPERTS_BROWSE_DESTINATION_PARAM, target.destination],
    [EXPERTS_BROWSE_TRIP_PARAM, target.tripId],
  ];
  for (const [name, raw] of pairs) {
    const value = trimmed(raw);
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return query ? `${EXPERTS_BROWSE_PATH}?${query}` : EXPERTS_BROWSE_PATH;
}

/**
 * THE WAY BACK TO ONE EARNER, CARRYING THE PLAN (Locked Decision 42 **D15**; ledger
 * `2026-09-23-storefront-booking-panel`). A plan started from an expert's storefront ends back on
 * that storefront, and the storefront's booking panel reads `?tripId=` to offer "Share my plan".
 * Without the id the traveler came back to "Start a plan" for a plan they had just made — the same
 * loop D5 closes for the browse, one page over.
 *
 * Same §13 rule as the builder above: the param is added only when there IS an id, and a path that
 * already has a query gets `&`, never a second `?`. It says nothing about ownership — the page that
 * reads it asks the server, which answers only the plan's owner.
 */
export function withPlanTripId(path: string, tripId: unknown): string {
  const value = trimmed(tripId);
  if (!value) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${EXPERTS_BROWSE_TRIP_PARAM}=${encodeURIComponent(value)}`;
}
