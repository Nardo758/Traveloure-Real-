import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function sql(query: string) {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error("DATABASE_URL is not set");
  const escaped = query.replace(/'/g, `'\\''`);
  const result = execSync(`psql '${db}' -t -A -c '${escaped}'`, {
    encoding: "utf8",
  }).trim();
  return result;
}

test.describe("G7 optimize → apply → redirect → banner flow", () => {
  test(
    "trip-backed auto-apply with no AI variants returns to the traveler plan",
    async ({ page }) => {
      const email = `e2e-opt-empty-${uid()}@example.com`;
      const password = "TestPassword123!";

      // Register a new email-auth user (also logs them in via session).
      const regRes = await page.request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          email,
          password,
          firstName: "E2E",
          lastName: "Empty Optimizer",
          userType: "user",
        },
      });
      expect(regRes.status()).toBe(201);
      const userId: string = (await regRes.json()).user.id;

      const tripRes = await page.request.post(`${BASE_URL}/api/trips`, {
        data: {
          title: "E2E Empty Optimization Test Trip",
          destination: "Tokyo, Japan",
          startDate: "2026-09-01",
          endDate: "2026-09-07",
          numberOfTravelers: 2,
        },
      });
      expect(tripRes.status()).toBe(201);
      const tripBody = await tripRes.json();
      const tripId: string = tripBody.id ?? tripBody.trip?.id;
      expect(tripId).toBeTruthy();

      // A generated comparison with no variants reproduces the completed-but-empty
      // auto-apply state without invoking the AI provider.
      const comparisonId = crypto.randomUUID();
      sql(`
        INSERT INTO itinerary_comparisons
          (id, user_id, trip_id, title, destination, start_date, end_date,
           budget, travelers, status, optimized_at)
        VALUES
          ('${comparisonId}', '${userId}', '${tripId}',
           'E2E Empty Tokyo Plan', 'Tokyo, Japan',
           '2026-09-01', '2026-09-07',
           '500.00', 2, 'generated', NOW())
      `);

      await page.goto(
        `${BASE_URL}/itinerary-comparison/${comparisonId}?autoApply=1`
      );

      const errorBanner = page.getByTestId("banner-auto-apply-error");
      await expect(errorBanner).toBeVisible({ timeout: 8_000 });
      await expect(errorBanner).toContainText("No optimized variants were generated");

      const backButton = page.getByTestId("button-back-to-cart-error");
      await expect(backButton).toContainText("Back to your plan");
      await backButton.click();

      await page.waitForURL(
        (url) => url.pathname === `/plans/${tripId}`,
        { timeout: 8_000 }
      );
      expect(new URL(page.url()).pathname).toBe(`/plans/${tripId}`);
    }
  );
});
