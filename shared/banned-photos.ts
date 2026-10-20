/**
 * SH-1 item 6 (R-01) — photos that must never render, whatever their licence (ledger `2026-10-20-sh1-banned-photos`).
 *
 * Kiyomizu-dera and Kinkaku-ji do not allow their images to be used, so no card carries one. The DATABASE side is the
 * per-place block (`place_photo_blocks`, CS-1 item 1): the approver blocks each temple by name and city in admin, and
 * every read hides the photo. This list is the BACKSTOP for a photo whose row names some other place — the factcheck
 * found these temples on cards titled "Sannenzaka", "Kibune Shrine" or "Pontocho". A listed photo is hidden on every
 * read and never fetched or stored again; nothing is deleted.
 *
 * Ids are the photo service's own: Unsplash `photo-<id>` (the numeric part, which every size variant shares) and
 * Pexels `/photos/<id>/`. A photo on another host is not covered (stated negative space).
 */

export interface BannedPhoto {
  host: "unsplash" | "pexels";
  id: string;
  /** What the photo shows — why it is banned. */
  shows: "Kiyomizu-dera" | "Kinkaku-ji";
}

export const BANNED_PHOTOS: readonly BannedPhoto[] = [
  { host: "unsplash", id: "1637679105331", shows: "Kiyomizu-dera" },
  { host: "pexels", id: "36717832", shows: "Kiyomizu-dera" },
  { host: "unsplash", id: "1578469645742", shows: "Kiyomizu-dera" },
  { host: "unsplash", id: "1707474893587", shows: "Kiyomizu-dera" },
  { host: "unsplash", id: "1733060742148", shows: "Kiyomizu-dera" },
  // Dropped regardless of the factcheck's "confirm" (SH-1 item 6 ruling): a pagoda over the city at dusk.
  { host: "unsplash", id: "1545569341", shows: "Kiyomizu-dera" },
  { host: "unsplash", id: "1675384201068", shows: "Kinkaku-ji" },
  { host: "unsplash", id: "1503640538573", shows: "Kinkaku-ji" },
];

const UNSPLASH = new Set(BANNED_PHOTOS.filter((p) => p.host === "unsplash").map((p) => p.id));
const PEXELS = new Set(BANNED_PHOTOS.filter((p) => p.host === "pexels").map((p) => p.id));

/** Pure. The banned photo a URL (or a bare Unsplash `photo-<id>` key) points at, or null. */
export function bannedPhotoIn(url: string | null | undefined): BannedPhoto | null {
  if (typeof url !== "string" || !url) return null;
  const unsplash = /photo-(\d{6,})(?:-[0-9a-f]+)?/g;
  for (let m = unsplash.exec(url); m; m = unsplash.exec(url)) {
    if (UNSPLASH.has(m[1])) return BANNED_PHOTOS.find((p) => p.host === "unsplash" && p.id === m[1]) ?? null;
  }
  const pexels = /pexels\.com\/photos\/(\d+)\//g;
  for (let m = pexels.exec(url); m; m = pexels.exec(url)) {
    if (PEXELS.has(m[1])) return BANNED_PHOTOS.find((p) => p.host === "pexels" && p.id === m[1]) ?? null;
  }
  return null;
}

/** Pure. True when the URL points at a banned photo. */
export function isBannedPhotoUrl(url: string | null | undefined): boolean {
  return bannedPhotoIn(url) !== null;
}

/**
 * The places whose photos are blocked, for the seed/static scan only. The database blocks are the approver's rows
 * (`place_photo_blocks`); seed and static files ship before any row exists, so the scan reads this list with the SAME
 * name rule (`blockFor`). Keep it to the places a ruling names.
 */
export const STATIC_PHOTO_BLOCKED_PLACES: readonly { name: string; city: string }[] = [
  { name: "Kiyomizu-dera", city: "Kyoto" },
  { name: "Kinkaku-ji", city: "Kyoto" },
];
