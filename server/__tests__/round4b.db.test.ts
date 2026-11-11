/**
 * Round 4b (ledger `2026-11-06-round4b-fixes`).
 *
 *   B1 R4b-1 a guest plan with CONFIRMED dates Nov 7–8 refuses Chion-in autumn (Nov 17) as `event_outside_dates`,
 *      naming the event's day; nothing is written.
 *   B2 R4b-1 / R4b-5 an undated guest plan accepts it: the event sets its own day (scheduled 2026-11-17) at its
 *      published 17:30, and the guest plan view carries both (and the content link "Saved to plan" reads, R4b-3).
 *   B4 R4b-3 ruling: two plans — the item saved on plan A is a saved key, and the same item still saves to plan B.
 *   B3 R4b-3 the signed-in read answers the keys the traveler's own plans hold; another user's plan and an ended plan
 *      are not read.
 *   B5 QA round 3 major 1 (guest rail): Chion-in runs Nov 17 – Dec 6; a guest plan confirmed Nov 20–22 ACCEPTS it and
 *      places it on the first overlapping day (Day 1, scheduled 2026-11-20). B1's Nov 7–8 is still refused.
 *   B6 QA round 3 major 1 (signed-in rail): the same event on a signed-in plan confirmed Nov 20–22 is accepted on Day 1;
 *      on one confirmed Nov 7–8 it is refused with the event's own start day. STATED LIMIT (§18d, the ap1 precedent):
 *      `POST /api/trips/:tripId/itinerary-items` lives in the server/routes.ts MONOLITH, which no test mounts; this
 *      drives the sequence that handler runs (resolve → refuse → place → `storage.createItineraryItem`), and
 *      round4b-fixes.test.tsx pins that the handler passes the event's start AND end.
 *   B7 QA round 3 major 1 ("Plan around it"): `landRefOnNewPlan` on a plan confirmed Nov 20–22 lands the event on Day 1.
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
import { storage } from "../storage";
import {
  createGuestPlan,
  hashGuestSession,
  readGuestPlan,
  saveGuestPlanItem,
  savedRefKeysForUser,
  updateGuestPlan,
} from "../services/guest-plan.service";
import { planMarkets, resolvePlanItemRef } from "../services/guest-item-source.service";
import { landRefOnNewPlan } from "../services/plan-item-ref-write.service";
import { eventOutsideConfirmedDates, eventPlanPlacement } from "@shared/plan-dates";

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

  it("B4 two plans: saved on A, it still saves to B", async () => {
    const mkTrip = async (title: string) => {
      const [t] = await db.insert(trips).values({ userId: userA, title, destination: "Kyoto, Japan", startDate: "2026-11-15", endDate: "2026-11-20" } as any).returning({ id: trips.id });
      tripIds.add(t.id);
      return t.id;
    };
    const a = await mkTrip(`R4b A ${tag}`);
    const b = await mkTrip(`R4b B ${tag}`);
    const link = { contentLink: { contentType: "city_event", contentId: "chionin-autumn-lightup-2026" } };
    const onA: any = await storage.createItineraryItem({ tripId: a, title: "Chion-in lit for autumn", dayNumber: 3, status: "planned" }, link);
    assert.ok(onA?.id, "saved on A");
    assert.ok((await savedRefKeysForUser(userA)).includes("city_event:chionin-autumn-lightup-2026"), "A's item reads Saved to plan");
    const onB: any = await storage.createItineraryItem({ tripId: b, title: "Chion-in lit for autumn", dayNumber: 3, status: "planned" }, link);
    assert.ok(onB?.id && onB.id !== onA.id, "a second plan takes its own item");
    const rows = await db.select({ tripId: itineraryItems.tripId }).from(itineraryItems).where(inArray(itineraryItems.tripId, [a, b]));
    assert.deepEqual(rows.map((r) => r.tripId).sort(), [a, b].sort());
  });
  it("B5 guest, confirmed Nov 20–22: Chion-in (Nov 17 – Dec 6) is accepted on the first overlapping day", async () => {
    const { hash, tripId } = await guestPlan({ startDate: "2026-11-20", endDate: "2026-11-22" });
    const out: any = await saveGuestPlanItem(hash, CHIONIN as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, out.itemId));
    assert.equal(row.tripId, tripId);
    assert.equal(String(row.scheduledDate).slice(0, 10), "2026-11-20", "the first day the event and the plan share");
    assert.equal(row.dayNumber, 1);
  });

  const confirmedTrip = async (startDate: string, endDate: string) => {
    const [t] = await db
      .insert(trips)
      .values({ userId: userA, title: `R4b QA3 ${tag}`, destination: "Kyoto, Japan", startDate, endDate, datesConfirmedAt: new Date() } as any)
      .returning();
    tripIds.add(t.id);
    return t as any;
  };

  /** The signed-in handler's own sequence (server/routes.ts, the ref branch of POST /api/trips/:tripId/itinerary-items). */
  const signedInSave = async (tripRow: any) => {
    const planDays = Math.round((Date.parse(`${String(tripRow.endDate).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(tripRow.startDate).slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1;
    const resolved = await resolvePlanItemRef(CHIONIN as any, { markets: await planMarkets(tripRow.id), planDays });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    const src = (resolved as any).source;
    const eventDays = { start: src.eventDate, end: src.eventEndDate };
    const planWindow = { startDate: tripRow.startDate, endDate: tripRow.endDate, datesConfirmed: tripRow.datesConfirmedAt != null };
    if (eventOutsideConfirmedDates(eventDays, planWindow)) return { refused: String(src.eventDate).slice(0, 10) } as const;
    const placement = eventPlanPlacement(eventDays, planWindow);
    const item: any = await storage.createItineraryItem(
      { tripId: tripRow.id, title: src.title, dayNumber: placement?.dayNumber ?? 1, status: "planned", ...(placement ? { scheduledDate: placement.scheduledDate } : {}) } as any,
      { contentLink: { contentType: src.contentType, contentId: src.contentId } },
    );
    return { item } as const;
  };

  it("B6 signed-in rail: overlap accepted on Day 1; no overlap refused with the event's start day", async () => {
    const inside = await confirmedTrip("2026-11-20", "2026-11-22");
    const ok: any = await signedInSave(inside);
    assert.ok(ok.item?.id, JSON.stringify(ok));
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, ok.item.id));
    assert.equal(String(row.scheduledDate).slice(0, 10), "2026-11-20");
    assert.equal(row.dayNumber, 1);

    const before = await confirmedTrip("2026-11-07", "2026-11-08");
    assert.deepEqual(await signedInSave(before), { refused: "2026-11-17" });
    const rows = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, before.id));
    assert.equal(rows.length, 0, "nothing written");
  });

  it("B7 Plan around it: the event lands on the first overlapping day of a confirmed plan", async () => {
    const t = await confirmedTrip("2026-11-20", "2026-11-22");
    const out: any = await landRefOnNewPlan(t, CHIONIN as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, out.itemId));
    assert.equal(String(row.scheduledDate).slice(0, 10), "2026-11-20");
    assert.equal(row.dayNumber, 1);
  });
});
