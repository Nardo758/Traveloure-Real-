/**
 * R1 (Leon, Nov 16 2026) - the SAVED summary reads the panel's own word, on both surfaces that draw it.
 *
 * Guest half: a Corporate Retreats guest plan saved with 20 reads "20 attendees" on the plan page at 1280 and
 * 375, and "20 adults" appears NOWHERE on that page. The spec sets waitlist mode for its own run (guest routes
 * answer 404 in any other mode - `guest-plans.routes.ts:122`) and restores it afterwards, failure included.
 *
 * Signed-in half: a plan whose occasion resolves to Corporate Retreats, party 20, reads "20 attendees" in the
 * slip HEADER chip - the second caller the guest check found, at `SlipView.tsx:2113`.
 */
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, assertDisposableDb, closePool, pool, registerUser, rows } from "./_journey-helpers";

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
  const r = await rows<{ setting_value: string }>(
    `SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`,
  );
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

const tid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

for (const width of [1280, 375]) {
  test(`R1 guest: a Corporate Retreats plan saved with 20 reads "20 attendees" at ${width}, with no "20 adults"`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });

    const made = await page.request.post("/api/guest-plans", {
      data: { destination: "Kyoto, Japan", title: "Kyoto corporate retreat", occasionSlug: "corporate", adults: 20 },
    });
    expect(made.ok(), `guest plan create answered ${made.status()}`).toBe(true);

    await page.goto(`${BASE_URL}/plans/new`, { waitUntil: "domcontentloaded" });
    await expect(tid(page, "guest-plan")).toBeVisible({ timeout: 25_000 });

    await expect(page.locator("body")).toContainText("20 attendees", { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText("20 adults");
  });
}

for (const width of [1280, 375]) {
  test(`R1 signed-in: the slip header reads "20 attendees" at ${width}, with no "20 adults"`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });

    await page.request.post(`${BASE_URL}/api/auth/logout`).catch(() => {});
    const user = await registerUser(page.request, "r1-header");
    const created = await page.request.post(`${BASE_URL}/api/trips`, {
      data: { title: `Corporate ${user.id.slice(0, 6)}`, destination: "Kyoto, Japan" },
    });
    expect(created.status(), `create trip failed: ${await created.text()}`).toBe(2 <= 299 ? created.status() : -1);
    const trip = await created.json();
    const tripId = trip.id as string;

    // The FINE occasion rides `experienceSlug` (trips.routes.ts:3607 allowlists it; the handler resolves the
    // slug against the catalog and writes `occasionSlug`, 3689-3704). `eventType` is the coarse enum and never
    // selects Corporate Retreats.
    const patch = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/occasion`, {
      data: { experienceSlug: "corporate", adults: 20 },
    });
    const patchBody = await patch.text();
    if (patch.status() === 400) {
      throw new Error(`occasion patch answered 400; body fields: ${patchBody}`);
    }
    expect(patch.ok(), `occasion patch answered ${patch.status()}: ${patchBody}`).toBe(true);
    expect(patchBody, `the patch must carry the stored slug: ${patchBody}`).toContain("corporate");

    await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("20 attendees", { timeout: 25_000 });
    await expect(page.locator("body")).not.toContainText("20 adults");
  });
}
