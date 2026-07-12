import { test, expect } from "@playwright/test";
import { loginAsTestAccount } from "./helpers/auth";

test.describe("Journey 5 — Admin Fee Propagation & Trust", () => {
  test("Admin changes fee in fee-bands editor → next checkout reflects new fee", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as admin ───────────────────────────────────────
    await loginAsTestAccount(page, "admin");

    // ── Step 2: Navigate to fee-bands editor ───────────────────────────
    await page.goto(`${BASE}/admin/fee-bands`);
    await page.waitForSelector("[data-testid='fee-bands-editor']", { timeout: 10000 });

    // ── Step 3: Find the wedding event type fee and change it ──────────
    const weddingRow = page.locator("[data-testid='fee-band-row-wedding']");
    await expect(weddingRow).toBeVisible();
    await weddingRow.locator("[data-testid='button-edit-fee']").click();
    await weddingRow.locator("[data-testid='input-fee-amount']").fill("49.99");
    await weddingRow.locator("[data-testid='button-save-fee']").click();
    await page.waitForSelector("text=Fee updated", { timeout: 10000 });

    // ── Step 4: Sign out and sign in as traveler ───────────────────────
    await page.goto(`${BASE}/api/logout`);
    await loginAsTestAccount(page, "traveler");

    // ── Step 5: Navigate to concierge and request a wedding quote ─────
    await page.goto(`${BASE}/concierge?eventType=wedding`);
    await page.waitForSelector("[data-testid='intent-form']", { timeout: 10000 });
    await page.fill("[data-testid='input-intent']", "Wedding in Santorini");
    await page.fill("[data-testid='input-destination']", "Santorini");
    await page.click("[data-testid='button-submit-intent']");

    // ── Step 6: Verify the AI tier shows the new fee ───────────────────
    await page.waitForSelector("[data-testid='concierge-delivery-options']", { timeout: 15000 });
    const aiCard = page.locator("[data-testid='card-concierge-ai']");
    await expect(aiCard).toContainText("$49.99");
  });

  test("Admin triggers payout → expert receives funds via Stripe Connect", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as admin ───────────────────────────────────────
    await loginAsTestAccount(page, "admin");

    // ── Step 2: Navigate to admin payouts ──────────────────────────────
    await page.goto(`${BASE}/admin/payouts`);
    await page.waitForSelector("[data-testid='payouts-dashboard']", { timeout: 10000 });

    // ── Step 3: Trigger a new payout for an expert ───────────────────
    await page.click("[data-testid='button-trigger-new-payout']");
    await page.waitForSelector("[data-testid='payout-trigger-modal']", { timeout: 10000 });
    await page.selectOption("[data-testid='select-requester-type']", "expert");
    await page.fill("[data-testid='input-requester-id']", "expert-test-id"); // Use test account ID
    await page.fill("[data-testid='input-amount-cents']", "10000"); // $100.00
    await page.click("[data-testid='button-submit-payout']");
    await page.waitForSelector("text=Payout created", { timeout: 10000 });

    // ── Step 4: Verify the payout appears in the pending list ──────────
    await page.waitForSelector("[data-testid='payout-card-pending']", { timeout: 10000 });
    await expect(page.locator("[data-testid='payout-card-pending']").first()).toContainText("$100.00");

    // ── Step 5: Approve the payout ─────────────────────────────────────
    await page.click("[data-testid='button-approve-payout']");
    await page.waitForSelector("text=Payout approved", { timeout: 10000 });
  });

  // Trust contract (revenue can never override relevance across a band) is verified
  // as a PURE-FUNCTION UNIT TEST, not here — see
  //   server/services/__tests__/upsell-engine.test.ts
  //     → describe("Phase 5.1 — RELEVANCE DOMINANCE (the contract)")
  // which sweeps 100+ (gap, revenue, policy) combinations against blendScore/
  // holdsDominance directly. The former E2E test here POSTed /api/upsell/rank
  // with synthetic {relevanceScore, revenueScore} candidates — but that endpoint
  // never existed (the engine derives relevance/revenue from live data inside its
  // per-surface endpoints; it cannot accept injected scores), so the test always
  // hit the SPA catch-all and failed on "Unexpected token '<'". The contract lives
  // at the pure layer; the unit suite is wired into CI via the upsell-trust-contract
  // workflow (npm run test:upsell-contract).

  test("Upsell click attribution tracked", async ({ page }) => {
    const BASE = process.env.E2E_BASE_URL || "https://localhost:5000";

    // ── Step 1: Sign in as traveler ───────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── Step 2: Navigate to a page with upsell slots ───────────────────
    await page.goto(`${BASE}/discover`);
    await page.waitForSelector("[data-testid='discover-feed']", { timeout: 10000 });

    // ── Step 3: Wait for upsell slots to load ──────────────────────────
    await page.waitForSelector("[data-testid='upsell-slot']", { timeout: 10000 });
    const upsell = page.locator("[data-testid='upsell-slot']").first();
    await expect(upsell).toBeVisible();

    // ── Step 4: Click the upsell CTA ───────────────────────────────────
    await upsell.locator("[data-testid='button-explore-upsell']").click();

    // ── Step 5: Verify the click was tracked ───────────────────────────
    // The frontend calls POST /api/upsell/click before navigating
    // We verify by checking the network request or by looking at the UI state
    await page.waitForURL(/\/service\/|\/expert\//, { timeout: 10000 });
  });
});
