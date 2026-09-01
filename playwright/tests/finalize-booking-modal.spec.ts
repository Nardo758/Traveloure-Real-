/**
 * finalize-booking-modal.spec.ts — live coverage for the Finalize Plan seam.
 *
 * This intentionally uses the current Finalize Plan control, not the retired
 * Adopt Optimization selector. Each test creates its own traveler and trip through
 * the application API; lifecycle state is observed with read-only SELECTs while all
 * mutations go through supported application routes.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, rows } from "./journeys/_journey-helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);
const AUDIT_DIR = resolve("playwright-report/slip-finalize-audit");
mkdirSync(AUDIT_DIR, { recursive: true });

type FinalState = {
  finalized_at: string | null;
  final_count: number;
  final_version: number | null;
  final_hashes: Array<{ version: number; content_hash: string }>;
  transition_types: string[];
};

async function registerAndTrip(page: Page): Promise<string> {
  const email = `e2e-finalize-${uid()}@example.com`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: "TestFinalize123!", firstName: "Fin", lastName: "Tester", userType: "user" },
  });
  expect(reg.status(), `register failed: ${await reg.text()}`).toBe(201);
  const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
  const res = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "Finalize seam trip", destination: "Kyoto, Japan", startDate: start, endDate: end },
  });
  expect(res.status(), `create trip failed: ${await res.text()}`).toBe(201);
  const trip = await res.json();
  expect(trip.id).toBeTruthy();
  return trip.id as string;
}

async function addAndStageItem(page: Page, tripId: string): Promise<string> {
  const itemRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Nishiki Market walk", dayNumber: 1, estimatedCost: "45.00" },
  });
  expect(itemRes.status(), `create item failed: ${await itemRes.text()}`).toBe(201);
  const itemId = (await itemRes.json()).id as string;
  const routeRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
    data: { to: "ready_for_checkout" },
  });
  expect(routeRes.status(), `route item failed: ${await routeRes.text()}`).toBe(200);
  return itemId;
}

async function finalState(tripId: string): Promise<FinalState> {
  const [state] = await rows<FinalState>(
    `SELECT
       t.finalized_at,
       (SELECT count(*)::int FROM trip_finals WHERE trip_id = t.id) AS final_count,
       (SELECT max(version)::int FROM trip_finals WHERE trip_id = t.id) AS final_version,
       (SELECT coalesce(json_agg(json_build_object('version', version, 'content_hash', content_hash)
                                  ORDER BY version), '[]'::json)
          FROM trip_finals WHERE trip_id = t.id) AS final_hashes,
       (SELECT coalesce(array_agg(event_type ORDER BY created_at DESC), ARRAY[]::text[])
          FROM item_transition_log WHERE trip_id = t.id) AS transition_types
     FROM trips t
     WHERE t.id = $1`,
    [tripId],
  );
  expect(state, `trip ${tripId} should exist in the dev database`).toBeTruthy();
  return state;
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${AUDIT_DIR}/${name}.png`, fullPage: true });
}

async function openFinalize(page: Page, tripId: string) {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  const finalize = page.getByTestId("slip-action-finalize-plan");
  await finalize.waitFor({ state: "visible", timeout: 20_000 });
  // Finalize is one press → one chooser. The chooser and retired pre-gate must both be absent first.
  await expect(page.getByTestId("finalize-modal")).toHaveCount(0);
  await expect(page.locator('[data-testid="confirm-finalize-unbooked"]')).toHaveCount(0);
  return finalize;
}

test.afterAll(async () => {
  await closePool();
});

test.describe("Finalize booking chooser", () => {
  test("walks Finalize Plan through chooser, lifecycle, Trip Card, and self-booking", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    const itemId = await addAndStageItem(page, tripId);
    const before = await finalState(tripId);
    expect(before.finalized_at).toBeNull();
    expect(before.final_count).toBe(0);
    await capture(page, "01-pre-final");

    const finalize = await openFinalize(page, tripId);
    await expect(page.getByTestId(`slip-item-${itemId}`)).toContainText("Nishiki Market walk");
    await capture(page, "02-pre-final-ui");

    let finalizeRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === `/api/trips/${tripId}/finalize`) finalizeRequests += 1;
    });
    const finalizeResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/api/trips/${tripId}/finalize`) && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await finalize.click();
    const response = await finalizeResponse;
    expect(response.status(), `finalize failed: ${await response.text()}`).toBe(200);
    await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 10_000 });
    expect(finalizeRequests, "one Finalize Plan click must make one finalize request").toBe(1);

    const afterFinalize = await finalState(tripId);
    expect(afterFinalize.finalized_at).not.toBeNull();
    expect(afterFinalize.final_count).toBe(1);
    expect(afterFinalize.final_version).toBe(1);
    expect(afterFinalize.final_hashes).toHaveLength(1);
    expect(afterFinalize.final_hashes[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(afterFinalize.transition_types).toContain("plan_finalized");
    await expect(page.getByTestId("finalize-staged-unbooked-note")).toContainText("1 stop is in checkout but not booked yet");
    await expect(page.getByTestId("finalize-option-myself")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("finalize-option-myself")).toContainText("Book it myself");
    await expect(page.getByTestId("finalize-option-agent")).toBeVisible();
    await expect(page.getByTestId("finalize-option-agent")).toBeDisabled();
    await expect(page.getByTestId("finalize-option-agent")).toContainText("No partner-bookable stops in this plan");
    await expect(page.getByTestId("finalize-option-expert")).toContainText("Travel expert");
    await expect(page.getByTestId("finalize-option-concierge")).toContainText("Concierge");
    await expect(page.getByTestId("finalize-modal")).toContainText("gives them access");
    await expect(page.getByTestId("finalize-modal")).not.toContainText("hands them a copy");
    await capture(page, "03-chooser-after-commit");

    await page.getByTestId("finalize-back").click();
    await expect(page.getByTestId("finalize-modal")).toHaveCount(0);
    await expect(page.getByTestId("slip-trip-card-primary-banner")).toBeVisible();
    await expect(page.getByTestId("slip-final-version-chip")).toHaveText("v1");
    await capture(page, "04-back-ready-banner");

    // Reopen is an application mutation, not a direct lifecycle-table edit.
    const reopenResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/api/trips/${tripId}/reopen`) && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByTestId("slip-action-reopen").click();
    expect((await reopenResponse).status()).toBe(200);
    await expect(page.getByTestId("slip-action-finalize-plan")).toBeVisible({ timeout: 10_000 });
    expect((await finalState(tripId)).finalized_at).toBeNull();
    await capture(page, "05-reopened");

    // Re-finalizing an unchanged plan flips the render signal but must not create v2 or reopen the chooser.
    const unchangedResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/api/trips/${tripId}/finalize`) && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByTestId("slip-action-finalize-plan").click();
    expect((await unchangedResponse).status()).toBe(200);
    await expect(page.getByTestId("finalize-modal")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(/No changes since v1/)).toBeVisible();
    const unchanged = await finalState(tripId);
    expect(unchanged.final_count).toBe(1);
    expect(unchanged.final_version).toBe(1);
    expect(unchanged.final_hashes[0].content_hash).toBe(afterFinalize.final_hashes[0].content_hash);
    await capture(page, "06-unchanged-refinal");

    await page.getByTestId("slip-action-reopen").click();
    await expect(page.getByTestId("slip-action-finalize-plan")).toBeVisible({ timeout: 10_000 });
    const editResponse = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      data: { title: "Nishiki Market walk — revised" },
    });
    expect(editResponse.status(), `edit item failed: ${await editResponse.text()}`).toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.getByTestId("slip-action-finalize-plan").click();
    await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`slip-item-${itemId}`)).toContainText("revised");
    const afterEdit = await finalState(tripId);
    expect(afterEdit.final_count).toBe(2);
    expect(afterEdit.final_version).toBe(2);
    expect(afterEdit.finalized_at).not.toBeNull();
    expect(afterEdit.final_hashes).toHaveLength(2);
    expect(afterEdit.final_hashes[0].content_hash).not.toBe(afterEdit.final_hashes[1].content_hash);
    await capture(page, "07-chooser-v2");

    await page.getByTestId("finalize-option-myself").click();
    await page.getByTestId("finalize-continue").click();
    await expect(page).toHaveURL(/\/cart/, { timeout: 15_000 });
    await capture(page, "08-book-it-myself-cart");

    await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("slip-trip-card-primary-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("slip-final-version-chip")).toHaveText("v2");
    await page.getByTestId("slip-action-view-trip-card").click();
    await expect(page).toHaveURL(new RegExp(`/trip/${tripId}$`), { timeout: 15_000 });
    await expect(page.getByTestId("trip-not-final-notice")).toHaveCount(0);
    // URL readiness is not render readiness on this route: wait for the finalized PlanCard before
    // saving the evidence capture so it cannot silently record the loading spinner.
    await expect(page.getByTestId(`card-plan-${tripId}`)).toBeVisible({ timeout: 15_000 });
    await capture(page, "09-trip-card-v2");
  });

  test("Travel expert continuation sends one request and closes the chooser", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    const finalize = await openFinalize(page, tripId);
    const expertRequest = page.waitForResponse(
      (response) => response.url().includes("/api/expert-requests") && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await finalize.click();
    await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("finalize-option-expert").click();
    await page.getByTestId("finalize-continue").click();
    const response = await expertRequest;
    expect(response.status(), `expert request failed: ${await response.text()}`).toBeLessThan(300);
    await expect(page.getByTestId("finalize-modal")).toHaveCount(0, { timeout: 10_000 });
  });
});
