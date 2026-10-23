/**
 * r07-drop-seasonal-highlights.db.test.ts — R-07 (ledger `2026-10-22-r07-drop-seasonal-highlights`).
 *
 * `currentHighlight` and `aiSeasonalHighlights` are absent from every traveler-facing response,
 * including nested city objects, and from every AI prompt builder. No age cutoff. The columns
 * stay on `travel_pulse_cities`. The admin city read keeps `seasonalHighlights` behind its gate.
 * `destination_seasons.highlights` on the global calendar is a different column and stays.
 *
 *   DATABASE_URL=postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql \
 *     npx tsx --test --test-force-exit server/__tests__/r07-drop-seasonal-highlights.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";

const { db, pool } = await import("../db");
const { eq } = await import("drizzle-orm");
const { travelPulseCities, destinationSeasons } = await import("../../shared/schema");
const contentRoutes = (await import("../routes/content.routes")).default;
const {
  formatTravelPulsePromptSection,
  draftCityPromptFields,
  optimizationCityPromptFields,
} = await import("../services/travelpulse-traveler-projection");
const { cityEnrichmentInput } = await import("../services/content-enrichment.service");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
      `[r07-drop-seasonal-highlights] REFUSING to write fixtures: DATABASE_URL host '${host}' is not a disposable ` +
        `dev/CI database. Opt in deliberately with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const FORBIDDEN_KEYS = [
  "currentHighlight",
  "aiSeasonalHighlights",
  "current_highlight",
  "ai_seasonal_highlights",
];
const PLANTED_CURRENT = "PLANTED_CURRENT_R07";
const PLANTED_SEASONAL = "PLANTED_SEASONAL_R07";
const SEASON_MARK = "R07_DESTINATION_SEASON";

function forbiddenPaths(value: unknown, trail = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenPaths(v, `${trail}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      ...(FORBIDDEN_KEYS.includes(k) ? [`${trail}.${k}`] : []),
      ...forbiddenPaths(v, `${trail}.${k}`),
    ]);
  }
  return [];
}

const CITY = "Kyoto";
const COUNTRY = "Japan";
const MONTH = new Date().getUTCMonth() + 1;

let server: http.Server;
let base = "";
const created: { cityId?: string; seasonId?: string } = {};
let restoreCity: { currentHighlight: string | null; aiSeasonalHighlights: unknown; highlightEmoji: string | null } | null = null;

async function getJson(urlPath: string): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${base}${urlPath}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

describe("R-07 prompt builders drop seasonal highlights", () => {
  it("the TravelPulse prompt section ignores planted seasonal fields and keeps the budget line", () => {
    const section = formatTravelPulsePromptSection({
      aiBudgetEstimate: "mid range stays",
      aiSeasonalHighlights: PLANTED_SEASONAL,
      currentHighlight: PLANTED_CURRENT,
      pulseScore: 80,
    });
    assert.match(section, /Local Budget Insight: mid range stays/);
    assert.equal(section.includes("Seasonal Highlights"), false);
    assert.equal(section.includes(PLANTED_SEASONAL), false);
    assert.equal(section.includes(PLANTED_CURRENT), false);
  });

  it("an empty TravelPulse context adds no section", () => {
    assert.equal(formatTravelPulsePromptSection(null), "");
    assert.equal(formatTravelPulsePromptSection({ aiSeasonalHighlights: PLANTED_SEASONAL, currentHighlight: PLANTED_CURRENT }), "");
  });

  it("draft and optimizer city copies omit both keys", () => {
    const city = {
      trendingScore: 12,
      aiBudgetEstimate: "budget text",
      aiTravelTips: "tip",
      aiLocalInsights: "insight",
      aiMustSeeAttractions: "shrine",
      aiUpcomingEvents: "festival",
      aiSeasonalHighlights: [{ month: 4, highlight: PLANTED_SEASONAL }],
      currentHighlight: PLANTED_CURRENT,
    };
    for (const copied of [draftCityPromptFields(city), optimizationCityPromptFields(city)]) {
      const keys = Object.keys(copied);
      for (const forbidden of FORBIDDEN_KEYS) assert.equal(keys.includes(forbidden), false, forbidden);
      const text = JSON.stringify(copied);
      assert.equal(text.includes(PLANTED_CURRENT), false);
      assert.equal(text.includes(PLANTED_SEASONAL), false);
    }
    assert.equal(draftCityPromptFields(city).aiBudgetEstimate, "budget text");
    assert.equal(optimizationCityPromptFields(city).trendingScore, 12);
  });

  it("enrichment input does not turn currentHighlight into whatsHotNow", () => {
    const input = cityEnrichmentInput(
      { aiMustSeeAttractions: ["Kiyomizu-dera"], currentHighlight: PLANTED_CURRENT },
      [{ name: "Nishiki", type: "market", whySpecial: "local", priceRange: "$$" }],
    );
    assert.equal("whatsHotNow" in input, false);
    assert.deepEqual(input.mustSeeAttractions, ["Kiyomizu-dera"]);
    assert.equal(JSON.stringify(input).includes(PLANTED_CURRENT), false);
  });

  it("the four prompt sites and the seeds no longer name the dropped fields as inputs", () => {
    const code = (file: string) =>
      readFileSync(path.join(ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const routes = code("server/routes.ts");
    const generation = code("server/services/ai-generation.service.ts");
    const optimization = code("server/services/trip-optimization.service.ts");
    const enrichment = code("server/services/content-enrichment.service.ts");
    const kyotoSeed = code("server/seeds/phase-4b-kyoto-city-intelligence.seed.ts");
    const pulseSeed = code("server/seed-travelpulse.ts");
    const contentRoutesSrc = readFileSync(path.join(ROOT, "server/routes/content.routes.ts"), "utf8");

    assert.equal(routes.includes("aiSeasonalHighlights"), false);
    assert.equal(routes.includes("currentHighlight"), false);
    assert.match(routes, /draftCityPromptFields\(city\)/);
    assert.equal(generation.includes("Seasonal Highlights"), false);
    assert.equal(generation.includes("aiSeasonalHighlights"), false);
    assert.match(optimization, /optimizationCityPromptFields\(city\)/);
    assert.equal(optimization.includes("aiSeasonalHighlights"), false);
    assert.equal(optimization.includes("currentHighlight"), false);
    assert.equal(enrichment.includes("whatsHotNow"), false);

    assert.equal(kyotoSeed.includes("currentHighlight"), false);
    assert.equal(kyotoSeed.includes("aiSeasonalHighlights"), false);
    assert.equal(pulseSeed.includes("current_highlight"), false);
    assert.equal(pulseSeed.includes("highlight_emoji"), false);

    assert.match(contentRoutesSrc, /router\.get\("\/api\/travelpulse\/ai\/city\/:cityName", requireAdmin/);
    assert.match(contentRoutesSrc, /seasonalHighlights: city\.aiSeasonalHighlights/);
  });
});

describe("R-07 traveler endpoints omit seasonal city fields", { timeout: 120_000 }, () => {
  before(async () => {
    assertDisposableDb();

    const [existing] = await db.select().from(travelPulseCities).where(eq(travelPulseCities.cityName, CITY)).limit(1);
    const planted = {
      currentHighlight: PLANTED_CURRENT,
      aiSeasonalHighlights: [{ month: 4, highlight: PLANTED_SEASONAL }],
      highlightEmoji: "🌸",
    };
    if (existing) {
      restoreCity = {
        currentHighlight: existing.currentHighlight ?? null,
        aiSeasonalHighlights: existing.aiSeasonalHighlights ?? null,
        highlightEmoji: existing.highlightEmoji ?? null,
      };
      await db.update(travelPulseCities).set(planted as any).where(eq(travelPulseCities.id, existing.id));
    } else {
      const [row] = await db
        .insert(travelPulseCities)
        .values({ cityName: CITY, country: COUNTRY, ...planted } as any)
        .returning({ id: travelPulseCities.id });
      created.cityId = row.id;
    }

    const [cityRow] = await db.select().from(travelPulseCities).where(eq(travelPulseCities.cityName, CITY)).limit(1);
    const [season] = await db
      .insert(destinationSeasons)
      .values({
        city: CITY,
        country: cityRow.country,
        month: MONTH,
        rating: "good",
        highlights: [SEASON_MARK],
      } as any)
      .returning({ id: destinationSeasons.id });
    created.seasonId = season.id;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => false;
      next();
    });
    app.use(contentRoutes);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    server?.close();
    if (created.seasonId) await db.delete(destinationSeasons).where(eq(destinationSeasons.id, created.seasonId));
    if (created.cityId) await db.delete(travelPulseCities).where(eq(travelPulseCities.id, created.cityId));
    else if (restoreCity) {
      await db.update(travelPulseCities).set(restoreCity as any).where(eq(travelPulseCities.cityName, CITY));
    }
    await pool.end();
  });

  it("the four traveler reads return neither seasonal key, including nested city objects", async () => {
    const routes = [
      "/api/travelpulse/cities?limit=20",
      `/api/travelpulse/cities/${CITY}`,
      `/api/discover/location/${CITY}`,
      `/api/travelpulse/global-calendar?month=${MONTH}&limit=50`,
    ];
    for (const route of routes) {
      const { status, body, text } = await getJson(route);
      assert.equal(status, 200, `${route} answered ${status}: ${text.slice(0, 300)}`);
      assert.deepEqual(forbiddenPaths(body), [], `${route} still carries a seasonal city key`);
      assert.equal(text.includes(PLANTED_CURRENT), false, `${route} leaked the planted current highlight`);
      assert.equal(text.includes(PLANTED_SEASONAL), false, `${route} leaked the planted seasonal highlight`);
    }

    const rail = (await getJson("/api/travelpulse/cities?limit=20")).body.cities as any[];
    const railCity = rail.find((c) => c.cityName === CITY);
    assert.ok(railCity, "cities list did not return the planted city");
    assert.equal(Object.hasOwn(railCity, "currentHighlight"), false);
    assert.equal(Object.hasOwn(railCity, "aiSeasonalHighlights"), false);

    const detail = (await getJson(`/api/travelpulse/cities/${CITY}`)).body;
    assert.equal(detail.city.cityName, CITY);
    assert.equal(Object.hasOwn(detail.city, "currentHighlight"), false);
    assert.equal(Object.hasOwn(detail.city, "aiSeasonalHighlights"), false);
    assert.equal(detail.city.highlightEmoji, "🌸");

    const view = (await getJson(`/api/discover/location/${CITY}`)).body;
    const heroCity = view?.hero?.data?.city;
    assert.equal(heroCity?.cityName, CITY, "discover hero did not carry the planted city");
    assert.equal(Object.hasOwn(heroCity, "currentHighlight"), false);
    assert.equal(Object.hasOwn(heroCity, "aiSeasonalHighlights"), false);

    const calendar = (await getJson(`/api/travelpulse/global-calendar?month=${MONTH}&limit=50`)).body;
    const buckets = [
      ...(calendar.cities ?? []),
      ...(calendar.grouped?.best ?? []),
      ...(calendar.grouped?.good ?? []),
      ...(calendar.grouped?.average ?? []),
      ...(calendar.grouped?.eventsOnly ?? []),
      ...(calendar.grouped?.avoid ?? []),
    ];
    const calCity = buckets.find((c: any) => c?.cityName === CITY);
    assert.ok(calCity, "global calendar dropped the planted city");
    assert.equal(Object.hasOwn(calCity, "currentHighlight"), false);
    assert.equal(Object.hasOwn(calCity, "aiSeasonalHighlights"), false);
    assert.ok(Array.isArray(calCity.highlights), "destination_seasons highlights should still be present");
    assert.equal(calCity.highlightEmoji, "🌸");
  });

  it("the admin city read stays behind the staff gate", async () => {
    const { status, text } = await getJson(`/api/travelpulse/ai/city/${CITY}`);
    assert.equal(status, 401);
    assert.equal(text.includes(PLANTED_CURRENT), false);
    assert.equal(text.includes(PLANTED_SEASONAL), false);
  });
});
