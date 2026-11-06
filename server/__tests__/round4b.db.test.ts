/**
 * Round 4b (ledger `2026-11-06-round4b-fixes`).
 *
 *   B1 R4b-1 a guest plan with CONFIRMED dates Nov 7–8 refuses Chion-in autumn (Nov 17) as `event_outside_dates`,
 *      naming the event's day; nothing is written.
 *   B2 R4b-1 / R4b-5 an undated guest plan accepts it: the event sets its own day (scheduled 2026-11-17) at its
 *      published 17:30, and the guest plan view carries both (and the content link "Saved to plan" reads, R4b-3).
 *   B3 R4b-3 the signed-in read answers the keys the traveler's own plans hold; another user's plan and an ended plan
 *      are not read.
 *
 * Disposable database only. Rows this file writes are removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/round4b.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, tripCollaborators, trips, users } from "@shared/schema";
import {
  createGuestPlan,
  hashGuestSession,
  readGuestPlan,
  saveGuestPlanItem,
  savedRefKeysForUser,
  updateGuestPlan,
} from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const tripIds = new Set<string>();
const userA = `r4b-a-${tag}`;
const userB = `r4b-b-${tag}`;
let preexistingEvents = 0;
const CHIONIN = { kind: "city_event", source_id: "chionin-autumn-lightup-2026", city: "Kyoto" } as const;

const applyFile = async (file: string) => {
  for (const stmt of fs.readFileSync(file, "utf8").split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
};

async function guestPlan(dates?: { startDate: string; endDate: string }): Promise<{ hash: string; tripId: string }> {
  const hash = hashGuestSession(crypto.randomUUID())!;
  const out: any = await createGuestPlan(hash, { destination: "Kyoto, Japan" } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  tripIds.add(out.view.plan.id);
  if (dates) {
    const view = await updateGuestPlan(hash, dates as any);
    assert.equal(view?.plan.datesConfirmed, true, "the guest's own dates are confirmed");
  }
  return { hash, tripId: out.view.plan.id };
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  preexistingEvents = (r as any).rows[0].n;
  await applyFile("server/migrations/439_kyoto_events_seed.sql");
  await applyFile("server/migrations/442_kyoto_event_venue_points.sql");
  await applyFile("server/migrations/443_kyoto_event_times.sql");
  await db.execute(sql`UPDATE city_events SET withdrawn_at = NULL WHERE id LIKE 'kyoto-ev-%'`);
  await db.insert(users).values([
    { id: userA, email: `${userA}@example.test` } as any,
    { id: userB, email: `${userB}@example.test` } as any,
  ]);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.delete(itineraryItems).where(inArray(itineraryItems.tripId, t));
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  await db.delete(users).where(inArray(users.id, [userA, userB]));
  if (preexistingEvents === 0) await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
});

describe("Round 4b", () => {
  it("B1 confirmed Nov 7–8: Chion-in autumn is refused as event_outside_dates", async () => {
    const { hash, tripId } = await guestPlan({ startDate: "2026-11-07", endDate: "2026-11-08" });
    const out: any = await saveGuestPlanItem(hash, CHIONIN as any);
    assert.deepEqual(out, { ok: false, code: "event_outside_dates", eventDate: "2026-11-17" });
    const rows = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    assert.equal(rows.length, 0, "nothing written");
  });

  it("B2 undated: the event sets its own day at 17:30, and the view carries it", async () => {
    const { hash } = await guestPlan();
    const out: any = await saveGuestPlanItem(hash, CHIONIN as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    const view = await readGuestPlan(hash);
    assert.equal(view?.plan.datesConfirmed, false);
    const item = view!.items.find((i) => i.id === out.itemId)!;
    assert.equal(item.scheduledDate, "2026-11-17");
    assert.equal(item.startTime, "17:30");
    assert.equal(item.contentType, "city_event");
    assert.equal(item.contentId, "chionin-autumn-lightup-2026");
    assert.equal(out.item?.startTime, "17:30", "the save's own answer carries the time too");
  });

  it("B3 the signed-in read: own open plans only", async () => {
    const mk = async (userId: string, endDate: string, contentId: string) => {
      const [t] = await db
        .insert(trips)
        .values({ userId, title: `R4b ${tag}`, destination: "Kyoto, Japan", startDate: "2026-11-01", endDate } as any)
        .returning({ id: trips.id });
      tripIds.add(t.id);
      await db.insert(itineraryItems).values({ tripId: t.id, title: "x", dayNumber: 1, status: "planned", contentType: "gem", contentId } as any);
    };
    await mk(userA, "2099-01-02", `g-open-${tag}`);
    await mk(userA, "2020-01-02", `g-ended-${tag}`);
    await mk(userB, "2099-01-02", `g-other-${tag}`);
    const keys = await savedRefKeysForUser(userA);
    assert.ok(keys.includes(`gem:g-open-${tag}`));
    assert.ok(!keys.includes(`gem:g-ended-${tag}`), "an ended plan is not read");
    assert.ok(!keys.includes(`gem:g-other-${tag}`), "another traveler's plan is not read");
  });
});
