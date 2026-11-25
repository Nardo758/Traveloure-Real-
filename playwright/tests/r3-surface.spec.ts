/**
 * r3-surface.spec.ts — the Revision 3 planning surface's screenshots (Leon, Nov 22 2026).
 *
 * Stands up a fresh traveler and a three-day Kyoto plan with six stops through the SAME fixtures the other browser
 * tests use (`registerAndSignIn` + `/api/trips` + `/api/trips/:id/items`), then opens `/plans/:id?surface=r3&capture=1` and
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
/** The map's settled state: how much of the canvas the loaded tiles span, and whether every pin is inside it. */
async function mapCoverage(page: Page) {
  return page.evaluate(() => {
    const container = (document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null)
      ?? (document.querySelector('[data-testid="slip-days-map-canvas"]') as HTMLElement | null);
    if (!container) return { w: 0, h: 0, pins: 0, pinsInside: false };
    const c = container.getBoundingClientRect();
    const tiles = Array.from(document.querySelectorAll(".leaflet-tile-loaded")).map((el) => el.getBoundingClientRect());
    const pins = Array.from(document.querySelectorAll("[data-pin-state]")).map((el) => el.getBoundingClientRect());
    if (!tiles.length) return { w: 0, h: 0, pins: pins.length, pinsInside: false };
    const left = Math.min(...tiles.map((r) => r.left));
    const right = Math.max(...tiles.map((r) => r.right));
    const top = Math.min(...tiles.map((r) => r.top));
    const bottom = Math.max(...tiles.map((r) => r.bottom));
    return {
      w: (Math.min(right, c.right) - Math.max(left, c.left)) / c.width,
      h: (Math.min(bottom, c.bottom) - Math.max(top, c.top)) / c.height,
      pins: pins.length,
      pinsInside: pins.every((r) => r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1),
    };
  });
}

/** Every tile in the view's own range is loaded - a blank block fails, not just a gap in the outer extent. */
async function tilesComplete(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = (document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null)
      ?? (document.querySelector('[data-testid="slip-days-map-canvas"]') as HTMLElement | null);
    if (!container) return 0;
    return container.querySelectorAll(".leaflet-tile:not(.leaflet-tile-loaded)").length;
  });
}

/**
 * THE DRAWN EXTENT (Leon, Nov 25 2026): measure the Leaflet wrappers the reader actually sees, and require real air -
 * centre-to-centre >= the drawn width + 8 for every pin pair, and ring-to-pin >= ring radius + pin radius + 8.
 */
async function drawnClearance(page: Page) {
  return page.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll(".leaflet-marker-icon")) as HTMLElement[];
    const pins = wraps.filter((el) => el.querySelector("[data-pin-state]"));
    const ring = wraps.find((el) => el.querySelector("[data-anchor-kind]")) ?? null;
    const c = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: el.offsetWidth || r.width, h: el.offsetHeight || r.height };
    };
    const pairs: Array<{ a: number; b: number; d: number; need: number }> = [];
    const p = pins.map(c);
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
        pairs.push({ a: i, b: j, d: Math.round(d * 10) / 10, need: Math.max(p[i].w, p[i].h) + 8 });
      }
    }
    let ringGap: { d: number; need: number } | null = null;
    if (ring) {
      const r = c(ring);
      const nearest = p.map((q) => ({ d: Math.hypot(q.x - r.x, q.y - r.y), need: r.w / 2 + Math.max(q.w, q.h) / 2 + 8 }))
        .sort((u, v) => u.d - v.d)[0];
      if (nearest) ringGap = { d: Math.round(nearest.d * 10) / 10, need: Math.round(nearest.need * 10) / 10 };
    }
    return { pins: p.length, ring: !!ring, pairs, ringGap };
  });
}

/** Fail the run if the drawn badges are too close, before OR after a shot. */
async function assertDrawnClear(page: Page, when: string) {
  const clear = await drawnClearance(page);
  const bad = clear.pairs.filter((p) => p.d < p.need);
  expect(bad, `${when}: every pin pair has ${8}px of air (${JSON.stringify(bad)})`).toHaveLength(0);
  if (clear.ringGap) {
    expect(clear.ringGap.d, `${when}: the ring keeps its air from every pin`).toBeGreaterThanOrEqual(clear.ringGap.need);
  }
}

