/**
 * MARKET INSIGHTS — behavioural proof of lane B2 (docs/DECISIONS.md ruling 84; CLAUDE.md §13/§20).
 *
 * A READ-ONLY, non-money map overlay for the provider Catalog map. Two REAL layers, both proven:
 *
 *   G*  COVERAGE-GAP (pure `resolveCoverageGaps`) — per (neighborhood, categoryKey): gap = target-have
 *       when > 0, on the neighborhood's REAL centroid. §13: a service with no slug AND no pin is
 *       EXCLUDED from every count (never dropped onto a neighborhood it isn't in); a neighborhood with
 *       NO target row makes no gap claim (never an invented target); covered (have>=target) ⇒ no gap.
 *
 *   D*  DEMAND (pure `resolveDemandBuckets`) — REAL search intent bucketed by destination STRING to
 *       neighborhood/city centroids, thresholded at MIN_DEMAND_SIGNAL. §13: below-threshold buckets
 *       do NOT render; ZERO rows ⇒ hasSignal=false ("not enough signal yet"); a destination that
 *       references the market but matches no bucket is UNPLACEABLE (disclosed, never plotted); an
 *       out-of-market destination is ignored entirely. NEVER a per-lat/lng heat cell.
 *
 *   W*  the WIRING at GET /api/provider/market-insights — owner-gated (401 without a session), returns
 *       the server-derived shape, and both layers reflect SEEDED REAL rows (search_analytics +
 *       neighborhood_coverage_target). §13 hard negative: a surcharge `service_bookings` row with a
 *       `pickupLocation` does NOT move any demand count — booking pickup coords are a BILLING artifact,
 *       never a demand source (this endpoint reads no bookings at all).
 *
 * Pure assertions need no infra; the HTTP assertions run against the ALREADY-RUNNING dev server on
 * http://127.0.0.1:5000 (the booking-eligibility posture). DISPOSABLE DB ONLY — every row deleted in
 * after(). Serialize: npx tsx --test --test-concurrency=1 server/__tests__/market-insights.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  resolveCoverageGaps,
  resolveDemandBuckets,
  placeServiceInNeighborhood,
  MIN_DEMAND_SIGNAL,
  type NeighborhoodRow,
  type SupplyServiceRow,
  type CoverageTargetRow,
} from "../services/market-insights.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const CI_PROVIDER_EMAIL = "ci-provider@traveloure.test";
const CI_PROVIDER_PASSWORD = "CITestProvider!99";
const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[market-insights] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

async function loginCookie(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login(${email}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  return setCookie!.split(";")[0];
}

async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

// ── Pure-resolver fixtures ────────────────────────────────────────────────────────────────────────
const NB: NeighborhoodRow[] = [
  { id: "n-alpha", city: "Testville", name: "Alpha", slug: "alpha", centroidLat: "35.0100000", centroidLng: "135.7600000", radiusKm: "1.50" },
  { id: "n-beta", city: "Testville", name: "Beta", slug: "beta", centroidLat: "35.0500000", centroidLng: "135.8000000", radiusKm: "1.50" },
];

// ═══ G — COVERAGE-GAP pure resolver ═════════════════════════════════════════════════════════════

test("G1: gap present when target > have (on the REAL centroid)", () => {
  const services: SupplyServiceRow[] = [
    { id: "s1", neighborhood: "alpha", categoryKey: "photo", latitude: null, longitude: null },
  ];
  const targets: CoverageTargetRow[] = [{ neighborhoodId: "n-alpha", categoryKey: "photo", targetCount: 3 }];
  const gaps = resolveCoverageGaps(services, targets, NB);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].neighborhoodId, "n-alpha");
  assert.equal(gaps[0].have, 1);
  assert.equal(gaps[0].target, 3);
  assert.equal(gaps[0].gap, 2);
  assert.equal(gaps[0].centroidLat, 35.01);
  assert.equal(gaps[0].centroidLng, 135.76);
});

test("G2: NO gap when have >= target (covered)", () => {
  const services: SupplyServiceRow[] = [
    { id: "s1", neighborhood: "alpha", categoryKey: "photo", latitude: null, longitude: null },
    { id: "s2", neighborhood: "alpha", categoryKey: "photo", latitude: null, longitude: null },
    { id: "s3", neighborhood: "alpha", categoryKey: "photo", latitude: null, longitude: null },
  ];
  const targets: CoverageTargetRow[] = [{ neighborhoodId: "n-alpha", categoryKey: "photo", targetCount: 3 }];
  assert.equal(resolveCoverageGaps(services, targets, NB).length, 0);
});

test("G3: a service with no slug AND no pin is EXCLUDED from every count (§13)", () => {
  const services: SupplyServiceRow[] = [
    { id: "unplaced", neighborhood: null, categoryKey: "photo", latitude: null, longitude: null },
  ];
  const targets: CoverageTargetRow[] = [{ neighborhoodId: "n-alpha", categoryKey: "photo", targetCount: 1 }];
  const gaps = resolveCoverageGaps(services, targets, NB);
  // The unplaced service is NOT counted into Alpha, so the gap stands at the full target.
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].have, 0);
  assert.equal(gaps[0].gap, 1);
  // And it is not placed anywhere.
  assert.equal(placeServiceInNeighborhood(services[0], NB), null);
});

test("G4: a neighborhood with NO target row yields no gap claim (§13 — never invent a target)", () => {
  const services: SupplyServiceRow[] = [
    { id: "s1", neighborhood: "beta", categoryKey: "photo", latitude: null, longitude: null },
  ];
  // Beta has supply but NO target row anywhere ⇒ no claim.
  assert.equal(resolveCoverageGaps(services, [], NB).length, 0);
});

test("G5: nearest-centroid placement (no slug, pin within radius) counts; a pin outside every radius is EXCLUDED", () => {
  const inAlpha: SupplyServiceRow = { id: "p1", neighborhood: null, categoryKey: "photo", latitude: 35.011, longitude: 135.761 };
  const farAway: SupplyServiceRow = { id: "p2", neighborhood: null, categoryKey: "photo", latitude: 10.0, longitude: 10.0 };
  assert.equal(placeServiceInNeighborhood(inAlpha, NB), "n-alpha");
  assert.equal(placeServiceInNeighborhood(farAway, NB), null);
  const targets: CoverageTargetRow[] = [{ neighborhoodId: "n-alpha", categoryKey: "photo", targetCount: 2 }];
  const gaps = resolveCoverageGaps([inAlpha, farAway], targets, NB);
  assert.equal(gaps[0].have, 1); // only the in-radius pin counts; the far one is excluded (§13).
  assert.equal(gaps[0].gap, 1);
});

test("G6: a service with no categoryKey fills no category target", () => {
  const services: SupplyServiceRow[] = [
    { id: "s1", neighborhood: "alpha", categoryKey: null, latitude: null, longitude: null },
  ];
  const targets: CoverageTargetRow[] = [{ neighborhoodId: "n-alpha", categoryKey: "photo", targetCount: 1 }];
  const gaps = resolveCoverageGaps(services, targets, NB);
  assert.equal(gaps[0].have, 0);
  assert.equal(gaps[0].gap, 1);
});

// ═══ D — DEMAND pure resolver ═══════════════════════════════════════════════════════════════════

test("D1: below-threshold bucket does NOT render; hasSignal=false when nothing clears the bar", () => {
  const r = resolveDemandBuckets(
    [{ destination: "Alpha", searchCount: 2 }],
    NB,
    ["Testville"],
    MIN_DEMAND_SIGNAL,
  );
  assert.equal(r.byNeighborhood.length, 0);
  assert.equal(r.cityLevel.length, 0);
  assert.equal(r.hasSignal, false);
  assert.equal(r.threshold, MIN_DEMAND_SIGNAL);
});

test("D2: at/above threshold renders with the REAL count, on the neighborhood centroid", () => {
  const r = resolveDemandBuckets(
    [{ destination: "Alpha", searchCount: 4 }],
    NB,
    ["Testville"],
    MIN_DEMAND_SIGNAL,
  );
  assert.equal(r.hasSignal, true);
  assert.equal(r.byNeighborhood.length, 1);
  assert.equal(r.byNeighborhood[0].neighborhoodId, "n-alpha");
  assert.equal(r.byNeighborhood[0].searchCount, 4);
  assert.equal(r.byNeighborhood[0].centroidLat, 35.01);
  assert.equal(r.byNeighborhood[0].centroidLng, 135.76);
});

test("D3: a destination matching a neighborhood name lands on THAT centroid (slug match too)", () => {
  const byName = resolveDemandBuckets([{ destination: "beta", searchCount: 5 }], NB, ["Testville"], MIN_DEMAND_SIGNAL);
  assert.equal(byName.byNeighborhood[0].neighborhoodId, "n-beta");
  // slug-cased match is equivalent
  const bySlug = resolveDemandBuckets([{ destination: "BETA", searchCount: 5 }], NB, ["Testville"], MIN_DEMAND_SIGNAL);
  assert.equal(bySlug.byNeighborhood[0].neighborhoodId, "n-beta");
});

test("D4: a city-only match is CITY-LEVEL, never forced onto a neighborhood centroid", () => {
  const r = resolveDemandBuckets([{ destination: "Testville", searchCount: 6 }], NB, ["Testville"], MIN_DEMAND_SIGNAL);
  assert.equal(r.byNeighborhood.length, 0);
  assert.equal(r.cityLevel.length, 1);
  assert.equal(r.cityLevel[0].city, "Testville");
  assert.equal(r.cityLevel[0].searchCount, 6);
});

test("D5: an unmatched-but-in-market destination is UNPLACEABLE (never plotted); out-of-market is ignored", () => {
  const r = resolveDemandBuckets(
    [
      { destination: "Somewhere in Testville", searchCount: 3 }, // references city, no exact bucket ⇒ unplaceable
      { destination: "Paris", searchCount: 9 }, // out of market ⇒ ignored entirely
    ],
    NB,
    ["Testville"],
    MIN_DEMAND_SIGNAL,
  );
  assert.equal(r.unplaceableCount, 3);
  assert.equal(r.byNeighborhood.length, 0);
  assert.equal(r.cityLevel.length, 0);
  assert.equal(r.hasSignal, false); // unplaceable is disclosed but is not "signal" that renders a bucket
});

test("D6 (§13 hard negative): ZERO demand rows ⇒ hasSignal=false, empty (not an empty-but-present heat)", () => {
  const r = resolveDemandBuckets([], NB, ["Testville"], MIN_DEMAND_SIGNAL);
  assert.equal(r.hasSignal, false);
  assert.equal(r.byNeighborhood.length, 0);
  assert.equal(r.cityLevel.length, 0);
  assert.equal(r.unplaceableCount, 0);
});

// ═══ W — the WIRED endpoint (owner-gated; server-derived; real rows) ════════════════════════════

const CITY = `B2City-${RUN}`;
const NB_A = { id: `b2-na-${RUN}`, name: `Alpha ${RUN}`, slug: `b2-alpha-${RUN}`, lat: "35.0100000", lng: "135.7600000" };
const NB_B = { id: `b2-nb-${RUN}`, name: `Beta ${RUN}`, slug: `b2-beta-${RUN}`, lat: "35.0500000", lng: "135.8000000" };
const CAT_ID = `b2-cat-${RUN}`;
const CAT_KEY = `b2cat-${RUN}`;
const SUPPLY_ID = `b2-svc-${RUN}`;
const BOOKING_ID = `b2-bk-${RUN}`;

let providerCookie = "";
let CI_PROVIDER_ID = "";

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  providerCookie = await loginCookie(CI_PROVIDER_EMAIL, CI_PROVIDER_PASSWORD);
  const r = await db.execute(sql`SELECT id FROM users WHERE email = ${CI_PROVIDER_EMAIL}`);
  CI_PROVIDER_ID = (r.rows[0] as any)?.id;
  assert.ok(CI_PROVIDER_ID, "ci-provider must be seeded");

  // Neighborhoods (REAL centroids) in the unique market city.
  for (const n of [NB_A, NB_B]) {
    await db.execute(sql`
      INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, radius_km)
      VALUES (${n.id}, ${CITY}, 'Japan', ${n.name}, ${n.slug}, ${n.lat}, ${n.lng}, '1.50')
    `);
  }
  // A category carrying a categoryKey (the join key services map through).
  await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, category_key, commission_band_key, is_active)
    VALUES (${CAT_ID}, ${`B2 Cat ${RUN}`}, ${`b2-cat-slug-${RUN}`}, ${CAT_KEY}, 'limited', true)
  `);
  // The market's ONLY bookable supply: approved+active, in NB_A, category CAT ⇒ have[A][CAT]=1.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, city, neighborhood, category_id)
    VALUES (${SUPPLY_ID}, ${CI_PROVIDER_ID}, ${`B2 Supply ${RUN}`}, '100.00', 'active', 'approved', 'in_person', ${CITY}, ${NB_A.slug}, ${CAT_ID})
  `);
  // Coverage target: NB_A needs 2 in CAT ⇒ gap = 2 - 1 = 1.
  await db.execute(sql`
    INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
    VALUES (${NB_A.id}, ${CAT_KEY}, 2)
  `);
  // REAL search intent, all within the window:
  //   NB_A name × 4  (≥ threshold ⇒ renders, count 4)
  //   NB_B name × 2  (< threshold ⇒ does NOT render)
  //   CITY   × 5     (city-level)
  //   "Outer <CITY>" × 3 (references market, no exact bucket ⇒ unplaceable)
  //   "Faraway-<RUN>" × 9 (out of market ⇒ ignored)
  const rows: Array<[string, number]> = [
    [NB_A.name, 4],
    [NB_B.name, 2],
    [CITY, 5],
    [`Outer ${CITY}`, 3],
    [`Faraway-${RUN}`, 9],
  ];
  for (const [destination, n] of rows) {
    for (let i = 0; i < n; i++) {
      await db.execute(sql`
        INSERT INTO search_analytics (id, search_type, destination, created_at)
        VALUES (${`b2-sa-${RUN}-${crypto.randomUUID().slice(0, 8)}`}, 'service', ${destination}, now())
      `);
    }
  }
});

after(async () => {
  try {
    await assertDisposableDb();
    await db.execute(sql`DELETE FROM search_analytics WHERE destination IN (${NB_A.name}, ${NB_B.name}, ${CITY}, ${`Outer ${CITY}`}, ${`Faraway-${RUN}`})`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${BOOKING_ID}`).catch(() => {});
    await db.execute(sql`DELETE FROM neighborhood_coverage_target WHERE neighborhood_id = ${NB_A.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${SUPPLY_ID}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${CAT_ID}`).catch(() => {});
    await db.execute(sql`DELETE FROM city_neighborhoods WHERE id IN (${NB_A.id}, ${NB_B.id})`).catch(() => {});
  } finally { /* shared pool — leave open */ }
});

