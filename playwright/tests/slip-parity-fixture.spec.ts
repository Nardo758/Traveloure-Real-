import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  installSlipParityFixture,
  SLIP_PARITY_COMPARISON_ID,
} from "../fixtures/slip-parity";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const CAPTURE_DIR = "/tmp/slip-fix";

test.describe("authenticated Slip review parity fixture", () => {
  test.beforeAll(() => {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  });

  for (const scenario of ["three", "two", "zero"] as const) {
    test(`renders the ${scenario}-proposal review state without mutations`, async ({ page }) => {
      await installSlipParityFixture(page, scenario);
      await page.goto(
        `${BASE_URL}/itinerary-comparison/${SLIP_PARITY_COMPARISON_ID}`,
        { waitUntil: "domcontentloaded" },
      );

      await expect(page.getByTestId("review-title")).toContainText("Kyoto");
      await expect(page.getByTestId("review-intro")).toContainText("Nothing changes until you apply one");
      await expect(page.getByTestId("compare-footer")).toBeVisible();

      if (scenario === "zero") {
        await expect(page.getByTestId("banner-no-proposals-review")).toBeVisible();
        await expect(page.locator('[data-testid^="proposal-column-"]')).toHaveCount(1);
        await expect(page.getByTestId("proposal-column-baseline")).toBeVisible();
        await expect(page.getByTestId("proposal-preview-money")).toHaveCount(0);
      } else {
        await expect(page.locator('[data-testid^="proposal-column-"]')).toHaveCount(
          scenario === "three" ? 4 : 3,
        );
        await expect(page.getByTestId("proposal-column-baseline")).toBeVisible();
        await expect(page.getByTestId("proposal-preview-money")).toHaveCount(
          scenario === "three" ? 3 : 2,
        );
      }

      const requests = await page.evaluate(() => {
        const recorded = (window as Window & {
          __slipParityRequests?: Array<{ method: string; path: string; fixtureBlocked?: true }>;
        }).__slipParityRequests;
        return recorded ?? [];
      });
      expect(
        requests
          .filter((request) => request.method !== "GET")
          .every((request) => request.fixtureBlocked),
        "the fixture must block every mutation locally",
      ).toBe(true);

      await page.screenshot({
        path: `${CAPTURE_DIR}/gap-1-${scenario}.png`,
        fullPage: true,
      });
    });
  }
  test("uses the approved 4-2-1 proposal grid breakpoints", async ({ page }) => {
    await installSlipParityFixture(page, "three");

    for (const { width, expectedColumns } of [
      { width: 1280, expectedColumns: 4 },
      { width: 1000, expectedColumns: 2 },
      { width: 560, expectedColumns: 1 },
      { width: 390, expectedColumns: 1 },
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `${BASE_URL}/itinerary-comparison/${SLIP_PARITY_COMPARISON_ID}`,
        { waitUntil: "domcontentloaded" },
      );

      await expect(page.getByTestId("review-proposal-grid")).toBeVisible();
      await expect
        .poll(() =>
          page.getByTestId("review-proposal-grid").evaluate((element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
          ),
        )
        .toBe(expectedColumns);
    }
  });

  test("shows access denied for a forbidden comparison read", async ({ page }) => {
    await installSlipParityFixture(page, "forbidden");
    await page.goto(
      `${BASE_URL}/itinerary-comparison/${SLIP_PARITY_COMPARISON_ID}`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByTestId("comparison-access-denied")).toBeVisible();
    await expect(page.getByTestId("comparison-access-denied")).toContainText(
      "You don't have access to this optimization review",
    );
    await expect(page.getByTestId("button-back-to-my-plans")).toContainText("Back to My Plans");
    await expect(page.getByText("No itinerary data found")).toHaveCount(0);

    const requests = await page.evaluate(() => {
      const recorded = (window as Window & {
        __slipParityRequests?: Array<{ method: string; path: string; fixtureBlocked?: true }>;
      }).__slipParityRequests;
      return recorded ?? [];
    });
    expect(
      requests
        .filter((request) => request.method !== "GET")
        .every((request) => request.fixtureBlocked),
      "the fixture must block every mutation locally",
    ).toBe(true);

    await page.screenshot({
      path: `${CAPTURE_DIR}/gap-5-forbidden.png`,
      fullPage: true,
    });
  });
});