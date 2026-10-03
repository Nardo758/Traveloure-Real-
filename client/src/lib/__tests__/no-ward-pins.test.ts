/**
 * No ward centroids (decision-maker, Oct 3, 2026 — ledger `2026-10-03-no-ward-pins`).
 *   N1  a geocode Google marks as an AREA (APPROXIMATE, or typed locality / ward / neighbourhood /
 *       postal code / country) is refused; a street address or a named venue is not
 *   N2  an area-only location ("Higashiyama Ward, Kyoto") leads the query with the item's title;
 *       a real address is geocoded as written, and the plan's city is only ever a suffix
 *   N3  isAreaOnlyLocation: an area is area-only; a venue or street in the string is not
 *   N4  wiring: the backfill refuses an area-level result and builds its query through geocodeQuery
 *   N5  the slip's map line reads "N of M located"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geocodeQuery, isAreaLevelGeocode } from "../../../../server/services/coordinate-backfill.pure";
import { isAreaOnlyLocation } from "@shared/ai-place-text";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("N1: area-level geocodes are refused", () => {
  assert.equal(isAreaLevelGeocode({ locationType: "APPROXIMATE", types: ["point_of_interest"] }), true);
  assert.equal(isAreaLevelGeocode({ locationType: "GEOMETRIC_CENTER", types: ["sublocality_level_1", "sublocality", "political"] }), true);
  assert.equal(isAreaLevelGeocode({ locationType: "GEOMETRIC_CENTER", types: ["locality", "political"] }), true);
  assert.equal(isAreaLevelGeocode({ locationType: "ROOFTOP", types: ["street_address"] }), false);
  assert.equal(isAreaLevelGeocode({ locationType: "GEOMETRIC_CENTER", types: ["tourist_attraction", "place_of_worship", "point_of_interest", "establishment"] }), false);
  assert.equal(isAreaLevelGeocode({ locationType: "RANGE_INTERPOLATED", types: [] }), false);
});

test("N2: the query leads an area-only location with the title", () => {
  assert.equal(
    geocodeQuery({ title: "Kiyomizu-dera", locationName: "Higashiyama Ward, Kyoto", locationAddress: null }, "Kyoto, Japan", isAreaOnlyLocation),
    "Kiyomizu-dera, Higashiyama Ward, Kyoto, Kyoto, Japan",
  );
  assert.equal(
    geocodeQuery({ title: "Lunch", locationName: "1-1 Kiyomizu, Higashiyama Ward, Kyoto", locationAddress: null }, "Kyoto, Japan", isAreaOnlyLocation),
    "1-1 Kiyomizu, Higashiyama Ward, Kyoto, Kyoto, Japan",
    "a real address is geocoded as written",
  );
  assert.equal(geocodeQuery({ title: "Free time", locationName: null, locationAddress: null }, "Kyoto, Japan", isAreaOnlyLocation), "Kyoto, Japan", "the city alone is what hasItemLocation already refuses");
});

test("N3: isAreaOnlyLocation", () => {
  assert.equal(isAreaOnlyLocation("Higashiyama Ward, Kyoto"), true);
  assert.equal(isAreaOnlyLocation("Gion"), true);
  assert.equal(isAreaOnlyLocation("Kiyomizu-dera, Higashiyama Ward, Kyoto"), false);
  assert.equal(isAreaOnlyLocation("1-1 Kiyomizu, Higashiyama Ward"), false);
  assert.equal(isAreaOnlyLocation(""), false);
});

test("N4: the backfill refuses area results and uses the one query builder", () => {
  const src = readFileSync(path.join(repo, "server/services/trip-plan.service.ts"), "utf8");
  assert.match(src, /const address = geocodeQuery\(item, destination, isAreaOnlyLocation\);/);
  assert.match(src, /if \(!geo \|\| isAreaLevelGeocode\(geo\)\) continue;/);
});

test("N5: the slip's map line reads 'N of M located'", () => {
  const src = readFileSync(path.join(repo, "client/src/components/plancard/SlipView.tsx"), "utf8");
  const at = src.indexOf('data-testid="text-slip-map-located"');
  const block = src.slice(at, src.indexOf("</span>\n              )}", at));
  assert.match(block, /\{locatedActivities\.length\} of \{allActivities\.length\}\s*<\/span>\{" "\}\s*located/);
  assert.doesNotMatch(block, /stop\{/);
});
