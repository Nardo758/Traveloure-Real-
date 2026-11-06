/**
 * Row 185 J5, screen: the words of the Trip Card's on-trip map.
 *
 * PLAN-2 lane 2 (from the DeepSeek report §8): these five strings REPLACE the row's held
 * placeholders. They are **proposed**, not approved: Leon's own
 * "Wording approved — Leon" comment on the PR is the approval, and until that lands the map must
 * not be described as carrying approved copy.
 */
export const ON_TRIP_MAP_COPY = {
  /** Map heading (W1). Proposed. */
  heading: "Where you are today",
  /** Layer 1 toggle label: today's confirmed stops (W2). Proposed. */
  layerStops: "Today's stops",
  /** Layer 2 toggle label: the chosen stay (W3). Proposed. */
  layerStay: "Where you're staying",
  /** Layer 3 toggle label: the current leg (W4). Proposed. */
  layerLeg: "This leg",
  /** Leave-by label, followed by the server's "HH:MM" (W5). Proposed. */
  leaveBy: "Leave by",
} as const;

/** Map attribution, required wherever an OpenStreetMap tile renders (LD 20/22). Not new copy. */
export const ON_TRIP_MAP_OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export type OnTripMapLayer = "stops" | "stay" | "leg";

/** All three layers start shown. */
export const ON_TRIP_MAP_DEFAULT_LAYERS: Readonly<Record<OnTripMapLayer, boolean>> = { stops: true, stay: true, leg: true };
