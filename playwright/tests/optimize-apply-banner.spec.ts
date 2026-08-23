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
    "comparison auto-applies, redirects to /trip?optimized=1, shows banner, and dismisses it",
    async ({ page }) => {
      const email = `e2e-opt-${uid()}@example.com`;
      const password = "TestPassword123!";
      const firstName = "E2E";
      const lastName = "Tester";

      // ── 1. Register a new email-auth user (also logs them in via session) ──
      const regRes = await page.request.post(`${BASE_URL}/api/auth/register`, {
        data: { email, password, firstName, lastName, userType: "user" },
      });
      expect(regRes.status()).toBe(201);
      const regBody = await regRes.json();
      const userId: string = regBody.user.id;

      // ── 2. Create a trip ──────────────────────────────────────────────────
      const tripRes = await page.request.post(`${BASE_URL}/api/trips`, {
        data: {
          title: "E2E Optimization Test Trip",
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

      // ── 3. Seed a pre-generated comparison + AI variant (bypasses payment gate) ──
      const comparisonId = crypto.randomUUID();
      sql(`
        INSERT INTO itinerary_comparisons
          (id, user_id, trip_id, title, destination, start_date, end_date,
           budget, travelers, status, optimized_at)
        VALUES
          ('${comparisonId}', '${userId}', '${tripId}',
           'E2E Tokyo Plan', 'Tokyo, Japan',
           '2026-09-01', '2026-09-07',
           '500.00', 2, 'generated', NOW())
      `);

      const variantId = crypto.randomUUID();
      sql(`
        INSERT INTO itinerary_variants
          (id, comparison_id, name, description, source, status,
           total_cost, optimization_score, sort_order)
        VALUES
          ('${variantId}', '${comparisonId}',
           'AI Optimized Plan', 'AI-optimized itinerary for Tokyo',
           'ai_optimized', 'generated',
           '420.00', 87, 0)
      `);

      sql(`
        INSERT INTO itinerary_variant_items
          (id, variant_id, day_number, name, description,
           service_type, price, location, sort_order)
        VALUES
          ('${crypto.randomUUID()}', '${variantId}', 1,
           'Tsukiji Market Tour', 'Morning fish market',
           'activity', '45.00', 'Tsukiji, Tokyo', 0),
          ('${crypto.randomUUID()}', '${variantId}', 1,
           'Senso-ji Temple', 'Historic Buddhist temple',
           'sightseeing', '0.00', 'Asakusa, Tokyo', 1)
      `);

      // ── 4. Navigate to the comparison page with ?autoApply=1 ─────────────
      await page.goto(
        `${BASE_URL}/itinerary-comparison/${comparisonId}?autoApply=1`
      );

      // ── 5. Wait for auto-apply to fire and redirect to /trip/:id?optimized=1 ─
      //    The comparison is already "generated" with an AI variant, so the
      //    useEffect in itinerary-comparison.tsx fires immediately (within one
      //    React render cycle). Allow up to 15s for the redirect + page load.
      await page.waitForURL(
        (url) =>
          url.pathname.startsWith("/trip/") &&
          url.searchParams.get("optimized") === "1",
        { timeout: 15_000 }
      );

      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname).toMatch(/^\/trip\//);
      expect(finalUrl.searchParams.get("optimized")).toBe("1");

      // ── 6. Verify the "Plan ready" banner is visible ──────────────────────
      const banner = page.getByTestId("banner-plan-ready");
      await expect(banner).toBeVisible({ timeout: 8_000 });
      await expect(banner).toContainText("Your optimized plan is ready");

      // ── 7. Dismiss the banner ─────────────────────────────────────────────
      const dismissBtn = page.getByTestId("button-dismiss-optimized-banner");
      await expect(dismissBtn).toBeVisible();
      await dismissBtn.click();

      // ── 8. Verify the banner is gone and the URL no longer has ?optimized=1 ─
      await expect(banner).not.toBeVisible({ timeout: 5_000 });

      await page.waitForURL(
        (url) => !url.searchParams.has("optimized"),
        { timeout: 5_000 }
      );
      expect(new URL(page.url()).searchParams.has("optimized")).toBe(false);
    }
  );
});
