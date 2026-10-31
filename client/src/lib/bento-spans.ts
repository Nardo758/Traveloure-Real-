/**
 * Row 301 (ledger `2026-10-31-bento-layout-config`): the destination-feed bento's span and packing
 * rules, moved out of `pages/discover-location.tsx` unchanged so the layout reads its numbers from
 * `BENTO_LAYOUT_CONFIG` and can be tested without rendering the page.
 */
import type { FeedItem } from "./feed-stream";
import { bentoBaseColSpan, isPartnerOrThirdPartyFeedItem, selectBentoHero } from "./bento-anchor";
import { BENTO_LAYOUT_CONFIG, type BentoLayoutConfig } from "./feed-composition-config";

/** A tile placed in the bento, carrying its resolved desktop spans. */
export interface PlacedTile {
  item: FeedItem;
  /** Original position in the neighbourhood's stream run (order-preservation proof). */
  order: number;
  colSpan: number;
  /** Taller than 1 only for the lead-expert anchor (the mock's full-section-height lead). */
  rowSpan: number;
  isAnchor: boolean;
}

/**
 * Assign spans over the desktop grid (Phase 2d rules, numbers from the config):
 *  - the anchor takes `anchorSpans.fallback`; a lead-EXPERT anchor takes `anchorSpans.expert`
 *    (the mock's full-section-height lead);
 *  - every ready-made takes `readyMadeSpan`; everything else starts at `defaultSpan`;
 *  - NO tile is ever stretched past `maxColSpan`. A mid-grid hole is avoided by widening a
 *    default-width tile in the closing row by one column (never past the cap, never a partner
 *    tile unless `partnerTiles.canWiden`); the LAST row is allowed to run short — an honest short
 *    row beats a stretched lone tile.
 * Row capacities account for the tall anchor: while it spans its rows, those rows have
 * `gridColumns - anchor width` free columns beside it. Computed purely from the tile sequence
 * (never re-ranked).
 */
export function assignBentoSpans(
  tiles: { item: FeedItem; order: number; isAnchor: boolean }[],
  config: BentoLayoutConfig = BENTO_LAYOUT_CONFIG,
): PlacedTile[] {
  const n = tiles.length;
  if (n === 0) return [];

  const maxCol = config.maxColSpan;
  const isExpertAnchor = (t: { item: FeedItem; isAnchor: boolean }) =>
    t.isAnchor && (t.item.kind === "lead-expert" || t.item.kind === "expert");

  const base = tiles.map((t) => bentoBaseColSpan(t.item, t.isAnchor, config));
  const rowSpans = tiles.map((t) =>
    t.isAnchor
      ? (isExpertAnchor(t) ? config.anchorSpans.expert : config.anchorSpans.fallback).rowSpan
      : config.defaultSpan.rowSpan,
  );

  // Pack the NON-anchor tiles (the anchor is placed first by the grid) through a row-capacity
  // sequence: the anchor leaves (grid − anchor width) free in each row it spans; rows after that
  // are full width.
  const startIdx = tiles[0]?.isAnchor ? 1 : 0;
  const besideAnchorRows = startIdx === 1 ? rowSpans[0] : 0;
  const besideAnchorCap = startIdx === 1 ? config.gridColumns - Math.min(base[0], maxCol) : config.gridColumns;
  let rowNumber = 0; // 0-based row counter for capacity lookup
  const capacityOf = (r: number) => (r < besideAnchorRows ? besideAnchorCap : config.gridColumns);
  const widenable = (idx: number) =>
    base[idx] < maxCol &&
    base[idx] === config.defaultSpan.colSpan &&
    (config.partnerTiles.canWiden || !isPartnerOrThirdPartyFeedItem(tiles[idx].item));

  let rowTiles: number[] = []; // indices (into tiles) of the current row
  let used = 0;
  const closeRow = (deficit: number) => {
    // Fill a mid-grid short row by widening ONE default-width tile per missing column (capped at
    // maxColSpan). With tile widths of 1 and 2 the deficit is always coverable.
    let need = deficit;
    for (let k = rowTiles.length - 1; k >= 0 && need > 0; k--) {
      const idx = rowTiles[k];
      if (widenable(idx)) {
        base[idx] += 1;
        need -= 1;
      }
    }
    rowTiles = [];
    used = 0;
    rowNumber += 1;
  };

  for (let i = startIdx; i < n; i++) {
    const cap = capacityOf(rowNumber);
    const s = Math.min(base[i], maxCol);
    if (used + s > cap) closeRow(cap - used);
    rowTiles.push(i);
    used += s;
    if (used === capacityOf(rowNumber)) closeRow(0);
  }
  // The FINAL row stays as-is — a short last row is fine (Phase 2d).

  return tiles.map((t, i) => ({
    item: t.item,
    order: t.order,
    colSpan: Math.min(base[i], maxCol),
    rowSpan: rowSpans[i],
    isAnchor: t.isAnchor,
  }));
}

/** The Wanted tile the renderer supplies when a section has no hero of its own. */
export function neighbourhoodWantedHeroItem(neighbourhood: any | null, city: string): FeedItem {
  const name =
    neighbourhood?.name ??
    neighbourhood?.neighborhood_name ??
    neighbourhood?.neighborhoodName ??
    city;
  const slug = String(neighbourhood?.slug ?? neighbourhood?.id ?? city ?? "city")
    .trim()
    .replace(/\s+/g, "-");
  return {
    kind: "wanted-slot",
    id: `neighbourhood-wanted-hero-${slug}`,
    data: { neighbourhoodWantedHero: true, name: String(name || slug), slug },
  };
}

/**
 * Build the ordered tile list for a neighbourhood bento from an already-TAGGED
 * run ({item, order} — order = the tile's position in the neighbourhood's
 * merged stream run, assigned BEFORE any chip/price filtering so it stays the
 * order-preservation proof). The hero floats to the front: an eligible expert,
 * else the first ready-made, else a Wanted tile. A partner card never floats
 * and never widens. Under an explicit price sort the user's sort is the order,
 * so every tile stays in place and no hero is minted.
 */
export function buildBentoTiles(
  tagged: { item: FeedItem; order: number }[],
  floatAnchor: boolean = true,
  neighbourhood: any | null = null,
  city: string = "",
  config: BentoLayoutConfig = BENTO_LAYOUT_CONFIG,
): PlacedTile[] {
  if (!floatAnchor) {
    if (tagged.length === 0) return [];
    return assignBentoSpans(tagged.map((t) => ({ ...t, isAnchor: false })), config);
  }
  if (tagged.length === 0) {
    return assignBentoSpans(
      [{ item: neighbourhoodWantedHeroItem(neighbourhood, city), order: -1, isAnchor: true }],
      config,
    );
  }
  const withAnchor = tagged.map((t) => ({ ...t, isAnchor: false }));
  const hero = selectBentoHero(withAnchor, neighbourhood, city, config);
  if (hero.index !== null && hero.index >= 0) {
    withAnchor[hero.index].isAnchor = true;
    const anchor = withAnchor[hero.index];
    const rest = withAnchor.filter((_, i) => i !== hero.index);
    return assignBentoSpans([anchor, ...rest], config);
  }
  return assignBentoSpans(
    [{ item: neighbourhoodWantedHeroItem(neighbourhood, city), order: -1, isAnchor: true }, ...withAnchor],
    config,
  );
}
