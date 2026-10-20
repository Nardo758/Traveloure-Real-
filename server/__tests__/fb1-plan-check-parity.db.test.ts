/**
 * FB-1 step 2 (ledger `2026-10-18-fb1-pure-checker`): the pure checker against the trip wrapper, on a real database.
 *
 * One free Kyoto plan, Monday 2027-11-08 – Tuesday 2027-11-09; every stop's row point equals its OSM point, so the
 * pre-split loader (row points) and the split one (open points) read the same coordinates:
 *   day 1  15:00 Temple B (90 min, official hours close 16:00) · 16:45 Kiyomizu (30 min, official last entry 16:30;
 *          the ride on leaves 17:15 after the 17:00 last bus) · 20:00 Arashiyama (official hours close 17:00)
 *   day 2  a zig-zag of four stops; a confirmed 90-minute walk Z1→Z2 with no gap; a 12:30 departure flight
 *          (leave by 10:30); the energy row says the day needs recovery
 *
 *   P1  the wrapper's card findings, day lines and per-stop hours equal what the pre-split loader returned
 *       (GOLDEN, captured on the step-1 code before the split)
 *   P2  the wrapper equals `checkPlan` over the input the wrapper read (`loadPlanCheckInput`) — one rule, two callers
 *   P3  the pure checker's uncapped list carries every kind the plan trips, in the card's order
 *   P4  every issue names its type, day, why, source, checked date and one fix; a stop-level issue names its stop
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/fb1-plan-check-parity.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { recordFacts } from "../services/content-facts/place-facts.service";
import * as lead from "../services/optimizer-lead.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1p-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const other = id("other");
const pid = (k: string) => `ChIJ-fb1p-${RUN}-${k}`;
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const fact = (over: Record<string, unknown>) => ({
  placeRefKind: "place_id" as const, placeRef: pid("b"), placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours" as const,
  factType: "hours" as const, value: {}, origin: "crawled" as const, sourceId: null, sourceUrl: null, license: "official" as const,
  // CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): a dated, machine-read fact shows only once a person reviewed it.
  verifiedBy: owner,
  fetchedAt: NOW, expiresAt: later(30), costCents: 0, ...over,
}) as any;

const STOPS: Array<[string, number, string, number, number, number, number]> = [
  // key, day, start, minutes, lat, lng, sort
  ["b", 1, "15:00", 90, 35.0, 135.782, 1],
  ["k", 1, "16:45", 30, 34.9949, 135.785, 2],
  ["a", 1, "20:00", 60, 35.0094, 135.668, 3],
  ["z1", 2, "09:00", 30, 35.0, 135.76, 1],
  ["z2", 2, "09:30", 30, 35.05, 135.76, 2],
  ["z3", 2, "10:30", 30, 35.001, 135.761, 3],
  ["z4", 2, "11:30", 30, 35.051, 135.761, 4],
];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const t of [trip, other]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'FB-1 parity', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  }
  for (const [k, day, start, mins, lat, lng, sort] of STOPS) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, latitude, longitude, origin, sort_order, google_place_id)
      VALUES (${id(k)}, ${trip}, ${day}, ${`Stop ${k.toUpperCase()}`}, 'activity', ${start}, ${mins}, ${String(lat)}, ${String(lng)}, 'traveler', ${sort}, ${pid(k)})`);
    await db.execute(sql`INSERT INTO open_place_coords (id, source, google_place_id, lat, lng, osm_type, osm_id, name, matched_by, attribution, matched_at)
      VALUES ('osm:node/' || ${pid(k)}, 'osm', ${pid(k)}, ${String(lat)}, ${String(lng)}, 'node', 1, ${k}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  }
  await recordFacts([fact({ sourceUrl: "https://temple-b.example.jp/", value: { text: "9:00–16:00", quote: "9:00–16:00", weekdayDescriptions: ["Monday: 9:00 AM – 4:00 PM"] } })], { planId: trip, itemId: id("b") });
  await recordFacts([fact({ placeRef: pid("a"), sourceUrl: "https://arashiyama.example.jp/", value: { text: "9:00–17:00", quote: "9:00–17:00", weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } })], { planId: trip, itemId: id("a") });
  await recordFacts([fact({ placeRef: pid("k"), factType: "last_admission", sourceUrl: "https://www.kiyomizudera.or.jp/en/", value: { byWeekday: { "1": "16:30" }, quote: "Last admission 16:30" } })], { planId: trip, itemId: id("k") });
  await recordFacts(
    [fact({ placeRefKind: "free_text", placeRef: `Kiyomizu-gojo-${RUN}`, placeLat: 34.995, placeLng: 135.7855, need: "transport.local", factType: "last_service",
      sourceUrl: "https://www.city.kyoto.lg.jp/kotsu/",
      value: { operator: "Kyoto City Bus", line: "206", station: "Kiyomizu-michi", lastDeparture: "17:00", weekdays: [1], validFrom: "2027-01-01", validTo: "2028-01-01", quote: "最終 17:00" } })],
    { planId: other, itemId: null },
  );
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_name, from_lat, from_lng, to_name, to_lat, to_lng, distance_meters, distance_display,
      recommended_mode, estimated_duration_minutes, from_activity_id, to_activity_id, proposal_status)
    VALUES (${id("leg")}, ${trip}, 2, 1, 'Stop Z1', 35.0, 135.76, 'Stop Z2', 35.05, 135.76, 5560, '5.6 km', 'walk', 90, ${id("z1")}, ${id("z2")}, 'confirmed')`);
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, buffer_before, buffer_after, description)
    VALUES (${id("flight")}, ${trip}, 'flight_departure', '2027-11-09 12:30:00', 120, 0, 'KIX')`);
  await db.execute(sql`INSERT INTO energy_tracking (id, trip_id, day_number, recovery_needed) VALUES (${id("e2")}, ${trip}, 2, true)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${trip}, ${other}) OR place_ref LIKE ${`%${RUN}%`}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE google_place_id LIKE ${`ChIJ-fb1p-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${other})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await pool.end();
});

/** Ids in the output are per-run; the golden names stops by key. */
const keyed = (v: unknown) => JSON.parse(JSON.stringify(v).replaceAll(`fb1p-${RUN}-`, ""));

