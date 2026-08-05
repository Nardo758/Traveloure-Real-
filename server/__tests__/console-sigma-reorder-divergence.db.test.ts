/**
 * CONSOLE-SIGMA Phase 1 — R22 divergence assertion (EXPECTED DIVERGENCE — reads as the
 * defect's pin, NOT as approval of the behavior).
 *
 * Ruling 22: the console's reorder button is a second-query-engine — assert the divergence
 * NOW; remediation ("reorder consumes the optimizer's constraint service") is a named
 * follow-up, NOT harness scope. So this test asserts the DIVERGENT behavior as a fact:
 * `itineraryIntelligenceService.optimizeOrder` (the handler behind
 * POST /api/trips/:tripId/itinerary/optimize-order) IGNORES anchors.
 *
 * Evidence pinned: optimizeOrder computes `fixedItems`/`flexibleItems` from `isFlexible`
 * and then never uses them — the final sort runs over ALL items by energy weight
 * (server/services/itinerary-intelligence.service.ts:343-362 @ main 89913e4a). A
 * non-flexible (anchored) item is therefore reordered exactly like a flexible one,
 * while the generation path repairs against applyAnchorConstraints.
 *
 * WHEN THE FOLLOW-UP LANDS this test MUST fail (the anchored item will stop moving);
 * flip it then into the positive "reorder respects anchors" assertion. That failure is
 * the deliberate tripwire, mirroring ruling 21's flip discipline.
 *
 * DB-fact discipline: seeds a real dev-DB trip + 3 itinerary items, calls the real
 * service, removes everything in `after`.
 *
 * Run with: npx tsx --test server/__tests__/console-sigma-reorder-divergence.db.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "[REDACTED_STRIPE_TEST_KEY]";
}

const { db, pool } = await import("../db");
const { eq } = await import("drizzle-orm");
const { trips, itineraryItems } = await import("../../shared/schema");
const { itineraryIntelligenceService } = await import("../services/itinerary-intelligence.service");

let tripId: string;
let anchorId: string; // non-flexible, low energy, EARLY start — the anchor that should stay first
let flexHighId: string; // flexible, very_high energy — energy sort promotes it
let flexMedId: string; // flexible, medium energy

before(async () => {
  const [trip] = await db
    .insert(trips)
    .values({ title: "Console-sigma reorder divergence trip", destination: "Lisbon", startDate: "2026-09-01", endDate: "2026-09-02" } as any)
    .returning({ id: trips.id });
  tripId = trip.id;

  const rows = await db
    .insert(itineraryItems)
    .values([
      // The anchor: fixed timing, first thing in the morning, low energy.
      { tripId, dayNumber: 1, title: "ANCHOR 08:00 timed-entry museum", startTime: "08:00", isFlexible: false, energyLevel: "low", status: "confirmed" },
      { tripId, dayNumber: 1, title: "flex hike", startTime: "15:00", isFlexible: true, energyLevel: "very_high", status: "suggested" },
      { tripId, dayNumber: 1, title: "flex cafe", startTime: "11:00", isFlexible: true, energyLevel: "medium", status: "suggested" },
    ] as any)
    .returning({ id: itineraryItems.id, title: itineraryItems.title });
  anchorId = rows.find((r) => r.title.startsWith("ANCHOR"))!.id;
  flexHighId = rows.find((r) => r.title === "flex hike")!.id;
  flexMedId = rows.find((r) => r.title === "flex cafe")!.id;
});

after(async () => {
  try {
    if (tripId) await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {}); // items cascade
  } finally {
    await pool.end().catch(() => {});
  }
});

test("R22 EXPECTED DIVERGENCE: optimizeOrder reorders a non-flexible anchor by energy weight", async () => {
  const order = await itineraryIntelligenceService.optimizeOrder(tripId, 1);
  assert.equal(order.length, 3);

  // The divergence fact: the energy sort (very_high → medium → low) governs ALL items,
  // so the 08:00 non-flexible anchor is demoted BEHIND both flexible items.
  assert.deepEqual(
    order,
    [flexHighId, flexMedId, anchorId],
    "DIVERGENCE PIN BROKE: optimizeOrder no longer reorders purely by energy — if the " +
      "anchor now holds position, the R22 follow-up (reorder consumes the optimizer's " +
      "constraint service) has landed: FLIP this test to assert anchors are respected.",
  );

  // Belt-and-braces: the anchored item did NOT keep first position despite isFlexible=false.
  assert.notEqual(order[0], anchorId, "anchor unexpectedly respected — flip this test (see above)");
});
