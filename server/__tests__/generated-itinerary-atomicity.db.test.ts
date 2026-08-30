/**
 * Real-DB regression coverage for atomic AI itinerary snapshots.
 *
 * Run:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/generated-itinerary-atomicity.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  aiGeneratedItineraries,
  contentRegistry,
  itineraryComparisons,
  itineraryItems,
  trips,
  users,
} from "@shared/schema";
import {
  insertAiInteraction,
  saveGeneratedItinerarySnapshot,
} from "../services/content-query.service";
import type { NormalizedGeneratedCanonicalItem } from "../utils/generated-itinerary";

if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error("Set JOURNEY_DB_WRITES_OK=1 to run DB-writing tests");
}

const suffix = randomUUID().slice(0, 8);
const userId = `ai-atomic-${suffix}`;
const existingTripId = `ai-atomic-trip-${suffix}`;
const triggerFunction = `ai_atomic_fail_${suffix.replaceAll("-", "_")}`;
const triggerName = `ai_atomic_fail_trigger_${suffix.replaceAll("-", "_")}`;
const generatedTripTitle = `Atomic generated trip ${suffix}`;

const item = (title: string, dayNumber = 1): NormalizedGeneratedCanonicalItem => ({
  dayNumber,
  title,
  name: title,
  description: `${title} description`,
  type: "activity",
  time: "09:00",
  durationMinutes: 60,
  estimatedCost: "25.00",
  location: "Kyoto",
});

function snapshotInput(
  label: string,
  canonicalItems: NormalizedGeneratedCanonicalItem[],
  tripId: string | null = existingTripId,
) {
  return {
    userId,
    tripId,
    trip: {
      title: tripId ? `Existing ${label}` : generatedTripTitle,
      destination: "Kyoto",
      startDate: "2033-05-01",
      endDate: "2033-05-03",
      numberOfTravelers: 2,
      status: "draft",
      eventType: "vacation",
      specialRequests: null,
    },
    generatedPlan: {
      destination: "Kyoto",
      startDate: "2033-05-01",
      endDate: "2033-05-03",
      title: `Plan ${label}`,
      summary: `Summary ${label}`,
      totalEstimatedCost: "50.00",
      itineraryData: [{ day: 1, activities: canonicalItems }],
      accommodationSuggestions: [],
      packingList: [],
      travelTips: [],
      provider: "grok",
      status: "generated",
    },
    canonicalItems,
    comparison: {
      title: `Comparison ${label}`,
      destination: "Kyoto",
      startDate: "2033-05-01",
      endDate: "2033-05-03",
      budget: "1000.00",
      travelers: 2,
      status: "generating",
    },
  };
}

async function itemTitles(tripId = existingTripId): Promise<string[]> {
  const rows = await db.select({ title: itineraryItems.title })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(itineraryItems.sortOrder);
  return rows.map((row) => row.title);
}

async function installComparisonFailureTrigger(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION ${triggerFunction}()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.title LIKE 'Comparison FAIL%' THEN
        RAISE EXCEPTION 'forced AI snapshot comparison failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `));
  await db.execute(sql.raw(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON itinerary_comparisons
    FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()
  `));
}

async function removeComparisonFailureTrigger(): Promise<void> {
  await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON itinerary_comparisons`));
  await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${triggerFunction}()`));
}

before(async () => {
  await db.insert(users).values({
    id: userId,
    email: `${userId}@traveloure.test`,
    firstName: "AI",
    lastName: "Atomic",
    role: "user",
  } as any);
  await db.insert(trips).values({
    id: existingTripId,
    userId,
    title: "Existing atomic fixture",
    destination: "Kyoto",
    startDate: "2033-05-01",
    endDate: "2033-05-03",
  } as any);
  await db.insert(itineraryItems).values([
    {
      tripId: existingTripId,
      title: "Old one",
      dayNumber: 1,
      sortOrder: 0,
      origin: "ai",
    },
    {
      tripId: existingTripId,
      title: "Old two",
      dayNumber: 2,
      sortOrder: 1,
      origin: "ai",
    },
  ] as any);
});

after(async () => {
  await removeComparisonFailureTrigger().catch(() => {});
  const ownedTrips = await db.select({ id: trips.id })
    .from(trips)
    .where(eq(trips.userId, userId));
  const tripIds = ownedTrips.map((trip) => trip.id);
  if (tripIds.length > 0) await db.delete(trips).where(inArray(trips.id, tripIds)).catch(() => {});
  await db.delete(contentRegistry).where(eq(contentRegistry.ownerId, userId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  await pool.end().catch(() => {});
});

test("a comparison failure rolls back the plan and complete canonical replacement", async () => {
  await installComparisonFailureTrigger();
  try {
    await assert.rejects(
      saveGeneratedItinerarySnapshot(snapshotInput("FAIL-existing", [item("Rejected new item")])),
    );
  } finally {
    await removeComparisonFailureTrigger();
  }

  assert.deepEqual(await itemTitles(), ["Old one", "Old two"]);
  const plans = await db.select({ id: aiGeneratedItineraries.id })
    .from(aiGeneratedItineraries)
    .where(and(
      eq(aiGeneratedItineraries.tripId, existingTripId),
      eq(aiGeneratedItineraries.title, "Plan FAIL-existing"),
    ));
  const comparisons = await db.select({ id: itineraryComparisons.id })
    .from(itineraryComparisons)
    .where(and(
      eq(itineraryComparisons.tripId, existingTripId),
      eq(itineraryComparisons.title, "Comparison FAIL-existing"),
    ));
  assert.equal(plans.length, 0);
  assert.equal(comparisons.length, 0);
});

test("a mid-transaction failure also rolls back newly required trip creation", async () => {
  await installComparisonFailureTrigger();
  try {
    await assert.rejects(
      saveGeneratedItinerarySnapshot(
        snapshotInput("FAIL-new-trip", [item("Never persisted")], null),
      ),
    );
  } finally {
    await removeComparisonFailureTrigger();
  }

  const createdTrips = await db.select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.title, generatedTripTitle)));
  assert.equal(createdTrips.length, 0);
});

test("analytics failure is best-effort and cannot weaken the committed snapshot", async () => {
  const committed = [item("Committed despite analytics failure")];
  const snapshot = await saveGeneratedItinerarySnapshot(snapshotInput("analytics", committed));

  await insertAiInteraction({
    taskType: "autonomous_itinerary",
    provider: "grok",
    userId,
    tripId: `missing-trip-${suffix}`,
    success: true,
  });

  assert.deepEqual(await itemTitles(), committed.map((entry) => entry.title));
  const [plan] = await db.select({ id: aiGeneratedItineraries.id })
    .from(aiGeneratedItineraries)
    .where(eq(aiGeneratedItineraries.id, snapshot.savedItinerary.id));
  const [comparison] = await db.select({ id: itineraryComparisons.id })
    .from(itineraryComparisons)
    .where(eq(itineraryComparisons.id, snapshot.comparison.id));
  assert.ok(plan);
  assert.ok(comparison);
});

test("concurrent regenerations leave one complete generation, never a mixed item set", async () => {
  const setA = [item("A one"), item("A two", 2)];
  const setB = [item("B one"), item("B two", 2), item("B three", 3)];

  await Promise.all([
    saveGeneratedItinerarySnapshot(snapshotInput("A", setA)),
    saveGeneratedItinerarySnapshot(snapshotInput("B", setB)),
  ]);

  const finalTitles = await itemTitles();
  const isA = JSON.stringify(finalTitles) === JSON.stringify(setA.map((entry) => entry.title));
  const isB = JSON.stringify(finalTitles) === JSON.stringify(setB.map((entry) => entry.title));
  assert.ok(isA || isB, `expected one complete set, received ${JSON.stringify(finalTitles)}`);

  const plans = await db.select({ title: aiGeneratedItineraries.title })
    .from(aiGeneratedItineraries)
    .where(and(
      eq(aiGeneratedItineraries.tripId, existingTripId),
      inArray(aiGeneratedItineraries.title, ["Plan A", "Plan B"]),
    ));
  const comparisons = await db.select({ title: itineraryComparisons.title })
    .from(itineraryComparisons)
    .where(and(
      eq(itineraryComparisons.tripId, existingTripId),
      inArray(itineraryComparisons.title, ["Comparison A", "Comparison B"]),
    ));
  assert.equal(plans.length, 2);
  assert.equal(comparisons.length, 2);
});