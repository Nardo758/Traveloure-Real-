/**
 * CP-3 (ledger `2026-10-16-cp3-share-image-ref`): the share kit's download links.
 *
 *   K1  With the expert's code, the cover and story downloads carry `&ref=<code>`; map and og do not.
 *   K2  With no code, no download carries a ref (every card prints the /t/ link, never a guessed code).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readyMadeShareKitLinks } from "../../components/expert/ready-made-share-kit";

const listing = { id: "rm-1", title: "Autumn Kyoto" };

test("K1 · cover and story carry the expert's code; map and og do not", () => {
  const { images } = readyMadeShareKitLinks(listing, "https://traveloure.com", "abc12345");
  const href = (f: string) => images.find((i) => i.format === f)!.href;
  assert.equal(href("cover"), "/api/share-image/ready-made/rm-1.png?format=cover&download=1&ref=abc12345");
  assert.equal(href("story"), "/api/share-image/ready-made/rm-1.png?format=story&download=1&ref=abc12345");
  assert.equal(href("map"), "/api/share-image/ready-made/rm-1.png?format=map&download=1");
  assert.equal(href("og"), "/api/share-image/ready-made/rm-1.png?format=og&download=1");
});

test("K2 · no code, no ref", () => {
  const { images, pageUrl } = readyMadeShareKitLinks(listing, "https://traveloure.com");
  assert.ok(images.every((i) => !i.href.includes("ref=")));
  assert.match(pageUrl, /^https:\/\/traveloure\.com\/t\//);
});