/** No two pins intersect, and no pin intersects the stay ring. */
async function pinsClear(page: Page) {
  return page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll(".leaflet-marker-icon:has([data-pin-state])")).map((el) => el.getBoundingClientRect());
    const ring = document.querySelector(".leaflet-marker-icon:has([data-anchor-kind])")?.getBoundingClientRect() ?? null;
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) if (hit(rects[i], rects[j])) overlaps++;
      if (ring && hit(rects[i], ring)) overlaps++;
    }
    return { pins: rects.length, overlaps, hasRing: !!ring };
  });
}

/** The capture must show the settled map: shoot right after the poll, then prove nothing moved. */
/** DIAGNOSTIC: everything a capture can tell us about how its map got here, written next to the PNG. */
async function dumpMapDiag(page: Page, outPath: string) {
  const name = path.basename(outPath).replace(/\.png$/, "");
  const data = await page.evaluate(() => {
    const q = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const wraps = q(".leaflet-marker-icon");
    const pins = q("[data-pin-state]");
    const ring = q("[data-anchor-kind]");
    const tiles = q(".leaflet-tile");
    return {
      spread: (window as any).__r3Spread ?? null,
      maps: q(".leaflet-container").length,
      markWraps: wraps.length,
      pins: pins.length,
      ring: ring.length,
      pinBoxes: pins.map(box),
      pinWrapTransforms: wraps.map((el) => el.style.transform),
      ringBox: ring.length ? box(ring[0]) : null,
      tiles: { total: tiles.length, loaded: tiles.filter((el) => el.classList.contains("leaflet-tile-loaded")).length },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollY: window.scrollY,
    };
  });
  fs.writeFileSync(path.join(OUT_DIR, `diag-${name}.json`), JSON.stringify(data, null, 2));
}

async function shootStable(page: Page, outPath: string) {
  // A capture with no map (a phone page on its Days tab) has nothing to wait for: shoot it plainly.
  const hasMap = await page.evaluate(
    () =>
      !!(document.querySelector('[data-testid="r3-map-canvas-wrap"]') || document.querySelector('[data-testid="slip-days-map-canvas"]')),
  );
  if (!hasMap) {
    await page.screenshot({ path: outPath, fullPage: true });
    return;
  }
  await page.waitForFunction(
    () => {
      const c = (document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null)
        ?? (document.querySelector('[data-testid="slip-days-map-canvas"]') as HTMLElement | null);
      if (!c) return false;
      const tiles = Array.from(c.querySelectorAll(".leaflet-tile"));
      const loaded = tiles.filter((el) => el.classList.contains("leaflet-tile-loaded"));
      if (tiles.length === 0) return false;
      if (loaded.length !== tiles.length) return false;
      const box = c.getBoundingClientRect();
      const rects = loaded.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const w = (Math.min(right, box.right) - Math.max(left, box.left)) / box.width;
      const h = (Math.min(bottom, box.bottom) - Math.max(top, box.top)) / box.height;
      return w >= 0.9 && h >= 0.9;
    },
    { timeout: 10_000 },
  );
  await dumpMapDiag(page, outPath);
  await assertDrawnClear(page, "before the shot");
  await page.screenshot({ path: outPath, fullPage: true });
  await assertDrawnClear(page, "right after the shot");
  const after = await mapCoverage(page);
  expect(after.w, "the map's tile coverage holds after the shot").toBeGreaterThanOrEqual(0.9);
  expect(after.h, "the map's tile coverage holds after the shot").toBeGreaterThanOrEqual(0.9);
  expect(await tilesComplete(page), "no pending tile right after the shot").toBe(0);
  expect(await pagesTilesLoaded(page), "every tile is loaded right after the shot").toBe(true);
}

