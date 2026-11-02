/**
 * PS-4 (a), ledger `2026-11-02-ps4-entry-carry-forward`: a plan drafted from a saved occasion.
 *
 *   T1 the drafted plan's pen carries the template's catalog slug (through the ONE pen writer), start = end = the
 *      occasion date and dates_confirmed_at stays NULL; the full plan read says fromOccasionDraft: true
 *   T1b a template key the catalog does not carry writes no slug (never a nearest occasion)
 *   T1c once the dates are confirmed, the plan read no longer carries fromOccasionDraft
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/ps4-occasion-draft-slug.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { stampDraftOccasion } from "../services/occasion-drafts.service";
import { assembleTripPlan } from "../services/trip-plan.service";

const RUN = crypto.randomUUID().slice(0, 8);
const USER = `ps4-${RUN}-user`;
const TRIP = `ps4-${RUN}-trip`;
const TRIP_B = `ps4-${RUN}-trip-b`;
const OCC = `ps4-${RUN}-occ`;
const DAY = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

async function penSlug(tripId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT context->>'experienceSlug' AS s FROM trip_contexts WHERE user_id = ${USER} AND trip_id = ${tripId}`);
  return ((r.rows[0] as any)?.s as string | undefined) ?? null;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const has = await db.execute(sql`SELECT 1 FROM experience_types WHERE slug = 'date-night'`);
  assert.ok(has.rows.length > 0, "the catalog must carry date-night (seeded)");
  await db.execute(sql`INSERT INTO users (id, email, first_name) VALUES (${USER}, ${`${USER}@t.test`}, 'P')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${USER}, 'Date night', 'Kyoto', ${DAY}, ${DAY}), (${TRIP_B}, ${USER}, 'Anniversary', 'Kyoto', ${DAY}, ${DAY})`);
  await db.execute(sql`INSERT INTO occasions (id, user_id, template_key, occasion_date) VALUES (${OCC}, ${USER}, 'date_night', ${DAY})`);
  await db.execute(sql`INSERT INTO occasion_drafts (id, occasion_id, cycle_key, occasion_year, trip_id, generated_at)
    VALUES (${`${OCC}-d`}, ${OCC}, ${DAY}, ${Number(DAY.slice(0, 4))}, ${TRIP}, NOW())`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM occasion_drafts WHERE occasion_id = ${OCC}`);
    await db.execute(sql`DELETE FROM occasions WHERE id = ${OCC}`);
    await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${USER}`);
    await db.execute(sql`DELETE FROM trips WHERE user_id = ${USER}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${USER}`);
  } finally {
    await pool.end();
  }
});

test("T1 the drafted plan carries the catalog slug, the occasion date and unconfirmed dates", async () => {
  assert.equal(await stampDraftOccasion(USER, TRIP, "date_night"), "date-night");
  assert.equal(await penSlug(TRIP), "date-night");
  const r = await db.execute(sql`SELECT start_date::text AS s, end_date::text AS e, dates_confirmed_at FROM trips WHERE id = ${TRIP}`);
  const row = r.rows[0] as any;
  assert.equal(row.s, DAY);
  assert.equal(row.e, DAY);
  assert.equal(row.dates_confirmed_at, null);
  const plan: any = await assembleTripPlan(TRIP, "full");
  assert.equal(plan.plancard.trip.fromOccasionDraft, true);
});

test("T1b a template key the catalog does not carry writes no slug", async () => {
  assert.equal(await stampDraftOccasion(USER, TRIP_B, "no_such_occasion"), null);
  assert.equal(await penSlug(TRIP_B), null);
  const plan: any = await assembleTripPlan(TRIP_B, "full");
  assert.equal("fromOccasionDraft" in plan.plancard.trip, false);
});

test("T1c confirmed dates: the plan read no longer carries fromOccasionDraft", async () => {
  await db.execute(sql`UPDATE trips SET dates_confirmed_at = NOW() WHERE id = ${TRIP}`);
  const plan: any = await assembleTripPlan(TRIP, "full");
  assert.equal("fromOccasionDraft" in plan.plancard.trip, false);
});
