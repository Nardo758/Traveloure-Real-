import { expect, test } from "@playwright/test";

test.describe("landing launch-market ticker", () => {
  test("links a city to its Discover page and supports keyboard activation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const kyoto = page.getByTestId("hero-market-link-kyoto");
    await expect(kyoto).toHaveAttribute("href", "/discover/location/Kyoto");

    await kyoto.focus();
    await expect(kyoto).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/discover\/location\/Kyoto$/);
  });
});