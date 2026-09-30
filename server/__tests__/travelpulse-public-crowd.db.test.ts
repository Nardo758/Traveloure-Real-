/**
 * travelpulse-public-crowd.db.test.ts — TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`;
 * trend-engine audit Sep 29, 2026 §3/§5).
 *
 * The decision-maker's ruling: the legacy `travel_pulse_cities.crowd_level` leaves EVERY public
 * route that carried it — `/api/travelpulse/cities`, `/api/landing/hero`,
 * `/api/discover/location/:city` and the global calendar — "with one test over all four"; it returns
 * when PR 2 computes Crowd. The same lane gates the Trend number on freshness: a market whose newest
 * `trend_scores` row is older than the max age shows NO number (null on the destination page, the
 * rail's existing 0-suppression on the rail), never last month's score.
 *
 * Fixtures deliberately PLANT the legacy claims (crowd "packed", pulse 95, a happening-now row and a
 * month season carrying a crowd level) so an absent field is proven stripped, not merely unseeded.
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5433/traveloure \
 *     npx tsx --test server/__tests__/travelpulse-public-crowd.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";

const { db, pool } = await import("../db");
const { eq, and } = await import("drizzle-orm");
const {
  travelPulseCities,
  travelPulseHappeningNow,
  destinationSeasons,
  trendEntities,
  trendScores,
} = await import("../../shared/schema");
const contentRoutes = (await import("../routes/content.routes")).default;
const landingRoutes = (await import("../routes/landing.routes")).default;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* unparseable ⇒ refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[travelpulse-public-crowd] REFUSING to write fixtures: DATABASE_URL host '${host}' is not a disposable ` +
        `dev/CI database. Opt in deliberately with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const LEGACY_KEYS = ["crowdLevel", "seasonCrowdLevel", "pulseScore", "crowd_level", "pulse_score"];

/** Every path in `value` whose key is a legacy crowd/pulse field. */
function legacyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => legacyPaths(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      ...(LEGACY_KEYS.includes(k) ? [`${path}.${k}`] : []),
      ...legacyPaths(v, `${path}.${k}`),
    ]);
  }
  return [];
}

const CITY = "Kyoto";
const COUNTRY = "Japan";
const MONTH = new Date().getUTCMonth() + 1;

let server: http.Server;
let base = "";
const created: { cityId?: string; happeningId?: string; seasonId?: string; entityId?: string } = {};
let restoreCity: { crowdLevel: string | null; pulseScore: number | null } | null = null;
let restoreScore: { trendScore: string | null; trendConfidence: string | null; computedAt: Date } | null = null;

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function setScore(computedAt: Date): Promise<void> {
  await db
    .insert(trendScores)
    .values({
      trendEntityId: created.entityId!,
      trendScore: "1.400",
      trendConfidence: "0.9000",
      computedAt,
      scoringRunId: "travelpulse-public-crowd-test",
    })
    .onConflictDoUpdate({
      target: trendScores.trendEntityId,
      set: { trendScore: "1.400", trendConfidence: "0.9000", computedAt },
    });
}

