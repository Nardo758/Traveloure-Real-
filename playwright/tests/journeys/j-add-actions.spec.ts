import { test, expect, type Page } from "@playwright/test";
import { testid } from "../../../e2e/supply-demand/lib/ui";
import { assertDisposableDb, closePool, pool, rows, uid } from "./_journey-helpers";

/**
 * CUT-LIST #1 SLICE C — the add action on the guest rail, end to end (ledger `2026-11-11-cutlist1-slice-c-add-actions`).
 *
 * In waitlist mode a signed-out traveler with a guest plan opens the map, finds a fixture listing and adds it:
 *
 *   A1 the one add button reads "Add to plan"; the press shows the spinner (aria-busy) while the save is in flight
 *   A2 the first add on a plan whose dates were never chosen opens the range calendar ("When are you going?") with
 *      "Skip for now"; Skip leaves the item on Day 1 and the calendar does not reopen on the next add
 *   A3 the toast reads "Added to Day 1." with Undo and Change day; the button reads "Added ✓" (inert on the guest rail)
 *   A4 Undo removes the row on the server and the button returns to "Add to plan"
 *   A5 a failed save is the recovery toast with "Retry"; Retry adds the row
 *   A6 375px: the add button, the toast and its two actions sit inside the viewport with no horizontal scroll
 *
 * The mode is set to waitlist for this file only (the platform setting, restored in afterAll) and the server's 15s
 * settings cache is waited out on both sides. Run it on its own (CI: its own step).
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-add-actions.spec.ts --project=chromium --workers=1
 * Needs: DATABASE_URL (the fixture, the mode and the read-back), the app on BASE_URL.
 */

const SETTINGS_CACHE_MS = 15_500;
let priorMode: string | null = null;

async function setMode(mode: string | null) {
  if (mode == null) await rows(`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else
    await rows(
      `INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1`,
      [mode],
    );
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  await assertDisposableDb(pool());
  const r = await rows<{ setting_value: string }>(`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = r[0]?.setting_value ?? null;
  await setMode("waitlist");
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await setMode(priorMode);
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
  await closePool();
});

test.use({ viewport: { width: 375, height: 812 } });

async function fixtureListing() {
  // Waitlist mode refuses a sign-up, so the listing's owner is written behind the disposable-database guard.
  const [owner] = await rows<{ id: string }>(
    `INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, $1, 'service_provider') RETURNING id`,
    [`add-actions-owner-${uid()}@traveloure.test`],
  );
  const name = `Add actions tea ceremony ${uid()}`;
  const [listing] = await rows<{ id: string }>(
    `INSERT INTO provider_services
       (id, user_id, service_name, category_id, city, location, price, price_type, show_price,
        latitude, longitude, status, approval_status)
     SELECT gen_random_uuid()::text, $1, $2, sc.id, 'Kyoto', 'Kyoto, Japan', '45', 'fixed', true, '35.0037', '135.7788', 'active', 'approved'
       FROM service_categories sc WHERE sc.category_key = 'activity_provider' LIMIT 1
     RETURNING id`,
    [owner.id, name],
  );
  return { id: listing.id, name };
}

async function openBrowseRow(page: Page, listing: { id: string; name: string }) {
  await testid(page, "map-browse-tab-activities").click({ timeout: 20_000 });
  await testid(page, "map-browse-search").fill(listing.name);
  await testid(page, `map-browse-row-listing-${listing.id}`).click({ timeout: 20_000 });
}

async function guestItems(planId: string) {
  return rows<{ id: string; day_number: number }>(`SELECT id, day_number FROM itinerary_items WHERE trip_id = $1`, [planId]);
}

test("slice C — guest add: spinner, first-add calendar with Skip, Added to Day 1 with Undo / Change day, Retry, at 375px", async ({ page }) => {
  test.setTimeout(120_000);
  const listing = await fixtureListing();

  // A guest plan with no chosen dates (the server's one-day placeholder), made on the page's own guest cookie.
  const made = await page.request.post("/api/guest-plans", { data: { destination: "Kyoto, Japan", title: "Kyoto trip" } });
  expect(made.ok(), `guest plan create answered ${made.status()}`).toBe(true);
  const planId: string = (await made.json()).plan.id;

  await page.goto("/plans/new?view=map");
  await openBrowseRow(page, listing);
  const add = testid(page, "map-browse-add");
  await expect(add).toContainText("Add to plan");

  // A1 + A5: the first save fails once — the button spins while it is in flight, then the recovery toast offers Retry.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let failNext = true;
  await page.route("**/api/guest-plans/current/items", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "error" }) });
    }
    return route.continue();
  });
  await add.click();
  await expect(add).toHaveAttribute("aria-busy", "true");
  await expect(testid(page, "map-browse-add-spinner")).toBeVisible();
  release();
  const failed = testid(page, "toast-add-failed");
  await expect(failed).toBeVisible({ timeout: 10_000 });
  await expect(testid(page, "toast-add-retry")).toHaveText("Retry");
  expect(await guestItems(planId), "a failed save writes nothing").toHaveLength(0);
  await testid(page, "toast-add-retry").click();

  // A2: the first add on an undated plan opens the one calendar with Skip for now.
  const dates = testid(page, "first-add-dates-dialog");
  await expect(dates).toBeVisible({ timeout: 10_000 });
  await expect(dates).toContainText("When are you going?");
  await expect(testid(page, "first-add-dates-panel-calendar-skip")).toHaveText("Skip for now");
  await testid(page, "first-add-dates-panel-calendar-skip").click();
  await expect(dates).toHaveCount(0);

  // A3: the toast and the done state; the row is on Day 1.
  const toastEl = testid(page, "toast-added");
  await expect(toastEl).toContainText("Added to Day 1.", { timeout: 10_000 });
  await expect(testid(page, "toast-added-undo")).toHaveText("Undo");
  await expect(testid(page, "toast-added-change-day")).toHaveText("Change day");
  await expect(add).toContainText("Added ✓", { timeout: 10_000 });
  await expect(add).toBeDisabled();
  const items = await guestItems(planId);
  expect(items).toHaveLength(1);
  expect(items[0].day_number).toBe(1);

  // A6: 375px — the button, the toast and its actions are inside the viewport; nothing scrolls sideways.
  for (const el of [add, toastEl, testid(page, "toast-added-undo"), testid(page, "toast-added-change-day")]) {
    const box = await el.boundingBox();
    expect(box, "rendered").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // A4: Undo removes the row on the server; the button offers the add again.
  await testid(page, "toast-added-undo").click();
  await expect.poll(async () => (await guestItems(planId)).length, { timeout: 15_000 }).toBe(0);
  await expect(add).toContainText("Add to plan", { timeout: 15_000 });

  // A2 (once): the next add does not reopen the calendar.
  await add.click();
  await expect(testid(page, "toast-added")).toContainText("Added to Day 1.", { timeout: 10_000 });
  await expect(dates).toHaveCount(0);
  await expect.poll(async () => (await guestItems(planId)).length, { timeout: 15_000 }).toBe(1);

  // Change day on a one-day plan lists Day 1 only (the current day, not pressable).
  await testid(page, "toast-added-change-day").click();
  await expect(testid(page, "change-day-dialog")).toBeVisible();
  await expect(testid(page, "change-day-option-1")).toBeDisabled();
  await expect(testid(page, "change-day-option-2")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(testid(page, "change-day-dialog")).toHaveCount(0);
});
