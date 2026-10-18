/**
 * LG-1 addition — re-deriving a neighbourhood centroid from its OSM place node (ledger
 * `2026-10-17-lg1-neighborhood-centroids-dry-run`). Pure; no request.
 *
 *   NC1  one node naming the neighbourhood (through name:en) ⇒ matched, with the metres from the current centroid
 *   NC2  matching nodes far apart ⇒ ambiguous; none ⇒ unmatched
 *   NC3  the city box is the rows' extent padded, never wider than 1° a side
 *
 * Run: npx tsx --test server/services/__tests__/neighborhood-centroid-osm.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cityBoxFor, matchCentroid, nodeNames } from "../neighborhood-centroid-osm";
import { metresBetween } from "../item-osm-regeocode.service";

const GION = { id: "n1", city: "Kyoto", name: "Gion", lat: 35.0036, lng: 135.7748 };
const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ id, lat, lon, tags });

test("NC1: one node naming the neighbourhood is matched, with the distance moved", () => {
  const out = matchCentroid(GION, [node(11, 35.0039, 135.7752, { name: "祇園", "name:en": "Gion", place: "neighbourhood" }), node(12, 35.01, 135.76, { name: "Pontocho" })]);
  assert.equal(out.kind, "matched");
  if (out.kind !== "matched") return;
  assert.equal(out.nodeId, 11);
  assert.equal(out.metresMoved, metresBetween(35.0036, 135.7748, 35.0039, 135.7752));
  assert.deepEqual(nodeNames(node(1, 0, 0, { name: "祇園", "name:en": "Gion", "name:ja-Latn": "Gion" })), ["Gion", "祇園"]);
});

test("NC2: far-apart matches are ambiguous; none is unmatched", () => {
  const far = matchCentroid(GION, [node(1, 35.0039, 135.7752, { "name:en": "Gion" }), node(2, 35.06, 135.7, { "name:en": "Gion" })]);
  assert.equal(far.kind, "ambiguous");
  assert.deepEqual(matchCentroid(GION, [node(3, 35.0, 135.77, { name: "Higashiyama" })]), { kind: "unmatched" });
  assert.deepEqual(matchCentroid(GION, []), { kind: "unmatched" });
});

test("NC3: the city box is the rows' extent padded, capped at 1° a side", () => {
  const box = cityBoxFor([GION, { lat: 34.9671, lng: 135.7727 }]);
  assert.ok(box && box[0] < 135.7727 && box[2] > 135.7748 && box[1] < 34.9671 && box[3] > 35.0036);
  const wide = cityBoxFor([{ lat: 0, lng: 0 }, { lat: 3, lng: 3 }]);
  assert.ok(wide && wide[2] - wide[0] <= 1 + 1e-9 && wide[3] - wide[1] <= 1 + 1e-9);
  assert.equal(cityBoxFor([]), null);
});
