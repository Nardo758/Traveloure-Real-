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
  return execSync(`psql '${db}' -t -A -c '${escaped}'`, {
    encoding: "utf8",
  }).trim();
}

test.describe("live optimized slip apply confirmation", () => {
  test("cancel keeps the slip unchanged and a failed apply can be retried", async ({ page }) => {
    const email = `e2e-slip-${uid()}@example.com`;
    const password = "TestPassword123!";
    let userId: string | undefined;
    let tripId: string | undefined;
    let comparisonId: string | undefined;

    try {
      const registration = await page.request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          email,
          password,
          firstName: "E2E",
          lastName: "Slip Tester",
          userType: "user",
        },
      });
      expect(registration.status()).toBe(201);
      userId = (await registration.json()).user.id;

      const trip = await page.request.post(`${BASE_URL}/api/trips`, {
        data: {
          title: "E2E Disposable Slip Trip",
          destination: "Tokyo, Japan",
          startDate: "2026-09-01",
          endDate: "2026-09-07",
          numberOfTravelers: 2,
        },
      });
      expect(trip.status()).toBe(201);
      const tripBody = await trip.json();
      tripId = tripBody.id ?? tripBody.trip?.id;
      expect(tripId).toBeTruthy();

      comparisonId = crypto.randomUUID();
      const baselineVariantId = crypto.randomUUID();
      const proposalVariantId = crypto.randomUUID();

      // Seed a completed, trip-backed comparison so the real review-first slip renders
      // without invoking the paid optimizer or an external AI provider.
      sql(`
        INSERT INTO itinerary_comparisons
          (id, user_id, trip_id, title, destination, start_date, end_date,
           budget, travelers, status, optimized_at)
        VALUES
          ('${comparisonId}', '${userId}', '${tripId}',
           'E2E Disposable Tokyo Slip', 'Tokyo, Japan',
           '2026-09-01', '2026-09-07',
           '500.00', 2, 'generated', NOW())
      `);

      sql(`
        INSERT INTO itinerary_variants
          (id, comparison_id, name, description, source, status,
           total_cost, optimization_score, sort_order)
        VALUES
          ('${baselineVariantId}', '${comparisonId}',
           'Current Tokyo Plan', 'The traveler''s current plan',
           'user', 'generated', '500.00', NULL, 0),
          ('${proposalVariantId}', '${comparisonId}',
           'Calm Tokyo Mornings', 'A calmer itinerary with fewer rushed starts',
           'ai_optimized', 'generated', '420.00', 88, 1)
      `);

      sql(`
        INSERT INTO itinerary_variant_items
          (id, variant_id, day_number, name, description,
           service_type, price, location, sort_order)
        VALUES
          ('${crypto.randomUUID()}', '${proposalVariantId}', 1,
           'Tsukiji Market Walk', 'A relaxed morning market visit',
           'activity', '45.00', 'Tsukiji, Tokyo', 0)
      `);

      const selectRequests: string[] = [];
      const applyRequests: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "POST") return;
        if (request.url().includes(`/api/itinerary-comparisons/${comparisonId}/select`)) {
          selectRequests.push(request.url());
        }
        if (request.url().includes(`/api/itinerary-comparisons/${comparisonId}/apply-to-trip`)) {
          applyRequests.push(request.url());
        }
      });

      await page.goto(`${BASE_URL}/itinerary-comparison/${comparisonId}`);

      const applyProposal = page.getByRole("button", {
        name: "Apply Calm Tokyo Mornings",
      });
      await expect(applyProposal).toBeVisible({ timeout: 15_000 });

      const slipBeforeCancel = await page.request.get(
        `${BASE_URL}/api/itinerary-comparisons/${comparisonId}`,
      );
      expect(slipBeforeCancel.status()).toBe(200);
      expect((await slipBeforeCancel.json()).comparison.selectedVariantId).toBeNull();

      await applyProposal.click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Calm Tokyo Mornings");
      await expect(dialog).toContainText("other proposals will be discarded");

      await page.getByTestId("button-apply-cancel").click();
      await expect(dialog).toBeHidden();
      await expect(applyProposal).toBeVisible();
      expect(selectRequests).toHaveLength(0);
      expect(applyRequests).toHaveLength(0);

      const slipAfterCancel = await page.request.get(
        `${BASE_URL}/api/itinerary-comparisons/${comparisonId}`,
      );
      expect(slipAfterCancel.status()).toBe(200);
      expect((await slipAfterCancel.json()).comparison.selectedVariantId).toBeNull();

      let failedApply = true;
      await page.route(
        `${BASE_URL}/api/itinerary-comparisons/${comparisonId}/apply-to-trip`,
        async (route) => {
          if (failedApply) {
            failedApply = false;
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ message: "simulated apply failure" }),
            });
            return;
          }
          await route.continue();
        },
      );

      await applyProposal.click();
      await expect(dialog).toBeVisible();
      await page.getByTestId("button-apply-confirm").click();

      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("apply-error")).toContainText(
        "We couldn't apply this proposal",
      );
      await expect(page).toHaveURL(
        new RegExp(`/itinerary-comparison/${comparisonId}$`),
      );
      await page.getByTestId("button-apply-retry").click();
      await expect(dialog).toBeVisible();
      await page.getByTestId("button-apply-confirm").click();
      await page.waitForURL(
        (url) => url.pathname === `/plans/${tripId}`,
        { timeout: 15_000 },
      );
      expect(selectRequests).toHaveLength(2);
      expect(applyRequests).toHaveLength(2);
    } finally {
      // The comparison is disposable; deleting the user cascades through the trip and
      // comparison fixture so repeated journey runs do not accumulate test data.
      if (userId) sql(`DELETE FROM users WHERE id = '${userId}'`);
    }
  });
});