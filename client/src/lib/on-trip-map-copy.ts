/**
 * Row 185 J5, screen: the words of the Trip Card's on-trip map.
 *
 * Every string here is HELD for Leon (the row's doc: "layer names, toggle labels and the leave-by
 * label are HELD"). They are placeholders until Leon approves wording; none is approved text.
 */
export const ON_TRIP_MAP_COPY = {
  /** Map heading. HELD for Leon. */
  heading: "[HELD for Leon]",
  /** Layer 1 toggle label: today's confirmed stops. HELD for Leon. */
  layerStops: "[HELD for Leon]",
  /** Layer 2 toggle label: the chosen stay. HELD for Leon. */
  layerStay: "[HELD for Leon]",
  /** Layer 3 toggle label: the current leg. HELD for Leon. */
  layerLeg: "[HELD for Leon]",
  /** Leave-by label, followed by the server's "HH:MM". HELD for Leon. */
  leaveBy: "[HELD for Leon]",
} as const;

/** Map attribution, required wherever an OpenStreetMap tile renders (LD 20/22). Not new copy. */
export const ON_TRIP_MAP_OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export type OnTripMapLayer = "stops" | "stay" | "leg";

/** All three layers start shown. */
export const ON_TRIP_MAP_DEFAULT_LAYERS: Readonly<Record<OnTripMapLayer, boolean>> = { stops: true, stay: true, leg: true };
