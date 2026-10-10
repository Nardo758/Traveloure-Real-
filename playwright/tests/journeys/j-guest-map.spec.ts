import { test, expect } from "@playwright/test";
import { appears, testid } from "../../../e2e/supply-demand/lib/ui";
import { assertDisposableDb, closePool, pool, registerUser, rows, uid } from "./_journey-helpers";

/**
 * STEP 8d — THE SIGNED-OUT ROUND TRIP, end to end (ledger `2026-10-07-step8d-guest-map`; step 8 brief
 * rev 3.1 items 24–26 and the signed-out e2e gate at `:232–233`).
 *
 * This ONE spec closes both signed-out gates:
 *   · 8b-2's (never built — recorded in the ledger row): start on Experiences, finish the pop-up, sign
 *     in, and land on the new plan's map with the answers kept;
 *   · 8d's: browse with no plan, add, sign in, and the plan exists with that one item, once.
 *
 *   /experiences (signed out) → the one modal → "Build it myself" → the GUEST map (/plans/new) with the
 *   answers → Browse lists the fixture listing → "Add to plan" → the existing sign-in modal with the
 *   board's copy → create an account → the plan is created ONCE, lands on its map, the answers kept,
 *   ONE Day 1 item naming the listing → a reload creates nothing more.
 *
 * SUPPLY, stated (§18d): one fixture listing — approved, active, located, Kyoto, `activity_provider` —
 * owned by a separate fresh account, written behind `assertDisposableDb`. The listing owner registers
 * through a SEPARATE request context, so the page itself stays signed out. Every other write goes
 * through the app.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-guest-map.spec.ts --project=chromium
 * Needs: DATABASE_URL (the fixture and the read-back), the app on BASE_URL.
 */

test.afterAll(async () => {
  await closePool();
});

