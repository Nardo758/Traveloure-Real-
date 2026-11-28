/**
 * THE REORDER ROUTE'S BODY RULE (Leon, Nov 20, 2026). PURE.
 *
 * `POST /api/trips/:tripId/itinerary/reorder` takes a day and that day's stops in order. Before this rule the
 * route wrote `sort_order` on every id it was sent, checking neither the plan nor the day - so a caller allowed
 * to write ONE plan could re-rank a stop on any other. The route now refuses a list that names anything but
 * this plan's stops on the day sent; nothing is written on a refusal.
 */

/** The refusal's words - the sentence the route already answered a malformed advisor reorder with. */
export const REORDER_BODY_ERROR = "Send a day and its stops in order";

/** The most stops one reorder may name (the route's existing bound). */
export const REORDER_MAX_ITEMS = 200;

/** The day as an integer, or null when the body's `dayNumber` is not one. */
export function reorderDayNumber(dayNumber: unknown): number | null {
  if (typeof dayNumber !== "number" && typeof dayNumber !== "string") return null;
  if (typeof dayNumber === "string" && dayNumber.trim() === "") return null;
  const n = Number(dayNumber);
  return Number.isInteger(n) ? n : null;
}

/**
 * True when the reorder must be refused: no integer day, `itemIds` not a list of strings (or over the bound),
 * an id named twice, or an id that is not one of `dayItemIds` - this plan's stops on that day.
 */
export function reorderRefused(input: { dayNumber: unknown; itemIds: unknown; dayItemIds: readonly string[] }): boolean {
  if (reorderDayNumber(input.dayNumber) == null) return true;
  if (!Array.isArray(input.itemIds) || input.itemIds.length > REORDER_MAX_ITEMS) return true;
  const onDay = new Set(input.dayItemIds);
  const seen = new Set<string>();
  for (const id of input.itemIds) {
    if (typeof id !== "string" || !onDay.has(id) || seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}
