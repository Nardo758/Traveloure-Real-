/**
 * Row 250 / 299a — licensed photos for the four Kyoto discover cards whose images were blank.
 *
 * Rechecked 2026-10-30 against production `/api/discover/location/Kyoto`:
 * Yoshida Sanso Ryokan, Fushimi Inari Torii Tunnel at Dawn, and Philosopher's Path
 * Canal in Autumn stored Unsplash ids that answer 404 and carry no image_credit.
 * Ginkaku-ji is stored with image_url NULL (migration 400; KYOTO_CANONICAL_GEMS
 * keeps that null — this list does not rewrite it).
 *
 * 299a: Philosopher's Path is a November autumn file (the card says autumn). Fushimi
 * Inari at Dawn is the torii tunnel at 05:48, early morning. Every credit carries
 * the Commons file page and the license URL. Months and the season table live here
 * so a title word cannot disagree with the file.
 *
 * 960px thumbs where Commons has one. The Philosopher's Path file is 768px, so
 * that card uses the file itself. A URL that is already some other photo is not
 * in `replacesUrls` and the migration leaves it alone.
 */

export interface KyotoGemPhoto {
  placeName: string;
  imageUrl: string;
  imageCredit: string;
  artist: string;
  licenseName: string;
  sourcePageUrl: string;
  licenseUrl: string;
  /** 1–12, the month the file was taken. */
  takenMonth: number;
  /** Clock time on the file, "HH:MM", when the file records one. */
  takenClock: string | null;
  /** Dawn titles accept "dawn" and "early-morning". A daytime file is "day". */
  timeOfDay: "day" | "dawn" | "early-morning";
  /**
   * Stored URLs this photo may replace, besides null, blank, and its own URL.
   * Includes the dead Unsplash id and, for the two files 299a replaced, the
   * first version of migration 420.
   */
  replacesUrls: readonly string[];
}

/** Season words in a card title, and the months that do not contradict them. */
export const KYOTO_PHOTO_SEASON_MONTHS = {
  autumn: [9, 10, 11],
  spring: [3, 4, 5],
} as const;

/** A title that says dawn may use a dawn or early-morning file, not a daytime one. */
export const KYOTO_PHOTO_DAWN_TIMES = ["dawn", "early-morning"] as const;

export function kyotoGemCredit(parts: {
  artist: string;
  licenseName: string;
  sourcePageUrl: string;
  licenseUrl: string;
}): string {
  return `${parts.artist} / Wikimedia Commons, ${parts.licenseName}. Source: ${parts.sourcePageUrl} License: ${parts.licenseUrl}`;
}

function photo(
  row: Omit<KyotoGemPhoto, "imageCredit">,
): KyotoGemPhoto {
  return {
    ...row,
    imageCredit: kyotoGemCredit(row),
  };
}

const PHILOSOPHER_PRIOR =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg/960px-The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg";
const FUSHIMI_PRIOR =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/KyotoFushimiInariLarge.jpg/960px-KyotoFushimiInariLarge.jpg";

export const KYOTO_GEM_PHOTOS: readonly KyotoGemPhoto[] = [
  photo({
    placeName: "Yoshida Sanso Ryokan",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoshida_Sanso_ac.JPG/960px-Yoshida_Sanso_ac.JPG",
    artist: "Asturio Cantabrio",
    licenseName: "CC BY-SA 4.0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Yoshida_Sanso_ac.JPG",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    takenMonth: 4,
    takenClock: null,
    timeOfDay: "day",
    replacesUrls: [
      "https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80",
    ],
  }),
  photo({
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Fushimi_Inari_Shrine_August_2019.jpg/960px-Fushimi_Inari_Shrine_August_2019.jpg",
    artist: "Sizableframe",
    licenseName: "CC0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Fushimi_Inari_Shrine_August_2019.jpg",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    takenMonth: 8,
    takenClock: "05:48",
    timeOfDay: "early-morning",
    replacesUrls: [
      "https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80",
      FUSHIMI_PRIOR,
    ],
  }),
  photo({
    placeName: "Philosopher's Path Canal in Autumn",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/0/01/Philosopher%27s_Walk_Sakyo%2C_Kyoto_-_panoramio.jpg",
    artist: "ccfarmer",
    licenseName: "CC BY 3.0",
    sourcePageUrl:
      "https://commons.wikimedia.org/wiki/File:Philosopher%27s_Walk_Sakyo,_Kyoto_-_panoramio.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    takenMonth: 11,
    takenClock: null,
    timeOfDay: "day",
    replacesUrls: [
      "https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80",
      PHILOSOPHER_PRIOR,
    ],
  }),
  photo({
    placeName: "Ginkaku-ji",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg/960px-Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg",
    artist: "Jakub Hałun",
    licenseName: "CC BY 4.0",
    sourcePageUrl:
      "https://commons.wikimedia.org/wiki/File:Ginkaku-ji_Temple,_Kyoto,_20240820_1048_4992.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    takenMonth: 8,
    takenClock: "10:48",
    timeOfDay: "day",
    replacesUrls: [],
  }),
] as const;

const BY_PLACE = new Map(KYOTO_GEM_PHOTOS.map((row) => [row.placeName, row]));

/** The licensed photo for one of the four cards, or null for every other place. */
export function kyotoGemPhoto(placeName: string): KyotoGemPhoto | null {
  return BY_PLACE.get(placeName) ?? null;
}

/**
 * A season or dawn word in the card title that the file's month or time contradicts.
 * Null means the title and the file agree, or the title names neither.
 */
export function kyotoPhotoSeasonConflict(photo: KyotoGemPhoto): string | null {
  const title = photo.placeName.toLowerCase();
  for (const [word, months] of Object.entries(KYOTO_PHOTO_SEASON_MONTHS)) {
    if (!title.includes(word)) continue;
    if (!(months as readonly number[]).includes(photo.takenMonth)) {
      return `${photo.placeName} says ${word} and was taken in month ${photo.takenMonth}`;
    }
  }
  if (title.includes("dawn") && !(KYOTO_PHOTO_DAWN_TIMES as readonly string[]).includes(photo.timeOfDay)) {
    return `${photo.placeName} says dawn and the file is ${photo.timeOfDay}`;
  }
  return null;
}
