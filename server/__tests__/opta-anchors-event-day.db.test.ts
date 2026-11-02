/**
 * OPT-A (ledger `2026-11-01-opt-a-event-day-anchors`): Optimize anchors "event" and "day", end to end on a real
 * database. The model answer is injected through `deps.callAI` (the FB-1 seam).
 *
 * A four-day Kyoto plan, 2027-11-08..11:
 *   Day 1  Temple 09:00 (located) · Tea Ceremony 14:00–15:30 (located — the event)
 *   Day 2  Market 10:00 (located) · Garden 13:00 (located) · Show 19:00 (located, PURCHASED)
 *   Day 3  Pagoda 10:00 (located)
 *   Day 4  Walk 15:00 (no point)
 *
 *   A1 parsePinnedAnchorInput accepts event/day with an id; a type-only pin parses but is refused; "castle" is undefined
 *   A2 placement: event/day resolve from the plan only (no geocode, no catalog); every refusal by its code
 *   A3 optimizer, event: the event is fixed, the prompt names it with its day and HH:MM, an echo is stripped, and
 *      every version keeps it on its own day and times
 *   A4 optimizer, day: day 2's stops keep their day and times in every version; another day changed; the DAY line
 *   A5 a paid run whose event pin no longer resolves fails and takes the refund path
 *   A6 the candidate read returns event[] and day[]; the purchased Show is an event; one day entry per trip day
 *   A7 the persisted itinerary_variants.anchor_type is "event" / "day" with name and point
 *   A8 no new string the server returns carries minutes
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_opta";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { loadTripOptimizerInputs } = await import("../services/optimizer-baseline.service");
const { generateOptimizedItineraries } = await import("../itinerary-optimizer");
const { placeCustomPinBeforeCharge } = await import("../services/custom-pin-place");
const { resolveOptimizerPinnedAnchor, baselineItemsToAnchorStops } = await import("../services/anchor-candidates");
const { parsePinnedAnchorInput } = await import("../services/anchor-candidates-map");
const { paidPinFellBack, recordUnresolvedPaidPin } = await import("../services/paid-pin-resolution");
const { createTripAnchorCandidatesHandler } = await import("../routes/trips.routes");
const { loadPlanAnchorContext } = await import("../services/plan-anchors.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `opta-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const comparisons: string[] = [];

const ITEMS = {
  temple: { day: 1, title: "Temple", start: "09:00", end: "10:00", lat: 35.0, lng: 135.70, status: "in_planning" },
  tea: { day: 1, title: "Tea Ceremony", start: "14:00", end: "15:30", lat: 35.01, lng: 135.72, status: "in_planning" },
  market: { day: 2, title: "Market", start: "10:00", end: "11:00", lat: 35.02, lng: 135.74, status: "in_planning" },
  garden: { day: 2, title: "Garden", start: "13:00", end: "14:00", lat: 35.03, lng: 135.76, status: "in_planning" },
  show: { day: 2, title: "Show", start: "19:00", end: "21:00", lat: 35.04, lng: 135.78, status: "purchased" },
  pagoda: { day: 3, title: "Pagoda", start: "10:00", end: "11:00", lat: 35.05, lng: 135.80, status: "in_planning" },
  walk: { day: 4, title: "Walk", start: "15:00", end: "16:00", lat: null, lng: null, status: "in_planning" },
} as const;
type Key = keyof typeof ITEMS;

const stop = (dayNumber: number, name: string, at: string) => ({
  dayNumber, timeSlot: "morning", startTime: at, endTime: null, name, description: "", serviceType: "activities",
  price: 0, rating: 4.5, location: "Kyoto", duration: 60, travelTimeFromPrevious: null, isReplacement: false, replacementReason: null,
  originalServiceId: null,
});
const variants = (items: ReturnType<typeof stop>[]) =>
  JSON.stringify({
    variants: ["Version A", "Version B", "Version C"].map((name) => ({
      name, description: "d", reasoning: "r", items,
      metrics: { totalCost: 0, totalTravelTime: 0, averageRating: 4.5, freeTimeMinutes: 0, optimizationScore: 80 },
    })),
  });

/** Every number-with-a-minute-unit pattern the server could emit. */
const MINUTES = /\b\d+\s*(min|mins|minute|minutes)\b|estMedianWalkMinutes|walkMinutes/i;

