import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const mockUrl = pathToFileURL(
  path.resolve("docs/design/optimized-slip-review-mock.html"),
).toString();

test.describe("optimized slip apply confirmation", () => {
  test("opens from a proposal, names it, and cancel leaves the review unchanged", async ({ page }) => {
    await page.goto(mockUrl);
    await page.getByRole("button", { name: "Apply Calm Mornings" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Calm Mornings");
    await expect(dialog).toContainText("other proposals will be discarded");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("compare-footer")).toContainText("other two are discarded");
  });

  test("supports keyboard confirmation and remains usable on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(mockUrl);
    await page.getByRole("button", { name: "Apply Fewer Hops" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm and apply" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Apply Fewer Hops" }).click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
  });
});