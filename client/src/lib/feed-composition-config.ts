/**
 * Row 301 (ledger `2026-10-31-bento-layout-config`): the destination-feed bento's composition rules,
 * stated once. `bento-anchor.ts` (hero order, anchor priority, base spans) and `bento-spans.ts`
 * (row packing) read these values instead of literals, so a layout change is an edit here and
 * nowhere else. The values below reproduce the layout as it was before this file existed.
 *
 * Feed membership and cadence (recommendation cadence, wanted-slot spacing) are a different
 * concern and stay in `feed-composition.ts` (`DEFAULT_FEED_COMPOSITION_CONFIG`).
 */

/** An expert's anchor priority, most local first. */
export type BentoAnchorPriority = "neighborhood-local" | "city-local" | "planner";

/** What may head a section, tried in order. "wanted" falls back to a Wanted tile the renderer supplies. */
export type BentoHeroKind = "expert" | "ready-made" | "wanted";

export interface BentoSpan {
  colSpan: number;
  rowSpan: number;
}

export interface BentoLayoutConfig {
  /** Columns in the desktop grid. */
  gridColumns: number;
  /** No tile is ever wider than this. */
  maxColSpan: number;
  /** Expert anchor priority, most preferred first. */
  anchorPriorityOrder: readonly BentoAnchorPriority[];
  /** Which tile heads a section, tried in this order. */
  heroOrder: readonly BentoHeroKind[];
  /** Spans of the section's lead tile: an expert anchor, and any other anchor. */
  anchorSpans: { expert: BentoSpan; fallback: BentoSpan };
  /** Span of every ready-made (package) tile that is not the anchor. */
  readyMadeSpan: BentoSpan;
  /** Span of every other tile. */
  defaultSpan: BentoSpan;
  /** Partner, affiliate and third-party tiles. */
  partnerTiles: {
    /** A partner tile may head a section. */
    canAnchor: boolean;
    /** A partner tile may be widened to close a short row. */
    canWiden: boolean;
    /** Partner tiles allowed in one section. null = no limit (row 304b sets this). */
    maxPerGroup: number | null;
  };
}

export const BENTO_LAYOUT_CONFIG: BentoLayoutConfig = {
  gridColumns: 4,
  maxColSpan: 2,
  anchorPriorityOrder: ["neighborhood-local", "city-local", "planner"],
  heroOrder: ["expert", "ready-made", "wanted"],
  anchorSpans: {
    expert: { colSpan: 2, rowSpan: 2 },
    fallback: { colSpan: 2, rowSpan: 1 },
  },
  readyMadeSpan: { colSpan: 2, rowSpan: 1 },
  defaultSpan: { colSpan: 1, rowSpan: 1 },
  partnerTiles: {
    canAnchor: false,
    canWiden: false,
    maxPerGroup: null,
  },
};