async function run(pin: Record<string, unknown>, modelItems: ReturnType<typeof stop>[]) {
  const cmp = id(`cmp-${comparisons.length}`);
  comparisons.push(cmp);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${cmp}, ${owner}, ${trip}, 'OPT-A', 'Kyoto, Japan', 'generating')`);
  const { baselineItems, fixedCommitments } = await loadTripOptimizerInputs(trip);
  const rawPin: any = { ...pin };
  const placed = await placeCustomPinBeforeCharge({
    rawPin, userId: owner, tripId: trip, activityStops: baselineItemsToAnchorStops(baselineItems as any),
    geocode: async () => { throw new Error("geocode must not run"); },
    catalogPinExists: async () => { throw new Error("catalog must not run"); },
  });
  assert.ok(placed.ok, "the pin places");
  const anchor = await resolveOptimizerPinnedAnchor(rawPin, baselineItems as any);
  assert.ok(anchor, "the pin resolves");
  const prompts: string[] = [];
  const out = await generateOptimizedItineraries(
    cmp, owner, baselineItems as any, [], "Kyoto, Japan", "2027-11-08", "2027-11-11", undefined, 2, trip,
    undefined, undefined, fixedCommitments as any, anchor, undefined, undefined,
    { callAI: async (system: string, user: string) => { prompts.push(`${system}\n${user}`); return variants(modelItems); } },
  );
  assert.ok(out.success, `the run finished: ${out.error ?? ""}`);
  const versions = (await db.execute(sql`SELECT id, anchor_type, anchor_name, anchor_lat, anchor_lng FROM itinerary_variants
    WHERE comparison_id = ${cmp} AND source = 'ai_optimized' ORDER BY sort_order`)).rows as any[];
  return { cmp, anchor, prompts, versions };
}

const versionItems = async (variantId: string) =>
  (await db.execute(sql`SELECT source_item_id, name, day_number, start_time, end_time FROM itinerary_variant_items
    WHERE variant_id = ${variantId}`)).rows as any[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${trip}, ${owner}, 'OPT-A', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-11', 'draft')`);
  let order = 0;
  for (const [k, v] of Object.entries(ITEMS)) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, end_time, duration_minutes,
      latitude, longitude, origin, sort_order, routing_status)
      VALUES (${id(k)}, ${trip}, ${v.day}, ${v.title}, 'activity', ${v.start}, ${v.end}, 60,
      ${v.lat}, ${v.lng}, 'traveler', ${order++}, ${v.status})`);
  }
});

after(async () => {
  for (const c of comparisons) await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${c}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`).catch(() => {});
  await pool.end();
});

test("A1 parsePinnedAnchorInput: event/day with an id; type-only parses (refused at placement); castle undefined", () => {
  assert.deepEqual(parsePinnedAnchorInput({ type: "event", id: "x" }), { type: "event", id: "x", name: undefined, lat: undefined, lng: undefined });
  assert.deepEqual(parsePinnedAnchorInput({ type: "day", id: "2" }), { type: "day", id: "2", name: undefined, lat: undefined, lng: undefined });
  assert.equal(parsePinnedAnchorInput({ type: "castle", id: "x" }), undefined);
  assert.ok(parsePinnedAnchorInput({ type: "event" }), "a type-only pin is a pin (so it is refused, never auto)");
});

test("A2 placement resolves event/day from the plan only; every refusal by its code", async () => {
  const forbid = {
    geocode: async () => { throw new Error("geocode must not run"); },
    catalogPinExists: async () => { throw new Error("catalog must not run"); },
  };
  const place = (pin: any, extra: Record<string, unknown> = {}) =>
    placeCustomPinBeforeCharge({ rawPin: pin, userId: owner, tripId: trip, ...forbid, ...extra } as any);

  const event: any = { type: "event", id: id("tea"), lat: 1, lng: 2, name: "forged" };
  assert.deepEqual(await place(event), { ok: true, resolved: null, placement: null });
  assert.deepEqual([event.lat, event.lng, event.name], [35.01, 135.72, "Tea Ceremony"], "the item's own point and name");

  for (const pin of [{ type: "event" }, { type: "event", name: "Tea Ceremony" }, { type: "day" }]) {
    const r: any = await place({ ...pin });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: "pinned_anchor_invalid" });
  }
  const noPoint: any = { type: "event", id: id("walk"), lat: 1, lng: 2 };
  const r1: any = await place(noPoint);
  assert.deepEqual([r1.status, r1.body], [400, { error: "pinned_anchor_not_found", detail: "event_not_anchorable" }]);
  assert.equal(noPoint.lat, undefined, "client coordinates are cleared on a miss");
  const r2: any = await place({ type: "event", id: "nope" });
  assert.deepEqual(r2.body, { error: "pinned_anchor_not_found", detail: "event_not_anchorable" });
  // An item with a point but no start time is not an event.
  await db.execute(sql`UPDATE itinerary_items SET start_time = NULL WHERE id = ${id("pagoda")}`);
  const r3: any = await place({ type: "event", id: id("pagoda") });
  assert.deepEqual(r3.body, { error: "pinned_anchor_not_found", detail: "event_not_anchorable" });
  await db.execute(sql`UPDATE itinerary_items SET start_time = '10:00' WHERE id = ${id("pagoda")}`);
  // Another trip's item is not this plan's event.
  const r4: any = await placeCustomPinBeforeCharge({ rawPin: { type: "event", id: id("tea") }, userId: owner, tripId: id("other"), ...forbid } as any);
  assert.deepEqual(r4.body, { error: "pinned_anchor_not_found" });

  const day: any = { type: "day", id: "2" };
  assert.equal((await place(day)).ok, true);
  assert.ok(Math.abs(day.lat - (35.02 + 35.03 + 35.04) / 3) < 1e-9, "centroid of the day's located stops");
  assert.ok(Math.abs(day.lng - (135.74 + 135.76 + 135.78) / 3) < 1e-9);
  assert.equal(day.name, "Day 2");
  const r5: any = await place({ type: "day", id: "4" });
  assert.deepEqual(r5.body, { error: "pinned_anchor_not_found", detail: "day_not_anchorable" });
  for (const out of ["0", "5", "x"]) {
    const r: any = await place({ type: "day", id: out });
    assert.deepEqual(r.body, { error: "pinned_anchor_not_found" }, `day ${out} is out of range`);
  }
  // A day holding every optimizable stop leaves nothing to rebuild.
  const onlyDay1 = async () => ({
    startDate: "2027-11-08", endDate: "2027-11-09",
    items: [
      { id: "a", name: "A", dayNumber: 1, startTime: "09:00", scheduledDate: null, lat: 35, lng: 135, location: null, providerServiceId: null, optimizable: true },
      { id: "b", name: "B", dayNumber: 2, startTime: "09:00", scheduledDate: null, lat: 35, lng: 135, location: null, providerServiceId: null, optimizable: false },
    ],
  });
  const r6: any = await place({ type: "day", id: "1" }, { planAnchorContext: onlyDay1 });
  assert.deepEqual(r6.body, { error: "pinned_anchor_not_found", detail: "day_nothing_to_rebuild" });
});

