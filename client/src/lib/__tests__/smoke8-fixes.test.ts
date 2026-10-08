/**
 * Smoke 8 (plan 13685cd0), item 5 — pure rules and source pins. Items 1–4 are proven beside their
 * own modules (anchor-panel.test.tsx, where-to-stay.db.test.ts, places-field-mask.test.ts,
 * flight-lookup.test.ts).
 *
 *   Z1 one located pin is centred at district zoom, never fitted to the rooftop
 *   Z2 several pins fit their bounds, clamped so framing never zooms past the district
 *   Z3 the slip map uses the rule (no bare fitBounds on a single pin)
 *   D1 the departure row is the LAST row inside the last day — after the day's stops and legs and
 *      ABOVE its "Add something to this day" control
 *
 * Run: npx tsx --test client/src/lib/__tests__/smoke8-fixes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_DISTRICT_ZOOM, clampFramingZoom, mapFraming } from "../map-framing";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(path.resolve(here, "..", "..", rel), "utf8");

test("Z1 one pin: centred at district zoom", () => {
  assert.deepEqual(mapFraming([{ lat: 35.0158, lng: 135.6737 }]), { kind: "center", center: { lat: 35.0158, lng: 135.6737 }, zoom: MAP_DISTRICT_ZOOM });
  // Two items at the SAME spot are still one pin.
  assert.equal(mapFraming([{ lat: 35.0158, lng: 135.6737 }, { lat: 35.0158, lng: 135.6737 }]).kind, "center");
  assert.ok(MAP_DISTRICT_ZOOM >= 13 && MAP_DISTRICT_ZOOM <= 15, "a district, not a city and not a roof");
  assert.deepEqual(mapFraming([]), { kind: "none" });
});

test("Z2 several pins: fit, clamped to the district", () => {
  assert.deepEqual(mapFraming([{ lat: 35.0, lng: 135.7 }, { lat: 35.01, lng: 135.78 }]), { kind: "bounds", maxZoom: MAP_DISTRICT_ZOOM });
  assert.equal(clampFramingZoom(19), MAP_DISTRICT_ZOOM, "two pins a few metres apart would land on the roof");
  assert.equal(clampFramingZoom(MAP_DISTRICT_ZOOM), null, "already at the district — leave it");
  assert.equal(clampFramingZoom(11), null, "a wide fit is never zoomed in");
  assert.equal(clampFramingZoom(undefined), null);
});

test("Z3 the slip map frames through the rule", () => {
  // Surface step 5: the framing moved into the map's renderers — Google keeps the clamp; the
  // Leaflet fallback frames through the same rule.
  assert.match(src("components/plancard/map/SceneMapLeaflet.tsx"), /mapFraming\(/);
  const map = src("components/plancard/map/SceneMapGoogle.tsx");
  assert.match(map, /mapFraming\(/);
  assert.match(map, /clampFramingZoom\(map\.getZoom\(\), framing\.maxZoom\)/);
  assert.match(map, /if \(framing\.kind === "center"\) \{\s*map\.setCenter\(framing\.center\);\s*map\.setZoom\(framing\.zoom\);/);
});

test("D1 the departure row is the last row of the last day, above its add control", () => {
  const slip = src("components/plancard/SlipView.tsx");
  // FU-9C-1 (sanctioned re-anchor): the day-end leg list is retired; the day's legs render between
  // its stops, so "after the stops and legs" is after the LAST `renderLegBetween(` call.
  const legs = slip.lastIndexOf("renderLegBetween(");
  const dep = slip.search(/<TravelAnchorPlaceholder\s+kind="departure"/);
  const add = slip.indexOf("testId={`slip-day-add-${slot.key}`}");
  const dayEnd = slip.indexOf("</DayBlock>", dep);
  assert.ok(legs > 0 && dep > 0 && add > 0 && dayEnd > 0);
  assert.ok(legs < dep, "after the day's stops and legs");
  assert.ok(dep < add, "above the day's add control");
  assert.ok(add < dayEnd, "the add control is the only thing after it inside the day");
  assert.equal(slip.match(/<TravelAnchorPlaceholder\s+kind="departure"/g)?.length, 1, "one departure row");
});
