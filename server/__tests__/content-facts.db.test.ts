/**
 * A5 — content facts and the draft's basis against a real database (ledger
 * `2026-09-29-a5-draft-open-set`; content sourcing brief §2/§3/§7; product map §M5; R126).
 *
 *   C1  factsForTrip: the first fact of each type in the ENGINE's order (a platform fact beats a
 *       Places fact of the same type), each with its provenance line; Places is never publishable
 *   C2  enrichPlanItems: one adapter call for a stop; a second stop with the SAME query reuses it at
 *       zero cost and keeps the original expiry (the 30-day window is never extended)
 *   C3  a drafted stop with no coordinates of its own counts as located through its unexpired
 *       `location` fact, so plan-fit scores; an expired location fact does not place it
 *   C4  draftBasisInputs: a `vacation`-defaulted plan with no resolved occasion is NOT a Trip (R215);
 *       once a real Trips occasion resolves it is lodging-anchored, its open lodging set listed with
 *       each option's server plan-fit rank
 *   C5  NO PLACES FACT REACHES A PUBLIC ROUTE: the ONE plan assembler — which also serves the public
 *       share/teaser channels — carries none at any level, and only gated files read the table
 *   C6  NO FORCED REFRESH (ledger `2026-09-30-places-address`): an unexpired answer cached before the
 *       address fields existed is reused as it is — no call, and no address fact appears for it
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { enrichPlanItems, factPointsForTrip, factsForTrip, recordFacts } from "../services/content-facts/place-facts.service";
import { PlacesAdapter } from "../services/content-facts/places-adapter";
import { addOption, createOptionSet, draftBasisInputs, listOptionSetsWithFit } from "../services/plan-option-sets.service";
import { assembleTripPlan } from "../services/trip-plan.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `a5-${RUN}-${s}`;
const ids = { owner: id("owner"), trip: id("trip"), s1: id("s1"), s2: id("s2"), s3: id("s3"), s4: id("s4"), occasion: id("occasion"), event: id("event") };
const MARKER = `places-marker-${RUN}`;

const fact = (over: Record<string, unknown>) => ({
  placeRefKind: "place_id" as const,
  placeRef: id("place"),
  placeLat: null,
  placeLng: null,
  market: "kyoto",
  need: "stop.hours" as const,
  factType: "hours" as const,
  value: { weekdayDescriptions: [`Monday: ${MARKER}`] },
  origin: "places_api" as const,
  sourceId: null,
  sourceUrl: "https://maps.google.com/?cid=a5",
  license: "restricted" as const,
  fetchedAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000),
  costCents: 4,
  ...over,
});

before(async () => {
  process.env.PLACE_FACTS_PLACES_ENABLED = "1";
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'A5', 'Owner', 'traveler')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${ids.trip}, ${ids.owner}, ${`A5 plan ${RUN}`}, 'Kyoto, Japan', '2027-05-03', '2027-05-06', 'draft', 'vacation')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
    VALUES (${ids.s1}, ${ids.trip}, 1, 'Kinkaku-ji', 'attraction', 'ai'),
           (${ids.s2}, ${ids.trip}, 1, 'Kinkaku-ji', 'attraction', 'ai'),
           (${ids.s3}, ${ids.trip}, 2, 'Fushimi Inari', 'attraction', 'ai'),
           (${ids.s4}, ${ids.trip}, 3, 'Nishiki Market', 'lunch', 'ai')
  `);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${ids.trip} OR place_ref LIKE ${`a5-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM user_experiences WHERE id = ${ids.event}`);
    await db.execute(sql`DELETE FROM experience_types WHERE id = ${ids.occasion}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`a5-${RUN}-%`}`);
  } finally {
    delete process.env.PLACE_FACTS_PLACES_ENABLED;
    await pool.end();
  }
});

test("C1: the engine's order picks the fact; every view carries provenance", async () => {
  await recordFacts([fact({})], { planId: ids.trip, itemId: ids.s4 });
  await recordFacts([fact({ origin: "platform_listing", license: null, sourceUrl: null, value: { weekdayDescriptions: ["Monday: from the listing"] } })], { planId: ids.trip, itemId: ids.s4 });
  const facts = await factsForTrip(ids.trip);
  const hours = facts[ids.s4].filter((f) => f.factType === "hours");
  assert.equal(hours.length, 1, "one fact per type");
  assert.equal(hours[0].origin, "platform_listing", "platform-native before Places");
  assert.equal(hours[0].publishable, true);
  assert.match(hours[0].provenance, /^Traveloure · checked/);
  await db.execute(sql`DELETE FROM place_facts WHERE itinerary_item_id = ${ids.s4} AND origin = 'platform_listing'`);
  const places = (await factsForTrip(ids.trip))[ids.s4].find((f) => f.factType === "hours")!;
  assert.equal(places.origin, "places_api");
  assert.equal(places.publishable, false);
  assert.match(places.provenance, /^Google Maps · checked/);
});

/**
 * R-u (surface step 3): a fake Google serving the no-charge IDs-only search (uncounted) and the
 * billed Place Details by ID (`onBilled`) — and the legacy full text search, also billed.
 */
