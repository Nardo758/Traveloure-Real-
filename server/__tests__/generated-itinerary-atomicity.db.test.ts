/**
 * Real-DB regression coverage for atomic AI itinerary snapshots.
 *
 * THE FIXTURE WAS OVERTAKEN BY A RULING AND IS RESTATED, NOT WEAKENED (ledger
 * `2026-09-15-orphans-t4-t7-red-suites`). This suite used to seed its fixture trip with two
 * pre-existing items and prove that a rolled-back snapshot restored them. CLAUDE.md Locked
 * Decision 41 (b) / ledger `2026-09-05-draft-only-on-empty` has since ruled that the free AI
 * draft runs ONLY on an EMPTY slip, so `saveGeneratedItinerarySnapshot` refuses a non-empty slip
 * inside its own transaction — which made two proofs die on the refusal before they asserted
 * anything, and would have made the two `assert.rejects` proofs pass for the WRONG REASON (a
 * rejection is a rejection; nothing said it came from the trigger). Both halves are fixed here:
 * every slip is born EMPTY, and every rejection is IDENTIFIED rather than merely awaited.
 *
 * EACH TEST OWNS ITS OWN TRIP. The ruling makes slip emptiness a precondition of the rail, so a
 * suite whose tests share one trip is a suite whose tests depend on each other's leftovers —
 * a commit in one test silently disqualifies the next. A trip per test removes the ordering.
 *
 * The protection the old fixture was reaching for — "a failed rebuild never destroys the
 * traveler's rows" — is now proven by `regenerate-booking-guard.db.test.ts` G1a in the form the
 * ruling takes: the rail REFUSES a non-empty slip and changes nothing.
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
import { isAiDraftSlipHasItemsError } from "../services/ai-draft-eligibility";

/**
 * The forced failure surfaces as a drizzle wrapper ("Failed query: …") whose `cause` carries the
 * trigger's own message, so the whole chain is searched. Matching only `err.message` would have
 * looked at the wrapper and reported the wrong reason for the failure (§13) — the same class of
 * mistake as accepting any rejection at all.
 */
function isForcedComparisonFailure(err: unknown): boolean {
  for (let current: any = err, depth = 0; current && depth < 8; current = current.cause, depth += 1) {
    if (/forced AI snapshot comparison failure/.test(String(current?.message ?? current))) return true;
  }
  return false;
}
import type { NormalizedGeneratedCanonicalItem } from "../utils/generated-itinerary";

if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error("Set JOURNEY_DB_WRITES_OK=1 to run DB-writing tests");
}

const suffix = randomUUID().slice(0, 8);
const userId = `ai-atomic-${suffix}`;
let tripSeq = 0;
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
  tripId: string | null,
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

/** An EMPTY trip owned by the fixture user — LD 41 (b)'s precondition, met by construction. */
async function freshEmptyTrip(label: string): Promise<string> {
  tripSeq += 1;
  const id = `ai-atomic-trip-${suffix}-${tripSeq}`;
  await db.insert(trips).values({
    id,
    userId,
    title: `Atomic fixture ${label}`,
    destination: "Kyoto",
    startDate: "2033-05-01",
    endDate: "2033-05-03",
  } as any);
  return id;
}

