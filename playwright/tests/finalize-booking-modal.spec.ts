/**
 * finalize-booking-modal.spec.ts — the Finalize "how do you want to book it?" chooser.
 *
 * Ratified mock "Adopt the Optimization" → Finalize modal. After an owner adopts/finalizes
 * their plan on the slip, the modal offers Book-it-myself vs Booking agent / Travel expert /
 * Concierge, and routes each to its existing rail. Proves:
 *   1. The modal opens on Adopt Optimization (a fresh finalize), not on bare slip load.
 *   2. All four options render; "Book it myself" is the default lane; the booking-agent option
 *      is disabled when the plan has no partner-bookable stops (§13 — honest, never a dead action).
 *   3. "Book it myself" → Continue routes to /cart.
 *   4. "Travel expert" → Continue creates an expert request (POST /api/expert-requests) and closes.
 *
 * Runs against a local server (BASE_URL, default localhost:5000), self-contained: a freshly
 * registered user creates its own trip via the real API.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

async function registerAndTrip(page: Page): Promise<string> {
  const email = `e2e-finalize-${uid()}@example.com`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: "TestFinalize123!", firstName: "Fin", lastName: "Tester", userType: "user" },
  });
  expect(reg.status(), `register failed: ${await reg.text()}`).toBe(201);
  const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
  const res = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "Kyoto trip", destination: "Kyoto, Japan", startDate: start, endDate: end },
  });
  expect(res.status(), `create trip failed: ${await res.text()}`).toBeLessThan(300);
  const trip = await res.json();
  expect(trip.id).toBeTruthy();
  return trip.id as string;
}

async function openFinalize(page: Page, tripId: string) {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  const adopt = page.getByTestId("slip-action-adopt-optimization");
  await adopt.waitFor({ state: "visible", timeout: 20_000 });
  // The chooser must NOT be open before the click.
  await expect(page.getByTestId("finalize-modal")).toHaveCount(0);
  await adopt.click();
  await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 10_000 });
}

test.describe("Finalize booking chooser", () => {
  test("opens on Adopt, shows four lanes, agent disabled with no partner stops", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    await openFinalize(page, tripId);

    await expect(page.getByTestId("finalize-option-myself")).toBeVisible();
    await expect(page.getByTestId("finalize-option-expert")).toBeVisible();
    await expect(page.getByTestId("finalize-option-concierge")).toBeVisible();
    // A fresh trip has no affiliate stops → the booking-agent lane is present but disabled.
    const agent = page.getByTestId("finalize-option-agent");
    await expect(agent).toBeVisible();
    await expect(agent).toBeDisabled();
    // Default lane is Book-it-myself.
    await expect(page.getByTestId("finalize-option-myself")).toHaveAttribute("aria-pressed", "true");
  });

  test("Book it myself → Continue routes to /cart", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    await openFinalize(page, tripId);
    await page.getByTestId("finalize-option-myself").click();
    await page.getByTestId("finalize-continue").click();
    await expect(page).toHaveURL(/\/cart/, { timeout: 15_000 });
  });

  test("Travel expert → Continue creates an expert request and closes", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    await openFinalize(page, tripId);
    const expertReq = page.waitForResponse(
      (r) => r.url().includes("/api/expert-requests") && r.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByTestId("finalize-option-expert").click();
    await page.getByTestId("finalize-continue").click();
    const res = await expertReq;
    expect(res.status(), `expert-request failed: ${res.status()}`).toBeLessThan(300);
    await expect(page.getByTestId("finalize-modal")).toHaveCount(0, { timeout: 10_000 });
  });
});
