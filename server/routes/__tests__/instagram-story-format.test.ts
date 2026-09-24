/**
 * instagram-story-format.test.ts
 *
 * The share kit's Story frame is 1080×1920. Instagram refuses a 9:16 image as a FEED post, so the
 * container must be created with media_type STORIES. buildInstagramContainerBody is the one place
 * that decides the Graph API body for POST /api/instagram/publish.
 *
 * Run with: npx tsx --test server/routes/__tests__/instagram-story-format.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

const { buildInstagramContainerBody } = await import("../instagram.js");

describe("buildInstagramContainerBody", () => {
  it("a story frame is created as media_type STORIES with no caption", () => {
    const body = buildInstagramContainerBody({
      imageUrl: "https://example.test/s.png",
      caption: "hello",
      format: "story",
      accessToken: "tok",
    });
    assert.deepEqual(body, { image_url: "https://example.test/s.png", media_type: "STORIES", access_token: "tok" });
  });

  it("a feed frame (and the default) is a plain image post carrying the caption", () => {
    const feed = buildInstagramContainerBody({ imageUrl: "u", caption: "c", format: "feed", accessToken: "t" });
    assert.deepEqual(feed, { image_url: "u", caption: "c", access_token: "t" });
    const dflt = buildInstagramContainerBody({ imageUrl: "u", caption: null, accessToken: "t" });
    assert.deepEqual(dflt, { image_url: "u", caption: "", access_token: "t" });
    assert.equal("media_type" in dflt, false);
  });
});