async function itemTitles(tripId: string): Promise<string[]> {
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

test("a comparison failure rolls back every row the snapshot wrote", async () => {
  const tripId = await freshEmptyTrip("rollback-existing");
  await installComparisonFailureTrigger();
  try {
    // The rejection is IDENTIFIED. A bare `assert.rejects` here would also be satisfied by
    // LD 41 (b)'s own refusal, which is exactly how this proof went silent for a release.
    await assert.rejects(
      saveGeneratedItinerarySnapshot(snapshotInput("FAIL-existing", [item("Rejected new item")], tripId)),
      (err: unknown) => {
        assert.ok(!isAiDraftSlipHasItemsError(err), "this slip is empty; the refusal must be the trigger's");
        return isForcedComparisonFailure(err);
      },
    );
  } finally {
    await removeComparisonFailureTrigger();
  }

  assert.deepEqual(await itemTitles(tripId), [], "a rolled-back snapshot leaves no item rows behind");
  const plans = await db.select({ id: aiGeneratedItineraries.id })
    .from(aiGeneratedItineraries)
    .where(and(
      eq(aiGeneratedItineraries.tripId, tripId),
      eq(aiGeneratedItineraries.title, "Plan FAIL-existing"),
    ));
  const comparisons = await db.select({ id: itineraryComparisons.id })
    .from(itineraryComparisons)
    .where(and(
      eq(itineraryComparisons.tripId, tripId),
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
      (err: unknown) => {
        assert.ok(!isAiDraftSlipHasItemsError(err), "a mint has no slip to be ineligible");
        return isForcedComparisonFailure(err);
      },
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
  const tripId = await freshEmptyTrip("analytics");
  const committed = [item("Committed despite analytics failure")];
  const snapshot = await saveGeneratedItinerarySnapshot(snapshotInput("analytics", committed, tripId));

  await insertAiInteraction({
    taskType: "autonomous_itinerary",
    provider: "grok",
    userId,
    tripId: `missing-trip-${suffix}`,
    success: true,
  });

  assert.deepEqual(await itemTitles(tripId), committed.map((entry) => entry.title));
  const [plan] = await db.select({ id: aiGeneratedItineraries.id })
    .from(aiGeneratedItineraries)
    .where(eq(aiGeneratedItineraries.id, snapshot.savedItinerary.id));
  const [comparison] = await db.select({ id: itineraryComparisons.id })
    .from(itineraryComparisons)
    .where(eq(itineraryComparisons.id, snapshot.comparison.id));
  assert.ok(plan);
  assert.ok(comparison);
});

test("concurrent drafts on one empty slip leave ONE complete generation, never a mixed item set", async () => {
  // RESTATED FOR LD 41 (b), NOT WEAKENED. Two free drafts can both be ELIGIBLE only while the slip
  // is empty; the `FOR UPDATE` lock serialises them, so the loser re-reads a slip that now holds
  // the winner's rows and is refused by the ruling rather than overwriting them. The property this
  // proof has always been about — the slip never ends up holding half of each set — is unchanged,
  // and the refusal is now part of what makes that true.
  const tripId = await freshEmptyTrip("concurrent");
  const setA = [item("A one"), item("A two", 2)];
  const setB = [item("B one"), item("B two", 2), item("B three", 3)];

  const settled = await Promise.allSettled([
    saveGeneratedItinerarySnapshot(snapshotInput("A", setA, tripId)),
    saveGeneratedItinerarySnapshot(snapshotInput("B", setB, tripId)),
  ]);
  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(fulfilled.length, 1, `exactly one draft may win, received ${JSON.stringify(settled.map((r) => r.status))}`);
  assert.equal(rejected.length, 1);
  assert.ok(
    isAiDraftSlipHasItemsError(rejected[0].reason),
    `the loser must be refused by LD 41 (b), received: ${String(rejected[0].reason)}`,
  );

  const finalTitles = await itemTitles(tripId);
  const isA = JSON.stringify(finalTitles) === JSON.stringify(setA.map((entry) => entry.title));
  const isB = JSON.stringify(finalTitles) === JSON.stringify(setB.map((entry) => entry.title));
  assert.ok(isA || isB, `expected one complete set, received ${JSON.stringify(finalTitles)}`);

  // Exactly ONE plan and ONE comparison: the refused draft's rows rolled back with its transaction.
  const plans = await db.select({ title: aiGeneratedItineraries.title })
    .from(aiGeneratedItineraries)
    .where(and(
      eq(aiGeneratedItineraries.tripId, tripId),
      inArray(aiGeneratedItineraries.title, ["Plan A", "Plan B"]),
    ));
  const comparisons = await db.select({ title: itineraryComparisons.title })
    .from(itineraryComparisons)
    .where(and(
      eq(itineraryComparisons.tripId, tripId),
      inArray(itineraryComparisons.title, ["Comparison A", "Comparison B"]),
    ));
  assert.equal(plans.length, 1, "the refused draft's plan row must have rolled back");
  assert.equal(comparisons.length, 1, "the refused draft's comparison row must have rolled back");
});
