/**
 * Home's time axis — the LOADER half (`loadUpcomingForUser`), against a real Postgres
 * (ledger `2026-09-28-upcoming-dates-confirmed`; CLAUDE.md Locked Decision 30 as amended by
 * migration 302, Locked Decision 45 (8), §13).
 *
 * The pure builder already marks a placeholder window (`upcoming.test.ts`). What this proves is that
 * the LOADER hands the builder the column it read: the loader selected `trips.dates_confirmed_at`
 * and dropped it when it mapped rows into `buildUpcomingRows`, so every plan read as a placeholder.
 *
 *   L1  a plan whose dates were CHOSEN carries no `datesConfirmed` key on its trip_start/handover rows
 *   L2  a plan whose dates were NOT chosen carries `datesConfirmed: false` on both
 *
 * Deliberately refuses to run unless the caller explicitly opts into writes.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const enabled = process.env.NODE_ENV !== "production" && process.env.JOURNEY_DB_WRITES_OK === "1";
const run = enabled ? describe : describe.skip;
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";

const { pool } = await import("../../db");
const { loadUpcomingForUser } = await import("../upcoming.service");

const userId = crypto.randomUUID();
const chosenTrip = crypto.randomUUID();
const placeholderTrip = crypto.randomUUID();
// Fixed "now" with both plans 20 days out: inside the default window, far from the handover edge.
const NOW = new Date("2026-10-01T09:00:00Z");

async function q(text: string, values: unknown[] = []) {
  return pool.query(text, values);
}

run("upcoming loader passes trips.dates_confirmed_at to the builder (real DB)", () => {
  before(async () => {
    await q(`INSERT INTO users (id,email,role) VALUES ($1,$2,'user')`, [userId, `${userId}@test.invalid`]);
    await q(
      `INSERT INTO trips (id,user_id,title,destination,start_date,end_date,status,timezone,dates_confirmed_at)
       VALUES ($1,$3,'Chosen','Kyoto, Japan','2026-10-21','2026-10-25','draft','Asia/Tokyo',NOW()),
              ($2,$3,'Placeholder','Kyoto, Japan','2026-10-21','2026-10-25','draft','Asia/Tokyo',NULL)`,
      [chosenTrip, placeholderTrip, userId],
    );
  });

  after(async () => {
    await q(`DELETE FROM trips WHERE id IN ($1,$2)`, [chosenTrip, placeholderTrip]);
    await q(`DELETE FROM users WHERE id=$1`, [userId]);
    await pool.end();
  });

  it("L1/L2: only the plan nobody chose dates for is marked a placeholder", async () => {
    const { rows } = await loadUpcomingForUser(userId, 60, NOW);
    const of = (tripId: string, kind: string) => rows.find((r) => r.tripId === tripId && r.kind === kind);

    for (const kind of ["trip_start", "handover"]) {
      const chosen = of(chosenTrip, kind);
      const placeholder = of(placeholderTrip, kind);
      assert.ok(chosen, `chosen plan has a ${kind} row`);
      assert.ok(placeholder, `placeholder plan has a ${kind} row`);
      assert.equal("datesConfirmed" in chosen!, false, `L1: chosen plan's ${kind} row makes no placeholder claim`);
      assert.equal(placeholder!.datesConfirmed, false, `L2: placeholder plan's ${kind} row says so`);
    }
  });
});
