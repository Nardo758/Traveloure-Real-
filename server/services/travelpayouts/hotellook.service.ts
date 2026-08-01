import type { CatalogItem } from "../experience-catalog.service";

/**
 * RETIRED SOURCE — do not re-enable against the old URLs.
 *
 * Travelpayouts shut down the public Hotellook data API. Verified 2026-08-01:
 *   - https://engine.hotellook.com/api/v2/cache.json   → 404 (nginx)
 *   - https://engine.hotellook.com/api/v2/lookup.json  → 404 (nginx)
 *   - https://engine.hotellook.com/api/v2/static/hotels.json → 404
 *   - https://api.hotellook.com/api/v2/cache.json      → 404
 *   - https://yasen.hotellook.com/tp/public/widget_location_dump.json → 404
 * No replacement hotel-data endpoint exists on api.travelpayouts.com for this
 * token (hotels/v2 paths also 404). Hotel results now come from the remaining
 * sources (e.g. Agoda). If Travelpayouts ships a replacement hotel API, wire it
 * up here and re-register the network in catalog-ingest.service.ts.
 */

export interface HotellookSearchParams {
  destination: string;
  currency?: string;
  limit?: number;
  language?: string;
}

/** Always returns [] — the upstream API no longer exists (see header comment). */
export async function searchHotellook(_params: HotellookSearchParams): Promise<CatalogItem[]> {
  return [];
}
