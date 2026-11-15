/**
 * QA round 4 R4-3 (Leon's Nov 10 ruling: View plan on the add toast, PLAN_ADD_TOAST_MS 8000 every time, signed-in adds).
 *
 * Reproduced on `main` (c200a27), signed in, a plan add from the service page: the page's own toast ("Saved to plan",
 * duration null ⇒ Radix's 5 s default, no View plan, no Undo) closed at ~5,017 ms — QA's "closes at about 6 s" once the
 * exit animation is counted. The map's add already raised the one add toast and held it 8,020 ms.
 *
 * Here both adds raise the one add toast: "Added to Day 1." with View plan, still open at 7.5 s.
 *
 * Needs: DATABASE_URL (one fixture listing, removed with the run's database), the app on BASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { assertDisposableDb, closePool, createTrip, pool, registerUser, rows, uid } from "./_journey-helpers";

const testid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

test.afterAll(async () => {
  await closePool();
});

async function fixtureListing(ownerId: string, name: string): Promise<string> {
  await assertDisposableDb(pool());
  const [l] = await rows<{ id: string }>(
    `INSERT INTO provider_services
       (id, user_id, service_name, category_id, city, location, price, price_type, show_price,
        latitude, longitude, status, approval_status, booking_mode)
     SELECT gen_random_uuid()::text, $1, $2, sc.id, 'Kyoto', 'Kyoto, Japan', '45', 'fixed', true, '35.0037', '135.7788',
            'active', 'approved', 'instant'
       FROM service_categories sc WHERE sc.category_key = 'activity_provider' LIMIT 1
     RETURNING id`,
    [ownerId, name],
  );
  expect(l?.id, "the fixture listing was written").toBeTruthy();
  return l.id;
}

/** The one add toast: the added line, View plan, and still open past 7.5 s (the hover pause is not used). */
async function expectOneAddToast(page: Page, tripId: string) {
  const toast = testid(page, "toast-added");
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toContainText("Added to Day 1.");
  await expect(testid(page, "toast-added-view-plan")).toBeVisible();
  await page.mouse.move(5, 890);
  await page.waitForTimeout(7_500);
  await expect(toast, "still open at 7.5 s (PLAN_ADD_TOAST_MS)").toBeVisible();
  await testid(page, "toast-added-view-plan").click();
  await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));
}

test("R4-3 — a signed-in add from the service page raises the one add toast (View plan, 8 s)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const traveler = await registerUser(page.request, "r43-service", "Add", "Toast");
  const listingId = await fixtureListing(traveler.id, `R4-3 service ${uid()}`);
  const tripId = await createTrip(page.request, "R4-3 service add");
  await page.goto(`/services/${listingId}?tripId=${tripId}`);
  await testid(page, "button-add-to-cart").first().click({ timeout: 20_000 });
  await expectOneAddToast(page, tripId);
});

test("R4-3 — a signed-in add from the map raises the same toast", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const traveler = await registerUser(page.request, "r43-map", "Add", "Toast");
  const name = `R4-3 map ${uid()}`;
  const listingId = await fixtureListing(traveler.id, name);
  const tripId = await createTrip(page.request, "R4-3 map add");
  await page.goto(`/plans/${tripId}?view=map`);
  await testid(page, "map-browse-tab-activities").click({ timeout: 20_000 });
  await testid(page, "map-browse-search").fill(name);
  await testid(page, `map-browse-row-listing-${listingId}`).click({ timeout: 20_000 });
  await testid(page, "map-browse-add").click();
  await expectOneAddToast(page, tripId);
});
