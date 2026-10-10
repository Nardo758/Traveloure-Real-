/**
 * SS-1b — a station's point from its OpenStreetMap node (decision-maker, Oct 10, 2026; ledger
 * `2026-10-10-ss1b-official-refresh`). `resolveOsmNode` is the city-event venue path (LD 59) for a GIVEN node:
 *
 *   ON1  one Nominatim LOOKUP of that node (never a search), the app's user agent; a node naming the station ⇒
 *        its point with "© OpenStreetMap contributors"
 *   ON2  a node that does not name the station, another node, or no answer row ⇒ null (never a guess)
 *   ON3  a failed fetch or non-OK status ⇒ "unreachable"; a malformed node id asks nothing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OSM_ATTRIBUTION, resolveOsmNode } from "../venue-geocode.service";

const stub = (rows: unknown, ok = true) => {
  const seen: { url: string; ua: string }[] = [];
  const f = async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, ua: init.headers["User-Agent"] });
    return { ok, json: async () => rows };
  };
  return { f, seen };
};
const node = { osm_type: "node", osm_id: 2389047552, lat: "35.0037212", lon: "135.7722146", name: "祇園四条", namedetails: { "name:en": "Gion-Shijo", name: "祇園四条" } };

test("ON1 — one lookup of the named node; the point with its attribution", async () => {
  const { f, seen } = stub([node]);
  const r = await resolveOsmNode({ osmNodeId: 2389047552, name: "gion shijo" }, f);
  assert.deepEqual(r, { lat: 35.0037212, lng: 135.7722146, matchedName: "Gion-Shijo", attribution: OSM_ATTRIBUTION });
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/lookup\?/);
  assert.match(seen[0].url, /osm_ids=N2389047552/);
  assert.match(seen[0].ua, /^Traveloure/);
});

test("ON2 — no guess", async () => {
  assert.equal(await resolveOsmNode({ osmNodeId: 2389047552, name: "kawaramachi" }, stub([node]).f), null, "the node names another station");
  assert.equal(await resolveOsmNode({ osmNodeId: 1, name: "gion shijo" }, stub([node]).f), null, "the answer is another node");
  assert.equal(await resolveOsmNode({ osmNodeId: 2389047552, name: "gion shijo" }, stub([{ ...node, osm_type: "way" }]).f), null);
  assert.equal(await resolveOsmNode({ osmNodeId: 2389047552, name: "gion shijo" }, stub([]).f), null);
});

test("ON3 — unreachable, and a malformed id asks nothing", async () => {
  assert.equal(await resolveOsmNode({ osmNodeId: 2389047552, name: "gion shijo" }, stub([node], false).f), "unreachable");
  assert.equal(await resolveOsmNode({ osmNodeId: 2389047552, name: "gion shijo" }, async () => { throw new Error("net"); }), "unreachable");
  const s = stub([node]);
  assert.equal(await resolveOsmNode({ osmNodeId: 0, name: "gion shijo" }, s.f), null);
  assert.equal(s.seen.length, 0);
});
