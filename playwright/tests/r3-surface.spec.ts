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

/** No emails in PR images (Leon, Nov 22 2026): any element showing an address is replaced by a same-size grey bar. */
async function maskEmails(page: Page): Promise<void> {
  await page.evaluate(() => {
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && EMAIL.test(n.textContent || ""));
      if (!own) continue;
      const ctx = el as HTMLElement;
      const style = getComputedStyle(ctx);
      const bar = document.createElement("span");
      bar.setAttribute("data-testid", "r3-email-mask");
      bar.style.display = "inline-block";
      bar.style.width = `${Math.max(60, Math.min(ctx.getBoundingClientRect().width, 220))}px`;
      bar.style.height = `${parseFloat(style.fontSize || "13")}px`;
      bar.style.background = "#D8CFEE";
      bar.style.borderRadius = "3px";
      for (const n of Array.from(ctx.childNodes)) if (n.nodeType === Node.TEXT_NODE) ctx.replaceChild(bar, n);
    }
  });
}

test("R3 P0: the surface mounts with ?surface=r3 and is captured at 1280 and 390", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tripId = await sixStopTrip(page);

  // The switch is a RUNTIME read: the server answers one boolean from its own env. Assert the server half first, so a
  // red run says which half is wrong (server not answering, or client not switching) instead of just "not found".
  const flagRes = await page.request.get(`${BASE_URL}/api/public/r3-surface`);
  expect(flagRes.status(), await flagRes.text()).toBe(200);
  const flag = (await flagRes.json()) as { on?: boolean };
  expect(flag.on, "the server must report R3_SURFACE=1 in this job").toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  // The R3 frame, not the old page: this is the assertion that makes the picture meaningful.
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "v1-1280.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "v1-390.png"), fullPage: true });
});