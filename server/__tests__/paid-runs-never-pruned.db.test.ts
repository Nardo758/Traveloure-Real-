/**
 * Ledger `2026-09-27-paid-runs-never-pruned` (R177) — a paid optimizer run is never pruned.
 *
 * `enforceTripComparisonRetention` kept a trip's newest 3 unapplied comparisons and DELETED the
 * rest, cascading away each run's versions, metrics and shares — including runs the traveler paid
 * for. The decision-maker ruled (Sep 27, 2026): paid runs are never pruned; pruning applies only to
 * unpaid previews. FAILS ON main: R1's oldest paid run is deleted there.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { enforceTripComparisonRetention } from "../services/comparison-retention.service";

const RUN = crypto.randomUUID().slice(0, 8);
const USER = `prun-${RUN}-u`;
const TRIP = `prun-${RUN}-t`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${USER}, ${`${USER}@t.test`}, 'Run', 'Fixture')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${USER}, 'Retention fixture', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE trip_id = ${TRIP}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${USER}`).catch(() => {});
});

/** A comparison `minutesAgo` old. `paid` = an authorized run carrying its PaymentIntent. */
async function comparison(minutesAgo: number, kind: "paid" | "covered" | "preview" | "applied"): Promise<string> {
  const id = `prun-${RUN}-${kind}-${minutesAgo}`;
  const status = kind === "preview" ? "pending_payment" : "completed";
  const pi = kind === "paid" ? `pi_${RUN}_${minutesAgo}` : null;
  const selected = kind === "applied" ? `var-${RUN}-${minutesAgo}` : null;
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, status, optimization_payment_id, selected_variant_id, created_at)
    VALUES (${id}, ${USER}, ${TRIP}, ${status}, ${pi}, ${selected}, NOW() - (${minutesAgo} || ' minutes')::interval)
  `);
  return id;
}

async function present(id: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM itinerary_comparisons WHERE id = ${id}`);
  return r.rows.length === 1;
}

test("R1–R4: paid and covered runs all survive; only unpaid previews beyond the window are pruned", async () => {
  // Five paid runs and one pass/free-rerun-covered run — more than the old 3-slot window.
  const paid = [];
  for (const m of [100, 90, 80, 70, 60]) paid.push(await comparison(m, "paid"));
  const covered = await comparison(55, "covered");
  const applied = await comparison(200, "applied");
  // Five never-authorized previews, oldest first.
  const previews = [];
  for (const m of [50, 40, 30, 20, 10]) previews.push(await comparison(m, "preview"));

  const discarded = await enforceTripComparisonRetention(TRIP);

  for (const id of paid) assert.equal(await present(id), true, `R1 a paid run is never pruned (${id})`);
  assert.equal(await present(covered), true, "R2 an authorized run with no PaymentIntent (pass / free re-run) is kept");
  assert.equal(await present(applied), true, "R3 an applied run stays protected");
  assert.deepEqual(discarded.sort(), [previews[0], previews[1]].sort(), "R4 only the two oldest unpaid previews go");
  for (const id of previews.slice(2)) assert.equal(await present(id), true, "the newest 3 previews are kept");
});
