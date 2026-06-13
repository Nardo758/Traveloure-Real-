/**
 * Discover feed-composition layer (Discover Feed Composition Brief, part 2).
 *
 * Merges ALL injected elements — engine recommendations, "wanted" recruitment
 * slots, the lead-expert card — into the organic feed stream as ONE
 * interleaved feed, replacing the old stacked blocks (lead expert + 3 wanted
 * slots + segregated "RECOMMENDED FOR YOU" list above the feed).
 *
 * Contract (the trust guardrail, one layer above the engine's dominance test):
 *  - THE LAYER PLACES, IT DOES NOT RE-RANK. Recommendations are consumed in
 *    the engine's ranked order, strictly sequentially. Nothing here may
 *    reorder, drop-and-reinsert, or revenue-prioritize them. The contextual
 *    "place near related content" nudge only shifts WHERE the next-in-order
 *    item lands (one slot early, next to a related organic item) — never
 *    WHICH item comes next.
 *  - Cadence: ~1 recommendation per `recCadence` organic items. Leftover
 *    recommendations that don't fit the cadence are dropped, never crammed —
 *    injected content must not dominate organic content.
 *  - Wanted slots are capped (`wantedSlotMax`) and spaced
 *    (`wantedSlotSpacing` organic items apart) — no wall of "Apply" cards.
 *  - Lead expert: once, near the top (after the first organic item).
 *  - At most one injected element after any organic item, so injected cards
 *    are never stacked adjacent.
 *
 * Cadence, cap, spacing, and label copy are admin-configurable
 * platform_settings rows served by GET /api/feed-composition-config —
 * the values here are code fallbacks, not policy.
 */

import { gemCategory, type FeedItem } from "./feed-stream";

export interface FeedRecommendation {
  offeringId: string;
  categoryKey: string;
  displayName: string;
  tagline: string | null;
  reason?: string;
  sourceType?: "platform_provider" | "affiliate";
}

export interface FeedCompositionConfig {
  /** Organic items per engine recommendation (~3–4 per the brief). */
  recCadence: number;
  /** Max wanted/recruitment slots in the whole feed (0 disables them). */
  wantedSlotMax: number;
  /** Min organic items between wanted slots (≈ one per screen). */
  wantedSlotSpacing: number;
  /** Honest-disclosure copy for engine picks. */
  recommendedLabel: string;
  /** Distinct marker copy for paid affiliate placements. */
  affiliateLabel: string;
}

/** Code fallbacks — live values come from platform_settings rows
 *  (feed_rec_cadence, feed_wanted_slot_max, feed_wanted_slot_spacing,
 *  feed_rec_label, feed_rec_affiliate_label). */
export const DEFAULT_FEED_COMPOSITION_CONFIG: FeedCompositionConfig = {
  recCadence: 4,
  wantedSlotMax: 2,
  wantedSlotSpacing: 6,
  recommendedLabel: "Recommended",
  affiliateLabel: "Paid partner",
};

/**
 * Default relatedness check for the placement nudge: a recommendation is
 * "related" to an organic gem when its category/display keywords line up
 * with the gem's spine category (a photographer near photo-spot gems).
 */
export function defaultIsRelated(item: FeedItem, rec: FeedRecommendation): boolean {
  if (item.kind !== "loose-gem") return false;
  const cat = gemCategory(item.data?.placeType);
  const k = `${rec.categoryKey} ${rec.displayName}`.toLowerCase();
  switch (cat) {
    case "photo_spots":
      return /photo/.test(k);
    case "eat":
      return /chef|food|culinary|dining|restaurant|tasting/.test(k);
    case "stay":
      return /transport|driver|transfer/.test(k);
    case "do":
      return /tour|guide|activit|experience/.test(k);
    default:
      return false;
  }
}

export interface ComposeFeedOpts {
  /** The organic stream from buildFeedStream — order untouched. */
  organic: FeedItem[];
  /** Engine candidates IN RANKED ORDER — consumed sequentially, never reordered. */
  recommendations: FeedRecommendation[];
  /** Recruitment slot payloads (page-shaped); capped + spaced here. */
  wantedSlots: any[];
  /** Lead-expert payload, or null when the market has no experts. */
  leadExpert: any | null;
  config?: FeedCompositionConfig;
  /** Optional relatedness hook for the placement nudge. */
  isRelated?: (item: FeedItem, rec: FeedRecommendation) => boolean;
}

/**
 * Shape of a wanted/recruitment slot with optional demand enrichment.
 * The demand fields are populated by the discover page from /api/services/demand.
 */
