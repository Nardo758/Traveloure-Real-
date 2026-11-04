/**
 * A-18 (ledger `2026-11-05-lane1-guest-save-rail`): editorial coordinates for Kyoto gem rows, one source URL per row.
 *
 * Rules (Lane 1 rulings, Nov 5, 2026): the point is editorial and lives on the gem row; every row names its source; a row
 * read from OpenStreetMap is © OpenStreetMap contributors under the ODbL (`osm: true`), and that credit stays with it. A
 * Google Places point is never written to a gem row (a Places `place_id` may be stored elsewhere; never its lat/lng).
 *
 * The first four rows were loaded by migration 437 (sheet "Kyoto gem coordinates 2026-11-04"); the test pins that the
 * migration and this list agree. Rows added later are applied with `applyGemCoordinates`, which fills only a gem that
 * has no point — a stored point is never changed.
 */
import { and, ilike, isNull, eq } from "drizzle-orm";
import { db } from "../db";
import { travelPulseHiddenGems } from "@shared/schema";

export interface GemCoordinateRow {
  placeName: string;
  latitude: string;
  longitude: string;
  sourceUrl: string;
  /** True when the point was read from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0). */
  osm: boolean;
}

export const KYOTO_GEM_COORDINATES: readonly GemCoordinateRow[] = [
  { placeName: "Hanami Koji Street", latitude: "35.0058500", longitude: "135.7752580", sourceUrl: "https://www.openstreetmap.org/way/470237770", osm: true },
  { placeName: "Sannenzaka Shopping Street", latitude: "34.9975290", longitude: "135.7810620", sourceUrl: "https://www.openstreetmap.org/way/526198271", osm: true },
  { placeName: "Arashiyama Bamboo Grove", latitude: "35.0176200", longitude: "135.6744450", sourceUrl: "https://www.openstreetmap.org/way/105574212", osm: true },
  { placeName: "Togetsukyo Bridge", latitude: "35.0128710", longitude: "135.6777620", sourceUrl: "https://www.openstreetmap.org/way/28640677", osm: true },
];

/** Fill each named Kyoto gem that has no point. Returns how many rows took a point. */
export async function applyGemCoordinates(rows: readonly GemCoordinateRow[] = KYOTO_GEM_COORDINATES): Promise<number> {
  let filled = 0;
  for (const r of rows) {
    if (!r.sourceUrl) throw new Error(`gem coordinate row without a source: ${r.placeName}`);
    const updated = await db
      .update(travelPulseHiddenGems)
      .set({ latitude: r.latitude, longitude: r.longitude })
      .where(
        and(
          ilike(travelPulseHiddenGems.city, "kyoto"),
          eq(travelPulseHiddenGems.placeName, r.placeName),
          isNull(travelPulseHiddenGems.latitude),
          isNull(travelPulseHiddenGems.longitude),
        ),
      )
      .returning({ id: travelPulseHiddenGems.id });
    filled += updated.length;
  }
  return filled;
}
