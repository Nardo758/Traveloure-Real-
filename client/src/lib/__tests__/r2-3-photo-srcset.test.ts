/**
 * R2-3 — Wikimedia thumbnails for the city feed's photos.
 *
 * The defect: `buildSrcSet` in `city-feed-card.tsx` only knew Unsplash, so every Wikimedia Commons URL
 * rendered with no srcSet and the browser downloaded the original — 29–31 MB on
 * /discover/location/Kyoto (Tenryū-ji 16 MB, Arashiyama 9 MB).
 *
 * The rule this pins: ask Wikimedia ONLY for its standard thumb steps (MediaWiki
 * `Manual:$wgThumbLimits`), never wider than the source, and keep the original as the `src` fallback.
 *
 *   S1 a Commons original becomes the standard `/thumb/…/<n>px-…` shape, for standard widths only
 *   S2 off-grid widths are refused (those are the ones the service throttles/refuses)
 *   S3 the original is never re-wrapped, never a thumb-of-a-thumb
 *   S4 anything that is not a Commons raster gets NO srcSet — the original stands alone
 *   S5 the cap: nothing wider than `maxWidth` is ever requested
 *   S6 the card actually asks for it, and keeps `src` as the original
 *
 * Run: npx tsx --test client/src/lib/__tests__/r2-3-photo-srcset.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CARD_THUMB_WIDTHS,
  WIKIMEDIA_STANDARD_WIDTHS,
  parseWikimediaCommons,
  wikimediaSrcSet,
  wikimediaThumbUrl,
} from "@shared/photo-srcset";

const TENRYUJI =
  "https://upload.wikimedia.org/wikipedia/commons/1/15/Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg";
const CARD = fs.readFileSync("client/src/components/city-feed-card.tsx", "utf8");

describe("R2-3 — the Wikimedia thumb URL", () => {
  it("S1 a Commons original becomes the standard thumb shape", () => {
    const thumb = wikimediaThumbUrl(TENRYUJI, 320);
    assert.equal(
      thumb,
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg/320px-Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg",
    );
    // Every step the card uses is a standard one, and each yields a thumb.
    for (const width of CARD_THUMB_WIDTHS) {
      assert.ok(WIKIMEDIA_STANDARD_WIDTHS.includes(width), `${width} is a standard step`);
      assert.ok(wikimediaThumbUrl(TENRYUJI, width)?.includes(`/${width}px-`), `${width} yields a thumb`);
    }
  });

  it("S2 an off-grid width is refused, not silently widened", () => {
    for (const width of [333, 500.5 as unknown as number, 999, 4096]) {
      assert.equal(wikimediaThumbUrl(TENRYUJI, width), null, `${width} is not a standard step`);
    }
  });

  it("S3 a thumb is never wrapped again", () => {
    const thumb = wikimediaThumbUrl(TENRYUJI, 320)!;
    assert.equal(parseWikimediaCommons(thumb).isCommons, false, "a /thumb/ URL is not an original");
    assert.equal(wikimediaThumbUrl(thumb, 640), null, "no thumb-of-a-thumb");
  });

  it("S4 non-Commons and non-raster URLs get NO srcSet", () => {
    assert.equal(wikimediaThumbUrl("https://images.unsplash.com/photo-1", 320), null);
    assert.equal(wikimediaThumbUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.svg", 320), null, "SVG keeps its original");
    assert.equal(wikimediaThumbUrl("https://example.com/wikipedia/commons/a/ab/x.jpg", 320), null, "the host must be Wikimedia's");
    assert.equal(wikimediaThumbUrl("not a url", 320), null);
    assert.equal(wikimediaSrcSet("https://images.unsplash.com/photo-1"), null);
  });

  it("S5 nothing wider than the cap is requested", () => {
    const set = wikimediaSrcSet(TENRYUJI)!;
    const widths = [...set.matchAll(/\s(\d+)w/g)].map((m) => Number(m[1]));
    assert.deepEqual(widths, CARD_THUMB_WIDTHS.filter((w) => w <= 800), "standard steps, ascending, capped");
    // A narrower cap prunes the wider candidates rather than being rounded up.
    const tight = wikimediaSrcSet(TENRYUJI, { maxWidth: 480 })!;
    assert.deepEqual([...tight.matchAll(/\s(\d+)w/g)].map((m) => Number(m[1])), [320, 480]);
    assert.equal(wikimediaSrcSet(TENRYUJI, { maxWidth: 300 }), null, "a cap below the smallest step asks for nothing");
  });
});

describe("R2-3 — the card asks for it, and keeps the original as src", () => {
  it("S6 buildSrcSet consults the Wikimedia helper and leaves src alone", () => {
    assert.match(CARD, /import \{ wikimediaSrcSet \} from "@shared\/photo-srcset";/);
    assert.match(CARD, /const wikimedia = wikimediaSrcSet\(url\);/, "the helper is asked");
    assert.match(CARD, /if \(wikimedia\) return \{ srcSet: wikimedia, sizes \};/, "…and its answer is used");
    // The image keeps the ORIGINAL as src (the fallback), with the srcSet beside it.
    assert.match(CARD, /<img\s*\n\s*src=\{photoUrl\}\s*\n\s*srcSet=\{srcSet\}/, "src stays the original");
  });
});