async function pagesTilesLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = (document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null)
      ?? (document.querySelector('[data-testid="slip-days-map-canvas"]') as HTMLElement | null);
    if (!c) return false;
    const tiles = Array.from(c.querySelectorAll(".leaflet-tile"));
    return tiles.length > 0 && tiles.every((el) => el.classList.contains("leaflet-tile-loaded"));
  });
}

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
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
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
  // U4: the rail is not rendered at all on an R3 plan page - the bar and the plan run full width.
  await expect(page.locator('[data-state="collapsed"], [data-state="expanded"]')).toHaveCount(0);
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
  await shootStable(page, path.join(OUT_DIR, "v1-1280.png"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
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
  await page.goto(`${BASE_URL}/plans/${withFindings}?surface=r3&capture=1`);
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
  await page.goto(`${BASE_URL}/plans/${quiet}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-optimize-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-optimize-sentence")).toContainText("Optimize checks real travel times");
  await expect(page.getByTestId("r3-optimize-cta")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-expert")).toBeVisible();
  await maskEmails(page);
  await page.getByTestId("r3-optimize-card").screenshot({ path: path.join(OUT_DIR, "u2-optimize-empty-1280.png") });
  await page.unroute("**/api/optimization-preview**");
});

/** A 7-day plan with two stops on day 1 and none on day 7 - the long strip and the empty day. */
async function longTrip(page: Page): Promise<string> {
  await registerAndSignIn(page.request, { email: `e2e-r3-long-${uid()}@example.com`, password: "R3Surface123!", firstName: "Long", lastName: "Plan" }, BASE_URL);
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "R3 long plan", destination: "Kyoto, Japan", startDate: "2027-06-01", endDate: "2027-06-07" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const { id } = await trip.json();
  for (const stop of [
    { title: "Arashiyama Bamboo Grove", dayNumber: 1, startTime: "10:00" },
    { title: "Tenryu-ji", dayNumber: 1, startTime: "13:00" },
  ]) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${id}/itinerary-items`, { data: stop });
    expect([200, 201], await res.text()).toContain(res.status());
  }
  return id as string;
}

