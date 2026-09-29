/**
 * The billboard OVERRIDE — what a tile shows once a real expert takes it (ledger
 * `2026-09-28-billboard-override-listing`, follow-up 4 to the landing reorder).
 *
 * A curated tile (`shared/landing-billboard.ts`) is unchanged: placeholder copy and a credited repo
 * photo until the decision-maker replaces it or an expert takes it. An expert takes a tile only by
 * passing the BYLINE GATE for the tile's market (approved application, claimed handle, live
 * storefront, verified neighbourhood there — decided server-side by `checkBylineEligibility`), and
 * the tile then renders that expert's LIVE LISTING: its own title, its own lines, the price the
 * listing shows everywhere else (rendered by the storefront card's own `derivePreviewPrice`, never
 * typed here), and its photo. This module holds the shape and the pure assignment rule; it reads
 * nothing.
 *
 * The override is PER MARKET AND PER TILE: a market's qualifying listings are dealt onto that
 * market's tiles in order, one distinct listing per tile, round-robin across the qualifying
 * experts so one expert does not take every tile while another qualifies. A tile left over stays
 * curated.
 */

export type BillboardRoleLabel = "Local expert" | "Service provider";

/** A listing as the override renders it — every field is the listing's own, nothing composed. */
export interface BillboardListing {
  id: string;
  title: string;
  /** The listing's own lines (its short description, else the first line of its description). */
  lines: string[];
  price: string | number | null;
  priceType: string | null;
  pricingUnit: string | null;
  showPrice: boolean;
  /** The owner's own listing photo, or null — then the tile keeps its market's credited repo photo. */
  imageUrl: string | null;
}

export interface BillboardOverride {
  tileKey: string;
  marketKey: string;
  handle: string;
  roleLabel: BillboardRoleLabel;
  listing: BillboardListing;
}

/** An image is public only when its actual source credit travels with it. */
export interface BillboardAttributedImage {
  url: string;
  attribution: string;
}

/** Billboard dispatch slot 1 keeps the legacy expert-listing override intact. */
export interface BillboardSlotOne {
  slot: 1;
  marketKey: string;
  override: BillboardOverride;
}

/** Slot 2 is a market gem whose named curator passed the market's expert byline gate. */
export interface BillboardSlotTwo {
  slot: 2;
  marketKey: string;
  handle: string;
  gem: {
    id: string;
    name: string;
    score: number;
    image?: BillboardAttributedImage;
  };
}

/** Slot 3 is a located, priced listing with a real future open slot. */
export interface BillboardSlotThree {
  slot: 3;
  marketKey: string;
  handle: string;
  listing: BillboardListing;
  nextOpenSlot: { date: string; startTime: string | null };
}

/** Discriminated union used by the landing billboard dispatch. */
export type BillboardDispatchSlot = BillboardSlotOne | BillboardSlotTwo | BillboardSlotThree;

/** Selected market is absent unless a real slot-1 expert listing anchors it. */
export interface BillboardMarketSelection {
  market: { key: string; cityName: string } | null;
  slots: BillboardDispatchSlot[];
  /** Existing curated photos are Kyoto-only; no other market is selected without credited tile inventory. */
  constraint: string;
}

/** An expert who passed the byline gate for a market, with their public listings in that market. */
export interface QualifiedExpert {
  handle: string;
  roleLabel: BillboardRoleLabel;
  listings: BillboardListing[];
}

/**
 * Pure. The listing's own lines: its short description when it has one, else the first non-empty
 * line of its description. Nothing is shortened, reworded or invented; no text ⇒ no lines (§13).
 */
export function listingLines(shortDescription: string | null | undefined, description: string | null | undefined): string[] {
  const short = shortDescription?.trim();
  if (short) return [short];
  const first = (description ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return first ? [first] : [];
}

/**
 * Pure. Deal each market's qualifying listings onto its tiles, in tile order: round-robin across
 * the qualified experts (in the order given), one distinct listing per tile. Tiles with no listing
 * left are not in the result — they stay curated.
 */
export function assignBillboardOverrides(
  tiles: ReadonlyArray<{ key: string; marketKey: string }>,
  qualifiedByMarket: ReadonlyMap<string, readonly QualifiedExpert[]>,
): BillboardOverride[] {
  const out: BillboardOverride[] = [];
  const markets = Array.from(new Set(tiles.map((t) => t.marketKey)));
  for (const marketKey of markets) {
    const experts = qualifiedByMarket.get(marketKey) ?? [];
    const queues = experts.map((e) => ({ expert: e, next: 0 }));
    const used = new Set<string>();
    let turn = 0;
    for (const tile of tiles.filter((t) => t.marketKey === marketKey)) {
      let placed = false;
      for (let tries = 0; tries < queues.length && !placed; tries++) {
        const q = queues[(turn + tries) % queues.length];
        while (q.next < q.expert.listings.length && used.has(q.expert.listings[q.next].id)) q.next++;
        if (q.next >= q.expert.listings.length) continue;
        const listing = q.expert.listings[q.next++];
        used.add(listing.id);
        out.push({ tileKey: tile.key, marketKey, handle: q.expert.handle, roleLabel: q.expert.roleLabel, listing });
        turn = (turn + tries + 1) % queues.length;
        placed = true;
      }
      if (!placed) break;
    }
  }
  return out;
}
