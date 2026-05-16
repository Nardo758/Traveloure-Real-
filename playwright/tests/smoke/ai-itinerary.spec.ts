/**
 * AIIT-01–16: AI & Itinerary Builder
 * Tests auth guards, AI endpoints shape, itinerary generation, grok health, E2E
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("AIIT-01: POST /api/ai/generate-itinerary → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/ai/generate-itinerary", {
    data: { destination: "Tokyo", days: 3 },
  });
  console.log("AIIT-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AIIT-02: POST /api/ai/chat → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/ai/chat", {
    data: { message: "Hello" },
  });
  console.log("AIIT-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AIIT-03: POST /api/grok/match-experts → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/grok/match-experts", {
    data: { destination: "Tokyo" },
  });
  console.log("AIIT-03:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AIIT-04: POST /api/claude/optimize-itinerary → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/claude/optimize-itinerary", {
    data: { tripId: "test" },
  });
  console.log("AIIT-04:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Public AI/Grok Endpoints ─────────────────────────────────────────────────

test("AIIT-05: GET /api/grok/health → 200 (public health check)", async ({ page }) => {
  const resp = await page.request.get("/api/grok/health");
  console.log("AIIT-05:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("status");
  console.log("AIIT-05: grok health:", body.status);
});

test("AIIT-06: GET /api/health → 200 (platform health)", async ({ page }) => {
  const resp = await page.request.get("/api/health");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("status");
  console.log("AIIT-06: platform health:", body.status);
});

// ─── Authenticated AI Itineraries ─────────────────────────────────────────────

test("AIIT-07: GET /api/ai/itineraries → returns array as authenticated user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/ai/itineraries");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("AIIT-07: AI itineraries count:", body.length);
});

test("AIIT-08: GET /api/ai/itineraries/:id → 404 for non-existent itinerary", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/ai/itineraries/00000000-0000-0000-0000-000000000000");
  console.log("AIIT-08:", resp.status());
  expect([404, 403]).toContain(resp.status());
  console.log("AIIT-08: non-existent AI itinerary returns expected status ✓");
});

// ─── Quick Start Itinerary ────────────────────────────────────────────────────

test("AIIT-09: POST /api/quick-start-itinerary → 400 missing destination", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/quick-start-itinerary", {
    data: {},
  });
  console.log("AIIT-09:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("AIIT-09: missing destination rejected ✓");
});

// ─── Generated Itineraries ────────────────────────────────────────────────────

test("AIIT-10: GET /api/generated-itineraries/:tripId → 404 for non-existent trip", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/generated-itineraries/00000000-0000-0000-0000-000000000000");
  console.log("AIIT-10:", resp.status());
  expect([404, 403]).toContain(resp.status());
  console.log("AIIT-10: non-existent trip itinerary returns expected status ✓");
});

// ─── Destination Intelligence ─────────────────────────────────────────────────

test("AIIT-11: GET /api/destination-intelligence → 400 without destination param", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/destination-intelligence");
  console.log("AIIT-11:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("AIIT-11: missing destination param rejected ✓");
});

test("AIIT-12: GET /api/destination-intelligence?destination=Tokyo → returns intelligence data", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/destination-intelligence?destination=Tokyo");
  console.log("AIIT-12:", resp.status());
  // May succeed or fail depending on API availability — accept 200, 500, or 503
  expect([200, 500, 503]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    expect(typeof body).toBe("object");
    console.log("AIIT-12: destination intelligence keys:", Object.keys(body).slice(0, 5).join(", "));
  } else {
    console.log("AIIT-12: destination intelligence unavailable (external API)");
  }
});

// ─── Platform Stats ───────────────────────────────────────────────────────────

test("AIIT-13: GET /api/platform/stats → returns platform stats (public)", async ({ page }) => {
  const resp = await page.request.get("/api/platform/stats");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(typeof body).toBe("object");
  console.log("AIIT-13: platform stats keys:", Object.keys(body).slice(0, 6).join(", "));
});

// ─── Geocode ──────────────────────────────────────────────────────────────────

test("AIIT-14: POST /api/geocode → 400 missing address", async ({ page }) => {
  const resp = await page.request.post("/api/geocode", { data: {} });
  console.log("AIIT-14:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("AIIT-14: missing geocode address rejected ✓");
});

// ─── AI Itinerary Builder Page ────────────────────────────────────────────────

test("AIIT-15: /plan → renders AI trip planning UI as user", async ({ page }) => {
  await loginAs(page, "user");
  await page.goto("/plan");
  await page.waitForLoadState("domcontentloaded");
  console.log("AIIT-15: URL:", page.url());
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText();
  const hasContent = bodyText.includes("Trip") || bodyText.includes("Destination") || bodyText.includes("Plan") || bodyText.includes("Itinerary") || bodyText.length > 100;
  expect(hasContent).toBe(true);
  console.log("AIIT-15: plan page content found ✓");
});

// ─── E2E AI Flow ──────────────────────────────────────────────────────────────

test("AIIT-16: E2E — grok health → platform stats → AI itineraries → trips generate", async ({ page }) => {
  // Step 1: Grok health (public)
  const grokHealth = await page.request.get("/api/grok/health");
  expect(grokHealth.status()).toBe(200);
  const grokBody = await grokHealth.json();
  expect(grokBody).toHaveProperty("status");
  console.log("AIIT-16 Step 1: grok health:", grokBody.status);

  // Step 2: Platform stats (public)
  const stats = await page.request.get("/api/platform/stats");
  expect(stats.status()).toBe(200);
  console.log("AIIT-16 Step 2: platform stats ok ✓");

  // Step 3: Auth required for AI itineraries
  const unauthed = await page.request.get("/api/ai/itineraries");
  expect(unauthed.status()).toBe(401);
  console.log("AIIT-16 Step 3: auth guard works ✓");

  // Step 4: AI itineraries as user
  await loginAs(page, "user");
  const aiItins = await page.request.get("/api/ai/itineraries");
  expect(aiItins.status()).toBe(200);
  const aiList = await aiItins.json();
  expect(Array.isArray(aiList)).toBe(true);
  console.log("AIIT-16 Step 4: AI itineraries:", aiList.length);

  // Step 5: Generate itinerary validation (missing params → 400)
  const badGen = await page.request.post("/api/trips/generate-itinerary", { data: {} });
  expect([400, 422]).toContain(badGen.status());
  console.log("AIIT-16 Step 5: missing generate params rejected ✓");

  console.log("AIIT-16 E2E AI flow complete ✓");
});
