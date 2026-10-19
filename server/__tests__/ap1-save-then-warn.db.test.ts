/**
 * AP-1 — save, then say what we checked (ledger `2026-10-13-ap1-save-then-warn`).
 *
 *   S1 the save stands and the first answer arrives: `addChecksAfterSave` (what the item POST runs once the row
 *      is saved) answers the check read; the hand-add lookup then attaches the stop's hours and the check read
 *      names the finding with the stop's start time — "Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"
 *   S2 one PF-1 outcome row per hand-add, trigger `hand_add`; a place whose facts any plan holds is reused at no
 *      charge (no billed call)
 *   S3 a stored official hours fact covers the place: no billed call, row `skipped/official_fact`, the stop keeps
 *      the place id and the check read reads the official hours
 *   S4 the plan's daily budget: past `placesLookupsPerDraft()` billed hand-add lookups today the stop is
 *      `capped/plan_day_cap` and reads "Hours not checked for this stop"
 *   S5 a lookup failure never fails the save — no throw, an `error` row, the stop still on the plan
 *   S6 the check read's way in: an unlocated end keeps the gap wording; a free plan reads the straight line
 *   S7 the GET is behind the plan's read gate: a stranger is refused, a stop not on the plan is one 404
 *   S8 the admin counts reader names both new reasons (L1, sanctioned Oct 13, 2026): skipped/official_fact and
 *      capped/plan_day_cap, as stored
 *
 * STATED LIMIT (§18d): `POST /api/trips/:tripId/itinerary-items` lives in the `server/routes.ts` MONOLITH, which
 * no test mounts; the route calls `addChecksAfterSave` and nothing else for AP-1, so this proves that sequence
 * after the real `storage.createItineraryItem`, not the handler's express wiring.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/ap1-save-then-warn.db.test.ts
 */
process.env.PLACE_FACTS_PLACES_ENABLED = "1";
process.env.PLACES_LOOKUPS_PER_DRAFT = "2";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[ap1] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { storage } = await import("../storage");
const { addChecksAfterSave, handAddLookupsToday, loadStopChecks, startHandAddLookup } = await import("../services/add-checks.service");
const { PlacesAdapter } = await import("../services/content-facts/places-adapter");
const plancardRoutes = (await import("../routes/plancard.routes")).default;
const { HOURS_NOT_CHECKED_LINE } = await import("@shared/add-checks");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ap1-${RUN}-${s}`;
const OWNER = id("owner");
const STRANGER = id("stranger");
const TRIP = id("trip");
const FREE = id("free");
const OTHER = id("other");
const CITY = "Kyoto, Japan";
const WINTER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: 9:00 AM – 5:00 PM`);

/** A fake Places API: the no-charge ID search and the billed Details call, counted. */
function placesFake(opts: { throwOn?: "id" | "details" } = {}) {
  const state = { billed: 0, idCalls: 0 };
  const adapter = new PlacesAdapter(
    async (url, init) => {
      if (init.method === "GET") {
        if (opts.throwOn === "details") throw Object.assign(new Error("boom with query text"), { code: "ECONNRESET" });
        state.billed += 1;
        const pid = decodeURIComponent(url.split("/places/")[1].split("?")[0]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: pid,
            displayName: { text: pid.endsWith("ginkaku") ? "Ginkaku-ji Temple" : pid.endsWith("kiyomizu") ? "Kiyomizu-dera" : "Nanzen-ji" },
            location: { latitude: 35.027, longitude: 135.798 },
            types: ["tourist_attraction", "point_of_interest", "establishment"],
            regularOpeningHours: { weekdayDescriptions: WINTER },
          }),
        };
      }
      if (opts.throwOn === "id") throw Object.assign(new Error("boom with query text"), { code: "ECONNRESET" });
      state.idCalls += 1;
      const q = JSON.parse(init.body!).textQuery as string;
      const pid = id(q.startsWith("Ginkaku") ? "place-ginkaku" : q.startsWith("Kiyomizu") ? "place-kiyomizu" : "place-nanzen");
      return { ok: true, status: 200, json: async () => ({ places: [{ id: pid }] }) };
    },
    () => "test-key",
    () => true,
  );
  return { adapter, state };
}

