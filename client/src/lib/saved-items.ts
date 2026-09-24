/**
 * Saved places — the two decisions every save surface shares (board #328, #330).
 *
 * `findSavedItem` answers "is this card already saved?" for the heart on a Discover card, and
 * `groupSavedByCity` shapes the Saved places shelf. Both read the rows `GET /api/saved-items`
 * returns and nothing else. Pure.
 */

export interface SavedItemRow {
  id: string;
  contentType: string;
  contentId: string;
  contentName: string;
  contentImage: string | null;
  city: string | null;
  createdAt: string | null;
}

export { SAVED_CONTENT_TYPES, type SavedContentType } from "@shared/saved-items";

/** The saved row for this card, or undefined when it is not saved. Identity is (type, id) — the
 *  same pair the table's UNIQUE constraint keys on. */
export function findSavedItem<T extends Pick<SavedItemRow, "contentType" | "contentId">>(
  rows: readonly T[] | null | undefined,
  contentType: string,
  contentId: string,
): T | undefined {
  return (rows ?? []).find((r) => r.contentType === contentType && r.contentId === contentId);
}

export interface SavedCityGroup<T> {
  /** The city as saved, or null for places saved with no city. */
  city: string | null;
  items: T[];
}

/**
 * Saved places grouped by city (#328). Cities match case- and whitespace-insensitively, and the
 * group is labelled with the first spelling seen. Groups are ordered by their most recent save, so
 * where the traveler was last looking comes first; items inside a group keep the server's order.
 * A place saved with no city goes in ONE trailing group whose city is null — it is never filed
 * under a city it was not saved with (§13).
 */
export function groupSavedByCity<T extends Pick<SavedItemRow, "city" | "createdAt">>(
  rows: readonly T[] | null | undefined,
): SavedCityGroup<T>[] {
  const byKey = new Map<string, { group: SavedCityGroup<T>; latest: number }>();
  const noCity: T[] = [];
  for (const row of rows ?? []) {
    const city = row.city?.trim();
    if (!city) {
      noCity.push(row);
      continue;
    }
    const key = city.toLowerCase();
    const at = row.createdAt ? Date.parse(row.createdAt) : NaN;
    const entry = byKey.get(key);
    if (entry) {
      entry.group.items.push(row);
      if (Number.isFinite(at) && !(at <= entry.latest)) entry.latest = at;
    } else {
      byKey.set(key, { group: { city, items: [row] }, latest: Number.isFinite(at) ? at : -Infinity });
    }
  }
  const groups = Array.from(byKey.values())
    .sort((a, b) => b.latest - a.latest)
    .map((e) => e.group);
  if (noCity.length > 0) groups.push({ city: null, items: noCity });
  return groups;
}
