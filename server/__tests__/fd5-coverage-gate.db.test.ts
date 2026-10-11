/**
 * FD-5 — the coverage gate through the teaser service, and the nightly census line (ledger
 * `2026-10-10-fd5-coverage-targets`; brief docs/planning/briefs/fd-5-coverage-targets.md).
 *
 * A Kyoto-market plan (Leon's targets: peak 5/3, weekday 3/2) whose stops sit in a neighbourhood holding
 * exactly 3 local picks and 2 local notes:
 *   C1  a confirmed ordinary weekday is at target ⇒ the honest count
 *   C2  a Saturday is peak ⇒ under target ⇒ nothing
 *   C3  a weekday inside momiji (multiplier 1.80 ≥ 1.5, read from market_season_calendars) ⇒ nothing
 *   C4  unconfirmed dates gate against peak ⇒ nothing
 *   C5  a plan with no market targets keeps FD-1's ungated teaser
 *   C6  the nightly census logs a coverage summary per targeted market
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { localTeasersForTrip } from "../services/local-teaser.service";
import { runContentExpiryCensus } from "../jobs/contentExpiryCensus";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fd5-${RUN}-${s}`;
const CITY = `Fd5City${RUN}`;
const OWNER = id("owner");

async function plan(k: string, startDate: string, confirmed: boolean, market: string | null, days: number[]) {
  const t = id(`trip-${k}`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, market_slug, dates_confirmed_at)
    VALUES (${t}, ${OWNER}, ${k}, ${`${CITY}, Japan`}, ${startDate}, ${startDate}, 'draft', ${market}, ${confirmed ? sql`now()` : null})`);
  for (const d of days) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, latitude, longitude)
      VALUES (${id(`i-${k}-${d}`)}, ${t}, ${d}, 'Stop', '35.004', '135.778')`);
  }
  return t;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("n-gion")}, ${CITY}, 'Japan', 'Gion', 'gion', 35.0037, 135.7788)`);
  for (let i = 0; i < 3; i++) {
    await db.execute(sql`INSERT INTO travel_pulse_hidden_gems (id, city, place_name, neighborhood, source_class, reuse_class)
      VALUES (${id(`g${i}`)}, ${CITY}, ${`Pick ${i}`}, 'gion', 'local', 'reusable')`);
  }
  for (let i = 0; i < 2; i++) {
    await db.execute(sql`INSERT INTO local_knowledge_nuggets (id, expert_user_id, nugget_type, city, neighborhood_id, insight, source_class, reuse_class)
      VALUES (${id(`nug${i}`)}, ${OWNER}, 'tip', ${CITY}, ${id("n-gion")}, 'Go early', 'local', 'reusable')`);
  }
  const momiji = await db.execute(sql`SELECT count(*)::int AS n FROM market_season_calendars WHERE market_key = 'kyoto' AND season_key = 'momiji'`);
  assert.equal(Number((momiji.rows[0] as any).n), 1, "the Kyoto season calendar is seeded (migration 232)");
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${`fd5-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE city = ${CITY}`);
  await db.execute(sql`DELETE FROM local_knowledge_nuggets WHERE city = ${CITY}`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE city = ${CITY}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`fd5-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`fd5-${RUN}-%`}`);
  await pool.end();
});

test("C1/C2 — a weekday at target speaks; the Saturday of the same plan is peak and says nothing", async () => {
  // 2027-05-12 is a Wednesday outside every Kyoto season ≥ 1.5; day 4 is Saturday 2027-05-15.
  const t = await plan("may", "2027-05-12", true, "kyoto", [1, 4]);
  const teasers = await localTeasersForTrip(t);
  assert.deepEqual(teasers.get(1), { localPicks: 3, localNotes: 2 });
  assert.equal(teasers.has(4), false);
});

test("C3 — a momiji weekday is peak", async () => {
  const t = await plan("momiji", "2027-11-10", true, "kyoto", [1]);
  assert.equal((await localTeasersForTrip(t)).size, 0);
});

test("C4 — unconfirmed dates gate against peak", async () => {
  const t = await plan("unconfirmed", "2027-05-12", false, "kyoto", [1]);
  assert.equal((await localTeasersForTrip(t)).size, 0);
});

test("C5 — no market targets ⇒ FD-1's ungated teaser", async () => {
  const t = await plan("untargeted", "2027-11-10", false, null, [1]);
  assert.deepEqual((await localTeasersForTrip(t)).get(1), { localPicks: 3, localNotes: 2 });
});

test("C6 — the nightly census logs a coverage summary per targeted market", async () => {
  const out = await runContentExpiryCensus();
  const kyoto = out.coverage.kyoto;
  assert.ok(kyoto, `kyoto summary read (errors: ${JSON.stringify(out.errors)})`);
  assert.equal(kyoto!.market, "kyoto");
  assert.equal(typeof kyoto!.targeted, "number");
  assert.ok(Array.isArray(kyoto!.unknownTargetSlugs));
});
