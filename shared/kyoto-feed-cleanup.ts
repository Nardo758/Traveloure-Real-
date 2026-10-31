/**
 * Kyoto feed cleanup — the name lists the migration and the fresh-boot seed both follow
 * (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * Seeds run after migrations, so an UPDATE in migration 400 matches nothing on an empty
 * database. `kyotoGemSeedOverlay` is what the popular-cities insert applies, and the pin
 * checks that migration 400's SQL still names every entry here. Ginkaku-ji's hours,
 * admission, source and checked date are the later fact from kyoto-seed-cleanup — the
 * same strings migration 421 writes. Migration 400 still names that card's prior fact.
 *
 * City-wide is `null` (no neighbourhood slug). Kurama and Kibune cards stay city-wide;
 * they are not assigned to `kurama-kibune`. Card 36 is reworded, not hidden.
 */

import {
  BAMBOO_IMAGE_URL,
  TENRYUJI_IMAGE_CREDIT,
  TENRYUJI_IMAGE_URL,
} from "./kyoto-canonical-images";
import {
  GINKAKU_ACCESS_SOURCE_URL,
  GINKAKU_ADMISSION_HELD,
  GINKAKU_AUTUMN_VIEWING_HELD,
  GINKAKU_FACT_CHECKED_ON,
  GINKAKU_HOURS_PRIOR,
} from "./kyoto-seed-cleanup";

export { BAMBOO_IMAGE_URL, TENRYUJI_IMAGE_CREDIT, TENRYUJI_IMAGE_URL };

/** Exact Kyoto `place_name` values whose cleanup action starts with HIDE. 28 names. */
export const KYOTO_GEMS_TO_HIDE = [
  "Fushimi Inari Pre-Dawn Hike",
  "Kagurazaka Ishikawa",
  "Kishiwada",
  "Tetsugaku-no-Michi (Philosopher's Path)",
  "Tofuku-ji Temple during autumn",
  "Nishiki Market alley stalls",
  "Kaguraden Cafe",
  "Yoshida-ya",
  "Nishiki Market Alley",
  "Kibune Village",
  "Nishiki Market",
  "Philosopher's Path",
  "Ganko Tako",
  "Nishiki Market side alleys",
  "Ganko Takoichi",
  "Omen Cafe",
  "Ninen-zaka and Sannen-zaka",
  "Ninenzaka and Sannenzaka",
  "Ganko Takoyaki",
  "Omen Gion",
  "Omen Arashiyama",
  "Ganko Takao Honten",
  "Gion's private tea ceremony",
  "Philosopher's Path at dusk",
  "Ninen-zaka & Sannen-zaka",
  "Pontocho evening walk",
  "Kishiwada Cafe",
  "Otagi Nenbutsu-ji",
] as const;

/**
 * Happening-now titles hidden by migration 400. #1603 removed this title from
 * the seeds. A database that already inserted the row is hidden by exact title,
 * not deleted. seed-travelpulse stamps hidden_at if the title is inserted again.
 */
export const HAPPENING_NOW_TITLES_TO_HIDE = ["Sakura Light-Up at Meguro River"] as const;

export function happeningNowTitleHidden(title: string): boolean {
  return (HAPPENING_NOW_TITLES_TO_HIDE as readonly string[]).includes(title);
}

/** Kept cards. `null` is city-wide, not a slug. */
export const KYOTO_GEM_NEIGHBORHOOD: Readonly<Record<string, string | null>> = {
  "Fushimi Inari Torii Tunnel at Dawn": "fushimi",
  "Yoshida Sanso Ryokan": null,
  "Kanga-an Temple Shojin Ryori": null,
  "Sannenzaka & Ninenzaka": "higashiyama",
  "Kurama-dera Temple": null,
  "Kibune": null,
  "Kiyomizu-dera back paths": "higashiyama",
  "Omen": null,
  "Yasaka Koshindo Temple": "higashiyama",
  "Otagi Nenbutsu-ji Temple": null,
  "Kyoto Botanical Gardens": null,
  "Kurama Onsen": null,
  "Gion's back alleys": "gion",
  "Gion's old streets": "gion",
  "Ippodo Tea Kaboku Tearoom": "kawaramachi-sanjo",
  "Tofuku-ji Temple": "fushimi",
  "Kibune Shrine": null,
  "Pontocho Alley Evening Stroll": "pontocho",
  "Nishiki Market Side Alleys": "kawaramachi-sanjo",
  "Philosopher's Path Canal in Autumn": null,
  "Tenryu-ji": "arashiyama",
  "Arashiyama Bamboo Grove": "arashiyama",
  "Ginkaku-ji": "ginkaku-ji-philosophers-path",
};