test("A3 + A7 optimizer, event: fixed, named in the prompt, echo stripped, kept on its day and times", async () => {
  const { anchor, prompts, versions } = await run({ type: "event", id: id("tea") }, [
    stop(1, "Temple", "11:00"),
    stop(1, "Tea Ceremony", "17:00"), // an echo, moved: must be stripped
    stop(2, "Market", "09:00"),
    stop(2, "Garden", "15:00"),
    stop(3, "Pagoda", "14:00"),
    stop(4, "Walk", "11:00"),
  ]);
  assert.equal(anchor!.anchorId, `event:${id("tea")}`);
  assert.equal(anchor!.type, "event");
  assert.equal(anchor!.name, "Tea Ceremony");
  assert.ok(
    prompts[0].includes(`BUILD THIS VERSION AROUND the event "Tea Ceremony" on day 1 at 14:00; it is fixed and does not move; cluster that day's other stops before and after it and let the trip radiate from it.`),
    "the event line",
  );
  assert.match(prompts[0], /FIXED FOR THIS VERSION[\s\S]*- Day 1 at 14:00: Tea Ceremony/);
  assert.equal(versions.length, 3);
  for (const v of versions) {
    const rows = await versionItems(v.id);
    const tea = rows.filter((r) => r.name === "Tea Ceremony");
    assert.equal(tea.length, 1, "one Tea Ceremony: the echo was stripped and the plan's own carried through");
    assert.deepEqual(
      [tea[0].source_item_id, tea[0].day_number, tea[0].start_time, tea[0].end_time],
      [id("tea"), 1, "14:00", "15:30"],
      "the event keeps its day and times",
    );
    // A7
    assert.equal(v.anchor_type, "event");
    assert.equal(v.anchor_name, "Tea Ceremony");
    assert.equal(Number(v.anchor_lat), 35.01);
    assert.equal(Number(v.anchor_lng), 135.72);
  }
});

test("A4 + A7 optimizer, day: day 2 kept exactly as built; another day changed; the DAY line", async () => {
  const { anchor, prompts, versions } = await run({ type: "day", id: "2" }, [
    stop(1, "Temple", "11:00"),
    stop(1, "Tea Ceremony", "16:00"),
    stop(2, "Garden", "09:00"), // an echo of a day-2 stop: must be stripped
    stop(3, "Pagoda", "14:00"),
    stop(4, "Walk", "11:00"),
  ]);
  assert.equal(anchor!.anchorId, "day:2");
  assert.equal(anchor!.name, "Day 2");
  assert.ok(prompts[0].includes("DAY 2 IS FIXED EXACTLY AS BUILT; do not include any of its stops; rebuild the other days around it, radiating from its stops."));
  for (const v of versions) {
    const rows = await versionItems(v.id);
    for (const k of ["market", "garden"] as Key[]) {
      const kept = rows.filter((r) => r.source_item_id === id(k));
      assert.equal(kept.length, 1, `${k} appears once`);
      assert.deepEqual([kept[0].day_number, kept[0].start_time, kept[0].end_time], [ITEMS[k].day, ITEMS[k].start, ITEMS[k].end], `${k} kept as built`);
    }
    assert.equal(rows.filter((r) => r.name === "Garden").length, 1, "the echo was stripped");
    const changed = rows.some((r) => r.source_item_id === id("temple") && r.start_time !== "09:00")
      || rows.some((r) => r.source_item_id === id("pagoda") && r.start_time !== "10:00");
    assert.ok(changed, "another day was rebuilt");
    assert.equal(v.anchor_type, "day");
    assert.equal(v.anchor_name, "Day 2");
    assert.ok(Number.isFinite(Number(v.anchor_lat)) && Number.isFinite(Number(v.anchor_lng)));
  }
});

