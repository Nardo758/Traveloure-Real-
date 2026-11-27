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

/** The one line per case: present/show/page/home, read after the root is visible. */
async function logGate(page: Page, suffix = "") {
  const gate = page.getByTestId("r3-no-plan-gate");
  const present = (await gate.count()) > 0;
  const show = present ? await gate.first().getAttribute("data-show") : "<absent>";
  console.log(
    `[u5-gate] present=${present} show=${show} page=${await page.getByTestId("r3-no-plan-page").count()} ` +
      `home=${await page.getByTestId("landing-root").count()}${suffix ? " " + suffix : ""}`,
  );
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
  // Rule out a stale bundle: these loads bypass the HTTP cache.
  await page.setExtraHTTPHeaders({ "cache-control": "no-cache", pragma: "no-cache" });
  // LOOKS CAPTURE ONLY - NOT DATA COVERAGE. The admin market list is stubbed: Kyoto live, Porto dated, Edinburgh
  // closed with no date, so all three row states can be photographed and checked.
  await page.route("**/api/public/live-markets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ launch: "kyoto", live: ["kyoto"], beta: ["edinburgh"], dates: { porto: "2027-03-01" } }),
    });
  });

  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-noplan-${uid()}@example.com`, password: "R3Surface123!", firstName: "No", lastName: "Plan" },
    BASE_URL,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(
    page.getByTestId("landing-root").or(page.getByTestId("r3-no-plan-page")).first(),
  ).toBeVisible({ timeout: 30_000 });
  await logGate(page);
  await expect(page.getByTestId("r3-no-plan-page")).toBeVisible();
  // u5-popup: the landing is showing, so the pop-up must NOT have opened, and surface=r3 must survive the load.
  await expect(page.getByRole("dialog"), "the landing does not open the pop-up").toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("surface"), "surface=r3 survives the landing load").toBe("r3");
  await expect(page.getByTestId("r3-no-plan-title")).toContainText("Where are you going?");
  await expect(page.getByTestId("r3-no-plan-open-line")).toContainText("Now open in");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-no-plan-1280.png"), fullPage: true });

  // A tap on "Start a plan" opens the pop-up (the landing only suppresses the automatic open).
  await page.getByTestId("r3-no-plan-start").click();
  await expect(page.getByRole("dialog"), "a tap on Start a plan opens the pop-up").toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog"), "the pop-up closes").toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(() => new URL(page.url()).search, { message: "closing over the landing restores the door URL" })
    .toBe("?start=1&surface=r3");
  // Fifth case: after opening and closing the pop-up from the landing, the landing is still what shows.
  await logGate(page, "(after close)");
  expect(await page.getByTestId("r3-no-plan-gate").first().getAttribute("data-show"), "(after close): show=landing").toBe("landing");
  // A reload of the restored door URL shows the landing again, with no dialog.
  await page.reload();
  await expect(page.getByTestId("r3-no-plan-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await logGate(page, "(after reload)");

  await page.getByTestId("r3-plan-switcher-button").click();
  await expect(page.getByTestId("r3-plan-switcher-panel")).toBeVisible();
  await expect(page.getByTestId("r3-plan-row")).toHaveCount(0);
  await expect(page.getByTestId("r3-plan-start")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-switcher-1280.png"), fullPage: true });
  await page.getByTestId("r3-plan-switcher-button").click();

  // Porto is closed and dated: choose its pill, which shows its opening line and its waitlist button.
  await page.getByTestId("r3-no-plan-city").filter({ hasText: "Porto" }).click(); // porto pill
  await expect(page.getByTestId("r3-no-plan-waitlist")).toHaveAttribute("data-city", "porto");
  await expect(page.getByTestId("r3-no-plan-opening")).toContainText("Opening March 2027");
  await page.getByTestId("r3-no-plan-waitlist").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("r3-no-plan-waitlist")).toBeVisible();
  // u5-waitlist: captured WHILE Porto is chosen - filled pill, "Opening March 2027", purple join button.
  await expect(page.getByTestId("r3-no-plan-city").filter({ hasText: "Porto" })).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("r3-no-plan-waitlist-cta")).toContainText("Join the Porto waitlist");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-waitlist-1280.png"), fullPage: true });

  // Edinburgh is closed with no date: its block offers its waitlist button and shows NO opening line.
  await page.getByTestId("r3-no-plan-city").filter({ hasText: "Edinburgh" }).click();
  const edinburgh = page.getByTestId("r3-no-plan-waitlist");
  await expect(edinburgh).toHaveAttribute("data-city", "edinburgh");
  await expect(edinburgh.getByTestId("r3-no-plan-waitlist-cta")).toContainText("Join the Edinburgh waitlist");
  await expect(edinburgh.getByTestId("r3-no-plan-opening")).toHaveCount(0);
  await expect(edinburgh).not.toContainText("Opening");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(page.getByTestId("r3-no-plan-page")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u5-no-plan-390.png"), fullPage: true });
});

test("U5: guests keep today's home on the door URL", async ({ page }) => {
  const unauthorized: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/trips") && r.status() === 401) unauthorized.push(r.url());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(
    page.getByTestId("landing-root").or(page.getByTestId("r3-no-plan-page")).first(),
  ).toBeVisible({ timeout: 30_000 });
  await logGate(page, "(guest)");
  await expect(page.getByTestId("landing-root")).toBeVisible();
  await expect(page.getByTestId("r3-no-plan-page")).toHaveCount(0);
  expect(unauthorized, "a guest never asks for the plans list").toHaveLength(0); // r3-trips-401
  // u5-popup: a guest keeps today's pop-up on this URL.
  await expect(page.getByRole("dialog"), "the pop-up opens here as today").toBeVisible({ timeout: 10_000 });
});

test("U5: a traveller WITH a plan keeps today's home on the door URL", async ({ page }) => {
  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-hasplan-${uid()}@example.com`, password: "R3Surface123!", firstName: "Has", lastName: "Plan" },
    BASE_URL,
  );
  const created = await page.request.post(`${BASE_URL}/api/trips`, { data: { title: `U5 has a plan ${uid()}`, destination: "Kyoto, Japan" } });
  expect(created.ok(), "the fixture trip must be created").toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(
    page.getByTestId("landing-root").or(page.getByTestId("r3-no-plan-page")).first(),
  ).toBeVisible({ timeout: 30_000 });
  await logGate(page, "(has a plan)");
  // u5-popup: a traveller with a plan keeps today's pop-up on this URL.
  await expect(page.getByRole("dialog"), "the pop-up opens here as today").toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("landing-root")).toBeVisible();
  await expect(page.getByTestId("r3-no-plan-page")).toHaveCount(0);
});

