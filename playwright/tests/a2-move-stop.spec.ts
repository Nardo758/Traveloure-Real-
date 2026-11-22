/**
 * a2-move-stop.spec.ts - A2 part 1 in a real browser (Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas).
 *
 * The unit tests pin the Move sheet's words, its PATCH body and where the stop menu offers it. Nothing had
 * opened it. This spec builds a real three-day plan (one stop a day) and checks:
 *
 *   B1 at 390 wide: the stop's menu has "Move"; the sheet names the stop, lists the three days with the
 *      stop's own day reading "now" and not choosable, offers "Keep 09:00" and "Pick a time", and shows
 *      "Move to <day>" once a day is tapped. Confirming moves the stop: the sheet closes and the stop is on
 *      the day chosen after a reload (the chips' counts, and the stop under that day's chip).
 *   B2 at 1280 wide: the same sheet opens from a column of the days board.
 *   B3 at 1280 wide (A2 part 2): a stop dragged by its handle onto another day's column shows the dashed
 *      "Drop here" box naming that day and the stop it would follow; dropping it moves the stop there, after
 *      that stop, and a reload shows the same.
 *   B4 at 390 wide with a touch screen (hold-to-drag): the strip's hint is the full sentence; a stop HELD and
 *      dragged onto another day's chip moves to that day; held again and dragged below that day's other stop
 *      it shows the "Drop here" box and lands there. Both are read back after a reload.
 *   B5 at 1280 wide (A3): the owner's stop menu has Details, Move and Remove and NO "Move up" / "Move down" -
 *      the owner reorders by drag. B6: a ONE-day plan, which has no days board, still has drag handles, and a
 *      stop dragged below the other one stays there after a reload.
 *   B7 at 1280 wide (A7 part 1): a plan with stops opens on "Days and map" - a pins-only map to the right of
 *      the days board, with "All days" and one chip per day, and the three day columns still fit beside it.
 *      "Days only" takes the map away and writes `beside=none` to the URL, so a reload keeps it; "Days and
 *      map" brings it back. At 390 wide the switch does not offer "Days and map" and no map is beside the days.
 *
 * It writes six screenshots to `playwright/a2-captures/`, uploaded by the workflow as `a2-captures-<sha>`.
 * Runs against the job's own app and database (a fresh traveler and plan per run); nothing is stubbed.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { registerAndSignIn } from "../utils/auth";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT_DIR = path.join(process.cwd(), "playwright", "a2-captures");
const uid = () => Math.random().toString(36).slice(2, 10);

// 2027-04-01 is a Thursday: the days read "Thu 1", "Fri 2", "Sat 3".
const STOPS = [
  { title: "Fushimi Inari Shrine", dayNumber: 1, startTime: "09:00" },
  { title: "Arashiyama Bamboo Grove", dayNumber: 2, startTime: "09:30" },
  { title: "Kiyomizu-dera", dayNumber: 3, startTime: "15:00" },
];

/** A signed-in traveler with a three-day plan, one stop on each day. Returns the plan and day 1's stop. */
async function threeDayPlan(page: Page): Promise<{ tripId: string; stopId: string }> {
  await registerAndSignIn(
    page.request,
    { email: `e2e-a2-move-${uid()}@example.com`, password: "MoveStop123!", firstName: "Move", lastName: "Stop", extra: { userType: "user" } },
    BASE_URL,
  );
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "A2 move stop plan", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const tripId = (await trip.json()).id as string;
  const ids: string[] = [];
  for (const stop of STOPS) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: stop });
    expect([200, 201], await res.text()).toContain(res.status());
    ids.push((await res.json()).id as string);
  }
  expect(ids[0], "the created stop has an id").toBeTruthy();
  return { tripId, stopId: ids[0] };
}

