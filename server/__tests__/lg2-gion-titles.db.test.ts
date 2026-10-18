/**
 * LG-2 Ask 9 (ledger `2026-10-18-lg2-banned-phrases`): migration 393 renames exactly the two Gion items, only while
 * their title still contains "geisha spotting", and a second run changes nothing.
 *
 *   GT1 the two full ids become "Gion District Walk"
 *   GT2 an item whose title mentions geisha without the phrase is untouched; so is a same-titled row with another id
 *   GT3 a second run is a no-op, and a row already retitled is left alone
 *
 * DISPOSABLE DB ONLY: fixture rows are deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(path.join(here, "../migrations/393_gion_district_walk_titles.sql"), "utf8");
const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `gt-${RUN}-${k}`;
const A = "18754d33-b5ca-4b8f-9f29-65531362f829";
const B = "92049500-6c56-40b7-9816-967a8a3cc977";
const OTHER = id("other");
const LEGIT = id("legit");
const trip = id("trip");

async function title(itemId: string): Promise<string | null> {
  const r: any = await db.execute(sql`SELECT title FROM itinerary_items WHERE id = ${itemId}`);
  return (r.rows ?? r)[0]?.title ?? null;
}
const run = () => pool.query(MIGRATION);

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${A}, ${B})`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("u")}, ${`${id("u")}@t.test`}, 'GT', 'Fixture', 'user')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${trip}, ${id("u")}, 'GT plan', 'Kyoto, Japan', '2027-05-01', '2027-05-03', 'planning')`);
  for (const [i, t] of [
    [A, "Gion District Walking & Geisha Spotting"],
    [B, "Gion District Stroll & Geisha Spotting"],
    [OTHER, "Gion District Stroll & Geisha Spotting"],
    [LEGIT, "Evening geisha dance at Gion Corner"],
  ] as const) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type, origin) VALUES (${i}, ${trip}, ${t}, 1, 'activity', 'ai')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${A}, ${B})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${id("u")}`).catch(() => {});
  await pool.end();
});

test("GT1 the two full ids become Gion District Walk", async () => {
  await run();
  assert.equal(await title(A), "Gion District Walk");
  assert.equal(await title(B), "Gion District Walk");
});

test("GT2 a geisha title without the phrase, and a same title on another id, are untouched", async () => {
  assert.equal(await title(LEGIT), "Evening geisha dance at Gion Corner");
  assert.equal(await title(OTHER), "Gion District Stroll & Geisha Spotting", "matched by full id only");
});

test("GT3 a second run is a no-op; a row already retitled is left alone", async () => {
  await db.execute(sql`UPDATE itinerary_items SET title = 'Gion evening walk' WHERE id = ${A}`);
  const r = await run();
  assert.equal(r.rowCount, 0);
  assert.equal(await title(A), "Gion evening walk");
  assert.equal(await title(B), "Gion District Walk");
});
