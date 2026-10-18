/**
 * 9b-b — Google route data off the platform's writers, and the rebuild through OSRM (9b spec v1.0 T1/T3, §6
 * 9b-b; Phase 0 rulings 1, 2 and 5; ledger `2026-10-16-9b-b-legs-off-google`).
 *
 *   GR1 the counts read the five stores (and the Google legs still shown), and the dry run writes nothing
 *   GR2 the rebuild refuses any adapter but OSRM (the CI stub only with `allowStub`)
 *   GR3 the rebuild: a proposed Google leg is recomputed, a confirmed one re-routed (confirmed kept, Google row
 *       superseded, never deleted), an Optimize version's Google legs recomputed; no Google leg is still shown;
 *       the new legs carry their source and the departure they were routed for (migration 386)
 *   GR4 idempotent: a second run has nothing to rebuild and changes nothing
 *   GR5 a stored Google answer never seeds the run memo; the leg resolver never reads the matrix and never
 *       answers from Google — no adapter ⇒ the labelled straight-line estimate
 *   GR6 a Ready Made copy keeps its leg's source and routed departure
 *   GR7 where-to-stay's cost: the engine's adapter (drive minutes) on a routed plan between open coordinates, none
 *       (straight line) without an adapter or when any point is not open (ledger `2026-10-18-google-writers-open-coords`)
 *   GR8 a re-check notice stores no minutes; the card's line reads "has changed (was N min)" from the plan's leg
 *
 * NEGATIVE SPACE (§18d): the adapter is the CI stub (no OSRM, no Google); the real Kyoto leg is the 9b-a smoke.
 * The matrix and `travel_from_previous` are counted, never rebuilt — the deletion PR removes them.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/google-legs-rebuild.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_gr";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.OSRM_ENABLED;
const { db } = await import("../db");
const { countGoogleRouteData, googleRebuildTargets, rebuildGoogleRouteData } = await import("../services/routing/google-legs-rebuild.service");
const { legNeedsRebuild } = await import("../services/routing/plan-legs-engine.service");
const { loadLegResolver } = await import("../services/travel-time.service");
const { buildClonedLeg } = await import("../services/ready-made-clone-legs");
const { osrmStayCost } = await import("../services/where-to-stay.service");
const { legRecheckLine, legRecheckNoticeLine } = await import("@shared/leg-recheck");

const RUN = crypto.randomUUID().slice(0, 8);
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 55.9 + dLat, lng: -3.2 + K / 100 + dLng });
const id = (s: string) => `gr-${RUN}-${s}`;
const OWNER = id("owner");
const T = id("plan");
const CMP = id("cmp");
const V = id("v");
const MATRIX = id("m");

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error(`[gr] REFUSING to write fixtures to '${host}'.`);
}

const GOOGLE_ALT = (mode: string, min: number) => JSON.stringify([{ mode, durationMinutes: min, costUsd: null, energyCost: 0, reason: "google_routes", line: null, fare: null, legKey: "stale-google-key", hourBucket: 9 }]);
async function leg(key: string, opts: { from: string; to: string; order: number; status: "proposed" | "confirmed"; variant?: string }) {
  const p = (k: string) => (k === "a" ? P(0, 0) : k === "b" ? P(0.01, 0.01) : P(0.02, 0.02));
  const a = p(opts.from);
  const b = p(opts.to);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, variant_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, source, calculated_at)
    VALUES (${id(key)}, ${opts.variant ? null : T}, ${opts.variant ?? null}, 1, ${opts.order}, ${opts.variant ? id(`vi-${opts.from}`) : `${T}-${opts.from}`}, ${opts.from.toUpperCase()}, ${a.lat}, ${a.lng},
      ${opts.variant ? id(`vi-${opts.to}`) : `${T}-${opts.to}`}, ${opts.to.toUpperCase()}, ${b.lat}, ${b.lng}, 1500, '1.5 km', 'walking', 19, ${GOOGLE_ALT("walking", 19)}::jsonb, 0,
      ${opts.variant ? null : opts.status}, 'google_routes', now())`);
}
async function planLegs(): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${T} ORDER BY day_number, leg_order, created_at`)).rows as any[];
}

let base: Awaited<ReturnType<typeof countGoogleRouteData>>;

before(async () => {
  assertDisposableDb();
  base = await countGoogleRouteData();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'GR', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${T}, ${OWNER}, 'GR', 'Edinburgh, UK', 'edinburgh', 'Europe/London', '2027-11-11', '2027-11-11', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${T}-pass`}, ${T}, 'trip_pass', 'active', 'manual')`);
  for (const [k, o, d, t] of [["a", 0, P(0, 0), "09:00"], ["b", 1, P(0.01, 0.01), "11:00"], ["c", 2, P(0.02, 0.02), "13:00"]] as const) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin, travel_from_previous)
      VALUES (${`${T}-${k}`}, ${T}, ${k.toUpperCase()}, 'activity', 1, ${o}, ${String(d.lat)}, ${String(d.lng)}, ${t}, ${t.replace(/^(\d+)/, (h) => String(Number(h) + 1).padStart(2, "0"))}, 'traveler',
        ${k === "a" ? null : JSON.stringify({ mode: "driving", durationMinutes: 9, distanceMeters: 1500, provider: "google_routes", retrievedAt: "2026-10-01T00:00:00Z", status: "available" })}::jsonb)`);
  }
  await leg("pab", { from: "a", to: "b", order: 1, status: "proposed" });
  await leg("cbc", { from: "b", to: "c", order: 2, status: "confirmed" });
  // An Optimize version of the plan, with its own Google-sourced leg.
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status) VALUES (${CMP}, ${OWNER}, ${T}, 'GR', 'Edinburgh, UK', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order) VALUES (${V}, ${CMP}, 'Relaxed', 'ai_optimized', 'generated', 1)`);
  for (const [k, o, d] of [["a", 0, P(0, 0)], ["b", 1, P(0.01, 0.01)]] as const) {
    await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, source_item_id, latitude, longitude)
      VALUES (${id(`vi-${k}`)}, ${V}, 1, ${o}, ${k.toUpperCase()}, 'activity', ${o === 0 ? "09:00" : "11:00"}, ${`${T}-${k}`}, ${String(d.lat)}, ${String(d.lng)})`);
  }
  await leg("vab", { from: "a", to: "b", order: 1, status: "proposed", variant: V });
  await db.execute(sql`INSERT INTO travel_time_matrix (id, market_slug, origin_slug, dest_slug, mode, duration_seconds, distance_meters)
    VALUES (${MATRIX}, ${`gr-${RUN}`}, 'o', 'd', 'walk', 600, 800)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM travel_time_matrix WHERE id = ${MATRIX}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_changes WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM transport_booking_options WHERE variant_id = ${V} OR transport_leg_id IN (SELECT id FROM transport_legs WHERE variant_id = ${V})`).catch(() => {});
  await db.execute(sql`DELETE FROM maps_export_cache WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM transport_legs WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

test("GR1: the counts read every store, and the dry run writes nothing", async () => {
  const c = await countGoogleRouteData();
  assert.equal(c.tripsWithGoogleLegs - base.tripsWithGoogleLegs, 1);
  assert.equal(c.shownGoogleLegs - base.shownGoogleLegs, 2);
  assert.equal(c.variantGoogleLegs - base.variantGoogleLegs, 1);
  assert.equal(c.matrixRows - base.matrixRows, 1);
  assert.equal(c.itemsWithGoogleTravelFromPrevious - base.itemsWithGoogleTravelFromPrevious, 2);
  const before = JSON.stringify(await planLegs());
  const r = await rebuildGoogleRouteData({ dryRun: true });
  assert.equal(r.dryRun, true);
  assert.ok(r.plans.some((p) => p.tripId === T));
  assert.ok(r.variants.some((v) => v.variantId === V));
  assert.equal(r.after, null);
  assert.equal(JSON.stringify(await planLegs()), before, "a dry run writes nothing");
});

test("GR2: the rebuild refuses any adapter but OSRM unless the CI stub is allowed", async () => {
  await assert.rejects(() => rebuildGoogleRouteData({ dryRun: false }), /not OSRM/);
  assert.equal(legNeedsRebuild("google_routes"), true);
  assert.equal(legNeedsRebuild("osrm"), false);
  assert.equal(legNeedsRebuild("stub"), false);
  assert.equal(legNeedsRebuild(null), false, "a legacy row is P0 ruling 7's, not this predicate's");
});

test("GR3: the rebuild replaces every shown Google leg, supersedes (never deletes) the confirmed one, and redoes the version", async () => {
  const r = await rebuildGoogleRouteData({ dryRun: false, allowStub: true });
  assert.deepEqual(r.plans.find((p) => p.tripId === T)?.outcome, "rebuilt");
  assert.deepEqual(r.variants.find((v) => v.variantId === V)?.outcome, "rebuilt");
  const rows = await planLegs();
  const shown = rows.filter((l) => l.proposal_status != null);
  assert.ok(shown.length >= 2);
  assert.ok(shown.every((l) => l.source === "stub"), "no Google leg is still shown");
  assert.ok(shown.every((l) => /^\d{2}:\d{2}$/.test(String(l.routed_departure_local))), "routed for a stated departure (386)");
  const kept = rows.find((l) => l.id === id("cbc"));
  assert.ok(kept, "the confirmed Google leg is kept, never deleted");
  assert.equal(kept.proposal_status, null);
  assert.ok(kept.superseded_at);
  assert.equal(shown.find((l) => l.from_activity_id === `${T}-b`)?.proposal_status, "confirmed", "its replacement stays confirmed");
  assert.equal(rows.find((l) => l.id === id("pab")), undefined, "a proposed Google leg is replaced by its recompute");
  const vrows = (await db.execute(sql`SELECT source FROM transport_legs WHERE variant_id = ${V}`)).rows as any[];
  assert.ok(vrows.length >= 1 && vrows.every((l) => l.source === "stub"));
  assert.equal(r.after!.shownGoogleLegs, base.shownGoogleLegs);
  assert.equal(r.after!.variantGoogleLegs, base.variantGoogleLegs);
});

test("GR4: a second run has nothing to rebuild and changes nothing", async () => {
  const targets = await googleRebuildTargets();
  assert.ok(!targets.tripIds.includes(T) && !targets.variantIds.includes(V));
  const before = JSON.stringify((await planLegs()).map((l) => [l.id, l.proposal_status, l.source]));
  await rebuildGoogleRouteData({ dryRun: false, allowStub: true });
  assert.equal(JSON.stringify((await planLegs()).map((l) => [l.id, l.proposal_status, l.source])), before);
});

test("GR5: the leg resolver answers from the adapter or the estimate — never the matrix, never Google", async () => {
  const exact = await loadLegResolver("edinburgh", { exact: true });
  const walk = await exact(P(0, 0), P(0.01, 0.01), "walk");
  assert.equal(walk.basis, "routes", "the stub adapter answered");
  const transit = await exact(P(0, 0), P(0.01, 0.01), "transit");
  assert.deepEqual([transit.basis, transit.label], ["est", "est."], "a mode OSRM does not serve is the labelled estimate");
  process.env.ROUTING_ADAPTER_STUB = "0";
  try {
    const none = await loadLegResolver(`gr-${RUN}`, { exact: true });
    const r = await none(P(0, 0), P(0.01, 0.01), "walk");
    assert.deepEqual([r.basis, r.label], ["est", "est."], "no adapter: the estimate — the matrix row for this market is never read");
  } finally {
    process.env.ROUTING_ADAPTER_STUB = "1";
  }
});

test("GR6: a Ready Made copy keeps its leg's source and routed departure", () => {
  const out = buildClonedLeg(
    { tripId: T, variantId: null, proposalStatus: "confirmed", fromActivityId: "a", toActivityId: "b", source: "osrm", routedDepartureLocal: "10:00" } as any,
    "copy",
    new Map([["a", "a2"], ["b", "b2"]]),
    true, // ledger `2026-10-18-google-writers-open-coords`: routed between open coordinates (OW1–OW3 cover the rest)
  )!;
  assert.deepEqual([out.source, out.routedDepartureLocal], ["osrm", "10:00"]);
});

test("GR7: where-to-stay's cost is the adapter's drive minutes on a routed plan, and none without an adapter", async () => {
  // Ledger `2026-10-18-google-writers-open-coords`: OSRM between OPEN coordinates only — every point carries its origin.
  const hoods = [{ slug: "n1", name: "N1", lat: P(0.005, 0).lat, lng: P(0.005, 0).lng, coordOrigin: "admin" }] as any;
  const days = [{ dayNumber: 1, points: [{ ...P(0, 0), coordOrigin: "osm" }, { ...P(0.02, 0.02), coordOrigin: "osm" }] }];
  const cost = await osrmStayCost(T, hoods, days);
  assert.ok(cost, "the stub adapter answers on a routed plan");
  assert.equal(await osrmStayCost(T, [{ ...hoods[0], coordOrigin: undefined }], days), undefined, "a centroid with no open origin ⇒ the straight line");
  assert.equal(await osrmStayCost(T, hoods, [{ dayNumber: 1, points: [P(0, 0)] }]), undefined, "a stop with no open origin ⇒ the straight line");
  assert.ok(Number(cost!(hoods[0], P(0, 0))) > 0);
  process.env.ROUTING_ADAPTER_STUB = "0";
  try {
    assert.equal(await osrmStayCost(T, hoods, days), undefined, "no adapter (OSRM off) ⇒ the straight line");
  } finally {
    process.env.ROUTING_ADAPTER_STUB = "1";
  }
});

test("GR8: a stored notice carries no minutes; the card states the plan's own minutes", () => {
  assert.equal(legRecheckNoticeLine({ toName: "Kinkaku-ji", mode: "walk", status: "changed" }), "Travel to Kinkaku-ji has changed");
  assert.equal(legRecheckNoticeLine({ toName: "Kinkaku-ji", mode: "transit", status: "broken" }), "Travel to Kinkaku-ji: no transit route now");
  assert.equal(legRecheckLine({ toName: "Kinkaku-ji", mode: "walk", wasMin: 18, nowMin: null, status: "changed" }, "8 Nov"), "Travel to Kinkaku-ji has changed (was 18 min) · re-checked 8 Nov");
});
