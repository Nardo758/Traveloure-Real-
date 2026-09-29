/**
 * Pending billboard gems are attached to an already-minted plan, so retries must never mint or
 * insert the same source item twice. This exercises the production transactional storage writer.
 *
 * Disposable DB only:
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/pending-billboard-gem-idempotency.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { itineraryItems, users } from "@shared/schema";
import { pendingPlanItemMarker } from "@shared/pending-plan-items";

const RUN = crypto.randomUUID().slice(0, 8);
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
let userId = "";
let tripId = "";

async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const result = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((result.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  if (
    !(host !== null && DISPOSABLE_HOSTS.has(host)) &&
    !(host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)))
  ) {
    throw new Error(`[pending-billboard-gem] Refusing fixture writes to non-disposable database '${host ?? "<none>"}'.`);
  }
}

before(async () => {
  await assertDisposableDb();
  const [user] = await db.insert(users).values({ email: `billboard-gem-${RUN}@t.test` } as any).returning();
  userId = user.id;
  const trip = await storage.createTrip({
    userId,
    title: `Pending gem plan ${RUN}`,
    destination: "Kyoto",
    startDate: "2027-04-10",
    endDate: "2027-04-13",
  } as any);
  tripId = trip.id;
});

after(async () => {
  if (tripId) {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId)).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  }
  if (userId) await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("a failed attach can retry on the same trip and concurrent retries create one row", async () => {
  const gem = { id: `gem-${RUN}`, title: "Hidden Garden", city: "Kyoto" };

  // Model a failed request before the transactional writer is reached: recovery reuses this same
  // minted trip id and source item, rather than calling the plan mint path again.
  let firstAttemptFailed = true;
  const attach = async () => {
    if (firstAttemptFailed) {
      firstAttemptFailed = false;
      throw new Error("temporary attach failure");
    }
    return storage.createPendingBillboardGemItemIfAbsent({
      tripId,
      title: gem.title,
      description: "",
      itemType: "activity",
      status: "planned",
      dayNumber: 1,
      locationName: gem.city,
      notes: pendingPlanItemMarker(gem.id),
    } as any, gem.id);
  };

  await assert.rejects(attach(), /temporary attach failure/);
  const retries = await Promise.all([attach(), attach()]);
  assert.equal(retries.filter((result) => result.created).length, 1);
  assert.ok(retries.every((result) => result.item.tripId === tripId));

  const rows = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  const gemRows = rows.filter((row) => row.notes === pendingPlanItemMarker(gem.id));
  assert.equal(gemRows.length, 1);
  assert.equal(gemRows[0].title, gem.title);
  assert.equal(gemRows[0].locationName, gem.city);
  assert.equal(gemRows[0].scheduledDate, null);
  assert.equal(gemRows[0].startTime, null);
});