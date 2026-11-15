/**
 * QA round 4 R4-11: the Kyoto page's console errors.
 *
 * Reproduced on `main` (c200a27), signed out, /discover/location/Kyoto at 1280 and 375: three console errors, each a
 * browser "Failed to load resource" for a 401 — `GET /api/auth/user` (the session check: a guest is answered 401 by
 * design), `GET /api/cart` (the Trip Strip's cart chip) and `GET /api/trips` (`useTrips`, the add picker's list).
 * Signed in: none. The cart and the plan list are the session user's, so a signed-out page no longer asks for them;
 * the session check stays, because a 401 is how a guest is told apart.
 *
 * Needs: the app on BASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { registerUser } from "./_journey-helpers";

async function errorsOn(page: Page): Promise<{ console: string[]; failed: string[] }> {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("/discover/location/Kyoto");
  await page.waitForTimeout(5_000);
  await page.mouse.wheel(0, 4_000);
  await page.waitForTimeout(2_000);
  return { console: consoleErrors, failed };
}

for (const width of [1280, 375]) {
  test(`R4-11 — signed out at ${width}: the only failed request is the session check`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const { console: errs, failed } = await errorsOn(page);
    expect(failed, "no cart or plan-list read for a guest").toEqual(["401 GET /api/auth/user"]);
    expect(errs.filter((e) => !/status of 401/.test(e)), "no other console error").toEqual([]);
    expect(errs.length, "one console line: the session check's 401").toBe(1);
  });
}

test("R4-11 — signed in: no console error on the Kyoto page", async ({ page }) => {
  test.setTimeout(60_000);
  await registerUser(page.request, "r411-kyoto", "Kyoto", "Console");
  await page.setViewportSize({ width: 1280, height: 900 });
  const { console: errs, failed } = await errorsOn(page);
  expect(failed).toEqual([]);
  expect(errs).toEqual([]);
});
