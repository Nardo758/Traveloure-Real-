/**
 * The versions board against a real database (surface step 5; ledger
 * `2026-10-04-surface-step5-map-versions`; migrations 343/344).
 *
 *   B1 the read: the latest run's three versions labelled A/B/C, each with per-day diffs by item id,
 *      and the plan as the LIVE plan — no travel minute leaves
 *   B2 apply-days: ONE day is replaced from a version — a kept stop's row MOVES (same id), a new
 *      stop is inserted, a dropped stop is removed, a locked stop stays; adopted rows carry
 *      source_run_id/source_variant_id; other days and the stored draft are untouched
 *   B3 R-ac: three free re-times, then the FOURTH is refused (409 retime_paid) and re-times nothing
 *   B4 a swap-in from a version joins the day and triggers the same re-time
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { VersionBoardError, applyDays, loadVersionsBoard, retimeDay } from "../services/version-board.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `vb-${RUN}-${s}`;
const OWNER = id("owner");
const T = id("plan");
const CMP = id("cmp");
const V = { base: id("vbase"), A: id("vA"), B: id("vB"), C: id("vC") };

async function item(key: string, day: number, sort: number, title: string, start: string, extra = sql``) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, end_time, routing_status)
    VALUES (${id(key)}, ${T}, ${day}, ${sort}, ${title}, 'attraction', 'ai', ${start}, NULL, 'in_planning')`);
  void extra;
}
async function vitem(variant: string, key: string, day: number, sort: number, name: string, start: string, end: string, source: string | null, lat: number) {
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, end_time, source_item_id, latitude, longitude)
    VALUES (${id(key)}, ${variant}, ${day}, ${sort}, ${name}, 'activity', ${start}, ${end}, ${source}, ${String(lat)}, '135.7')`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${T}, ${OWNER}, 'Versions', 'Kyoto, Japan', '2027-11-11', '2027-11-12', 'draft', 'vacation')`);
  await item("k1", 1, 0, "Kiyomizu-dera", "09:00");
  await item("k2", 1, 1, "Gion", "11:00");
  await item("d1", 2, 0, "Kinkaku-ji", "09:00");
  await item("d2", 2, 1, "Ryoan-ji", "11:00");
  await item("lock", 2, 2, "Tea ceremony (kept)", "15:00");
  await db.execute(sql`UPDATE itinerary_items SET locked_at = now() WHERE id = ${id("lock")}`);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${CMP}, ${OWNER}, ${T}, 'Versions', 'Kyoto, Japan', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order)
    VALUES (${V.base}, ${CMP}, 'Your Plan', 'user', 'generated', 0)`);
  for (const [k, n, s] of [["A", "Budget", 1], ["B", "Relaxed", 2], ["C", "Experience", 3]] as const) {
    await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order, run_id)
      VALUES (${(V as any)[k]}, ${CMP}, ${n}, 'ai_optimized', 'generated', ${s}, ${id("run")})`);
  }
  // A keeps everything; B on day 2: Ryoan-ji first, Kinkaku-ji dropped, Nishiki added; C adds a stop on day 1.
  for (const v of [V.A, V.B, V.C]) {
    await vitem(v, `${v}-1`, 1, 0, "Kiyomizu-dera", "09:00", "10:30", id("k1"), 35.0);
    await vitem(v, `${v}-2`, 1, 1, "Gion", "11:00", "12:00", id("k2"), 35.01);
  }
  await vitem(V.A, "a3", 2, 0, "Kinkaku-ji", "09:00", "10:00", id("d1"), 35.03);
  await vitem(V.A, "a4", 2, 1, "Ryoan-ji", "11:00", "12:00", id("d2"), 35.031);
  await vitem(V.B, "b3", 2, 0, "Ryoan-ji", "09:00", "10:00", id("d2"), 35.03);
  await vitem(V.B, "b4", 2, 1, "Nishiki Market", "10:30", "12:00", null, 35.0);
  await vitem(V.C, "c3", 1, 2, "Fushimi Inari", "14:00", "16:00", null, 34.97);
  await vitem(V.C, "c4", 2, 0, "Kinkaku-ji", "09:00", "10:00", id("d1"), 35.03);
  await vitem(V.C, "c5", 2, 1, "Ryoan-ji", "11:00", "12:00", id("d2"), 35.031);
});

after(async () => {
  await db.execute(sql`DELETE FROM plan_day_retimes WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE variant_id IN (${V.base}, ${V.A}, ${V.B}, ${V.C})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

test("B1 the read: A/B/C from the latest run, per-day diffs by id, the live plan", async () => {
  const view = await loadVersionsBoard(T);
  assert.deepEqual(view.versions.map((v) => v.label), ["A", "B", "C"]);
  assert.equal(view.run?.runId, id("run"));
  const b = view.versions[1];
  const d2 = b.days.find((d) => d.dayNumber === 2)!;
  assert.deepEqual(d2.dropped, [id("d1")], "the locked stop is a fixed point, never 'dropped'");
  assert.equal(d2.added.length, 1);
  assert.equal(d2.moved.length, 1);
  assert.equal(view.versions[0].days.find((d) => d.dayNumber === 1)!.identical, true);
  assert.equal(view.plan.stops.length, 5, "the live plan, not the stored baseline row");
  assert.doesNotMatch(JSON.stringify(view), /totalTravelTime|travel_time|travelTime|freeTimeMinutes/i);
  assert.equal(view.plan.stops.find((s) => s.id === id("lock"))?.fixed, true);
});

test("B2 apply-days: one day from B — moved in place, added, dropped, locked kept, provenance; the rest untouched", async () => {
  const out = await applyDays({ tripId: T, userId: OWNER, days: [{ day: 2, variantId: V.B }] });
  assert.equal(out.days.length, 1);
  const rows = (await db.execute(sql`SELECT id, title, day_number, start_time, sort_order, source_run_id, source_variant_id FROM itinerary_items WHERE trip_id = ${T} ORDER BY day_number, sort_order`)).rows as any[];
  const day2 = rows.filter((r) => r.day_number === 2);
  const ryoan = day2.find((r) => r.title === "Ryoan-ji");
  assert.equal(ryoan.id, id("d2"), "the kept stop's row MOVED — same id");
  assert.equal(ryoan.start_time, "09:00");
  assert.equal(ryoan.source_variant_id, V.B);
  assert.equal(ryoan.source_run_id, id("run"));
  const nishiki = day2.find((r) => r.title === "Nishiki Market");
  assert.ok(nishiki && nishiki.source_variant_id === V.B, "the new stop is inserted with provenance");
  assert.ok(!day2.some((r) => r.title === "Kinkaku-ji"), "the dropped stop is removed");
  assert.ok(day2.some((r) => r.id === id("lock")), "a locked stop is never removed");
  const day1 = rows.filter((r) => r.day_number === 1);
  assert.deepEqual(day1.map((r) => r.id), [id("k1"), id("k2")]);
  assert.ok(day1.every((r) => r.source_variant_id === null), "a day not adopted is untouched");
  const baseline = (await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_variants WHERE id = ${V.base}`)).rows[0] as any;
  assert.equal(baseline.n, 1, "the stored draft is never deleted");
  const vItems = (await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_variant_items WHERE variant_id = ${V.B}`)).rows[0] as any;
  assert.equal(vItems.n, 4, "the run is immutable");
});

test("B3 three free re-times, the fourth is refused with the paid-run answer and changes nothing", async () => {
  const order = [id("lock"), id("d2")];
  for (let i = 0; i < 3; i++) {
    const r = await retimeDay({ tripId: T, userId: OWNER, day: 2, order });
    assert.equal(r.remaining, 2 - i);
  }
  const before4 = (await db.execute(sql`SELECT id, start_time FROM itinerary_items WHERE trip_id = ${T} AND day_number = 2 ORDER BY id`)).rows;
  await assert.rejects(
    retimeDay({ tripId: T, userId: OWNER, day: 2, order: order.slice().reverse() }),
    (e: unknown) => {
      assert.ok(e instanceof VersionBoardError && e.code === "retime_paid" && e.status === 409);
      // The refusal states the paid run and, when the fee resolver answers, its price.
      assert.match(e.message, /^Re-timing now is a paid run/);
      const fee = (e.extra as any).fee;
      assert.ok(fee && "label" in fee);
      if (fee.label) assert.ok(e.message.includes(fee.label), "the message names the fee");
      return true;
    },
  );
  const after4 = (await db.execute(sql`SELECT id, start_time FROM itinerary_items WHERE trip_id = ${T} AND day_number = 2 ORDER BY id`)).rows;
  assert.deepEqual(after4, before4, "the fourth re-time re-timed nothing");
  const n = (await db.execute(sql`SELECT count(*)::int AS n FROM plan_day_retimes WHERE trip_id = ${T}`)).rows[0] as any;
  assert.equal(n.n, 3, "and wrote no counter row");
});

test("B4 a swap-in joins the day and triggers the same re-time (counted)", async () => {
  await db.execute(sql`DELETE FROM plan_day_retimes WHERE trip_id = ${T}`);
  const r = await retimeDay({ tripId: T, userId: OWNER, day: 1, order: [id("k1"), id("k2")], swapIn: { variantItemId: id("c3") } });
  const titles = (await db.execute(sql`SELECT title, start_time FROM itinerary_items WHERE trip_id = ${T} AND day_number = 1 ORDER BY sort_order`)).rows as any[];
  assert.deepEqual(titles.map((t) => t.title), ["Kiyomizu-dera", "Gion", "Fushimi Inari"]);
  assert.ok(titles.every((t) => /^\d{2}:\d{2}$/.test(t.start_time)));
  assert.equal(r.items.length, 3);
  const n = (await db.execute(sql`SELECT count(*)::int AS n FROM plan_day_retimes WHERE trip_id = ${T}`)).rows[0] as any;
  assert.equal(n.n, 1);
});
