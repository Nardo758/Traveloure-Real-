/**
 * QA round 4 R4-4, signed in (Nov 13, 2026).
 *
 *   (a) the Trip Strip on /discover/location/Kyoto at 1280 and 375. The browse surfaces render a signed-in traveler
 *       inside the console shell, which had no strip; the strip ruling (`2026-11-11-cutlist1-strip-one-plan-surface`)
 *       draws it for a signed-in member.
 *   (c) the console's phone menu button is named "Open navigation menu" (the existing `nav.openMenu`), not
 *       "Toggle Sidebar".
 *   (d) while the session read is in flight the phone menu shows no signed-out item. On `main`, with the read held
 *       1.5 s, the menu opened during it showed Sign in and the partner sign-ups on /, /experiences, /blog, /pricing and
 *       /discover/location/Kyoto.
 *
 * (b), the sidebar's "Start a plan" opening /?start=1, is #1999's ruling (a start always lands on "/") and is not
 * changed here.
 *
 * Needs: the app on BASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { createItem, createTrip, registerUser } from "./_journey-helpers";

const testid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

test("R4-4 (a)(c) — the strip on the signed-in browse page at 1280 and 375; the phone menu button's name", async ({ page }) => {
  test.setTimeout(90_000);
  await registerUser(page.request, "r44-chrome", "Chrome", "Check");
  const tripId = await createTrip(page.request, "R4-4 strip");
  await createItem(page.request, tripId, "Tea ceremony");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/discover/location/Kyoto");
    const toggle = testid(page, "button-dashboard-sidebar-toggle");
    await expect(toggle, "the console shell").toBeVisible({ timeout: 20_000 });
    const strip = testid(page, "trip-strip");
    await expect(strip, `the Trip Strip at ${width}`).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, "trip-strip-plan-label")).toContainText("Your Kyoto plan");
    if (width === 375) await expect(toggle).toHaveAccessibleName("Open navigation menu");
    else await expect(toggle).toHaveAccessibleName("Toggle Sidebar");
  }
});

test("R4-4 (d) — the phone menu shows nothing signed-out while the session read is in flight", async ({ page }) => {
  test.setTimeout(90_000);
  await registerUser(page.request, "r44-flash", "Flash", "Check");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route("**/api/auth/user", async (r) => {
    await new Promise((x) => setTimeout(x, 1500));
    await r.continue();
  });
  await page.addInitScript(() => {
    const w = window as any;
    w.__signedOutSeen = new Set<string>();
    new MutationObserver(() => {
      const menu = document.querySelector('[data-testid="button-mobile-menu"]') as HTMLButtonElement | null;
      if (menu && !w.__opened) {
        w.__opened = true;
        menu.click();
      }
      for (const t of ["button-mobile-sign-in-top", "button-mobile-sign-in", "button-mobile-trip-planner"]) {
        if (document.querySelector(`[data-testid="${t}"]`)) w.__signedOutSeen.add(t);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  for (const route of ["/", "/experiences"]) {
    await page.goto(route);
    await page.waitForTimeout(3_000);
    const seen = await page.evaluate(() => [...(window as any).__signedOutSeen]);
    expect(seen, `${route}: no signed-out item while the session loads`).toEqual([]);
    expect(await page.evaluate(() => (window as any).__opened), `${route}: the menu was opened during the read`).toBe(true);
  }
});
