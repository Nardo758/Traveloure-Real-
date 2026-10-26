/**
 * Audit E4 (architect dispatch CB-J; ruling 2026-10-25 20:15 ET; ledger `2026-10-25-e4-area-pins`): a
 * neighbourhood has a name and a point, never a shape. The map names it as a labelled pin, on both renderers.
 *   N1 the scene keeps the neighbourhood data and the show rule; it carries no area style
 *   N2 the pin label and the HTML escape the Leaflet renderer uses
 *   N3 neither renderer draws a shape
 *   N4 the scene and the pass-through carry no shading style
 *   N5 the show rule is unchanged, with no emphasize key
 *   N6 the shared marker list is unchanged (a neighbourhood is not in it)
 *   N7 the label is the data's own name
 *
 * Run: npx tsx --test client/src/lib/__tests__/e4-neighbourhood-pin-label.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { areaPinLabel, areaShading, buildMapScene, escapeHtml, sceneMarkers, type PlanDayStop } from "../map-scene";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const GOOGLE = read("client/src/components/plancard/map/SceneMapGoogle.tsx");
const LEAFLET = read("client/src/components/plancard/map/SceneMapLeaflet.tsx");

const GION = { slug: "gion", name: "Gion", lat: 35.0037, lng: 135.7788 };
const DAY: PlanDayStop[] = [
  { id: "p1", name: "Kinkaku-ji", time: "09:00", lat: 35.0394, lng: 135.7292 },
  { id: "p2", name: "Tenryu-ji", time: "13:00", lat: 35.0158, lng: 135.6737 },
];
const STAY = { kind: "stay" as const, name: "Hotel Granvia Kyoto", lat: 34.9858, lng: 135.7588 };

describe("audit E4: a neighbourhood is a labelled pin, never a shape", () => {
  it("N1 the scene keeps the data and the show rule, with no area style", () => {
    const on = buildMapScene({ dayNumber: 1, planStops: DAY, areas: [GION], showAreas: true, layers: { plan: true, browse: false } });
    assert.deepEqual(on.areas, [GION]);
    assert.ok(!("areaStyle" in on));
    assert.deepEqual(buildMapScene({ dayNumber: 1, planStops: DAY, areas: [GION], showAreas: false, layers: { plan: true, browse: false } }).areas, []);
    assert.ok(!sceneMarkers(on).some((m) => m.testId.includes("gion") || (m as any).id === "gion"));
  });

  it("N2 the pin label and the escape", () => {
    assert.deepEqual(areaPinLabel(GION), { testId: "map-neighbourhood-gion", title: "Gion", text: "Gion" });
    const out = escapeHtml(`<img src=x onerror=alert(1)> & "Gion"`);
    assert.ok(!/[<>"]/.test(out));
    assert.ok(out.includes("Gion"));
    assert.equal(escapeHtml("Gion's & <b>"), "Gion&#39;s &amp; &lt;b&gt;");
    assert.match(LEAFLET, /escapeHtml\(l\.text\)/, "the Leaflet label text goes through escapeHtml");
  });

  it("N3 neither renderer draws a shape", () => {
    for (const [name, src] of [["google", GOOGLE], ["leaflet", LEAFLET]] as const) {
      assert.doesNotMatch(src, /google\.maps\.Circle|<Circle|CircleMarker|Polygon/, name);
      assert.doesNotMatch(src, /(?<![-A-Za-z])radius\b/, `${name}: no radius (border-radius stays)`);
      assert.doesNotMatch(src, /700/, `${name}: no 700`);
      assert.doesNotMatch(src, /fillOpacity|strokeOpacity\s*:|areaStyle/, name);
      assert.match(src, /scene\.areas/, name);
      assert.match(src, /areaPinLabel\(/, name);
    }
    assert.doesNotMatch(LEAFLET, /import \{[^}]*\bCircle\b[^}]*\} from "react-leaflet"/);
    assert.match(LEAFLET, /interactive=\{false\} keyboard=\{false\} zIndexOffset=\{-1000\}/);
    assert.doesNotMatch(GOOGLE.slice(GOOGLE.indexOf("function AreaPins"), GOOGLE.indexOf("function Scene")), /onClick/, "a neighbourhood pin opens nothing");
  });

  it("N4 the scene and the pass-through carry no shading style", () => {
    const scene = read("client/src/lib/map-scene.ts");
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    const slip = read("client/src/components/plancard/SlipView.tsx");
    for (const [name, src] of [["map-scene", scene], ["MapControlCenter", mcc], ["SlipView", slip]] as const) {
      assert.doesNotMatch(src, /AREA_STYLE|areaStyle|strokeOpacity|fillOpacity|emphasizeAreas/, name);
    }
    assert.match(mcc, /showAreas/);
    assert.match(mcc, /\bareas\b/);
    assert.ok(slip.includes("areas={mapAreas}"));
    assert.ok(slip.includes("showAreas={shading.show}"));
  });

  it("N5 the show rule is unchanged", () => {
    assert.deepEqual(areaShading({ stayLocated: true, panelOpen: false }), { show: true });
    assert.deepEqual(areaShading({ stayLocated: false, panelOpen: true }), { show: true });
    assert.deepEqual(areaShading({ stayLocated: true, panelOpen: true }), { show: true });
    assert.deepEqual(areaShading({ stayLocated: false, panelOpen: false }), { show: false });
    assert.ok(!("emphasize" in areaShading({ stayLocated: true, panelOpen: true })));
  });

  it("N6 the shared marker list is unchanged", () => {
    const scene = buildMapScene({
      dayNumber: 1,
      planStops: DAY,
      planAnchor: STAY,
      areas: [GION],
      showAreas: true,
      browse: [{ id: "b1", kind: "listing", name: "Nishiki Market", lat: 35.005, lng: 135.765 }],
      layers: { plan: true, browse: true },
    });
    const markers = sceneMarkers(scene);
    assert.equal(markers.filter((m) => m.kind === "pin").length, 2);
    assert.equal(markers.filter((m) => m.kind === "anchor").length, 1);
    assert.equal(markers.filter((m) => m.kind === "browse").length, 1);
    assert.equal(markers.length, 4, "the neighbourhood is not in the shared list");
    assert.equal(scene.areas.length, 1);
  });

  it("N7 the label is the data's own name", () => {
    const name = "Pontocho's Alley";
    assert.equal(areaPinLabel({ ...GION, slug: "pontocho", name }).text, name);
    assert.equal(areaPinLabel({ ...GION, slug: "pontocho", name }).title, name);
    for (const src of [GOOGLE, LEAFLET]) assert.match(src, /const l = areaPinLabel\(a\);/);
  });
});
