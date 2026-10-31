/**
 * Row 302a (ledger `2026-10-31-tile-action-map`): the labels for a bento tile's one primary action.
 * `tileAction` / `tileActionLabel` in `bento-action-state.ts` choose among them by item kind; cards
 * read that function and never type a primary label themselves.
 *
 * The recommendation's two book labels are not part of the 302a map: they are the card's existing
 * words, moved here unchanged so no card holds a primary label of its own.
 */
import { ADD_TO_PLAN_LABEL } from "./plan-vocabulary";

export const TILE_ACTION_COPY = {
  addToPlan: ADD_TO_PLAN_LABEL,
  checkAvailability: "Check availability",
  getThisTrip: "Get this trip",
  askThisExpert: "Ask this expert",
  viewProfile: "View profile",
  apply: "Apply",
  bookNow: "Book now",
  bookOnPartner: "Book on partner",
} as const;

/** "Add to plan", or "Add to Nov 3" when the feed is scoped to one day. */
export function addToPlanLabel(scheduledDate?: string | null): string {
  if (!scheduledDate) return TILE_ACTION_COPY.addToPlan;
  const day = new Date(`${scheduledDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Add to ${day}`;
}
