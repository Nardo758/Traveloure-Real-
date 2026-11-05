/**
 * A-18 (ledger `2026-11-05-lane1-guest-save-rail`): editorial coordinates for Kyoto gem rows, one source URL per row.
 *
 * Rules (Lane 1 rulings, Nov 5, 2026): the point is editorial and lives on the gem row; every row names its source; a row
 * read from OpenStreetMap is © OpenStreetMap contributors under the ODbL (`osm: true`), and that credit stays with it. A
 * Google Places point is never written to a gem row (a Places `place_id` may be stored elsewhere; never its lat/lng).
 *
 * The first four rows were loaded by migration 437 and the next fourteen by migration 441 (sheet "Kyoto gem coordinates
 * 2026-11-04", rows 2–5 and 22–35); the test pins that the migrations and this list agree. Rows added later are applied with `applyGemCoordinates`, which fills only a gem that
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
  { placeName: "Togetsukyo Bridge", latitude: "35.0128710", longitude: "135.6777620", sourceUrl: "https://www.openstreetmap.org/way/28640677", osm: true },  // Migration 441 (sheet rows 22–35): fourteen more, all read from OpenStreetMap.
  { placeName: "Ginkaku-ji", latitude: "35.0271510", longitude: "135.7976990", sourceUrl: "https://www.openstreetmap.org/way/353574388", osm: true },
  { placeName: "Gion's old streets", latitude: "35.0057800", longitude: "135.7750240", sourceUrl: "https://www.openstreetmap.org/way/190891725", osm: true },
  { placeName: "Kibune", latitude: "35.1235820", longitude: "135.7638910", sourceUrl: "https://www.openstreetmap.org/way/1467036701", osm: true },
  { placeName: "Kibune Shrine", latitude: "35.1218890", longitude: "135.7629360", sourceUrl: "https://www.openstreetmap.org/way/343853160", osm: true },
  { placeName: "Kiyomizu-dera back paths", latitude: "34.9951360", longitude: "135.7845500", sourceUrl: "https://www.openstreetmap.org/way/339351648", osm: true },
  { placeName: "Kurama Onsen", latitude: "35.1192450", longitude: "135.7765430", sourceUrl: "https://www.openstreetmap.org/way/319198717", osm: true },
  { placeName: "Kurama-dera Temple", latitude: "35.1178740", longitude: "135.7706520", sourceUrl: "https://www.openstreetmap.org/way/1243730752", osm: true },
  { placeName: "Kyoto Botanical Gardens", latitude: "35.0482930", longitude: "135.7629830", sourceUrl: "https://www.openstreetmap.org/way/98106475", osm: true },
  { placeName: "Omen", latitude: "35.0261640", longitude: "135.7949500", sourceUrl: "https://www.openstreetmap.org/node/4406335492", osm: true },
  { placeName: "Otagi Nenbutsu-ji Temple", latitude: "35.0311600", longitude: "135.6612340", sourceUrl: "https://www.openstreetmap.org/way/1230442951", osm: true },
  { placeName: "Sannenzaka & Ninenzaka", latitude: "34.9975290", longitude: "135.7810620", sourceUrl: "https://www.openstreetmap.org/way/526198271", osm: true },
  { placeName: "Tenryu-ji", latitude: "35.0158990", longitude: "135.6765080", sourceUrl: "https://www.openstreetmap.org/way/319572984", osm: true },
  { placeName: "Tofuku-ji Temple", latitude: "34.9771710", longitude: "135.7745750", sourceUrl: "https://www.openstreetmap.org/way/768987591", osm: true },
  { placeName: "Yasaka Koshindo Temple", latitude: "34.9983690", longitude: "135.7787630", sourceUrl: "https://www.openstreetmap.org/way/1316622873", osm: true },
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
