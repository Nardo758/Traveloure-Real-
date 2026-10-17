/**
 * GC-1 (ledger `2026-10-17-gc1-google-coords`; R-d as amended): the slip's Leaflet fallback is not a Google map.
 *
 *   L1  The Leaflet renderer draws no leg line and no minute (no `legs`, no Tooltip).
 *   L2  The map mounts Leaflet only when every located stop's point is non-Google; otherwise it shows the day as
 *       a list (names and times only), and the OpenStreetMap notice is drawn only over the Leaflet map.
 *   L3  The share kit no longer offers the Route slide (the map format is not served).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { SHARE_KIT_IMAGES } from "../../components/expert/ready-made-share-kit";

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");

test("L1 · Leaflet draws no leg lines and no minutes", () => {
  const src = read("client/src/components/plancard/map/SceneMapLeaflet.tsx");
  assert.doesNotMatch(src, /legs \?\?|legs\.map|\{ ?legs ?\}|, legs \}/);
  assert.match(src, /Omit<SceneMapProps, "legs">/, "the legs prop is not accepted");
  assert.doesNotMatch(src, /Tooltip|durationLabel/);
});

test("L2 · the Leaflet fallback shows a list unless every located stop is non-Google", () => {
  const src = read("client/src/components/plancard/MapControlCenter.tsx");
  assert.match(src, /const leafletMapAllowed = everyLocatedPointNonGoogle\(/);
  assert.match(src, /\) : leafletMapAllowed \? \(\s*<SceneMapLeaflet/);
  assert.match(src, /<MapFallbackList tripId=\{tripId\} activities=\{day\?\.activities \?\? \[\]\} \/>/);
  assert.match(src, /renderer === "leaflet" && center && leafletMapAllowed \?/);
});

test("L3 · the share kit offers no Route slide", () => {
  assert.deepEqual(SHARE_KIT_IMAGES.map((i) => i.format), ["cover", "story", "og"]);
});