async function wrapperOutput() {
  const { findings } = await lead.loadOptimizerFindings(trip);
  const days = Object.fromEntries(Array.from((await lead.loadDayFeasibility(trip)).entries()));
  const stopHours: Record<string, unknown> = {};
  for (const [k] of STOPS) stopHours[k] = await lead.loadStopHours(trip, id(k));
  return keyed({ findings, days, stopHours });
}

/** Captured on the step-1 code BEFORE the split (the loader that read its own inputs). */
const GOLDEN = {"findings":[{"kind":"leg_unreachable","count":1,"days":[2],"stops":[{"itemId":"z2","title":"Stop Z2","day":2}],"routed":false,"est":true},{"kind":"closed_on_arrival","count":1,"days":[1],"stops":[{"itemId":"a","title":"Stop A","day":1,"reason":"after_closing","atMin":1020,"startMin":1200}],"caveat":"based on current hours · re-checked 3 days before your trip"},{"kind":"after_last_admission","count":1,"days":[1],"stops":[{"itemId":"k","title":"Stop K","day":1,"reason":"after_last_entry","atMin":990,"startMin":1005}]}],"days":{"1":{"stops":3,"hoursChecked":2,"lastEntryChecked":1,"rides":1,"ridesChecked":1},"2":{"stops":4,"hoursChecked":0,"lastEntryChecked":0,"rides":2,"ridesChecked":0}},"stopHours":{"b":{"found":true,"hasTime":true,"checked":true,"lines":["Stop B · Day 1 · 15:00 closes at 4:00 PM, before your visit ends"],"caveat":"based on current hours · re-checked 3 days before your trip"},"k":{"found":true,"hasTime":true,"checked":true,"lines":["Stop K · Day 1 · 16:45 arrives after last entry (4:30 PM)"]},"a":{"found":true,"hasTime":true,"checked":true,"lines":["Stop A · Day 1 · 20:00 starts after closing (5:00 PM)"],"caveat":"based on current hours · re-checked 3 days before your trip"},"z1":{"found":true,"hasTime":true,"checked":false,"lines":[]},"z2":{"found":true,"hasTime":true,"checked":false,"lines":[]},"z3":{"found":true,"hasTime":true,"checked":false,"lines":[]},"z4":{"found":true,"hasTime":true,"checked":false,"lines":[]}}};

test("P1 the wrapper returns what the pre-split loader returned", async () => {
  assert.deepEqual(await wrapperOutput(), GOLDEN);
});

test("P2 the wrapper is checkPlan over the input it read", async () => {
  const { checkPlan } = await import("@shared/plan-check");
  const { input } = await lead.loadPlanCheckInput(trip);
  const pure = checkPlan(input);
  const { findings, notChecked } = await lead.loadOptimizerFindings(trip);
  assert.deepEqual(findings, pure.findings);
  assert.deepEqual(notChecked, pure.notChecked);
  assert.equal(input.stops.every((s) => s.point !== null), true, "every stop read at its OSM point");
});

