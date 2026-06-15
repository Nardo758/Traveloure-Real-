import { test, expect } from "@playwright/test";
import { loginAsTestAccount } from "./helpers/auth";

test.describe("Journey 4 — Expert Supply Side (Onboarding → Service → Booking → Earnings)", () => {
  test("Expert onboarding wizard → creates service → traveler books → earnings reflect", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as expert test account ───────────────────────────
    await loginAsTestAccount(page, "expert");

    // ── Step 2: Navigate to expert onboarding ────────────────────────────
    await page.goto(`${BASE}/become-expert`);
    await page.waitForSelector("[data-testid='expert-onboarding-wizard']", { timeout: 10000 });

    // ── Step 3: Fill Step 1 — Basic Info ─────────────────────────────────
    await page.fill("[data-testid='input-full-name']", "E2E Test Expert");
    await page.fill("[data-testid='input-email']", "expert-e2e@traveloure.test");
    await page.fill("[data-testid='input-phone']", "+1-555-000-1234");
    await page.click("[data-testid='button-next-step']");

    // ── Step 4: Fill Step 2 — Expertise / Locality ──────────────────────
    await page.fill("[data-testid='input-destinations']", "Paris, Tokyo, Bali");
    await page.selectOption("[data-testid='select-role']", "local_expert");
    await page.click("[data-testid='button-next-step']");

    // ── Step 5: Fill Step 3 — Services ──────────────────────────────────
    await page.fill("[data-testid='input-services']", "Itinerary planning, Restaurant reservations, Local recommendations");
    await page.fill("[data-testid='textarea-knowledge-proof']", "I have lived in Paris for 15 years and know every hidden gem.");
    await page.click("[data-testid='button-next-step']");

    // ── Step 6: Fill Step 4 — Experience ──────────────────────────────────
    await page.fill("[data-testid='input-experience-years']", "10");
    await page.click("[data-testid='button-next-step']");

    // ── Step 7: Fill Step 5 — Availability & Pricing ──────────────────────
    await page.fill("[data-testid='input-hourly-rate']", "150");
    await page.click("[data-testid='button-next-step']");

    // ── Step 8: Review & Submit ────────────────────────────────────────
    await page.click("[data-testid='button-submit-application']");
    await page.waitForSelector("text=Application submitted", { timeout: 10000 });

    // ── Step 9: Admin approves the expert (via API or UI) ──────────────
    // In a real E2E, this would be done by an admin test account.
    // For this spec, we assume the test account is pre-approved or we skip.

    // ── Step 10: Expert creates a service ────────────────────────────────
    await page.goto(`${BASE}/expert/services/new`);
    await page.waitForSelector("[data-testid='service-creation-form']", { timeout: 10000 });
    await page.fill("[data-testid='input-service-name']", "E2E Expert Service");
    await page.fill("[data-testid='input-service-description']", "A premium itinerary planning service for Paris.");
    await page.fill("[data-testid='input-service-price']", "500");
    await page.selectOption("[data-testid='select-service-category']", "itinerary_planning");
    await page.click("[data-testid='button-create-service']");
    await page.waitForSelector("text=Service created", { timeout: 10000 });

    // ── Step 11: Sign out and sign in as traveler ──────────────────────
    await page.goto(`${BASE}/api/logout`);
    await loginAsTestAccount(page, "traveler");

    // ── Step 12: Discover the expert's service ───────────────────────────
    await page.goto(`${BASE}/experts`);
    await page.waitForSelector("[data-testid='expert-feed']", { timeout: 10000 });
    await page.fill("[data-testid='input-search-experts']", "E2E Test Expert");
    await page.waitForSelector("[data-testid='expert-card-e2e-test-expert']", { timeout: 10000 });
    await page.click("[data-testid='expert-card-e2e-test-expert']");

    // ── Step 13: Navigate to expert detail and book service ────────────
    await page.waitForSelector("[data-testid='expert-detail-page']", { timeout: 10000 });
    await page.click("[data-testid='tab-services']");
    await page.waitForSelector("[data-testid='button-book-service-']", { timeout: 10000 });
    await page.click("[data-testid='button-book-service-']");

    // ── Step 14: Cart and checkout ───────────────────────────────────────
    await page.waitForURL(`${BASE}/cart**`, { timeout: 10000 });
    await page.waitForSelector("[data-testid='cart-item-expert-service']", { timeout: 10000 });
    await page.click("[data-testid='button-checkout']");

    // ── Step 15: Stripe Payment Intent ─────────────────────────────────
    // (Stripe test mode — use test card 4242 4242 4242 4242)
    const stripeFrame = page.frameLocator("iframe[name*='stripe']").first();
    await stripeFrame.locator("[placeholder='Card number']").fill("4242424242424242");
    await stripeFrame.locator("[placeholder='MM / YY']").fill("12/30");
    await stripeFrame.locator("[placeholder='CVC']").fill("123");
    await page.click("[data-testid='button-confirm-payment']");
    await page.waitForSelector("text=Booking confirmed", { timeout: 20000 });

    // ── Step 16: Sign out and sign in as expert ────────────────────────
    await page.goto(`${BASE}/api/logout`);
    await loginAsTestAccount(page, "expert");

    // ── Step 17: Verify earnings reflect the booking ────────────────────
    await page.goto(`${BASE}/expert/earnings`);
    await page.waitForSelector("[data-testid='earnings-dashboard']", { timeout: 10000 });
    // Expert earns 75% of $500 = $375 (per commission.service.ts expert_share_rate)
    await expect(page.locator("text=$375.00")).toBeVisible();
    await expect(page.locator("text=Platform fee: 25%")).toBeVisible();
  });
});

