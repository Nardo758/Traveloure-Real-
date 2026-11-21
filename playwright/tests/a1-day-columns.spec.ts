/**
 * a1-day-columns.spec.ts - A1 in a real browser (Leon, Nov 20, 2026: "Go on the A1 screenshot").
 *
 * The unit tests prove a column is always open and that the slip turns the board on only at desktop width.
 * Nothing had drawn it. This spec builds a real three-day plan and checks:
 *
 *   B1 at 1280 wide the days are side-by-side, always-open columns: no day toggle, no "Expand all", every
 *      day's stop on screen, the columns in day order left to right on one row, no sideways page scroll
 *   B2 at 390 wide the same plan is a strip of day chips showing one day at a time (A2): no toggles, no columns
 *
 * It writes two screenshots to `playwright/a1-captures/`, uploaded by the workflow as `a1-captures-<sha>`.
 * Runs against the job's own app and database (a fresh traveler and plan per run); nothing is stubbed.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { registerAndSignIn } from "../utils/auth";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT_DIR = path.join(process.cwd(), "playwright", "a1-captures");
const uid = () => Math.random().toString(36).slice(2, 10);
const STOPS = [
  { title: "Fushimi Inari Shrine", dayNumber: 1, startTime: "09:00" },
  { title: "Arashiyama Bamboo Grove", dayNumber: 2, startTime: "09:30" },
  { title: "Kiyomizu-dera", dayNumber: 3, startTime: "15:00" },
];

/** A signed-in traveler with a three-day plan, one stop on each day. The pattern `slip-rail-actions.spec.ts` uses. */
async function threeDayPlan(page: Page): Promise<string> {
  await registerAndSignIn(
    page.request,
    { email: `e2e-a1-columns-${uid()}@example.com`, password: "DayColumns123!", firstName: "Day", lastName: "Columns", extra: { userType: "user" } },
    BASE_URL,
  );
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "A1 day columns plan", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const tripId = (await trip.json()).id as string;
  for (const stop of STOPS) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: stop });
    expect([200, 201], await res.text()).toContain(res.status());
  }
  return tripId;
}

async function openPlan(page: Page, tripId: string) {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test("B1 at 1280 the days are always-open columns, side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const tripId = await threeDayPlan(page);
  await openPlan(page, tripId);

  const board = page.locator('[data-day-layout="columns"]');
  await expect(board).toBeVisible({ timeout: 20_000 });
  const columns = board.locator('[data-column="true"]');
  expect(await columns.count(), "one column per day that holds a stop").toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-testid^="slip-day-toggle-"]'), "a column has no toggle").toHaveCount(0);
  await expect(page.getByTestId("slip-days-expand-all"), "nothing to expand").toHaveCount(0);
  for (const stop of STOPS) await expect(page.getByText(stop.title).first(), `${stop.title} is on screen without opening its day`).toBeVisible();

  const boxes = await columns.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }));
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i].x, `column ${i + 1} sits to the right of column ${i}`).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].w - 1);
    expect(Math.abs(boxes[i].y - boxes[0].y), "the columns share one row").toBeLessThanOrEqual(2);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page itself does not scroll sideways; only the row of columns may").toBeLessThanOrEqual(0);

  await board.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT_DIR, "days-board-1280.png"), fullPage: true });
});

test("B2 at 390 the same plan is a strip of day chips showing one day at a time", async ({ page }) => {
  // A2 (Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas - sanctioned rewrite): the phone no longer draws
  // one collapsible card per day; a strip of day chips picks the one day shown.
  await page.setViewportSize({ width: 390, height: 844 });
  const tripId = await threeDayPlan(page);
  await openPlan(page, tripId);

  await expect(page.locator('[data-day-layout="strip"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-day-layout="columns"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="slip-day-chip-"]'), "one chip per day").toHaveCount(3);
  await expect(page.getByTestId("slip-day-strip-hint")).toHaveText("Tap a day to see it.");
  await expect(page.locator('[data-testid^="slip-day-toggle-"]'), "the shown day has no toggle").toHaveCount(0);
  await expect(page.getByTestId("slip-days-expand-all")).toHaveCount(0);
  await expect(page.locator('[data-testid^="slip-day-body-"]'), "one day on screen").toHaveCount(1);
  await expect(page.getByTestId("slip-day-body-1")).toBeVisible();

  await page.getByTestId("slip-day-chip-2").click();
  await expect(page.getByTestId("slip-day-chip-2")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("slip-day-body-2")).toBeVisible();
  await expect(page.locator('[data-testid^="slip-day-body-"]')).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "no sideways scroll at phone width").toBeLessThanOrEqual(0);

  await page.getByTestId("slip-day-strip").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT_DIR, "days-phone-390.png"), fullPage: true });
});
