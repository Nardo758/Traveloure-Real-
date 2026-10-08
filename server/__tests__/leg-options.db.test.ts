/**
 * STEP 9c — A ROUTED LEG'S OPTIONS, end to end against a real database (ledger
 * `2026-10-07-step9c-leg-options`; architect rulings D1–D3 on the 9c Phase 0).
 *
 *   O1 a FREE plan: refused, zero calls (R-e)
 *   O2 on tap, a routed leg's options: at most three, the current mode FIRST, at most two calls; a leg
 *      over 1.2 km is never offered walk
 *   O3 a re-open makes no call (stored on the leg's own row — D1)
 *   O4 the pick (the existing PATCH's service): the chosen option becomes the leg, no call; the engine's
 *      next recompute keeps it, no call
 *   O5 the cap hit: `paused`, nothing stored, the next tap asks again
 *   O6 a non-engine leg (an expert's confirmed leg) is refused by name, no call
 *   O7 the plancard carries the options (current first) and the asked marker
 *
 * NEGATIVE SPACE (§18d): the adapter is the CI stub; the route's gate is the leg PATCH's own
 * (`authorizeTripLogistics` with write access) and is pinned by the mutation-auth manifest, not here.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/leg-options.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_leg_options";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { askLegOptions } = await import("../services/routing/leg-options.service");
const { StubRoutingAdapter } = await import("../services/routing/stub-routing-adapter");
const { updateTripTransportLeg } = await import("../services/trip-transport-legs.service");
const { assembleTripPlan } = await import("../services/trip-plan.service");

const RUN = crypto.randomUUID().slice(0, 8);
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 34 + dLat, lng: 128 + K + dLng });
const id = (s: string) => `lo-${RUN}-${s}`;
const owner = id("owner");
const FREE = id("free");
const PAID = id("paid");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
    } catch {
      return "<none>";
    }
  })();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[leg-options] REFUSING to write fixtures to '${host}'.`);
}

async function item(trip: string, key: string, order: number, p: { lat: number; lng: number }, start: string, end: string) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
    VALUES (${`${trip}-${key}`}, ${trip}, ${key.toUpperCase()}, 'activity', 1, ${order}, ${String(p.lat)}, ${String(p.lng)}, ${start}, ${end}, 'traveler')`);
}
async function legRow(trip: string, from: string, to: string): Promise<any> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${trip} AND from_activity_id = ${`${trip}-${from}`} AND to_activity_id = ${`${trip}-${to}`}`)).rows[0] as any;
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'LO', 'traveler', 'traveler')`);
  for (const t of [FREE, PAID]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'LO', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft')`);
    await item(t, "a", 0, P(0, 0), "09:00", "10:00");
    await item(t, "b", 1, P(0.03, 0.02), "11:00", "12:00"); // ~3.6 km — transit
    await item(t, "c", 2, P(0.032, 0.021), "13:00", "14:00"); // ~250 m — walk
    await item(t, "d", 3, P(0.05, 0.04), "15:00", "16:00");
  }
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${PAID}-pass`}, ${PAID}, 'trip_pass', 'active', 'manual')`);
  const r: any = await computePlanLegs(PAID, { adapter: new StubRoutingAdapter() });
  assert.equal(r.written, 3);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id IN (${FREE}, ${PAID})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("O1: a free plan's leg has no options and makes no call", async () => {
  const stub = new StubRoutingAdapter();
  assert.deepEqual(await askLegOptions(FREE, "any", { adapter: stub }), { refused: "free_plan" });
  assert.equal(stub.calls, 0);
});

test("O2 + O3: at most three options, current first, ≤2 calls; a re-open is free", async () => {
  const walkLeg = await legRow(PAID, "b", "c");
  const stub = new StubRoutingAdapter();
  const r: any = await askLegOptions(PAID, walkLeg.id, { adapter: stub });
  assert.equal(r.refused, undefined);
  assert.equal(stub.calls, 2, "transit and drive asked; walk is the leg's own");
  assert.deepEqual(r.options.map((o: any) => [o.mode, o.current]), [["walk", true], ["transit", false], ["drive", false]]);
  assert.equal(r.options[1].route.line, "Stub Line");
  assert.deepEqual(r.options[1].route.fare, { amount: 220, currency: "JPY" });

  const transitLeg = await legRow(PAID, "a", "b");
  const stub2 = new StubRoutingAdapter();
  const t: any = await askLegOptions(PAID, transitLeg.id, { adapter: stub2 });
  assert.equal(stub2.calls, 1, "over 1.2 km: only drive is asked — never walk");
  assert.deepEqual(t.options.map((o: any) => o.mode), ["transit", "drive"]);

  const again = new StubRoutingAdapter();
  const r2: any = await askLegOptions(PAID, walkLeg.id, { adapter: again });
  assert.equal(again.calls, 0, "stored on the leg's own row");
  assert.equal(r2.options.length, 3);
});

test("O4: the pick becomes the leg with no call, and the engine's next run keeps it", async () => {
  const leg = await legRow(PAID, "a", "b");
  const updated = await updateTripTransportLeg(PAID, leg.id, { userSelectedMode: "driving" });
  assert.equal(updated.user_selected_mode ?? updated.userSelectedMode, "driving");
  const row = await legRow(PAID, "a", "b");
  const drive = (row.alternative_modes as any[])[0];
  assert.equal(drive.mode, "driving");
  assert.equal(row.estimated_duration_minutes, drive.durationMinutes);
  assert.equal(row.recommended_mode, "driving");
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(stub.calls, 0, "the picked leg is kept; nothing re-asked");
  assert.equal((await legRow(PAID, "a", "b")).id, leg.id);
});

test("O5: the cap hit — paused, nothing stored, the next tap asks again", async () => {
  const leg = await legRow(PAID, "c", "d");
  const r: any = await askLegOptions(PAID, leg.id, { adapter: new StubRoutingAdapter({ paused: true }) });
  assert.equal(r.paused, true);
  const row = await legRow(PAID, "c", "d");
  assert.equal((row.alternative_modes as any[]).length, 1);
  assert.equal((row.alternative_modes as any[])[0].optionsCheckedAt, undefined);
  const stub = new StubRoutingAdapter();
  const r2: any = await askLegOptions(PAID, leg.id, { adapter: stub });
  assert.ok(stub.calls >= 1);
  assert.equal(r2.paused, false);
});

test("O6: an expert's confirmed leg is not an engine leg — refused, no call", async () => {
  const a = P(0, 0);
  const legId = id("confirmed");
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status)
    VALUES (${legId}, ${PAID}, 1, 9, ${`${PAID}-a`}, 'A', ${a.lat}, ${a.lng}, ${`${PAID}-d`}, 'D', ${a.lat}, ${a.lng}, 10, '10 m', 'walking', 5, 'confirmed')`);
  const stub = new StubRoutingAdapter();
  assert.deepEqual(await askLegOptions(PAID, legId, { adapter: stub }), { refused: "not_routed" });
  assert.equal(stub.calls, 0);
  await db.execute(sql`DELETE FROM transport_legs WHERE id = ${legId}`);
});

test("O7: the plancard carries each engine leg's options, current first, and the asked marker", async () => {
  const plan: any = await assembleTripPlan(PAID, "full");
  const legs = plan.days.flatMap((d: any) => d.transports).filter((t: any) => t.routed);
  const bc = legs.find((t: any) => t.toActivityId === `${PAID}-c`);
  assert.deepEqual(bc.routedOptions.map((o: any) => o.mode), ["walk", "transit", "drive"]);
  assert.equal(bc.routedOptions[0].current, true);
  assert.equal(bc.routedOptionsChecked, true);
  for (const t of legs) assert.ok(t.routedOptions.length <= 3);
});
