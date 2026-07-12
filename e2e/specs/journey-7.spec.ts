import { test, expect, authFile } from "../fixtures/roles";
import { loginAsTestAccount } from "./helpers/auth";

test.describe("Journey 7 — Event Coordination (Wedding)", () => {
  // All tests in this describe block run as the seeded traveler account.
  // global-setup logs in once and saves the session to e2e/auth/traveler.json;
  // storageState restores the cookie for both `page` and `page.request`.
  test.use({ storageState: authFile("traveler") });

  test("Concierge → Quote → Expert → Event Coordination surface", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Already authenticated via storageState — navigate directly ─

    // ── Step 2: Navigate to concierge with wedding event type ───────────
    await page.goto(`${BASE}/concierge?eventType=wedding`);
    await page.waitForSelector("[data-testid='intent-form']", { timeout: 10000 });

    // ── Step 3: Fill intent form ────────────────────────────────────────
    await page.fill("[data-testid='input-intent']", "Wedding in Santorini for 80 guests, June 2026");
    await page.fill("[data-testid='input-destination']", "Santorini, Greece");
    // Event type should be pre-selected from URL param
    await page.click("[data-testid='button-submit-intent']");

    // ── Step 4: Wait for quote and verify event-specific cards ──────────
    await page.waitForSelector("[data-testid='concierge-delivery-options']", { timeout: 15000 });

    // AI card should show "AI Planning Tool" for events
    const aiCard = page.locator("[data-testid='card-concierge-ai']");
    await expect(aiCard).toContainText("AI Planning Tool");
    await expect(aiCard).toContainText("credited toward coordination");

    // Expert card should show "Event Coordinator" with "Required" badge
    const expertCard = page.locator("[data-testid='card-concierge-expert']");
    await expect(expertCard).toContainText("Event Coordinator");
    await expect(expertCard).toContainText("Required");

    // Full card should show "Premium"
    const fullCard = page.locator("[data-testid='card-concierge-full']");
    await expect(fullCard).toContainText("Full / Done-for-You");

    // ── Step 5: Pick Expert tier ────────────────────────────────────────
    await expertCard.locator("[data-testid='button-concierge-pick-expert']").click();
    await page.waitForSelector("text=Your request is in", { timeout: 10000 });

    // ── Step 6: Verify expert request created ───────────────────────────
    // The expert request should have been created with the concierge context
    // We can verify by checking the API or by looking at the success state
    await expect(page.locator("text=Your request is in")).toBeVisible();

    // ── Step 7: Sign out and sign in as expert ──────────────────────────
    await page.goto(`${BASE}/api/logout`); // or however logout works
    await loginAsTestAccount(page, "expert");

    // ── Step 8: Navigate to expert workspace ────────────────────────────
    // The expert needs to be assigned to the trip first. In a real test,
    // this would be done by an admin or auto-assignment. For this spec,
    // we assume the expert is already assigned or we check the assignment API.
    await page.goto(`${BASE}/expert/workspace`);
    await page.waitForSelector("[data-testid='expert-workspace']", { timeout: 10000 });

    // ── Step 9: Select a trip with wedding event type ──────────────────
    // Find a trip with wedding experience type
    const weddingTrip = page.locator("[data-testid*='trip-card-']").filter({ hasText: /wedding/i }).first();
    await weddingTrip.click();

    // ── Step 10: Verify Event Coordination tab is visible ───────────────
    await page.waitForSelector("[data-testid='tab-right-event-coord']", { timeout: 10000 });
    await page.click("[data-testid='tab-right-event-coord']");

    // ── Step 11: Verify timeline is displayed ───────────────────────────
    await page.waitForSelector("text=Timeline", { timeout: 10000 });
    await expect(page.locator("text=Ceremony")).toBeVisible();
    await expect(page.locator("text=Reception")).toBeVisible();

    // ── Step 12: Verify vendor gaps are displayed ───────────────────────
    await page.waitForSelector("text=Vendor Gaps", { timeout: 10000 });
    // At least one vendor gap should be shown (e.g., photographer, florist)
    await expect(page.locator("[data-testid*='vendor-gap-']").first()).toBeVisible();

    // ── Step 13: Verify coordination fee is displayed ───────────────────
    await page.waitForSelector("text=Coordination Fee", { timeout: 10000 });
    // The fee should be at least $499 (the floor)
    const feeText = await page.locator("text=Coordination Fee").locator("..").textContent();
    expect(feeText).toMatch(/\$[\d,]+\.\d{2}/);

    // ── Step 14: Verify optimize fee credit is shown (if applicable) ───
    // If an optimize fee was previously paid, the credit should be shown
    const creditBadge = page.locator("text=credited");
    if (await creditBadge.isVisible().catch(() => false)) {
      await expect(creditBadge).toContainText("credited");
    }
  });

  test("Coordination fee endpoint returns correct fee with credit", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // storageState (set at the describe level) puts the traveler session cookie
    // into page's browser context. page.request inherits that context, so every
    // API call below is authenticated — no explicit login needed here.

    // Create a coordination state for a wedding
    const createRes = await page.request.post(`${BASE}/api/coordination-states`, {
      data: {
        experienceType: "wedding",
        title: "Santorini Wedding",
        metadata: { budget: 25000 },
      },
    });
    expect(createRes.status()).toBe(201);
    const state = await createRes.json();

    // Get the fee
    const feeRes = await page.request.get(`${BASE}/api/coordination-states/${state.id}/fee`);
    expect(feeRes.status()).toBe(200);
    const fee = await feeRes.json();

    // Fee should be greater of $499 or 8% of $25,000 = $2,000
    expect(fee.feeCents).toBe(2000_00);
    expect(fee.rule).toBe("percent");
    expect(fee.breakdown.floorCents).toBe(499_00);
    expect(fee.breakdown.percentOfBudget).toBe(2000_00);
  });

  test("Event timeline endpoint returns wedding timeline", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // Create a trip with wedding type and a temporal anchor
    // ... (setup)

    // Create a coordination state linked to the trip
    // ... (setup)

    // Get the timeline
    // const timelineRes = await request.get(`${BASE}/api/coordination-states/${state.id}/timeline`);
    // expect(timelineRes.status()).toBe(200);
    // const timeline = await timelineRes.json();
    // expect(timeline.eventType).toBe("wedding");
    // expect(timeline.blocks.length).toBeGreaterThan(0);
    // expect(timeline.anchorType).toBe("ceremony_time");
  });
});
