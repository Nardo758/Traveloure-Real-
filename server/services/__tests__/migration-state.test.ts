/**
 * `GET /api/health` reports the database's own migration state (ledger
 * `2026-09-29-health-last-migration`). M1–M5 pin the pure summary; M6 pins the route wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { summarizeMigrationState, readMigrationState } from "../migration-state";
import { MIGRATION_FILES } from "../../migrations/migration-files";

const REG = ["001_a.sql", "002_b.sql", "003_c.sql"] as const;

test("M1: every registered file recorded ⇒ current, last applied is the last registry entry", () => {
  const s = summarizeMigrationState(REG, new Set(REG));
  assert.deepEqual(s, { lastApplied: "003_c.sql", latestRegistered: "003_c.sql", pending: [], current: true });
});

test("M2: the newest file not yet applied ⇒ pending names it, not current", () => {
  const s = summarizeMigrationState(REG, new Set(["001_a.sql", "002_b.sql"]));
  assert.equal(s.lastApplied, "002_b.sql");
  assert.deepEqual(s.pending, ["003_c.sql"]);
  assert.equal(s.current, false);
});

test("M3: 'last applied' follows registry order, not the order rows were recorded", () => {
  // A recorded set carries no order; a gap in the middle stays pending and the last recorded
  // registry entry is still named.
  const s = summarizeMigrationState(REG, new Set(["003_c.sql", "001_a.sql"]));
  assert.equal(s.lastApplied, "003_c.sql");
  assert.deepEqual(s.pending, ["002_b.sql"]);
  assert.equal(s.current, false);
});

test("M4: no ledger table ⇒ nothing applied, everything pending, never a guessed name (§13)", () => {
  const s = summarizeMigrationState(REG, null);
  assert.equal(s.lastApplied, null);
  assert.deepEqual(s.pending, [...REG]);
  assert.equal(s.current, false);
});

test("M5: the reader asks the ledger and summarizes against the real registry", async () => {
  const calls: string[] = [];
  const fake = {
    execute: async (q: any) => {
      const text = JSON.stringify(q);
      calls.push(text);
      if (text.includes("to_regclass")) return { rows: [{ exists: true }] };
      return { rows: MIGRATION_FILES.map((m) => ({ migration_name: m })) };
    },
  };
  const s = await readMigrationState(fake as any);
  assert.equal(s.current, true);
  assert.equal(s.lastApplied, MIGRATION_FILES[MIGRATION_FILES.length - 1]);
  assert.equal(calls.length, 2);

  const none = await readMigrationState({ execute: async () => ({ rows: [{ exists: false }] }) } as any);
  assert.equal(none.lastApplied, null);
  assert.equal(none.pending.length, MIGRATION_FILES.length);
});

test("M6: /api/health carries the state on its ok branch and a failed read is null, not current", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes/content.routes.ts"), "utf8");
  const block = src.slice(src.indexOf('router.get("/api/health"'), src.indexOf('router.get("/api/status"'));
  assert.match(block, /readMigrationState\(db\)\.catch\(\(\) => null\)/);
  // TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`) added the trend-score age beside the
  // migration state on the same ok branch; its read is caught too, so it can never fail the probe.
  // Step 9c D6 (ledger `2026-10-07-step9c-leg-options`; sanctioned): `mapsCaps` sits beside the flags and egress.
  // Item 3 (ledger `2026-10-10-health-hotel-supply`; sanctioned): `supply` follows the trend-score age.
  assert.match(block, /status: "ok", db: true, timestamp: new Date\(\)\.toISOString\(\), build, flags, egress, mapsCaps, migrations, trendScores, supply \}/);
  assert.match(block, /FROM trend_scores`\)[\s\S]*?\.catch\(\(\) => null\)/);
});