function googleFake(place: Record<string, any>, onBilled: () => void) {
  return async (_url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    if (init.method === "GET") {
      onBilled();
      return { ok: true, status: 200, json: async () => place };
    }
    if (init.headers["X-Goog-FieldMask"] === "places.id") return { ok: true, status: 200, json: async () => ({ places: [{ id: place.id }] }) };
    onBilled();
    return { ok: true, status: 200, json: async () => ({ places: [place] }) };
  };
}

test("C2: the cache answers a repeated query at zero cost and never extends the expiry", async () => {
  let calls = 0;
  const place = { id: id("kinkaku"), displayName: { text: "Kinkaku-ji" }, location: { latitude: 35.0394, longitude: 135.7292 }, regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } };
  const adapter = new PlacesAdapter(
    // R-u: the IDs-only search is free and uncounted; the billed call is Place Details by ID.
    googleFake(place, () => { calls += 1; }),
    () => "test-key",
    () => true,
  );
  const first = await enrichPlanItems({ tripId: ids.trip, market: "kyoto", city: "Kyoto, Japan", items: [{ id: ids.s1, title: "Kinkaku-ji", type: "attraction" }], adapters: [adapter] });
  assert.deepEqual({ looked: first.looked, cached: first.cached }, { looked: 1, cached: 0 });
  const second = await enrichPlanItems({ tripId: ids.trip, market: "kyoto", city: "Kyoto, Japan", items: [{ id: ids.s2, title: "Kinkaku-ji", type: "attraction" }], adapters: [adapter] });
  assert.deepEqual({ looked: second.looked, cached: second.cached }, { looked: 0, cached: 1 });
  assert.equal(calls, 1, "Google was asked once");
  const rows = (await db.execute(sql`
    SELECT itinerary_item_id AS item, fact_type, cost_cents::float AS cost, expires_at, fetched_at
      FROM place_facts WHERE plan_id = ${ids.trip} AND itinerary_item_id IN (${ids.s1}, ${ids.s2}) ORDER BY fact_type, item
  `)).rows as any[];
  const a = rows.filter((r) => r.item === ids.s1);
  const b = rows.filter((r) => r.item === ids.s2);
  assert.equal(a.reduce((n, r) => n + r.cost, 0), 2, "one call's cost, on one row (Place Details, Enterprise tier — the field-mask ruling)");
  assert.equal(b.reduce((n, r) => n + r.cost, 0), 0, "the copy cost nothing");
  for (const t of ["hours", "location"]) {
    assert.equal(
      new Date(b.find((r) => r.fact_type === t).expires_at).getTime(),
      new Date(a.find((r) => r.fact_type === t).expires_at).getTime(),
      `${t}: the copy keeps the original expiry`,
    );
  }
});

test("C3: a location fact places an unlocated stop for plan-fit; an expired one does not", async () => {
  await recordFacts([fact({ factType: "location", value: { lat: 34.9671, lng: 135.7727 }, placeRef: id("inari") })], { planId: ids.trip, itemId: ids.s3 });
  await recordFacts([fact({ factType: "location", value: { lat: 35.005, lng: 135.765 }, placeRef: id("nishiki"), fetchedAt: new Date(Date.now() - 40 * 86_400_000), expiresAt: new Date(Date.now() - 10 * 86_400_000) })], { planId: ids.trip, itemId: ids.s4 });
  const points = await factPointsForTrip(ids.trip);
  assert.ok(points.has(ids.s1) && points.has(ids.s2) && points.has(ids.s3), "three stops placed by facts");
  assert.equal(points.has(ids.s4), false, "an expired location does not place a stop");
  const row = (await db.execute(sql`SELECT latitude FROM itinerary_items WHERE id = ${ids.s3}`)).rows[0] as any;
  assert.equal(row.latitude, null, "a Places coordinate is never copied onto the item");

  const set = await createOptionSet({ tripId: ids.trip, userId: ids.owner, categoryKey: "accommodation", label: "Where you'll stay", anchor: true });
  await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "custom", title: "Gion Hotel", lat: 35.0037, lng: 135.7788 } });
  await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "custom", title: "Station Hotel", lat: 34.9858, lng: 135.7588 } });
  const fit = (await listOptionSetsWithFit(ids.trip)).find((s) => s.id === set.id)!;
  assert.deepEqual(fit.stops, { located: 3, total: 4 });
  assert.ok(fit.options.every((o) => o.fit.scored), "plan-fit scores against the fact-located stops");
});

