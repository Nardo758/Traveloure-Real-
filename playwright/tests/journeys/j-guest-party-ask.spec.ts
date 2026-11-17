/**
 * E9 (option A) - a GUEST plan's party ask, in a browser.
 *
 * WHAT THIS DOES, exactly: it switches the app INTO waitlist mode (guest plans exist only there -
 * `guest-plans.routes.ts:122` answers 404 for every guest route in any other mode), mints ONE guest plan
 * through `POST /api/guest-plans` with `occasionSlug: "corporate"` (Corporate Retreats, whose seeded row
 * carries `vocabulary: "attendees"`), opens that plan's page, presses "Who's coming?" and asserts the panel
 * asks ONE field labelled "Attendees" with no kids field. It also records requests on the page and asserts
 * none goes to `/api/trips/<id>`. The mode is restored afterwards, on failure too.
 *
 * It does NOT walk the entry UI: this gate is not in waitlist mode, so the entry's Start does not mint a
 * claimable guest plan here, and an earlier draft of this file that drove the UI passed locally (open mode)
 * and failed in CI in 451ms.
 *
 * The panel's controls are the ones the passing guest journey already uses
 * (`j-guest-continue.spec.ts:117-120`): slip-meta-ask-party, input-slip-who-adults, button-slip-who-save,
 * slip-who-panel.
 */
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, assertDisposableDb, closePool, pool, rows } from "./_journey-helpers";

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
  // CONFIRM THE SEED, not the assertion: Corporate Retreats must carry vocabulary "attendees". Reported in
  // the log; if a database does not set it, this line says so and the assertion below still stands unchanged.
  const seeded = await rows<{ slug: string; vocabulary: string | null }>(
    `SELECT slug, vocabulary FROM experience_types WHERE slug = 'corporate'`,
  );
  console.log(`E9 seed check: corporate row = ${JSON.stringify(seeded[0] ?? null)}`);
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await setMode(priorMode);
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
  await closePool();
});

const tid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

test("E9: a guest plan's Corporate Retreats asks Attendees only, and never calls /api/trips/<id>", async ({ page }) => {
  test.setTimeout(120_000);
  const tripReads: string[] = [];
  page.on("request", (req) => {
    if (/\/api\/trips\/[^/?]+/.test(req.url())) tripReads.push(req.url());
  });

  const made = await page.request.post("/api/guest-plans", {
    data: { destination: "Kyoto, Japan", title: "Kyoto corporate retreat", occasionSlug: "corporate" },
  });
  expect(made.ok(), `guest plan create answered ${made.status()}`).toBe(true);

  await page.goto(`${BASE_URL}/plans/new`, { waitUntil: "domcontentloaded" });
  await expect(tid(page, "guest-plan")).toBeVisible({ timeout: 25_000 });

  await tid(page, "slip-meta-ask-party").click();
  const panel = tid(page, "slip-who-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  await expect(panel).toContainText("Attendees");
  await expect(tid(page, "input-slip-who-adults")).toHaveCount(1);
  await expect(tid(page, "input-slip-who-kids")).toHaveCount(0);

  expect(tripReads, `trip reads seen: ${tripReads.join(", ")}`).toEqual([]);
});
