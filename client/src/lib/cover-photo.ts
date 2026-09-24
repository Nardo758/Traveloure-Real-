/**
 * The Discover location page's cover photo and its credit (board task #437, ledger
 * `2026-09-23-phase2-honesty`). Pure.
 *
 * The photo and its credit are derived TOGETHER so they can never describe different images:
 *   1. the highest-scored gem that has a photo — credited with its own attribution when it has one;
 *   2. otherwise a curated Unsplash photo for a popular city — credited to Unsplash itself, because
 *      the photographer was never recorded and a name would have to be invented (§13);
 *   3. otherwise no photo and no credit.
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

/** Credit for every CURATED_HERO_IMAGES photo: the source, linked with Unsplash's referral params. */
export const CURATED_HERO_CREDIT = {
  name: "Photo: Unsplash",
  url: "https://unsplash.com/?utm_source=traveloure&utm_medium=referral",
};

export function resolveCoverPhoto(
  gems: ReadonlyArray<{ imageUrl?: string | null; gemScore?: number | null; imageAttribution?: string | null }>,
  city: string,
): { url: string | null; credit: CoverPhotoCredit } {
  const topGem = [...gems]
    .filter((g) => !!g.imageUrl)
    .sort((a, b) => (b.gemScore ?? 0) - (a.gemScore ?? 0))[0];
  if (topGem) {
    return {
      url: topGem.imageUrl as string,
      credit: topGem.imageAttribution ? { name: topGem.imageAttribution, url: topGem.imageUrl as string } : null,
    };
  }
  const curated = CURATED_HERO_IMAGES[city.toLowerCase()];
  if (curated) return { url: curated, credit: CURATED_HERO_CREDIT };
  return { url: null, credit: null };
}