test.describe("Journey 5 — Provider Supply Side (Onboarding → Service → Booking → Earnings)", () => {
  test("Provider onboarding wizard → creates service → traveler books → earnings reflect", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as provider test account ─────────────────────────
    await loginAsTestAccount(page, "provider");

    // ── Step 2: Navigate to provider onboarding ────────────────────────
    await page.goto(`${BASE}/become-provider`);
    await page.waitForSelector("[data-testid='provider-onboarding-wizard']", { timeout: 10000 });

    // ── Step 3: Fill Step 1 — Business Info ────────────────────────────
    await page.fill("[data-testid='input-business-name']", "E2E Test Provider");
    await page.selectOption("[data-testid='select-business-type']", "llc");
    await page.fill("[data-testid='input-tax-id']", "12-3456789");
    await page.fill("[data-testid='input-email']", "provider-e2e@traveloure.test");
    await page.fill("[data-testid='input-phone']", "+1-555-000-5678");
    await page.click("[data-testid='button-next-step']");

    // ── Step 4: Fill Step 2 — Service Categories ───────────────────────
    await page.selectOption("[data-testid='select-category']", "transportation");
    await page.fill("[data-testid='textarea-service-description']", "Luxury transportation services in Paris.");
    await page.click("[data-testid='button-next-step']");

    // ── Step 5: Fill Step 3 — Location & Insurance ────────────────────
    await page.fill("[data-testid='input-location']", "Paris, France");
    await page.fill("[data-testid='input-capacity']", "8");
    await page.check("[data-testid='checkbox-insurance']");
    await page.check("[data-testid='checkbox-license']");
    await page.click("[data-testid='button-next-step']");

    // ── Step 6: Review & Submit ────────────────────────────────────────
    await page.click("[data-testid='button-submit-application']");
    await page.waitForSelector("text=Application submitted", { timeout: 10000 });

    // ── Step 7: Admin approves the provider (via API or UI) ────────────
    // In a real E2E, this would be done by an admin test account.

    // ── Step 8: Provider creates a service ───────────────────────────────
    await page.goto(`${BASE}/provider/services/new`);
    await page.waitForSelector("[data-testid='service-creation-form']", { timeout: 10000 });
    await page.fill("[data-testid='input-service-name']", "E2E Provider Service");
    await page.fill("[data-testid='input-service-description']", "Luxury airport transfer in Paris.");
    await page.fill("[data-testid='input-service-price']", "200");
    await page.selectOption("[data-testid='select-service-category']", "transportation");
    await page.click("[data-testid='button-create-service']");
    await page.waitForSelector("text=Service created", { timeout: 10000 });

    // ── Step 9: Sign out and sign in as traveler ───────────────────────
    await page.goto(`${BASE}/api/logout`);
    await loginAsTestAccount(page, "traveler");

    // ── Step 10: Discover the provider's service ────────────────────────
    await page.goto(`${BASE}/discover`);
    await page.waitForSelector("[data-testid='discover-feed']", { timeout: 10000 });
    await page.fill("[data-testid='input-search-services']", "E2E Provider Service");
    await page.waitForSelector("[data-testid='service-card-e2e-provider-service']", { timeout: 10000 });
    await page.click("[data-testid='service-card-e2e-provider-service']");

    // ── Step 11: Service detail page — verify commission display ───────
    await page.waitForSelector("[data-testid='service-detail-page']", { timeout: 10000 });
    await expect(page.locator("text=Provider earns 90%")).toBeVisible();
    await expect(page.locator("text=Platform fee: 10%")).toBeVisible();

    // ── Step 12: Add to cart and checkout ──────────────────────────────
    await page.click("[data-testid='button-add-to-cart']");
    await page.waitForURL(`${BASE}/cart**`, { timeout: 10000 });
    await page.waitForSelector("[data-testid='cart-item-provider-service']", { timeout: 10000 });
    await page.click("[data-testid='button-checkout']");

    // ── Step 13: Stripe Payment Intent ─────────────────────────────────
    const stripeFrame = page.frameLocator("iframe[name*='stripe']").first();
    await stripeFrame.locator("[placeholder='Card number']").fill("4242424242424242");
    await stripeFrame.locator("[placeholder='MM / YY']").fill("12/30");
    await stripeFrame.locator("[placeholder='CVC']").fill("123");
    await page.click("[data-testid='button-confirm-payment']");
    await page.waitForSelector("text=Booking confirmed", { timeout: 20000 });

    // ── Step 14: Sign out and sign in as provider ──────────────────────
    await page.goto(`${BASE}/api/logout`);
    await loginAsTestAccount(page, "provider");

    // ── Step 15: Verify earnings reflect the booking ───────────────────
    await page.goto(`${BASE}/provider/earnings`);
    await page.waitForSelector("[data-testid='earnings-dashboard']", { timeout: 10000 });
    // Provider earns 90% of $200 = $180 (per commission.service.ts provider_share_rate)
    await expect(page.locator("text=$180.00")).toBeVisible();
    await expect(page.locator("text=Platform fee: 10%")).toBeVisible();
  });
});
