/**
 * Leon's ruling (Nov 27 2026): a photo credit needs an AUTHOR and a LICENCE. A third-party row carrying only one of
 * them is dropped by `placePhotosFor`; our own rows need neither.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoRowCredited } from "../place-photos.service";

test("[v31-photos] author AND licence, or the row is dropped", () => {
  assert.equal(photoRowCredited({ source: "wikimedia", attribution: "Aiko", licence: "CC BY-SA 4.0" }), true);
  assert.equal(photoRowCredited({ source: "wikimedia", attribution: "Aiko", licence: null }), false);
  assert.equal(photoRowCredited({ source: "wikimedia", attribution: null, licence: "CC BY-SA 4.0" }), false);
  assert.equal(photoRowCredited({ source: "wikimedia", attribution: "  ", licence: "  " }), false);
  assert.equal(photoRowCredited({ source: "ours", attribution: null, licence: null }), true);
  console.log("[v31-photos] server rule: author+licence, ours exempt");
});
