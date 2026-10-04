/**
 * Photos are facts (surface spec v1.3.4 R-aq, §6; step 6 — ledger `2026-10-04-step6-trip-card`).
 * Every image carries its origin, licence and attribution, and is rendered WITH that attribution.
 * Sources, in order, and the first that answers wins:
 *   ours        — a platform listing's own image (the host's), no lookup
 *   wikimedia   — Wikimedia Commons, a freely licensed file near the place, CACHED in `place_photos`
 *   google_live — a Google Place Photo fetched live per render, CAPPED, NEVER stored
 *   (none)      — no image; never stock, never AI-made, never another place's photo (§13)
 * Pure — the resolver's deps do the I/O.
 */

export const PHOTO_SOURCES = ["ours", "wikimedia", "google_live"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];
/** Only these are ever rows in `place_photos`; a Google photo is live-only (R-aq). */
export const STORED_PHOTO_SOURCES = ["ours", "wikimedia"] as const;

export interface PhotoView {
  source: PhotoSource;
  url: string;
  licence: string | null;
  /** The line rendered with the image — who made it, under what licence, from where. */
  attribution: string;
  /** Where the attribution links (the Commons file page, the Google Maps place). */
  sourceUrl: string | null;
}

/**
 * Commons files we may show: Creative Commons (any CC licence carries its attribution) or public
 * domain / CC0. Anything else — "fair use", unknown, all-rights-reserved — is refused, not guessed.
 */
export function isUsableCommonsLicence(shortName: string | null | undefined): boolean {
  const s = (shortName ?? "").trim();
  if (!s) return false;
  return /^CC[\s-]/i.test(s) || /^CC0\b/i.test(s) || /^public domain$/i.test(s) || /^PD\b/i.test(s);
}

const stripTags = (html: string | null | undefined): string =>
  String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function commonsAttribution(input: { artist?: string | null; licence: string }): string {
  const who = stripTags(input.artist);
  return `${who ? `${who} · ` : ""}${input.licence} · Wikimedia Commons`;
}

export const GOOGLE_PHOTO_ATTRIBUTION_PREFIX = "Google Maps";
export function googlePhotoAttribution(authors: readonly string[]): string {
  const who = authors.map((a) => a.trim()).filter(Boolean).slice(0, 2).join(", ");
  return who ? `${who} · ${GOOGLE_PHOTO_ATTRIBUTION_PREFIX}` : GOOGLE_PHOTO_ATTRIBUTION_PREFIX;
}

export interface CommonsCandidate {
  title: string; // "File:Kinkaku-ji 2019.jpg"
  url: string;
  descriptionUrl?: string | null;
  licence?: string | null;
  artist?: string | null;
  /** Metres from the place, when the search said. */
  distanceM?: number | null;
}

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !["the", "and", "temple", "shrine", "park", "market", "museum", "file", "jpg", "jpeg", "png"].includes(w));

/**
 * Pick the Commons file for a place: a freely licensed file whose title names the place (a word of
 * the place's name in the file's title), nearest first. A file near the place that does NOT name it
 * is not this place's photo and is never used (§13 — a photo of the shop next door is a wrong fact).
 */
export function pickCommonsPhoto(candidates: readonly CommonsCandidate[], placeName: string): CommonsCandidate | null {
  const want = words(placeName);
  if (!want.length) return null;
  const ok = candidates
    .filter((c) => isUsableCommonsLicence(c.licence) && /\.(jpe?g|png|webp)$/i.test(c.title))
    .filter((c) => {
      const have = new Set(words(c.title));
      return want.some((w) => have.has(w));
    })
    .sort((a, b) => (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY));
  return ok[0] ?? null;
}

export interface PhotoPlace {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  /** A platform listing's own image, when the item is one. */
  ownImage?: string | null;
  /**
   * R297: a Google photo REFERENCE from the facts cache (stored by the regular Places lookup). The
   * resolver never fetches one: with none cached, the Google source is skipped and the stop falls
   * through to "none" until the next regular lookup stores one.
   */
  photoRef?: { name: string; authors: ReadonlyArray<{ displayName: string; uri: string | null }> } | null;
}

/** The `place_photos` cache key: the Google place id when known, else name + rounded point. */
export function photoCacheKey(p: PhotoPlace): string | null {
  if (p.placeId) return p.placeId;
  if (p.lat == null || p.lng == null || !p.name.trim()) return null;
  return `geo:${p.lat.toFixed(4)},${p.lng.toFixed(4)}:${words(p.name).join("-")}`.slice(0, 250);
}

export interface PhotoResolveDeps {
  /** A cached Commons row: `undefined` = never looked; `null` = looked, none usable (a remembered miss). */
  cacheGet: (key: string) => Promise<PhotoView | null | undefined>;
  cacheSet: (key: string, photo: PhotoView | null) => Promise<void>;
  commons: (p: PhotoPlace) => Promise<CommonsCandidate[] | null>;
  /** Live Google photo from a CACHED reference — the Place Photo media call only; called only when the
   *  cap allows. Never stored. */
  googleLive: ((p: PhotoPlace & { photoRef: NonNullable<PhotoPlace["photoRef"]> }) => Promise<PhotoView | null>) | null;
  googleAllowed: () => Promise<boolean>;
  wikimediaEnabled: () => boolean;
}

/** The ONE order (R-aq). Never throws: a failed source is a miss and the next one is asked. */
export async function resolvePlacePhoto(p: PhotoPlace, deps: PhotoResolveDeps): Promise<PhotoView | null> {
  if (p.ownImage && /^https?:\/\//i.test(p.ownImage)) {
    return { source: "ours", url: p.ownImage, licence: null, attribution: "From the host's listing", sourceUrl: null };
  }
  const key = photoCacheKey(p);
  if (key && deps.wikimediaEnabled() && p.lat != null && p.lng != null) {
    try {
      const cached = await deps.cacheGet(key);
      if (cached) return cached;
      if (cached === undefined) {
        const found = pickCommonsPhoto((await deps.commons(p)) ?? [], p.name);
        const view: PhotoView | null = found
          ? {
              source: "wikimedia",
              url: found.url,
              licence: found.licence ?? null,
              attribution: commonsAttribution({ artist: found.artist, licence: found.licence ?? "" }),
              sourceUrl: found.descriptionUrl ?? null,
            }
          : null;
        await deps.cacheSet(key, view);
        if (view) return view;
      }
    } catch {
      /* a failed Commons read is a miss */
    }
  }
  // R297: only with a reference already in the facts cache — the resolver never asks Places for one.
  if (deps.googleLive && p.photoRef?.name) {
    try {
      if (await deps.googleAllowed()) return await deps.googleLive({ ...p, photoRef: p.photoRef });
    } catch {
      /* a failed live photo is a miss */
    }
  }
  return null;
}
