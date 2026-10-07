/**
 * THE SHARED ITEM READER HAS A DETERMINISTIC ORDER — ledger `2026-10-07-item-order-tiebreak`.
 *
 * `storage.getItineraryItems` ordered by day, sort order and start time only. Rows equal on all three
 * came back in whatever order Postgres last wrote them, so an UPDATE to one of them (a new tuple at
 * the end of the heap) reordered the day. The Logistics session hit it in e2e. The fix adds `id` as
 * the final tie-break.
 *
 *   T1  three items tied on day, sort order and start time read back in `id` order.
 *   T2  after an UPDATE to the FIRST of them, the order is unchanged.
 *   T3  after a second UPDATE, to the MIDDLE one, the order is still unchanged.
 *
 * RED on the pre-fix reader: after T2's write the updated row moved to the end of the day.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/item-order-tiebreak.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { itineraryItems, users } from "@shared/schema";

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
  if (!ok) {
    throw new Error(
      `[item-order-tiebreak] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId = "";
let tripId = "";
let tied: string[] = [];

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `item-order-${RUN}@t.test` } as any).returning();
  userId = u.id;
  const t = await storage.createTrip({
    userId,
    title: `Item order ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2027-04-10",
    endDate: "2027-04-12",
  } as any);
  tripId = t.id;
  // Three items equal on every ordering column but `id`.
  for (const n of [1, 2, 3]) {
    await db.insert(itineraryItems).values({
      tripId,
      title: `Tied ${n} ${RUN}`,
      itemType: "activity",
      dayNumber: 1,
      sortOrder: 0,
      startTime: "10:00",
      origin: "traveler",
    } as any);
  }
  const rows = await db.execute(sql`SELECT id FROM itinerary_items WHERE trip_id = ${tripId} ORDER BY id`);
  tied = rows.rows.map((r: any) => String(r.id));
  assert.equal(tied.length, 3);
});

after(async () => {
  if (tripId) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  }
  if (userId) await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

const readOrder = async () => (await storage.getItineraryItems(tripId)).map((r) => r.id);

test("T1 three tied items read back in id order", async () => {
  assert.deepEqual(await readOrder(), tied);
});

test("T2 an UPDATE to the first leaves the order unchanged", async () => {
  await storage.updateItineraryItem(tied[0], { notes: `first write ${RUN}` } as any);
  assert.deepEqual(await readOrder(), tied);
});

test("T3 a second UPDATE, to the middle one, leaves the order unchanged", async () => {
  await storage.updateItineraryItem(tied[1], { notes: `second write ${RUN}` } as any);
  assert.deepEqual(await readOrder(), tied);
});