async function trip(tripId: string) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type, market_slug, dates_confirmed_at)
    VALUES (${tripId}, ${OWNER}, ${`AP-1 ${RUN}`}, ${CITY}, '2027-01-11', '2027-01-14', 'draft', 'vacation', 'kyoto', now())`);
}

async function add(tripId: string, title: string, day: number, startTime: string | null, point?: { lat: number; lng: number }) {
  return storage.createItineraryItem({
    tripId,
    title,
    dayNumber: day,
    itemType: "attraction",
    startTime,
    ...(point ? { latitude: String(point.lat), longitude: String(point.lng) } : {}),
  } as any);
}

async function outcomes(itemId: string) {
  return (await db.execute(sql`SELECT outcome, reason, run_trigger, place_id, cache FROM place_lookup_outcomes WHERE itinerary_item_id = ${itemId} ORDER BY created_at`)).rows as any[];
}

async function call(path: string, userId: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(plancardRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const text = await res.text();
    return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  } finally {
    server.close();
  }
}

before(async () => {
  for (const u of [OWNER, STRANGER]) await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${u}, ${`${u}@t.test`}, 'traveler')`);
  await trip(TRIP);
  await trip(FREE);
  await trip(OTHER);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_lookup_outcomes WHERE trip_id IN (${TRIP}, ${FREE}, ${OTHER})`);
    await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${TRIP}, ${FREE}, ${OTHER}) OR place_ref LIKE ${`ap1-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM transport_legs WHERE trip_id IN (${TRIP}, ${FREE}, ${OTHER})`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${TRIP}, ${FREE}, ${OTHER})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${TRIP}, ${FREE}, ${OTHER})`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${STRANGER})`);
  } finally {
    await pool.end();
  }
});

test("S1 the save stands; the hand-add lookup still runs and bills, and brings no hours (GH-1)", async () => {
  const fake = placesFake();
  await add(TRIP, "Kinkaku-ji", 2, "15:00");
  const item = await add(TRIP, "Ginkaku-ji Temple", 2, "17:10");
  const { lookup, checks } = await addChecksAfterSave(TRIP, item.id, { adapters: [fake.adapter] });
  assert.ok(checks, "the first answer arrives with the save");
  assert.equal(checks!.itemId, item.id);
  await lookup;
  const after = await loadStopChecks(TRIP, item.id);
  // GH-1: Google's hours are never stored, so the stop reads not checked; S3 proves the finding on an official fact.
  assert.deepEqual(after!.hours, { status: "not_checked" });
  assert.equal(fake.state.billed, 1);
});

test("S2 one hand_add outcome row; a place any plan holds is reused at no charge", async () => {
  const first = (await db.execute(sql`SELECT id FROM itinerary_items WHERE trip_id = ${TRIP} AND title = 'Ginkaku-ji Temple'`)).rows[0] as any;
  const rows = await outcomes(first.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_trigger, "hand_add");
  assert.equal(rows[0].outcome, "attached");
  assert.equal(rows[0].cache, "miss");

  const fake = placesFake();
  const again = await add(OTHER, "Ginkaku-ji Temple", 1, "10:00");
  await startHandAddLookup(OTHER, again.id, { adapters: [fake.adapter] });
  assert.equal(fake.state.billed, 0, "no billed call — the place's facts are already held");
  const r = await outcomes(again.id);
  assert.deepEqual([r[0].outcome, r[0].cache, r[0].run_trigger], ["attached", "hit", "hand_add"]);
  assert.equal(await handAddLookupsToday(OTHER), 0, "a cache hit spends none of the plan's budget");
});

test("S3 a stored official hours fact covers the place: no billed call, the stop reads the official hours", async () => {
  const pid = id("place-nanzen");
  // CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): a machine-read hours fact is read only once a person reviewed it
  // (`verified_by` references a user; the fixture's own account stands in for the reviewer).
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, license, fetched_at, source_class, reuse_class, source_url, verified_by)
    VALUES (${id("official")}, 'place_id', ${pid}, 'stop.hours', 'hours', ${JSON.stringify({ weekdayDescriptions: WINTER })}::jsonb, 'crawled', 'official', now(), 'public', 'link_only', 'https://www.nanzen.net/', ${OWNER})`);
  const fake = placesFake();
  const item = await add(TRIP, "Nanzen-ji", 3, "17:30");
  await startHandAddLookup(TRIP, item.id, { adapters: [fake.adapter] });
  assert.equal(fake.state.billed, 0);
  const r = await outcomes(item.id);
  assert.deepEqual([r[0].outcome, r[0].reason, r[0].place_id], ["skipped", "official_fact", pid]);
  const kept = (await db.execute(sql`SELECT google_place_id FROM itinerary_items WHERE id = ${item.id}`)).rows[0] as any;
  assert.equal(kept.google_place_id, pid);
  const checks = await loadStopChecks(TRIP, item.id);
  assert.equal(checks!.hours.status, "checked");
  assert.deepEqual((checks!.hours as any).lines, ["Nanzen-ji · Day 3 · 17:30 starts after closing (5:00 PM)"]);
});

