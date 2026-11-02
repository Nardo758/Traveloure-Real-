/**
 * Row PS-1 (ledger `2026-11-02-ps1-planning-map-pins-only`): the planning map draws pins and the stay
 * ring only — no leg lines and no minute labels (GC-1, B8).
 *
 *   T1  SceneMapGoogle / SceneMapLeaflet: no Polyline import or JSX, no leg prop
 *   T2  MapControlCenter builds no legs and no "Nm" label, and takes no travel-minutes switch
 *   T3  pins, the stay ring (anchor) and the moved-stop colour still come from the shared marker list
 *   T4  OnTripMapCanvas is unchanged (source hash pinned at PR time)
 *
 * Harness: source read with fs. No git, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const read = (p: string) => fs.readFileSync(p, "utf8");
const strip = (src: string) =>
  src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const GOOGLE = read("client/src/components/plancard/map/SceneMapGoogle.tsx");
const LEAFLET = read("client/src/components/plancard/map/SceneMapLeaflet.tsx");
const MCC = read("client/src/components/plancard/MapControlCenter.tsx");

describe("PS-1 pins only on the planning map", () => {
  it("T1 neither renderer draws a line", () => {
    for (const [name, src] of [["google", GOOGLE], ["leaflet", LEAFLET]] as const) {
      const code = strip(src);
      assert.doesNotMatch(code, /Polyline|polyline/, name);
      assert.doesNotMatch(code, /legs \?\?|legs\.map|\{ ?legs ?\}|, legs \}|SceneLeg/, name);
    }
    assert.equal(fs.existsSync("client/src/components/plancard/map/scene-legs.ts"), false);
  });

  it("T2 the map control center builds no legs and no minute label", () => {
    const code = strip(MCC);
    assert.doesNotMatch(code, /durationLabel|\$\{tr\.duration\}m|SceneLeg|legs=\{/);
    assert.doesNotMatch(code, /showTravelMinutes/);
    assert.doesNotMatch(code, /getModeColor/);
    assert.ok(!read("client/src/components/plancard/SlipView.tsx").includes("<MapControlCenter") || !/<MapControlCenter[\s\S]{0,2500}showTravelMinutes=/.test(read("client/src/components/plancard/SlipView.tsx")));
    assert.doesNotMatch(read("client/src/components/plancard/PlanCard.tsx"), /<MapControlCenter[\s\S]{0,1500}showTravelMinutes=/);
  });

  it("T3 pins, the stay ring and the moved-stop colour still render from the shared list", () => {
    for (const src of [GOOGLE, LEAFLET]) assert.match(src, /sceneMarkers\(scene\)/);
    assert.match(GOOGLE, /PIN_STYLE\[m\.state\]/);
    assert.match(GOOGLE, /data-pin-state=\{m\.state\}/);
    assert.match(read("client/src/lib/map-scene.ts"), /moved/);
  });

  it("T4 OnTripMapCanvas is unchanged", () => {
    const hash = crypto.createHash("sha256").update(read("client/src/components/plancard/OnTripMapCanvas.tsx")).digest("hex");
    assert.equal(hash, "0e8f91bbf8982d554aa2f4fb710246f6348e99393aa420a27edc7e76308013b3");
  });
});