test("8d — signed out: browse with no plan, add, sign up → exactly one plan, answers kept, one Day 1 item; a reload adds nothing", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  // ── The fixture listing, owned by an account the PAGE never signs in as ─────────────────────────
  await assertDisposableDb(pool());
  const owner = await registerUser(request, "guest-map-owner", "Map", "Owner");
  const listingName = `Guest map tea ceremony ${uid()}`;
  const [listing] = await rows<{ id: string }>(
    `INSERT INTO provider_services
       (id, user_id, service_name, category_id, city, location, price, price_type, show_price,
        latitude, longitude, status, approval_status)
     SELECT gen_random_uuid()::text, $1, $2, sc.id, 'Kyoto', 'Kyoto, Japan', '45', 'fixed', true, '35.0037', '135.7788', 'active', 'approved'
       FROM service_categories sc WHERE sc.category_key = 'activity_provider' LIMIT 1
     RETURNING id`,
    [owner.id, listingName],
  );
  expect(listing?.id, "the fixture listing was written").toBeTruthy();

  // ── Signed out: the start page — PlanEntry inline; Start a plan opens the guest map (E3, ledger
  //    `2026-10-09-e3-experiences-inline`; sanctioned rewrite of :55-59): no pop-up, no When, no Who. ──
  await page.goto("/experiences");
  await testid(page, "city-card-kyoto").click({ timeout: 20_000 });
  await testid(page, "plan-entry-group-trips").click();
  await testid(page, "button-plan-entry-start").click();
  await expect(testid(page, "plan-modal"), "the start page opens no planning modal").toHaveCount(0);
  await expect(testid(page, "plan-entry"), "the start page opens no pop-up").toHaveCount(0);

  // ── The guest map: no plan, the answers, Browse ─────────────────────────────────────────────────
  await expect(page).toHaveURL(/\/plans\/new\?view=map$/, { timeout: 15_000 });
  await expect(testid(page, "guest-map-banner")).toContainText("Your plan is created when you sign in");
  await expect(testid(page, "guest-map-answers")).toContainText("Kyoto");
  // Lane E1: the start page asked no party, so the answers line names none (§13).
  await expect(testid(page, "guest-map-answers")).not.toContainText("travelers");

  // "Sign in to start" opens the gate; "Keep browsing" closes it and nothing happens.
  await testid(page, "button-guest-map-start").click();
  await expect(testid(page, "modal-sign-in")).toBeVisible({ timeout: 10_000 });
  await expect(testid(page, "text-sign-in-description")).toContainText("Your empty plan opens here, on the map.");
  await testid(page, "button-signin-dismiss").click();
  await expect(testid(page, "modal-sign-in")).toHaveCount(0);

  await testid(page, "map-browse-tab-activities").click();
  await testid(page, "map-browse-search").fill(listingName);
  await testid(page, `map-browse-row-listing-${listing.id}`).click({ timeout: 20_000 });
  await expect(testid(page, "map-browse-add")).toContainText("Add to plan");
  await testid(page, "map-browse-add").click();

  // The gate: the board's copy, the guest's own answers, the place's name.
  await expect(testid(page, "modal-sign-in")).toBeVisible({ timeout: 10_000 });
  await expect(testid(page, "text-sign-in-title")).toHaveText("Your plan is created when you sign in");
  await expect(testid(page, "text-sign-in-description")).toContainText("Kyoto");
  await expect(testid(page, "text-sign-in-description")).toContainText(`${listingName} is added as soon as you are in.`);
  const record = JSON.parse((await page.evaluate(() => sessionStorage.getItem("traveloure_pending_plan"))) ?? "null");
  expect(record?.pendingAdd, "the record carries the one add, by id").toEqual({ kind: "listing", id: listing.id, title: listingName, dayNumber: 1 });
  expect(page.url(), "nothing in the URL").not.toContain(listing.id);

  // ── Create the account in the existing modal ────────────────────────────────────────────────────
  const email = `guest-map-${uid()}@traveloure.test`;
  await testid(page, "link-switch-signup").click();
  await testid(page, "input-first-name").fill("Guest");
  await testid(page, "input-last-name").fill("Mapper");
  await testid(page, "input-email").fill(email);
  await testid(page, "input-password").fill("Journey!Pass123");
  await testid(page, "checkbox-signup-terms").click();
  await testid(page, "checkbox-signup-privacy").click();
  await testid(page, "button-auth-submit").click();

  // The reload replays the record: ONE plan, landing on its map.
  await expect(page).toHaveURL(/\/plans\/(?!new)[a-zA-Z0-9-]+\?view=map/, { timeout: 30_000 });
  const tripId = page.url().match(/\/plans\/([a-zA-Z0-9-]+)/)![1];

  const [user] = await rows<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  expect(user?.id, "the account exists").toBeTruthy();
  const trips = await rows<{ id: string; destination: string; start_date: string; end_date: string; adults: number | null; dates_confirmed: boolean }>(
    `SELECT id, destination, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, adults,
            dates_confirmed_at IS NOT NULL AS dates_confirmed
       FROM trips WHERE user_id = $1`,
    [user.id],
  );
  expect(trips.length, "exactly one plan").toBe(1);
  expect(trips[0].id).toBe(tripId);
  expect(trips[0].destination).toContain("Kyoto");
  // Lane E1 (sanctioned rewrite of ~:123-125): no dates and no party were asked — the row holds the
  // one-day placeholder (the mint day) with NOTHING certified, and no party (§13).
  expect(trips[0].dates_confirmed, "no date was chosen, so none is certified").toBe(false);
  expect(trips[0].start_date, "the placeholder is one day").toBe(trips[0].end_date);
  expect(trips[0].adults, "no party was asked").toBeNull();

  // The one add, Day 1, naming the listing — polled, because it lands right after the mint.
  await expect
    .poll(async () => (await rows(`SELECT 1 FROM itinerary_items WHERE trip_id = $1`, [tripId])).length, { timeout: 15_000 })
    .toBe(1);
  const items = await rows<{ day_number: number; provider_service_id: string | null }>(
    `SELECT day_number, provider_service_id FROM itinerary_items WHERE trip_id = $1`,
    [tripId],
  );
  expect(items[0].day_number).toBe(1);
  expect(items[0].provider_service_id).toBe(listing.id);
  expect(await page.evaluate(() => sessionStorage.getItem("traveloure_pending_plan")), "the record is gone").toBeNull();

  // ── A reload creates nothing more ───────────────────────────────────────────────────────────────
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));
  await page.waitForLoadState("networkidle").catch(() => {});
  expect((await rows(`SELECT 1 FROM trips WHERE user_id = $1`, [user.id])).length, "still one plan").toBe(1);
  expect((await rows(`SELECT 1 FROM itinerary_items WHERE trip_id = $1`, [tripId])).length, "still one item").toBe(1);
  expect((await rows(`SELECT 1 FROM cart_items WHERE user_id = $1`, [user.id])).length, "no cart row").toBe(0);
});