test("U3: the phone surface - days, map, ideas, an empty day and a long trip", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tripId = await sixStopTrip(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });

  // Days: the pills, the strip (Ideas + 3 days), the hint, the open day's stops, the Optimize card under them.
  await expect(page.getByTestId("r3-phone-tabs")).toBeVisible();
  await expect(page.getByTestId("r3-phone-tab-days")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("r3-phone-day-chip")).toHaveCount(4);
  await expect(page.getByTestId("r3-phone-hint")).toBeVisible();
  // The sticky Ideas cell must be OPAQUE and as wide as a day cell, or scrolled cells show through it.
  const sticky = await page.getByTestId("r3-phone-day-chip").first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const cells = Array.from(document.querySelectorAll('[data-testid="r3-phone-day-chip"]')) as HTMLElement[];
    const dayCell = cells[1];
    return { bg: cs.backgroundColor, w: el.getBoundingClientRect().width, dayW: dayCell ? dayCell.getBoundingClientRect().width : 0 };
  });
  const alpha = sticky.bg.startsWith("rgba(") ? Number(sticky.bg.split(",")[3]?.replace(")", "") ?? "1") : 1;
  expect(alpha, `the sticky cell's computed background must be opaque (got ${sticky.bg})`).toBe(1);
  expect(sticky.w, "the sticky cell is as wide as a day cell").toBeGreaterThanOrEqual(Math.floor(sticky.dayW) - 1);
  // A short trip fits the row: no cell clipped, no horizontal scroll.
  const row = await page.getByTestId("r3-phone-day-strip").evaluate((el) => {
    const cells = Array.from(el.querySelectorAll('[data-testid="r3-phone-day-chip"]')) as HTMLElement[];
    const last = cells[cells.length - 1];
    return {
      rowRight: el.getBoundingClientRect().right,
      lastRight: last ? last.getBoundingClientRect().right : 0,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
  expect(row.lastRight, "the last day cell ends inside the row").toBeLessThanOrEqual(Math.ceil(row.rowRight));
  expect(row.scrollWidth, "a short trip's strip does not scroll").toBe(row.clientWidth);
  await expect(page.getByTestId("r3-phone-day-body")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-card")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u3-days-390.png"), fullPage: true });

  // Ideas: the first chip opens the ideas list.
  await page.getByTestId("r3-phone-day-chip").first().click();
  await expect(page.getByTestId("r3-phone-day-body")).toHaveAttribute("data-day", "0");
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u3-ideas-390.png"), fullPage: true });

  // Map: the tab swaps the body for the map, its chips and the count line; the map is re-fitted on open.
  await page.getByTestId("r3-phone-tab-map").click();
  await expect(page.getByTestId("r3-phone-tab-map")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("r3-map")).toBeVisible();
  await expect(page.getByTestId("r3-map-chips")).toBeVisible();
  await expect(page.getByTestId("r3-map-count")).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, { timeout: 20_000 }).catch(() => {});
  // 3: the map must really draw - at least one pin AND the stay ring, or the test fails.
  await expect(page.locator("[data-pin-state]").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-anchor-kind]").first()).toBeVisible({ timeout: 20_000 });
  // Wait until the tiles actually span the canvas: the re-fit lands first, the tiles arrive after, and a fixed pause
  // photographed a 76%-covered map. The poll is bounded and then asserted below, so a real gap still fails the run.
  await page
    .waitForFunction(
      () => {
        const container = document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null;
        if (!container) return false;
        const c = container.getBoundingClientRect();
        const tiles = Array.from(document.querySelectorAll(".leaflet-tile-loaded")).map((el) => el.getBoundingClientRect());
        if (!tiles.length) return false;
        const left = Math.min(...tiles.map((r) => r.left));
        const right = Math.max(...tiles.map((r) => r.right));
        return (Math.min(right, c.right) - Math.max(left, c.left)) / c.width >= 0.9;
      },
      { timeout: 25_000 },
    )
    .catch(() => {});
  const phoneCover = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null;
    if (!container) return { w: 0, h: 0, pins: 0, pinsInside: false };
    const c = container.getBoundingClientRect();
    const tiles = Array.from(document.querySelectorAll(".leaflet-tile-loaded")).map((el) => el.getBoundingClientRect());
    if (!tiles.length) return { w: 0, h: 0, pins: 0, pinsInside: false };
    const left = Math.min(...tiles.map((r) => r.left));
    const right = Math.max(...tiles.map((r) => r.right));
    const top = Math.min(...tiles.map((r) => r.top));
    const bottom = Math.max(...tiles.map((r) => r.bottom));
    const pins = Array.from(document.querySelectorAll("[data-pin-state]")).map((el) => el.getBoundingClientRect());
    return {
      w: (Math.min(right, c.right) - Math.max(left, c.left)) / c.width,
      h: (Math.min(bottom, c.bottom) - Math.max(top, c.top)) / c.height,
      pins: pins.length,
      pinsInside: pins.every((r) => r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1),
    };
  });
  expect(phoneCover.w, "the phone map's tiles cover its width").toBeGreaterThanOrEqual(0.9);
  expect(phoneCover.h, "the phone map's tiles cover its height").toBeGreaterThanOrEqual(0.9);
  expect(phoneCover.pins, "the six stops are drawn on the phone map").toBeGreaterThanOrEqual(6);
  expect(phoneCover.pinsInside, "every pin is inside the phone map").toBe(true);
  const phonePins = await pinsClear(page);
  expect(phonePins.overlaps, "no two pins (or a pin and the ring) intersect at 390").toBe(0);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await shootStable(page, path.join(OUT_DIR, "u3-map-390.png"));

  // A 7-day trip: the strip scrolls, the last cell cut off, and an empty day offers only the dashed Add.
  const longId = await longTrip(page);
  await page.goto(`${BASE_URL}/plans/${longId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-phone-day-strip")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-phone-day-chip")).toHaveCount(8);
  await page.getByTestId("r3-phone-day-chip").last().click();
  await expect(page.getByTestId("r3-phone-day-body")).toHaveAttribute("data-day", "7");
  await expect(page.getByTestId("r3-phone-add")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u3-empty-day-390.png"), fullPage: true });

  // The stop menu on the long trip, open on the approved Move entry.
  await page.getByTestId("r3-phone-day-chip").nth(1).click();
  await expect(page.getByTestId("r3-phone-stop-card").first()).toBeVisible();
  await page.getByTestId("r3-phone-stop-menu").first().click();
  await expect(page.getByTestId("r3-phone-move")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u3-long-trip-390.png"), fullPage: true });

  // Guest: LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The slip response is rewritten to a non-owner role so the hidden
  // Optimize card can be photographed; nothing in production changes.
  await page.unroute("**/api/optimization-preview**");
  await page.route(`**/api/trips/${tripId}/plancard**`, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.tripRole = "guest";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-surface")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-phone-tabs")).toBeVisible();
  await expect(page.getByTestId("r3-optimize-card")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u3-guest-390.png"), fullPage: true });
  await page.unroute(`**/api/trips/${tripId}/plancard**`);
});

test("U4: the V24 top bar - the bar, the plan switcher and the account menu", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tripId = await sixStopTrip(page);

  for (const width of [1280, 390] as const) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
    await expect(page.getByTestId("r3-topbar")).toBeVisible({ timeout: 30_000 });
    // The bar must not cover the plan: its bottom is at or above the eyebrow's top.
    const barBox = await page.getByTestId("r3-topbar").boundingBox();
    const eyebrowBox = await page.getByTestId("r3-eyebrow").boundingBox();
    expect(barBox && eyebrowBox && barBox.y + barBox.height, `the bar ends above the eyebrow (${width})`).toBeLessThanOrEqual(Math.ceil(eyebrowBox!.y) + 1);
    if (width === 1280) {
      await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const cover = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="r3-map-canvas-wrap"]') as HTMLElement | null
          ?? (document.querySelector('[data-testid="slip-days-map-canvas"]') as HTMLElement | null);
        if (!container) return { w: 0, h: 0 };
        const c = container.getBoundingClientRect();
        const tiles = Array.from(document.querySelectorAll(".leaflet-tile-loaded")).map((el) => el.getBoundingClientRect());
        if (!tiles.length) return { w: 0, h: 0 };
        const left = Math.min(...tiles.map((r) => r.left));
        const right = Math.max(...tiles.map((r) => r.right));
        const top = Math.min(...tiles.map((r) => r.top));
        const bottom = Math.max(...tiles.map((r) => r.bottom));
        const pins = Array.from(document.querySelectorAll("[data-pin-state]")).map((el) => el.getBoundingClientRect());
        const pinsInside = pins.every((r) => r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1);
        return {
          w: (Math.min(right, c.right) - Math.max(left, c.left)) / c.width,
          h: (Math.min(bottom, c.bottom) - Math.max(top, c.top)) / c.height,
          pins: pins.length,
          pinsInside,
        };
      });
      expect(cover.w, "loaded tiles span the map's width").toBeGreaterThanOrEqual(0.9);
      expect(cover.h, "loaded tiles span the map's height").toBeGreaterThanOrEqual(0.9);
      expect(cover.pins, "the six stops are drawn").toBeGreaterThanOrEqual(6);
      expect(cover.pinsInside, "every pin is inside the map").toBe(true);
      const clear = await pinsClear(page);
      expect(clear.overlaps, "no two pins (or a pin and the ring) intersect at 1280").toBe(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 390) {
      // No sideways overflow at 390, and the avatar is fully inside the viewport.
      const doc = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(doc, "the phone page is exactly 390 wide").toBe(390);
      const avatar = await page.getByTestId("r3-account-button").boundingBox();
      expect(avatar && avatar.x + avatar.width, "the avatar is fully visible").toBeLessThanOrEqual(390);
    }
    await maskEmails(page);
    await shootStable(page, path.join(OUT_DIR, `u4-bar-${width}.png`));

    await page.getByTestId("r3-plan-switcher-button").click();
    await expect(page.getByTestId("r3-plan-switcher-panel")).toBeVisible();
    const trigger = await page.getByTestId("r3-plan-switcher-button").boundingBox();
    const panel = await page.getByTestId("r3-plan-switcher-panel").boundingBox();
    expect(Math.abs((panel?.x ?? 0) - (trigger?.x ?? 0)), "the switcher menu is anchored to its trigger").toBeLessThanOrEqual(8);
    await expect(page.getByTestId("r3-plan-row").first()).toBeVisible();
    await expect(page.getByTestId("r3-plan-start")).toBeVisible();
    await maskEmails(page);
    await page.screenshot({ path: path.join(OUT_DIR, `u4-switcher-${width}.png`), fullPage: true });
    await page.getByTestId("r3-plan-switcher-button").click();

    await page.getByTestId("r3-account-button").click();
    await expect(page.getByTestId("r3-account-panel")).toBeVisible();
    const avatar = await page.getByTestId("r3-account-button").boundingBox();
    const accountPanel = await page.getByTestId("r3-account-panel").boundingBox();
    expect(
      Math.abs((accountPanel?.x ?? 0) + (accountPanel?.width ?? 0) - ((avatar?.x ?? 0) + (avatar?.width ?? 0))),
      "the account menu is right-anchored to the avatar",
    ).toBeLessThanOrEqual(8);
    if (width === 1280) {
      await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await expect(page.getByTestId("r3-account-profile")).toBeVisible();
    await expect(page.getByTestId("r3-account-bookings")).toBeVisible();
    await expect(page.getByTestId("r3-account-logout")).toBeVisible();
    await maskEmails(page);
    await shootStable(page, path.join(OUT_DIR, `u4-account-${width}.png`));
    await page.getByTestId("r3-account-button").click();
  }
});

test("U4: the switcher with three plans (current, no dates, past)", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tripId = await sixStopTrip(page);
  // LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The plans list is stubbed so the three row states can be photographed.
  await page.route("**/api/trips", async (route) => {
    const res = await route.fetch().catch(() => null);
    const real = res ? await res.json().catch(() => null) : null;
    const current = Array.isArray(real) ? real.find((p: any) => p.id === tripId) : null;
    const rows = [
      { ...(current ?? { id: tripId, title: "Your Kyoto plan", startDate: "2027-04-01", endDate: "2027-04-03" }) },
      { id: "stub-no-dates", title: "Your plan", startDate: null, endDate: null },
      { id: "stub-past", title: "Your Kyoto plan", startDate: "2026-04-03", endDate: "2026-04-05" },
    ];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-topbar")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-plan-switcher-button").click();
  await expect(page.getByTestId("r3-plan-row")).toHaveCount(3);
  await expect(page.getByTestId("r3-plan-row").first()).toBeVisible();
  await expect(page.getByTestId("r3-plan-row").nth(2), "the ended plan reads Past").toContainText("Past");
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, { timeout: 20_000 }).catch(() => {});
  await maskEmails(page);
  await shootStable(page, path.join(OUT_DIR, "u4-switcher-three-1280.png"));
  await page.unroute("**/api/trips");
});

test("U5: the no-plan landing - bar, cities, waitlist and the empty switcher", async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // A signed-in traveller with NO plans: a fresh registration never has one.
  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-noplan-${uid()}@example.com`, password: "R3Surface123!", firstName: "No", lastName: "Plan" },
    BASE_URL,
  );
  // LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The admin market list is stubbed: one open city, one with an opening, one
  // with no date, so all three row states can be photographed.
  await page.route("**//api/public/live-markets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        launch: "kyoto",
        live: ["kyoto"],
        beta: [],
        dates: { porto: "2027-03-01" },
      }),
    });
  });
  await page.route("**/api/public/signup-mode", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "open", launchMarketSlug: "kyoto" }) });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  // Log what actually mounted BEFORE asserting: the gate, its decision, and whether the page or the home rendered.
  const gate = page.getByTestId("r3-no-plan-gate");
  const gateCount = await gate.count();
  console.log(
    `[u5-gate] present=${gateCount > 0} decision=${gateCount ? await gate.first().getAttribute("data-decision") : "<absent>"} ` +
      `page=${await page.getByTestId("r3-no-plan-page").count()} skeleton=${await page.getByTestId("r3-no-plan-skeleton").count()} ` +
      `home=${await page.getByText("TRAVELOURE").count()}`,
  );
  await expect(page.getByTestId("r3-no-plan-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-no-plan-title")).toContainText("Where are you going?");
  await expect(page.getByTestId("r3-no-plan-open-line")).toContainText("Now open in");
  await expect(page.getByTestId("r3-no-plan-waitlist-cta").first()).toContainText("Join the");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-no-plan-1280.png"), fullPage: true });

  // the empty switcher: it opens on the bar's plan slot and keeps its footer
  await page.getByTestId("r3-plan-switcher-button").click();
  await expect(page.getByTestId("r3-plan-switcher-panel")).toBeVisible();
  await expect(page.getByTestId("r3-plan-row")).toHaveCount(0);
  await expect(page.getByTestId("r3-plan-start")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-switcher-1280.png"), fullPage: true });
  await page.getByTestId("r3-plan-switcher-button").click();

  // the waitlist block, in view
  await expect(page.getByTestId("r3-no-plan-waitlist")).toBeVisible();
  await page.getByTestId("r3-no-plan-waitlist").scrollIntoViewIfNeeded();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-waitlist-1280.png"), fullPage: true });

  // the same page at 390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(page.getByTestId("r3-no-plan-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("r3-no-plan-title")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-no-plan-390.png"), fullPage: true });
});
