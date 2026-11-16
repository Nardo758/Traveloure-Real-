/**
 * QA round 4 R4-11: the Kyoto page's console errors.
 *
 * Reproduced on `main` (c200a27), signed out, /discover/location/Kyoto at 1280 and 375: three console errors, each a
 * browser "Failed to load resource" for a 401 — `GET /api/auth/user` (the session check: a guest is answered 401 by
 * design), `GET /api/cart` (the Trip Strip's cart chip) and `GET /api/trips` (`useTrips`, the add picker's list).
 * Signed in: none. The cart and the plan list are the session user's, so a signed-out page no longer asks for them;
 * the session check stays, because a 401 is how a guest is told apart.
 *
 * WHAT THIS ASSERTS, AND WHAT IT DOES NOT (§18d). Signed out it asserts the fix itself: no request for `/api/cart` or
 * `/api/trips` is SENT at all, and no console error other than a failed-resource line. It does not count those lines:
 * in the Kyoto gate the signup mode is left as `waitlist` by the specs before this one, and a signed-out page in
 * waitlist mode also reads `/api/guest-plans/current` (the guest-plan rail, not this fix), so the exact count depends
 * on the run's environment. Signed in it asserts no failed request and no console error at all.
 *
 * Needs: the app on BASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { registerUser } from "./_journey-helpers";

async function errorsOn(page: Page): Promise<{ console: string[]; failed: string[]; sent: string[] }> {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  const sent: string[] = [];
  page.on("request", (r) => sent.push(`${r.method()} ${new URL(r.url()).pathname}`));
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
  return { console: consoleErrors, failed, sent };
}

for (const width of [1280, 375]) {
  test(`R4-11 — signed out at ${width}: no cart or plan-list read; the session check still answers 401`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const { console: errs, failed, sent } = await errorsOn(page);
    // The fix: the session user's cart and plan list are never asked for while signed out.
    expect(sent.filter((r) => /^GET \/api\/(cart|trips)$/.test(r)), "no cart or plan-list read for a guest").toEqual([]);
    expect(failed.filter((r) => /\/api\/(cart|trips)$/.test(r))).toEqual([]);
    // The session check is still asked, and still answers a guest 401.
    expect(failed, "the session check answers a guest 401").toContain("401 GET /api/auth/user");
    // No console error other than a failed-resource line.
    expect(errs.filter((e) => !/^Failed to load resource: the server responded with a status of 40[14]/.test(e)), "no other console error").toEqual([]);
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
