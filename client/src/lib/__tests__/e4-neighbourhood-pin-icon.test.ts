/**
 * Audit E4 follow-up (architect dispatch CB-P; ruling 2026-10-26 14:55 ET): on the Google map with no Map ID the
 * neighbourhood label hides the default red pin through an optional `icon` prop; nothing else changes.
 *   P1 the prop is optional, forwarded to the standard Marker only, and only the neighbourhood label passes it
 *
 * Run: npx tsx --test client/src/lib/__tests__/e4-neighbourhood-pin-icon.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const MARKER = read("client/src/components/ui/map-marker.tsx");
const GOOGLE = read("client/src/components/plancard/map/SceneMapGoogle.tsx");

describe("audit E4 follow-up: the neighbourhood label hides the default red pin", () => {
  it("P1 icon is optional, standard-Marker-only, and passed only by the neighbourhood label", () => {
    // map-marker.tsx: optional prop, no default value, forwarded to <Marker> and not to <AdvancedMarker>
    assert.match(MARKER, /\bicon\?: google\.maps\.MarkerOptions\["icon"\];/);
    assert.doesNotMatch(MARKER, /\bicon\s*=\s/, "no default value for icon");
    assert.match(MARKER.slice(MARKER.lastIndexOf("<Marker")), /icon=\{icon\}/, "the standard Marker gets icon");
    assert.doesNotMatch(MARKER.slice(MARKER.indexOf("<AdvancedMarker"), MARKER.indexOf("</AdvancedMarker>")), /icon/, "the Map-ID path ignores it");
    // SceneMapGoogle.tsx: exactly one icon prop, inside AreaPins; the other three markers pass none
    const area = GOOGLE.slice(GOOGLE.indexOf("function AreaPins"), GOOGLE.indexOf("function Scene"));
    assert.equal(area.match(/\bicon=\{/g)?.length, 1);
    assert.match(area, /icon=\{HIDDEN_PIN_ICON\}/);
    assert.doesNotMatch(GOOGLE.slice(GOOGLE.indexOf("function Scene")), /\bicon=/, "plan pins, anchor and Browse markers keep the default pin");
    // every other MapMarker caller is untouched: none references the constant
    for (const rel of ["client/src/components/service-location-map.tsx", "client/src/components/backoffice/location-point-picker.tsx", "client/src/pages/layout-mock.tsx"]) {
      assert.doesNotMatch(read(rel), /HIDDEN_PIN_ICON/, rel);
    }
  });
});