async function openMoveSheet(page: Page, tripId: string, stopId: string) {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`item-menu-${stopId}`).click();
  await page.getByTestId(`item-menu-move-${stopId}`).click();
  await expect(page.getByTestId(`move-stop-sheet-${stopId}`)).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test("B1 at 390 the stop menu's Move opens the sheet, and confirming moves the stop to the day chosen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { tripId, stopId } = await threeDayPlan(page);
  await openMoveSheet(page, tripId, stopId);
  const sheet = page.getByTestId(`move-stop-sheet-${stopId}`);

  await expect(sheet).toContainText("Move Fushimi Inari Shrine to");
  await expect(sheet.locator('[data-testid^="move-stop-day-"]')).toHaveCount(3);
  await expect(sheet.getByTestId("move-stop-day-1")).toHaveText("Thu 1 · now");
  await expect(sheet.getByTestId("move-stop-day-1")).toBeDisabled();
  await expect(sheet.getByTestId("move-stop-day-2")).toHaveText("Fri 2 · 1 stop");
  await expect(sheet.getByTestId("move-stop-day-3")).toHaveText("Sat 3 · 1 stop");
  await expect(sheet.getByTestId("move-stop-keep-time")).toHaveText(/^Keep 0?9:00/);
  await expect(sheet.getByTestId("move-stop-pick-time")).toHaveText("Pick a time");
  await expect(sheet.getByTestId("move-stop-confirm"), "no day chosen yet").toHaveCount(0);

  await sheet.getByTestId("move-stop-day-2").click();
  await expect(sheet.getByTestId("move-stop-confirm")).toHaveText("Move to Fri 2 Apr");
  // The sheet's open animation must settle before the picture is taken.
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "move-sheet-390.png"), fullPage: false });

  await sheet.getByTestId("move-stop-confirm").click();
  await expect(sheet).toHaveCount(0);
  // Read back from the server, not from the page's cache: reload, then look under the day chosen.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-day-strip")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("slip-day-chip-1")).toHaveAttribute("aria-label", "Thu 1 · 0 stops");
  await expect(page.getByTestId("slip-day-chip-2")).toHaveAttribute("aria-label", "Fri 2 · 2 stops");
  await page.getByTestId("slip-day-chip-2").click();
  await expect(page.getByTestId("slip-day-body-2")).toContainText("Fushimi Inari Shrine");
  await expect(page.getByTestId("slip-day-body-2")).toContainText("Arashiyama Bamboo Grove");
});

test("B2 at 1280 the same sheet opens from a column of the days board", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { tripId, stopId } = await threeDayPlan(page);
  await openMoveSheet(page, tripId, stopId);
  const sheet = page.getByTestId(`move-stop-sheet-${stopId}`);

  await expect(sheet).toContainText("Move Fushimi Inari Shrine to");
  await sheet.getByTestId("move-stop-day-3").click();
  await expect(sheet.getByTestId("move-stop-confirm")).toHaveText("Move to Sat 3 Apr");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "move-sheet-1280.png"), fullPage: false });
});

