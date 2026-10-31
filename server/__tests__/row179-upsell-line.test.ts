/**
 * Row 179 server (ledger `2026-10-30-row179-upsell-line-server`; Leon's rule, Oct 31, 2026): the on-trip plancard
 * upsell read carries at most one "Add X for this leg" line per selected item. Legs only, on-trip only: a leg that
 * follows a selected item and has a bookable option gets the top-ranked transport candidate, with its legId set.
 *
 *   U1  a selected item whose leg has a bookable option gets exactly one line; an item without one gets none;
 *       no transport candidate ⇒ no lines; never paired by plan order
 *   U2  socialProof is null on every line
 *   U3  the pre-trip handler is untouched, and the on-trip response adds `lines` only when there is one, and only for
 *       a caller who may read the plan's logistics
 *   U4  the database read: confirmed legs of this plan only, a platform or partner option only, items of this plan
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit server/__tests__/row179-upsell-line.test.ts
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { buildLegUpsellLines, type UpsellLineCandidate, type UpsellLineLeg } from "@shared/upsell-line";

const transfer: UpsellLineCandidate = { offeringId: "airport_transfer", categoryKey: "private_transportation", displayName: "Airport Transfer", rank: 2 };
const tour: UpsellLineCandidate = { offeringId: "guided_tour", categoryKey: "tour_guide", displayName: "Guided Tour", rank: 1 };
const leg = (over: Partial<UpsellLineLeg>): UpsellLineLeg => ({ legId: "leg-1", fromItemId: "item-a", dayNumber: 1, legOrder: 0, hasBookableOption: true, ...over });

describe("row 179: leg upsell lines (pure)", () => {
  test("U1: one line per selected item whose leg has a bookable option; none otherwise", () => {
    const lines = buildLegUpsellLines(
      [
        leg({ legId: "leg-1", fromItemId: "item-a" }),
        leg({ legId: "leg-2", fromItemId: "item-a", legOrder: 1 }),
        leg({ legId: "leg-3", fromItemId: "item-b", hasBookableOption: false }),
        leg({ legId: "leg-4", fromItemId: "item-gone" }),
        leg({ legId: "leg-5", fromItemId: null }),
      ],
      new Set(["item-a", "item-b"]),
      [tour, transfer],
    );
    assert.deepEqual(lines, [
      { itemId: "item-a", legId: "leg-1", offeringType: "airport_transfer", categoryKey: "private_transportation", title: "Airport Transfer", socialProof: null },
    ]);
  });

  test("U1: no transport candidate, or no qualifying leg, means no lines", () => {
    assert.deepEqual(buildLegUpsellLines([leg({})], new Set(["item-a"]), [tour]), []);
    assert.deepEqual(buildLegUpsellLines([], new Set(["item-a"]), [transfer]), []);
    assert.deepEqual(buildLegUpsellLines([leg({ hasBookableOption: false })], new Set(["item-a"]), [transfer]), []);
  });

  test("U1: the top-ranked transport candidate wins, whatever order it arrives in", () => {
    const other = { ...transfer, offeringId: "aff_bus", categoryKey: "aff_ground_transport", displayName: "Bus Pass", rank: 5 };
    const lines = buildLegUpsellLines([leg({})], new Set(["item-a"]), [other, transfer]);
    assert.equal(lines[0].offeringType, "airport_transfer");
  });

  test("U2: socialProof is null on every line", () => {
    const lines = buildLegUpsellLines([leg({}), leg({ legId: "leg-9", fromItemId: "item-b" })], new Set(["item-a", "item-b"]), [transfer]);
    assert.equal(lines.length, 2);
    for (const l of lines) assert.equal(l.socialProof, null);
  });
});

describe("row 179: the routes", () => {
  const routes = fs.readFileSync(path.resolve("server/routes/upsell.routes.ts"), "utf8");
  const handler = (marker: string) => {
    const start = routes.indexOf(marker);
    assert.ok(start > -1, marker);
    const rest = routes.slice(start);
    const next = rest.slice(1).search(/\nrouter\.(get|post|patch|put|delete)\(/);
    return next >= 0 ? rest.slice(0, next + 1) : rest;
  };

  test("U3: the pre-trip read sends no lines", () => {
    assert.doesNotMatch(handler('router.post("/api/upsell/plancard-pretrip"'), /legUpsellLinesForTrip|lines/);
  });

  test("U3: the on-trip read adds lines only when there is one, and only for a caller who may read the plan", () => {
    const h = handler('router.post("/api/upsell/plancard-ontrip"');
    assert.match(h, /authorizeTripLogistics\(body\.tripId, getUserId\(req\)/);
    assert.match(h, /mayReadLegs \? await legUpsellLinesForTrip\(body\.tripId, decorated\) : \[\]/);
    assert.match(h, /\.\.\.\(lines\.length > 0 \? \{ lines \} : \{\}\)/);
  });
});

const RUN_DB = !!process.env.DATABASE_URL;
describe("row 179: the database read (U4)", { skip: !RUN_DB }, () => {
  const R = crypto.randomUUID().slice(0, 8);
  const ids = {
    owner: `r179-owner-${R}`,
    trip: `r179-trip-${R}`,
    other: `r179-other-${R}`,
    a: `r179-a-${R}`,
    b: `r179-b-${R}`,
    c: `r179-c-${R}`,
    foreign: `r179-f-${R}`,
    legBook: `r179-l1-${R}`,
    legInfo: `r179-l2-${R}`,
    legProposed: `r179-l3-${R}`,
    legForeign: `r179-l4-${R}`,
  };
  let db: any;
  let legUpsellLinesForTrip: typeof import("../services/upsell-engine.service").legUpsellLinesForTrip;

  const legRow = (id: string, from: string, to: string, order: number, status: string) => sql`
    INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status)
    VALUES (${id}, ${ids.trip}, 1, ${order}, ${from}, 'Stop', 35.0, 135.7, ${to}, 'Next', 35.01, 135.71, 1200, '1.2 km', 'transit', 15, ${status})`;
  const option = (legId: string, type: string) => sql`
    INSERT INTO transport_booking_options (id, transport_leg_id, booking_type, source, title, mode_type)
    VALUES (${`${legId}-o`}, ${legId}, ${type}, 'example', 'Option', 'transit')`;

  before(async () => {
    db = (await import("../db")).db;
    legUpsellLinesForTrip = (await import("../services/upsell-engine.service")).legUpsellLinesForTrip;
    await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ids.owner}, ${`${ids.owner}@example.com`}, 'traveler')`);
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${ids.trip}, ${ids.owner}, 'Row 179', 'Kyoto, Japan', '2027-05-01', '2027-05-02', 'draft'),
             (${ids.other}, ${ids.owner}, 'Row 179 other', 'Kyoto, Japan', '2027-05-01', '2027-05-02', 'draft')`);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status) VALUES
      (${ids.a}, ${ids.trip}, 'Stop A', 1, 'in_planning'),
      (${ids.b}, ${ids.trip}, 'Stop B', 1, 'in_planning'),
      (${ids.c}, ${ids.trip}, 'Stop C', 1, 'in_planning'),
      (${ids.foreign}, ${ids.other}, 'Elsewhere', 1, 'in_planning')`);
    await db.execute(legRow(ids.legBook, ids.a, ids.b, 0, "confirmed"));
    await db.execute(legRow(ids.legInfo, ids.b, ids.c, 1, "confirmed"));
    await db.execute(legRow(ids.legProposed, ids.c, ids.a, 2, "proposed"));
    await db.execute(legRow(ids.legForeign, ids.foreign, ids.a, 3, "confirmed"));
    await db.execute(option(ids.legBook, "affiliate"));
    await db.execute(option(ids.legInfo, "deep_link"));
    await db.execute(option(ids.legProposed, "platform"));
    await db.execute(option(ids.legForeign, "platform"));
  });

  after(async () => {
    if (!db) return;
    await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.other})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`);
  });

  test("U4: a confirmed leg from this plan's item with a partner option gets the line; a rideshare-only, proposed or foreign-item leg does not", async () => {
    const lines = await legUpsellLinesForTrip(ids.trip, [transfer, tour]);
    assert.deepEqual(lines, [
      { itemId: ids.a, legId: ids.legBook, offeringType: "airport_transfer", categoryKey: "private_transportation", title: "Airport Transfer", socialProof: null },
    ]);
  });

  test("U4: no transport candidate reads nothing and sends no lines", async () => {
    assert.deepEqual(await legUpsellLinesForTrip(ids.trip, [tour]), []);
  });
});
