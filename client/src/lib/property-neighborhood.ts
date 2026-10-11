// The property builder's neighbourhood step (PB-1, rulings R1/R2 — ledger
// `2026-10-10-pb1-property-category-city`). Pure, so the pin pre-fill and the
// "may this step continue?" answer are pinned by a test rather than by the page.
//
// The pre-fill is the ONE placement rule, `placeServiceInNeighborhood` (radius-limited,
// shared with market insights) — never `nearestNeighborhoodSlug`, which has no radius and
// would file a pin in the countryside under the nearest city. The provider confirms the
// suggestion; nothing is sent until they submit.

import { placeServiceInNeighborhood, type NeighborhoodRow } from "@shared/neighborhood-placement";

export interface PinPoint {
  lat: number;
  lng: number;
}

/** The slug the confirmed pin falls inside (by each neighbourhood's own radius), or null. */
/** The `/api/city-neighborhoods` row as the client holds it — centroid/radius may be absent. */
export type NeighborhoodApiRow = Pick<NeighborhoodRow, "id" | "city" | "name" | "slug"> & {
  centroidLat?: NeighborhoodRow["centroidLat"];
  centroidLng?: NeighborhoodRow["centroidLng"];
  radiusKm?: NeighborhoodRow["radiusKm"];
};

export function suggestNeighborhoodFromPin(
  point: PinPoint | null | undefined,
  apiRows: readonly NeighborhoodApiRow[],
): string | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  // A row with no centroid has nothing to measure from and can only be reached by its slug.
  const rows: NeighborhoodRow[] = apiRows.map((r) => ({
    ...r,
    centroidLat: r.centroidLat ?? null,
    centroidLng: r.centroidLng ?? null,
    radiusKm: r.radiusKm ?? null,
  }));
  const id = placeServiceInNeighborhood({ neighborhood: null, latitude: point.lat, longitude: point.lng }, rows);
  if (!id) return null;
  return rows.find((r) => r.id === id)?.slug ?? null;
}

/**
 * The neighbourhood answer is REQUIRED, and "my neighbourhood isn't listed yet" is an answer:
 * the listing saves with city NULL and says so (§13 — honest, not blocking). An empty
 * catalog is the same answer, since there is nothing to pick.
 */
export function neighborhoodAnswered(slug: string, unlisted: boolean, catalogSize: number): boolean {
  return slug.trim().length > 0 || unlisted || catalogSize === 0;
}

export const NO_NEIGHBORHOOD_LISTED = "My neighborhood isn't listed yet";
export const NOT_IN_STAYS_NOTICE = "This property won't appear in stays until a neighborhood is set.";
