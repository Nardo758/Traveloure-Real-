/**
 * R15 — the item_removed removal signal (ledger 2026-08-17-partner-demand-r15-transition-log).
 *
 * `storage.deleteItineraryItem` is the ONE genuine single-item REMOVAL path (a traveler or expert
 * takes an item off the plan and nothing replaces it — the DELETE /api/trips/:tripId/itinerary-items/:itemId
 * route). R15 requires it to write an append-only `item_removed` row in the SAME transaction as the
 * delete, so the demand pipeline's removal clock can never miss a removal or record one that rolled
 * back. These tests prove:
 *   IR1  the production method deletes the item AND writes exactly one item_removed row, with the
 *        item's last routing_status as fromStatus, toStatus NULL, and the actor the caller passed.
 *   IR2  ATOMICITY — the delete + item_removed pair is all-or-nothing: a transaction that deletes
 *        and logs and then throws leaves BOTH the item and zero diary rows (the mechanism the
 *        production method rides — same-transaction pair, ruling 18). Mirrors the "reproduce the
 *        pair, don't reimplement it" convention of expert-attribution-and-accept-diary.db.test.ts.
 *   IR3  actor mapping — an expert removal records actorType 'expert', a traveler removal 'traveler'.
 *   IR4  deleting a non-existent item writes NO diary row (no phantom removal — §13).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/item-removed-diary.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { itineraryItems, transportLegs } from "@shared/schema";
import { logItemTransition } from "../services/item-transition-log.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `irm-${RUN}-owner`,
  expert: `irm-${RUN}-expert`,
  trip: `irm-${RUN}-trip`,
};

// ── Disposable-DB guard (mirrors expert-attribution-and-accept-diary.db.test.ts) ────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[item-removed-diary] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function makeItem(routingStatus: string): Promise<string> {
  const item = await storage.createItineraryItem({
    tripId: ids.trip,
    title: `IRM item (${routingStatus})`,
    itemType: "activity",
    status: "planned",
    dayNumber: 1,
  } as any);
  // set routing_status explicitly (createItineraryItem takes migration-159 default otherwise)
  await db.update(itineraryItems).set({ routingStatus }).where(eq(itineraryItems.id, item.id));
  return item.id;
}

async function removedRows(itemId: string): Promise<Array<{ from_status: string | null; to_status: string | null; actor_type: string | null; actor_id: string | null }>> {
  const r = await db.execute(sql`
    SELECT from_status, to_status, actor_type, actor_id
    FROM item_transition_log
    WHERE item_id = ${itemId} AND event_type = 'item_removed'
  `);
  return r.rows as any;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.owner}, ${`irm-${RUN}-owner@t.test`}, 'IRM', 'Owner', 'traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`irm-${RUN}-expert@t.test`}, 'IRM', 'Expert', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.owner}, 'IRM fixture trip', 'Kyoto', CURRENT_DATE + 10, CURRENT_DATE + 15)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IR1 — the production method writes exactly one item_removed row with the right shape
// ═══════════════════════════════════════════════════════════════════════════════════════════
test("IR1: deleteItineraryItem removes the item and writes exactly one item_removed row", async () => {
  const itemId = await makeItem("ready_for_checkout");

  await storage.deleteItineraryItem(itemId, { actorType: "traveler", actorId: ids.owner });

  const [gone] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.equal(gone, undefined, "item is actually deleted");

  const rows = await removedRows(itemId);
  assert.equal(rows.length, 1, "exactly one item_removed row");
  assert.equal(rows[0].from_status, "ready_for_checkout", "fromStatus = the item's last routing_status");
  assert.equal(rows[0].to_status, null, "toStatus is NULL (removed = no next state)");
  assert.equal(rows[0].actor_type, "traveler");
  assert.equal(rows[0].actor_id, ids.owner);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IR2 — the delete + item_removed pair is ALL-OR-NOTHING (ruling 18 same-transaction contract)
// ═══════════════════════════════════════════════════════════════════════════════════════════
test("IR2: a throwing transaction rolls back BOTH the delete and the item_removed row", async () => {
  const itemId = await makeItem("in_planning");

  // Reproduce the production pair (delete item → cascade legs → log item_removed) inside a
  // transaction that then throws — the exact mechanism deleteItineraryItem rides. Rollback must
  // leave the item present and write no diary row.
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.delete(itineraryItems).where(eq(itineraryItems.id, itemId));
      await tx
        .delete(transportLegs)
        .where(
          and(
            eq(transportLegs.tripId, ids.trip),
            isNull(transportLegs.variantId),
            or(eq(transportLegs.fromActivityId, itemId), eq(transportLegs.toActivityId, itemId)),
          ),
        );
      await logItemTransition(tx, {
        tripId: ids.trip,
        itemId,
        eventType: "item_removed",
        fromStatus: "in_planning",
        toStatus: null,
        actorType: "traveler",
        actorId: ids.owner,
      });
      throw new Error("forced rollback");
    }),
    /forced rollback/,
  );

  const [stillThere] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.ok(stillThere, "item survives the rolled-back transaction");
  const rows = await removedRows(itemId);
  assert.equal(rows.length, 0, "no item_removed row persisted from a rolled-back transaction");

  // clean happy-path delete so after() has nothing dangling and IR is complete for this item
  await storage.deleteItineraryItem(itemId, { actorType: "traveler", actorId: ids.owner });
  assert.equal((await removedRows(itemId)).length, 1, "the committed delete writes exactly one row");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IR3 — actor mapping (expert vs traveler)
// ═══════════════════════════════════════════════════════════════════════════════════════════
test("IR3: an expert removal records actorType 'expert'", async () => {
  const itemId = await makeItem("with_expert");
  await storage.deleteItineraryItem(itemId, { actorType: "expert", actorId: ids.expert });
  const rows = await removedRows(itemId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_type, "expert");
  assert.equal(rows[0].actor_id, ids.expert);
});

test("IR3b: an omitted actor defaults to traveler with a null actorId (honest, not guessed)", async () => {
  const itemId = await makeItem("in_planning");
  await storage.deleteItineraryItem(itemId);
  const rows = await removedRows(itemId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_type, "traveler");
  assert.equal(rows[0].actor_id, null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IR4 — no phantom removal for a non-existent item (§13)
// ═══════════════════════════════════════════════════════════════════════════════════════════
test("IR4: deleting a non-existent item writes NO item_removed row", async () => {
  const ghost = `irm-${RUN}-ghost`;
  await storage.deleteItineraryItem(ghost, { actorType: "traveler", actorId: ids.owner });
  const rows = await removedRows(ghost);
  assert.equal(rows.length, 0, "no diary row for an item that never existed");
});
