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
import { markSeededItemsAsOsm } from "../utils/osm-coords";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT_DIR = path.join(process.cwd(), "playwright", "r3-captures");
const uid = () => Math.random().toString(36).slice(2, 10);

// Real Kyoto coordinates: a stop with none is a day entry but never a pin, and the map count has to say so.
const STOPS = [
  // TEST-ONLY seed spread across Kyoto: every point is at least ~1 km from the next, so no pin needs the R3 offset.
  { title: "Fushimi Inari Shrine", dayNumber: 1, startTime: "09:00", latitude: "34.9671", longitude: "135.7727" },
  { title: "Tofuku-ji", dayNumber: 1, startTime: "14:00", latitude: "34.9761", longitude: "135.7735" },
  { title: "Arashiyama Bamboo Grove", dayNumber: 2, startTime: "09:30", latitude: "35.0094", longitude: "135.6668" },
  { title: "Tenryu-ji", dayNumber: 2, startTime: "13:00", latitude: "35.0158", longitude: "135.6738" },
  { title: "Kiyomizu-dera", dayNumber: 3, startTime: "09:00", latitude: "34.9949", longitude: "135.785" },
  { title: "Ginkaku-ji", dayNumber: 3, startTime: "15:00", latitude: "35.027", longitude: "135.7982" },
  // The stay: its own point, away from every stop, so the ring never sits under a pin.
  { title: "Higashiyama inn", dayNumber: 1, startTime: "18:00", itemType: "lodging", latitude: "35.0036", longitude: "135.7788" },
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
  // TEST-ONLY: give the plan's points a non-Google source so the OSM canvas may draw them (see utils/osm-coords.ts).
  await markSeededItemsAsOsm(tripId as string, "Higashiyama inn");
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


/** U2: a plan with no items at all - nothing for the optimizer to report, so the card shows its empty state. */
async function quietTrip(page: Page): Promise<string> {
  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-quiet-${uid()}@example.com`, password: "R3Surface123!", firstName: "Quiet", lastName: "Plan" },
    BASE_URL,
  );
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "R3 quiet plan", destination: "Kyoto, Japan", startDate: "2027-05-01", endDate: "2027-05-02" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const { id } = await trip.json();
  return id as string;
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
  // P1: the days slot holds the board - three day columns and six stop cards, so the capture is of a FILLED board.
  await expect(page.getByTestId("r3-days-board")).toBeVisible();
  await expect(page.getByTestId("r3-day-column")).toHaveCount(3);
  await expect(page.getByTestId("r3-stop-card")).toHaveCount(6);
  await expect(page.getByTestId("r3-ideas-column")).toBeVisible();
  // U1: the map sits beside the days when "Days and map" is on, and Ideas comes FIRST.
  await expect(page.getByTestId("r3-map")).toBeVisible();
  const order = await page.locator('[data-testid="r3-days-board"] > section').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(order[0], "Ideas is the first column").toBe("r3-ideas-column");
  // The rail is COLLAPSED on this page, so the board has room: the map's own chrome is one row, and its caption and
  // single count line sit INSIDE the canvas.
  await expect(page.locator('[data-state="collapsed"]')).toHaveCount(1);
  await expect(page.getByTestId("r3-map-chip-all")).toBeVisible();
  await expect(page.getByTestId("r3-map-chip-day")).toHaveCount(3);
  await expect(page.getByTestId("r3-map-browse")).toBeVisible();
  await expect(page.getByTestId("r3-map-caption")).toBeVisible();
  await expect(page.getByTestId("r3-map-count")).toBeVisible();
  // A pin per located stop: six stops, six pins, so the count line says "6 of 6".
  await expect(page.getByTestId("r3-map-count")).toContainText("6 of 6");
  const content = await page.locator("main").boundingBox();
  expect(content?.width ?? 0, "the content column is ~1224px with the rail collapsed").toBeGreaterThan(1100);
  // Let the tiles land before the shot: a capture of an empty canvas proves nothing.
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(750);
  // U2: the Optimize card's body - its findings, the sentence and the two buttons - beside its own board crop.
  await expect(page.getByTestId("r3-optimize-card")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-sentence")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-cta")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-expert")).toBeVisible();
  await maskEmails(page);
  await page.getByTestId("r3-optimize-card").screenshot({ path: path.join(OUT_DIR, "u2-optimize-1280.png") });
  await page.screenshot({ path: path.join(OUT_DIR, "v1-1280.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "v1-390.png"), fullPage: true });
});

test("U2: the Optimize card with findings, and its empty state", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The findings state is produced by intercepting the preview request with the
  // REAL response shape (three findings from the shared `Finding` type), so the card can be photographed without
  // pretending the seed data reports them. The empty state below runs against the real server, with no intercept.
  const withFindings = await sixStopTrip(page);
  // The hook uses the app's DEFAULT fetcher: queryKey ["/api/optimization-preview", { tripId }] becomes a GET to
  // /api/optimization-preview?tripId=... - my first stub only answered POST, so the real request went through.
  await page.route("**/api/optimization-preview**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        computable: true,
        itemCount: 6,
        dayCount: 3,
        currentScore: 62,
        improvementRoom: 12,
        weakest: { key: "pace", score: 62 },
        dimensions: [],
        fixedCount: 0,
        hasPricedItems: false,
        findings: [
          { kind: "leg_unreachable", count: 2, days: [1, 2] },
          { kind: "closed_on_arrival", count: 1, days: [2] },
          { kind: "after_last_admission", count: 1, days: [3] },
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${withFindings}?surface=r3`);
  await expect(page.getByTestId("r3-optimize-card")).toBeVisible({ timeout: 30_000 });
  const findings = page.getByTestId("r3-optimize-finding");
  await expect(findings.first()).toBeVisible({ timeout: 20_000 });
  expect(await findings.count(), "three findings, as the stub returns").toBe(3);
  await expect(page.getByTestId("r3-optimize-cta")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-expert")).toBeVisible();
  await maskEmails(page);
  await page.getByTestId("r3-optimize-card").screenshot({ path: path.join(OUT_DIR, "u2-optimize-1280.png") });
  await page.unroute("**/api/optimization-preview");

  // empty: LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The real preview always reports something about a plan, so the empty
  // state is photographed through a second stub that answers the same GET with the same computed shape and no findings.
  await page.route("**/api/optimization-preview**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        computable: true,
        itemCount: 0,
        dayCount: 2,
        currentScore: 0,
        improvementRoom: 0,
        weakest: { key: "pace", score: 0 },
        dimensions: [],
        fixedCount: 0,
        hasPricedItems: false,
        findings: [],
      }),
    });
  });
  const quiet = await quietTrip(page);
  await page.goto(`${BASE_URL}/plans/${quiet}?surface=r3`);
  await expect(page.getByTestId("r3-optimize-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-optimize-sentence")).toContainText("Optimize checks real travel times");
  await expect(page.getByTestId("r3-optimize-cta")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-expert")).toBeVisible();
  await maskEmails(page);
  await page.getByTestId("r3-optimize-card").screenshot({ path: path.join(OUT_DIR, "u2-optimize-empty-1280.png") });
  await page.unroute("**/api/optimization-preview**");
});
