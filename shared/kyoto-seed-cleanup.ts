/**
 * Row 300a — Kyoto discover seed cleanup.
 *
 * The popular-cities seed is what a fresh boot inserts. Migration 421 writes the
 * same strings onto rows that already exist. Migration 400's canonical card stays
 * the historical insert; this module is the later fact.
 *
 * Two traveler-facing sentences are HELD for the owner. They are constants here
 * so the seed, the migration and the pull request name the same words.
 * Checked 2026-10-31:
 *   hours and the elementary/junior high fee — https://www.shokoku-ji.jp/en/ginkakuji/access/
 *   autumn viewing 1 Nov–5 Dec 2026 — https://www.shokoku-ji.jp/ginkakuji/event/
 * Photo credits use the row 299a shape: Commons file page and license URL.
 */

import { kyotoGemCredit } from "./kyoto-gem-photos";
import {
  BAMBOO_IMAGE_URL,
  KYOTO_CANONICAL_GEMS,
  TENRYUJI_IMAGE_CREDIT,
  TENRYUJI_IMAGE_URL,
} from "./kyoto-feed-cleanup";

const ginkaku = KYOTO_CANONICAL_GEMS.find((row) => row.placeName === "Ginkaku-ji");
if (!ginkaku?.hours || !ginkaku.admission) {
  throw new Error("Ginkaku-ji canonical hours and admission are the prior fact");
}

export const YOSHIDA_SANSO_ADDRESS = "59-1 Yoshida Shimooji-cho";
export const YOSHIDA_SANSO_ADDRESS_PRIOR = "59-1 Yoshida Shimoadachi-cho, Sakyo Ward, Kyoto";

/** HELD. Replaces "school ¥500". Official English page says "Primary and Middle School Students 500 yen". */
export const GINKAKU_ADMISSION_HELD = "Adult ¥1,000; elementary and junior high ¥500";
export const GINKAKU_ADMISSION_PRIOR = ginkaku.admission;

/** HELD. The autumn special viewing period. The URL is the temple event page, not extra wording. */
export const GINKAKU_AUTUMN_VIEWING_HELD = "Autumn viewing Nov 1 – Dec 5";
export const GINKAKU_AUTUMN_SOURCE_URL = "https://www.shokoku-ji.jp/ginkakuji/event/";
export const GINKAKU_ACCESS_SOURCE_URL = "https://www.shokoku-ji.jp/en/ginkakuji/access/";
export const GINKAKU_FACT_CHECKED_ON = "2026-10-31";
export const GINKAKU_HOURS_PRIOR = ginkaku.hours;
export const GINKAKU_HOURS =
  `${GINKAKU_HOURS_PRIOR}. ${GINKAKU_AUTUMN_VIEWING_HELD} (${GINKAKU_AUTUMN_SOURCE_URL})`;

export const FUSHIMI_DAWN_DESCRIPTION =
  "The lower torii tunnel photographed empty, backlit by the first sun slicing through the orange gates.";
export const FUSHIMI_DAWN_DESCRIPTION_PRIOR =
  "The lower torii tunnel photographed empty at 5am, backlit by the first sun slicing through the orange gates. Arguably the best photo opportunity in all of Japan.";
export const FUSHIMI_DAWN_WHY = "At dawn it is yours alone and lit like a film set.";
export const FUSHIMI_DAWN_WHY_PRIOR =
  "By 9am this exact spot has 200 people queuing. At dawn it is yours alone and lit like a film set.";

export const PHILOSOPHER_DESCRIPTION =
  "The canal-side path connecting Nanzen-ji to Ginkaku-ji. The red maple canopy over the water is arguably more beautiful than sakura season.";
export const PHILOSOPHER_DESCRIPTION_PRIOR =
  "The canal-side path connecting Nanzen-ji to Ginkaku-ji. Less visited in autumn than spring, the red maple canopy over the water is arguably more beautiful than sakura season.";

export const PRE_DAWN_DESCRIPTION =
  "The 10,000 torii path is magical. Arriving at 4:30am means walking the full summit trail in mist and candlelight.";
export const PRE_DAWN_DESCRIPTION_PRIOR =
  "The 10,000 torii path is magical but overcrowded by 8am. Arriving at 4:30am means walking the full summit trail completely alone in mist and candlelight.";
export const PRE_DAWN_WHY = "Dawn at the summit is a genuinely spiritual experience.";
export const PRE_DAWN_WHY_PRIOR =
  "Dawn at the summit is a genuinely spiritual experience. Most tourists only do the first 30 minutes.";
export const PRE_DAWN_BEST_FOR_REMOVED = "avoiding crowds";

export const PONTOCHO_WHY_PRIOR =
  "The pre-dinner golden hour with lanterns just lit and no crowds is the most photogenic moment in all Kyoto.";

export interface KyotoCopyFix {
  placeName: string;
  column: "description" | "why_locals_love_it" | "address";
  prior: string;
  /** Null clears the column. The crowd line was the whole value. */
  next: string | null;
}