test("S4 past the plan's daily budget the stop is capped and says hours were not checked", async () => {
  // Budget is 2 (PLACES_LOOKUPS_PER_DRAFT); S1 spent one. One more billed lookup, then the cap.
  const fake = placesFake();
  const kiyo = await add(TRIP, "Kiyomizu-dera", 1, "10:00");
  await startHandAddLookup(TRIP, kiyo.id, { adapters: [fake.adapter] });
  assert.equal(fake.state.billed, 1);
  assert.equal(await handAddLookupsToday(TRIP), 2);
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref = ${id("place-kiyomizu")}`);
  const capped = await add(TRIP, "Kiyomizu-dera", 4, "11:00");
  await startHandAddLookup(TRIP, capped.id, { adapters: [fake.adapter] });
  assert.equal(fake.state.billed, 1, "no billed call past the budget");
  const r = await outcomes(capped.id);
  assert.deepEqual([r[0].outcome, r[0].reason], ["capped", "plan_day_cap"]);
  const checks = await loadStopChecks(TRIP, capped.id);
  assert.deepEqual(checks!.hours, { status: "not_checked" });
  assert.equal(checks!.pending, false);
  assert.equal(HOURS_NOT_CHECKED_LINE, "Hours not checked for this stop");
});

test("S5 a lookup failure never fails the save", async () => {
  const item = await add(FREE, "Kiyomizu-dera", 2, "10:00");
  await assert.doesNotReject(startHandAddLookup(FREE, item.id, { adapters: [placesFake({ throwOn: "id" }).adapter] }));
  const r = await outcomes(item.id);
  assert.equal(r[0].outcome, "error");
  assert.ok(!String(r[0].reason).includes("query"), "a code, never the message");
  const still = (await db.execute(sql`SELECT id FROM itinerary_items WHERE id = ${item.id}`)).rows;
  assert.equal(still.length, 1);
});

test("S6 the way in: an unlocated end keeps the gap; a free plan reads the straight line", async () => {
  const gin = (await db.execute(sql`SELECT id FROM itinerary_items WHERE trip_id = ${TRIP} AND title = 'Ginkaku-ji Temple'`)).rows[0] as any;
  const c = await loadStopChecks(TRIP, gin.id);
  assert.deepEqual(c!.reach, { kind: "unlocated", stop: "Kinkaku-ji" });
  assert.equal(c!.routedPlan, false);

  const a = await add(FREE, "Kinkaku-ji", 3, "09:00", { lat: 35.0394, lng: 135.7292 });
  const b = await add(FREE, "Ryoan-ji", 3, "11:00", { lat: 35.0345, lng: 135.7183 });
  const free = await loadStopChecks(FREE, b.id);
  assert.equal(free!.reach?.kind, "straight");
  assert.equal((free!.reach as any).from, "Kinkaku-ji");
  assert.equal((free!.reach as any).mode, "walk");
  assert.ok((free!.reach as any).minutes >= 1);
  assert.equal((await loadStopChecks(FREE, a.id))!.reach, null, "the day's first stop has nothing to reach from");
});

test("S7 the check read is behind the plan's read gate", async () => {
  const gin = (await db.execute(sql`SELECT id FROM itinerary_items WHERE trip_id = ${TRIP} AND title = 'Ginkaku-ji Temple'`)).rows[0] as any;
  const ok = await call(`/api/trips/${TRIP}/stops/${gin.id}/checks`, OWNER);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.itemId, gin.id);
  const stranger = await call(`/api/trips/${TRIP}/stops/${gin.id}/checks`, STRANGER);
  assert.ok(stranger.status === 403 || stranger.status === 404, `stranger refused (${stranger.status})`);
  const notHere = await call(`/api/trips/${TRIP}/stops/${id("nope")}/checks`, OWNER);
  assert.equal(notHere.status, 404);
});

test("S8 the admin counts reader names official_fact and plan_day_cap", async () => {
  const { lookupOutcomeCounts } = await import("../services/content-facts/lookup-outcomes.service");
  const { counts } = await lookupOutcomeCounts(1);
  const keys = new Set(counts.map((c) => `${c.outcome}/${c.reason}`));
  assert.ok(keys.has("skipped/official_fact"), [...keys].join(", "));
  assert.ok(keys.has("capped/plan_day_cap"), [...keys].join(", "));
});