test("P3 the uncapped list carries every kind the plan trips, in the card's order", async () => {
  const { checkPlan } = await import("@shared/plan-check");
  const r = checkPlan((await lead.loadPlanCheckInput(trip)).input);
  assert.deepEqual(r.allFindings.map((f) => f.kind), [
    "leg_unreachable", "closed_on_arrival", "after_last_admission", "closes_before_visit_end", "last_service_missed",
    "timed_entry_conflict", "city_crossing", "walking_saved_km", "pace_over",
  ]);
  assert.deepEqual(r.findings, r.allFindings.slice(0, 3), "the card keeps its three");
});

test("P4 every issue names type, day, why, source, checked date and one fix", async () => {
  const { checkPlan } = await import("@shared/plan-check");
  const r = checkPlan((await lead.loadPlanCheckInput(trip)).input);
  const short = keyed(r.issues.map((i) => ({ type: i.type, day: i.day, stop: i.stop?.itemId ?? null, why: i.why, source: i.source.kind, url: i.source.url, dated: i.checkedAt !== null, fix: i.fix })));
  assert.deepEqual(short, [
    { type: "leg_unreachable", day: 2, stop: "z2", why: "leg_too_long", source: "plan_leg", url: null, dated: false, fix: { action: "retime", itemId: "z2", day: 2, notBeforeMin: 660 } },
    { type: "closed_on_arrival", day: 1, stop: "a", why: "after_closing", source: "official_fact", url: "https://arashiyama.example.jp/", dated: true, fix: { action: "retime", itemId: "a", day: 1, notAfterMin: 960 } },
    { type: "after_last_admission", day: 1, stop: "k", why: "after_last_entry", source: "official_fact", url: "https://www.kiyomizudera.or.jp/en/", dated: true, fix: { action: "retime", itemId: "k", day: 1, notAfterMin: 990 } },
    { type: "closes_before_visit_end", day: 1, stop: "b", why: "closes_early", source: "official_fact", url: "https://temple-b.example.jp/", dated: true, fix: { action: "retime", itemId: "b", day: 1, notAfterMin: 870 } },
    { type: "last_service_missed", day: 1, stop: "k", why: "after_last_service", source: "official_fact", url: "https://www.city.kyoto.lg.jp/kotsu/", dated: true, fix: { action: "retime", itemId: "k", day: 1, notAfterMin: 990 } },
    { type: "timed_entry_conflict", day: 2, stop: "z3", why: "overlaps_anchor", source: "anchor", url: null, dated: false, fix: { action: "move_clear_of_anchor", itemId: "z3", day: 2, anchorId: "flight" } },
    { type: "timed_entry_conflict", day: 2, stop: "z4", why: "overlaps_anchor", source: "anchor", url: null, dated: false, fix: { action: "move_clear_of_anchor", itemId: "z4", day: 2, anchorId: "flight" } },
    { type: "city_crossing", day: 2, stop: null, why: "crosses_city", source: "open_coordinates", url: null, dated: false, fix: { action: "reorder_day", day: 2 } },
    { type: "walking_saved_km", day: 2, stop: null, why: "walking_saved", source: "open_coordinates", url: null, dated: false, fix: { action: "reorder_day", day: 2 } },
    { type: "pace_over", day: 2, stop: null, why: "recovery_needed", source: "energy", url: null, dated: false, fix: { action: "lighten_day", day: 2 } },
  ]);
  for (const i of r.issues) assert.ok(i.source.kind === "official_fact" ? i.source.provenance : true, "a fact-backed issue carries its provenance line");
});

test("P5 a stop with no open point takes no ride: last_service_missed is not raised from a Google point", async () => {
  await db.execute(sql`DELETE FROM open_place_coords WHERE google_place_id = ${pid("k")}`);
  try {
    const { checkPlan } = await import("@shared/plan-check");
    const { input } = await lead.loadPlanCheckInput(trip);
    assert.equal(input.stops.find((s) => s.id === id("k"))?.point, null, "Kiyomizu's row point is Google and is not read");
    const r = checkPlan(input);
    assert.equal(r.allFindings.some((f) => f.kind === "last_service_missed"), false);
    const { feasibilityView } = await import("@shared/plan-check");
    // LG-2 Ask 6: a ride is derived between ADJACENT stops only — B and A are not adjacent across Kiyomizu.
    assert.deepEqual(keyed(feasibilityView(input).rides.filter((x) => x.dayNumber === 1).map((x) => [x.fromItemId, x.toItemId])), [], "no ride leaves Kiyomizu, and none goes round it");
    const day1 = (await lead.loadDayFeasibility(trip)).get(1);
    assert.equal(day1?.rides, 0, "the day line reads the same view");
  } finally {
    await db.execute(sql`INSERT INTO open_place_coords (id, source, google_place_id, lat, lng, osm_type, osm_id, name, matched_by, attribution, matched_at)
      VALUES ('osm:node/' || ${pid("k")}, 'osm', ${pid("k")}, '34.9949', '135.785', 'node', 1, 'k', 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  }
});
