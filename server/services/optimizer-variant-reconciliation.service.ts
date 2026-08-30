import type { ItineraryItem } from "../itinerary-optimizer";
import type { SequencedActivity } from "./smart-sequencing.service";

export type ReconciledVariantActivity = SequencedActivity & {
  latitude?: number;
  longitude?: number;
};

function normalizedName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The same identity rule used by fixed-commitment stripping and apply-time dedupe:
 * catalog identity first, then an exact case-insensitive title match.
 */
export function isSameOptimizerItem(
  baseline: ItineraryItem,
  emitted: Pick<SequencedActivity, "providerServiceId" | "name">,
): boolean {
  if (
    baseline.providerServiceId &&
    emitted.providerServiceId === baseline.providerServiceId
  ) {
    return true;
  }

  const baselineName = normalizedName(baseline.name);
  return baselineName !== "" && normalizedName(emitted.name) === baselineName;
}

function carryThroughBaselineItem(item: ItineraryItem): ReconciledVariantActivity {
  return {
    id: item.id,
    providerServiceId: item.providerServiceId,
    latitude: item.latitude,
    longitude: item.longitude,
    name: item.name,
    serviceType: item.serviceType ?? "activity",
    startTime: item.startTime,
    endTime: item.endTime,
    duration: item.duration,
    price: item.price,
    rating: item.rating,
    location: item.location,
    dayNumber: item.dayNumber ?? 1,
    timeSlot: item.timeSlot ?? "morning",
    description: item.description,
    travelTimeFromPrevious: 0,
    isReplacement: false,
  };
}

/**
 * Enforce whole-plan completeness on one generated variant.
 *
 * Matching consumes emitted rows one-to-one so duplicate baseline stops remain distinct. An
 * emitted replacement accounts for its baseline item through the validated providerServiceId
 * threaded from originalServiceId; an unchanged/moved item accounts for it by service id or name.
 * Anything the model neither moved nor replaced is appended with its canonical baseline values.
 */
export function reconcileVariantWithBaseline(
  emittedItems: SequencedActivity[],
  baselineItems: ItineraryItem[],
): { items: ReconciledVariantActivity[]; carriedThrough: number } {
  if (baselineItems.length === 0) {
    return { items: emittedItems, carriedThrough: 0 };
  }

  const matchedEmittedIndexes = new Set<number>();
  const carried: ReconciledVariantActivity[] = [];

  for (const baselineItem of baselineItems) {
    const matchedIndex = emittedItems.findIndex(
      (emitted, index) =>
        !matchedEmittedIndexes.has(index) &&
        isSameOptimizerItem(baselineItem, emitted),
    );

    if (matchedIndex >= 0) {
      matchedEmittedIndexes.add(matchedIndex);
    } else {
      carried.push(carryThroughBaselineItem(baselineItem));
    }
  }

  return {
    items: carried.length > 0 ? [...emittedItems, ...carried] : emittedItems,
    carriedThrough: carried.length,
  };
}