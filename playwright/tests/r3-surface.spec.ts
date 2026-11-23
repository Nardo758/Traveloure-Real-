/**
 * r3-surface.spec.ts — the Revision 3 planning surface's screenshots (Leon, Nov 22 2026).
 *
 * Stands up a fresh traveler and a three-day Kyoto plan with six stops through the SAME fixtures the other browser
 * tests use (`registerAndSignIn` + `/api/trips` + `/api/trips/:id/items`), then opens `/plans/:id?surface=r3` and
 * captures the page at 1280 and at 390. It asserts only that the R3 surface mounted (`r3-surface`), so a screenshot is
 * never a picture of the old page.
 *
 * Writes `playwright/r3-captures/v1-1280.png` and `v1-390.png`, uploaded by the workflow as `r3-captures-<sha>`.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { registerAndSignIn } from "../utils/auth";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT_DIR = path.join(process.cwd(), "playwright", "r3-captures");
const uid = () => Math.random().toString(36).slice(2, 10);

const STOPS = [
  { title: "Fushimi Inari Shrine", dayNumber: 1, startTime: "09:00" },
  { title: "Tofuku-ji", dayNumber: 1, startTime: "14:00" },
  { title: "Arashiyama Bamboo Grove", dayNumber: 2, startTime: "09:30" },
  { title: "Tenryu-ji", dayNumber: 2, startTime: "13:00" },
  { title: "Kiyomizu-dera", dayNumber: 3, startTime: "09:00" },
  { title: "Ginkaku-ji", dayNumber: 3, startTime: "15:00" },
];

async function sixStopTrip(page: Page): Promise<string> {
  await registerAndSignIn(
    page.request,
    {
      email: `e2e-r3-${uid()}@example.com`,
      password: "R3Surface123!",
      firstName: "R3",
      lastName: "Surface",
    },
    BASE_URL,
  );
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "R3 days board plan", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const { id: tripId } = await trip.json();
  for (const stop of STOPS) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: stop });
    expect([200, 201], await res.text()).toContain(res.status());
  }
  return tripId as string;
}

test("R3 P0: the surface mounts with ?surface=r3 and is captured at 1280 and 390", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tripId = await sixStopTrip(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  // The R3 frame, not the old page: this is the assertion that makes the picture meaningful.
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(OUT_DIR, "v1-1280.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(OUT_DIR, "v1-390.png"), fullPage: true });
});