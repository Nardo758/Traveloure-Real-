/**
 * D1 (Leon, Nov 27 2026) replaced the R4-10 stock dedupe: there is no stock request to dedupe any more.
 *
 *   D1 no source file asks /api/media/place-photo for a photo
 *   D2 the hook returns the record's own image and never a stock answer
 *   D3 with no image the caller gets null, so its existing no-photo state stands
 *
 * Run: npx tsx --test client/src/hooks/__tests__/r4-stock-photo-dedupe.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HOOK = path.join(ROOT, "client/src/hooks/use-gem-photo.ts");
const hookSrc = () => fs.readFileSync(HOOK, "utf8");

describe("D1 - no stock-by-name fallback", () => {
  it("D1 the hook never asks for a stock photo", () => {
    const src = hookSrc();
    assert.equal(src.includes("/api/media/place-photo"), false, "the hook names no stock endpoint");
    assert.equal(src.includes("fetch("), false, "the hook makes no request");
    assert.equal(src.includes("unsplash"), false, "no stock source is named");
  });

  it("D2 the hook returns the record's own image", () => {
    const src = hookSrc();
    assert.match(src, /photoUrl: existingImageUrl \?\? null/, "passes the record's image through");
    assert.match(src, /credit: null/, "never invents a stock credit");
  });

  it("D3 the five call sites pass a record image or nothing", () => {
    const card = fs.readFileSync(path.join(ROOT, "client/src/components/city-feed-card.tsx"), "utf8");
    const rec = fs.readFileSync(path.join(ROOT, "client/src/components/city-feed-card-recommendation.tsx"), "utf8");
    assert.equal(card.includes("useGemPhoto("), false, "the feed cards no longer call the stock hook");
    assert.equal(rec.includes("useGemPhoto"), false, "the recommendation tile no longer calls it");
    assert.equal(card.includes("gem.imageUrl"), true, "the gem keeps its own image");
  });
});
