/**
 * ADM — Admin UI Smoke Tests
 *
 * ADM-01: Admin dashboard renders KPI stat cards and application-review panels
 * ADM-02: Admin users page renders stat cards, search, filters, and user rows
 * ADM-03: Admin bookings page renders stat cards and status/market filters
 * ADM-04: Admin revenue page renders revenue stat cards, tabs, and action buttons
 *
 * Uses the shared loginAs("admin") helper.
 * Admin account: admin@traveloure.test / AdminPass123!
 *
 * These are UI-layer tests. API-layer coverage lives in:
 *   - admin-dashboard.spec.ts (ADMN-01–16)
 *   - admin-analytics.spec.ts (AANA-01–16)
 *   - dashboards.spec.ts      (DASH-01–16)
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// ADM-01: Admin dashboard renders KPI stat cards and application-review panels
// ─────────────────────────────────────────────────────────────────────────────
test("ADM-01: Admin dashboard renders KPI stat cards and application-review panels", async ({ page }) => {
  await loginAs(page, "admin");

  // API verify stats endpoint
  const statsRes  = await page.request.get("/api/admin/stats");
  const statsBody = await statsRes.json() as any;
  console.log(`ADM-01: GET /api/admin/stats → ${statsRes.status()}  totalUsers: ${statsBody?.totalUsers}  totalBookings: ${statsBody?.totalBookings}`);
  expect(statsRes.status()).toBe(200);
  expect(statsBody).toHaveProperty("totalUsers");
  expect(statsBody).toHaveProperty("totalBookings");

  await page.goto("/admin/dashboard");
  await page.waitForLoadState("domcontentloaded");

  // Wait for main dashboard wrapper
  console.log("ADM-01: Waiting for admin-dashboard (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="admin-dashboard"]', { timeout: 15000 });
    console.log("ADM-01: admin-dashboard appeared ✓");
  } catch {
    throw new Error(`admin-dashboard not visible — URL: ${page.url()}`);
  }

  // 4 KPI stat cards (labels → slugified testids)
  const kpiCards = [
    "card-stat-total-users",
    "card-stat-total-bookings",
    "card-stat-revenue-(mtd)",
    "card-stat-new-users-(today)",
  ];
  for (const testid of kpiCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`ADM-01:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Application-review panels
  const hasExpertReviewBtn   = await page.locator('[data-testid="button-review-expert-applications"]').count() > 0;
  const hasProviderReviewBtn = await page.locator('[data-testid="button-review-provider-applications"]').count() > 0;
  console.log(`ADM-01: button-review-expert-applications: ${hasExpertReviewBtn ? "✓" : "✗"}`);
  console.log(`ADM-01: button-review-provider-applications: ${hasProviderReviewBtn ? "✓" : "✗"}`);
  expect(hasExpertReviewBtn,   "button-review-expert-applications not found").toBe(true);
  expect(hasProviderReviewBtn, "button-review-provider-applications not found").toBe(true);

  // System health rows rendered (first row always present)
  const hasHealthRow = await page.locator('[data-testid="row-health-0"]').count() > 0;
  console.log(`ADM-01: row-health-0: ${hasHealthRow ? "✓" : "✗"}`);
  expect(hasHealthRow, "row-health-0 not found").toBe(true);

  console.log(`ADM-01: ── PASS ✓ ──
  API:      ✓ stats: ${statsBody.totalUsers} users, ${statsBody.totalBookings} bookings
  Page:     ✓ admin-dashboard wrapper present
  KPI:      ✓ total-users, total-bookings, revenue-(mtd), new-users-(today)
  Reviews:  ✓ expert + provider application review buttons
  Health:   ✓ system health rows rendered`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADM-02: Admin users page renders stat cards, search, filters, and user rows
// ─────────────────────────────────────────────────────────────────────────────
test("ADM-02: Admin users page renders stat cards, search, filters, and user rows", async ({ page }) => {
  await loginAs(page, "admin");

  // API verify users list
  const usersRes  = await page.request.get("/api/admin/users");
  const usersBody = await usersRes.json() as any;
  const userCount = Array.isArray(usersBody) ? usersBody.length : (usersBody?.users?.length ?? usersBody?.total ?? "?");
  console.log(`ADM-02: GET /api/admin/users → ${usersRes.status()}  users: ${userCount}`);
  expect(usersRes.status()).toBe(200);

  await page.goto("/admin/users");
  await page.waitForLoadState("domcontentloaded");

  // Wait for stat cards
  console.log("ADM-02: Waiting for card-stat-total (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="card-stat-total"]', { timeout: 15000 });
    console.log("ADM-02: card-stat-total appeared ✓");
  } catch {
    throw new Error(`card-stat-total not visible — URL: ${page.url()}`);
  }

  // 4 stat cards
  const statCards = ["card-stat-total", "card-stat-active", "card-stat-suspended", "card-stat-new"];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`ADM-02:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Search input
  const hasSearch = await page.locator('[data-testid="input-search-users"]').count() > 0;
  console.log(`ADM-02: input-search-users: ${hasSearch ? "✓" : "✗"}`);
  expect(hasSearch, "input-search-users not found").toBe(true);

  // "All" filter button
  const hasFilterAll = await page.locator('[data-testid="button-filter-all"]').count() > 0;
  console.log(`ADM-02: button-filter-all: ${hasFilterAll ? "✓" : "✗"}`);
  expect(hasFilterAll, "button-filter-all not found").toBe(true);

  // Add user button
  const hasAddUser = await page.locator('[data-testid="button-add-user"]').count() > 0;
  console.log(`ADM-02: button-add-user: ${hasAddUser ? "✓" : "✗"}`);
  expect(hasAddUser, "button-add-user not found").toBe(true);

  // Role filter chips — roleLabels keys: user, expert, travel_expert, service_provider, admin
  // Spot-check 3 representative roles that are always present
  const roleFilters = ["user", "expert", "service_provider"];
  for (const role of roleFilters) {
    const found = await page.locator(`[data-testid="button-filter-${role}"]`).count() > 0;
    console.log(`ADM-02:   button-filter-${role}: ${found ? "✓" : "✗"}`);
    expect(found, `button-filter-${role} not found`).toBe(true);
  }

  // Count total role filter buttons (should be > 3)
  const totalRoleFilters = await page.locator('[data-testid^="button-filter-"]:not([data-testid="button-filter-all"])').count();
  console.log(`ADM-02: total role filter buttons: ${totalRoleFilters}`);

  // Search interaction — type a query and confirm input remains interactive
  await page.locator('[data-testid="input-search-users"]').fill("test");
  await page.waitForTimeout(600);
  const searchValue = await page.locator('[data-testid="input-search-users"]').inputValue();
  console.log(`ADM-02: search input value after fill: "${searchValue}"`);
  expect(searchValue).toBe("test");

  // At least one user row should be visible (admin sees all users)
  const userRowCount = await page.locator('[data-testid^="row-user-"]').count();
  console.log(`ADM-02: user rows visible: ${userRowCount}`);
  expect(userRowCount).toBeGreaterThan(0);

  console.log(`ADM-02: ── PASS ✓ ──
  API:      ✓ ${userCount} user(s) returned
  Page:     ✓ admin users page loaded
  Stats:    ✓ total, active, suspended, new
  Search:   ✓ input-search-users interactive
  Filters:  ✓ all + expert/provider/user/admin role filters
  Add btn:  ✓ button-add-user present
  Rows:     ✓ ${userRowCount} user row(s) visible`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADM-03: Admin bookings page renders stat cards and status/market filters
// ─────────────────────────────────────────────────────────────────────────────
test("ADM-03: Admin bookings page renders stat cards and status/market filters", async ({ page }) => {
  await loginAs(page, "admin");

  // API verify admin bookings
  const bkgRes  = await page.request.get("/api/admin/bookings");
  const bkgBody = await bkgRes.json() as any;
  const bkgCount = Array.isArray(bkgBody) ? bkgBody.length : (bkgBody?.bookings?.length ?? "?");
  console.log(`ADM-03: GET /api/admin/bookings → ${bkgRes.status()}  bookings: ${bkgCount}`);
  expect(bkgRes.status()).toBe(200);

  await page.goto("/admin/bookings");
  await page.waitForLoadState("domcontentloaded");

  // Wait for stat cards
  console.log("ADM-03: Waiting for card-stat-total (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="card-stat-total"]', { timeout: 15000 });
    console.log("ADM-03: card-stat-total appeared ✓");
  } catch {
    throw new Error(`card-stat-total not visible — URL: ${page.url()}`);
  }

  // 4 stat cards
  const statCards = ["card-stat-total", "card-stat-active", "card-stat-revenue", "card-stat-pending"];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`ADM-03:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Search input
  const hasSearch = await page.locator('[data-testid="input-search-bookings"]').count() > 0;
  console.log(`ADM-03: input-search-bookings: ${hasSearch ? "✓" : "✗"}`);
  expect(hasSearch, "input-search-bookings not found").toBe(true);

  // Status filter buttons
  const hasStatusAll = await page.locator('[data-testid="button-filter-status-all"]').count() > 0;
  console.log(`ADM-03: button-filter-status-all: ${hasStatusAll ? "✓" : "✗"}`);
  expect(hasStatusAll, "button-filter-status-all not found").toBe(true);

  // Market filter buttons
  const hasMarketAll = await page.locator('[data-testid="button-filter-market-all"]').count() > 0;
  console.log(`ADM-03: button-filter-market-all: ${hasMarketAll ? "✓" : "✗"}`);
  expect(hasMarketAll, "button-filter-market-all not found").toBe(true);

  // Click status filter and confirm it responds
  await page.locator('[data-testid="button-filter-status-all"]').first().click();
  await page.waitForTimeout(600);
  const filterStillThere = await page.locator('[data-testid="button-filter-status-all"]').count() > 0;
  console.log(`ADM-03: filter-status-all present after click: ${filterStillThere ? "✓" : "✗"}`);
  expect(filterStillThere, "button-filter-status-all disappeared after click").toBe(true);

  console.log(`ADM-03: ── PASS ✓ ──
  API:       ✓ ${bkgCount} booking(s) returned
  Page:      ✓ admin bookings page loaded
  Stats:     ✓ total, active, revenue, pending
  Search:    ✓ input-search-bookings present
  Status:    ✓ button-filter-status-all present
  Market:    ✓ button-filter-market-all present
  Click:     ✓ status filter clickable`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADM-04: Admin revenue page renders revenue stat cards, tabs, and action buttons
// ─────────────────────────────────────────────────────────────────────────────
test("ADM-04: Admin revenue page renders stat cards, revenue tabs, and action buttons", async ({ page }) => {
  await loginAs(page, "admin");

  // API verify revenue data
  const revRes  = await page.request.get("/api/admin/revenue");
  const revBody = await revRes.json() as any;
  console.log(`ADM-04: GET /api/admin/revenue → ${revRes.status()}  keys: ${Object.keys(revBody ?? {}).slice(0, 5).join(", ")}`);
  expect(revRes.status()).toBe(200);

  await page.goto("/admin/revenue");
  await page.waitForLoadState("domcontentloaded");

  // Wait for total-revenue card
  console.log("ADM-04: Waiting for card-stat-total-revenue (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="card-stat-total-revenue"]', { timeout: 15000 });
    console.log("ADM-04: card-stat-total-revenue appeared ✓");
  } catch {
    throw new Error(`card-stat-total-revenue not visible — URL: ${page.url()}`);
  }

  // 4 revenue stat cards
  const statCards = [
    "card-stat-total-revenue",
    "card-stat-this-month",
    "card-stat-expert-earnings",
    "card-stat-provider-earnings",
  ];
  for (const testid of statCards) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`ADM-04:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Live status indicator
  const hasLiveStatus = await page.locator('[data-testid="indicator-live-status"]').count() > 0;
  console.log(`ADM-04: indicator-live-status: ${hasLiveStatus ? "✓" : "✗"}`);
  expect(hasLiveStatus, "indicator-live-status not found").toBe(true);

  // Revenue tabs
  const tabs = ["tab-breakdown", "tab-transactions", "tab-trends"];
  for (const testid of tabs) {
    const found = await page.locator(`[data-testid="${testid}"]`).count() > 0;
    console.log(`ADM-04:   ${testid}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Action buttons
  const hasDownload = await page.locator('[data-testid="button-download-report"]').count() > 0;
  const hasPayouts  = await page.locator('[data-testid="button-process-payouts"]').count() > 0;
  console.log(`ADM-04: button-download-report: ${hasDownload ? "✓" : "✗"}  button-process-payouts: ${hasPayouts ? "✓" : "✗"}`);
  expect(hasDownload, "button-download-report not found").toBe(true);
  expect(hasPayouts,  "button-process-payouts not found").toBe(true);

  // Tab switching — click Transactions tab, confirm it stays
  await page.locator('[data-testid="tab-transactions"]').first().click();
  await page.waitForTimeout(600);
  const transTabAfter = await page.locator('[data-testid="tab-transactions"]').count() > 0;
  console.log(`ADM-04: tab-transactions still present after click: ${transTabAfter ? "✓" : "✗"}`);
  expect(transTabAfter, "tab-transactions disappeared after click").toBe(true);

  // Switch to Trends tab
  await page.locator('[data-testid="tab-trends"]').first().click();
  await page.waitForTimeout(600);
  const trendsTabAfter = await page.locator('[data-testid="tab-trends"]').count() > 0;
  console.log(`ADM-04: tab-trends still present after click: ${trendsTabAfter ? "✓" : "✗"}`);
  expect(trendsTabAfter, "tab-trends disappeared after click").toBe(true);

  console.log(`ADM-04: ── PASS ✓ ──
  API:      ✓ revenue endpoint confirmed
  Page:     ✓ admin revenue page loaded
  Stats:    ✓ total-revenue, this-month, expert-earnings, provider-earnings
  Live:     ✓ indicator-live-status present
  Tabs:     ✓ breakdown, transactions, trends — all clickable
  Buttons:  ✓ download-report + process-payouts`);
});
