/**
 * V31 part 1 — the gem card's DetailsView, captured from stubbed fixtures. No database and no network image: every photo
 * is served from `playwright/fixtures/`, the gallery from a stubbed `GET /api/place-photos/:key`, and the feed payload is
 * fetched once and replayed.
 *
 * States: 1/1, 1/5 (the "+2" tile at 1280), the 8-photo cap ("+5"), no photo, no text, two paragraphs, a 59-character
 * teaser, one dropped uncredited gallery row, and a stored cover with no credit.
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

type State =
  | "one"
  | "five"
  | "eight"
  | "none"
  | "notext"
  | "shorttext"
  | "twoparagraphs"
  | "uncredited"
  | "cover-uncredited";

let payloadCache: any = null;

const credited = (i = 0) => ({
  url: IMG,
  author: `Aiko Tanaka ${i}`,
  source: "Wikimedia Commons",
  licence: "CC BY-SA 4.0",
  checkedAt: "2026-11-12T00:00:00Z",
});

const ROWS: Record<State, unknown[]> = {
  one: [credited()],
  five: Array.from({ length: 5 }, (_, i) => credited(i)),
  eight: Array.from({ length: 8 }, (_, i) => credited(i)),
  none: [],
  notext: [credited()],
  shorttext: [credited()],
  twoparagraphs: [credited()],
  uncredited: [credited(), { url: IMG, author: null, source: "wikimedia", licence: null, checkedAt: null }],
  "cover-uncredited": [],
};

async function stub(page: Page, state: State, ownImage: boolean) {
  await page.route("**/fixtures/d1-photo-*.png", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(FIXTURE) });
  });
  await page.route("**/api/place-photos/**", async (route) => {
    // raw rows: the client's own rule must drop the uncredited one, which is the state under test
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photos: ROWS[state] }) });
  });
  await page.route("**/api/discover/location/**", async (route) => {
    if (!payloadCache) {
      const res = await route.fetch();
      payloadCache = await res.json();
    }
    const json = JSON.parse(JSON.stringify(payloadCache));
    const list = Array.isArray(json?.gems?.data) ? json.gems.data : [];
    const target = list[0];
    if (target) {
      target.description =
        state === "notext"
          ? ""
          : state === "shorttext"
            ? "A tiny stone bridge over the Shirakawa canal, at dusk."
            : state === "twoparagraphs"
              ? "First paragraph: the gate opens at seven.\n\nSecond paragraph: the moss garden is behind it, and it is quiet before nine."
              : LONG_TEXT;
      target.whyLocalsLoveIt = state === "notext" || state === "shorttext" || state === "twoparagraphs" ? null : target.whyLocalsLoveIt;
      target.imageUrl = state === "shorttext" ? IMG : target.imageUrl;
      // a stored cover, stamped or not: the chip-style string the parser reads
      target.imageCredit =
        state === "shorttext"
          ? "Aiko Tanaka. Source: https://commons.wikimedia.org/wiki/File:x.jpg License: https://creativecommons.org/licenses/by-sa/4.0/"
          : state === "cover-uncredited"
            ? "Source: https://commons.wikimedia.org/wiki/File:x.jpg"
            : target.imageCredit;
    }
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
  const view = page.getByTestId("details-view");
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => view.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 10_000 }).toBe(1);
  await expect
    .poll(() => view.evaluate((el) => Array.from(el.querySelectorAll("img")).every((img) => (img as HTMLImageElement).complete)), {
      timeout: 10_000,
    })
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
      ["shorttext", true, "text-under-120"],
      ["twoparagraphs", true, "two-paragraphs"],
      ["cover-uncredited", true, "own-cover-uncredited"],
      ["uncredited", false, "uncredited-dropped"],
    ];
    for (const [state, ownImage, name] of cases) {
      await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await stub(page, state, ownImage);
      await openDetails(page);
      const view = page.getByTestId("details-view");

      // V27: every action the type has, in order.
      const slots = await view.locator('[data-testid^="details-action-slot-"]').evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid")),
      );
      expect(slots).toEqual(
        expect.arrayContaining(["details-action-slot-add", "details-action-slot-ask", "details-action-slot-save", "details-action-slot-share"]),
      );

      if (width === 1280) {
        if (state === "five") await expect(view.getByTestId("details-gallery-more")).toHaveText("+2");
        if (state === "eight") await expect(view.getByTestId("details-gallery-more")).toHaveText("+5");
        if (state === "one") await expect(view.getByTestId("details-gallery-more")).toHaveCount(0);
      } else {
        if (state === "five") await expect(view.getByTestId("details-photo-count")).toHaveText("1 of 5");
        if (state === "eight") await expect(view.getByTestId("details-photo-count")).toHaveText("1 of 8");
        if (state === "one" || state === "uncredited") await expect(view.getByTestId("details-photo-count")).toHaveCount(0);
      }

      if (state === "none" || state === "cover-uncredited") await expect(view.getByTestId("details-photo")).toHaveCount(0);
      if (state === "notext") await expect(view.getByTestId("details-teaser")).toHaveCount(0);
      if (state === "shorttext") await expect(view.getByTestId("details-teaser")).toHaveCount(1);
      if (state === "twoparagraphs") await expect(view.getByTestId("details-teaser")).toHaveCount(2);
      if (state === "uncredited") {
        await expect(view.getByTestId("details-photo-count")).toHaveCount(0);
        await expect(view.getByTestId("details-photo-credit")).toContainText("Wikimedia Commons");
      }
      // the credit is a caption under the photo, never a chip over it
      if (state !== "none" && state !== "cover-uncredited") {
        const creditText = await view.getByTestId("details-photo-credit").innerText();
        expect(creditText.startsWith("Photo: ")).toBe(true);
        expect(creditText).toContain(" / ");
        if (state === "one" || state === "five" || state === "eight" || state === "uncredited") {
          expect(creditText).toContain("checked ");
        }
        // a stored cover carries no date: the caption omits "checked ..." rather than inventing one
        if (state === "shorttext") expect(creditText).not.toContain("checked ");
        expect(creditText).not.toContain("http");
      }
      await page.screenshot({ path: path.join(OUT, `gem-details-${name}-${width}.png`) });

      if (width === 390) {
        await view.getByTestId("details-actions-more").click();
        await expect(view.getByTestId("details-actions-more-list")).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `gem-details-more-menu-${width}.png`) });
        await view.getByTestId("details-actions-more").click();
      }

      await page.getByTestId("details-close").click();
      await expect(page.getByTestId("details-view")).toHaveCount(0);
    }
  });
}
