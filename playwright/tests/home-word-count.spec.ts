/**
 * H1 — THE HOME PAGE SAYS LESS (ledger `2026-10-08-h1-home-copy`; decision-maker, Oct 8, 2026).
 *
 * Counts the words a visitor reads in the home page's `main` element and holds it to ≤ 80% of the
 * same page's count BEFORE H1, in one FIXTURE state, so the number means the same thing in CI and on
 * a laptop: every data endpoint the page reads is answered from the fixtures below (no hero city,
 * the curated billboard, 4 events, 8 cities, the 8 Moments from the code's own content), and the
 * visitor is signed out.
 *
 * HOW A WORD IS COUNTED: `main.innerText` split on whitespace; a token counts when it holds a letter
 * or a digit, so "·", "→" and "—" do not. Hidden elements are not in `innerText`, so a slide that is
 * not showing is not counted.
 *
 * STATED NEGATIVE SPACE (§18d): it measures one state, signed out, at desktop width. It does not
 * read the header or the footer (outside `main`), and it does not judge whether the words are good.
 *
 * Run: npx playwright test home-word-count --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";

/** `main`'s word count on this page BEFORE H1, in the fixture state below (measured on d1b9720cb). */
const BEFORE_FIXTURE_WORDS = 573;
const BUDGET = 0.8;

const hero = { city: null, trend: null, crowd: null, anchorExpert: null, gem: null, service: null, wanted: null };
const billboard = { overrides: [], marketSelection: { market: null, slots: [] } };

const event = (
  id: string, title: string, city: string, marketKey: string, neighbourhood: string, venue: string,
  firstDate: string, lastDate: string, nights: number, daysUntil: number,
) => ({
  id, series: null, title, city, marketKey, neighbourhood, venue,
  startsAt: `${firstDate}T19:00:00.000Z`, endsAt: nights > 1 ? `${lastDate}T23:00:00.000Z` : null,
  nights, daysUntil, firstDate, lastDate, startTime: null, vertical: "music", venueLocality: null,
  ticketUrl: null, blurb: null, imagePath: null,
});
const events = {
  windowDays: 180,
  total: 4,
  events: [
    event("h1-ev-1", "Rock al Parque", "Bogotá", "bogota", "Chapinero", "Parque Simón Bolívar", "2026-10-10", "2026-10-12", 3, 2),
    event("h1-ev-2", "Imagine Noh", "Kyoto", "kyoto", "Gion", "Kyoto Kanze Kaikan", "2026-10-14", "2026-11-05", 23, 5),
    event("h1-ev-3", "Aitana — Cuarto Azul World Tour", "Bogotá", "bogota", "Chapinero", "Movistar Arena", "2026-10-16", "2026-10-16", 1, 8),
    event("h1-ev-4", "Starsailor", "Edinburgh", "edinburgh", "Old Town", "Usher Hall", "2026-10-17", "2026-10-17", 1, 8),
  ],
};

const city = (cityName: string, country: string, trendingScore: number) => ({
  id: `h1-${cityName}`, cityName, country, countryCode: null, region: null, timezone: null,
  latitude: null, longitude: null, activeTravelers: 0, trendingScore, vibeTags: [],
  currentHighlight: null, highlightEmoji: null, currentWeather: {}, weatherScore: null,
  avgHotelPrice: null, priceChange: null, priceTrend: null, dealAlert: null,
  totalTrendingSpots: 0, totalHiddenGems: 0, totalAlerts: 0, imageUrl: null,
});
const cities = {
  cities: [
    city("Cartagena", "Colombia", 58), city("Goa", "India", 51), city("Mumbai", "India", 50), city("Kyoto", "Japan", 48),
    city("Bogotá", "Colombia", 40), city("Edinburgh", "United Kingdom", 38), city("Porto", "Portugal", 36), city("Jaipur", "India", 34),
  ],
  count: 8,
};

/**
 * The Moments payload, built from the code's OWN stories (`MOMENTS`, server/services/landing-moments.ts),
 * so a rewrite is counted. That module imports the database client, which needs `DATABASE_URL` set and
 * creates a pool lazily; nothing here queries it, so a placeholder URL is enough where none is set.
 */
async function momentsPayload() {
  process.env.DATABASE_URL ||= "postgresql://localhost/unused-by-home-word-count";
  const { MOMENTS } = await import("../../server/services/landing-moments");
  return {
  moments: MOMENTS.map((m) => ({
    key: m.key, label: m.label, eyebrow: m.eyebrow, headline: m.headline, pieces: m.pieces,
    experienceType: m.experienceType, experienceSlug: m.experienceSlug,
    photos: [{ url: "/images/moments/goa-honeymoon.jpg", place: m.city, source: "representative", handle: null }],
    builder: null,
  })),
  roster: MOMENTS.map((m) => ({ key: m.key, label: m.label })),
  };
}

async function serveFixtures(page: Page): Promise<void> {
  const moments = await momentsPayload();
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/landing/hero*", (r) => r.fulfill(json(hero)));
  await page.route("**/api/landing/billboard-experts*", (r) => r.fulfill(json(billboard)));
  await page.route("**/api/landing/moments", (r) => r.fulfill(json(moments)));
  await page.route("**/api/city-events/upcoming*", (r) => r.fulfill(json(events)));
  await page.route("**/api/travelpulse/cities*", (r) => r.fulfill(json(cities)));
}

/** Words a visitor reads in `main`. */
async function mainWordCount(page: Page): Promise<number> {
  const text = await page.locator("main").first().innerText();
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

test("H1: the home page's main reads at most 80% of its pre-H1 word count (fixture state)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await serveFixtures(page);
  await page.goto("/");
  // Every fixture-fed section has rendered before counting.
  await expect(page.getByTestId("section-city-events")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Cities with momentum this month")).toBeVisible();
  await expect(page.getByTestId("moment-headline").first()).toBeVisible();
  const words = await mainWordCount(page);
  console.log(`[home-word-count] main = ${words} words (before H1: ${BEFORE_FIXTURE_WORDS}; budget ${Math.floor(BEFORE_FIXTURE_WORDS * BUDGET)})`);
  expect(Number.isFinite(BEFORE_FIXTURE_WORDS), "the pre-H1 count is recorded").toBe(true);
  expect(words).toBeLessThanOrEqual(Math.floor(BEFORE_FIXTURE_WORDS * BUDGET));
});
