/**
 * Photo-rule lane (ledger `2026-11-28-photo-rule-a-b-d`): before/after captures of the city tile at
 * 1280 and 390, for the PR. NOT a CI test — a one-shot capture, committed as images.
 *
 * The tile's only live mount is the landing "Cities with momentum" rail, which hides itself until more
 * than one city is live (`liveRailCities`). The two API reads are therefore intercepted, so the run is
 * deterministic and needs no data change:
 *   · BEFORE — each city carries the Unsplash `imageUrl` the seed used to write.
 *   · AFTER  — each city carries no image, which is what the service returns now: the existing tinted
 *              no-photo band stands (CityCard is unchanged; only the data moved).
 *
 *   node playwright/photo-rule-captures/capture-cities.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5002";
const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const KYOTO_OLD = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800";
const GOA_OLD = "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800";

const city = (cityName, country, imageUrl) => ({
  cityName,
  country,
  countryCode: country === "Japan" ? "JP" : "IN",
  region: country === "Japan" ? "Asia" : "Asia",
  pulseScore: 90,
  activeTravelers: 1200,
  trendingScore: 80,
  crowdLevel: "moderate",
  vibeTags: ["cultural"],
  weatherScore: 80,
  avgHotelPrice: "200.00",
  priceChange: "0",
  priceTrend: "flat",
  dealAlert: null,
  totalTrendingSpots: 10,
  totalHiddenGems: 5,
  totalAlerts: 0,
  imageUrl,
  thumbnailUrl: imageUrl,
});

async function shoot({ label, cities, width }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.route("**/api/travelpulse/cities", (route) => route.fulfill({ json: { cities } }));
  await page.route("**/api/public/live-markets", (route) =>
    route.fulfill({ json: { launch: "kyoto", live: ["kyoto", "goa"], beta: [], dates: {}, marketKeys: ["kyoto", "goa"] } }),
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const rail = page.locator('[data-testid="cities-rail"]');
  await rail.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1200); // let lazy images settle / fonts land
  const file = path.join(OUT, `${label}-${width}.png`);
  await rail.screenshot({ path: file });
  await browser.close();
  console.log("wrote", path.basename(file));
}

const before = [city("Kyoto", "Japan", KYOTO_OLD), city("Goa", "India", GOA_OLD)];
const after = [city("Kyoto", "Japan", null), city("Goa", "India", null)];

for (const width of [1280, 390]) {
  await shoot({ label: "before", cities: before, width });
  await shoot({ label: "after", cities: after, width });
}

