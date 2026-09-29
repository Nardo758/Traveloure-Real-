/**
 * landing-billboard.ts — the three tiles of the landing hero's billboard (landing reorder,
 * ledger `2026-09-28-landing-reorder`, dispatch item 5).
 *
 * CURATED, NOT LIVE. Each tile is an occasion in a market, told on a repo photo the platform has
 * the rights to (client/public/images/landing/, credited in that folder's ATTRIBUTION.json). The
 * former demo-listing images are unsourced and are not used; the billboard never reads `users`
 * or `provider_services` for its content again.
 *
 * What a tile does NOT carry, on purpose: an expert name, a price, "Plan with <name>", an
 * avatar. The label says what it is — a representative photo of a market — and an initial
 * appears only when a REAL expert takes the tile (the byline-gate override, resolved server-side
 * per market; until one passes, the tile stays curated).
 *
 * CREDITS ARE NEVER TYPED HERE. `resolveBillboardCredit` reads the photo's ATTRIBUTION.json entry;
 * a photo with no entry resolves to null and the tile is not rendered.
 */

export interface BillboardTile {
  key: string;
  /** A seeded `experience_types` slug — the occasion the tile's button pre-sets on the new slip. */
  occasionSlug: string;
  /** The occasion as the tile names it (the eyebrow before the market). */
  occasionLabel: string;
  /** An occasion-specific planning action for a curated fallback (never a listing/booking claim). */
  actionLabel: string;
  /** An operating market's key (shared/operating-markets.ts). */
  marketKey: string;
  /** A path under client/public — must have an ATTRIBUTION.json entry. */
  imagePath: string;
  headline: string;
  lines: readonly [string, string, string];
}

export const BILLBOARD_TILES: readonly BillboardTile[] = [
  {
    key: "weekend-away",
    occasionSlug: "travel",
    occasionLabel: "Weekend away",
    actionLabel: "Plan a weekend away",
    marketKey: "kyoto",
    imagePath: "/images/landing/hero-generic-expert.jpg",
    headline: "Two days in Kyoto, walked with a local",
    lines: [
      "Day 1 · Higashiyama lanes before the crowds",
      "Evening · a Pontochō dinner, booked for you",
      "Day 2 · Arashiyama, then the slow train back",
    ],
  },
  {
    key: "early-start",
    occasionSlug: "travel",
    occasionLabel: "Early start",
    actionLabel: "Plan an early start",
    marketKey: "kyoto",
    imagePath: "/images/landing/hero-fushimi-inari.jpg",
    headline: "Fushimi Inari at first light",
    lines: ["06:30 · in before the tour buses", "The upper shrines, on quiet paths", "Breakfast by the station after"],
  },
  {
    key: "date-night",
    occasionSlug: "date-night",
    occasionLabel: "Date night",
    actionLabel: "Plan a date night",
    marketKey: "kyoto",
    imagePath: "/images/landing/hero-kyoto-temple.jpg",
    headline: "An evening under the Yasaka Pagoda",
    lines: ["Dusk walk up Sannenzaka", "Kaiseki dinner for two", "Lantern-lit lanes on the way back"],
  },
];

/** One ATTRIBUTION.json entry, as the file states it. */
export interface PhotoAttribution {
  file: string;
  creator: string;
  source: string;
  title?: string;
  creatorUrl?: string;
  license?: string;
  licenseUrl?: string;
}

export interface BillboardCredit {
  creator: string;
  site: string;
  source: string;
}

/** "pexels.com" → "Pexels"; "unsplash.com" → "Unsplash". Null for a malformed source. */
export function siteNameFromSource(source: string): string | null {
  try {
    const host = new URL(source).hostname.toLowerCase().replace(/^www\./, "");
    const label = host.split(".")[0];
    if (!label) return null;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return null;
  }
}

/** The credit for a tile's photo, from its ATTRIBUTION.json entry — or null (tile not rendered). */
export function resolveBillboardCredit(
  imagePath: string,
  attributions: readonly PhotoAttribution[],
): BillboardCredit | null {
  const file = imagePath.split("/").pop() ?? "";
  const entry = attributions.find((a) => a.file === file);
  if (!entry || !entry.creator || !entry.creator.trim()) return null;
  const site = siteNameFromSource(entry.source);
  if (!site) return null;
  return { creator: entry.creator, site, source: entry.source };
}

/** The tile's label: always "REPRESENTATIVE PHOTO · <MARKET>" unless a real expert takes it. */
export function billboardLabel(marketName: string): string {
  return `Representative photo · ${marketName}`;
}

/*
 * The per-tile OVERRIDE (a byline-gated expert's live listing) lives in
 * shared/landing-billboard-override.ts, so this curated file never describes listing data.
 */
