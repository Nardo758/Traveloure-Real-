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
  return ["imageUrl", "image", "serviceImage", "vendorPhoto", "photoUrl", "heroImageUrl"];
}

/**
 * Deep walk: whatever nested shape a family arrives in, the card's photo field is one of the image keys. Setting it
 * everywhere is the only honest way to be sure the tile's own field is the one that changed.
 */
function walkSetPhoto(node: any, on: boolean, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) {
    for (const child of node) walkSetPhoto(child, on, depth + 1);
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (imageFields().includes(key)) {
      if (on) node[key] = IMG;
      else if (value !== undefined) node[key] = null;
    } else if (key === "media" && on) {
      node[key] = [{ url: IMG }];
    } else if (key === "media" && !on && value !== undefined) {
      node[key] = null;
    } else if (key === "imageCredit" && on) {
      node[key] = null;
    } else if (value && typeof value === "object") {
      walkSetPhoto(value, on, depth + 1);
    }
  }
}

async function stubFeed(page: Page, withPhoto: boolean) {
  await page.route("**/api/discover/location/**", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const sections = ["gems", "events", "services", "recommendations", "externalStubs"];
    for (const key of sections) {
      const list = json?.[key]?.data;
      if (list) walkSetPhoto(list, withPhoto && key !== "recommendations");
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.route("**/fixtures/d1-photo-*.png", async (route) => {
    const file = path.join(FIXTURES, "d1-photo-a.png");
    await route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(file) });
  });
}

/** The card fades in; a capture waits until it and its images are fully settled. */
async function settle(page: Page, card: any) {
  await expect.poll(() => card.evaluate((el: HTMLElement) => Number(getComputedStyle(el).opacity)), { timeout: 10_000 }).toBe(1);
  await expect
    .poll(
      () =>
        card.evaluate((el: HTMLElement) =>
          Array.from(el.querySelectorAll("img")).every((img) => (img as HTMLImageElement).complete),
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
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
        await settle(page, card);
        await card.screenshot({ path: path.join(OUT, `${family}-${withPhoto ? "photo" : "no-photo"}-${width}.png`) });
      }
      // the recommendation card is no-photo only
      if (!withPhoto) {
        const rec = page.locator('[data-testid^="feed-card-rec-"]').first();
        if ((await rec.count()) === 0) missing.push(`recommendation@${width}`);
        else {
          await rec.scrollIntoViewIfNeeded();
          await settle(page, rec);
          await rec.screenshot({ path: path.join(OUT, `recommendation-no-photo-${width}.png`) });
        }
      }
      await page.unroute("**/api/discover/location/**");
    }
    expect(missing, `families that could not be captured: ${missing.join(", ")}`).toEqual([]);
  });
}

/**
 * A ready-made trip with NO cover: the Discover shelf card and the expert storefront card (the cross-sell surface).
 * Each must show its tinted band, no broken-image icon and no stock photo.
 */
for (const width of WIDTHS) {
  test(`ready-made with no cover at ${width}`, async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });

    const shelf = {
      listings: [
        {
          id: "cap-rm-1",
          title: "Fixture Kyoto, No Cover",
          planType: "city_itinerary",
          planTypeCustom: null,
          market: "Kyoto",
          durationDays: 3,
          pricingMode: "per_person",
          priceCents: 48000,
          heroImageUrl: null,
          authorName: "Fixture Expert",
          authorId: "cap-earner",
          authorHandle: "fixture-expert",
          insideCounts: { days: 3, items: 6 },
          section: "trips_by_locals",
        },
      ],
    };
    await page.route("**/api/ready-made**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shelf) });
    });
    await page.goto(`${BASE}/ready-made`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    console.log(`[d1-ready-made] shelf_body=${(await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\s+/g, " ")}`);
    const shelfCard = page.locator('[data-testid^="rm-shelf-card-"]').first();
    const shelfSeen = (await shelfCard.count()) > 0;
    if (shelfSeen) {
      await shelfCard.scrollIntoViewIfNeeded();
      await settle(page, shelfCard);
      await shelfCard.screenshot({ path: path.join(OUT, `readymade-shelf-no-cover-${width}.png`) });
    }

    const storefront = {
      earner: {
        id: "cap-earner",
        handle: "fixture-expert",
        displayName: "Fixture Expert",
        name: "Fixture Expert",
        firstName: "Fixture",
        lastName: "Expert",
        businessName: null,
        bio: null,
        coverImageUrl: null,
        city: "Kyoto",
        localVerified: true,
      },
      services: [],
      readyMade: [
        {
          id: "cap-rm-1",
          title: "Fixture Kyoto, No Cover",
          heroImageUrl: null,
          priceCents: 48000,
          durationDays: 3,
          insideCounts: { items: 6 },
          planType: "city_itinerary",
        },
      ],
      isOwnStorefront: false,
      contactAvailable: false,
    };
    await page.route("**/api/storefront/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(storefront) });
    });
    await page.goto(`${BASE}/s/fixture-expert`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const storefrontCard = page.locator('[data-testid^="storefront-readymade-"]').first();
    const storefrontSeen = (await storefrontCard.count()) > 0;
    if (storefrontSeen) {
      await storefrontCard.scrollIntoViewIfNeeded();
      await settle(page, storefrontCard);
      await storefrontCard.screenshot({ path: path.join(OUT, `readymade-storefront-no-cover-${width}.png`) });
    }
    console.log(`[d1-ready-made] width=${width} shelf_card=${shelfSeen} storefront_card=${storefrontSeen}`);
    expect(shelfSeen, "the Discover shelf card rendered").toBe(true);
    expect(storefrontSeen, "the storefront cross-sell card rendered").toBe(true);
  });
}
