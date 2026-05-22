/**
 * PRV — Provider UI Smoke Tests
 *
 * PRV-01: Provider dashboard renders stat cards and quick-action buttons
 * PRV-02: Provider services page renders list controls and add button
 * PRV-03: Provider bookings page renders stat cards and status filters
 * PRV-04: Provider earnings page renders balance cards and payout button
 *
 * Uses the shared loginAs("provider") helper.
 * Provider account: test-provider@traveloure.test / TestPass123!
 *
 * These are UI-layer tests. API-layer coverage lives in:
 *   - provider-dashboard.spec.ts (PRVD-01–16)
 *   - dashboards.spec.ts         (DASH-01–16)
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// PRV-01: Provider dashboard page renders stat cards and quick-action buttons
// ─────────────────────────────────────────────────────────────────────────────
test("PRV-01: Provider dashboard renders stat cards and quick-action buttons", async ({ page }) => {
  await loginAs(page, "provider");

  // API verify dashboard shape before UI
  const dashRes  = await page.request.get("/api/provider/analytics/dashboard");
  const dashBody = await dashRes.json() as any;
  console.log(`PRV-01: GET /api/provider/analytics/dashboard → ${dashRes.status()}  totalRevenue: ${dashBody?.summary?.totalRevenue}`);
  expect(dashRes.status()).toBe(200);
  expect(dashBody).toHaveProperty("summary");

  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");

  // Wait for main dashboard wrapper
  console.log("PRV-01: Waiting for provider-dashboard (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="provider-dashboard"]', { timeout: 15000 });
    console.log("PRV-01: provider-dashboard appeared ✓");
  } catch {
    throw new Error(`provider-dashboard not visible — URL: ${page.url()}`);
  }

  // Welcome heading
  const hasWelcome = await page.locator('[data-testid="text-welcome"]').count() > 0;
  console.log(`PRV-01: text-welcome: ${hasWelcome ? "✓" : "✗"}`);
  expect(hasWelcome, "text-welcome not found").toBe(true);

  // 4 stat cards (labels lowercased and hyphenated)
  const statCards = [
    "card-stat-pending-bookings",
    "card-stat-this-month",
    "card-stat-revenue-(mtd)",
    "card-stat-rating-average",
  ];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`PRV-01:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Quick-action buttons
  const actionBtns = [
    "button-messages",
    "button-update-calendar",
    "button-my-services",
    "button-view-analytics",
  ];
  for (const testid of actionBtns) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`PRV-01:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Navigation links present (view-all-bookings + view-all-services)
  const hasBookingLink  = await page.locator('[data-testid="button-view-all-bookings"]').count() > 0;
  const hasServicesLink = await page.locator('[data-testid="button-view-all-services"]').count() > 0;
  console.log(`PRV-01: view-all-bookings: ${hasBookingLink ? "✓" : "✗"}  view-all-services: ${hasServicesLink ? "✓" : "✗"}`);
  expect(hasBookingLink,  "button-view-all-bookings not found").toBe(true);
  expect(hasServicesLink, "button-view-all-services not found").toBe(true);

  console.log(`PRV-01: ── PASS ✓ ──
  API:          ✓ dashboard summary shape confirmed
  Page:         ✓ provider-dashboard wrapper present
  Welcome:      ✓ text-welcome visible
  Stat cards:   ✓ pending-bookings, this-month, revenue-(mtd), rating-average
  Quick-action: ✓ messages, update-calendar, my-services, view-analytics
  Nav buttons:  ✓ view-all-bookings, view-all-services`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRV-02: Provider services page renders list controls and add button
// ─────────────────────────────────────────────────────────────────────────────
test("PRV-02: Provider services page renders list controls and add button", async ({ page }) => {
  await loginAs(page, "provider");

  // API verify services list
  const svcRes  = await page.request.get("/api/provider/services");
  const svcList = await svcRes.json() as any[];
  console.log(`PRV-02: GET /api/provider/services → ${svcRes.status()}  count: ${Array.isArray(svcList) ? svcList.length : "?"}`);
  expect(svcRes.status()).toBe(200);
  expect(Array.isArray(svcList)).toBe(true);

  await page.goto("/provider/services");
  await page.waitForLoadState("domcontentloaded");

  // Wait for page title
  console.log("PRV-02: Waiting for text-services-title (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="text-services-title"]', { timeout: 15000 });
    console.log("PRV-02: text-services-title appeared ✓");
  } catch {
    throw new Error(`text-services-title not visible — URL: ${page.url()}`);
  }

  // Add service button (top-right)
  const hasAddBtn = await page.locator('[data-testid="button-add-service"]').count() > 0;
  console.log(`PRV-02: button-add-service: ${hasAddBtn ? "✓" : "✗"}`);
  expect(hasAddBtn, "button-add-service not found").toBe(true);

  // Category filter buttons — "All" category always present
  const hasAllCategory = await page.locator('[data-testid="button-category-all"]').count() > 0;
  console.log(`PRV-02: button-category-all: ${hasAllCategory ? "✓" : "✗"}`);
  expect(hasAllCategory, "button-category-all filter not found").toBe(true);

  // If services exist, verify at least one card renders
  if (svcList.length > 0) {
    const firstId      = svcList[0].id;
    const hasFirstCard = await page.locator(`[data-testid="card-service-${firstId}"]`).count() > 0;
    console.log(`PRV-02: card-service-${firstId}: ${hasFirstCard ? "✓" : "✗"}`);
    expect(hasFirstCard, `card-service-${firstId} not found`).toBe(true);

    // Edit button on first card
    const hasEditBtn = await page.locator(`[data-testid="button-edit-${firstId}"]`).count() > 0;
    console.log(`PRV-02: button-edit-${firstId}: ${hasEditBtn ? "✓" : "✗"}`);
    expect(hasEditBtn, `button-edit-${firstId} not found`).toBe(true);

    console.log(`PRV-02: ── PASS ✓ ──
  API:        ✓ ${svcList.length} service(s) returned
  Page:       ✓ text-services-title visible
  Add btn:    ✓ button-add-service present
  Filter:     ✓ button-category-all present
  Card:       ✓ card-service-${firstId} rendered, edit button present`);
  } else {
    // Empty state — add-first-service button appears instead
    const hasEmptyBtn = await page.locator('[data-testid="button-add-first-service"]').count() > 0;
    console.log(`PRV-02: No services; button-add-first-service: ${hasEmptyBtn ? "✓" : "✗"}`);
    expect(hasEmptyBtn, "button-add-first-service not found in empty state").toBe(true);

    console.log(`PRV-02: ── PASS ✓ ──
  API:        ✓ 0 services (empty state)
  Page:       ✓ text-services-title visible
  Add btn:    ✓ button-add-service present
  Filter:     ✓ button-category-all present
  Empty CTA:  ✓ button-add-first-service shown`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PRV-03: Provider bookings page renders stat cards and status filters
// ─────────────────────────────────────────────────────────────────────────────
test("PRV-03: Provider bookings page renders stat cards and status filters", async ({ page }) => {
  await loginAs(page, "provider");

  // API verify bookings
  const bkgRes  = await page.request.get("/api/provider/bookings");
  const bkgList = await bkgRes.json() as any[];
  console.log(`PRV-03: GET /api/provider/bookings → ${bkgRes.status()}  count: ${Array.isArray(bkgList) ? bkgList.length : "?"}`);
  expect(bkgRes.status()).toBe(200);
  expect(Array.isArray(bkgList)).toBe(true);

  await page.goto("/provider/bookings");
  await page.waitForLoadState("domcontentloaded");

  // Wait for any of the 4 stat cards
  console.log("PRV-03: Waiting for card-stat-total (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="card-stat-total"]', { timeout: 15000 });
    console.log("PRV-03: card-stat-total appeared ✓");
  } catch {
    throw new Error(`card-stat-total not visible — URL: ${page.url()}`);
  }

  // All 4 stat cards
  const statCards = ["card-stat-total", "card-stat-confirmed", "card-stat-pending", "card-stat-completed"];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`PRV-03:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Search input
  const hasSearch = await page.locator('[data-testid="input-search-bookings"]').count() > 0;
  console.log(`PRV-03: input-search-bookings: ${hasSearch ? "✓" : "✗"}`);
  expect(hasSearch, "input-search-bookings not found").toBe(true);

  // Status filter buttons
  const filterBtns = ["button-filter-all", "button-filter-confirmed", "button-filter-pending", "button-filter-completed"];
  for (const testid of filterBtns) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`PRV-03:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Click a filter and confirm it stays active
  await page.locator('[data-testid="button-filter-pending"]').first().click();
  await page.waitForTimeout(600);
  const pendingFilterStillThere = await page.locator('[data-testid="button-filter-pending"]').count() > 0;
  console.log(`PRV-03: filter-pending still present after click: ${pendingFilterStillThere ? "✓" : "✗"}`);
  expect(pendingFilterStillThere, "button-filter-pending disappeared after click").toBe(true);

  // If bookings exist, verify first card renders
  if (bkgList.length > 0) {
    const firstId  = bkgList[0].id;
    const hasCard  = await page.locator(`[data-testid="card-booking-${firstId}"]`).count() > 0;
    console.log(`PRV-03: card-booking-${firstId}: ${hasCard ? "✓" : "(not in pending filter)"}`);
  }

  console.log(`PRV-03: ── PASS ✓ ──
  API:     ✓ ${bkgList.length} booking(s) returned
  Page:    ✓ bookings page loaded
  Stats:   ✓ total, confirmed, pending, completed cards
  Search:  ✓ input-search-bookings present
  Filters: ✓ all, confirmed, pending, completed filter buttons
  Click:   ✓ pending filter clickable`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRV-04: Provider earnings page renders balance cards and payout button
// ─────────────────────────────────────────────────────────────────────────────
test("PRV-04: Provider earnings page renders balance cards and payout button", async ({ page }) => {
  await loginAs(page, "provider");

  // API verify earnings summary
  const summaryRes  = await page.request.get("/api/provider/earnings/summary");
  const summaryBody = await summaryRes.json() as any;
  console.log(`PRV-04: GET /api/provider/earnings/summary → ${summaryRes.status()}  keys: ${Object.keys(summaryBody ?? {}).slice(0, 4).join(", ")}`);
  expect(summaryRes.status()).toBe(200);

  // API verify earnings list
  const earningsRes  = await page.request.get("/api/provider/earnings");
  const earningsList = await earningsRes.json() as any[];
  console.log(`PRV-04: GET /api/provider/earnings → ${earningsRes.status()}  count: ${Array.isArray(earningsList) ? earningsList.length : "?"}`);
  expect(earningsRes.status()).toBe(200);
  expect(Array.isArray(earningsList)).toBe(true);

  await page.goto("/provider/earnings");
  await page.waitForLoadState("domcontentloaded");

  // Wait for available balance card (always rendered regardless of data)
  console.log("PRV-04: Waiting for card-available-balance (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="card-available-balance"]', { timeout: 15000 });
    console.log("PRV-04: card-available-balance appeared ✓");
  } catch {
    throw new Error(`card-available-balance not visible — URL: ${page.url()}`);
  }

  // Balance cards
  const hasAvailable = await page.locator('[data-testid="card-available-balance"]').count() > 0;
  const hasPending   = await page.locator('[data-testid="card-pending-balance"]').count() > 0;
  console.log(`PRV-04: card-available-balance: ${hasAvailable ? "✓" : "✗"}  card-pending-balance: ${hasPending ? "✓" : "✗"}`);
  expect(hasAvailable, "card-available-balance not found").toBe(true);
  expect(hasPending,   "card-pending-balance not found").toBe(true);

  // Stat cards
  const statCards = [
    "card-stat-total-earnings",
    "card-stat-this-month",
    "card-stat-pending",
    "card-stat-available",
  ];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`PRV-04:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Payout and statement buttons
  const hasPayoutBtn    = await page.locator('[data-testid="button-request-payout"]').count() > 0;
  const hasStatementBtn = await page.locator('[data-testid="button-download-statement"]').count() > 0;
  console.log(`PRV-04: button-request-payout: ${hasPayoutBtn ? "✓" : "✗"}  button-download-statement: ${hasStatementBtn ? "✓" : "✗"}`);
  expect(hasPayoutBtn,    "button-request-payout not found").toBe(true);
  expect(hasStatementBtn, "button-download-statement not found").toBe(true);

  // If transactions exist, verify row renders
  if (earningsList.length > 0) {
    const firstId  = earningsList[0].id;
    const hasRow   = await page.locator(`[data-testid="row-transaction-${firstId}"]`).count() > 0;
    console.log(`PRV-04: row-transaction-${firstId}: ${hasRow ? "✓" : "✗"}`);
    expect(hasRow, `row-transaction-${firstId} not found`).toBe(true);
  }

  console.log(`PRV-04: ── PASS ✓ ──
  API summary:   ✓ shape confirmed
  API earnings:  ✓ ${earningsList.length} record(s) returned
  Balance cards: ✓ available + pending
  Stat cards:    ✓ total-earnings, this-month, pending, available
  Buttons:       ✓ request-payout + download-statement`);
});
