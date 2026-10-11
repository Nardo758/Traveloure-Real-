import { test, expect } from "@playwright/test";
import { requireBaseUrl } from "../fixtures/base-url";

test.describe("Stage 7 — Orphan Cleanup & Redirects", () => {
  test("Dev-only routes are not accessible in production", async ({ page }) => {
    const BASE = requireBaseUrl();

    // `/booking-demo` was REMOVED from App.tsx entirely by punchlist D-12 (ledger
    // `2026-09-15-d12-service-bookings-canonical`) — the page was the legacy `bookings` rail's
    // demo consumer and went with it. It is not listed here because it is no longer a route at
    // all: an absent route renders the SPA 404 rather than redirecting home, so asserting the
    // redirect would assert something that is no longer true of it (§13).
    const devRoutes = ["/landing-mockups", "/architecture", "/layout-mock"];

    for (const route of devRoutes) {
      await page.goto(`${BASE}${route}`);
      // In production, these should redirect to home or 404
      await page.waitForURL(`${BASE}/`, { timeout: 5000 });
      await expect(page).toHaveURL(`${BASE}/`);
    }
  });

});