test("B3 at 1280 a stop dragged by its handle onto another day lands after the stop it was dropped on", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { tripId, stopId } = await threeDayPlan(page);
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-day-layout="columns"]')).toBeVisible({ timeout: 30_000 });

  const handle = page.getByTestId(`stop-drag-handle-${stopId}`);
  await expect(handle).toBeVisible();
  await expect(page.locator('[data-testid^="stop-drag-handle-"]'), "one handle per stop").toHaveCount(3);
  await expect(page.getByTestId("stop-drop-slot"), "no landing box until a drag").toHaveCount(0);

  // Day 2 holds one stop (Arashiyama Bamboo Grove). Its row is found inside day 2's column.
  const dayTwoRow = page.getByTestId("slip-day-2").locator('[data-testid^="stop-drag-row-"]').first();

  // A native drag: press on the handle, then move in steps so the browser raises dragstart and dragover.
  // The board sits below the fold, and hovering the handle scrolls it into view - so the row is measured
  // AFTER that hover. Measured before it (as this test first did), the point was where the row used to be,
  // the pointer never reached a day column, and no landing box was drawn.
  await dayTwoRow.scrollIntoViewIfNeeded();
  await handle.hover();
  const box = await dayTwoRow.boundingBox();
  expect(box, "day 2's stop row has a box").toBeTruthy();
  const lowerHalf = { x: box!.x + box!.width / 2, y: box!.y + box!.height - 6 };
  await page.mouse.down();
  await page.mouse.move(lowerHalf.x, lowerHalf.y - 40, { steps: 8 });
  await page.mouse.move(lowerHalf.x, lowerHalf.y, { steps: 4 });
  const slot = page.getByTestId("stop-drop-slot");
  await expect(slot).toBeVisible();
  await expect(slot).toHaveText("Drop here · Fri, after Arashiyama Bamboo Grove");
  await page.screenshot({ path: path.join(OUT_DIR, "drag-drop-here-1280.png"), fullPage: false });

  // The landing box is under the pointer now; release on it.
  const slotBox = await slot.boundingBox();
  await page.mouse.move(slotBox!.x + slotBox!.width / 2, slotBox!.y + slotBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(slot).toHaveCount(0);

  const dayTwoStops = () => page.getByTestId("slip-day-2").locator('[data-testid^="stop-drag-row-"]');
  await expect(dayTwoStops()).toHaveCount(2);
  await expect(dayTwoStops().nth(0)).toContainText("Arashiyama Bamboo Grove");
  await expect(dayTwoStops().nth(1)).toContainText("Fushimi Inari Shrine");
  await expect(page.getByTestId("slip-day-1").locator('[data-testid^="stop-drag-row-"]')).toHaveCount(0);

  // Read back from the server, not from the page's cache.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-day-layout="columns"]')).toBeVisible({ timeout: 30_000 });
  await expect(dayTwoStops()).toHaveCount(2);
  await expect(dayTwoStops().nth(0)).toContainText("Arashiyama Bamboo Grove");
  await expect(dayTwoStops().nth(1)).toContainText("Fushimi Inari Shrine");
});