describe("TravelPulse PR 1 — no legacy crowd on a public route; stale Trend shows no number", () => {
  before(async () => {
    assertDisposableDb();

    // The city row, with the legacy claims PLANTED.
    const [existing] = await db.select().from(travelPulseCities).where(eq(travelPulseCities.cityName, CITY)).limit(1);
    if (existing) {
      restoreCity = { crowdLevel: existing.crowdLevel ?? null, pulseScore: existing.pulseScore ?? null };
      await db
        .update(travelPulseCities)
        .set({ crowdLevel: "packed", pulseScore: 95 })
        .where(eq(travelPulseCities.id, existing.id));
    } else {
      const [row] = await db
        .insert(travelPulseCities)
        .values({ cityName: CITY, country: COUNTRY, crowdLevel: "packed", pulseScore: 95 } as any)
        .returning({ id: travelPulseCities.id });
      created.cityId = row.id;
    }
    const [cityRow] = await db.select().from(travelPulseCities).where(eq(travelPulseCities.cityName, CITY)).limit(1);

    const [hn] = await db
      .insert(travelPulseHappeningNow)
      .values({
        city: CITY,
        eventType: "market",
        title: "PR1 fixture — happening now",
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 3_600_000),
        crowdLevel: "packed",
      } as any)
      .returning({ id: travelPulseHappeningNow.id });
    created.happeningId = hn.id;

    const [season] = await db
      .insert(destinationSeasons)
      .values({ city: CITY, country: cityRow.country, month: MONTH, rating: "best", crowdLevel: "packed" } as any)
      .returning({ id: destinationSeasons.id });
    created.seasonId = season.id;

    // The market entity the resolver reads (created if the database has none).
    const [ent] = await db
      .select()
      .from(trendEntities)
      .where(and(eq(trendEntities.entityType, "market"), eq(trendEntities.internalId, "kyoto")))
      .limit(1);
    if (ent) {
      created.entityId = ent.id;
      const [s] = await db.select().from(trendScores).where(eq(trendScores.trendEntityId, ent.id)).limit(1);
      if (s) restoreScore = { trendScore: s.trendScore, trendConfidence: s.trendConfidence, computedAt: s.computedAt };
    } else {
      const [row] = await db
        .insert(trendEntities)
        .values({ entityType: "market", internalId: "kyoto" })
        .returning({ id: trendEntities.id });
      created.entityId = row.id;
      (created as any).entityCreated = true;
    }

    const app = express();
    app.use(express.json());
    app.use(contentRoutes);
    app.use(landingRoutes);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    server?.close();
    if (created.happeningId) await db.delete(travelPulseHappeningNow).where(eq(travelPulseHappeningNow.id, created.happeningId));
    if (created.seasonId) await db.delete(destinationSeasons).where(eq(destinationSeasons.id, created.seasonId));
    if ((created as any).entityCreated) {
      await db.delete(trendEntities).where(eq(trendEntities.id, created.entityId!));
    } else if (created.entityId) {
      if (restoreScore) {
        await db.update(trendScores).set(restoreScore).where(eq(trendScores.trendEntityId, created.entityId));
      } else {
        await db.delete(trendScores).where(eq(trendScores.trendEntityId, created.entityId));
      }
    }
    if (created.cityId) await db.delete(travelPulseCities).where(eq(travelPulseCities.id, created.cityId));
    else if (restoreCity) await db.update(travelPulseCities).set(restoreCity).where(eq(travelPulseCities.cityName, CITY));
    await pool.end();
  });

  it("T1: none of the four public routes carries a legacy crowd or pulse field", async () => {
    await setScore(new Date());
    const routes = [
      "/api/travelpulse/cities?limit=20",
      "/api/landing/hero",
      `/api/discover/location/${CITY}`,
      `/api/travelpulse/global-calendar?month=${MONTH}&limit=50`,
    ];
    for (const r of routes) {
      const { status, body } = await getJson(r);
      assert.equal(status, 200, `${r} answered ${status}: ${JSON.stringify(body).slice(0, 300)}`);
      assert.deepEqual(legacyPaths(body), [], `${r} carries a legacy crowd/pulse field`);
    }
    // The fixture really reached the two routes that read it (so absence is a strip, not a miss).
    const rail = (await getJson("/api/travelpulse/cities?limit=20")).body.cities as any[];
    assert.ok(rail.some((c) => c.cityName === CITY), "rail did not return the fixture city");
    const view = (await getJson(`/api/discover/location/${CITY}`)).body;
    assert.ok(JSON.stringify(view).includes("PR1 fixture — happening now"), "location view did not read the fixture");
  });

  it("T2: the hero never states a crowd", async () => {
    const { body } = await getJson("/api/landing/hero");
    assert.equal(body.crowd, null);
  });

  it("T3: a fresh resolver score is shown; a stale one shows no number (null on the page, 0 on the rail)", async () => {
    await setScore(new Date());
    // The city-intelligence read the location view's hero is built from (uncached — the location
    // view itself holds a 5-minute in-process cache, which a staleness gate does not need to beat).
    const fresh = (await getJson(`/api/travelpulse/cities/${CITY}`)).body;
    const freshScore = fresh?.city?.trendingScore;
    assert.equal(freshScore, 70, `fresh score maps 1.4 × 50 = 70, got ${JSON.stringify(freshScore)}`);

    await setScore(new Date(Date.now() - 72 * 3_600_000));
    const stale = (await getJson(`/api/travelpulse/cities/${CITY}`)).body;
    assert.equal(stale?.city?.trendingScore, null, "a 72h-old score must show no number");
    const rail = (await getJson("/api/travelpulse/cities?limit=20")).body.cities as any[];
    const kyoto = rail.find((c) => c.cityName === CITY);
    assert.equal(kyoto?.trendingScore, 0, "the rail's existing suppression path (0) for a stale score");
  });

  it("T4: /api/health reports the newest trend-score age", async () => {
    await setScore(new Date(Date.now() - 2 * 3_600_000));
    const { body } = await getJson("/api/health");
    assert.equal(body.status, "ok");
    assert.ok(body.trendScores, "health carries a trendScores block");
    assert.equal(typeof body.trendScores.ageHours, "number");
    assert.ok(body.trendScores.ageHours >= 0 && body.trendScores.ageHours <= 2.5, `age ${body.trendScores.ageHours}`);
    assert.equal(body.trendScores.fresh, true);
  });
});
