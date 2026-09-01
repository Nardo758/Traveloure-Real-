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

type AffiliateProductFixture = {
  id: string;
  name: string;
  price: string | null;
};

async function pickAffiliateProduct(): Promise<AffiliateProductFixture> {
  const [product] = await rows<AffiliateProductFixture>(
    `SELECT id, name, price
       FROM affiliate_products
      WHERE booking_type = 'affiliate_bookable'
        AND affiliate_url IS NOT NULL
        AND is_active = true
      ORDER BY id
      LIMIT 1`,
  );
  expect(product, "expected an active affiliate-bookable supplier in the DB").toBeTruthy();
  return product;
}

async function addAndStageAffiliateItem(
  page: Page,
  tripId: string,
  product: AffiliateProductFixture,
): Promise<{ itemId: string; title: string }> {
  const title = `${product.name} supplier-ready`;
  const itemRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: {
      title,
      dayNumber: 1,
      estimatedCost: product.price ?? "45.00",
    },
  });
  expect(itemRes.status(), `create affiliate item failed: ${await itemRes.text()}`).toBe(201);
  const itemId = (await itemRes.json()).id as string;

  // affiliateProductId is server-owned on create, so attach the real approved product through
  // the supported trip-item update route used by the existing itinerary authoring surface.
  const affiliateRes = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/itinerary-items/${itemId}`, {
    data: { affiliateProductId: product.id },
  });
  expect(affiliateRes.status(), `attach affiliate product failed: ${await affiliateRes.text()}`).toBe(200);

  const routeRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
    data: { to: "ready_for_checkout" },
  });
  expect(routeRes.status(), `route affiliate item failed: ${await routeRes.text()}`).toBe(200);
  return { itemId, title };
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

  test("keeps the booking agent enabled for a supplier-ready stop and sends one request", async ({ page }) => {
    const tripId = await registerAndTrip(page);
    const product = await pickAffiliateProduct();
    const { itemId, title } = await addAndStageAffiliateItem(page, tripId, product);
    const before = await finalState(tripId);
    const requestCountBefore = Number(
      (await rows<{ count: string }>(
        `SELECT count(*)::int AS count FROM affiliate_booking_requests WHERE item_name = $1`,
        [product.name],
      ))[0]?.count ?? 0,
    );

    const finalize = await openFinalize(page, tripId);
    await expect(page.getByTestId(`slip-item-${itemId}`)).toContainText(title);

    const finalizeResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/api/trips/${tripId}/finalize`) && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await finalize.click();
    expect((await finalizeResponse).status()).toBe(200);
    await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 10_000 });

    const agentOption = page.getByTestId("finalize-option-agent");
    await expect(agentOption).toBeEnabled();
    await expect(agentOption).toContainText("Books it as-is");
    await expect(agentOption).not.toContainText("No partner-bookable stops in this plan");
    const locked = await finalState(tripId);
    const lockedRouting = await rows<{ routing_status: string }>(
      `SELECT routing_status FROM itinerary_items WHERE id = $1`,
      [itemId],
    );
    expect(lockedRouting[0]?.routing_status).toBe("ready_for_checkout");

    const requestPayloads: Array<Record<string, unknown>> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/api/affiliate-booking-requests") return;
      requestPayloads.push(request.postDataJSON() as Record<string, unknown>);
    });
    await agentOption.click();
    await expect(agentOption).toHaveAttribute("aria-pressed", "true");

    const bookingRequestResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/affiliate-booking-requests") && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByTestId("finalize-continue").click();
    const response = await bookingRequestResponse;
    expect(response.status(), `booking-agent request failed: ${await response.text()}`).toBeLessThan(300);
    await expect(page.getByTestId("finalize-modal")).toHaveCount(0, { timeout: 10_000 });

    expect(requestPayloads, "Continue must send exactly one booking-agent request").toHaveLength(1);
    expect(requestPayloads[0]).toEqual(
      expect.objectContaining({
        itemName: title,
        partnerName: expect.any(String),
        bookingToken: expect.stringMatching(/^[^.]+\.\d+$/),
        travelers: 1,
      }),
    );
    expect(requestPayloads[0]).not.toHaveProperty("affiliateUrl");
    expect(requestPayloads[0]).not.toHaveProperty("price");

    const after = await finalState(tripId);
    expect(after.finalized_at).not.toBeNull();
    expect(after.final_count).toBe(before.final_count + 1);
    expect(after.final_version).toBe(1);
    expect(after.final_hashes).toHaveLength(1);
    expect(after.transition_types).toContain("plan_finalized");
    expect(after.final_hashes[0].content_hash).toBe(locked.final_hashes[0].content_hash);
    const afterRouting = await rows<{ routing_status: string }>(
      `SELECT routing_status FROM itinerary_items WHERE id = $1`,
      [itemId],
    );
    expect(afterRouting[0]?.routing_status).toBe("ready_for_checkout");

    const [createdRequestCount, [latestRequest]] = await Promise.all([
      rows<{ count: string }>(
        `SELECT count(*)::int AS count FROM affiliate_booking_requests WHERE item_name = $1`,
        [product.name],
      ),
      rows<{
        item_name: string;
        status: string | null;
        price: string | null;
      }>(
        `SELECT item_name, status, price
           FROM affiliate_booking_requests
          WHERE item_name = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [product.name],
      ),
    ]);
    expect(Number(createdRequestCount[0]?.count ?? 0)).toBe(requestCountBefore + 1);
    expect(latestRequest).toMatchObject({
      item_name: product.name,
      status: expect.stringMatching(/^(pending|assigned)$/),
      price: null,
    });
  });
});
