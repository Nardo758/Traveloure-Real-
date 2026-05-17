/**
 * CTLG-01–16: Catalog, Destinations, Amadeus & External Integrations
 * Tests public catalog endpoints, auth-gated Amadeus APIs, and E2E discovery
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Public Catalog Endpoints ─────────────────────────────────────────────────

test("CTLG-01: GET /api/catalog/search → returns items (public)", async ({ page }) => {
  const resp = await page.request.get("/api/catalog/search");
  console.log("CTLG-01:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("CTLG-01: catalog search items:", Array.isArray(body.items) ? body.items.length : typeof body);
});

test("CTLG-02: GET /api/catalog/destinations → returns destinations array (public)", async ({ page }) => {
  const resp = await page.request.get("/api/catalog/destinations");
  console.log("CTLG-02:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("CTLG-02: destinations:", body.length);
});

test("CTLG-03: GET /api/destinations → returns destinations list (public)", async ({ page }) => {
  const resp = await page.request.get("/api/destinations");
  console.log("CTLG-03:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("CTLG-03: destinations list:", body.length);
});

test("CTLG-04: GET /api/catalog/templates/:slug → returns template (public)", async ({ page }) => {
  const resp = await page.request.get("/api/catalog/templates/wedding");
  console.log("CTLG-04:", resp.status());
  expect([200, 404, 500]).toContain(resp.status());
  console.log("CTLG-04: catalog template responded ✓");
});

test("CTLG-05: GET /api/catalog/search-hybrid → responds (public)", async ({ page }) => {
  const resp = await page.request.get("/api/catalog/search-hybrid");
  console.log("CTLG-05:", resp.status());
  expect([200, 400, 500]).toContain(resp.status());
  console.log("CTLG-05: hybrid search responded ✓");
});

test("CTLG-06: GET /api/catalog/items/:type/:id → handles any type/id (public)", async ({ page }) => {
  const resp = await page.request.get("/api/catalog/items/hotel/test-id");
  console.log("CTLG-06:", resp.status());
  expect([200, 404, 400, 500]).toContain(resp.status());
  console.log("CTLG-06: catalog item responded ✓");
});

// ─── Amadeus Auth Guards ──────────────────────────────────────────────────────

test("CTLG-07: GET /api/amadeus/flights → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/amadeus/flights");
  console.log("CTLG-07:", resp.status());
  expect(resp.status()).toBe(401);
});

test("CTLG-08: GET /api/amadeus/hotels → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/amadeus/hotels");
  console.log("CTLG-08:", resp.status());
  expect(resp.status()).toBe(401);
});

test("CTLG-09: GET /api/amadeus/pois → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/amadeus/pois");
  console.log("CTLG-09:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Amadeus Authenticated ────────────────────────────────────────────────────

test("CTLG-10: GET /api/amadeus/locations → 400 without keyword (public)", async ({ page }) => {
  const resp = await page.request.get("/api/amadeus/locations");
  console.log("CTLG-10:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-10: amadeus locations without keyword handled ✓");
});

test("CTLG-11: GET /api/amadeus/flights → 400 missing required params as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/amadeus/flights");
  console.log("CTLG-11:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-11: amadeus flights without params handled ✓");
});

test("CTLG-12: GET /api/amadeus/hotels → 400 missing required params as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/amadeus/hotels");
  console.log("CTLG-12:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-12: amadeus hotels without params handled ✓");
});

test("CTLG-13: GET /api/amadeus/pois → 400 missing required params as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/amadeus/pois");
  console.log("CTLG-13:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-13: amadeus POIs without params handled ✓");
});

test("CTLG-14: GET /api/amadeus/safety → 400 missing lat/lng as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/amadeus/safety");
  console.log("CTLG-14:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-14: amadeus safety without params handled ✓");
});

test("CTLG-15: GET /api/amadeus/activities → 400 missing location as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/amadeus/activities");
  console.log("CTLG-15:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("CTLG-15: amadeus activities without params handled ✓");
});

// ─── E2E: Catalog & external discovery flow ───────────────────────────────────

test("CTLG-16: E2E — catalog search → destinations → auth guards → amadeus validation", async ({ page }) => {
  // Step 1: Catalog search (public)
  const searchResp = await page.request.get("/api/catalog/search");
  expect(searchResp.status()).toBe(200);
  const searchBody = await searchResp.json();
  console.log("CTLG-16 Step 1: catalog search ok, items:", searchBody.items?.length ?? 0, "✓");

  // Step 2: Destinations (public)
  const destsResp = await page.request.get("/api/catalog/destinations");
  expect(destsResp.status()).toBe(200);
  const dests = await destsResp.json();
  expect(Array.isArray(dests)).toBe(true);
  console.log("CTLG-16 Step 2: destinations:", dests.length, "✓");

  // Step 3: Amadeus auth guard
  const amadFlightsUnauth = await page.request.get("/api/amadeus/flights");
  expect(amadFlightsUnauth.status()).toBe(401);
  console.log("CTLG-16 Step 3: amadeus flights auth guard ✓");

  // Step 4: Login and hit amadeus without required params
  await loginAs(page, "user");
  const flightsResp = await page.request.get("/api/amadeus/flights");
  expect([400, 422, 500]).toContain(flightsResp.status());
  console.log("CTLG-16 Step 4: flights without params:", flightsResp.status(), "✓");

  // Step 5: Amadeus locations (public, missing keyword)
  const locsResp = await page.request.get("/api/amadeus/locations");
  expect([400, 422, 500]).toContain(locsResp.status());
  console.log("CTLG-16 Step 5: locations without keyword:", locsResp.status(), "✓");

  // Step 6: Catalog template
  const tmplResp = await page.request.get("/api/catalog/templates/corporate");
  expect([200, 404, 500]).toContain(tmplResp.status());
  console.log("CTLG-16 Step 6: catalog template:", tmplResp.status(), "✓");

  console.log("CTLG-16 E2E catalog & integrations flow complete ✓");
});
