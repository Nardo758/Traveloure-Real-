/**
 * Row 195 (dispatch CB-2026-10-25-C, ruling R3): a single "+" on the Optimize comparison page adds
 * ONE stop instantly, and the add toast may carry an undo that removes EXACTLY that item through the
 * EXISTING `DELETE /api/trips/:tripId/itinerary-items/:itemId` and its money guard. Nothing else gets
 * an undo: not a pick inside an open option set (`chose`), not apply-version, not a version pick.
 *
 * PURE — no React, no fetch. The page asks this module two questions and does what it answers.
 */
import { itineraryItemIsMoneyCommitted, ITEM_BOOKED_DELETE_ERROR } from "@shared/itinerary-item-money";
import { parseApiRefusal } from "./api-refusal";

/** Every string for the undo, in ONE place. Wording approved by Leon, Oct 25, 2026 (relayed on #1689). */
export const ADD_UNDO_STRINGS = {
  /** The toast button and its altText. */
  undoLabel: "Undo",
  undone: {
    title: "Removed from your plan",
    description: "That stop is out again. Your plan is back to how it was.",
  },
  undoFailed: {
    title: "We couldn't remove that stop",
    description: "It's still in your plan. We've refreshed your plan so you can see where things stand.",
  },
  itemStays: {
    title: "That stop is already booked",
    description: "It can't be removed here, so it stays in your plan.",
  },
} as const;

/** `POST /api/itinerary-comparisons/:id/adopt-stop` (server/routes/plancard.routes.ts). */
export type AdoptStopResponse =
  | { adopted: true; item: { id?: string | null; routingStatus?: string | null; bookingId?: string | null } }
  | { adopted: true; chose: { setId: string; optionId: string }; itemId: string }
  | { adopted: false; reason?: string };

/**
 * The item id an undo may remove, or `null` for no undo.
 *  - only `{ adopted: true, item }` with a real `item.id` — never `chose`, never `adopted: false`;
 *  - only while the plan is known and NOT finalized: the delete route does not re-snapshot a final,
 *    so `plan` absent (not loaded) or `finalizedAt` set ⇒ no undo;
 *  - never on a row the shared money predicate calls booked or paid (the DELETE would refuse it).
 */
export function undoTargetForAdopt(
  r: AdoptStopResponse | null | undefined,
  plan: { finalizedAt?: string | null } | null | undefined,
): string | null {
  if (!r || r.adopted !== true || !("item" in r)) return null;
  const id = r.item?.id;
  if (typeof id !== "string" || id === "") return null;
  if (!plan || plan.finalizedAt) return null;
  if (itineraryItemIsMoneyCommitted(r.item)) return null;
  return id;
}

export type UndoOutcome = "undone" | "item_stays" | "failed";

/** A DELETE that answered 2xx: 200 removed the item; 202 (an advisor's suggestion) removed nothing. */
export function undoOutcomeFromStatus(status: number): UndoOutcome {
  return status === 200 || status === 204 ? "undone" : "failed";
}

/** A DELETE that threw: the booked-row 409 is matched by its CODE, never its prose. */
export function undoOutcomeFromError(err: unknown): UndoOutcome {
  return parseApiRefusal(err).code === ITEM_BOOKED_DELETE_ERROR.code ? "item_stays" : "failed";
}

/** The toast (title and description) each outcome reads. */
export function undoOutcomeToast(outcome: UndoOutcome): { title: string; description: string } {
  if (outcome === "undone") return ADD_UNDO_STRINGS.undone;
  if (outcome === "item_stays") return ADD_UNDO_STRINGS.itemStays;
  return ADD_UNDO_STRINGS.undoFailed;
}
