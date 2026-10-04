/**
 * L1-3 — a buyer's copy carries the author's confirmed legs and the build's anchors (work plan
 * docs/planning/expert-console-ready-made-work-plan.md; rulings R-ba, R-bg). Runs the REAL
 * `fulfillReadyMadePurchase`.
 *
 *   L1  the copy holds exactly the source's CONFIRMED legs whose two ends resolve: same modes, tip,
 *       host-pickup reference, pickup point and checked stamp, `origin='author_pick'`, from/to
 *       remapped onto the copy's own items (same titles, same order); a proposed leg and a leg whose
 *       end no longer resolves are not carried; booking linkage and re-check state are not carried
 *   A1  anchors keep their day offset from the build's start date and their time of day, re-based on
 *       the copy's start date; `dependsOnItemIds` is remapped and an unresolvable id dropped
 *   S1  the source build's legs and anchors are untouched
 *   R1  a replayed fulfilment adds nothing
 *   C1  two concurrent fulfilments of one purchase leave ONE copy's legs and anchors (the loser's
 *       orphan trip delete cascades them)
 *   U1  `buildClonedLeg` / `buildClonedAnchor` / `isCarriedLeg` pure cases
 *
 * NEGATIVE SPACE (§18d): the live production FK cascade is not proven here — only that a database
 * built by the registered migrations has it (both `trip_id` FKs are ON DELETE CASCADE).
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/ready-made-clone-legs.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { buildClonedAnchor, buildClonedLeg, isCarriedLeg } from "../services/ready-made-clone-legs";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `l13-${RUN}-author`,
  buyer: `l13-${RUN}-buyer`,
  buyer2: `l13-${RUN}-buyer2`,
  source: `l13-${RUN}-source`,
  listing: `l13-${RUN}-listing`,
  purchase: `l13-${RUN}-purchase`,
  purchase2: `l13-${RUN}-purchase2`,
  a: `l13-${RUN}-a`,
  b: `l13-${RUN}-b`,
  c: `l13-${RUN}-c`,
  legAB: `l13-${RUN}-ab`,
  legBC: `l13-${RUN}-bc`,
  legCX: `l13-${RUN}-cx`,
  flight: `l13-${RUN}-flight`,
  lodging: `l13-${RUN}-lodging`,
};
const TIP = `Walk the back lane ${RUN}`;
const cloneIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[ready-made-clone-legs] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function legsOf(tripId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${tripId} ORDER BY day_number, leg_order`)).rows as any[];
}
async function anchorsOf(tripId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM temporal_anchors WHERE trip_id = ${tripId} ORDER BY anchor_datetime`)).rows as any[];
}
async function itemsOf(tripId: string): Promise<Map<string, string>> {
  const r = await db.execute(sql`SELECT id, title FROM itinerary_items WHERE trip_id = ${tripId}`);
  return new Map((r.rows as any[]).map((x) => [x.id, x.title]));
}

const insertLeg = (id: string, from: string, to: string, order: number, status: string, mode: string | null, extra = sql``) =>
  db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, user_selected_mode, linked_product_id, author_tip,
      pickup_provider_service_id, pickup_point, checked_by, checked_at)
    VALUES (${id}, ${ids.source}, 1, ${order}, ${from}, 'from', 35.0, 135.7, ${to}, 'to', 35.01, 135.71, 900, '0.9 km', 'walk',
      12, ${status}, ${mode}, 'prod-should-not-carry', ${TIP}, 'svc-ref-1', 'Hotel lobby', ${ids.author}, '2026-09-30T08:00:00Z')`);

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.author, "local_expert"], [ids.buyer, "traveler"], [ids.buyer2, "traveler"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'L13', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.source}, ${ids.author}, 'L1-3 build', 'Kyoto, Japan', '2027-03-10', '2027-03-11', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, latitude, longitude) VALUES
    (${ids.a}, ${ids.source}, 'Kiyomizu-dera', 1, 0, 34.9949, 135.7850),
    (${ids.b}, ${ids.source}, 'Yasaka Shrine', 1, 1, 35.0037, 135.7785),
    (${ids.c}, ${ids.source}, 'Gion Shirakawa', 1, 2, 35.0056, 135.7740)`);
  await insertLeg(ids.legAB, ids.a, ids.b, 0, "confirmed", "walk");
  await insertLeg(ids.legBC, ids.b, ids.c, 1, "proposed", null);
  await insertLeg(ids.legCX, ids.c, `${ids.c}-gone`, 2, "confirmed", "taxi");
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, buffer_after, location, depends_on_item_ids, description)
    VALUES (${ids.flight}, ${ids.source}, 'flight_arrival', '2027-03-10 14:30:00', 90, 'KIX',
      ${JSON.stringify([ids.a, `${ids.a}-gone`])}::jsonb, 'Arrive KIX')`);
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location)
    VALUES (${ids.lodging}, ${ids.source}, 'hotel_checkout', '2027-03-11 11:00:00', 'Ryokan')`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status, active)
    VALUES (${ids.listing}, ${ids.author}, ${ids.source}, 'Kyoto', 'L1-3 listing', 2, 3900, 'approved', true)`);
  for (const [pid, buyer] of [[ids.purchase, ids.buyer], [ids.purchase2, ids.buyer2]] as const) {
    await db.execute(sql`INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, status)
      VALUES (${pid}, ${buyer}, ${ids.listing}, 3900, ${`pi_${pid}`}, 'paid')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${ids.author}, ${ids.buyer}, ${ids.buyer2})`).catch(() => {});
  await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${ids.purchase}, ${ids.purchase2})`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${ids.purchase}, ${ids.purchase2})`).catch(() => {});
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id IN (${ids.purchase}, ${ids.purchase2})`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  for (const t of [...cloneIds, ids.source]) {
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.buyer}, ${ids.buyer2})`);
});

test("L1 + A1 + S1 + R1: the copy carries confirmed legs and re-based anchors", async () => {
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const result = await fulfillReadyMadePurchase(ids.purchase);
  const clone = result.cloneTripId!;
  assert.ok(clone);
  cloneIds.push(clone);

  // L1
  const items = await itemsOf(clone);
  const legs = await legsOf(clone);
  assert.equal(legs.length, 1, "only the resolvable confirmed leg");
  const leg = legs[0];
  assert.deepEqual([items.get(leg.from_activity_id), items.get(leg.to_activity_id)], ["Kiyomizu-dera", "Yasaka Shrine"]);
  assert.notEqual(leg.from_activity_id, ids.a, "remapped onto the copy's own item");
  assert.deepEqual(
    [leg.proposal_status, leg.user_selected_mode, leg.author_tip, leg.pickup_provider_service_id, leg.pickup_point, leg.checked_by, leg.origin],
    ["confirmed", "walk", TIP, "svc-ref-1", "Hotel lobby", ids.author, "author_pick"],
  );
  assert.equal(new Date(leg.checked_at).toISOString(), new Date("2026-09-30T08:00:00Z").toISOString());
  assert.equal(leg.variant_id, null);
  assert.equal(leg.linked_product_id, null);
  assert.equal(leg.leg_check_status, null);

  // A1 — the copy's start date is today (the clone's placeholder window).
  const [tripRow] = (await db.execute(sql`SELECT start_date FROM trips WHERE id = ${clone}`)).rows as any[];
  const startIso = String(tripRow.start_date).slice(0, 10);
  const anchors = await anchorsOf(clone);
  assert.equal(anchors.length, 2);
  // `anchor_datetime` is a plain timestamp; the expected values go through the same Date mapping.
  const srcAnchors = await anchorsOf(ids.source);
  const srcOffset = (a: any) => new Date(a.anchor_datetime).getTime() - Date.parse("2027-03-10T00:00:00Z");
  assert.equal(new Date(anchors[0].anchor_datetime).getTime() - Date.parse(`${startIso}T00:00:00Z`), srcOffset(srcAnchors[0]));
  assert.equal(new Date(anchors[1].anchor_datetime).getTime() - Date.parse(`${startIso}T00:00:00Z`), srcOffset(srcAnchors[1]));
  assert.deepEqual([anchors[0].anchor_type, anchors[0].buffer_after, anchors[0].location], ["flight_arrival", 90, "KIX"]);
  assert.deepEqual(anchors[0].depends_on_item_ids, [leg.from_activity_id]);
  assert.equal(anchors[0].user_experience_id, null);

  // S1
  assert.equal((await legsOf(ids.source)).length, 3);
  assert.deepEqual((await anchorsOf(ids.source)).map((a) => a.id), [ids.flight, ids.lodging]);

  // R1
  const replay = await fulfillReadyMadePurchase(ids.purchase);
  assert.equal(replay.cloneTripId, clone);
  assert.equal((await legsOf(clone)).length, 1);
  assert.equal((await anchorsOf(clone)).length, 2);
});

test("C1: a lost claim race leaves no orphan legs or anchors", async () => {
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const before = (await db.execute(sql`SELECT count(*)::int AS n FROM transport_legs WHERE author_tip = ${TIP}`)).rows[0] as any;
  const results = await Promise.all([fulfillReadyMadePurchase(ids.purchase2), fulfillReadyMadePurchase(ids.purchase2)]);
  const winner = results[0].cloneTripId!;
  assert.equal(results[1].cloneTripId, winner);
  cloneIds.push(winner);
  const afterCount = (await db.execute(sql`SELECT count(*)::int AS n FROM transport_legs WHERE author_tip = ${TIP}`)).rows[0] as any;
  assert.equal(afterCount.n - before.n, 1, "one copy's leg, not two");
  const anchorTrips = (await db.execute(sql`SELECT DISTINCT trip_id FROM temporal_anchors WHERE description = 'Arrive KIX'`)).rows as any[];
  assert.deepEqual(anchorTrips.map((r) => r.trip_id).sort(), [...cloneIds, ids.source].sort());
});

test("U1: pure builders", () => {
  const map = new Map([["a", "A2"], ["b", "B2"]]);
  const base: any = { tripId: "t", variantId: null, proposalStatus: "confirmed", fromActivityId: "a", toActivityId: "b", linkedProductId: "x" };
  assert.equal(isCarriedLeg(base), true);
  assert.equal(isCarriedLeg({ ...base, proposalStatus: "proposed" }), false);
  assert.equal(isCarriedLeg({ ...base, variantId: "v" }), false);
  assert.equal(buildClonedLeg({ ...base, toActivityId: "z" }, "c", map), null);
  const leg = buildClonedLeg(base, "c", map)!;
  assert.deepEqual([leg.tripId, leg.fromActivityId, leg.toActivityId, leg.origin, (leg as any).linkedProductId], ["c", "A2", "B2", "author_pick", undefined]);
  const anchor = buildClonedAnchor(
    { anchorDatetime: new Date("2027-03-11T15:00:00Z"), dependsOnItemIds: ["a", "q", 3], anchorType: "x" } as any,
    "c",
    "2027-03-10",
    "2026-10-04",
    map,
  );
  assert.equal((anchor.anchorDatetime as Date).toISOString(), "2026-10-05T15:00:00.000Z");
  assert.deepEqual(anchor.dependsOnItemIds, ["A2"]);
});
