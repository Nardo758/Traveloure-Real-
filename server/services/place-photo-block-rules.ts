/**
 * CS-1 item 1 — the per-place no_photos MATCH RULE, with no database import (ledger `2026-10-18-cs1-source-signoff`;
 * split out by SH-1 item 6, ledger `2026-10-20-sh1-banned-photos`, so the seed/static scan and pure tests read the ONE
 * rule). `place-photo-blocks.service.ts` re-exports everything here; it alone reads and writes the table.
 */
import type { PlacePhotoBlock } from "@shared/schema";
import { matchNormalisedName, normalisedNameTokens } from "./item-osm-regeocode.service";

/** Pure. A city as compared: folded case and accents, trimmed. */
export function foldCity(city: string | null | undefined): string {
  return (city ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Pure. The stored form of a place name: its normalised distinctive words, sorted, joined by a space. */
export function normalisePlaceName(name: string, city: string | null | undefined): string {
  return Array.from(normalisedNameTokens(name, city)).sort().join(" ");
}

export type PhotoBlockRow = Pick<PlacePhotoBlock, "id" | "placeId" | "placeNameNormalised" | "city" | "reason">;

/** What a photo belongs to: the place ids it carries, and the names (with the city) its row gives. */
export interface PhotoSubject {
  placeIds?: ReadonlyArray<string | null | undefined>;
  names?: ReadonlyArray<string | null | undefined>;
  city?: string | null;
}

/** Pure. The block that hides this photo, or null. A name with no city never matches a name block (both keys are needed). */
export function blockFor(blocks: readonly PhotoBlockRow[], subject: PhotoSubject): PhotoBlockRow | null {
  const ids = new Set((subject.placeIds ?? []).filter((x): x is string => !!x && x.trim() !== "").map((x) => x.trim()));
  for (const b of blocks) if (b.placeId && ids.has(b.placeId)) return b;
  const city = foldCity(subject.city);
  if (!city) return null;
  const names = (subject.names ?? []).filter((n): n is string => !!n && n.trim() !== "");
  if (!names.length) return null;
  for (const b of blocks) {
    if (!b.placeNameNormalised || foldCity(b.city) !== city) continue;
    for (const n of names) {
      if (matchNormalisedName(b.placeNameNormalised, normalisedNameTokens(n, subject.city), subject.city)) return b;
    }
  }
  return null;
}

