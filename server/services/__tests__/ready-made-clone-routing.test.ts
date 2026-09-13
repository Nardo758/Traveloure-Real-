/**
 * ready-made-clone-routing.test.ts — the clone builder, exercised DIRECTLY (DB-free).
 *
 * (punchlist V-14 + V-15, ledger `2026-09-13-clone-carries-content-not-state`)
 *
 * WHAT THIS FILE USED TO BE, AND WHY IT PROVED NOTHING. It guarded §3.1 of
 * `docs/briefs/ROUTING_STATE_CONTRACT.md` — "RM-cloned items born `in_planning`" — by MIRRORING the
 * production expression: it re-typed the four-name spread and the `routing_status: "in_planning"`
 * override into its own local `cloneItem`, then asserted `cloned.routing_status`. Both the code and
 * its copy named a key drizzle does not read (`routing_status`; the column key is `routingStatus`),
 * so the test passed on its own mirror for the entire life of the defect while every real clone
 * carried the author's routing state through. A test that re-implements the thing it tests is the
 * derivation-drift class §18 rule 1 names, worn as a test file.
 *
 * It now calls `buildClonedItineraryItem` — the ONE implementation the service itself calls — and
 * asserts on the KEYS drizzle maps to columns. The real-database proof of the same rules, through
 * the actual `fulfillReadyMadePurchase`, is `server/__tests__/ready-made-clone-fields.db.test.ts`;
 * this file is the fast pure layer beside it and is deliberately not a substitute for it.
 *
 * Run: npx tsx --test server/services/__tests__/ready-made-clone-routing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildClonedItineraryItem,
  CLONE_CARRIED_FIELDS,
  CLONE_EXCLUDED_FIELDS,
  cloneFieldCoverage,
  itineraryItemColumnNames,
} from "../itinerary-item-clone";

const CLONE_TRIP_ID = "clone-trip-999";

/** A source row shaped like a real `itinerary_items` SELECT — the keys drizzle produces. */
function makeSourceItem(overrides: Record<string, unknown> = {}): any {
  return {
    id: "src-item-001",
    tripId: "src-trip-001",
    title: "Day 1: City tour",
    description: "Start at the station.",
    itemType: "activity",
    status: "planned",
    dayNumber: 1,
    sortOrder: 0,
    routingStatus: "in_planning",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

describe("ready-made clone — routing state (V-14, §3.1 ROUTING_STATE_CONTRACT)", () => {
  for (const source of ["in_planning", "with_expert", "ready_for_checkout", "purchased"]) {
    it(`source ${source} → clone lands in_planning`, () => {
      const cloned = buildClonedItineraryItem(makeSourceItem({ routingStatus: source }), CLONE_TRIP_ID);
      assert.equal(cloned.routingStatus, "in_planning",
        "a clone never inherits author-side routing; under LD 39 ready_for_checkout IS the buyer's cart");
      // The key drizzle actually reads. The whole defect was that the old override wrote a
      // DIFFERENT key beside it and the column took the source value instead.
      assert.equal((cloned as any).routing_status, undefined,
        "snake_case is not a column key — drizzle would silently drop it");
    });
  }

  it("identity and audit columns are not carried — the clone mints its own", () => {
    const cloned = buildClonedItineraryItem(makeSourceItem(), CLONE_TRIP_ID) as any;
    assert.equal(cloned.id, undefined);
    assert.equal(cloned.createdAt, undefined);
    assert.equal(cloned.updatedAt, undefined);
    assert.equal(cloned.tripId, CLONE_TRIP_ID, "and it is bound to the BUYER's trip");
  });
});

describe("ready-made clone — state does not travel (V-15)", () => {
  const loaded = makeSourceItem({
    routingStatus: "ready_for_checkout",
    status: "booked",
    bookingId: "author-booking-1",
    bookingStatus: "confirmed",
    bookingReference: "AUTHOR-REF-1",
    confirmationNumber: "AUTHOR-CONF-1",
    actualCost: "22.50",
    slotId: "author-slot-1",
    vendorContractId: "author-contract-1",
    userExperienceId: "author-event-1",
    scheduledDate: "2026-03-04",
    checkIn: "2026-03-04",
    checkOut: "2026-03-05",
    participantIds: ["author-participant-1"],
    conflictsWith: ["src-item-002"],
    backupPlanId: "src-item-002",
    privateNotes: "Seller-only note",
    attachments: [{ name: "author-voucher.pdf", url: "https://example.test/v.pdf" }],
  });

  for (const field of [
    "bookingId", "bookingStatus", "bookingReference", "confirmationNumber", "actualCost",
    "slotId", "vendorContractId", "userExperienceId",
    "scheduledDate", "checkIn", "checkOut",
    "participantIds", "conflictsWith", "backupPlanId",
    "privateNotes", "attachments", "status",
  ]) {
    it(`${field} is not carried onto a different user's item`, () => {
      const cloned = buildClonedItineraryItem(loaded, CLONE_TRIP_ID) as any;
      assert.equal(cloned[field], undefined,
        `${field}: ${CLONE_EXCLUDED_FIELDS[field] ?? "must be classified in CLONE_EXCLUDED_FIELDS"}`);
    });
  }
});

describe("ready-made clone — content does travel", () => {
  it("the plan the buyer paid for arrives intact", () => {
    const cloned = buildClonedItineraryItem(makeSourceItem({
      title: "Sunset boat tour",
      description: "Bring a jacket.",
      dayNumber: 3,
      startTime: "17:30",
      durationMinutes: 120,
      estimatedCost: "89.00",
      currency: "JPY",
      notes: "Dock B.",
      expertNote: "Ask for Kenji.",
      origin: "expert",
      sortOrder: 4,
      isBackupPlan: true,
    }), CLONE_TRIP_ID) as any;
    assert.equal(cloned.title, "Sunset boat tour");
    assert.equal(cloned.description, "Bring a jacket.");
    assert.equal(cloned.dayNumber, 3);
    assert.equal(cloned.startTime, "17:30");
    assert.equal(cloned.durationMinutes, 120);
    assert.equal(cloned.estimatedCost, "89.00", "the author's own estimate is published plan content");
    assert.equal(cloned.currency, "JPY");
    assert.equal(cloned.notes, "Dock B.");
    assert.equal(cloned.expertNote, "Ask for Kenji.", "LD 21's traveler-facing field, unlike privateNotes");
    assert.equal(cloned.origin, "expert");
    assert.equal(cloned.sortOrder, 4);
    assert.equal(cloned.isBackupPlan, true, "a fact about the content, unlike the backupPlanId pointer");
  });

  it("a value the source does not carry is not invented (§13)", () => {
    const cloned = buildClonedItineraryItem(makeSourceItem(), CLONE_TRIP_ID) as any;
    assert.equal(cloned.expertNote, undefined);
    assert.equal(cloned.locationName, undefined);
    assert.equal(cloned.estimatedCost, undefined);
  });
});

describe("ready-made clone — the allowlist is exhaustive by computation, not by memory", () => {
  it("every itinerary_items column is carried or excluded with a reason", () => {
    const { undecided, unknown } = cloneFieldCoverage();
    assert.deepEqual(undecided, [],
      `undecided itinerary_items column(s): ${undecided.join(", ")} — classify each in CLONE_CARRIED_FIELDS ` +
      `or CLONE_EXCLUDED_FIELDS. Until then the builder excludes it, which is the §19 default.`);
    assert.deepEqual(unknown, [], `stale name(s) in the clone lists: ${unknown.join(", ")}`);
    assert.equal(
      CLONE_CARRIED_FIELDS.length + Object.keys(CLONE_EXCLUDED_FIELDS).length,
      itineraryItemColumnNames().length,
      "the two lists partition the table — no column named twice",
    );
  });

  it("the builder copies ONLY allowlisted keys", () => {
    const cloned = buildClonedItineraryItem(
      makeSourceItem({ somethingNobodyClassified: "x" }) as any,
      CLONE_TRIP_ID,
    ) as any;
    assert.equal(cloned.somethingNobodyClassified, undefined,
      "an unknown key on the source row cannot reach the insert — allowlist, not denylist");
  });
});