test("W1: owner-gated — no session ⇒ 401", async () => {
  const res = await readOnce(await fetch(`${BASE_URL}/api/provider/market-insights`));
  assert.equal(res.status, 401);
});

test("W2: returns the server-derived shape; both layers reflect the SEEDED REAL rows", async () => {
  const res = await readOnce(
    await fetch(`${BASE_URL}/api/provider/market-insights`, { headers: { cookie: providerCookie } }),
  );
  assert.equal(res.status, 200, res.text);
  const body = res.body;
  assert.ok(body.asOf, "asOf present");
  assert.equal(body.attribution, "© OpenStreetMap contributors");
  assert.ok(body.demand && Array.isArray(body.demand.byNeighborhood), "demand shape present");
  assert.equal(body.demand.threshold, MIN_DEMAND_SIGNAL);

  // Demand — NB_A renders with its real count 4; NB_B (2) is below threshold and absent.
  const alpha = body.demand.byNeighborhood.find((d: any) => d.neighborhoodId === NB_A.id);
  assert.ok(alpha, "NB_A demand bucket present");
  assert.equal(alpha.searchCount, 4);
  assert.equal(Number(alpha.centroidLat), 35.01);
  assert.equal(body.demand.byNeighborhood.some((d: any) => d.neighborhoodId === NB_B.id), false, "NB_B below threshold ⇒ absent");
  assert.equal(body.demand.hasSignal, true);

  // City-level match, and the unplaceable disclosure.
  const cityBucket = body.demand.cityLevel.find((c: any) => c.city === CITY);
  assert.ok(cityBucket, "city-level bucket present");
  assert.equal(cityBucket.searchCount, 5);
  assert.equal(body.demand.unplaceableCount, 3);

  // Coverage gap — NB_A needs 2, has 1 ⇒ gap 1, on the real centroid.
  const gap = body.gaps.find((g: any) => g.neighborhoodId === NB_A.id && g.categoryKey === CAT_KEY);
  assert.ok(gap, "NB_A coverage gap present");
  assert.equal(gap.target, 2);
  assert.equal(gap.have, 1);
  assert.equal(gap.gap, 1);
  assert.equal(Number(gap.centroidLat), 35.01);
});

