/**
 * P0-c item 2 — migration 374 clears an echoed leg mode, and a second run changes nothing
 * (ledger `2026-10-12-p0c-hotfix`).
 *
 *   M1 first run: a leg nobody checked, whose selected mode equals its recommendation and which is not
 *      superseded, loses the selection (source NULL and `google_routes` alike)
 *   M2 untouched: a checked leg, a leg whose selection differs, a superseded leg, a leg with no selection
 *   M3 second run updates 0 rows (idempotent — a cleared selection no longer matches)
 *
 * The migration's own SQL is read from the file and run with a trip-scope clause appended, so the proof
 * exercises the exact predicate without touching another suite's rows.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/m374-echoed-leg-mode.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[m374] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `m374-${RUN}-owner`;
const TRIP = `m374-${RUN}-trip`;
const FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../migrations/374_reset_echoed_leg_mode.sql");

function scopedMigration(): string {
  const body = fs
    .readFileSync(FILE, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();
  assert.ok(body.endsWith(";"), "the migration is one statement");
  return `${body.slice(0, -1)} AND trip_id = '${TRIP}'`;
}

async function run(): Promise<number> {
  const res: any = await db.execute(sql.raw(scopedMigration()));
  return Number(res.rowCount ?? 0);
}

type Fixture = { key: string; recommended: string; selected: string | null; checkedBy?: string | null; source?: string | null; superseded?: boolean };
const FIXTURES: Fixture[] = [
  { key: "echo-null-source", recommended: "driving", selected: "driving" },
  { key: "echo-google", recommended: "driving", selected: "driving", source: "google_routes" },
  { key: "checked", recommended: "driving", selected: "driving", checkedBy: owner },
  { key: "differs", recommended: "walking", selected: "driving" },
  { key: "superseded", recommended: "driving", selected: "driving", superseded: true },
  { key: "no-selection", recommended: "driving", selected: null },
];
const legId = (k: string) => `m374-${RUN}-${k}`;

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${TRIP}, ${owner}, 'm374', 'Kyoto, Japan', '2027-11-08', '2027-11-08', 'draft')`);
  let order = 0;
  for (const f of FIXTURES) {
    await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_name, from_lat, from_lng, to_name, to_lat, to_lng,
        distance_meters, distance_display, recommended_mode, user_selected_mode, estimated_duration_minutes, checked_by, source, superseded_at)
      VALUES (${legId(f.key)}, ${TRIP}, 1, ${order++}, 'A', 35.0, 135.7, 'B', 35.01, 135.7, 1100, '1.1 km', ${f.recommended}, ${f.selected}, 12,
        ${f.checkedBy ?? null}, ${f.source ?? null}, ${f.superseded ? new Date() : null})`);
  }
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

async function selected(): Promise<Record<string, string | null>> {
  const rows: any = await db.execute(sql`SELECT id, user_selected_mode FROM transport_legs WHERE trip_id = ${TRIP}`);
  return Object.fromEntries((rows.rows ?? rows).map((r: any) => [String(r.id).replace(`m374-${RUN}-`, ""), r.user_selected_mode ?? null]));
}

test("M1/M2 the first run clears only echoed, unchecked, live legs", async () => {
  assert.equal(await run(), 2);
  assert.deepEqual(await selected(), {
    "echo-null-source": null,
    "echo-google": null,
    checked: "driving",
    differs: "driving",
    superseded: "driving",
    "no-selection": null,
  });
});

test("M3 a second run updates nothing", async () => {
  assert.equal(await run(), 0);
});
