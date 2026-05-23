import { test, expect } from "@playwright/test";

test("My Reviews filter + sort bar renders correctly with reviews", async ({ page }) => {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { email: "testuser123@mailinator.com", password: "Test@1234" },
  });
  expect(loginRes.status()).toBe(200);

  await page.goto("/my-reviews");
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain("/my-reviews");

  await expect(page.locator("h1")).toContainText("My Reviews");

  // Filter bar is visible (user has at least 1 review)
  const filterBar = page.locator('[data-testid="star-filter-bar"]');
  await expect(filterBar).toBeVisible();
  console.log("Filter bar visible ✓");

  // "All" pill is present and active by default
  const allPill = page.locator('[data-testid="filter-all"]');
  await expect(allPill).toBeVisible();
  const allClass = await allPill.getAttribute("class");
  expect(allClass).toContain("FF385C");
  console.log("All pill active by default ✓");

  // Sort select is present with default "Newest first"
  const sortSelect = page.locator('[data-testid="sort-select"]');
  await expect(sortSelect).toBeVisible();
  await expect(sortSelect).toContainText("Newest");
  console.log("Sort select visible, default = Newest ✓");

  // Review count label is shown
  const countLabel = page.locator('[data-testid="reviews-count"]');
  await expect(countLabel).toBeVisible();
  console.log(`Count label: "${await countLabel.textContent()}" ✓`);

  // At least one review card renders
  const cards = page.locator('[data-testid^="review-card-"]');
  await expect(cards.first()).toBeVisible();
  const cardCount = await cards.count();
  console.log(`Review cards rendered: ${cardCount} ✓`);

  // Click a star filter pill (whichever rating exists)
  for (const stars of [5, 4, 3, 2, 1]) {
    const pill = page.locator(`[data-testid="filter-star-${stars}"]`);
    if (await pill.isVisible()) {
      await pill.click();
      await page.waitForTimeout(300);
      const pillClass = await pill.getAttribute("class");
      expect(pillClass).toContain("FF385C");
      const allClassAfter = await allPill.getAttribute("class");
      expect(allClassAfter).not.toContain("FF385C");
      console.log(`Star ${stars} filter active after click ✓`);

      // Clear filter link appears and works
      const clearBtn = page.locator('[data-testid="clear-filter"]');
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await page.waitForTimeout(300);
        const allClassRestored = await allPill.getAttribute("class");
        expect(allClassRestored).toContain("FF385C");
        console.log("Clear filter restores All pill ✓");
      }
      break;
    }
  }

  // Change sort to Oldest
  await sortSelect.click();
  await page.locator('[data-testid="sort-oldest"]').click();
  await page.waitForTimeout(300);
  await expect(sortSelect).toContainText("Oldest");
  console.log("Sort → Oldest ✓");

  // Change sort to Highest rated
  await sortSelect.click();
  await page.locator('[data-testid="sort-highest"]').click();
  await page.waitForTimeout(300);
  await expect(sortSelect).toContainText("Highest");
  console.log("Sort → Highest rated ✓");

  // Change sort to Lowest rated
  await sortSelect.click();
  await page.locator('[data-testid="sort-lowest"]').click();
  await page.waitForTimeout(300);
  await expect(sortSelect).toContainText("Lowest");
  console.log("Sort → Lowest rated ✓");

  console.log("PASS ✓ — filter + sort bar fully working");
});

test("My Reviews empty state — no filter bar shown", async ({ page }) => {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { email: "testuser@traveloure.test", password: "TestPass123!" },
  });
  expect(loginRes.status()).toBe(200);

  await page.goto("/my-reviews");
  await page.waitForLoadState("networkidle");

  await expect(page.locator('[data-testid="my-reviews-empty"]')).toBeVisible();
  console.log("Empty state visible ✓");

  const filterBar = page.locator('[data-testid="star-filter-bar"]');
  await expect(filterBar).not.toBeVisible();
  console.log("Filter bar hidden on empty state ✓");

  await expect(page.locator('[data-testid="go-to-bookings"]')).toBeVisible();
  console.log("PASS ✓ — correct empty state");
});
