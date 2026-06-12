/**
 * Discover feed composition layer.
 *
 * Merges organic feed items with injected content (recommendations, wanted-slots,
 * lead expert) into a single interleaved stream. This layer places — it does NOT
 * re-rank. The engine's candidate order is preserved exactly.
 *
 * Cadence + cap values default to the values seeded by migration 067
 * (feed_rec_cadence=4, feed_wanted_slot_max=2, feed_wanted_slot_spacing=6).
 * Callers may override with admin-fetched values.
 */

import type { FeedItem, FeedItemKind } from "./feed-stream";
import type { UpsellCandidate } from "@/components/UpsellSlot";

export interface WantedSlotData {
  offeringLabel: string;
  offeringKey: string;
  neighborhoodName: string;
  city: string;
  neighborhoodId: string;
  /** Number of travellers who have requested this offering in this city. */
  demandCount?: number;
}

export interface FeedCompositionConfig {
  recCadence: number;
  wantedSlotMax: number;
  wantedSlotSpacing: number;
  recLabel: string;
  recAffiliateLabel: string;
}

export const DEFAULT_COMPOSITION_CONFIG: FeedCompositionConfig = {
  recCadence: 4,
  wantedSlotMax: 2,
  wantedSlotSpacing: 6,
  recLabel: "Recommended",
  recAffiliateLabel: "Sponsored",
};

/**
 * Compose a single interleaved feed stream from organic items + injected content.
 *
 * Rules:
 * - Lead expert: placed once at index ≤ 2 (after first organic item when possible).
 * - Recommendations: interleaved every `recCadence` organic items in engine rank order.
 * - Wanted-slots: capped at `wantedSlotMax`, spaced at least `wantedSlotSpacing`
 *   organic items apart. Never stacked consecutively.
 *
 * The composition layer places. It does NOT re-rank or re-order engine candidates.
 */
export function composeDiscoverFeed(
  organicItems: FeedItem[],
  recommendations: UpsellCandidate[],
  wantedSlots: WantedSlotData[],
  leadExpert: any | null,
  config: Partial<FeedCompositionConfig> = {},
): FeedItem[] {
  const cfg: FeedCompositionConfig = { ...DEFAULT_COMPOSITION_CONFIG, ...config };

  const result: FeedItem[] = [];
  let expertInserted = false;

  const recQueue = [...recommendations];
  let organicSinceLastRec = 0;
  let recIdx = 0; // Opaque sequential ID for recommendation cards — never exposes raw offeringId

  let wantedInserted = 0;
  let organicSinceLastWanted = 0;

  const leadExpertId = leadExpert?.id ?? leadExpert?.userId ?? leadExpert?.user_id ?? null;

  for (let i = 0; i < organicItems.length; i++) {
    const item = organicItems[i];

    if (!expertInserted && leadExpert && i === 1) {
      result.push({
        kind: "expert" as FeedItemKind,
        id: `lead-expert-${leadExpert.id ?? "unknown"}`,
        data: { ...leadExpert, isLeadExpert: true },
      });
      expertInserted = true;
    }

    // Skip organic expert items that duplicate the injected lead expert card
    if (
      leadExpertId != null &&
      item.kind === "expert" &&
      (item.data?.id ?? item.data?.userId ?? item.data?.user_id) === leadExpertId
    ) {
      continue;
    }

    result.push(item);

    const isOrganic =
      item.kind !== "recommendation" &&
      item.kind !== "wanted-slot" &&
      item.kind !== "city-separator";

    if (isOrganic) {
      organicSinceLastRec++;
      organicSinceLastWanted++;

      if (recQueue.length > 0 && organicSinceLastRec >= cfg.recCadence) {
        const rec = recQueue.shift()!;
        result.push({
          kind: "recommendation" as FeedItemKind,
          id: `rec-${recIdx++}`, // opaque index — never exposes raw offeringId in DOM
          data: {
            ...rec,
            label: cfg.recLabel,
            affiliateLabel: cfg.recAffiliateLabel,
          },
        });
        organicSinceLastRec = 0;
      }

      if (
        wantedSlots.length > wantedInserted &&
        wantedInserted < cfg.wantedSlotMax &&
        organicSinceLastWanted >= cfg.wantedSlotSpacing
      ) {
        const slot = wantedSlots[wantedInserted];
        result.push({
          kind: "wanted-slot" as FeedItemKind,
          id: `wanted-${slot.neighborhoodId}-${wantedInserted}`,
          data: slot,
        });
        wantedInserted++;
        organicSinceLastWanted = 0;
      }
    }
  }

  if (!expertInserted && leadExpert) {
    result.unshift({
      kind: "expert" as FeedItemKind,
      id: `lead-expert-${leadExpert.id ?? "unknown"}`,
      data: { ...leadExpert, isLeadExpert: true },
    });
  }

  return result;
}
