/**
 * Arashiyama local-itinerary wanted tile (row 250).
 * Wording approved by Leon Dixon, Oct 30, 2026.
 * No crowd count, high-demand badge, or trending line on this tile.
 */

export const ARASHIYAMA_ITINERARY_TRAVELER_LINE =
  "No local itinerary for Arashiyama yet. Build your own day here.";

export const ARASHIYAMA_ITINERARY_EXPERT_LINK =
  "Know Arashiyama well? Apply now as a local expert.";

/** Waitlist expert application (WL-B). */
export const ARASHIYAMA_ITINERARY_EXPERT_HREF = "/kyoto#experts";

export function isArashiyamaItineraryWanted(slot: {
  offeringLabel?: string | null;
  offeringKey?: string | null;
  neighborhoodName?: string | null;
}): boolean {
  const neighborhood = (slot.neighborhoodName ?? "").trim().toLowerCase();
  if (neighborhood !== "arashiyama") return false;
  const key = (slot.offeringKey ?? "").trim().toLowerCase();
  const label = (slot.offeringLabel ?? "").trim().toLowerCase();
  return key === "local_city_itinerary" || label === "local city itinerary";
}
