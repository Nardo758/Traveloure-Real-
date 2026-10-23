/**
 * Boot seed stamps (ledger `2026-10-22-boot-seed-stamps`).
 *
 *   S1  a matching overall stamp runs no seeder
 *   S2  a changed input reruns only that seeder
 *   S3  the second pass, after it acquires the lock, re-reads and is a no-op
 *   S4  ready stays false until the seed pass or the skip has finished
 *   S5  a failed seeder leaves its stamp unwritten, and the next pass retries it
 *   S6  no stamp (empty table, or the table missing) never skips
 *   S7  ensureDefaultBookingFeeConfig is not called when its stamp matches, and its SQL
 *       still inserts with ON CONFLICT DO NOTHING
 *   S8  every boot seeder's input files hash, and migration 406 is the additive stamp table
 *
 * No database. The store is in memory. Readiness is the same predicate both ready routes call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOT_SEED_VERSION,
  OVERALL_STAMP_KEY,
  SEEDER_INPUT_FILES,
  bootSeedingLogMessage,
  clearSeederInputHashCacheForTests,
  executeStampedSeeders,
  hashSeederInput,
  isUndefinedTableError,
  loadSeederInputHash,
  overallSeedVersion,
  runSeedPass,
  type StampRead,
  type StampedSeeder,
} from "../seeds/lib/boot-seed-stamp";
import {
  getSeedingStatus,
  markBootSeedingComplete,
  resetBootSeedingStateForTests,
  seedingBlocksReady,
} from "../seeds/lib/boot-seeding-state";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function memoryStore() {
  const rows = new Map<string, string>();
  const writes: string[] = [];
  return {
    rows,
    writes,
    read(): Promise<StampRead> {
      return Promise.resolve({ available: true, stamps: new Map(rows) });
    },
    write(key: string, inputHash: string): Promise<void> {
      writes.push(key);
      rows.set(key, inputHash);
      return Promise.resolve();
    },
  };
}

function seeder(name: string, inputHash: string | null, run: () => Promise<void>, onError?: (err: unknown) => void): StampedSeeder {
  return { name, inputHash, run, onError };
}

test("S1: a matching overall stamp runs no seeder", async () => {
  const version = overallSeedVersion(BOOT_SEED_VERSION, [
    { name: "seedDmoSources", inputHash: "dmo" },
    { name: "seedExperienceTypes", inputHash: "types" },
  ]);
  assert.ok(version);
  const store = memoryStore();
  store.rows.set(OVERALL_STAMP_KEY, version);
  store.rows.set("seedDmoSources", "dmo");
  store.rows.set("seedExperienceTypes", "types");
  const calls: string[] = [];
  const result = await executeStampedSeeders(await store.read(), [
    seeder("seedDmoSources", "dmo", async () => { calls.push("seedDmoSources"); }),
    seeder("seedExperienceTypes", "types", async () => { calls.push("seedExperienceTypes"); }),
  ], store.write);
  assert.deepEqual(calls, []);
  assert.equal(result.outcome, "skipped");
  assert.equal(result.overallWritten, false);
  assert.deepEqual(store.writes, []);
  assert.equal(bootSeedingLogMessage(result.outcome), "Boot seeding skipped");
  assert.ok(result.perSeeder.every((row) => row.action === "skipped" && row.durationMs === 0));
});

test("S2: a changed input reruns only that seeder", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  const first = [
    seeder("seedDmoSources", "dmo-v1", async () => { calls.push("seedDmoSources"); }),
    seeder("seedExperienceTypes", "types-v1", async () => { calls.push("seedExperienceTypes"); }),
    seeder("seedExperienceTemplateTabs", "tabs-v1", async () => { calls.push("seedExperienceTemplateTabs"); }),
  ];
  const cold = await executeStampedSeeders(await store.read(), first, store.write);
  assert.equal(cold.outcome, "ran");
  assert.equal(cold.overallWritten, true);
  assert.deepEqual(calls, ["seedDmoSources", "seedExperienceTypes", "seedExperienceTemplateTabs"]);

  calls.length = 0;
  const changed = [
    seeder("seedDmoSources", "dmo-v2", async () => { calls.push("seedDmoSources"); }),
    seeder("seedExperienceTypes", "types-v1", async () => { calls.push("seedExperienceTypes"); }),
    seeder("seedExperienceTemplateTabs", "tabs-v1", async () => { calls.push("seedExperienceTemplateTabs"); }),
  ];
  const warm = await executeStampedSeeders(await store.read(), changed, store.write);
  assert.deepEqual(calls, ["seedDmoSources"]);
  assert.equal(warm.outcome, "ran");
  assert.equal(warm.overallWritten, true);
  assert.equal(store.rows.get("seedDmoSources"), "dmo-v2");
  assert.equal(store.rows.get("seedExperienceTypes"), "types-v1");
  assert.equal(warm.perSeeder.find((row) => row.name === "seedExperienceTypes")?.action, "skipped");
  assert.equal(bootSeedingLogMessage(warm.outcome), "Boot seeding ran");
});

test("S3: the second pass after the lock re-reads the stamp and is a no-op", async () => {
  const store = memoryStore();
  let tail: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(() => fn());
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let runs = 0;
  const seeders = (): StampedSeeder[] => [
    seeder("seedDmoSources", "dmo", async () => {
      runs += 1;
      await hold;
    }),
  ];
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  const first = runSeedPass({ lock, readStamps: store.read, writeStamp: store.write, seeders: seeders() });
  await flush();
  const second = runSeedPass({ lock, readStamps: store.read, writeStamp: store.write, seeders: seeders() });
  await flush();
  assert.equal(runs, 1, "the second pass waits on the lock instead of seeding from a stale empty read");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(runs, 1);
  assert.equal(a.outcome, "ran");
  assert.equal(a.overallWritten, true);
  assert.equal(b.outcome, "skipped");
  assert.ok(b.lockWaitMs >= 0);
  assert.deepEqual(b.perSeeder.map((row) => row.action), ["skipped"]);
});

test("S4: ready is false until seeding or the skip completes", async () => {
  resetBootSeedingStateForTests();
  assert.equal(seedingBlocksReady(), true);
  assert.equal(getSeedingStatus().complete, false);
  assert.equal(getSeedingStatus().durationMs, null);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let seenBlocked = false;
  const pass = (async () => {
    seenBlocked = seedingBlocksReady(getSeedingStatus());
    await gate;
    markBootSeedingComplete(12);
  })();
  assert.equal(seedingBlocksReady(), true);
  release();
  await pass;
  assert.equal(seenBlocked, true);
  assert.equal(seedingBlocksReady(), false);
  assert.equal(getSeedingStatus().durationMs, 12);

  const index = fs.readFileSync(path.join(root, "server/index.ts"), "utf8");
  const readyStart = index.indexOf('app.get("/api/ready"');
  const ready = index.slice(readyStart, index.indexOf('app.get("/api/version"', readyStart));
  assert.ok(ready.includes("seedingBlocksReady("));
  assert.ok(ready.indexOf("seedingBlocksReady(") < ready.indexOf("probeDatabaseReady("));
  assert.match(ready, /ready: false/);
  assert.match(ready, /message: "Database seeding in progress"/);

  const health = fs.readFileSync(path.join(root, "server/infrastructure/health.ts"), "utf8");
  const healthReady = health.slice(health.indexOf('router.get("/health/ready"'));
  assert.ok(healthReady.indexOf("seedingBlocksReady(") < healthReady.indexOf("probeDatabaseReady("));
  const live = health.slice(health.indexOf('router.get("/health"'), health.indexOf('router.get("/health/ready"'));
  assert.doesNotMatch(live, /seedingBlocksReady/);
});

test("S5: a failed seeder leaves its stamp unwritten and the next pass retries it", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  let boom = true;
  const seeders = (): StampedSeeder[] => [
    seeder("seedDmoSources", "dmo", async () => { calls.push("seedDmoSources"); }),
    seeder("seedExperienceTypes", "types", async () => {
      calls.push("seedExperienceTypes");
      if (boom) throw new Error("types failed");
    }),
  ];
  const first = await executeStampedSeeders(await store.read(), seeders(), store.write);
  assert.equal(first.outcome, "partial");
  assert.equal(first.overallWritten, false);
  assert.equal(store.rows.has("seedDmoSources"), true);
  assert.equal(store.rows.has("seedExperienceTypes"), false);
  assert.equal(store.rows.has(OVERALL_STAMP_KEY), false);
  assert.equal(first.perSeeder.find((row) => row.name === "seedExperienceTypes")?.action, "failed");

  calls.length = 0;
  boom = false;
  const second = await executeStampedSeeders(await store.read(), seeders(), store.write);
  assert.deepEqual(calls, ["seedExperienceTypes"]);
  assert.equal(second.outcome, "ran");
  assert.equal(second.overallWritten, true);
  assert.equal(store.rows.get("seedExperienceTypes"), "types");
});

test("S5b: a stamp write that throws leaves the row unwritten", async () => {
  let calls = 0;
  const result = await executeStampedSeeders(
    { available: true, stamps: new Map() },
    [seeder("seedDmoSources", "dmo", async () => { calls += 1; })],
    async () => { throw new Error("stamp write failed"); },
  );
  assert.equal(calls, 1);
  assert.equal(result.outcome, "partial");
  assert.equal(result.overallWritten, false);
  assert.equal(result.perSeeder[0]?.action, "failed");
});

test("S6: a fresh store with no stamp seeds, and a missing table does not skip or write", async () => {
  const empty = memoryStore();
  const calls: string[] = [];
  const seeded = await executeStampedSeeders(await empty.read(), [
    seeder("seedCategories", "cats", async () => { calls.push("seedCategories"); }),
  ], empty.write);
  assert.deepEqual(calls, ["seedCategories"]);
  assert.equal(seeded.overallWritten, true);
  assert.equal(empty.rows.get(OVERALL_STAMP_KEY), overallSeedVersion(BOOT_SEED_VERSION, [{ name: "seedCategories", inputHash: "cats" }]));

  const writes: string[] = [];
  const missing = await executeStampedSeeders(
    { available: false, stamps: new Map() },
    [seeder("seedCategories", "cats", async () => { calls.push("again"); })],
    async (key) => { writes.push(key); },
  );
  assert.deepEqual(writes, []);
  assert.equal(missing.overallWritten, false);
  assert.equal(missing.outcome, "ran");
  assert.equal(missing.perSeeder[0]?.action, "ran");

  assert.equal(overallSeedVersion(BOOT_SEED_VERSION, [{ name: "seedCategories", inputHash: null }]), null);
  assert.equal(isUndefinedTableError({ code: "42P01" }), true);
  assert.equal(isUndefinedTableError({ cause: { code: "42P01" } }), true);
  assert.equal(isUndefinedTableError(new Error("other")), false);
});

test("S7: a matching fee stamp does not call ensureDefaultBookingFeeConfig, and the SQL does not update", async () => {
  const fee = "fee-v1";
  const version = overallSeedVersion(BOOT_SEED_VERSION, [{ name: "ensureDefaultBookingFeeConfig", inputHash: fee }]);
  assert.ok(version);
  const store = memoryStore();
  store.rows.set(OVERALL_STAMP_KEY, version);
  store.rows.set("ensureDefaultBookingFeeConfig", fee);
  let called = false;
  await executeStampedSeeders(await store.read(), [
    seeder("ensureDefaultBookingFeeConfig", fee, async () => { called = true; }),
  ], store.write);
  assert.equal(called, false);

  const sql = fs.readFileSync(path.join(root, "server/services/booking-fee-bootstrap.ts"), "utf8");
  assert.match(sql, /ON CONFLICT \(category\) DO NOTHING/);
  assert.doesNotMatch(sql, /DO UPDATE/);
  assert.match(sql, /never overwrites/i);
});

test("S8: input files hash, and migration 406 is additive and registered", () => {
  clearSeederInputHashCacheForTests();
  for (const name of Object.keys(SEEDER_INPUT_FILES) as (keyof typeof SEEDER_INPUT_FILES)[]) {
    const hash = loadSeederInputHash(name);
    assert.equal(typeof hash, "string", name);
    assert.equal(hash, loadSeederInputHash(name), name);
  }
  const changed = hashSeederInput(BOOT_SEED_VERSION, "seedDmoSources", [
    { path: "server/seeds/dmo-sources.seed.ts", bytes: Buffer.from("a") },
  ]);
  const same = hashSeederInput(BOOT_SEED_VERSION, "seedDmoSources", [
    { path: "server/seeds/dmo-sources.seed.ts", bytes: Buffer.from("a") },
  ]);
  const edited = hashSeederInput(BOOT_SEED_VERSION, "seedDmoSources", [
    { path: "server/seeds/dmo-sources.seed.ts", bytes: Buffer.from("b") },
  ]);
  assert.equal(changed, same);
  assert.notEqual(changed, edited);
  assert.equal(hashSeederInput(BOOT_SEED_VERSION, "seedDmoSources", []), null);

  const sql = fs.readFileSync(path.join(root, "server/migrations/406_boot_seed_stamps.sql"), "utf8");
  const statement = sql.replace(/--.*$/gm, "");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS boot_seed_stamps/);
  assert.match(statement, /stamp_key text PRIMARY KEY/);
  assert.match(statement, /input_hash text NOT NULL/);
  assert.doesNotMatch(statement, /\b(DROP|CHECK|ALTER|DEFAULT)\b/i);
  assert.match(sql, /Migration 406 SQL approved — Leon/);
  const registry = fs.readFileSync(path.join(root, "server/migrations/migration-files.ts"), "utf8");
  assert.match(registry, /"406_boot_seed_stamps.sql"/);
  const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");
  assert.match(schema, /pgTable\("boot_seed_stamps"/);

  const index = fs.readFileSync(path.join(root, "server/index.ts"), "utf8");
  const pass = index.slice(index.indexOf("async function runDatabaseSeeding"));
  const lockAt = pass.indexOf("withAdvisoryXactLock");
  const readAt = pass.indexOf("readBootSeedStamps");
  assert.ok(lockAt !== -1 && readAt !== -1 && lockAt < readAt, "the stamp re-read is inside the lock wrapper");
  assert.match(pass, /durationMs: seedingDurationMs/);
  assert.match(pass, /lockWaitSeconds:/);
  assert.match(pass, /seederSeconds/);
  assert.match(pass, /"Database seeding complete"/);
});
