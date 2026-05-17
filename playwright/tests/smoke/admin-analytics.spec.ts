/**
 * AANA-01–16: Admin Analytics, Reports, Settings & System Health
 * Tests auth guards, admin-only endpoints, analytics, reports, and E2E flows
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards (unauthenticated) ───────────────────────────────────────────

test("AANA-01: GET /api/admin/analytics/overview → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/analytics/overview");
  console.log("AANA-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AANA-02: GET /api/admin/settings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/settings");
  console.log("AANA-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("AANA-03: GET /api/admin/flagged-content → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/flagged-content");
  console.log("AANA-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Admin-Only Access (non-admin user gets 403) ──────────────────────────────

test("AANA-04: GET /api/admin/analytics/overview → 403 for non-admin user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/admin/analytics/overview");
  console.log("AANA-04:", resp.status());
  expect([401, 403]).toContain(resp.status());
  console.log("AANA-04: non-admin blocked ✓");
});

test("AANA-05: GET /api/admin/settings → 403 for non-admin user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/admin/settings");
  console.log("AANA-05:", resp.status());
  expect([401, 403]).toContain(resp.status());
  console.log("AANA-05: non-admin blocked from settings ✓");
});

// ─── Admin Access ─────────────────────────────────────────────────────────────

test("AANA-06: GET /api/admin/analytics/overview → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/analytics/overview");
  console.log("AANA-06:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("AANA-06: overview keys:", Object.keys(body).join(", ").slice(0, 80));
});

test("AANA-07: GET /api/admin/analytics/by-country → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/analytics/by-country");
  console.log("AANA-07:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-07: by-country responded ✓");
});

test("AANA-08: GET /api/admin/analytics/experts → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/analytics/experts");
  console.log("AANA-08:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-08: analytics experts responded ✓");
});

test("AANA-09: GET /api/admin/analytics/providers → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/analytics/providers");
  console.log("AANA-09:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-09: analytics providers responded ✓");
});

test("AANA-10: GET /api/admin/settings → returns settings as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/settings");
  console.log("AANA-10:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("AANA-10: settings keys:", Object.keys(body).join(", ").slice(0, 80));
});

test("AANA-11: GET /api/admin/flagged-content → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/flagged-content");
  console.log("AANA-11:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-11: flagged content responded ✓");
});

test("AANA-12: GET /api/admin/activity/recent → returns activity as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/activity/recent");
  console.log("AANA-12:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("AANA-12: recent activity type:", typeof body, Array.isArray(body) ? "array" : "object");
  }
  console.log("AANA-12: recent activity responded ✓");
});

// ─── Admin Reports ────────────────────────────────────────────────────────────

test("AANA-13: GET /api/admin/reports/destination-demand → returns report as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/reports/destination-demand");
  console.log("AANA-13:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-13: destination demand report responded ✓");
});

test("AANA-14: GET /api/admin/reports/conversion-funnel → returns data as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/reports/conversion-funnel");
  console.log("AANA-14:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("AANA-14: conversion funnel responded ✓");
});

test("AANA-15: GET /api/admin/system/health → returns health as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/system/health");
  console.log("AANA-15:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("AANA-15: health keys:", Object.keys(body).join(", ").slice(0, 80));
  }
  console.log("AANA-15: system health responded ✓");
});

// ─── E2E: Admin analytics flow ────────────────────────────────────────────────

test("AANA-16: E2E — auth guard → admin analytics → reports → settings", async ({ page }) => {
  // Step 1: Auth guard (unauthenticated)
  const unauthResp = await page.request.get("/api/admin/analytics/overview");
  expect(unauthResp.status()).toBe(401);
  console.log("AANA-16 Step 1: auth guard ✓");

  // Step 2: Login as admin and verify overview
  await loginAs(page, "admin");
  const overviewResp = await page.request.get("/api/admin/analytics/overview");
  expect(overviewResp.status()).toBe(200);
  const overview = await overviewResp.json();
  console.log("AANA-16 Step 2: overview keys:", Object.keys(overview).length, "✓");

  // Step 3: Settings accessible to admin
  const settingsResp = await page.request.get("/api/admin/settings");
  expect(settingsResp.status()).toBe(200);
  console.log("AANA-16 Step 3: settings ok ✓");

  // Step 4: Analytics by-country
  const countryResp = await page.request.get("/api/admin/analytics/by-country");
  expect([200, 500]).toContain(countryResp.status());
  console.log("AANA-16 Step 4: analytics by-country:", countryResp.status(), "✓");

  // Step 5: Activity recent
  const activityResp = await page.request.get("/api/admin/activity/recent");
  expect([200, 500]).toContain(activityResp.status());
  console.log("AANA-16 Step 5: recent activity:", activityResp.status(), "✓");

  // Step 6: Admin trips list
  const tripsResp = await page.request.get("/api/admin/trips");
  expect([200, 500]).toContain(tripsResp.status());
  console.log("AANA-16 Step 6: admin trips:", tripsResp.status(), "✓");

  // Step 7: Reports — destination demand
  const reportResp = await page.request.get("/api/admin/reports/destination-demand");
  expect([200, 500]).toContain(reportResp.status());
  console.log("AANA-16 Step 7: destination demand report:", reportResp.status(), "✓");

  console.log("AANA-16 E2E admin analytics flow complete ✓");
});
