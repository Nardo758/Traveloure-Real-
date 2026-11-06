/**
 * PLAN-1 Phase 2 (ledger `2026-11-06-plan1-phase2-view-toggle`; ruling 4): a plan created from the map carries the
 * server-owned `trips.preferences.opensOn = "map"`. No column, no migration.
 *
 *   O1 the mint option stamps it; a mint without it does not, and a client-sent key is dropped.
 *   O2 a client `preferences` update can neither set nor erase it (the stored key is kept).
 *   O3 a guest plan (built on the map) carries it; once claimed it opens on Map.
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
import { planOpensOn } from "@shared/plan-view";
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

const mint = async (opts: { opensOnMap?: boolean }, preferences?: Record<string, unknown>) => {
  const t = await storage.createTrip(
    { userId, title: `P2 ${tag}`, destination: "Kyoto, Japan", startDate: "2026-12-01", endDate: "2026-12-03", ...(preferences ? { preferences } : {}) } as any,
    { datesChosenByTraveler: true, ...opts },
  );
  tripIds.add(t.id);
  return t;
};

describe("PLAN-1 Phase 2 — a map-created plan opens on Map", () => {
  it("O1 the mint stamps it; a client cannot", async () => {
    const onMap = await mint({ opensOnMap: true }, { pace: "slow" });
    assert.equal(planOpensOn(await prefsOf(onMap.id)), "map");
    assert.equal((await prefsOf(onMap.id)).pace, "slow", "the client's own keys stay");
    const plain = await mint({});
    assert.equal(planOpensOn(await prefsOf(plain.id)), null);
    const forged = await mint({}, { opensOn: "map" });
    assert.equal(planOpensOn(await prefsOf(forged.id)), null, "a client-sent key is dropped");
  });

  it("O2 a client update neither sets nor erases it", async () => {
    const onMap = await mint({ opensOnMap: true });
    await storage.updateTrip(onMap.id, { preferences: { pace: "fast", opensOn: "days" } } as any);
    const p = await prefsOf(onMap.id);
    assert.equal(p.opensOn, "map", "the stored key is kept");
    assert.equal(p.pace, "fast");
    const plain = await mint({});
    await storage.updateTrip(plain.id, { preferences: { opensOn: "map" } } as any);
    assert.equal(planOpensOn(await prefsOf(plain.id)), null, "a client update cannot set it");
  });

  it("O3 a guest plan carries it", async () => {
    const out: any = await createGuestPlan(hashGuestSession(crypto.randomUUID())!, { destination: "Kyoto, Japan" } as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    tripIds.add(out.view.plan.id);
    assert.equal(planOpensOn(await prefsOf(out.view.plan.id)), "map");
  });
});
