import { test, expect } from "@playwright/test";
import { actAndAwait, appears, ok2xx, testid } from "../../../e2e/supply-demand/lib/ui";
import { clickPlanFinish } from "../../../e2e/supply-demand/lib/flows";
import { assertDisposableDb, closePool, pool, registerUser, rows, uid } from "./_journey-helpers";

/**
 * STEP 8b-2 — THE MAP LAYOUT OF THE PLAN, end to end (ledger `2026-10-06-step8b2-map-layout`; step 8
 * brief rev 3.1, items 9–19; the decision-maker's 8b-2 gate):
 *
 *   start page → Continue → the one modal (at When) → finish → the plan opens on its MAP, on Browse,
 *   with day chips drawn from the trip's own dates → add one listing to Day 2 → it is in "Your plan".
 *
 * SUPPLY, stated (§18d): the CI database is built from empty and no seeder writes a located Kyoto
 * listing, so this spec writes ONE fixture listing — approved, active, located, Kyoto, an
 * `activity_provider` category — owned by its own fresh traveler, behind `assertDisposableDb` (the
 * journey suite's write guard: a disposable database only). Every other write goes through the app.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-map-layout.spec.ts --project=chromium
 * Needs: DATABASE_URL (the fixture listing and the read-back), the app on BASE_URL.
 */

test.afterAll(async () => {
  await closePool();
});

test("8b-2 — start page → modal → the map opens on Browse with the trip's days; a listing added to Day 2 is in Your plan", async ({ page }) => {
  // A mint, a map and a Browse read in one test: more headroom than the default 30 s.
  test.setTimeout(60_000);
  const traveler = await registerUser(page.request, "map-layout", "Map", "Layout");

  // ── The one fixture: a located, approved Kyoto listing in the Activities tab ──────────────────
  await assertDisposableDb(pool());
  const listingName = `Map layout tea ceremony ${uid()}`;
  const [listing] = await rows<{ id: string }>(
    `INSERT INTO provider_services
       (id, user_id, service_name, category_id, city, location, price, price_type, show_price,
        latitude, longitude, status, approval_status)
     SELECT gen_random_uuid()::text, $1, $2, sc.id, 'Kyoto', 'Kyoto, Japan', '45', 'fixed', true, '35.0037', '135.7788', 'active', 'approved'
       FROM service_categories sc WHERE sc.category_key = 'activity_provider' LIMIT 1
     RETURNING id`,
    [traveler.id, listingName],
  );
  expect(listing?.id, "the fixture listing was written").toBeTruthy();

  // ── The start page: one of the eight cities and the trip group, then Start a plan ─────────────
  await page.goto("/experiences");
  await testid(page, "city-card-kyoto").click({ timeout: 20_000 });
  await testid(page, "plan-entry-group-trips").click();
  await testid(page, "button-plan-entry-start").click();
  // E3 (ledger `2026-10-09-e3-experiences-inline`; sanctioned rewrite of :46-50): PlanEntry inline's
  // Start a plan opens the plan straight away — no pop-up, no When, no Who — on its MAP view, Browse.
  await expect(page).toHaveURL(/\/plans\/(?!new)[a-zA-Z0-9-]+\?view=map/, { timeout: 20_000 });
  await expect(testid(page, "plan-modal"), "the start page opens no planning modal").toHaveCount(0);
  const tripId = page.url().match(/\/plans\/([a-zA-Z0-9-]+)/)![1];
  expect(tripId, "Continue minted a plan").toBeTruthy();

  // Ruling 9: an empty plan opens on Browse. No dates yet ⇒ one "Day 1" (the 8b-2 rule).
  const sheet = page.locator(`[data-testid="map-sheet-${tripId}"]`);
  await expect(sheet).toHaveAttribute("data-rail-layer", "browse", { timeout: 20_000 });
  await expect(testid(page, `map-day-btn-1-${tripId}`)).toBeVisible();
  await expect(testid(page, `map-day-btn-2-${tripId}`)).toHaveCount(0);

  // "Set your dates" opens INLINE on the slip; once saved, the chips are the trip's own four days.
  const start = new Date();
  start.setDate(start.getDate() + 40);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  await testid(page, "slip-dates-set-cta").click();
  await testid(page, "slip-dates-panel").getByTestId("input-slip-dates-start").fill(fmt(start));
  await testid(page, "slip-dates-panel").getByTestId("input-slip-dates-end").fill(fmt(end));
  await testid(page, "button-slip-dates-save").click();
  for (const n of [1, 2, 3, 4]) await expect(testid(page, `map-day-btn-${n}-${tripId}`)).toBeVisible({ timeout: 20_000 });
  await expect(testid(page, `map-day-btn-5-${tripId}`)).toHaveCount(0);

  // ── Add the listing to Day 2 from the Activities tab ──────────────────────────────────────────
  await testid(page, `map-day-btn-2-${tripId}`).click();
  await testid(page, "map-browse-tab-activities").click();
  await testid(page, "map-browse-search").fill(listingName);
  await testid(page, `map-browse-row-listing-${listing.id}`).click({ timeout: 20_000 });
  await expect(testid(page, "map-browse-add")).toContainText("Add to day 2");
  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "map-browse-add").click();
    },
    { method: "POST", path: new RegExp(`^/api/trips/${tripId}/itinerary-items$`) },
  );
  expect(ok2xx(status), `the add answered ${status}`).toBe(true);
  // The card now says where it went, and offers the remove.
  await expect(testid(page, "map-browse-added")).toContainText("On day 2", { timeout: 15_000 });

  // The one item rail wrote ONE row, on the shown day, naming the listing.
  const items = await rows<{ id: string; day_number: number; provider_service_id: string | null }>(
    `SELECT id, day_number, provider_service_id FROM itinerary_items WHERE trip_id = $1`,
    [tripId],
  );
  expect(items.length).toBe(1);
  expect(items[0].day_number).toBe(2);
  expect(items[0].provider_service_id).toBe(listing.id);

  // ── "Your plan": the rail follows the shown layer ─────────────────────────────────────────────
  await testid(page, `map-layer-browse-${tripId}`).click();
  await expect(sheet).toHaveAttribute("data-rail-layer", "plan");
  await expect(testid(page, "map-your-plan-title")).toContainText("Day 2");
  await expect(testid(page, `map-sheet-stop-${items[0].id}`)).toContainText(listingName, { timeout: 15_000 });

  // And it is the SAME plan in the list view.
  await testid(page, "button-slip-view-list").click();
  expect(await appears(page.getByText(listingName).first(), 15_000), "the list view shows the added listing").toBe(true);
});
