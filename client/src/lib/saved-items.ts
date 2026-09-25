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

import { savedCityKey, type SaveItemBody } from "@shared/saved-items";

export { SAVED_CONTENT_TYPES, savedCityKey, type SavedContentType } from "@shared/saved-items";

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
    const key = savedCityKey(row.city);
    if (!key) {
      noCity.push(row);
      continue;
    }
    const city = row.city!.trim();
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

/**
 * The save body for a card, or null when the card has nothing to save under (no id or no name —
 * a save with a blank name would render as an empty tile on the shelf, §13). ONE place bounds the
 * display cache to the server's allowlist (`saveItemBodySchema`), so every card saves the same way.
 */
export function buildSaveItem(input: {
  contentType: SaveItemBody["contentType"];
  contentId: unknown;
  name: unknown;
  image?: unknown;
  city?: unknown;
}): SaveItemBody | null {
  const contentId = input.contentId == null ? "" : String(input.contentId).trim().slice(0, 255);
  const contentName = typeof input.name === "string" ? input.name.trim().slice(0, 255) : "";
  if (!contentId || !contentName) return null;
  const image = typeof input.image === "string" ? input.image.trim() : "";
  const city = typeof input.city === "string" ? input.city.trim().slice(0, 100) : "";
  return {
    contentType: input.contentType,
    contentId,
    contentName,
    contentImage: image && image.length <= 2000 && /^(https?:\/\/|\/)/i.test(image) ? image : null,
    city: city || null,
  };
}

/** The public address of a share link (board #329). */
export function sharedSavedPlacesPath(token: string): string {
  return `/saved/shared/${encodeURIComponent(token)}`;
}

/**
 * The city keys a plan is in (board #329): its headline `trips.destination` and every stop's
 * name and city, each also read up to its first comma, so a plan headed to "Kyoto, Japan" matches
 * places saved under "Kyoto". Nothing is guessed beyond that — no country match, no nearby city.
 */
export function planCityKeys(
  destination: string | null | undefined,
  stops: ReadonlyArray<{ name?: string | null; city?: string | null }> | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    for (const candidate of [value, value?.split(",")[0]]) {
      const key = savedCityKey(candidate);
      if (key) keys.add(key);
    }
  };
  add(destination);
  for (const stop of stops ?? []) {
    add(stop.name);
    add(stop.city);
  }
  return keys;
}

/** The traveler's saved places in this plan's cities, in saved order. No city ⇒ never matched. */
export function savedPlacesForPlan<T extends Pick<SavedItemRow, "city">>(
  rows: readonly T[] | null | undefined,
  destination: string | null | undefined,
  stops: ReadonlyArray<{ name?: string | null; city?: string | null }> | null | undefined,
): T[] {
  const keys = planCityKeys(destination, stops);
  if (keys.size === 0) return [];
  return (rows ?? []).filter((r) => {
    const key = savedCityKey(r.city);
    return key != null && keys.has(key);
  });
}

/** Whether the plan already holds an item with this place's name (case/space-insensitive). A
 *  display hint only — it never blocks an add, since two places can share a name. */
export function planHasItemNamed(itemNames: readonly string[], name: string): boolean {
  const key = savedCityKey(name);
  return key != null && itemNames.some((n) => savedCityKey(n) === key);
}
