/**
 * BUILD-AROUND READS GOOGLE'S FACT, NEVER COPIES IT (decision-maker, Oct 3, 2026 — ledger
 * `2026-10-03-build-around-places`). An AI stop whose own location is an area holds no trusted row
 * coordinate (R281); its only point is Google's live `places_api` location fact. "Build my days
 * around this" may READ that fact; it stores no coordinate (LD 57), and the option's point is
 * resolved from the fact at read time.
 *
 *   B1  promote on a Google-located item succeeds; the option row stores NO coordinate and is marked
 *       `places_fact`; the item row still has no coordinate
 *   B2  the option reader resolves the point from the live fact
 *   B3  no fact and no trusted row point ⇒ 409, nothing written
 *   B4  a lapsed fact ⇒ the option stays unlocated on read (never a stale or guessed point)
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { listOptionSets, promoteAnchor } from "../services/plan-option-sets.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `bap-${RUN}-${s}`;
const OWNER = id("owner");
const TRIP = id("trip");

async function aiAreaItem(k: string) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, location_name)
    VALUES (${id(k)}, ${TRIP}, 1, ${`Stop ${k}`}, 'attraction', 'ai', 'Higashiyama Ward, Kyoto')`);
  return id(k);
}
async function fact(itemId: string, lat: number, lng: number, expiresAt: string) {
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${crypto.randomUUID()}, 'google_place', ${`gp-${itemId}`}, 'stop.hours', 'location',
            ${JSON.stringify({ lat, lng, name: "x" })}::jsonb, 'places_api', NOW(), ${expiresAt}::timestamp, ${TRIP}, ${itemId})`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TRIP}, ${OWNER}, 'BA', 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft', 'vacation')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM plan_options WHERE set_id IN (SELECT id FROM plan_option_sets WHERE trip_id = ${TRIP})`);
  await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM funnel_events WHERE trip_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`);
  await pool.end();
});

test("B3 no fact and no trusted row point ⇒ 409", async () => {
  const it = await aiAreaItem("none");
  await assert.rejects(promoteAnchor({ tripId: TRIP, itemId: it, userId: OWNER }), (e: any) => e.status === 409);
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM plan_option_sets WHERE trip_id = ${TRIP}`);
  assert.equal((r.rows[0] as any).n, 0);
});

test("B1/B2 promote reads the fact, stores no coordinate, and the reader resolves it", async () => {
  const it = await aiAreaItem("g");
  await fact(it, 34.9948, 135.785, "2099-01-01");
  const { setId } = await promoteAnchor({ tripId: TRIP, itemId: it, userId: OWNER });
  const opt = (await db.execute(sql`SELECT latitude, longitude, location_precision FROM plan_options WHERE set_id = ${setId}`)).rows[0] as any;
  assert.equal(opt.latitude, null, "no coordinate stored on the option");
  assert.equal(opt.longitude, null);
  assert.equal(opt.location_precision, "places_fact");
  const row = (await db.execute(sql`SELECT latitude, longitude FROM itinerary_items WHERE id = ${it}`)).rows[0] as any;
  assert.equal(row.latitude, null, "and none written onto the item row (LD 57)");
  const sets = await listOptionSets(TRIP);
  const o = sets.find((s) => s.id === setId)!.options[0];
  assert.equal(Number(o.latitude), 34.9948);
  assert.equal(Number(o.longitude), 135.785);
});

test("B4 a lapsed fact leaves the option unlocated on read", async () => {
  await db.execute(sql`UPDATE place_facts SET expires_at = '2000-01-01' WHERE plan_id = ${TRIP}`);
  const sets = await listOptionSets(TRIP);
  const o = sets.flatMap((s) => s.options).find((x) => x.locationPrecision === "places_fact")!;
  assert.equal(o.latitude, null);
});