export interface WantedSlotData {
  offeringLabel: string;
  offeringKey: string;
  neighborhoodName: string;
  city: string;
  neighborhoodId: string;
  /** Number of travellers who have requested this offering in this neighbourhood. */
  demandCount?: number;
  dateContext?: string;
}

/**
 * Positional-args wrapper around composeFeedStream for use by the discover page.
 * Adapts WantedSlotData[] (with demand enrichment) to the wantedSlots shape.
 */
export function composeDiscoverFeed(
  organic: FeedItem[],
  recommendations: FeedRecommendation[],
  wantedSlotsData: WantedSlotData[],
  leadExpert: any | null,
  config?: Partial<FeedCompositionConfig>,
  isRelated?: (item: FeedItem, rec: FeedRecommendation) => boolean,
): FeedItem[] {
  return composeFeedStream({
    organic,
    recommendations,
    wantedSlots: wantedSlotsData,
    leadExpert,
    config: { ...DEFAULT_FEED_COMPOSITION_CONFIG, ...config },
    isRelated,
  });
}

export function composeFeedStream(opts: ComposeFeedOpts): FeedItem[] {
  const cfg = opts.config ?? DEFAULT_FEED_COMPOSITION_CONFIG;
  const cadence = Math.max(1, Math.floor(cfg.recCadence));
  const spacing = Math.max(1, Math.floor(cfg.wantedSlotSpacing));
  const wantedCap = Math.max(0, Math.floor(cfg.wantedSlotMax));

  const slotQueue = [...opts.wantedSlots];
  const recs = opts.recommendations;

  const out: FeedItem[] = [];
  let leadPlaced = !opts.leadExpert;
  let recIndex = 0;
  let wantedPlaced = 0;
  let sinceRec = 0;
  let sinceWanted = 0;
  let highDemandEarlyDone = false;
  const HIGH_DEMAND_THRESHOLD = 5;
  const HIGH_DEMAND_EARLY_POS = 8;

  // Degenerate case: no organic stream to interleave into (empty market).
  // Emit the injected elements once, in priority order, still capped.
  if (opts.organic.length === 0) {
    if (!leadPlaced) out.push({ kind: "lead-expert", id: "lead-expert", data: opts.leadExpert });
    recs.forEach((rec, i) =>
      out.push({ kind: "recommendation", id: `rec-${i}`, data: { candidate: rec, recIndex: i } }),
    );
    if (wantedCap > 0 && slotQueue.length > 0) {
      out.push({ kind: "wanted-slot", id: "wanted-0", data: slotQueue[0] });
    }
    return out;
  }

  for (const item of opts.organic) {
    out.push(item);
    sinceRec++;
    sinceWanted++;

    // At most ONE injection per organic item: injected cards never stack.
    if (!leadPlaced) {
      // Lead expert: once, near the top.
      out.push({ kind: "lead-expert", id: "lead-expert", data: opts.leadExpert });
      leadPlaced = true;
      continue;
    }

    const nextRec = recs[recIndex];
    if (
      nextRec &&
      (sinceRec >= cadence ||
        // Contextual nudge: land one slot early when the item just emitted is
        // related to the NEXT-IN-ORDER recommendation. Shifts placement only;
        // the consumption order is strictly recIndex-sequential.
        (sinceRec >= cadence - 1 && opts.isRelated?.(item, nextRec) === true))
    ) {
      out.push({
        kind: "recommendation",
        id: `rec-${recIndex}`,
        data: { candidate: nextRec, recIndex },
      });
      recIndex++;
      sinceRec = 0;
      continue;
    }

    // High-demand early injection: slots with ≥5 demandCount jump to ~position 8.
    if (!highDemandEarlyDone && out.length >= HIGH_DEMAND_EARLY_POS) {
      const highDemandIdx = slotQueue.findIndex((s) => (s.demandCount ?? 0) >= HIGH_DEMAND_THRESHOLD);
      if (highDemandIdx >= 0 && wantedPlaced < wantedCap) {
        const [slot] = slotQueue.splice(highDemandIdx, 1);
        out.push({ kind: "wanted-slot", id: `wanted-${wantedPlaced}`, data: slot });
        wantedPlaced++;
        sinceWanted = 0;
        highDemandEarlyDone = true;
        continue;
      }
    }

    if (wantedPlaced < wantedCap && slotQueue.length > 0 && sinceWanted >= spacing) {
      out.push({ kind: "wanted-slot", id: `wanted-${wantedPlaced}`, data: slotQueue.shift() });
      wantedPlaced++;
      sinceWanted = 0;
    }
  }

  return out;
}
