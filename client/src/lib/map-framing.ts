/**
 * How the plan map frames its pins (smoke 8 item 5). Google's `fitBounds` over ONE pin — or over pins
 * a few metres apart — zooms to the rooftop. The map is for seeing where a stop sits in the city, so
 * framing never zooms in past the DISTRICT: one located pin is centred at `MAP_DISTRICT_ZOOM`, and a
 * fit over several is clamped to it. The user may still zoom in by hand; this governs framing only.
 * Pure.
 */
export const MAP_DISTRICT_ZOOM = 14;

export type MapFraming =
  | { kind: "center"; center: { lat: number; lng: number }; zoom: number }
  | { kind: "bounds"; maxZoom: number }
  | { kind: "none" };

export function mapFraming(points: ReadonlyArray<{ lat: number; lng: number }>): MapFraming {
  if (!points.length) return { kind: "none" };
  const distinct = new Set(points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`));
  if (distinct.size === 1) return { kind: "center", center: { lat: points[0].lat, lng: points[0].lng }, zoom: MAP_DISTRICT_ZOOM };
  return { kind: "bounds", maxZoom: MAP_DISTRICT_ZOOM };
}

/** The zoom a fit may land on: never closer than the district. */
export function clampFramingZoom(zoom: number | null | undefined, maxZoom: number = MAP_DISTRICT_ZOOM): number | null {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) return null;
  return zoom > maxZoom ? maxZoom : null;
}
