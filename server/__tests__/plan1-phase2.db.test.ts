/**
 * PLAN-1 Phase 2's `trips.preferences.opensOn` key, after the slip-first hotfix (ledger `2026-11-07-slip-first-landing`;
 * TEST EDIT, retargeted): no mint stamps it any more and nothing reads it; rows stamped Nov 6–7 keep it, still
 * server-owned. No column, no migration.
 *
 *   O1 no mint stamps it, and a client-sent key is dropped.
 *   O2 a client `preferences` update can neither set nor erase it (a key already on a row is kept, inert).
 *   O3 a guest plan does not carry it (it opens on Days like every other plan).
 *
 * Disposable database only. Rows this file writes are removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/plan1-phase2.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { tripCollaborators, trips, users } from "@shared/schema";
import { PLAN_OPENS_ON_KEY } from "@shared/plan-view";
import { createGuestPlan, hashGuestSession } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const userId = `plan1p2-u-${tag}`;
const tripIds = new Set<string>();
const prefsOf = async (id: string) => (await db.select({ p: trips.preferences }).from(trips).where(eq(trips.id, id)))[0]?.p as Record<string, unknown>;

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.insert(users).values({ id: userId, email: `${userId}@example.test` } as any);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  await db.delete(users).where(eq(users.id, userId));
});

const opensOn = (prefs: Record<string, unknown> | null | undefined) => (prefs ?? {})[PLAN_OPENS_ON_KEY] ?? null;
const mint = async (preferences?: Record<string, unknown>) => {
  const t = await storage.createTrip(
    { userId, title: `P2 ${tag}`, destination: "Kyoto, Japan", startDate: "2026-12-01", endDate: "2026-12-03", ...(preferences ? { preferences } : {}) } as any,
    { datesChosenByTraveler: true },
  );
  tripIds.add(t.id);
  return t;
};

describe("slip-first — no plan opens on Map by itself", () => {
  it("O1 no mint stamps it; a client cannot", async () => {
    const plain = await mint({ pace: "slow" });
    assert.equal(opensOn(await prefsOf(plain.id)), null, "the mint stamps no opening view");
    assert.equal((await prefsOf(plain.id)).pace, "slow", "the client's own keys stay");
    const forged = await mint({ opensOn: "map" });
    assert.equal(opensOn(await prefsOf(forged.id)), null, "a client-sent key is dropped");
  });

  it("O2 a client update neither sets nor erases it", async () => {
    // A row stamped before the hotfix (Nov 6–7) keeps its key; it is inert, and a client still cannot touch it.
    const legacy = await mint();
    await db.execute(sql`UPDATE trips SET preferences = jsonb_build_object('opensOn', 'map') WHERE id = ${legacy.id}`);
    await storage.updateTrip(legacy.id, { preferences: { pace: "fast", opensOn: "days" } } as any);
    const p = await prefsOf(legacy.id);
    assert.equal(p.opensOn, "map", "the stored key is kept");
    assert.equal(p.pace, "fast");
    const plain = await mint();
    await storage.updateTrip(plain.id, { preferences: { opensOn: "map" } } as any);
    assert.equal(opensOn(await prefsOf(plain.id)), null, "a client update cannot set it");
  });

  it("O3 a guest plan does not carry it", async () => {
    const out: any = await createGuestPlan(hashGuestSession(crypto.randomUUID())!, { destination: "Kyoto, Japan" } as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    tripIds.add(out.view.plan.id);
    assert.equal(opensOn(await prefsOf(out.view.plan.id)), null);
  });
});