test("C4: draftBasisInputs — the `vacation` default is not a Trip (R215); a resolved Trips occasion is, with its open set ranked", async () => {
  const before = await draftBasisInputs(ids.trip);
  assert.equal(before.lodgingAnchored, false, "event_type 'vacation' is a column default, not the traveler's answer");
  // A real Trips occasion, named by the plan's own event (resolveOccasionForPlan's attempt 1).
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug, default_duration, default_guests, default_stops, default_schedule)
    VALUES (${ids.occasion}, ${`A5 trip ${RUN}`}, ${`a5-trip-${RUN}`}, 'range', false, 'one', false)
  `);
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, trip_id, title)
    VALUES (${ids.event}, ${ids.owner}, ${ids.occasion}, ${ids.trip}, 'Kyoto')
  `);
  const inputs = await draftBasisInputs(ids.trip);
  assert.equal(inputs.lodgingAnchored, true);
  assert.equal(inputs.hasStay, false);
  const lodging = inputs.openSets.find((s) => s.categoryKey === "accommodation")!;
  assert.equal(lodging.anchorRole, "primary");
  assert.deepEqual(lodging.options.map((o) => o.title), ["Gion Hotel", "Station Hotel"]);
  assert.deepEqual(lodging.options.map((o) => o.fitRank).sort(), [1, 2]);
});

