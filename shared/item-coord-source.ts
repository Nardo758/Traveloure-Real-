/**
 * GC-1 (ledger `2026-10-17-gc1-google-coords`; migration 387): where a plan item's own coordinate came from.
 *
 * `itinerary_items.coord_source` is text, nullable, no default, no CHECK (the value set is app-enforced here).
 * **NULL = Google** (decision-maker, Oct 16, 2026): every coordinate written before 387 came from a Google Places
 * pick or the Google Geocoding API, or from somewhere nobody recorded, and is read as Google. New writes stamp
 * `places` (a Google Places pick) or `geocode_google` (the Google Geocoding API). No writer stamps a non-Google
 * value yet, so no item coordinate is non-Google today.
 *
 * Until an item's coordinate is non-Google, it is never drawn on a non-Google rendering: the Ready-Made map share
 * format is not served, and the slip's Leaflet fallback shows the day as a list.
 */
import { z } from "zod";

/** The values a write may stamp today. Both are Google. */
export const GOOGLE_COORD_SOURCES = ["places", "geocode_google"] as const;
export type GoogleCoordSource = (typeof GOOGLE_COORD_SOURCES)[number];

/** True only for a stamped source that is not Google. NULL and every Google value ⇒ false. */
export function isNonGoogleCoordSource(source: string | null | undefined): boolean {
  if (source == null || source === "") return false;
  return !(GOOGLE_COORD_SOURCES as readonly string[]).includes(source);
}

/**
 * True when every located point in the list has a non-Google source, and there is at least one. A point whose
 * source is unknown (NULL) is Google.
 */
export function everyLocatedPointNonGoogle(points: ReadonlyArray<{ located: boolean; coordSource: string | null | undefined }>): boolean {
  const located = points.filter((p) => p.located);
  return located.length > 0 && located.every((p) => isNonGoogleCoordSource(p.coordSource));
}

/**
 * §19: the ONE admission of a client-stated source on the item create and edit rails. It admits only the Google
 * values, so a body can mark its coordinate as Google and can never claim a non-Google one. Anything else ⇒
 * absent (the write stores NULL, which reads as Google).
 */
export const itineraryItemCoordSourceSchema = z.object({ coordSource: z.enum(GOOGLE_COORD_SOURCES) }).pick({ coordSource: true });

export function admitItemCoordSource(body: unknown): GoogleCoordSource | undefined {
  const parsed = itineraryItemCoordSourceSchema.safeParse(body ?? {});
  return parsed.success ? parsed.data.coordSource : undefined;
}