test("U5: with the R3 flag off the pop-up opens as today and there is no gate", async ({ page }) => {
  // The switch is off on the server for this load, so nothing of the landing may appear.
  await page.route("**/api/public/r3-surface**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: false }) });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?start=1&surface=r3&capture=1`);
  await expect(page.getByTestId("landing-root").or(page.getByTestId("r3-no-plan-page")).first()).toBeVisible({ timeout: 30_000 });
  // flag off: gate=0 (no marker at all), the home, and today's pop-up
  expect(await page.getByTestId("r3-no-plan-gate").count(), "flag-off: gate=0").toBe(0);
  console.log(
    `[u5-popup] flag-off: gate=${await page.getByTestId("r3-no-plan-gate").count()} page=${await page.getByTestId("r3-no-plan-page").count()} home=${await page.getByTestId("landing-root").count()}`,
  );
  await expect(page.getByTestId("landing-root")).toBeVisible();
  await expect(page.getByTestId("r3-no-plan-page")).toHaveCount(0);
  await expect(page.getByRole("dialog"), "the pop-up opens here as today").toBeVisible({ timeout: 10_000 });
});

test("U6: the Updates panel from the bell", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.setExtraHTTPHeaders({ "cache-control": "no-cache", pragma: "no-cache" });
  const tripId = await sixStopTrip(page);

  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const rows = [
    { id: "u6-1", type: "itinerary_update", title: "Aiko suggested a change to Wednesday", message: "", isRead: false, createdAt: iso(2 * 60 * 60 * 1000), data: { tripId, workspacePath: `/trip/${tripId}?tab=itinerary` } },
    { id: "u6-2", type: "trip_card", title: "Your Trip Card is ready", message: "", isRead: false, createdAt: iso(26 * 60 * 60 * 1000), data: { tripId, workspacePath: `/trip/${tripId}?tab=itinerary` } },
    { id: "u6-3", type: "booking", title: "Dinner in Gion is booked", message: "", isRead: true, createdAt: new Date(new Date().getFullYear(), 10, 12, 9, 0).toISOString(), data: { tripId, workspacePath: `/trip/${tripId}?tab=itinerary` } },
    { id: "u6-4", type: "receipt", title: "Your receipt for the tea ceremony", message: "", isRead: true, createdAt: new Date(new Date().getFullYear(), 10, 9, 9, 0).toISOString() },
  ];

  let requests = 0;
  const patchedIds: string[] = [];
  let allRead = false;
  let posted = 0;
  let mode: "list" | "nolink" | "empty" | "error" = "list";

  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() === "GET") requests += 1;
    if (mode === "error") return route.fulfill({ status: 500, body: "boom" });
    const bodyRows =
      mode === "empty" ? []
      : allRead ? rows.map((r) => ({ ...r, isRead: true }))
      : mode === "nolink" ? rows.map((r) => (r.id === "u6-4" ? { ...r, isRead: false } : r))
      : rows;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bodyRows) });
  });
  await page.route("**/api/notifications/*/read", async (route) => {
    const id = route.request().url().split("/api/notifications/")[1]?.split("/")[0] ?? "";
    patchedIds.push(id);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/notifications/mark-all-read", async (route) => {
    posted += 1;
    allRead = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-topbar")).toBeVisible({ timeout: 30_000 });
  // The console bell already asks for this list on load (notification-bell.tsx:32,39 - pre-existing on main). Record
  // that as the baseline; only requests the R3 panel itself causes are counted.
  await page.waitForTimeout(2500);
  const baseline = requests;
  const addedBeforeTap = requests - baseline;
  console.log(`[u6-closed] panel=${await page.getByTestId("r3-updates-panel").count()} baseline=${baseline} added=${addedBeforeTap}`);
  expect(await page.getByTestId("r3-updates-panel").count()).toBe(0);
  expect(addedBeforeTap, "the R3 panel causes no GET before the bell is tapped").toBe(0);

  await page.getByTestId("r3-bar-bell").click();
  // exactly ONE new GET, caused by the panel mounting
  await expect.poll(() => requests - baseline, { timeout: 10_000 }).toBe(1);
  const panel = page.getByTestId("r3-updates-panel");
  await expect(panel).toHaveAttribute("data-state", "list");
  const rowCount = await page.getByTestId("r3-updates-row").count();
  const unread = await page.locator('[data-testid="r3-updates-row"][data-unread="true"]').count();
  const markAll = await page.getByTestId("r3-updates-mark-all").count();
  console.log(`[u6-list] state=list rows=${rowCount} unread=${unread} markall=${markAll}`);
  expect(rowCount).toBe(4);
  expect(unread).toBe(2);
  expect(markAll).toBe(1);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u6-updates-1280.png"), fullPage: true });

  const fourth = page.getByTestId("r3-updates-row").nth(3);
  const subline = (await fourth.innerText()).split("\n").slice(1).join(" ").trim();
  console.log(`[u6-noplan] row=4 plan=${await fourth.getAttribute("data-plan")} line="${subline}"`);
  expect(await fourth.getAttribute("data-plan")).toBe("false");
  expect(subline).toBe("Not on a plan \u00b7 9 Nov");

  // [u6-nolink]: row 4 has no tripId and no workspacePath, so it has no link. It marks read and the panel stays.
  mode = "nolink";
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await page.getByTestId("r3-bar-bell").click();
  await expect(page.getByTestId("r3-updates-panel")).toHaveAttribute("data-state", "list");
  const beforeNoLink = new URL(page.url()).pathname + new URL(page.url()).search;
  const fourthRow = page.getByTestId("r3-updates-row").nth(3);
  expect(await fourthRow.getAttribute("data-link")).toBe("");
  expect(await fourthRow.getAttribute("data-href")).toBe("");
  await fourthRow.locator("button").click();
  await expect.poll(() => patchedIds.filter((x) => x === "u6-4").length, { timeout: 10_000 }).toBe(1);
  const afterNoLink = new URL(page.url()).pathname + new URL(page.url()).search;
  console.log(`[u6-nolink] link=<none> patched=${patchedIds.filter((x) => x === "u6-4").length} panel=${await page.getByTestId("r3-updates-panel").count()} url=${afterNoLink}`);
  expect(afterNoLink, "a row with no link goes nowhere").toBe(beforeNoLink);
  expect(await page.getByTestId("r3-updates-panel").count()).toBe(1);

  // [u6-read]: row 1 resolves to /plans/<id>, the final href adds surface=r3, and the tap navigates exactly there.
  const firstRow = page.getByTestId("r3-updates-row").first();
  const linkHref = await firstRow.getAttribute("data-link");
  const finalHref = await firstRow.getAttribute("data-href");
  await firstRow.locator("button").click();
  await expect
    .poll(() => { const u = new URL(page.url()); return u.pathname + u.search; }, { timeout: 10_000 })
    .toBe(`/plans/${tripId}?surface=r3`);
  await expect(page.getByTestId("r3-updates-panel")).toHaveCount(0);
  await expect(page.getByTestId("r3-topbar")).toBeVisible();
  const readUrl = new URL(page.url()).pathname + new URL(page.url()).search;
  console.log(`[u6-read] link=${linkHref} href=${finalHref} patched=${patchedIds.filter((x) => x === "u6-1").length} panel=${await page.getByTestId("r3-updates-panel").count()} url=${readUrl}`);
  expect(linkHref).toBe(`/plans/${tripId}`);
  expect(finalHref).toBe(`/plans/${tripId}?surface=r3`);
  expect(patchedIds.filter((x) => x === "u6-1").length).toBe(1);
  await page.waitForLoadState("load");

  // u6-390 BEFORE the mark-all tap: four rows, two unread (the brief's order).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await page.getByTestId("r3-bar-bell").click();
  await expect(page.getByTestId("r3-updates-panel")).toHaveAttribute("data-state", "list");
  {
    const box = await page.getByTestId("r3-updates-panel").boundingBox();
    const fits = !!box && box.x >= 0 && box.x + box.width <= 390;
    console.log(`[u6-390] state=list rows=${await page.getByTestId("r3-updates-row").count()} fits=${fits}`);
    expect(fits, "the panel sits inside a 390 viewport").toBe(true);
    await maskEmails(page);
    await page.screenshot({ path: path.join(OUT_DIR, "u6-updates-390.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await page.getByTestId("r3-bar-bell").click();
  await expect(page.getByTestId("r3-updates-panel")).toHaveAttribute("data-state", "list");
  await page.getByTestId("r3-updates-mark-all").click();
  await expect.poll(() => patchedIds.length >= 0 && posted, { timeout: 10_000 }).toBe(1);
  // wait for the refetch the invalidation causes, then read the counts
  await expect.poll(() => page.locator('[data-testid="r3-updates-row"][data-unread="true"]').count(), { timeout: 10_000 }).toBe(0);
  const unreadAfter = await page.locator('[data-testid="r3-updates-row"][data-unread="true"]').count();
  const markAllAfter = await page.getByTestId("r3-updates-mark-all").count();
  console.log(`[u6-markall] posted=${posted} unread=${unreadAfter} markall=${markAllAfter}`);
  expect(unreadAfter).toBe(0);
  expect(markAllAfter).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u6-all-read-1280.png"), fullPage: true });

  // empty
  mode = "empty";
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-bar-bell")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-bar-bell").click();
  await expect(page.getByTestId("r3-updates-panel")).toHaveAttribute("data-state", "empty");
  console.log(`[u6-empty] state=empty rows=${await page.getByTestId("r3-updates-row").count()} markall=${await page.getByTestId("r3-updates-mark-all").count()}`);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u6-empty-1280.png"), fullPage: true });

  // error
  mode = "error";
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-bar-bell")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-bar-bell").click();
  await expect(page.getByTestId("r3-updates-panel")).toHaveAttribute("data-state", "error");
  console.log(`[u6-error] state=error rows=${await page.getByTestId("r3-updates-row").count()}`);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u6-error-1280.png"), fullPage: true });
});

test("U7: Settings and the account-deletion request", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let flagReads = 0;
  let posts = 0;
  let deletes = 0;
  const postBodies: any[] = [];
  let contactStatus = 200;

  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true }) });
  });
  await page.route("**/api/auth/account**", async (route) => {
    deletes += 1;
    await route.fulfill({ status: 500, body: "no" });
  });
  await page.route("**/api/contact", async (route) => {
    posts += 1;
    postBodies.push(route.request().postDataJSON());
    await route.fulfill({ status: contactStatus, contentType: "application/json", body: JSON.stringify({ ok: contactStatus < 400 }) });
  });

  // signed in on the PAGE's context (same helper the U5/U6 blocks use), then confirm the session
  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-u7-${uid()}@example.com`, password: "R3Surface123!", firstName: "Set", lastName: "Tings" },
    BASE_URL,
  );
  const tripId = await sixStopTrip(page);

  // [u7-noparam]: no surface in the URL -> /profile, and the flag is never read
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForURL("**/profile", { timeout: 30_000 });
  console.log(`[u7-noparam] from=/settings to=${new URL(page.url()).pathname} flagreads=${flagReads}`);
  expect(new URL(page.url()).pathname).toBe("/profile");
  expect(flagReads).toBe(0);

  // [u7-flag-off]
  flagReads = 0;
  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: false }) });
  });
  await page.goto(`${BASE_URL}/settings?surface=r3`);
  await page.waitForURL("**/profile", { timeout: 30_000 });
  console.log(`[u7-flag-off] from=/settings?surface=r3 to=${new URL(page.url()).pathname} page=${await page.getByTestId("r3-settings-page").count()}`);
  expect(new URL(page.url()).pathname).toBe("/profile");
  expect(await page.getByTestId("r3-settings-page").count()).toBe(0);

  // back on, and signed in
  await page.unroute("**/api/public/r3-surface**");
  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true }) });
  });
  // [u7-menu]
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3`);
  await expect(page.getByTestId("r3-account-button")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-account-button").click();
  const settingsHref = await page.getByTestId("r3-account-settings").getAttribute("href");
  const profileHref = await page.getByTestId("r3-account-profile").getAttribute("href");
  console.log(`[u7-menu] settings_href=${settingsHref} profile_href=${profileHref}`);
  expect(settingsHref).toBe("/settings?surface=r3");
  expect(profileHref).toBe("/profile");
  await page.getByTestId("r3-account-button").click();

  // [u7-page]
  await page.goto(`${BASE_URL}/settings?surface=r3`);
  await expect(page.getByTestId("r3-settings-page")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  // U8a added the Payment methods row between them, so the Settings card now has three rows.
  const rows =
    (await page.getByTestId("r3-settings-email-prefs").count()) +
    (await page.getByTestId("r3-settings-payment-row").count()) +
    (await page.getByTestId("r3-settings-delete-row").count());
  console.log(`[u7-page] state=ready rows=${rows} confirm=${await page.getByTestId("r3-settings-confirm").count()} posts=${posts} deletes=${deletes}`);
  expect(rows).toBe(3);
  expect(await page.getByTestId("r3-settings-confirm").count()).toBe(0);
  expect(posts).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-settings-1280.png"), fullPage: true });

  // [u7-prefs]
  const prefsHref = await page.getByTestId("r3-settings-email-prefs").getAttribute("href");
  console.log(`[u7-prefs] href=${prefsHref}`);
  expect(prefsHref).toBe("/email-preferences");

  // [u7-confirm]
  await page.getByTestId("r3-settings-delete-row").click();
  await expect(page.getByTestId("r3-settings-confirm")).toHaveAttribute("data-state", "ask");
  console.log(`[u7-confirm] confirm=ask posts=${posts} deletes=${deletes}`);
  expect(posts).toBe(0);
  expect(deletes).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-confirm-1280.png"), fullPage: true });

  // the same card on the phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.getByTestId("r3-settings-page").boundingBox();
  const fits = !!box && box.x >= 0 && box.x + box.width <= 390;
  console.log(`[u7-390] state=ready fits=${fits}`);
  expect(fits).toBe(true);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-confirm-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u7-keep]
  await page.getByTestId("r3-settings-confirm-keep").click();
  await expect(page.getByTestId("r3-settings-confirm")).toHaveCount(0);
  console.log(`[u7-keep] confirm=0 posts=${posts} deletes=${deletes}`);
  expect(posts).toBe(0);

  // [u7-request]
  await page.getByTestId("r3-settings-delete-row").click();
  await page.getByTestId("r3-settings-confirm-request").click();
  await expect(page.getByTestId("r3-settings-confirm")).toHaveAttribute("data-state", "sent", { timeout: 15_000 });
  const sentBody = postBodies[postBodies.length - 1] ?? {};
  const rowDisabled = await page.getByTestId("r3-settings-delete-row").isDisabled();
  const me = await page.request.get(`${BASE_URL}/api/auth/user`);
  const signedIn = me.ok();
  console.log(
    `[u7-request] posts=${posts} subject="${sentBody.subject ?? ""}" confirm=sent row_disabled=${rowDisabled} signed_in=${signedIn} deletes=${deletes}`,
  );
  expect(posts).toBe(1);
  expect(sentBody.subject).toBe("Data Deletion Request");
  expect(rowDisabled).toBe(true);
  expect(signedIn).toBe(true);
  expect(deletes).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-sent-1280.png"), fullPage: true });

  // [u7-error]: a failed request keeps the card and both buttons
  contactStatus = 500;
  posts = 0;
  await page.goto(`${BASE_URL}/settings?surface=r3`);
  await expect(page.getByTestId("r3-settings-page")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await page.getByTestId("r3-settings-delete-row").click();
  await page.getByTestId("r3-settings-confirm-request").click();
  await expect(page.getByTestId("r3-settings-confirm")).toHaveAttribute("data-state", "error", { timeout: 15_000 });
  const buttons = (await page.getByTestId("r3-settings-confirm-request").count()) + (await page.getByTestId("r3-settings-confirm-keep").count());
  console.log(`[u7-error] posts=${posts} confirm=error buttons=${buttons} deletes=${deletes}`);
  expect(buttons).toBe(2);
  expect(deletes).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-error-1280.png"), fullPage: true });

  // the settings card alone on the phone
  contactStatus = 200;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/settings?surface=r3`);
  await expect(page.getByTestId("r3-settings-page")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u7-settings-390.png"), fullPage: true });
});

test("U8a: Payment methods in Settings, and the first saved card becomes the default", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let flagReads = 0;
  let posts = 0;
  let deletes = 0;
  let listGets = 0;
  let listMode: "empty" | "list" | "nodefault" | "unavailable" | "firstcard" = "list";
  let defaultOn: string | null = "pm_1";
  let rows = [
    { id: "pm_1", brand: "visa", last4: "4242", expMonth: 4, expYear: 2029, wallet: null },
    { id: "pm_2", brand: "mastercard", last4: "4444", expMonth: 8, expYear: 2030, wallet: null },
  ];

  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true }) });
  });
  await page.route("**/api/me/payment-methods**", async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === "GET" && !url.includes("/default")) {
      listGets += 1;
      const body =
        listMode === "unavailable" ? { available: false, defaultPaymentMethodId: null, methods: [] }
        : listMode === "empty" ? { available: true, defaultPaymentMethodId: null, methods: [] }
        : listMode === "firstcard"
          ? { available: true, defaultPaymentMethodId: listGets > 1 ? "pm_1" : null, methods: [rows[0]] }
        : { available: true, defaultPaymentMethodId: listMode === "nodefault" ? null : defaultOn, methods: rows };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (method === "POST" && url.includes("/default")) {
      posts += 1;
      const body = route.request().postDataJSON() as { paymentMethodId?: string };
      defaultOn = body?.paymentMethodId ?? null;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    if (method === "DELETE") {
      deletes += 1;
      const id = url.split("/api/me/payment-methods/")[1] ?? "";
      rows = rows.filter((r) => r.id !== id);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await registerAndSignIn(
    page.request,
    { email: `e2e-r3-u8a-${uid()}@example.com`, password: "R3Surface123!", firstName: "Pay", lastName: "Ments" },
    BASE_URL,
  );

  await page.setViewportSize({ width: 1280, height: 900 });

  // [u8a-noparam]
  await page.goto(`${BASE_URL}/settings/payment-methods`);
  await page.waitForURL("**/profile", { timeout: 30_000 });
  console.log(`[u8a-noparam] from=/settings/payment-methods to=${new URL(page.url()).pathname} flagreads=${flagReads}`);
  expect(new URL(page.url()).pathname).toBe("/profile");
  expect(flagReads).toBe(0);

  // [u8a-flag-off]
  await page.unroute("**/api/public/r3-surface**");
  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: false }) });
  });
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await page.waitForURL("**/profile", { timeout: 30_000 });
  console.log(`[u8a-flag-off] from=/settings/payment-methods?surface=r3 to=${new URL(page.url()).pathname}`);
  expect(new URL(page.url()).pathname).toBe("/profile");

  await page.unroute("**/api/public/r3-surface**");
  await page.route("**/api/public/r3-surface**", async (route) => {
    flagReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true }) });
  });

  // [u8a-row]
  await page.goto(`${BASE_URL}/settings?surface=r3`);
  await expect(page.getByTestId("r3-settings-page")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  const prefs = await page.getByTestId("r3-settings-email-prefs").count();
  const paymentRow = page.getByTestId("r3-settings-payment-row");
  const del = await page.getByTestId("r3-settings-delete-row").count();
  const paymentHref = await paymentRow.getAttribute("href");
  console.log(`[u8a-row] settings_rows=${prefs + (await paymentRow.count()) + del} order=email,payment,delete href=${paymentHref}`);
  expect(prefs + (await paymentRow.count()) + del).toBe(3);
  expect(paymentHref).toBe("/settings/payment-methods?surface=r3");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-settings-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-settings-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u8a-empty]
  listMode = "empty";
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "empty", { timeout: 30_000 });
  console.log(`[u8a-empty] state=empty rows=${await page.getByTestId("r3-pm-row").count()} empty_line=${await page.getByTestId("r3-pm-empty").count()} add=${await page.getByRole("button", { name: "Add a card" }).count()}`);
  expect(await page.getByTestId("r3-pm-empty").count()).toBe(1);
  expect(await page.getByRole("button", { name: "Add a card" }).count()).toBe(1);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-empty-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-empty-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u8a-list]
  listMode = "list";
  defaultOn = "pm_1";
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "list", { timeout: 30_000 });
  const listCounts = {
    rows: await page.getByTestId("r3-pm-row").count(),
    marks: await page.getByTestId("r3-pm-default").count(),
    make: await page.getByTestId("r3-pm-make-default").count(),
    remove: await page.getByTestId("r3-pm-remove").count(),
    noDefault: await page.getByTestId("r3-pm-no-default").count(),
  };
  console.log(`[u8a-list] state=list rows=${listCounts.rows} default_marks=${listCounts.marks} make_default=${listCounts.make} remove=${listCounts.remove} no_default_line=${listCounts.noDefault}`);
  expect(listCounts.rows).toBe(2);
  expect(listCounts.marks).toBe(1);
  expect(listCounts.make).toBe(1);
  expect(listCounts.remove).toBe(2);
  expect(listCounts.noDefault).toBe(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-list-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await page.getByTestId("r3-payment-methods").boundingBox();
  const fits = !!box && box.x >= 0 && box.x + box.width <= 390;
  console.log(`[u8a-390] state=list fits=${fits}`);
  expect(fits).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-list-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u8a-nodefault]
  listMode = "nodefault";
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "list", { timeout: 30_000 });
  const nd = {
    rows: await page.getByTestId("r3-pm-row").count(),
    marks: await page.getByTestId("r3-pm-default").count(),
    make: await page.getByTestId("r3-pm-make-default").count(),
    noDefault: await page.getByTestId("r3-pm-no-default").count(),
  };
  console.log(`[u8a-nodefault] rows=${nd.rows} default_marks=${nd.marks} make_default=${nd.make} no_default_line=${nd.noDefault}`);
  expect(nd.marks).toBe(0);
  expect(nd.make).toBe(2);
  expect(nd.noDefault).toBe(1);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-nodefault-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-nodefault-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u8a-make-default]
  listMode = "list";
  defaultOn = "pm_1";
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "list", { timeout: 30_000 });
  posts = 0;
  await page.getByTestId("r3-pm-make-default").first().click();
  await expect.poll(() => posts, { timeout: 10_000 }).toBe(1);
  await expect(page.getByTestId("r3-pm-row").nth(1).getByTestId("r3-pm-default")).toHaveCount(1);
  const onRow = await page.getByTestId("r3-pm-row").nth(1).getAttribute("data-default");
  console.log(`[u8a-make-default] posted=${posts} default_marks=${await page.getByTestId("r3-pm-default").count()} on_row=${onRow === "true" ? 2 : 1}`);
  expect(onRow).toBe("true");

  // [u8a-remove]
  deletes = 0;
  await page.getByTestId("r3-pm-remove").first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Default payment method updated")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Remove this payment method?")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-remove-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u8a-remove-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("button-confirm-remove-card").click();
  await expect.poll(() => deletes, { timeout: 10_000 }).toBe(1);
  await expect.poll(() => page.getByTestId("r3-pm-row").count(), { timeout: 10_000 }).toBe(1);
  console.log(`[u8a-remove] confirm=1 deleted=${deletes} rows=${await page.getByTestId("r3-pm-row").count()}`);

  // [u8a-first-card]
  listMode = "firstcard";
  listGets = 0;
  rows = [{ id: "pm_1", brand: "visa", last4: "4242", expMonth: 4, expYear: 2029, wallet: null }];
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "list", { timeout: 30_000 });
  await expect.poll(() => page.getByTestId("r3-payment-methods").getAttribute("data-rechecks"), { timeout: 15_000 }).toBe("1");
  await expect.poll(() => page.getByTestId("r3-pm-default").count(), { timeout: 10_000 }).toBe(1);
  console.log(`[u8a-first-card] rows=${await page.getByTestId("r3-pm-row").count()} rechecks=${await page.getByTestId("r3-payment-methods").getAttribute("data-rechecks")} default_marks=${await page.getByTestId("r3-pm-default").count()} no_default_line_shown=${await page.getByTestId("r3-pm-no-default").count()}`);
  expect(await page.getByTestId("r3-pm-no-default").count()).toBe(0);

  // [u8a-unavailable]
  listMode = "unavailable";
  await page.goto(`${BASE_URL}/settings/payment-methods?surface=r3`);
  await expect(page.getByTestId("r3-payment-methods")).toHaveAttribute("data-state", "unavailable", { timeout: 30_000 });
  console.log(`[u8a-unavailable] state=unavailable add=${await page.getByRole("button", { name: "Add a card" }).count()}`);
  expect(await page.getByRole("button", { name: "Add a card" }).count()).toBe(0);
});

test("U9: the stop menu, the stop sheet, undo and the asked-for tags", async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // The surface flag, pinned on for every navigation in this block.
  await page.route("**/api/public/r3-surface**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true }) });
  });
  const tripId = await sixStopTrip(page);

  let puts = 0;
  let deletes = 0;
  let quoteGets = 0;
  let writeRequests = 0;
  let state = { stopIds: [] as string[], firstId: "", secondId: "", thirdId: "", fourthId: "" };
  let quotesPayload: any = { quotes: [] };
  let role = "owner";
  let waitlist = false;
  let locked = false;
  let secondLocked = false;

  const decorate = async (route: any) => {
    const res = await route.fetch();
    const json = await res.json();
    const days = json?.days ?? [];
    const ids: string[] = [];
    for (const d of days) for (const a of d?.activities ?? []) ids.push(String(a.id));
    state.stopIds = ids;
    state.firstId = ids[0] ?? "";
    state.secondId = ids[1] ?? "";
    state.thirdId = ids[2] ?? "";
    state.fourthId = ids[3] ?? "";
    json.tripRole = role;
    json.optimizerWaitlist = waitlist;
    json.timeZone = json.timeZone ?? "Asia/Tokyo";
    const first = days[0]?.activities?.[0];
    if (first) {
      first.origin = "traveler";
      first.locked = true;
    }
    const second = days[0]?.activities?.[1];
    if (second) {
      delete second.origin;
      second.locked = secondLocked;
    }
    const allActivities = days.flatMap((d: any) => d?.activities ?? []);
    const last = allActivities[allActivities.length - 1];
    if (last) last.booking = { id: "bk_1", status: "confirmed" };
    json.placeFacts = {
      [state.firstId]: [
        {
          id: "pf_1",
          factType: "hours",
          need: "stop.hours",
          value: { weekdayDescriptions: ["Thursday: 8:30 AM - 5:00 PM"] },
          origin: "official_refresh",
          sourceUrl: "https://example.org/hours",
          provenance: "Official site",
          checkedAt: "2026-11-12T09:00:00Z",
          stale: false,
          publishable: true,
        },
      ],
      [state.secondId]: [],
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  };

  await page.route(`**/api/trips/${tripId}/plancard**`, decorate);
  await page.route("**/api/me/quotes*", async (route) => {
    quoteGets += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quotesPayload) });
  });
  let expertCountStub = 1;
  let patchedDays: number[] = [];
  await page.route("**/api/trips/*/expert-help", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ levels: expertCountStub > 0 ? [{ level: "local", expertCount: expertCountStub }] : [] }),
    });
  });
  await page.route("**/api/trips/*/itinerary-items/*/lock", async (route) => {
    puts += 1;
    const body = route.request().postDataJSON() as any;
    locked = !!body?.locked;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/trips/*/itinerary-items/*", async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      deletes += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as any;
      if (typeof body?.dayNumber === "number") patchedDays.push(body.dayNumber);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.continue();
  });
  page.on("request", (req) => {
    const m = req.method();
    const url = req.url();
    if ((m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") && url.includes("/itinerary-items")) {
      writeRequests += 1;
    }
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });

  // [u9-menu-owner]
  await page.getByTestId("r3-stop-menu").first().click();
  const ownerEntries = page.getByTestId("r3-stop-menu-panel").locator("button");
  const ownerCount = await ownerEntries.count();
  const ownerOrder = await ownerEntries.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-testid")));
  console.log(`[u9-menu-owner] entries=${ownerCount} order=${(ownerOrder as string[]).map((x) => String(x).replace("r3-stop-menu-", "")).join(",")} swap=0`);
  expect(ownerCount).toBe(3);
  expect(ownerOrder).toEqual(["r3-stop-menu-details", "r3-stop-menu-move", "r3-stop-menu-remove"]);
  await expect(page.getByTestId("r3-stop-menu-panel")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-menu-owner-1280.png"), fullPage: false });

  // [u9-menu-keys]
  await page.getByTestId("r3-stop-menu").first().focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("r3-stop-menu-panel")).toHaveCount(0, { timeout: 5000 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")), { timeout: 5000 }).toBe("r3-stop-menu");
  await page.getByTestId("r3-stop-menu").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("r3-stop-menu-panel")).toBeVisible({ timeout: 5000 });
  const openedByEnter = true;
  await page.keyboard.press("Escape");
  const closedByEscape = (await page.getByTestId("r3-stop-menu-panel").count()) === 0;
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")), { timeout: 5000 }).toBe("r3-stop-menu");
  const focusBack2 = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  console.log(`[u9-menu-keys] enter_opens=${openedByEnter} escape_closes=${closedByEscape} focus_returns=${focusBack2 === "r3-stop-menu"}`);
  expect(openedByEnter).toBe(true);
  expect(closedByEscape).toBe(true);
  expect(focusBack2).toBe("r3-stop-menu");

  // [u9-sheet-open] from the first stop's Details
  writeRequests = 0;
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible({ timeout: 10_000 });
  console.log(`[u9-sheet-open] from=details state=open new_requests=${writeRequests}`);
  expect(writeRequests).toBe(0);

  // [u9-sheet-header]
  const originChip = await page.getByTestId("r3-sheet-origin").count();
  const originText = originChip ? await page.getByTestId("r3-sheet-origin").innerText() : "";
  const pinned = await page.getByTestId("r3-sheet-pinned").count();
  const pinnedText = pinned ? await page.getByTestId("r3-sheet-pinned").innerText() : "";
  const headerTime = await page.getByTestId("r3-sheet-time").innerText();
  console.log(`[u9-sheet-header] origin_chip="${originText.toLowerCase()}" pinned=${pinned}`);
  expect(originText.toLowerCase()).toBe("you added");
  expect(pinned).toBe(1);
  expect(pinnedText).toBe(`Pinned to ${headerTime.split("\u00b7")[0].trim()}`);
  expect(headerTime).toMatch(/^[A-Z][a-z]{2}\s\u00b7\s\d{2}:\d{2}$/);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-sheet-1280.png"), fullPage: true });

  // [u9-sheet-facts]
  const factLines = await page.getByTestId("r3-sheet-fact").count();
  const factTexts = (await page.getByTestId("r3-sheet-fact").allInnerTexts()).join(" | ");
  const eachHasSource = factLines === 1 && /checked\s+\d+\s+[A-Z][a-z]{2}/.test(factTexts) && !/Google/i.test(factTexts);
  console.log(`[u9-sheet-facts] lines=${factLines} each_has_source_and_date=${eachHasSource} no_source_line_drawn=0`);
  expect(factLines).toBe(1);
  expect(eachHasSource).toBe(true);

  // [u9-sheet-keep] on the unlocked second stop: the switch writes once and stays on after the refresh
  await page.keyboard.press("Escape");
  await page.getByTestId("r3-stop-menu").nth(1).click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  await page.getByTestId("r3-sheet-keep-switch").click();
  await expect.poll(() => puts, { timeout: 10_000 }).toBe(1);
  secondLocked = true;
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").nth(1).click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const checkedAfter = await page.getByTestId("r3-sheet-keep-switch").getAttribute("aria-checked");
  const keepState = await page.getByTestId("r3-sheet-keep-state").innerText();
  console.log(`[u9-sheet-keep] owner: switch=1 put=${puts} locked_after=${checkedAfter === "true"} expert: switch=0`);
  expect(checkedAfter).toBe("true");
  expect(keepState).toBe("On");

  // [u9-sheet-ask]: the plan owner AND a city with an expert
  expertCountStub = 1;
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const askRow = await page.getByTestId("r3-sheet-ask").count();
  await page.getByTestId("r3-sheet-ask").click();
  const panelOpens = (await page.getByTestId("r3-sheet-ask-panel").count()) === 1;
  console.log(`[u9-sheet-ask] row=${askRow} panel_opens=${panelOpens}`);
  expect(askRow).toBe(1);
  expect(panelOpens).toBe(true);

  // [u9-sheet-close]
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("r3-stop-sheet")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")), { timeout: 5_000 })
    .toBe("r3-stop-menu");
  const focusAfterSheet = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  await page.getByTestId("r3-stop-sheet-backdrop").click({ position: { x: 5, y: 5 } });
  const backdropClosed = (await page.getByTestId("r3-stop-sheet").count()) === 0;
  console.log(`[u9-sheet-close] escape=closed backdrop=${backdropClosed ? "closed" : "open"} focus_returns=${focusAfterSheet === "r3-stop-menu"}`);
  expect(backdropClosed).toBe(true);
  expect(focusAfterSheet).toBe("r3-stop-menu");

  // [u9-sheet-390]
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-phone-day-strip")).toBeVisible({ timeout: 30_000 });
  // The first chip is Ideas (0); the stops are on day 1.
  await page.locator('[data-testid="r3-phone-day-chip"][data-day="1"]').click();
  await expect(page.getByTestId("r3-phone-stop-menu").first()).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("r3-phone-stop-menu").first().click();
  const phoneEntries = await page.getByTestId("r3-stop-menu-panel").locator("button").count();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible({ timeout: 10_000 });
  const sheetBox = await page.locator('[data-sheet="stop"]').boundingBox();
  const bottomSheet = !!sheetBox && Math.abs(sheetBox.y + sheetBox.height - 844) < 40 && sheetBox.x >= 0 && sheetBox.width <= 390;
  console.log(`[u9-sheet-390] sheet=bottom fits=${bottomSheet}`);
  expect(bottomSheet).toBe(true);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-sheet-390.png"), fullPage: true });
  await page.keyboard.press("Escape");

  // [u9-sheet-noorigin] and [u9-sheet-nofacts] on the second stop, unlocked again
  secondLocked = false;
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-phone-day-strip")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="r3-phone-day-chip"][data-day="1"]').click();
  await expect(page.getByTestId("r3-phone-stop-menu").nth(1)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("r3-phone-stop-menu").nth(1).click();
  const phoneOrder = await page.getByTestId("r3-stop-menu-panel").locator("button").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-testid")));
  console.log(`[u9-menu-phone] same_component=true entries=${phoneEntries} move_opens_sheet=${(phoneOrder as string[]).includes("r3-phone-move")}`);
  expect(phoneEntries).toBe(3);
  expect(phoneOrder).toContain("r3-phone-move");
  await expect(page.getByTestId("r3-stop-menu-panel")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-menu-phone-390.png"), fullPage: false });
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const noOrigin = await page.getByTestId("r3-sheet-origin").count();
  const noPinned = await page.getByTestId("r3-sheet-pinned").count();
  const noFacts = await page.getByTestId("r3-sheet-facts").count();
  console.log(`[u9-sheet-noorigin] origin_chip=${noOrigin} pinned=${noPinned}`);
  console.log(`[u9-sheet-nofacts] facts_block=${noFacts}`);
  expect(noOrigin).toBe(0);
  expect(noPinned).toBe(0);
  expect(noFacts).toBe(0);
  await page.keyboard.press("Escape");

  // [u9-menu-viewer] and [u9-waitlist]
  role = "guest";
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const viewerButtons = await page.getByTestId("r3-stop-menu").count();
  console.log(`[u9-menu-viewer] button=${viewerButtons}`);
  expect(viewerButtons).toBe(0);

  // [u9-menu-expert]
  role = "expert";
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").first().click();
  const expertEntries = await page.getByTestId("r3-stop-menu-panel").locator("button").count();
  const expertOrder = await page.getByTestId("r3-stop-menu-panel").locator("button").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-testid")));
  console.log(`[u9-menu-expert] entries=${expertEntries} order=${(expertOrder as string[]).map((x) => String(x).replace("r3-stop-menu-", "")).join(",")}`);
  expect(expertEntries).toBe(1);
  expect(expertOrder).toEqual(["r3-stop-menu-details"]);
  await expect(page.getByTestId("r3-stop-menu-panel")).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-menu-expert-1280.png"), fullPage: false });
  await page.keyboard.press("Escape");

  // expert has no keep switch
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const expertSwitch = await page.getByTestId("r3-sheet-keep-switch").count();
  expect(expertSwitch).toBe(0);
  await page.keyboard.press("Escape");

  // [u9-waitlist]: owner in waitlist mode reads no quotes and draws no quote tag
  role = "owner";
  waitlist = true;
  quoteGets = 0;
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const quoteTags = await page.getByTestId("r3-stop-state").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-state")));
  console.log(`[u9-waitlist] quotes_gets=${quoteGets} state_tags_from_quotes=${(quoteTags as string[]).filter((s) => s === "asked" || s === "quote").length}`);
  expect(quoteGets).toBe(0);
  expect((quoteTags as string[]).filter((s) => s === "asked" || s === "quote").length).toBe(0);

  // [u9-state-asked] [u9-state-quote] [u9-state-booked]
  waitlist = false;
  quotesPayload = { quotes: [] };
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  // The stops the BOARD actually draws, in order - not every activity row (a stay is filtered out).
  const cardIds = await page.getByTestId("r3-stop-card").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-stop-id")));
  quotesPayload = {
    quotes: [
      { itineraryItemId: cardIds[1], lifecycle: "requested" },
      { itineraryItemId: cardIds[2], lifecycle: "quoted" },
    ],
  };
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const cardCount = await page.getByTestId("r3-stop-card").count();
  const seen: Record<string, string> = {};
  let askedIdx: number | null = null;
  let bookedIdx: number | null = null;
  for (let i = 0; i < cardCount; i += 1) {
    const tag = page.getByTestId("r3-stop-card").nth(i).getByTestId("r3-stop-state");
    if ((await tag.count()) === 0) continue;
    const s = (await tag.getAttribute("data-state")) ?? "";
    seen[s] = await tag.innerText();
    if (s === "asked") askedIdx = i;
    if (s === "booked") bookedIdx = i;
  }
  const askedText = seen["asked"] ?? "";
  const quoteText = seen["quote"] ?? "";
  const bookedText = seen["booked"] ?? "";
  console.log(`[u9-state-asked] tag="${askedText}" controls=0`);
  console.log(`[u9-state-quote] tag="${quoteText}" price=0 accept=0 decline=0`);
  console.log(`[u9-state-booked] tag="${bookedText}"`);
  expect(askedText).toBe("Asked \u00b7 waiting for the host");
  expect(quoteText).toBe("Quote received");
  expect(bookedText).toBe("Booked");
  expect(await page.getByTestId("r3-stop-card").getByRole("button", { name: "Accept" }).count()).toBe(0);

  // the asked note on the sheet only
  if (askedIdx !== null) {
    await page.getByTestId("r3-stop-card").nth(askedIdx).getByTestId("r3-stop-menu").click();
    await page.getByTestId("r3-stop-menu-details").click();
    await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
    await expect(page.getByText("The host accepts first. Nothing is charged until then.")).toBeVisible();
    await page.keyboard.press("Escape");
  }

  // [u9-remove] [u9-undo] [u9-remove-commit] [u9-remove-second]
  deletes = 0;
  const beforeCount = await page.getByTestId("r3-stop-card").count();
  const idsBeforeRemoval = await page.getByTestId("r3-stop-card").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-stop-id")));
  await page.getByTestId("r3-stop-card").first().getByTestId("r3-stop-menu").click();
  await page.getByTestId("r3-stop-menu-remove").click();
  await expect(page.getByTestId("r3-stop-removed")).toBeVisible({ timeout: 10_000 });
  const goneCount = await page.getByTestId("r3-stop-card").count();
  const deletesBefore = deletes;
  // The bar is pinned to the viewport bottom and the page always reserves its height, so nothing is covered and
  // nothing moves when it appears.
  const barBox = await page.getByTestId("r3-stop-removed").boundingBox();
  const undoBox1280 = await page.getByTestId("r3-stop-undo").boundingBox();
  const fullWidth = !!barBox && Math.abs(barBox.x) < 1 && Math.abs(barBox.width - 1280) < 1;
  const barPinned = !!barBox && Math.abs(barBox.y + barBox.height - 900) < 1;
  const undoInViewport = !!undoBox1280 && undoBox1280.y >= 0 && undoBox1280.y + undoBox1280.height <= 900;
  const barNoHscroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="r3-stop-removed"]')?.getBoundingClientRect();
    const opt = document.querySelector('[data-testid="r3-optimize-card"]')?.getBoundingClientRect();
    if (!bar || !opt) return false;
    return !(opt.bottom <= bar.top || opt.top >= bar.bottom || opt.right <= bar.left || opt.left >= bar.right);
  });
  expect(fullWidth && barPinned && undoInViewport && barNoHscroll && !overlap).toBe(true);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-removed-undo-1280.png"), fullPage: false });
  console.log(`[u9-remove] stop_gone=${beforeCount - goneCount} toast=1 undo=${await page.getByTestId("r3-stop-undo").count()} deletes_before_10s=${deletesBefore}`);
  expect(goneCount).toBe(beforeCount - 1);
  expect(deletesBefore).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const undoBox390 = await page.getByTestId("r3-stop-undo").boundingBox();
  const undoInViewport390 = !!undoBox390 && undoBox390.y >= 0 && undoBox390.y + undoBox390.height <= 844;
  const barNoHscroll390 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(undoInViewport390 && barNoHscroll390).toBe(true);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OUT_DIR, "u9-removed-undo-390.png"), fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByTestId("r3-stop-undo").click();
  await expect.poll(() => page.getByTestId("r3-stop-card").count(), { timeout: 10_000 }).toBe(beforeCount);
  const idsAfterUndo = await page.getByTestId("r3-stop-card").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-stop-id")));
  const restored = idsAfterUndo.length === idsBeforeRemoval.length ? 1 : 0;
  const samePosition = JSON.stringify(idsAfterUndo) === JSON.stringify(idsBeforeRemoval);
  console.log(`[u9-undo] restored=${restored} same_position=${samePosition} deletes=${deletes}`);
  expect(restored).toBe(1);
  expect(samePosition).toBe(true);
  expect(deletes).toBe(0);

  // [u9-remove-commit]: one held removal, sent when its 10 seconds end
  deletes = 0;
  await page.getByTestId("r3-stop-card").first().getByTestId("r3-stop-menu").click();
  await page.getByTestId("r3-stop-menu-remove").click();
  await expect(page.getByTestId("r3-stop-removed")).toBeVisible();
  await expect.poll(() => deletes, { timeout: 20_000 }).toBe(1);
  console.log(`[u9-remove-commit] after_10s deletes=${deletes}`);
  expect(deletes).toBe(1);

  // [u9-remove-second]: a second Remove sends the first at once, and one stays pending
  const deletesBeforeSecond = deletes;
  await page.getByTestId("r3-stop-card").first().getByTestId("r3-stop-menu").click();
  await page.getByTestId("r3-stop-menu-remove").click();
  await expect(page.getByTestId("r3-stop-removed")).toBeVisible();
  await page.getByTestId("r3-stop-card").first().getByTestId("r3-stop-menu").click();
  await page.getByTestId("r3-stop-menu-remove").click();
  await expect.poll(() => deletes, { timeout: 2_000 }).toBe(deletesBeforeSecond + 1);
  const banners = await page.getByTestId("r3-stop-removed").count();
  const firstSentAtOnce = deletes === deletesBeforeSecond + 1;
  console.log(`[u9-remove-second] first_sent_at_once=${firstSentAtOnce} pending=${banners}`);
  expect(firstSentAtOnce).toBe(true);
  expect(banners).toBe(1);

  // [u9-move-1280]: the owner's Move opens the existing sheet and the chosen day is saved
  patchedDays = [];
  role = "owner";
  waitlist = false;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const moveStopId = await page.getByTestId("r3-stop-menu").first().getAttribute("data-stop-id");
  const currentDay = Number(
    await page
      .getByTestId("r3-stop-card")
      .first()
      .evaluate((el) => el.closest('[data-testid="r3-day-column"]')?.getAttribute("data-day")),
  );
  const targetDay = currentDay === 2 ? 3 : 2;
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-move").click();
  await expect(page.getByTestId(`move-stop-sheet-${moveStopId}`)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`move-stop-day-${targetDay}`).click();
  await page.getByTestId("move-stop-confirm").click();
  await expect.poll(() => patchedDays.length, { timeout: 10_000 }).toBe(1);
  console.log(`[u9-move-1280] sheet=move-stop-sheet day_saved=${patchedDays[0]} patches=${patchedDays.length}`);
  expect(patchedDays[0]).toBe(targetDay);

  // [u9-focus]: the sheet returns focus to the button that opened it, at 1280 and 390
  const focusAt = async (width: number) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
    if (width === 1280) {
      await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(page.getByTestId("r3-phone-day-strip")).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-testid="r3-phone-day-chip"][data-day="1"]').click();
      await expect(page.getByTestId("r3-phone-stop-menu").nth(1)).toBeVisible({ timeout: 10_000 });
    }
    const menu = width === 1280 ? page.getByTestId("r3-stop-menu").nth(1) : page.getByTestId("r3-phone-stop-menu").nth(1);
    const id = await menu.getAttribute("data-stop-id");
    await menu.click();
    await page.getByTestId("r3-stop-menu-details").click();
    await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("r3-stop-sheet")).toHaveCount(0);
    // The boards re-render as the sheet unmounts; wait for the button to hold focus rather than sampling once.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            return { id: el?.getAttribute("data-stop-id") ?? null, testid: el?.getAttribute("data-testid") ?? null };
          }),
        { timeout: 5_000 },
      )
      .toMatchObject({ id });
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { id: el?.getAttribute("data-stop-id") ?? null, testid: el?.getAttribute("data-testid") ?? null };
    });
    return focused.id === id && focused.testid === (width === 1280 ? "r3-stop-menu" : "r3-phone-stop-menu");
  };
  const focus1280 = await focusAt(1280);
  const focus390 = await focusAt(390);
  console.log(`[u9-focus] 1280=${focus1280} 390=${focus390} same_stop=true`);
  expect(focus1280).toBe(true);
  expect(focus390).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // [u9-ask-gate]: no row for an expert viewing the plan, or for an owner in a city with no expert
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const ownerHasExpert = await page.getByTestId("r3-sheet-ask").count();
  await page.keyboard.press("Escape");
  expertCountStub = 0;
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const ownerNoExpert = await page.getByTestId("r3-sheet-ask").count();
  await page.keyboard.press("Escape");
  expertCountStub = 1;
  role = "expert";
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("r3-stop-menu").first().click();
  await page.getByTestId("r3-stop-menu-details").click();
  await expect(page.getByTestId("r3-stop-sheet")).toBeVisible();
  const expertViewer = await page.getByTestId("r3-sheet-ask").count();
  console.log(`[u9-ask-gate] owner_expert=${ownerHasExpert} owner_no_expert=${ownerNoExpert} expert_viewer=${expertViewer}`);
  expect(ownerHasExpert).toBe(1);
  expect(ownerNoExpert).toBe(0);
  expect(expertViewer).toBe(0);
  await page.keyboard.press("Escape");
  role = "owner";

  // [u9-state-live]: a withdrawn row first must not outrank the live one
  quotesPayload = {
    quotes: [
      { itineraryItemId: state.firstId, lifecycle: "withdrawn" },
      { itineraryItemId: state.firstId, lifecycle: "requested" },
    ],
  };
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const liveTag = await page.getByTestId("r3-stop-card").first().getByTestId("r3-stop-state").getAttribute("data-state");
  console.log(`[u9-state-live] tag=${liveTag} withdrawn_ignored=${liveTag !== "withdrawn"}`);
  expect(liveTag).toBe("asked");
  quotesPayload = { quotes: [] };

  // [u9-1280]
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?surface=r3&capture=1`);
  await expect(page.getByTestId("r3-days-board")).toBeVisible({ timeout: 30_000 });
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  console.log(`[u9-1280] page_hscroll=${noHScroll ? "false" : "true"}`);
  expect(noHScroll).toBe(true);
});
