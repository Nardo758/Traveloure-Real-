/**
 * V31 part 1 — the gem card's DetailsView, captured from stubbed fixtures. No database and no network image: every photo
 * is served from `playwright/fixtures/`, and the gallery comes from a stubbed `GET /api/place-photos/:key`.
 *
 * States: photo 1/1, gallery 1/5, the 8-photo cap, no photo, no text, and an uncredited third-party row dropped.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5000";
const OUT = path.resolve("playwright/v31-captures");
const FIXTURE = path.join(path.resolve("playwright/fixtures"), "d1-photo-a.png");
const IMG = `${BASE}/fixtures/d1-photo-a.png`;

const WIDTHS = [1280, 390] as const;
const LONG_TEXT =
  "This is the long description the Details view draws in full. It runs past the long band on purpose so the paragraph is a " +
  "real paragraph rather than a caption, and it keeps going for a few more words to clear two hundred and forty characters " +
  "comfortably, which is what the board calls a full description.";

// One real payload per test, reused for every state: the feed is stubbed from it, so no state re-hits the API.
let payloadCache: any = null;

type State = "one" | "five" | "eight" | "none" | "notext" | "uncredited";

const ROWS: Record<State, Array<{ url: string; source: string; licence: string | null; attribution: string | null; checkedAt: string | null }>> = {
  one: [{ url: IMG, source: "Wikimedia Commons", licence: "CC BY-SA 4.0", attribution: "A · CC BY-SA 4.0 · Wikimedia Commons", checkedAt: "2026-11-12T00:00:00Z" }],
  five: Array.from({ length: 5 }, (_, i) => ({ url: IMG, source: "Wikimedia Commons", licence: "CC BY-SA 4.0", attribution: `A${i} · CC BY-SA 4.0 · Wikimedia Commons`, checkedAt: "2026-11-12T00:00:00Z" })),
  eight: Array.from({ length: 8 }, (_, i) => ({ url: IMG, source: "Wikimedia Commons", licence: "CC BY-SA 4.0", attribution: `A${i} · CC BY-SA 4.0 · Wikimedia Commons`, checkedAt: "2026-11-12T00:00:00Z" })),
  none: [],
  notext: [{ url: IMG, source: "Wikimedia Commons", licence: "CC BY-SA 4.0", attribution: "A · CC BY-SA 4.0 · Wikimedia Commons", checkedAt: "2026-11-12T00:00:00Z" }],
  // the second row has no attribution: the server drops it, so only one photo is usable
  uncredited: [
    { url: IMG, source: "Wikimedia Commons", licence: "CC BY-SA 4.0", attribution: "A · CC BY-SA 4.0 · Wikimedia Commons", checkedAt: "2026-11-12T00:00:00Z" },
    { url: IMG, source: "wikimedia", licence: null, attribution: null, checkedAt: null },
  ],
};

async function stub(page: Page, state: State, ownImage: boolean) {
  await page.route("**/fixtures/d1-photo-*.png", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(FIXTURE) });
  });
  await page.route("**/api/place-photos/**", async (route) => {
    // raw rows: the CLIENT's rule must drop the uncredited one, which is the state under test
    const rows = ROWS[state];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photos: rows }) });
  });
  await page.route("**/api/discover/location/**", async (route) => {
    if (!payloadCache) {
      const res = await route.fetch();
      payloadCache = await res.json();
    }
    const json = JSON.parse(JSON.stringify(payloadCache));
    // Take the real first gem the feed already places (it carries the neighbourhood the section needs) and change ONLY
    // what this state is about - the description and the image fields.
    const list = Array.isArray(json?.gems?.data) ? json.gems.data : [];
    const target = list[0];
    if (target) {
      target.description = state === "notext" ? "" : LONG_TEXT;
      target.whyLocalsLoveIt = state === "notext" ? null : target.whyLocalsLoveIt;
      if (!ownImage) {
        target.imageUrl = null;
        target.image = null;
        if ("imageCredit" in target) target.imageCredit = null;
      }
    }
    console.log(`[v31-stub] gem id=${target?.id ?? "none"} own_image=${ownImage} photos=${ROWS[state].length}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
}

async function openDetails(page: Page) {
  await page.goto(`${BASE}/discover/location/Kyoto`);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  const trigger = page.locator('[data-testid^="btn-more-info-gem-"]').first();
  for (let attempt = 0; attempt < 3 && (await trigger.count()) === 0; attempt++) {
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  }
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await expect(page.getByTestId("details-view")).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => page.getByTestId("details-view").evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 10_000 })
    .toBe(1);
  await expect
    .poll(
      () =>
        page.getByTestId("details-view").evaluate((el) =>
          Array.from(el.querySelectorAll("img")).every((img) => (img as HTMLImageElement).complete),
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
}

for (const width of WIDTHS) {
  test(`V31 gem DetailsView at ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });

    const cases: Array<[State, boolean, string]> = [
      ["one", false, "photo-1-of-1"],
      ["five", false, "gallery-1-of-5"],
      ["eight", false, "gallery-8"],
      ["none", false, "no-photo"],
      ["notext", true, "no-text"],
      ["uncredited", false, "uncredited-dropped"],
    ];
    for (const [state, ownImage, name] of cases) {
      await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await stub(page, state, ownImage);
      await openDetails(page);
      const view = page.getByTestId("details-view");
      if (state === "five") await expect(view.getByTestId("details-photo-count")).toHaveText("1 of 5");
      if (state === "eight") await expect(view.getByTestId("details-photo-count")).toHaveText("1 of 8");
      if (state === "one" || state === "uncredited") {
        await expect(view.getByTestId("details-photo-count")).toHaveCount(0);
      }
      if (state === "uncredited") {
        const credit = await view.getByTestId("details-photo-credit").innerText();
        expect(credit).toContain("Wikimedia Commons");
      }
      if (state === "none") await expect(view.getByTestId("details-photo")).toHaveCount(0);
      if (state === "notext") await expect(view.getByTestId("details-teaser")).toHaveCount(0);
      if (state !== "notext") await expect(view.getByTestId("details-teaser")).toHaveCount(1);
      await page.screenshot({ path: path.join(OUT, `gem-details-${name}-${width}.png`), fullPage: false });
      await page.getByTestId("details-close").click();
      await expect(page.getByTestId("details-view")).toHaveCount(0);
    }
  });
}