test("C5: no Places fact reaches a public route", async () => {
  for (const level of ["full", "teaser", "preview"] as const) {
    const plan = await assembleTripPlan(ids.trip, level);
    assert.equal(JSON.stringify(plan).includes(MARKER), false, `the ${level} assembly carries no fact`);
  }
  // Only these files may import the fact reader or the table; each reads it behind a plan's own gate.
  const allowed = new Set([
    "server/services/content-facts/place-facts.service.ts", // the one writer and the plan readers
    "server/services/plan-option-sets.service.ts", // plan-fit (owner/advisor/delegate option-set rails)
    "server/routes/plancard.routes.ts", // GET /api/trips/:tripId/plancard, behind its owner/advisor gate
    "server/routes/content.routes.ts", // the free draft's enrichment WRITE (authenticated, owner-checked)
    "server/routes/content-facts.routes.ts", // A6 (3) expert-action fresh lookup WRITE (§12 write-status advisor only)
    // A9 paid-run fresh fetch (ledger `2026-10-01-a9-paid-run-fresh-fetch`): a WRITE through the one item
    // rail, started only by a PAID optimizer run — behind the run's own owner/§12-write gate (LD 42 D17).
    "server/services/content-facts/paid-run-fresh-fetch.ts",
    // The blog generator lane's fact builder (ledger `2026-09-30-blog-event-guide`): NOT behind a plan
    // gate, because its output is a public post — so it keeps ONLY what `isPublishable` allows
    // (platform-owned or expert-verified; never Places, crawled or partner), pinned by blog-event-guide E3.
    "server/services/blog-event-facts.service.ts",
    // Surface step 3 (ledger `2026-10-03-surface-step3-anchor-panel`, R-x): the AnchorPanel's
    // neighbourhood one-liner — a REGISTRY `neighbourhood` description fact (origin <> places_api), read
    // only inside `loadWhereToStay`, behind the plan's own read gate (`planRole(…, "read")`).
    "server/services/where-to-stay.service.ts",
    // Surface step 4 (ledger `2026-10-03-surface-step4-optimizer-lead`): the OptimizerLead's findings
    // read the plan's hours and location facts — only inside `GET /api/optimization-preview`, behind
    // `authorizeTripLogistics`; only kinds and counts leave it.
    "server/services/optimizer-lead.service.ts",
    // Smoke 9 S9-8 (ledger `2026-10-04-smoke9-addendum`): the drafting prompt's covering-event list. It
    // reads ONLY `event` facts that `isOfficialPublicFact` accepts (crawled, official, public_ok — never
    // places_api), and only the event NAME leaves it, into a draft for the plan's own owner.
    "server/services/content-facts/covering-events.ts",
    // Step 6 (ledger `2026-10-04-step6-trip-card`): the T-3 `facts-recheck` job re-runs ONE plan's
    // lookups through the one writer (no public output — its finding is a notice to that plan's owner)…
    "server/jobs/factsRecheck.ts",
    // …and Finalize reads each day's first stop's place id/point (`placeRefsForTrip`) to resolve the
    // card's STORED photo references. Only ids and points leave it, never a Places fact's content.
    "server/services/trip-finalize.service.ts",
    // Work plan L1-9 (ledger `2026-10-04-ready-made-readiness`, R-bi): the author's readiness checklist
    // reads the build's fact TYPES (`factsForTrip`) and its cached photo refs (`placeRefsForTrip`), only
    // inside `GET /api/expert/ready-made/:id/readiness` (authenticated, the listing's own author). Only
    // per-item fact kinds and a has/none/unchecked photo state leave it — never a fact's content.
    "server/routes/ready-made.routes.ts",
    "server/services/ready-made-readiness.ts",
    // Work plan L1-4b (ledger `2026-10-04-stay-item-reroute`): the stay's point for the re-route, read
    // only from the two plan-gated stay writers (`bindWhereToStay`, the accommodation option-set choose).
    // The stay item's OWN coordinate first; its Google `location` fact only when it has none. Ruled
    // (ledger `2026-10-04-leg-google-coords`, R311 — LD 57 extends to transport_legs): a Google point on
    // a leg is a CACHE (max 30 days, refreshed or cleared by a scheduled job), recorded on the leg as
    // `coord_source='google'` + `coord_fetched_at` (migration 350).
    "server/services/stay-reroute.service.ts",
    // R313 (ledger `2026-10-04-leg-google-coords-refresh`): the daily leg job re-runs ONE plan's stay
    // lookup through the one writer (`enrichPlanItems`) so the re-route can rebuild its Google legs, then
    // deletes any still past the max age. No public output; nothing leaves it but counts.
    "server/jobs/legGoogleCoordsRefresh.ts",
    // Step 9a (ledger `2026-10-07-step9a-routing-engine`): the routing engine reads each stop's place ID
    // (part of the leg key — Google lets a place ID be stored) and its point (the trusted row point
    // first, else the unexpired `location` fact, as plan-fit does), only for a plan that passes
    // `planGetsRoutedLegs`. A Places point is never written onto an item row; what leaves is a leg's
    // duration, distance, line, fare and provenance, read only behind the plan's own gate (in-plan, R-h).
    "server/services/routing/plan-legs-engine.service.ts",
  ]);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") walk(p);
      } else if (p.endsWith(".ts")) {
        const rel = path.relative(root, p).split(path.sep).join("/");
        const src = fs.readFileSync(p, "utf8");
        if ((/place-facts\.service/.test(src) || /\bplaceFacts\b/.test(src)) && !allowed.has(rel)) offenders.push(rel);
      }
    }
  };
  walk(path.join(root, "server"));
  assert.deepEqual(offenders, [], "a new reader of place_facts must be added here deliberately, behind a plan gate");
  const plancard = fs.readFileSync(path.join(root, "server/routes/plancard.routes.ts"), "utf8");
  const at = plancard.indexOf("await factsForTrip(tripId)");
  const handler = plancard.lastIndexOf("router.get(", at);
  assert.match(plancard.slice(handler, plancard.indexOf("\n", handler)), /isAuthenticated/, "the plancard read is authenticated");
});

test("C6: a cached answer from before the address lane is reused as-is — no call, no address", async () => {
  const item = id("s6");
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES (${item}, ${ids.trip}, 2, 'Tofuku-ji', 'attraction', 'ai')`);
  const query = "Tofuku-ji, Kyoto, Japan";
  const place = id("tofuku");
  await recordFacts([
    fact({ placeRef: place, factType: "location", need: "stop.hours", value: { lat: 34.97, lng: 135.77, name: "Tofuku-ji", query } }),
    fact({ placeRef: place, value: { weekdayDescriptions: ["Monday: 9:00 AM – 4:00 PM"], query } }),
  ], { planId: null, itemId: null });
  let calls = 0;
  const adapter = new PlacesAdapter(
    googleFake({ id: place, displayName: { text: "Tofuku-ji" }, formattedAddress: "15 Honmachi, Higashiyama Ward, Kyoto" }, () => { calls += 1; }),
    () => "test-key",
    () => true,
  );
  const r = await enrichPlanItems({ tripId: ids.trip, market: "kyoto", city: "Kyoto, Japan", items: [{ id: item, title: "Tofuku-ji", type: "attraction" }], adapters: [adapter] });
  assert.deepEqual({ looked: r.looked, cached: r.cached }, { looked: 0, cached: 1 });
  assert.equal(calls, 0, "no forced refresh");
  const types = ((await db.execute(sql`SELECT fact_type FROM place_facts WHERE itinerary_item_id = ${item}`)).rows as any[]).map((x) => x.fact_type).sort();
  assert.deepEqual(types, ["hours", "location"]);
});
