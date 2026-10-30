/**
 * Row 267 (F4): itinerary AI wording.
 * Approved by Leon, Oct 30, 2026, 5:54 PM ET. Pasted exactly.
 * buildingPlan is the regenerate toast with no feedback; updatingPlan is the one with feedback.
 */
export const ITINERARY_WORDING = {
  draftItinerary: "Your draft itinerary",
  buildingPlan: "Building your plan…",
  updatingPlan: "Updating your plan…",
  noDayOptions: "We couldn't build options for this day.",
  checkingPlaces: "Checking places against your stops…",
} as const;

/** "{n} of {m} stops placed". */
export function stopsPlaced(n: number, m: number): string {
  return `${n} of ${m} stops placed`;
}
