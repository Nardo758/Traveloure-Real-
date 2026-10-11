import { test, expect, authFile } from "../fixtures/roles";
import { loginAsTestAccount } from "./helpers/auth";
import { requireBaseUrl } from "../fixtures/base-url";

test.describe("Journey 7 — Event Coordination (Wedding)", () => {
  // All tests in this describe block run as the seeded traveler account.
  // global-setup logs in once and saves the session to e2e/auth/traveler.json;
  // storageState restores the cookie for both `page` and `page.request`.
  test.use({ storageState: authFile("traveler") });

  test("Coordination fee endpoint returns correct fee with credit", async ({ page }) => {
    const BASE = requireBaseUrl();

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

});
