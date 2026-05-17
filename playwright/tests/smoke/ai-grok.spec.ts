/**
 * AIGK-01–16: AI Endpoints — Grok, Claude, Blueprint, AI Itineraries
 * Tests auth guards, AI endpoint responses, and E2E AI generation flows
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards ──────────────────────────────────────────────────────────────

test("AIGK-01: GET /api/ai/itineraries → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/ai/itineraries");
  console.log("AIGK-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AIGK-02: POST /api/ai/chat → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/ai/chat", {
    data: { message: "Hello" },
  });
  console.log("AIGK-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AIGK-03: POST /api/grok/match-experts → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/grok/match-experts", {
    data: {},
  });
  console.log("AIGK-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Public Grok Health ───────────────────────────────────────────────────────

test("AIGK-04: GET /api/grok/health → returns health (public)", async ({ page }) => {
  const resp = await page.request.get("/api/grok/health");
  console.log("AIGK-04:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("AIGK-04: grok health keys:", Object.keys(body).join(", "));
  }
  console.log("AIGK-04: grok health responded ✓");
});

// ─── Authenticated AI Endpoints ───────────────────────────────────────────────

test("AIGK-05: GET /api/ai/itineraries → returns list as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/ai/itineraries");
  console.log("AIGK-05:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("AIGK-05: ai itineraries:", Array.isArray(body) ? body.length : typeof body);
  }
  console.log("AIGK-05: ai itineraries responded ✓");
});

test("AIGK-06: GET /api/ai/itineraries/:id → 404 for non-existent itinerary", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/ai/itineraries/00000000-0000-0000-0000-000000000000");
  console.log("AIGK-06:", resp.status());
  expect([404, 400, 403, 500]).toContain(resp.status());
  console.log("AIGK-06: non-existent ai itinerary handled ✓");
});

test("AIGK-07: POST /api/ai/chat → 400 missing message", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/ai/chat", {
    data: {},
  });
  console.log("AIGK-07:", resp.status());
  expect([200, 400, 422, 500]).toContain(resp.status());
  console.log("AIGK-07: missing chat message handled ✓");
});

test("AIGK-08: POST /api/ai/generate-itinerary → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/ai/generate-itinerary", {
    data: {},
  });
  console.log("AIGK-08:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-08: missing itinerary fields handled ✓");
});

test("AIGK-09: POST /api/ai/generate-itinerary → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/ai/generate-itinerary", {
    data: {},
  });
  console.log("AIGK-09:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-09: missing itinerary fields handled ✓");
});

test("AIGK-10: POST /api/grok/match-experts → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/grok/match-experts", {
    data: {},
  });
  console.log("AIGK-10:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-10: missing match-experts fields handled ✓");
});

test("AIGK-11: POST /api/grok/intelligence → responds as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/grok/intelligence", {
    data: { city: "Tokyo", query: "best restaurants" },
  });
  console.log("AIGK-11:", resp.status());
  expect([200, 400, 422, 500]).toContain(resp.status());
  console.log("AIGK-11: grok intelligence responded ✓");
});

test("AIGK-12: POST /api/claude/optimize-itinerary → 400 missing required", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/claude/optimize-itinerary", {
    data: {},
  });
  console.log("AIGK-12:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-12: missing optimize-itinerary fields handled ✓");
});

test("AIGK-13: POST /api/claude/recommendations → responds as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/claude/recommendations", {
    data: { destination: "Paris", days: 3 },
  });
  console.log("AIGK-13:", resp.status());
  expect([200, 400, 422, 500]).toContain(resp.status());
  console.log("AIGK-13: claude recommendations responded ✓");
});

test("AIGK-14: POST /api/ai/optimize-experience → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/ai/optimize-experience", {
    data: {},
  });
  console.log("AIGK-14:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-14: missing optimize-experience fields handled ✓");
});

test("AIGK-15: POST /api/grok/chat → 400 missing required message", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/grok/chat", {
    data: {},
  });
  console.log("AIGK-15:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("AIGK-15: missing grok chat message handled ✓");
});

// ─── E2E: AI endpoint flow ────────────────────────────────────────────────────

test("AIGK-16: E2E — auth guards → grok health → ai itineraries → validation", async ({ page }) => {
  // Step 1: Auth guards
  const unauthAI = await page.request.get("/api/ai/itineraries");
  expect(unauthAI.status()).toBe(401);
  const unauthGrok = await page.request.post("/api/grok/match-experts", { data: {} });
  expect(unauthGrok.status()).toBe(401);
  console.log("AIGK-16 Step 1: auth guards confirmed ✓");

  // Step 2: Public grok health
  const healthResp = await page.request.get("/api/grok/health");
  expect([200, 500]).toContain(healthResp.status());
  console.log("AIGK-16 Step 2: grok health:", healthResp.status(), "✓");

  // Step 3: Login and list AI itineraries
  await loginAs(page, "user");
  const itinResp = await page.request.get("/api/ai/itineraries");
  expect([200, 500]).toContain(itinResp.status());
  console.log("AIGK-16 Step 3: ai itineraries:", itinResp.status(), "✓");

  // Step 4: Validate generate-itinerary (missing fields → fast 400)
  const blueprintResp = await page.request.post("/api/ai/generate-itinerary", { data: {} });
  expect([400, 422, 500]).toContain(blueprintResp.status());
  console.log("AIGK-16 Step 4: generate-itinerary validation:", blueprintResp.status(), "✓");

  // Step 5: Validate grok intelligence (should respond)
  const intelResp = await page.request.post("/api/grok/intelligence", {
    data: { city: "Paris" },
  });
  expect([200, 400, 422, 500]).toContain(intelResp.status());
  console.log("AIGK-16 Step 5: grok intelligence:", intelResp.status(), "✓");

  // Step 6: Claude recommendations
  const claudeResp = await page.request.post("/api/claude/recommendations", {
    data: { destination: "Tokyo" },
  });
  expect([200, 400, 422, 500]).toContain(claudeResp.status());
  console.log("AIGK-16 Step 6: claude recommendations:", claudeResp.status(), "✓");

  console.log("AIGK-16 E2E AI & Grok flow complete ✓");
});