test.describe("hold-to-drag on a phone", () => {
  test.use({ hasTouch: true });

  test("B4 at 390 a held stop goes onto another day's chip, then to a place among that day's stops", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { tripId, stopId } = await threeDayPlan(page);
    await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
    const strip = page.getByTestId("slip-day-strip");
    await expect(strip).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("slip-day-strip-hint")).toHaveText("Tap a day to see it. Hold a stop to drag it onto a day above.");

    // Real touch input, through the browser's own input pipeline (not synthetic DOM events).
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const glide = async (from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) => {
      for (let i = 1; i <= steps; i++) {
        await touch("touchMove", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
        await page.waitForTimeout(25);
      }
    };
    /**
     * The strip just under the page's own top bar, so the chips and the day's stops are on screen together.
     * Every point is measured AFTER this scroll (B3's lesson).
     */
    const settle = async () => {
      await strip.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 96));
      await page.waitForTimeout(150);
    };
    const boxOf = async (testId: string) => {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} has a box`).toBeTruthy();
      expect(box!.y + box!.height, `${testId} is on screen`).toBeLessThanOrEqual(844);
      return box!;
    };
    const mid = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

    // 1. Hold day 1's stop, drag it onto day 2's chip.
    await settle();
    const held = mid(await boxOf(`stop-drag-row-${stopId}`));
    const chip = mid(await boxOf("slip-day-chip-2"));
    await touch("touchStart", held.x, held.y);
    await page.waitForTimeout(500);
    await glide(held, chip);
    await expect(page.getByTestId("slip-day-chip-2")).toHaveAttribute("data-drop-over", "true");
    await page.screenshot({ path: path.join(OUT_DIR, "hold-drag-390.png"), fullPage: false });
    await touch("touchEnd");
    await expect(page.getByTestId("slip-day-chip-2")).toHaveAttribute("aria-label", "Fri 2 · 2 stops");
    await expect(page.getByTestId("slip-day-chip-1")).toHaveAttribute("aria-label", "Thu 1 · 0 stops");

    // Read back from the server.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(strip).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("slip-day-chip-2")).toHaveAttribute("aria-label", "Fri 2 · 2 stops");

    // 2. On day 2 the stop sits first (09:00 before 09:30). Hold it and drag it below the other stop.
    await page.getByTestId("slip-day-chip-2").tap();
    const rows = page.getByTestId("slip-day-body-2").locator("[data-drag-row]");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Fushimi Inari Shrine");
    await settle();
    const first = mid(await boxOf(`stop-drag-row-${stopId}`));
    const otherId = await rows.nth(1).getAttribute("data-drag-row");
    const other = await boxOf(`stop-drag-row-${otherId}`);
    await touch("touchStart", first.x, first.y);
    await page.waitForTimeout(500);
    await glide(first, { x: other.x + other.width / 2, y: other.y + other.height - 6 });
    await expect(page.getByTestId("stop-drop-slot")).toHaveText("Drop here · Fri, after Arashiyama Bamboo Grove");
    await touch("touchEnd");
    await expect(page.getByTestId("stop-drop-slot")).toHaveCount(0);
    await expect(rows.nth(0)).toContainText("Arashiyama Bamboo Grove");
    await expect(rows.nth(1)).toContainText("Fushimi Inari Shrine");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(strip).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("slip-day-chip-2").tap();
    await expect(rows.nth(0)).toContainText("Arashiyama Bamboo Grove");
    await expect(rows.nth(1)).toContainText("Fushimi Inari Shrine");
  });
});

test("B5 at 1280 the owner's stop menu has Move, and no Move up / Move down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { tripId, stopId } = await threeDayPlan(page);
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`item-menu-${stopId}`).click();

  await expect(page.getByTestId(`item-menu-move-${stopId}`)).toHaveText("Move");
  await expect(page.getByTestId(`item-menu-details-${stopId}`)).toBeVisible();
  await expect(page.getByTestId(`item-menu-remove-${stopId}`)).toBeVisible();
  await expect(page.getByTestId(`item-menu-move-up-${stopId}`), "the owner reorders by drag").toHaveCount(0);
  await expect(page.getByTestId(`item-menu-move-down-${stopId}`)).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "owner-menu-1280.png"), fullPage: false });
});

test("B6 a one-day plan has no days board and still reorders by drag", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await registerAndSignIn(
    page.request,
    { email: `e2e-a3-oneday-${uid()}@example.com`, password: "MoveStop123!", firstName: "One", lastName: "Day", extra: { userType: "user" } },
    BASE_URL,
  );
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "A3 one-day plan", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-01" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const tripId = (await trip.json()).id as string;
  const ids: string[] = [];
  for (const stop of [
    { title: "Fushimi Inari Shrine", dayNumber: 1, startTime: "09:00" },
    { title: "Nishiki Market", dayNumber: 1, startTime: "12:00" },
  ]) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: stop });
    expect([200, 201], await res.text()).toContain(res.status());
    ids.push((await res.json()).id as string);
  }
  const [first, second] = ids;

  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-day-layout="columns"]'), "one day: no board").toHaveCount(0);
  const rows = page.locator("[data-drag-row]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Fushimi Inari Shrine");
  const handle = page.getByTestId(`stop-drag-handle-${first}`);
  await expect(handle).toBeVisible();

  // Measured after the hover's scroll (B3's lesson). Drop the first stop below the second.
  const secondRow = page.getByTestId(`stop-drag-row-${second}`);
  await secondRow.scrollIntoViewIfNeeded();
  await handle.hover();
  const box = await secondRow.boundingBox();
  expect(box, "the second stop's row has a box").toBeTruthy();
  const lowerHalf = { x: box!.x + box!.width / 2, y: box!.y + box!.height - 6 };
  await page.mouse.down();
  await page.mouse.move(lowerHalf.x, lowerHalf.y - 30, { steps: 8 });
  await page.mouse.move(lowerHalf.x, lowerHalf.y, { steps: 4 });
  const slot = page.getByTestId("stop-drop-slot");
  await expect(slot).toHaveText("Drop here · Thu, after Nishiki Market");
  const slotBox = await slot.boundingBox();
  await page.mouse.move(slotBox!.x + slotBox!.width / 2, slotBox!.y + slotBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(slot).toHaveCount(0);
  await expect(rows.nth(0)).toContainText("Nishiki Market");
  await expect(rows.nth(1)).toContainText("Fushimi Inari Shrine");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await expect(rows.nth(0)).toContainText("Nishiki Market");
  await expect(rows.nth(1)).toContainText("Fushimi Inari Shrine");
});

test("B7 at 1280 a plan with stops opens on 'Days and map'; 'Days only' hides the map; a phone is not offered it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { tripId } = await threeDayPlan(page);
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });

  // The default at desktop width: the map is beside the days, and the switch says so.
  const daysAndMap = page.getByTestId("button-slip-view-days-map");
  const daysOnly = page.getByTestId("button-slip-view-list");
  const panel = page.getByTestId("slip-days-map");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(daysAndMap).toHaveText("Days and map");
  await expect(daysAndMap).toHaveAttribute("aria-pressed", "true");
  await expect(daysOnly).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("button-slip-view-map")).toHaveAttribute("aria-pressed", "false");
  expect(new URL(page.url()).searchParams.get("beside"), "the default needs no word in the URL").toBeNull();
  expect(new URL(page.url()).searchParams.get("view")).toBe("days");

  // The chips: All days first and chosen, then the plan's three days.
  await expect(page.getByTestId("slip-days-map-chip-all")).toHaveText("All days");
  await expect(page.getByTestId("slip-days-map-chip-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid^="slip-days-map-chip-"]')).toHaveCount(4);
  await expect(page.getByTestId("slip-days-map-chip-1")).toHaveText("Thu");
  await expect(page.getByTestId("slip-days-map-browse")).toHaveText("Browse nearby");

  // The days board is still there; the map stands to its right, and three day columns fit without scrolling.
  const board = page.locator('[data-day-layout="columns"]');
  await expect(board).toBeVisible();
  for (const stop of STOPS) await expect(page.getByText(stop.title).first()).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  const boardBox = await board.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(boardBox && panelBox, "both have a box").toBeTruthy();
  expect(panelBox!.x, "the map is to the right of the days").toBeGreaterThanOrEqual(boardBox!.x + boardBox!.width - 1);
  expect(Math.round(panelBox!.width), "the map column is 320 wide").toBe(320);
  const boardScroll = await board.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(boardScroll, "three day columns fit beside the map").toBeLessThanOrEqual(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page itself does not scroll sideways").toBeLessThanOrEqual(0);

  // A day chip narrows the map to that day and says so on the chip.
  await page.getByTestId("slip-days-map-chip-2").click();
  await expect(page.getByTestId("slip-days-map-chip-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("slip-days-map-chip-2")).toHaveText("Fri 2");
  await expect(panel).toHaveAttribute("data-days-map-key", "2");
  await page.getByTestId("slip-days-map-chip-all").click();
  await page.screenshot({ path: path.join(OUT_DIR, "days-and-map-1280.png"), fullPage: true });

  // Days only hides the map, says so in the URL, and a reload keeps it.
  await daysOnly.click();
  await expect(panel).toHaveCount(0);
  await expect(daysOnly).toHaveAttribute("aria-pressed", "true");
  await expect(daysAndMap).toHaveAttribute("aria-pressed", "false");
  expect(new URL(page.url()).searchParams.get("beside")).toBe("none");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-day-layout="columns"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("slip-days-map")).toHaveCount(0);
  await expect(page.getByTestId("button-slip-view-list")).toHaveAttribute("aria-pressed", "true");

  // Days and map brings it back and clears the word.
  await page.getByTestId("button-slip-view-days-map").click();
  await expect(page.getByTestId("slip-days-map")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("beside")).toBeNull();

  // A phone has no room for both: the switch does not offer it and no map is beside the days.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-action-row")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("button-slip-view-list")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("button-slip-view-days-map")).toHaveCount(0);
  await expect(page.getByTestId("slip-days-map")).toHaveCount(0);
});