export const GION_OLD_STREETS_NAME = "Gion's old streets";
export const GION_OLD_STREETS_DESCRIPTION =
  "Walk the lanes of Gion, Kyoto's historic teahouse district, with its wooden machiya townhouses.";

export const KYOTO_ARASHIYAMA_CENTROID = { lat: "35.0158", lng: "135.6745", radiusKm: "2.20" } as const;

export const KYOTO_NEW_NEIGHBORHOODS = [
  {
    id: "kyoto-nb-ginkaku-ji",
    name: "Ginkaku-ji & Philosopher's Path",
    slug: "ginkaku-ji-philosophers-path",
    lat: "35.0225",
    lng: "135.7925",
    radiusKm: "0.90",
  },
  {
    id: "kyoto-nb-kurama-kibune",
    name: "Kurama & Kibune",
    slug: "kurama-kibune",
    lat: "35.1200",
    lng: "135.7700",
    radiusKm: "0.80",
  },
] as const;

export const UCHIDA_SOURCE_ID = "mitsuko-uchida-kyoto-2026";

export const KYOTO_CANONICAL_GEMS = [
  {
    id: "kyoto-gem-tenryu-ji",
    placeName: "Tenryu-ji",
    placeType: "temple",
    neighborhood: "arashiyama",
    description: "A Zen temple in Arashiyama, with a pond garden set against the western hills.",
    imageUrl: TENRYUJI_IMAGE_URL,
    imageCredit: TENRYUJI_IMAGE_CREDIT,
    hours: "Garden 8:30–17:00, last entry 16:50 (opens 7:30 Nov 14–30)",
    admission: "Garden ¥500 adult; buildings +¥300",
    sourceUrl: "https://www.tenryuji.com/en/",
    factCheckedOn: "2026-10-20",
  },
  {
    id: "kyoto-gem-arashiyama-bamboo-grove",
    placeName: "Arashiyama Bamboo Grove",
    placeType: "attraction",
    neighborhood: "arashiyama",
    description: "A public path through tall bamboo, a short walk from Tenryu-ji's north gate.",
    imageUrl: BAMBOO_IMAGE_URL,
    imageCredit: null,
    hours: null,
    admission: null,
    sourceUrl: null,
    factCheckedOn: null,
  },
  {
    id: "kyoto-gem-ginkaku-ji",
    placeName: "Ginkaku-ji",
    placeType: "temple",
    neighborhood: "ginkaku-ji-philosophers-path",
    description: "The Silver Pavilion temple, with a sand garden and moss paths at the start of the Philosopher's Path.",
    imageUrl: null,
    imageCredit: null,
    hours: `${GINKAKU_HOURS_PRIOR}. ${GINKAKU_AUTUMN_VIEWING_HELD}`,
    admission: GINKAKU_ADMISSION_HELD,
    sourceUrl: GINKAKU_ACCESS_SOURCE_URL,
    factCheckedOn: GINKAKU_FACT_CHECKED_ON,
  },
] as const;

/** What a fresh popular-cities insert must stamp for a Kyoto gem. Other cities are untouched. */
export function kyotoGemSeedOverlay(
  city: string,
  placeName: string,
): { hidden: boolean; neighborhood?: string | null } {
  if (city.trim().toLowerCase() !== "kyoto") return { hidden: false };
  const hidden = (KYOTO_GEMS_TO_HIDE as readonly string[]).includes(placeName);
  if (Object.prototype.hasOwnProperty.call(KYOTO_GEM_NEIGHBORHOOD, placeName)) {
    return { hidden, neighborhood: KYOTO_GEM_NEIGHBORHOOD[placeName] };
  }
  return { hidden };
}
