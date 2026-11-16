/**
 * Row 326 (M2) — a stop that names no place is a SLOT TO FILL, not a place.
 *
 * The named-place gate already decides this (`shared/place-name-gate.ts:194`, `unnamedPlaceReason`): a title
 * like "Late Dinner in Shimogyo" names a district, not a venue, so a Places lookup for it would return
 * whichever izakaya ranks first and its hours would be a fact about somewhere the traveler never chose
 * (§13). The gate is the ONE rule; this module only gives the PLAN ROW the same answer, so the row can be
 * drawn as an empty slot instead of pretending to be a mapped place.
 *
 * A placeholder is:
 *   · never GEOCODED — there is no name to look up, and `namedPlaceTokens` returns nothing for it;
 *   · never COUNTED as a place — the dot/pin and the located-place counts must skip it.
 */
import { unnamedPlaceReason } from "@shared/place-name-gate";

export type PlaceholderReason = "no_named_tokens" | "area_title";

export interface PlaceholderStopLike {
  name?: string | null;
  title?: string | null;
  locationName?: string | null;
}

/** The gate's reason, when this row is a slot rather than a place. `null` ⇒ it names a real place. */
export function placeholderStopReason(
  item: PlaceholderStopLike | null | undefined,
  city: string | null | undefined,
  areaNames: readonly string[] = [],
): PlaceholderReason | null {
  if (!item) return null;
  const title = (item.name ?? item.title ?? "").trim();
  if (!title) return "no_named_tokens";
  return unnamedPlaceReason({ title, locationName: item.locationName ?? null }, city, areaNames);
}

/** Convenience for a render: is this row an empty slot? */
export function isPlaceholderStop(item: PlaceholderStopLike | null | undefined, city: string | null | undefined, areaNames: readonly string[] = []): boolean {
  return placeholderStopReason(item, city, areaNames) !== null;
}
