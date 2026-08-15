/**
 * SharedCachePrimitive.flushExpired() — DB integration test
 *
 * Proves, against real rows in a real database:
 *   FE-1 — expired rows are deleted; live rows remain after global flushExpired().
 *   FE-2 — namespace-scoped flush removes only expired rows in that namespace.
 *   FE-3 — flushExpired() returns 0 when no expired rows exist in the target namespace.
 *   FE-4 — the scheduler's registered prune path (CacheSchedulerService.pruneExpiredCacheNow(),
 *           which is the exact function the hourly setInterval callback delegates to) also
 *           removes expired rows from the DB.
 *
 * ── Disposable-DB guard ──────────────────────────────────────────────────────
 * This test issues DELETE statements that are not restricted to its own fixture
 * rows when calling the global flushExpired(). The guard below aborts the suite
 * when DATABASE_URL does not resolve to a local/disposable host UNLESS the caller
 * explicitly sets JOURNEY_DB_WRITES_OK=1.
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/shared-cache-flush-expired.db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NO NETWORK. Every row written is keyed with a unique run-prefix and is deleted
 * in after(), so the suite is safe to run alongside other test files.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { travelpayoutsCache } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { sharedCache } from "../services/shared-cache.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts) ─────────

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket → NULL → disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[shared-cache-flush-expired] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. ` +
        `Never run against prod.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const RUN = crypto.randomUUID().slice(0, 8);

// Namespaces scoped to this run so parallel test suites never collide.
const NS_A = `test-flush-${RUN}-alpha`;
const NS_B = `test-flush-${RUN}-beta`;

// Track inserted cache_key values so after() can remove them even if a test throws.
const insertedKeys: string[] = [];

function compositeKey(namespace: string, key: string): string {
  return `${namespace}::${key}`;
}

async function seedRow(
  namespace: string,
  key: string,
  offsetMs: number // negative = already expired, positive = still live
): Promise<void> {
  const ck = compositeKey(namespace, key);
  const expiresAt = new Date(Date.now() + offsetMs);
  await db
    .insert(travelpayoutsCache)
    .values({
      brand: namespace,
      cacheKey: ck,
      data: { seeded: true, key },
      expiresAt,
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: travelpayoutsCache.cacheKey,
      set: { data: { seeded: true, key }, expiresAt, brand: namespace, refreshedAt: new Date() },
    });
  if (!insertedKeys.includes(ck)) insertedKeys.push(ck);
}

async function countByKeys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const rows = await db
    .select({ cacheKey: travelpayoutsCache.cacheKey })
    .from(travelpayoutsCache)
    .where(inArray(travelpayoutsCache.cacheKey, keys));
  return rows.length;
}

// ── Seed fixtures ─────────────────────────────────────────────────────────────

before(async () => {
  await assertDisposableDb();

  // NS_A: 2 expired, 2 live
  await seedRow(NS_A, "expired-1", -1_000);          // 1 s ago → expired
  await seedRow(NS_A, "expired-2", -60_000);         // 1 min ago → expired
  await seedRow(NS_A, "live-1", 60 * 60 * 1_000);   // 1 h ahead → live
  await seedRow(NS_A, "live-2", 24 * 60 * 60 * 1_000); // 24 h ahead → live

  // NS_B: 1 expired, 1 live
  await seedRow(NS_B, "expired-1", -500);            // 0.5 s ago → expired
  await seedRow(NS_B, "live-1", 30 * 60 * 1_000);   // 30 min ahead → live
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

after(async () => {
  if (insertedKeys.length === 0) return;
  await db
    .delete(travelpayoutsCache)
    .where(inArray(travelpayoutsCache.cacheKey, insertedKeys));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("FE-1: global flushExpired() removes expired rows and leaves live rows intact", async () => {
  const expiredA = [compositeKey(NS_A, "expired-1"), compositeKey(NS_A, "expired-2")];
  const liveA    = [compositeKey(NS_A, "live-1"),    compositeKey(NS_A, "live-2")];
  const expiredB = [compositeKey(NS_B, "expired-1")];
  const liveB    = [compositeKey(NS_B, "live-1")];

  // Pre-condition: all rows present
  assert.equal(await countByKeys(expiredA), 2, "pre: 2 expired NS_A rows must exist");
  assert.equal(await countByKeys(liveA),    2, "pre: 2 live NS_A rows must exist");
  assert.equal(await countByKeys(expiredB), 1, "pre: 1 expired NS_B row must exist");
  assert.equal(await countByKeys(liveB),    1, "pre: 1 live NS_B row must exist");

  const deleted = await sharedCache.flushExpired();

  // At least the 3 expired rows seeded in this run must have been removed.
  assert.ok(deleted >= 3, `flushExpired() must report ≥ 3 deletions; got ${deleted}`);

  // Expired rows must be gone
  assert.equal(await countByKeys(expiredA), 0, "expired NS_A rows must be deleted");
  assert.equal(await countByKeys(expiredB), 0, "expired NS_B rows must be deleted");

  // Live rows must survive
  assert.equal(await countByKeys(liveA), 2, "live NS_A rows must remain");
  assert.equal(await countByKeys(liveB), 1, "live NS_B row must remain");
});

test("FE-2: namespace-scoped flushExpired(ns) only removes expired rows in that namespace", async () => {
  // Re-seed expired rows (FE-1 already flushed them)
  await seedRow(NS_A, "expired-ns-scoped", -1_000);
  await seedRow(NS_B, "expired-ns-scoped", -1_000);

  const expiredA = compositeKey(NS_A, "expired-ns-scoped");
  const expiredB = compositeKey(NS_B, "expired-ns-scoped");
  const liveA    = compositeKey(NS_A, "live-1");
  const liveB    = compositeKey(NS_B, "live-1");

  // Flush only NS_A
  const deleted = await sharedCache.flushExpired(NS_A);

  assert.ok(deleted >= 1, `namespace flush must report ≥ 1 deletion; got ${deleted}`);

  // NS_A expired row gone
  assert.equal(await countByKeys([expiredA]), 0, "NS_A expired row must be deleted");
  // NS_B expired row NOT touched by the NS_A-scoped flush
  assert.equal(await countByKeys([expiredB]), 1, "NS_B expired row must survive NS_A-scoped flush");
  // Live rows untouched
  assert.equal(await countByKeys([liveA]), 1, "NS_A live row must survive");
  assert.equal(await countByKeys([liveB]), 1, "NS_B live row must survive");

  // Clean up remaining NS_B expired row
  await sharedCache.flushExpired(NS_B);
  assert.equal(await countByKeys([expiredB]), 0, "NS_B expired row cleaned up");
});

test("FE-3: namespace-scoped flushExpired() returns 0 when no expired rows remain", async () => {
  // After FE-1 and FE-2 only live rows remain for our namespaces.
  const liveKeys = [
    compositeKey(NS_A, "live-1"),
    compositeKey(NS_A, "live-2"),
    compositeKey(NS_B, "live-1"),
  ];
  const existing = await countByKeys(liveKeys);
  assert.ok(existing >= 1, "at least one live row must exist for this sub-test to be meaningful");

  // Scoped flush over NS_A: no expired rows remain → must return 0
  const deleted = await sharedCache.flushExpired(NS_A);
  assert.equal(deleted, 0, "flush of a namespace with no expired rows must return 0");
});

test("FE-4: CacheSchedulerService.pruneExpiredCacheNow() — the scheduler's registered callback — deletes expired rows", async () => {
  // Seed a fresh expired row to prove the scheduler's prune path removes it.
  // pruneExpiredCacheNow() is the exact method the hourly setInterval callback
  // delegates to, so invoking it here exercises the scheduler's registered path
  // without needing to wait for the timer to fire.
  const nsScheduler = `test-flush-${RUN}-sched`;
  const expiredKey  = compositeKey(nsScheduler, "sched-expired");
  const liveKey     = compositeKey(nsScheduler, "sched-live");
  if (!insertedKeys.includes(expiredKey)) insertedKeys.push(expiredKey);
  if (!insertedKeys.includes(liveKey))    insertedKeys.push(liveKey);

  await db
    .insert(travelpayoutsCache)
    .values({
      brand: nsScheduler,
      cacheKey: expiredKey,
      data: { scheduler: true },
      expiresAt: new Date(Date.now() - 2_000), // 2 s ago → expired
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: travelpayoutsCache.cacheKey,
      set: { data: { scheduler: true }, expiresAt: new Date(Date.now() - 2_000), brand: nsScheduler, refreshedAt: new Date() },
    });

  await db
    .insert(travelpayoutsCache)
    .values({
      brand: nsScheduler,
      cacheKey: liveKey,
      data: { scheduler: true },
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000), // 1 h ahead → live
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: travelpayoutsCache.cacheKey,
      set: { data: { scheduler: true }, expiresAt: new Date(Date.now() + 60 * 60 * 1_000), brand: nsScheduler, refreshedAt: new Date() },
    });

  assert.equal(await countByKeys([expiredKey]), 1, "expired scheduler row must exist before prune");
  assert.equal(await countByKeys([liveKey]),    1, "live scheduler row must exist before prune");

  // Invoke via the scheduler service — the same path the setInterval callback takes.
  const deleted = await cacheSchedulerService.pruneExpiredCacheNow();

  assert.ok(deleted >= 1, `scheduler prune must delete ≥ 1 expired row; got ${deleted}`);
  assert.equal(await countByKeys([expiredKey]), 0, "expired row must be gone after scheduler prune");
  assert.equal(await countByKeys([liveKey]),    1, "live row must survive scheduler prune");
});
