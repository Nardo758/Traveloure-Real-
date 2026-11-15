/**
 * QA round 4 R4-8 (priority): a re-date on a plan with dates must save the window the traveler picked.
 *
 * Reproduced on `main` (c200a27) through the header strip's dates calendar, signed in, plan Dec 15–20 (+30..+35):
 *   - tap Jan 4, tap Jan 7  → the calendar read "Dec 15 – Jan 4", then "Dec 15 – Jan 7", and THAT was saved;
 *   - tap Nov 25, tap Nov 27 → "Leave date can't be before your arrive date", Save stayed disabled, nothing saved.
 * The QA report "date edits don't survive reload" is the first; "leave-before-arrive" the second. The cause was the
 * calendar's tap rule (QA round 3 option A: a tap on a complete range moved the leave day). The architect's ruling (a),
 * Nov 15, 2026 (`nextRange`, client/src/lib/plan-dates-range.ts): on a complete range a tap starts a new range.
 *
 * Each case picks a window through the header's calendar, saves, reloads, and reads the strip AND the plan row.
 *
 * Needs: the app on BASE_URL (journey helpers register the traveler through the app).
 */
import { test, expect, type Page } from "@playwright/test";
import { createItem, createTrip, registerUser } from "./_journey-helpers";
import { tapPlanDay } from "../_plan-dates-calendar";

const tid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A plan with confirmed dates (+30..+35) and one stop, so the header strip shows its dates control. */
async function planWithDates(page: Page): Promise<string> {
  const id = await createTrip(page.request, "R4-8 re-date");
  await createItem(page.request, id, "Tea ceremony");
  return id;
}

async function redate(page: Page, id: string, start: string, end: string) {
  await page.goto(`/experiences?tripId=${id}`);
  const strip = tid(page, "trip-strip-plan-dates").first();
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await strip.click();
  const panel = tid(page, "header-dates-panel");
  await expect(panel).toBeVisible();
  await tapPlanDay(panel, start);
  await tapPlanDay(panel, end);
  await expect(panel.locator('[role="alert"]'), "no leave-before-arrive refusal").toHaveCount(0);
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/trips/${id}`);
  await panel.getByTestId("button-slip-dates-save").click();
  expect((await saved).ok(), "the re-date PATCH answered 2xx").toBe(true);
  await page.reload();
  await expect(strip).toBeVisible({ timeout: 20_000 });
  const row = await (await page.request.get(`/api/trips/${id}`)).json();
  expect([String(row.startDate).slice(0, 10), String(row.endDate).slice(0, 10)], "the row holds the picked window").toEqual([start, end]);
  return strip.innerText();
}

test("R4-8 — a re-date through the header calendar saves the picked window (later, earlier, inside)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await registerUser(page.request, "r48-redate", "Re", "Date");
  // Later: on main this saved Dec 15 – Jan 7 (the old arrive day kept).
  await redate(page, await planWithDates(page), day(50), day(53));
  // Earlier: on main the first tap was refused as a leave day before the arrive day.
  await redate(page, await planWithDates(page), day(10), day(12));
  // Inside the old window: on main the first tap moved only the leave day.
  await redate(page, await planWithDates(page), day(32), day(33));
});
