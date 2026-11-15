import { test, expect, type Page } from "@playwright/test";
import { pickPlanDates } from "../_plan-dates-calendar";
import { BASE_URL, assertDisposableDb, closePool, pool, rows } from "./_journey-helpers";

/**
 * QA round 4 R4-1 (Leon, Nov 13, 2026) — a guest's plan survives Continue. In prod the create POST and a page-load
 * `GET /api/guest-plans/current` left together with no cookie; each minted a guest, and the read's cookie could win,
 * so the browser was named by a guest with no plan. Only the create mints now, and a read that lands late cannot
 * overwrite the created plan.
 *
 *   "A place": Plan around → A place → Kyoto → Start a plan
 *   "A date + A trip + 40 adults": Plan around → A date → dates → Kyoto → Next → A trip → Continue → on the plan,
 *   "Who's coming?" → 40 adults → Save
 *
 * Each path: the browser ends with ONE guest cookie, it names the plan the create made, and the plan is still there
 * after a reload. Guest plans exist only in waitlist mode, so this file switches the mode for its run (restored after,
 * the server's 15s settings cache waited out on both sides — the j-add-actions pattern). Run it on its own.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-guest-continue.spec.ts --project=chromium --workers=1
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

/** Every guest-cookie value the server set during the run, and the plan the create answered. */
function watch(page: Page) {
  const minted: string[] = [];
  let createdPlanId: string | null = null;
  page.on("response", async (res) => {
    const path = new URL(res.url()).pathname;
    if (!path.startsWith("/api/guest-plans")) return;
    const set = (await res.headerValue("set-cookie")) ?? "";
    for (const m of set.matchAll(/(?:^|,|\n)\s*traveloure_guest=([^;]+)/g)) minted.push(m[1]);
    if (res.request().method() === "POST" && path === "/api/guest-plans" && res.ok()) {
      createdPlanId = ((await res.json().catch(() => null)) as any)?.plan?.id ?? createdPlanId;
    }
  });
  return { minted, created: () => createdPlanId };
}

async function expectPlanHeld(page: Page, w: ReturnType<typeof watch>) {
  await expect(page).toHaveURL(/\/plans\/new/, { timeout: 15_000 });
  await expect.poll(() => w.created(), { timeout: 15_000 }).not.toBeNull();
  await expect(page.getByTestId("guest-plan")).toBeVisible({ timeout: 15_000 });
  // One guest, the create's: no read set a cookie of its own.
  expect(new Set(w.minted).size, `guest cookies set: ${w.minted.join(", ")}`).toBe(1);
  // The guest cookie is scoped to the guest routes (path /api/guest-plans).
  const cookies = await page.context().cookies(`${BASE_URL}/api/guest-plans/current`);
  expect(cookies.filter((c) => c.name === "traveloure_guest")).toHaveLength(1);
  // The browser's guest names the plan the create made, and it survives a reload.
  const current = await (await page.request.get("/api/guest-plans/current")).json();
  expect(current?.plan?.id).toBe(w.created());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("guest-plan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("guest-map-answers")).toContainText("Kyoto");
  return current.plan;
}

test("R4-1 'A place': the plan the create made is still the guest's after Continue and a reload", async ({ page }) => {
  test.setTimeout(90_000);
  const w = watch(page);
  await page.goto(`${BASE_URL}/?start=1&step=around`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("plan-entry-around-place").click({ timeout: 20_000 });
  await page.getByTestId("plan-entry-city-kyoto").click();
  await page.getByTestId("button-plan-entry-start").click();
  const plan = await expectPlanHeld(page, w);
  expect(plan.destination).toContain("Kyoto");
});

test("R4-1 'A date + A trip + 40 adults': dates, occasion and party held after Continue and a reload", async ({ page }) => {
  test.setTimeout(120_000);
  const w = watch(page);
  await page.goto(`${BASE_URL}/?start=1&step=around`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("plan-entry-around-date").click({ timeout: 20_000 });
  await page.getByTestId("plan-entry-date-pick").click();
  const now = new Date();
  const ymd = (d: number) => {
    const t = new Date(now.getFullYear(), now.getMonth() + 1, d);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  await pickPlanDates(page.getByTestId("plan-entry-dates"), ymd(1), ymd(4));
  await page.getByTestId("plan-entry-whats-on").getByTestId("plan-entry-city-kyoto").click();
  await page.getByTestId("button-plan-entry-next").click();
  // Step 2: QA pressed "A trip" (drawn as the default, chosen only when pressed) → Continue. With the dates already
  // chosen, Continue starts the plan; the party is asked on the plan ("Who's coming?", the guest update rail).
  await expect(page.getByTestId("plan-entry-step-occasion")).toBeVisible();
  await page.getByTestId("plan-entry-group-trips").click();
  await expect(page.getByTestId("plan-entry-group-trips")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("button-plan-entry-start").click();
  await expect(page.getByTestId("guest-plan")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("slip-meta-ask-party").click();
  await page.getByTestId("input-slip-who-adults").fill("40");
  await page.getByTestId("button-slip-who-save").click();
  await expect(page.getByTestId("slip-who-panel")).toHaveCount(0, { timeout: 15_000 });
  const plan = await expectPlanHeld(page, w);
  expect(plan.startDate).toBe(ymd(1));
  expect(plan.endDate).toBe(ymd(4));
  expect(plan.datesConfirmed).toBe(true);
  expect(plan.adults).toBe(40);
});
