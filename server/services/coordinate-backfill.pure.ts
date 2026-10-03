/**
 * The plancard's coordinate backfill — the PURE half (smoke 5 item 5, ledger
 * `2026-10-03-smoke5-fixes`). The writer is `resolveMissingItemCoordinates` in trip-plan.service.ts.
 */

/** An item names a place of its own (§13: the plan's city alone is never geocoded as an item). */
export function hasItemLocation(item: { locationName: any; locationAddress: any }): boolean {
  return (
    (item.locationName && String(item.locationName).trim().length > 0) ||
    (item.locationAddress && String(item.locationAddress).trim().length > 0)
  );
}

/**
 * Pure (smoke 5 item 5, ledger `2026-10-03-smoke5-fixes`). TRUE when the per-request cap stopped
 * the backfill with an unpinned, locatable item it never tried — a later read will pin it. An item
 * that was tried and could not be geocoded is NOT pending (it stays un-pinned honestly, §13), so a
 * client that re-reads while this is true always stops.
 *
 * THE RACE IT CLOSES: a fresh draft of 24 stops was pinned 12 per read, so the slip's first render
 * drew "Build my days around this" (which needs a located, dated item) on only half the items, and
 * the other half waited for an unrelated refetch.
 */
export function coordinatesStillPending(
  items: ReadonlyArray<{ id: string; latitude: any; longitude: any; locationName: any; locationAddress: any }>,
  attempted: ReadonlySet<string>,
): boolean {
  return items.some((it) => (it.latitude == null || it.longitude == null) && hasItemLocation(it) && !attempted.has(it.id));
}


/**
 * NO WARD CENTROIDS (decision-maker, Oct 3, 2026 — ledger `2026-10-03-no-ward-pins`). R-w stores
 * an AI stop's location as its ward/area only, so geocoding that text alone would drop the stop on
 * the middle of the ward and present it as the place. A geocode that Google itself marks as an
 * AREA — an `APPROXIMATE` location, or a result typed as a locality, ward, neighbourhood, postal
 * code, region or country — is therefore REFUSED: the stop stays unlocated, says so on the map line
 * ("N of M located"), and is never pinned (§13). A street address or a named venue still pins.
 */
const AREA_RESULT_TYPES = new Set([
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "sublocality_level_4",
  "sublocality_level_5",
  "neighborhood",
  "colloquial_area",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "administrative_area_level_4",
  "administrative_area_level_5",
  "postal_code",
  "country",
  "political",
  "ward",
]);

export function isAreaLevelGeocode(geo: { locationType?: string | null; types?: readonly string[] | null }): boolean {
  if (geo.locationType === "APPROXIMATE") return true;
  const types = geo.types ?? [];
  return types.length > 0 && types.every((t) => AREA_RESULT_TYPES.has(t));
}

/**
 * The geocode query for an item. Its own location first; when that location is only an AREA
 * (`isAreaOnly` — e.g. "Higashiyama Ward, Kyoto", which is what R-w stores for an AI stop), the
 * item's TITLE leads the query so a named venue ("Kiyomizu-dera") can still be found inside it. A
 * title that names nothing comes back as an area and is refused by `isAreaLevelGeocode`.
 */
export function geocodeQuery(
  item: { title?: string | null; locationName: any; locationAddress: any },
  destination: string | null | undefined,
  isAreaOnly: (text: string) => boolean,
): string {
  const own = [item.locationName, item.locationAddress].filter((p) => p && String(p).trim().length > 0).map(String);
  const lead = own.length > 0 && own.every(isAreaOnly) && item.title ? [String(item.title).trim()] : [];
  return [...lead, ...own, destination].filter((p) => p && String(p).trim().length > 0).join(", ");
}