export const KYOTO_COPY_FIXES: readonly KyotoCopyFix[] = [
  {
    placeName: "Yoshida Sanso Ryokan",
    column: "address",
    prior: YOSHIDA_SANSO_ADDRESS_PRIOR,
    next: YOSHIDA_SANSO_ADDRESS,
  },
  {
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    column: "description",
    prior: FUSHIMI_DAWN_DESCRIPTION_PRIOR,
    next: FUSHIMI_DAWN_DESCRIPTION,
  },
  {
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    column: "why_locals_love_it",
    prior: FUSHIMI_DAWN_WHY_PRIOR,
    next: FUSHIMI_DAWN_WHY,
  },
  {
    placeName: "Philosopher's Path Canal in Autumn",
    column: "description",
    prior: PHILOSOPHER_DESCRIPTION_PRIOR,
    next: PHILOSOPHER_DESCRIPTION,
  },
  {
    placeName: "Fushimi Inari Pre-Dawn Hike",
    column: "description",
    prior: PRE_DAWN_DESCRIPTION_PRIOR,
    next: PRE_DAWN_DESCRIPTION,
  },
  {
    placeName: "Fushimi Inari Pre-Dawn Hike",
    column: "why_locals_love_it",
    prior: PRE_DAWN_WHY_PRIOR,
    next: PRE_DAWN_WHY,
  },
  {
    placeName: "Pontocho Alley Evening Stroll",
    column: "why_locals_love_it",
    prior: PONTOCHO_WHY_PRIOR,
    next: null,
  },
];

export interface KyotoRemainingGemPhoto {
  placeName: string;
  imageUrl: string;
  imageCredit: string;
  sourcePageUrl: string;
  licenseUrl: string;
  /** Stored URLs this photo may replace, besides its own URL. */
  replacesUrls: readonly string[];
  /** When true, a null credit on this exact URL is filled and the URL is not changed. */
  creditOnly: boolean;
}

function remainingPhoto(
  row: Omit<KyotoRemainingGemPhoto, "imageCredit"> & { artist: string; licenseName: string },
): KyotoRemainingGemPhoto {
  const { artist, licenseName, ...rest } = row;
  return {
    ...rest,
    imageCredit: kyotoGemCredit({
      artist,
      licenseName,
      sourcePageUrl: row.sourcePageUrl,
      licenseUrl: row.licenseUrl,
    }),
  };
}

/**
 * Kyoto gems that still lacked a source page and a license URL after row 299a.
 * Tenryu-ji and the bamboo grove keep the file migration 400 stored.
 * Ippodo, Nishiki and Kanga-an replace the Unsplash file with a Commons file of that place.
 * The hidden pre-dawn Unsplash file is not here: its photographer page was not resolved.
 */
export const KYOTO_REMAINING_GEM_PHOTOS: readonly KyotoRemainingGemPhoto[] = [
  remainingPhoto({
    placeName: "Tenryu-ji",
    imageUrl: TENRYUJI_IMAGE_URL,
    artist: "Marco Almbauer",
    licenseName: "CC BY-SA 4.0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Tenryū-ji_Garten.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    replacesUrls: [],
    creditOnly: true,
  }),
  remainingPhoto({
    placeName: "Arashiyama Bamboo Grove",
    imageUrl: BAMBOO_IMAGE_URL,
    artist: "Erol Ahmed",
    licenseName: "CC0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Arashiyama_Bamboo_Grove_(Unsplash).jpg",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    replacesUrls: [],
    creditOnly: true,
  }),
  remainingPhoto({
    placeName: "Ippodo Tea Kaboku Tearoom",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1a/Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg",
    artist: "yomi955",
    licenseName: "CC BY 2.0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    replacesUrls: [
      "https://images.unsplash.com/photo-1569144157591-c60f3f82f137?auto=format&fit=crop&w=800&q=80",
    ],
    creditOnly: false,
  }),
  remainingPhoto({
    placeName: "Nishiki Market Side Alleys",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg/960px-A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg",
    artist: "Joli Rumi",
    licenseName: "CC BY-SA 4.0",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:A_view_of_Nishiki_Market,_Kyoto,_Japan.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    replacesUrls: [
      "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=800&q=80",
    ],
    creditOnly: false,
  }),
  remainingPhoto({
    placeName: "Kanga-an Temple Shojin Ryori",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg/960px-Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg",
    artist: "Hyppolyte de Saint-Rambert",
    licenseName: "CC BY 4.0",
    sourcePageUrl:
      "https://commons.wikimedia.org/wiki/File:Kanga-an_Zuishizan_(Kyoto_Kita-Ku)_Temple_hdsr_S5_05.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    replacesUrls: [
      "https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=800&q=80",
    ],
    creditOnly: false,
  }),
  remainingPhoto({
    placeName: "Kusho Myōjin Shrine at Ninna-ji",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg",
    artist: "Carles Tomás Martí",
    licenseName: "CC BY 2.0",
    sourcePageUrl:
      "https://commons.wikimedia.org/wiki/File:Kusho_Myōjin_shrine,_Ninna-ji_temple,_Kyoto_-_Oct_25,_2009.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    replacesUrls: [],
    creditOnly: true,
  }),
];

const REMAINING_BY_PLACE = new Map(KYOTO_REMAINING_GEM_PHOTOS.map((row) => [row.placeName, row]));

/** A credited photo for a Kyoto gem row 299a did not cover, or null. */
export function kyotoRemainingGemPhoto(placeName: string): KyotoRemainingGemPhoto | null {
  return REMAINING_BY_PLACE.get(placeName) ?? null;
}

/** The short Tenryu-ji credit migration 400 stored. 421 replaces it with the URL form. */
export const TENRYUJI_IMAGE_CREDIT_PRIOR = TENRYUJI_IMAGE_CREDIT;
