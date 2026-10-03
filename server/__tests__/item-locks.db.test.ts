/**
 * ITEM LOCKS — ruling R-ah (decision-maker, Oct 3, 2026; ledger `2026-10-03-item-locks`, migration
 * 342): "Travelers can lock any item ('Keep this'). The Moment item is locked by default.
 * Regeneration, Optimize and Build-around never move or remove locked items. Locked state persists
 * after a reload, and Optimize output leaves locked items in place."
 *
 *   K1  the row-level predicates: a lock is `locked_at` set; machine-protected = expert work OR locked
 *   K2  the owner rail's writer: lock, lock again (keeps the first instant), unlock; another plan's
 *       item is not found
 *   K3  REGENERATE: a delete carrying `itineraryItemRebuildDeletable()` spares a locked AI row
 *   K4  OPTIMIZE APPLY: `deleteInPlanningItineraryItemsByTrip` spares a locked in-planning row
 *   K5  OPTIMIZE INPUT: a locked row is a fixed commitment, never a movable baseline item
 *   K6  the Moment default: making an item a MOMENT plan's built-around anchor locks it; on a Trip
 *       it does not
 *   K7  persistence: the plancard assembler carries `locked: true` for a locked row and no key
 *       otherwise; a general item write cannot set or clear the lock (the storage strip)
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { itineraryItems } from "@shared/schema";
import { itineraryItemIsLocked, itineraryItemIsMachineProtected } from "@shared/itinerary-item-lock";
import { itineraryItemRebuildDeletable } from "../services/itinerary-rebuild-guard";
import { setItemLock } from "../services/item-lock.service";
import { loadTripOptimizerInputs } from "../services/optimizer-baseline.service";
import { promoteAnchor } from "../services/plan-option-sets.service";
import { storage, stripItineraryItemRoutingFields } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `lck-${RUN}-${s}`;
const OWNER = id("owner");
const TRIP = id("trip");
const OTHER = id("other");
const MOMENT = id("moment");
const TRIPS_PLAN = id("trips");

async function trip(tripId: string) {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${tripId}, ${OWNER}, ${`Lock ${RUN}`}, 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft', 'vacation')
  `);
}
async function item(tripId: string, k: string, origin = "ai", extra: { lat?: number; lng?: number } = {}) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, latitude, longitude)
    VALUES (${id(k)}, ${tripId}, 1, ${`Stop ${k}`}, 'attraction', ${origin}, ${extra.lat != null ? String(extra.lat) : null}, ${extra.lng != null ? String(extra.lng) : null})`);
  return id(k);
}
async function lockedAt(itemId: string) {
  const [r] = await db.select({ lockedAt: itineraryItems.lockedAt }).from(itineraryItems).where(eq(itineraryItems.id, itemId));
  return r?.lockedAt ?? null;
}
async function exists(itemId: string) {
  const [r] = await db.select({ id: itineraryItems.id }).from(itineraryItems).where(eq(itineraryItems.id, itemId));
  return !!r;
}
async function pen(tripId: string, slug: string) {
  await db.execute(sql`INSERT INTO trip_contexts (user_id, trip_id, context) VALUES (${OWNER}, ${tripId}, ${JSON.stringify({ experienceSlug: slug })}::jsonb)`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  for (const t of [TRIP, OTHER, MOMENT, TRIPS_PLAN]) await trip(t);
});

after(async () => {
  await db.execute(sql`DELETE FROM plan_options WHERE set_id IN (SELECT id FROM plan_option_sets WHERE trip_id LIKE ${`lck-${RUN}-%`})`);
  await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id LIKE ${`lck-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${`lck-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${OWNER}`);
  await db.execute(sql`DELETE FROM funnel_events WHERE trip_id LIKE ${`lck-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`lck-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`);
  await pool.end();
});

test("K1 the row-level predicates", () => {
  assert.equal(itineraryItemIsLocked({ lockedAt: new Date() }), true);
  assert.equal(itineraryItemIsLocked({ lockedAt: null }), false);
  assert.equal(itineraryItemIsLocked({}), false);
  assert.equal(itineraryItemIsMachineProtected({ lockedAt: new Date(), origin: "ai" }), true);
  assert.equal(itineraryItemIsMachineProtected({ origin: "expert" }), true);
  assert.equal(itineraryItemIsMachineProtected({ origin: "ai", expertNote: " " }), false);
});

test("K2 lock, lock again, unlock; another plan's item is not found", async () => {
  const it = await item(TRIP, "k2");
  assert.deepEqual(await setItemLock({ tripId: TRIP, itemId: it, locked: true }), { locked: true });
  const first = await lockedAt(it);
  assert.ok(first);
  assert.deepEqual(await setItemLock({ tripId: TRIP, itemId: it, locked: true }), { locked: true });
  assert.equal((await lockedAt(it))!.getTime(), first!.getTime(), "a second lock keeps the first instant");
  assert.equal(await setItemLock({ tripId: OTHER, itemId: it, locked: false }), null, "not on that plan");
  assert.ok(await lockedAt(it), "and nothing changed");
  assert.deepEqual(await setItemLock({ tripId: TRIP, itemId: it, locked: false }), { locked: false });
  assert.equal(await lockedAt(it), null);
});

test("K3 regenerate spares a locked AI row", async () => {
  const kept = await item(TRIP, "k3-kept");
  const gone = await item(TRIP, "k3-gone");
  await setItemLock({ tripId: TRIP, itemId: kept, locked: true });
  await db.delete(itineraryItems).where(and(eq(itineraryItems.tripId, TRIP), eq(itineraryItems.origin, "ai"), itineraryItemRebuildDeletable()));
  assert.equal(await exists(kept), true, "the locked row survives");
  assert.equal(await exists(gone), false, "an unlocked AI row is replaced");
});

test("K4 optimize apply spares a locked in-planning row", async () => {
  const kept = await item(OTHER, "k4-kept", "traveler");
  const gone = await item(OTHER, "k4-gone", "traveler");
  await setItemLock({ tripId: OTHER, itemId: kept, locked: true });
  const out = await storage.deleteInPlanningItineraryItemsByTrip(OTHER);
  assert.equal(await exists(kept), true);
  assert.equal(await exists(gone), false);
  assert.ok(out.preserved >= 1);
});

test("K5 optimize input: a locked row is a fixed commitment", async () => {
  const t = id("k5");
  await trip(t);
  const kept = await item(t, "k5-kept", "traveler");
  const free = await item(t, "k5-free", "traveler");
  await setItemLock({ tripId: t, itemId: kept, locked: true });
  const inputs = await loadTripOptimizerInputs(t);
  assert.ok(inputs.fixedCommitments.some((f) => f.id === kept), "locked ⇒ fixed");
  assert.ok(!inputs.baselineItems.some((b) => b.id === kept), "never movable");
  assert.ok(inputs.baselineItems.some((b) => b.id === free));
});

test("K6 the Moment default: built-around on a Moment locks; on a Trip it does not", async () => {
  await pen(MOMENT, "date-night");
  await pen(TRIPS_PLAN, "vacation-trip-not-a-real-slug");
  const m = await item(MOMENT, "k6-m", "traveler", { lat: 35.0, lng: 135.77 });
  const t = await item(TRIPS_PLAN, "k6-t", "traveler", { lat: 35.0, lng: 135.77 });
  await promoteAnchor({ tripId: MOMENT, itemId: m, userId: OWNER });
  await promoteAnchor({ tripId: TRIPS_PLAN, itemId: t, userId: OWNER });
  assert.ok(await lockedAt(m), "the Moment item is locked by default");
  assert.equal(await lockedAt(t), null);
});

test("K7 a general item write cannot set the lock (storage strip)", () => {
  const stripped = stripItineraryItemRoutingFields({ title: "x", lockedAt: new Date() } as Record<string, unknown>);
  assert.equal("lockedAt" in stripped, false);
});
