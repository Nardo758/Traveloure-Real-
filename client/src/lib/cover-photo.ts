/**
 * The Discover location page's cover photo and its credit (board task #437, ledger
 * `2026-09-23-phase2-honesty`). Pure.
 *
 * The photo and its credit are derived TOGETHER so they can never describe different images:
 *   1. the highest-scored gem that has a photo — credited by `gemPhotoCredit`;
 *   2. otherwise a curated Unsplash photo for a popular city — credited to Unsplash itself, because
 *      the photographer was never recorded and a name would have to be invented (§13);
 *   3. otherwise no photo and no credit.
 *
 * Board task #438 (ledger `2026-09-24-gem-photo-credit`, decision-maker Sep 24, 2026): gem photos
 * come only from seed files, as Unsplash CDN addresses with no photographer recorded, and a CDN
 * address is not an id the Unsplash API can look a photographer up by. So a gem photo on Unsplash's
 * CDN is credited to Unsplash — the same line as the curated photos — and any other gem photo carries
 * no credit rather than a guessed one. The `imageAttribution` field this module used to read was
 * written by nothing (no column exists) and is removed (§18c).
 */
export type CoverPhotoCredit = { name: string; url: string } | null;

/**
 * Curated hero images for popular cities — used when no gem photo is available.
 * Keys are lowercase city names.
 */
export const CURATED_HERO_IMAGES: Record<string, string> = {
  tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80",
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80",
  paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",
  london: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80",
  "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80",
  barcelona: "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80",
  rome: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80",
  amsterdam: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=1200&q=80",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  bangkok: "https://images.unsplash.com/photo-1508009603885-50cf7c8dd0d5?auto=format&fit=crop&w=1200&q=80",
  singapore: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=80",
  dubai: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80",
};

/** Credit for every Unsplash photo whose photographer was not recorded: the source, linked with
 *  Unsplash's referral params. Used for the curated heroes and for gem photos on Unsplash's CDN. */
export const CURATED_HERO_CREDIT = {
  name: "Photo: Unsplash",
  url: "https://unsplash.com/?utm_source=traveloure&utm_medium=referral",
};

/** True for an address on Unsplash's image CDN — the only host every seeded gem photo uses. */
export function isUnsplashCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "images.unsplash.com";
  } catch {
    return false;
  }
}

/** The credit for a gem photo: Unsplash for an Unsplash CDN photo, otherwise none (never a guess). */
export function gemPhotoCredit(imageUrl: string | null | undefined): CoverPhotoCredit {
  return isUnsplashCdnUrl(imageUrl) ? CURATED_HERO_CREDIT : null;
}

export function resolveCoverPhoto(
  gems: ReadonlyArray<{ imageUrl?: string | null; gemScore?: number | null }>,
  city: string,
): { url: string | null; credit: CoverPhotoCredit } {
  const topGem = [...gems]
    .filter((g) => !!g.imageUrl)
    .sort((a, b) => (b.gemScore ?? 0) - (a.gemScore ?? 0))[0];
  if (topGem) {
    return { url: topGem.imageUrl as string, credit: gemPhotoCredit(topGem.imageUrl) };
  }
  const curated = CURATED_HERO_IMAGES[city.toLowerCase()];
  if (curated) return { url: curated, credit: CURATED_HERO_CREDIT };
  return { url: null, credit: null };
}
