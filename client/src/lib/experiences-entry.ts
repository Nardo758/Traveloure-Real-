/**
 * THE /experiences START PAGE'S PURE RULES (step 8a, ledger `2026-10-06-step8a-experiences-entry`;
 * step 8 brief rev 3.1, 8a item 2; rulings 2 and 4 of the Phase 0 go).
 *
 * No React, no fetch. The page reads these; the fixture tests pin them.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import { OCCASION_GROUP_ORDER, type OccasionPickerGroup } from "@shared/experience-group";

/**
 * Ruling 4 (and the `?city=` addition): a query-string city PRE-PICKS a card only when it is an EXACT
 * match of one of the eight — the city name, or "City, Country" — compared trimmed and case-insensitive.
 * Anything else picks NOTHING: never the nearest, never a diacritic-folded guess ("Bogota" is not
 * "Bogotá"), never a substring (§13).
 */
export function exactOperatingMarket(value: string | null | undefined): OperatingMarket | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  return (
    OPERATING_MARKETS.find(
      (m) => m.cityName.toLowerCase() === v || `${m.cityName}, ${m.country}`.toLowerCase() === v,
    ) ?? null
  );
}

/** The page's preselect: `?destination=` first, then `?city=` (discover-location's links), each exact. */
export function preselectedMarket(params: URLSearchParams): OperatingMarket | null {
  return exactOperatingMarket(params.get("destination")) ?? exactOperatingMarket(params.get("city"));
}

/**
 * The nav's `?group=<key>` pre-picks that group's tab, the way `?destination=` pre-picks a city: an
 * EXACT key of the five only (ledger `2026-10-07-nav-experience-groups`). Anything else picks
 * nothing — never a nearest group. The key is never shown; the picker shows the group's label.
 */
export function preselectedGroup(params: URLSearchParams): OccasionPickerGroup | null {
  const v = params.get("group");
  return v && (OCCASION_GROUP_ORDER as readonly string[]).includes(v) ? (v as OccasionPickerGroup) : null;
}

/**
 * Ruling 2: the static Natural Earth land map (`/images/world-map.svg`, 1100×480) is a Mercator
 * projection cropped to the board's frame. Its constants are fitted to the board's own eight pin
 * positions (`docs/design/experiences-map-planner/Experiences.dc.html` `cityData`), which were "taken
 * from the same projection that drew it"; the test holds every pin within 0.5 points of the board.
 * Pins come from `OPERATING_MARKETS` lat/lng — nothing is hand-placed. Nothing is fetched or billed.
 */
export const WORLD_MAP = {
  src: "/images/world-map.svg",
  width: 1100,
  height: 480,
  credit: "Map: Natural Earth",
} as const;

const X0 = 452.57; // px at longitude 0
const PX_PER_DEG = 4.0451;
const Y0 = 376.44; // px at the equator
const R = (PX_PER_DEG * 180) / Math.PI;

/** A point's position on the map, in PERCENT of its width and height. */
export function projectToWorldMap(lat: number, lng: number): { xPct: number; yPct: number } {
  const x = X0 + PX_PER_DEG * lng;
  const y = Y0 - R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { xPct: (x / WORLD_MAP.width) * 100, yPct: (y / WORLD_MAP.height) * 100 };
}

/**
 * Ruling 3: only Kyoto and Bogotá have credited photos in the repo (`client/public/images/landing/`,
 * credits in its `ATTRIBUTION.json`). Every other city renders a TYPOGRAPHIC card — never stock, never
 * AI, never a Google photo (R-aq). The credit line is rendered with the photo.
 */
export interface CityPhoto {
  src: string;
  credit: string;
}

export const CITY_PHOTOS: Readonly<Record<string, CityPhoto>> = {
  kyoto: { src: "/images/landing/hero-kyoto-temple.jpg", credit: "Photo: Alec Doualetas / Pexels" },
  bogota: { src: "/images/landing/hero-bogota.jpg", credit: "Photo: Daniel Sarmiento / Pexels" },
};

export function cityPhotoFor(marketKey: string): CityPhoto | null {
  return CITY_PHOTOS[marketKey] ?? null;
}

/**
 * Continue enables only with BOTH answers: an occasion the catalog resolved, and one of the eight cities.
 * An occasion slug the catalog does not carry is not an answer (§13, LD 33's skip-on-the-row rule).
 */
export function canContinue(
  occasionSlug: string,
  occasions: ReadonlyArray<{ slug: string }> | null | undefined,
  marketKey: string | null | undefined,
): boolean {
  if (!occasionSlug || !(occasions ?? []).some((o) => o.slug === occasionSlug)) return false;
  return !!marketKey && OPERATING_MARKETS.some((m) => m.marketKey === marketKey);
}
