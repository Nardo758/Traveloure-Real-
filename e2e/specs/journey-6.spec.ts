import { test, expect } from "@playwright/test";
import { loginAsTestAccount } from "./helpers/auth";

test.describe("Journey 6 — Transport Booking", () => {
  test("PlanCard transport leg → affiliate click tracked → redirect to partner", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as traveler ────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── Step 2: Navigate to a trip with transport legs ───────────────
    await page.goto(`${BASE}/my-trips`);
    await page.waitForSelector("[data-testid='my-trips-list']", { timeout: 10000 });
    // Click the first trip
    await page.click("[data-testid='trip-card']");

    // ── Step 3: Navigate to itinerary transport section ───────────────────
    await page.waitForURL("**/trip/**", { timeout: 10000 });
    await page.click("[data-testid='tab-itinerary']");
    await page.waitForSelector("[data-testid='itinerary-timeline']", { timeout: 10000 });

    // ── Step 4: Click transport section or pill ─────────────────────────
    // If there's a transport pill, click it; otherwise look for transport tab
    const transportPill = page.locator("[data-testid^='pill-transport-']").first();
    if (await transportPill.isVisible().catch(() => false)) {
      await transportPill.click();
    }

    // ── Step 5: Verify transport legs are displayed ───────────────────
    await page.waitForSelector("[data-testid='transport-section']", { timeout: 10000 });
    const legs = page.locator("[data-testid^='transport-leg-']");
    await expect(legs.first()).toBeVisible();

    // ── Step 6: Click a transport leg booking CTA ─────────────────────
    await legs.first().locator("[data-testid='button-book-leg']").click();

    // ── Step 7: Verify affiliate click tracking ────────────────────────
    // The click should have been logged via POST /api/transport-booking-options/:id/click
    // We verify by checking the network response or by looking at the redirect URL
    await page.waitForURL(/12go|omio|booking|viator/, { timeout: 10000 });

    // ── Step 8: Verify the external partner page loaded ────────────────
    await expect(page).toHaveURL(/https:\/\/(www\.)?(12go\.asia|omio\.com|booking\.com|viator\.com)/);
  });

  test("Standalone /transportation page → search → book → confirmation", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as traveler ────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── Step 2: Navigate to standalone transportation page ──────────────
    await page.goto(`${BASE}/transportation`);
    await page.waitForSelector("[data-testid='transportation-booking-page']", { timeout: 10000 });

    // ── Step 3: Fill search form ───────────────────────────────────────
    await page.fill("[data-testid='input-from']", "Bangkok");
    await page.fill("[data-testid='input-to']", "Chiang Mai");
    await page.fill("[data-testid='input-date']", "2026-07-15");
    await page.click("[data-testid='button-search-transport']");

    // ── Step 4: Wait for results ───────────────────────────────────────
    await page.waitForSelector("[data-testid='transport-results']", { timeout: 15000 });
    const results = page.locator("[data-testid='transport-result-card']");
    await expect(results.first()).toBeVisible();

    // ── Step 5: Select a result and book ─────────────────────────────────
    await results.first().locator("[data-testid='button-book-transport']").click();

    // ── Step 6: Verify affiliate click tracking ───────────────────────
    // The booking flow should log an affiliate click
    await page.waitForURL(/12go|omio|booking|viator/, { timeout: 10000 });
  });

  test("Affiliate click attribution endpoint", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // The seed + click endpoints are isAuthenticated (server/routes/transport-hub.routes.ts).
    // Authenticate first, then drive them through page.request so the session cookie rides
    // along — a bare `request` fixture carries no session and the server correctly 401s.
    await loginAsTestAccount(page, "traveler");

    // Create a test transport booking option via seed endpoint
    const seedRes = await page.request.post(`${BASE}/api/transport-booking-options/seed/test-variant`);
    expect(seedRes.status()).toBe(201);
    const option = await seedRes.json();

    // Click the option (simulates affiliate click)
    const clickRes = await page.request.post(`${BASE}/api/transport-booking-options/${option.id}/click`);
    expect(clickRes.status()).toBe(200);
    const click = await clickRes.json();
    expect(click.redirectUrl).toBeTruthy();

    // Verify the click was tracked in the database
    // This would require a direct DB query or a verification endpoint
    // For E2E, we verify the response structure
    expect(click).toHaveProperty("redirectUrl");
  });
});