test("A5 a paid run whose event pin no longer resolves fails and takes the refund path", async () => {
  const cmp = id("cmp-paid");
  comparisons.push(cmp);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${cmp}, ${owner}, ${trip}, 'OPT-A paid', 'Kyoto, Japan', 'generating')`);
  const { baselineItems } = await loadTripOptimizerInputs(trip);
  const rawPin: any = { type: "event", id: id("gone"), lat: 35, lng: 135 };
  const placed: any = await placeCustomPinBeforeCharge({ rawPin, userId: owner, tripId: trip } as any);
  assert.equal(placed.status, 400, "refused before any charge");
  const resolved = await resolveOptimizerPinnedAnchor(rawPin, baselineItems as any);
  assert.equal(resolved, undefined, "client coordinates never resolve an event");
  assert.equal(paidPinFellBack(rawPin, resolved), true, "an unresolvable event pin is a failed paid run, not auto");
  assert.equal(paidPinFellBack({ type: "day", id: "9" }, undefined), true);
  const failed = await recordUnresolvedPaidPin(cmp);
  assert.equal(failed.status, "failed");
  const row = (await db.execute(sql`SELECT status FROM itinerary_comparisons WHERE id = ${cmp}`)).rows[0] as any;
  assert.equal(row.status, "failed");
});

test("A6 + A8 the candidate read returns event[] and day[]", async () => {
  const handler = createTripAnchorCandidatesHandler({
    getTrip: async (tid: string) => ({ id: tid, userId: owner, destination: "Kyoto, Japan" }) as any,
    loadTripInputs: loadTripOptimizerInputs,
    rankAnchors: async () => ({ hotel: [], neighborhood: [], activity: [] }),
    loadPlanAnchors: loadPlanAnchorContext,
  });
  const captured: any = {};
  const res: any = { status(s: number) { captured.status = s; return res; }, json(b: any) { captured.body = b; return res; } };
  await handler({ params: { id: trip }, user: { id: owner } }, res);
  const body = captured.body;
  assert.deepEqual(
    body.event.map((e: any) => [e.name, e.dayNumber, e.startTime]),
    [["Temple", 1, "09:00"], ["Tea Ceremony", 1, "14:00"], ["Market", 2, "10:00"], ["Garden", 2, "13:00"], ["Show", 2, "19:00"], ["Pagoda", 3, "10:00"]],
    "every located, timed stop, purchased included, by day then start; the unlocated Walk is absent",
  );
  const show = body.event.find((e: any) => e.name === "Show");
  assert.deepEqual(Object.keys(show).sort(), [
    "anchorId", "dayNumber", "lat", "lng", "locatedStops", "medianMeters", "name", "scheduledDate", "startTime",
    "totalStops", "type", "within15MinCount",
  ]);
  assert.equal(show.anchorId, `event:${id("show")}`);
  assert.equal(show.type, "event");
  assert.deepEqual(body.day, [
    { anchorId: "day:1", type: "day", name: "Day 1", dayNumber: 1, date: "2027-11-08", stopCount: 2, locatedStops: 2, anchorable: true },
    { anchorId: "day:2", type: "day", name: "Day 2", dayNumber: 2, date: "2027-11-09", stopCount: 3, locatedStops: 3, anchorable: true },
    { anchorId: "day:3", type: "day", name: "Day 3", dayNumber: 3, date: "2027-11-10", stopCount: 1, locatedStops: 1, anchorable: true },
    { anchorId: "day:4", type: "day", name: "Day 4", dayNumber: 4, date: "2027-11-11", stopCount: 1, locatedStops: 0, anchorable: false },
  ]);
  // A8: nothing the new kinds return carries a minute figure.
  assert.doesNotMatch(JSON.stringify({ event: body.event, day: body.day }), MINUTES);
  const r: any = await placeCustomPinBeforeCharge({ rawPin: { type: "day", id: "4" }, userId: owner, tripId: trip } as any);
  assert.doesNotMatch(JSON.stringify(r.body), MINUTES);
});
