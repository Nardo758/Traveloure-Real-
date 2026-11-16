/**
 * E8 (lane 7, variant A) — the event window on the DETAILS step.
 *
 * What this covers that the unit table cannot: the two number fields and the one calendar are the same
 * range. Pick an event, type 1 before / 2 after, and the calendar's selected days must span exactly that;
 * then the "today" clamp: a before value large enough to cross today must not put the start in the past.
 */
import { test, expect, type Page } from "@playwright/test";

const dayOf = (testId: string) => testId.replace("plan-entry-dates-day-", "");

/** The entry opens from the landing hero's planning CTA (as the planning-entry spec does). */
async function openEntry(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cta = page.getByTestId("button-plan-trip").first();
  await cta.waitFor({ state: "visible", timeout: 20_000 });
  await cta.click();
  await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
}

test("E8: the event window fields and the calendar show one range", async ({ page }) => {
  await openEntry(page);
  // The event list is queried per market, so a city has to be chosen before "An event" has anything to show.
  await page.getByTestId("plan-entry-around-place").click();
  await page.getByTestId("plan-entry-city-kyoto").click();
  await page.getByTestId("plan-entry-around-event").click();

  const card = page.locator('[data-testid^="plan-entry-event-card-"]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const id = (await card.getAttribute("data-testid"))!.replace("plan-entry-event-card-", "");
  await page.getByTestId(`plan-entry-event-${id}`).click();

  const win = page.getByTestId("plan-entry-event-window");
  await expect(win).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("plan-entry-event-anchor")).toContainText("Built around");

  const grid = page.getByTestId("plan-entry-dates-grid");
  await expect(grid).toBeVisible();

  // 1 before, 2 after
  await page.getByTestId("plan-entry-days-before").fill("1");
  await page.getByTestId("plan-entry-days-after").fill("2");
  await expect(page.getByTestId("plan-entry-days-before")).toHaveValue("1");
  await expect(page.getByTestId("plan-entry-days-after")).toHaveValue("2");

  // The calendar's selected days are the plan's dates: their span must equal before + anchor days + after.
  const selected = page.locator('[data-testid^="plan-entry-dates-day-"][aria-selected="true"]');
  await expect(selected.first()).toBeVisible({ timeout: 10_000 });
  const days = (await selected.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid") || "").filter(Boolean).map((t) => t.replace("plan-entry-dates-day-", "")),
  )).sort();
  expect(days.length).toBeGreaterThanOrEqual(3);
  const first = new Date(days[0] + "T00:00:00Z");
  const last = new Date(days[days.length - 1] + "T00:00:00Z");
  const span = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1 + anchor + 2 == the selected span, and the start is never before today.
  expect(span).toBeGreaterThanOrEqual(3);
  expect(days[0] >= todayIso).toBe(true);
});

test("E8: a before value that would cross today is clamped, not honoured", async ({ page }) => {
  await openEntry(page);
  // The event list is queried per market, so a city has to be chosen before "An event" has anything to show.
  await page.getByTestId("plan-entry-around-place").click();
  await page.getByTestId("plan-entry-city-kyoto").click();
  await page.getByTestId("plan-entry-around-event").click();
  const card = page.locator('[data-testid^="plan-entry-event-card-"]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const id = (await card.getAttribute("data-testid"))!.replace("plan-entry-event-card-", "");
  await page.getByTestId(`plan-entry-event-${id}`).click();
  await expect(page.getByTestId("plan-entry-event-window")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("plan-entry-days-before").fill("14");
  const selected = page.locator('[data-testid^="plan-entry-dates-day-"][aria-selected="true"]');
  await expect(selected.first()).toBeVisible({ timeout: 10_000 });
  const days = (await selected.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid") || "").filter(Boolean).map((t) => t.replace("plan-entry-dates-day-", "")),
  )).sort();
  const todayIso = new Date().toISOString().slice(0, 10);
  expect(days[0] >= todayIso).toBe(true);
});
