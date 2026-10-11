import { test, expect } from "@playwright/test";
import { loginAsTestAccount } from "./helpers/auth";
import { requireBaseUrl } from "../fixtures/base-url";

test.describe("Journey 6 — Transport Booking", () => {

  test("Affiliate click attribution endpoint", async ({ page }) => {
    const BASE = requireBaseUrl();

    // The seed + click endpoints are isAuthenticated (server/routes/transport-hub.routes.ts).
    // Authenticate first, then drive them through page.request so the session cookie rides
    // along — a bare `request` fixture carries no session and the server correctly 401s.
    //
    // The seed endpoint is ALSO refused (503) on a production-strict boot since audit finding 11
    // (`server/middleware/test-only-endpoint.ts`). No change is needed here: this suite targets
    // STAGING, which must run with `ALLOW_TEST_ACCOUNTS=1` and `ENVIRONMENT` unset for
    // `loginAsTestAccount` above to work at all (docs/STAGING.md §2.2) — the same predicate that
    // enables the seed endpoint. If this line ever 503s, the target is a production boot and the
    // login on the line above could not have succeeded either.
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