test("W3 (§13 hard negative): a surcharge booking with a pickupLocation does NOT move any demand count", async () => {
  // Baseline NB_A demand.
  const before = await readOnce(await fetch(`${BASE_URL}/api/provider/market-insights`, { headers: { cookie: providerCookie } }));
  const alphaBefore = before.body.demand.byNeighborhood.find((d: any) => d.neighborhoodId === NB_A.id).searchCount;
  assert.equal(alphaBefore, 4);

  // Insert a surcharge-charged booking whose pickupLocation sits right on NB_A's centroid — a BILLING
  // artifact that §13 forbids as demand. The endpoint reads no bookings, so this must be invisible.
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, total_amount, status, booking_details)
    VALUES (${BOOKING_ID}, ${SUPPLY_ID}, '150.00', 'confirmed',
            ${sql`${JSON.stringify({ pickupLocation: { lat: 35.01, lng: 135.76 }, travelSurcharge: 50 })}::jsonb`})
  `);

  const after = await readOnce(await fetch(`${BASE_URL}/api/provider/market-insights`, { headers: { cookie: providerCookie } }));
  const alphaAfter = after.body.demand.byNeighborhood.find((d: any) => d.neighborhoodId === NB_A.id).searchCount;
  assert.equal(alphaAfter, 4, "booking pickup coords must NEVER become demand heat (§13)");
});
