import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryItem } from "../itinerary-optimizer";
import type { SequencedActivity } from "../services/smart-sequencing.service";
import {
  isSameOptimizerItem,
  reconcileVariantWithBaseline,
} from "../services/optimizer-variant-reconciliation.service";

const baseline: ItineraryItem[] = [
  {
    id: "planning-catalog",
    providerServiceId: "service-1",
    name: "Gion walking tour",
    description: "Original description",
    serviceType: "tour",
    price: 80,
    rating: 4.9,
    location: "Gion",
    latitude: 35.0037,
    longitude: 135.7788,
    duration: 120,
    dayNumber: 1,
    startTime: "09:00",
    endTime: "11:00",
    timeSlot: "morning",
  },
  {
    id: "planning-free-text",
    name: "Tea with a local host",
    description: "Traveler-authored stop",
    serviceType: "experience",
    price: 25,
    location: "Higashiyama",
    duration: 60,
    dayNumber: 2,
    startTime: "14:00",
    endTime: "15:00",
    timeSlot: "afternoon",
  },
  {
    id: "checkout-catalog",
    providerServiceId: "service-3",
    name: "Reserved kaiseki dinner",
    serviceType: "dining",
    price: 150,
    location: "Pontocho",
    duration: 90,
    dayNumber: 2,
    startTime: "19:00",
    endTime: "20:30",
    timeSlot: "evening",
    mustRetain: true,
  },
];

function emitted(
  overrides: Partial<SequencedActivity> & Pick<SequencedActivity, "name">,
): SequencedActivity {
  return {
    serviceType: "experience",
    dayNumber: 1,
    isReplacement: false,
    ...overrides,
  };
}

describe("reconcileVariantWithBaseline — whole-plan completeness", () => {
  it("carries through unchanged every optimizable baseline item a variant neither moved nor replaced", () => {
    const modelVariants: SequencedActivity[][] = [
      [
        emitted({
          name: "Gion walking tour",
          providerServiceId: "service-1",
          dayNumber: 2,
        }),
      ],
      [
        emitted({
          name: "Alternative Gion guide",
          providerServiceId: "service-1",
          isReplacement: true,
          replacementReason: "A better fit",
        }),
        emitted({ name: "Tea with a local host", dayNumber: 3 }),
      ],
      [emitted({ name: "New lantern-making workshop" })],
    ];

    const returnedVariants = modelVariants.map(
      items => reconcileVariantWithBaseline(items, baseline).items,
    );

    for (const [index, variant] of returnedVariants.entries()) {
      const missing = baseline.filter(
        baselineItem => !variant.some(item => isSameOptimizerItem(baselineItem, item)),
      );
      assert.deepEqual(
        missing,
        [],
        `variant ${index + 1} must not omit any in_planning or ready_for_checkout baseline item`,
      );
    }

    const carriedFreeText = returnedVariants[0].find(
      item => item.id === "planning-free-text",
    );
    assert.deepEqual(
      carriedFreeText,
      {
        id: "planning-free-text",
        providerServiceId: undefined,
        latitude: undefined,
        longitude: undefined,
        name: "Tea with a local host",
        serviceType: "experience",
        startTime: "14:00",
        endTime: "15:00",
        duration: 60,
        price: 25,
        rating: undefined,
        location: "Higashiyama",
        dayNumber: 2,
        timeSlot: "afternoon",
        description: "Traveler-authored stop",
        travelTimeFromPrevious: 0,
        isReplacement: false,
      },
      "an omitted baseline item is carried through with canonical values and kept semantics",
    );
  });

  it("consumes matches one-to-one so duplicate baseline stops cannot collapse into one emitted row", () => {
    const duplicates: ItineraryItem[] = [
      { id: "first", name: "Coffee stop", dayNumber: 1 },
      { id: "second", name: "Coffee stop", dayNumber: 2 },
    ];

    const result = reconcileVariantWithBaseline(
      [emitted({ name: "Coffee stop" })],
      duplicates,
    );

    assert.equal(result.carriedThrough, 1);
    assert.equal(result.items.length, 2);
    assert.ok(result.items.some(item => item.id === "second"));
  });
});