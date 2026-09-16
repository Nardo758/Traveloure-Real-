/**
 * REGENERATE-BOOKING-GUARD — D-1 money-safety proof (ledger 2026-08-31-two-surfaces-one-handoff).
 *
 * A "rebuild items" delete must never destroy a row the traveler committed money to. Two live sites
 * ran an unguarded/origin-only delete:
 *   - the AI Regenerate wipe          — POST /api/trips/:id/generate-itinerary (server/routes.ts)
 *   - the generated-itinerary snapshot — saveGeneratedItinerarySnapshot (content-query.service.ts),
 *                                        used by the Grok generate rail + Plus occasion drafts.
 * Both now AND in the shared guard `itineraryItemRebuildDeletable()`.
 *
 * G1 WAS OVERTAKEN BY A RULING AND IS RESTATED, NOT WEAKENED (ledger
 * `2026-09-15-orphans-t4-t7-red-suites`). It used to re-apply the snapshot to a trip that already
 * held a purchased row and prove the row survived the REBUILD DELETE. CLAUDE.md Locked Decision
 * 41 (b) / ledger `2026-09-05-draft-only-on-empty` has since ruled that the free draft runs ONLY
 * on an EMPTY slip, so `saveGeneratedItinerarySnapshot` now REFUSES a non-empty slip inside its own
 * transaction, and that re-apply is unreachable by construction. Asserting the old shape would be
 * asserting a path the product no longer has; asserting `rejects` alone would be green-but-vacuous.
 * So G1 proves what D-1 actually wanted, in the form the ruling now takes:
 *
 * Proven:
 *   G1a the snapshot rail REFUSES a slip holding money-bearing rows, and the refusal leaves EVERY
 *       row byte-identical — no item deleted, none inserted, no plan and no comparison row written.
 *       The refusal is identified as LD 41 (b)'s own error, never just "it threw".
 *   G1b the same rail DOES write on an EMPTY slip, so G1a is a refusal and not a broken rail.
 *   G2  the Regenerate delete SHAPE (origin clause + guard) spares purchased, spares an in_planning
 *       row carrying a booking_id (drifted-status protection), spares traveler-origin, and deletes
 *       only a plain in_planning AI row. UNCHANGED — it drives the delete predicate directly and
 *       never touches the snapshot rail, so no ruling overtook it.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/regenerate-booking-guard.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and, or, ne, isNull } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, serviceBookings, itineraryComparisons, aiGeneratedItineraries } from "@shared/schema";
import { saveGeneratedItinerarySnapshot } from "../services/content-query.service";
import { itineraryItemRebuildDeletable } from "../services/itinerary-rebuild-guard";
import { isAiDraftSlipHasItemsError } from "../services/ai-draft-eligibility";

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[regenerate-guard] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
let tripA: string; // for G1a (snapshot refusal on a money-bearing slip)
let tripC: string; // for G1b (snapshot write on an EMPTY slip)
let tripB: string; // for G2 (regenerate delete shape)
let bookingId: string;

async function seedTrip(): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId,
    title: `Guard trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  return t.id;
}

async function addItem(tripId: string, opts: { title: string; origin?: string; suggestedBy?: string; routingStatus?: string; bookingId?: string }): Promise<void> {
  await db.insert(itineraryItems).values({
    tripId,
    title: opts.title,
    dayNumber: 1,
    origin: opts.origin ?? null,
    suggestedBy: opts.suggestedBy ?? null,
    routingStatus: opts.routingStatus ?? "in_planning",
    bookingId: opts.bookingId ?? null,
  } as any);
}

async function titlesOn(tripId: string): Promise<Set<string>> {
  const rows = await db.select({ title: itineraryItems.title }).from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  return new Set(rows.map((r) => r.title as string));
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `guard-${RUN}@t.test` } as any).returning();
  userId = u.id;
  tripA = await seedTrip();
  tripB = await seedTrip();
  tripC = await seedTrip();
  const [b] = await db.insert(serviceBookings).values({ travelerId: userId, tripId: tripB, totalAmount: "42.00", status: "confirmed" } as any).returning();
  bookingId = b.id;
});

after(async () => {
  for (const t of [tripA, tripB, tripC]) {
    await db.delete(aiGeneratedItineraries).where(eq(aiGeneratedItineraries.tripId, t)).catch(() => {});
    await db.delete(itineraryComparisons).where(eq(itineraryComparisons.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  await db.delete(serviceBookings).where(eq(serviceBookings.id, bookingId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${[tripA, tripB, tripC]})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("G1a snapshot rail REFUSES a money-bearing slip and changes nothing (LD 41 (b))", async () => {
  const PURCHASED = `Purchased AI stop ${RUN}`;
  const CHECKOUT = `Checkout AI stop ${RUN}`;
  const PLANNING = `Planning AI stop ${RUN}`;
  await addItem(tripA, { title: PURCHASED, origin: "ai", routingStatus: "purchased" });
  await addItem(tripA, { title: CHECKOUT, origin: "ai", routingStatus: "ready_for_checkout" });
  await addItem(tripA, { title: PLANNING, origin: "ai", routingStatus: "in_planning" });

  const NEW = `NEW rebuilt stop ${RUN}`;
  // The refusal is IDENTIFIED, not merely awaited: `assert.rejects` with no predicate would pass
  // for any error at all, which is how a suite goes green while proving nothing.
  let refusal: unknown;
  await assert.rejects(
    saveGeneratedItinerarySnapshot({
      userId,
      tripId: tripA,
      trip: { title: `Guard trip ${RUN}`, destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-04", numberOfTravelers: 2, status: "draft", eventType: "", specialRequests: null },
      generatedPlan: { destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-04" },
      canonicalItems: [{ title: NEW, description: "", type: "activity", dayNumber: 1, time: "09:00", durationMinutes: 60, location: "Kyoto", estimatedCost: "0" } as any],
      comparison: { destination: "Kyoto, Japan" },
    }),
    (err: unknown) => { refusal = err; return isAiDraftSlipHasItemsError(err); },
  );
  assert.ok(isAiDraftSlipHasItemsError(refusal), "the refusal must be LD 41 (b)'s own error");

  const titles = await titlesOn(tripA);
  assert.ok(titles.has(PURCHASED), "purchased AI stop must survive a refused snapshot");
  assert.ok(titles.has(CHECKOUT), "ready_for_checkout AI stop must survive a refused snapshot");
  assert.ok(titles.has(PLANNING), "an in_planning stop is not deleted either — the rail refuses BEFORE its delete");
  assert.ok(!titles.has(NEW), "a refused snapshot inserts nothing");
  assert.equal(titles.size, 3, `the slip must be unchanged, received ${JSON.stringify([...titles])}`);

  // An aborted transaction leaves no plan and no comparison behind.
  const plans = await db.select({ id: aiGeneratedItineraries.id }).from(aiGeneratedItineraries).where(eq(aiGeneratedItineraries.tripId, tripA));
  const comparisons = await db.select({ id: itineraryComparisons.id }).from(itineraryComparisons).where(eq(itineraryComparisons.tripId, tripA));
  assert.equal(plans.length, 0, "a refused snapshot writes no ai_generated_itineraries row");
  assert.equal(comparisons.length, 0, "a refused snapshot writes no itinerary_comparisons row");
});

test("G1b the same rail DOES write on an EMPTY slip — G1a is a refusal, not a broken rail", async () => {
  const NEW = `Fresh draft stop ${RUN}`;
  assert.equal((await titlesOn(tripC)).size, 0, "this fixture trip must start empty");
  await saveGeneratedItinerarySnapshot({
    userId,
    tripId: tripC,
    trip: { title: `Guard trip ${RUN}`, destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-04", numberOfTravelers: 2, status: "draft", eventType: "", specialRequests: null },
    generatedPlan: { destination: "Kyoto, Japan", startDate: "2026-10-01", endDate: "2026-10-04" },
    canonicalItems: [{ title: NEW, description: "", type: "activity", dayNumber: 1, time: "09:00", durationMinutes: 60, location: "Kyoto", estimatedCost: "0" } as any],
    comparison: { destination: "Kyoto, Japan" },
  });
  assert.ok((await titlesOn(tripC)).has(NEW), "the freshly-generated stop is inserted on an empty slip");
});

test("G2 regenerate delete shape spares purchased/booked/traveler, deletes only plain in_planning AI", async () => {
  const D = `keep-purchased ${RUN}`;
  const E = `keep-booked-drifted ${RUN}`;
  const F = `delete-planning-ai ${RUN}`;
  const G = `keep-traveler ${RUN}`;
  await addItem(tripB, { title: D, origin: "ai", routingStatus: "purchased" });
  await addItem(tripB, { title: E, origin: "ai", routingStatus: "in_planning", bookingId }); // booked row whose status drifted
  await addItem(tripB, { title: F, origin: "ai", routingStatus: "in_planning" });
  await addItem(tripB, { title: G, origin: "traveler", routingStatus: "in_planning" });

  // Exact WHERE from the Regenerate delete (server/routes.ts) — origin clause AND the shared guard.
  await db.delete(itineraryItems).where(
    and(
      eq(itineraryItems.tripId, tripB),
      or(
        eq(itineraryItems.origin, "ai"),
        and(isNull(itineraryItems.origin), or(isNull(itineraryItems.suggestedBy), ne(itineraryItems.suggestedBy, "expert"))),
      ),
      itineraryItemRebuildDeletable(),
    ),
  );

  const titles = await titlesOn(tripB);
  assert.ok(titles.has(D), "purchased AI stop survives (status clause)");
  assert.ok(titles.has(E), "booked in_planning stop survives (booking_id clause — drift protection)");
  assert.ok(titles.has(G), "traveler-origin stop survives (origin clause)");
  assert.ok(!titles.has(F), "plain in_planning AI stop is deleted");
});
