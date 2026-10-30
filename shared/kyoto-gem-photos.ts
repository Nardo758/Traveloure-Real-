/**
 * Row 250 — licensed photos for the four Kyoto discover cards whose images were blank.
 *
 * Rechecked 2026-10-30 against production `/api/discover/location/Kyoto`:
 * Yoshida Sanso Ryokan, Fushimi Inari Torii Tunnel at Dawn, and Philosopher's Path
 * Canal in Autumn stored Unsplash ids that answer 404 and carry no image_credit.
 * Ginkaku-ji is stored with image_url NULL (migration 400; KYOTO_CANONICAL_GEMS
 * keeps that null — this list does not rewrite it).
 *
 * Each replacement is a Wikimedia Commons file already in the license set this
 * repo uses (see Tenryu-ji in migration 400). 960px thumbs, not the multi-megabyte
 * originals. Credits are the Commons artist plus the license short name.
 * A URL that is already some other photo is not in `replacesUrl` and the migration
 * leaves it alone.
 */

export interface KyotoGemPhoto {
  placeName: string;
  imageUrl: string;
  imageCredit: string;
  /** The stored URL this photo may replace. Null means only a null or blank URL. */
  replacesUrl: string | null;
}

export const KYOTO_GEM_PHOTOS: readonly KyotoGemPhoto[] = [
  {
    placeName: "Yoshida Sanso Ryokan",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoshida_Sanso_ac.JPG/960px-Yoshida_Sanso_ac.JPG",
    imageCredit: "Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0",
    replacesUrl:
      "https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80",
  },
  {
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/KyotoFushimiInariLarge.jpg/960px-KyotoFushimiInariLarge.jpg",
    imageCredit: "Paul Vlaar / Wikimedia Commons, CC BY-SA 3.0",
    replacesUrl:
      "https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80",
  },
  {
    placeName: "Philosopher's Path Canal in Autumn",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg/960px-The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg",
    imageCredit: "shankar s. / Wikimedia Commons, CC BY 2.0",
    replacesUrl:
      "https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80",
  },
  {
    placeName: "Ginkaku-ji",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg/960px-Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg",
    imageCredit: "Jakub Hałun / Wikimedia Commons, CC BY 4.0",
    replacesUrl: null,
  },
] as const;

const BY_PLACE = new Map(KYOTO_GEM_PHOTOS.map((row) => [row.placeName, row]));

/** The licensed photo for one of the four cards, or null for every other place. */
export function kyotoGemPhoto(placeName: string): KyotoGemPhoto | null {
  return BY_PLACE.get(placeName) ?? null;
}
