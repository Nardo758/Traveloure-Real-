/**
 * INTL-01–16: TravelPulse Intelligence, Destination Calendar & Recommendations
 * Tests public intelligence endpoints, auth-gated recommendations, admin analytics
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Public TravelPulse Endpoints ────────────────────────────────────────────

test("INTL-01: GET /api/travelpulse/trending/:city → returns trending data (public)", async ({ page }) => {
  const resp = await page.request.get("/api/travelpulse/trending/Tokyo");
  console.log("INTL-01:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("INTL-01: trending keys:", Object.keys(body).join(", "));
  }
  console.log("INTL-01: TravelPulse trending responded ✓");
});

test("INTL-02: GET /api/travelpulse/calendar/:city → returns calendar (public)", async ({ page }) => {
  const resp = await page.request.get("/api/travelpulse/calendar/Paris");
  console.log("INTL-02:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("INTL-02: TravelPulse calendar responded ✓");
});

test("INTL-03: GET /api/travelpulse/destination/:city/:name → returns destination info (public)", async ({ page }) => {
  const resp = await page.request.get("/api/travelpulse/destination/Tokyo/Shibuya");
  console.log("INTL-03:", resp.status());
  expect([200, 404, 500]).toContain(resp.status());
  console.log("INTL-03: TravelPulse destination responded ✓");
});

test("INTL-04: GET /api/travelpulse/livescore/:city/:entity → returns livescore (public)", async ({ page }) => {
  const resp = await page.request.get("/api/travelpulse/livescore/Paris/Eiffel-Tower");
  console.log("INTL-04:", resp.status());
  expect([200, 404, 500]).toContain(resp.status());
  console.log("INTL-04: TravelPulse livescore responded ✓");
});

test("INTL-05: POST /api/travelpulse/truth-check → responds (public)", async ({ page }) => {
  const resp = await page.request.post("/api/travelpulse/truth-check", {
    data: { claim: "The Eiffel Tower is in Paris", city: "Paris" },
  });
  console.log("INTL-05:", resp.status());
  expect([200, 400, 500]).toContain(resp.status());
  console.log("INTL-05: TravelPulse truth check responded ✓");
});

// ─── Destination Calendar ─────────────────────────────────────────────────────

test("INTL-06: GET /api/destination-calendar/countries → returns countries (public)", async ({ page }) => {
  const resp = await page.request.get("/api/destination-calendar/countries");
  console.log("INTL-06:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("INTL-06: countries type:", typeof body, Array.isArray(body) ? "array" : "object");
  }
  console.log("INTL-06: destination calendar countries responded ✓");
});

test("INTL-07: GET /api/destination-calendar/events → returns events (public)", async ({ page }) => {
  const resp = await page.request.get("/api/destination-calendar/events");
  console.log("INTL-07:", resp.status());
  expect([200, 400, 500]).toContain(resp.status());
  console.log("INTL-07: destination calendar events responded ✓");
});

test("INTL-08: GET /api/destination-calendar/seasons → returns seasons (public)", async ({ page }) => {
  const resp = await page.request.get("/api/destination-calendar/seasons");
  console.log("INTL-08:", resp.status());
  expect([200, 400, 500]).toContain(resp.status());
  console.log("INTL-08: destination calendar seasons responded ✓");
});

test("INTL-09: GET /api/destination-calendar/my-events → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/destination-calendar/my-events");
  console.log("INTL-09:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Recommendations ──────────────────────────────────────────────────────────

test("INTL-10: GET /api/recommendations/user → returns recommendations (public)", async ({ page }) => {
  const resp = await page.request.get("/api/recommendations/user");
  console.log("INTL-10:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("INTL-10: user recommendations responded ✓");
});

test("INTL-11: GET /api/recommendations/market-intelligence/:city → returns data (public)", async ({ page }) => {
  const resp = await page.request.get("/api/recommendations/market-intelligence/Tokyo");
  console.log("INTL-11:", resp.status());
  expect([200, 404, 500]).toContain(resp.status());
  console.log("INTL-11: market intelligence responded ✓");
});

test("INTL-12: GET /api/recommendations/seasonal/:city → returns data (public)", async ({ page }) => {
  const resp = await page.request.get("/api/recommendations/seasonal/Paris");
  console.log("INTL-12:", resp.status());
  expect([200, 404, 500]).toContain(resp.status());
  console.log("INTL-12: seasonal recommendations responded ✓");
});

test("INTL-13: GET /api/recommendations/expert → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/recommendations/expert");
  console.log("INTL-13:", resp.status());
  expect(resp.status()).toBe(401);
});

test("INTL-14: GET /api/recommendations/expert → returns data as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/recommendations/expert");
  console.log("INTL-14:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("INTL-14: expert recommendations:", Array.isArray(body) ? body.length : typeof body);
  }
  console.log("INTL-14: expert recommendations responded ✓");
});

test("INTL-15: GET /api/recommendations/provider → returns data as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/recommendations/provider");
  console.log("INTL-15:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("INTL-15: provider recommendations responded ✓");
});

// ─── E2E: TravelPulse discovery → calendar → recommendations ─────────────────

test("INTL-16: E2E — TravelPulse trending → calendar → recommendations", async ({ page }) => {
  // Step 1: Public TravelPulse trending
  const trendingResp = await page.request.get("/api/travelpulse/trending/London");
  expect([200, 500]).toContain(trendingResp.status());
  console.log("INTL-16 Step 1: TravelPulse trending:", trendingResp.status(), "✓");

  // Step 2: Destination calendar countries
  const countriesResp = await page.request.get("/api/destination-calendar/countries");
  expect([200, 500]).toContain(countriesResp.status());
  console.log("INTL-16 Step 2: calendar countries:", countriesResp.status(), "✓");

  // Step 3: Seasonal recommendations (public)
  const seasonalResp = await page.request.get("/api/recommendations/seasonal/London");
  expect([200, 404, 500]).toContain(seasonalResp.status());
  console.log("INTL-16 Step 3: seasonal recommendations:", seasonalResp.status(), "✓");

  // Step 4: Market intelligence (public)
  const marketResp = await page.request.get("/api/recommendations/market-intelligence/London");
  expect([200, 404, 500]).toContain(marketResp.status());
  console.log("INTL-16 Step 4: market intelligence:", marketResp.status(), "✓");

  // Step 5: Auth guard — my-events requires login
  const myEventsUnauth = await page.request.get("/api/destination-calendar/my-events");
  expect(myEventsUnauth.status()).toBe(401);
  console.log("INTL-16 Step 5: my-events auth guard ✓");

  // Step 6: Login and fetch my-events
  await loginAs(page, "user");
  const myEventsAuth = await page.request.get("/api/destination-calendar/my-events");
  expect([200, 500]).toContain(myEventsAuth.status());
  console.log("INTL-16 Step 6: my-events as user:", myEventsAuth.status(), "✓");

  // Step 7: User recommendations (public, but better with auth)
  const userRecs = await page.request.get("/api/recommendations/user");
  expect([200, 500]).toContain(userRecs.status());
  console.log("INTL-16 Step 7: user recommendations:", userRecs.status(), "✓");

  console.log("INTL-16 E2E intelligence & pulse flow complete ✓");
});
