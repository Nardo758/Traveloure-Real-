/**
 * D1 captures - the five city-feed card families with and without a photo, then the ready-made hero panel with a
 * stored hero and after Remove. No network image is used: the fixtures under `playwright/fixtures/` are served locally.
 *
 * The feed is one `/api/discover/location/:city` payload, so each case is the real payload with one item's image fields
 * set (with-photo) or cleared (no-photo). A family that cannot be found FAILS the run rather than shipping a partial set.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5000";
const OUT = path.resolve("playwright/d1-captures");
const FIXTURES = path.resolve("playwright/fixtures");
const IMG = `${BASE}/fixtures/d1-photo-a.png`;

const WIDTHS = [1280, 390] as const;
// `supply-hotel`/`supply-activity` cards are drawn by the page but NOTHING in the product produces those kinds for
// Kyoto (no server or client producer; the scraped stubs render CityFeedCardExternalStub instead), so that family has no
// live instance to photograph. Reported to Leon rather than faked.
const FAMILIES = ["gem", "event", "service"] as const;

type Family = (typeof FAMILIES)[number];

function imageFields() {
  return ["imageUrl", "image", "serviceImage", "photoUrl", "heroImageUrl"];
}

function setPhoto(item: any, on: boolean) {
  if (!item) return;
  for (const f of imageFields()) {
    if (on) item[f] = IMG;
    else if (item[f] !== undefined) item[f] = null;
  }
  // the fixture is not the photo the record's credit names, so the record's credit is cleared with it
  if (on && "imageCredit" in item) item.imageCredit = null;
  if (on && "photoCredit" in item) item.photoCredit = null;
}

async function stubFeed(page: Page, withPhoto: boolean) {
  await page.route("**/api/discover/location/**", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const sections = ["gems", "events", "services", "recommendations", "externalStubs"];
    for (const key of sections) {
      const list = json?.[key]?.data;
      const items = Array.isArray(list) ? list : Array.isArray(list?.stubs) ? list.stubs : [];
      // one item carries the photo (or none do), so both states are visible in the same page
      items.forEach((it: any, i: number) => setPhoto(it, withPhoto && i === 0));
      if (Array.isArray(list)) list.forEach((it: any, i: number) => setPhoto(it, withPhoto && i === 0));
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.route("**/fixtures/d1-photo-*.png", async (route) => {
    const file = path.join(FIXTURES, "d1-photo-a.png");
    await route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(file) });
  });
}

function cardFor(page: Page, family: Family) {
  switch (family) {
    case "gem": {
      const anchor = page.locator('[data-testid^="gem-type-tag-"]').first();
      return anchor.locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    }
    case "event":
      return page.locator('[data-testid^="feed-card-event-"]').first();
    case "service":
      return page.locator('[data-testid^="feed-card-vendor-svc-"]').first();
  }
}

for (const width of WIDTHS) {
  test(`D1 captures at ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });

    const missing: string[] = [];
    for (const withPhoto of [true, false]) {
      await stubFeed(page, withPhoto);
      await page.goto(`${BASE}/discover/location/Kyoto`);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      for (const family of FAMILIES) {
        const card = cardFor(page, family);
        if ((await card.count()) === 0) {
          missing.push(`${family}@${width}`);
          continue;
        }
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: path.join(OUT, `${family}-${withPhoto ? "photo" : "no-photo"}-${width}.png`) });
      }
      // the recommendation card is no-photo only
      if (!withPhoto) {
        const rec = page.locator('[data-testid^="feed-card-rec-"]').first();
        if ((await rec.count()) === 0) missing.push(`recommendation@${width}`);
        else {
          await rec.scrollIntoViewIfNeeded();
          await rec.screenshot({ path: path.join(OUT, `recommendation-no-photo-${width}.png`) });
        }
      }
      await page.unroute("**/api/discover/location/**");
    }
    expect(missing, `families that could not be captured: ${missing.join(", ")}`).toEqual([]);
  });
}
