/**
 * Surface step 5 — the ONE map (ledger `2026-10-04-surface-step5-map-versions`; spec §2.3; R-d).
 *   M1 plan layer, with and without an anchor
 *   M2 area-only stops are listed, never pinned
 *   M3 the Browse layer's markers (own coordinates only; hosts are never pins)
 *   M4 version diff colouring — moved gold, dropped ghosted, added marked; the anchor moves
 *   M5 renderer choice and the sticky, once-per-page fallback
 *   M6 renderer parity — both renderers draw exactly `sceneMarkers(scene)`
 *   M7 no travel minutes unless the travel-time service is on (R-h)
 *   M8 MapControlCenter is the only map on the slip, the Trip Card and the comparison screen
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BROWSE_TEAL,
  PIN_STYLE,
  buildMapScene,
  sceneMarkers,
  type BrowsePlace,
  type MapVersion,
  type PlanDayStop,
} from "../map-scene";
import {
  MAP_FALLBACK_NOTICE,
  MAP_LOAD_TIMEOUT_MS,
  __resetMapFallbackForTests,
  chooseMapRenderer,
  markMapFallback,
} from "../map-renderer";
import { browseAddBody, hostRows, listingPlaces, partnerPlaces } from "../browse-supply";
import { diffVersionDays, type BoardStop } from "@shared/version-board";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// A Kyoto day: two Google-located stops, one area-only stop (no point).
const DAY2: PlanDayStop[] = [
  { id: "p1", name: "Kinkaku-ji", time: "09:00", lat: 35.0394, lng: 135.7292 },
  { id: "p2", name: "Arashiyama (area)", time: "11:30", lat: null, lng: null },
  { id: "p3", name: "Tenryu-ji", time: "13:00", lat: 35.0158, lng: 135.6737 },
];
const STAY = { kind: "stay" as const, name: "Hotel Granvia Kyoto", lat: 34.9858, lng: 135.7588 };

test("M1 plan layer: numbered located stops in day order, a straight connector, the anchor when located", () => {
  const without = buildMapScene({ dayNumber: 2, planStops: DAY2, layers: { plan: true, browse: false } });
  assert.deepEqual(without.pins.map((p) => [p.id, p.n, p.state]), [["p1", 1, "plan"], ["p3", 3, "plan"]]);
  assert.equal(without.connector.length, 2, "connector joins the located pins in order");
  assert.equal(without.anchor, null);
  assert.ok(!sceneMarkers(without).some((m) => m.kind === "anchor"));

  const withA = buildMapScene({ dayNumber: 2, planStops: DAY2, planAnchor: STAY, layers: { plan: true, browse: false } });
  assert.equal(withA.anchor?.name, "Hotel Granvia Kyoto");
  assert.equal(sceneMarkers(withA).filter((m) => m.testId === "map-anchor").length, 1);

  // An unlocated anchor is never drawn (§13), and the anchor stays when the plan layer is off.
  assert.equal(buildMapScene({ dayNumber: 2, planStops: DAY2, planAnchor: { ...STAY, lat: null, lng: null }, layers: { plan: true, browse: false } }).anchor, null);
  const off = buildMapScene({ dayNumber: 2, planStops: DAY2, planAnchor: STAY, layers: { plan: false, browse: false } });
  assert.equal(off.pins.length, 0);
  assert.ok(off.anchor, "the anchor marker is always visible");

  // Neighbourhoods shade only while asked.
  const areas = [{ slug: "gion", name: "Gion", lat: 35.0037, lng: 135.7788 }];
  assert.equal(buildMapScene({ dayNumber: 2, planStops: DAY2, areas, showAreas: false, layers: { plan: true, browse: false } }).areas.length, 0);
  assert.equal(buildMapScene({ dayNumber: 2, planStops: DAY2, areas, showAreas: true, layers: { plan: true, browse: false } }).areas.length, 1);
});

test("M2 an area-only stop lists under 'Not on the map yet' and is never pinned", () => {
  const s = buildMapScene({ dayNumber: 2, planStops: DAY2, layers: { plan: true, browse: false } });
  assert.deepEqual(s.notOnMap, [{ id: "p2", name: "Arashiyama (area)" }]);
  assert.ok(!s.pins.some((p) => p.id === "p2"));
  assert.ok(!sceneMarkers(s).some((m) => m.testId.endsWith("p2")));
  // It keeps its number in the sheet so the order still reads true.
  assert.deepEqual(s.list.map((l) => [l.id, l.n, l.located]), [["p1", 1, true], ["p2", 2, false], ["p3", 3, true]]);
});

test("M3 Browse layer: hollow teal markers for places with their own coordinates; hosts never pinned", () => {
  const listings = listingPlaces([
    { id: "L1", serviceName: "Tea ceremony", latitude: "35.00", longitude: "135.77", price: "60" },
    { id: "L2", serviceName: "Kimono walk", latitude: null, longitude: null },
  ]);
  const partner = partnerPlaces(
    [
      { id: "A1", name: "Gion walking tour", category: "tour", coordinates: { lat: 35.0, lng: 135.78 } },
      { id: "A2", name: "Hotel X", category: "hotel", coordinates: { lat: 35.0, lng: 135.76 } },
    ],
    "activity_provider",
  );
  const browse: BrowsePlace[] = [...listings, ...partner];
  const s = buildMapScene({ dayNumber: 2, planStops: DAY2, browse, layers: { plan: true, browse: true } });
  const ids = sceneMarkers(s).filter((m) => m.kind === "browse").map((m) => m.testId);
  assert.deepEqual(ids, ["map-browse-listing-L1", "map-browse-partner-A1"], "located only, filtered to the category");
  assert.equal(BROWSE_TEAL, "#14B8A6");
  assert.equal(buildMapScene({ dayNumber: 2, planStops: DAY2, browse, layers: { plan: true, browse: false } }).browse.length, 0);
  // Hosts become list rows, never markers.
  const hosts = hostRows([{ id: "u1", firstName: "Aiko", handle: "aiko" }]);
  assert.equal(hosts.length, 1);
  assert.ok(!("lat" in (hosts[0] as object)));
  // "Add" is the existing itinerary-items POST body.
  assert.equal((browseAddBody(listings[0], 2) as any).providerServiceId, "L1");
  assert.equal((browseAddBody(partner[0], 2) as any).affiliateProductId, "A1");
});

test("M4 version diff colouring: moved gold, dropped ghosted, added marked; the anchor moves with the version", () => {
  const plan: BoardStop[] = [
    { id: "p1", name: "Kinkaku-ji", dayNumber: 2, startTime: "09:00", lat: 35.0394, lng: 135.7292 },
    { id: "p3", name: "Tenryu-ji", dayNumber: 2, startTime: "13:00", lat: 35.0158, lng: 135.6737 },
    { id: "p4", name: "Nishiki Market", dayNumber: 2, startTime: "16:00", lat: 35.005, lng: 135.765 },
  ];
  const vStops: BoardStop[] = [
    { id: "v1", sourceItemId: "p3", name: "Tenryu-ji", dayNumber: 2, startTime: "09:00", lat: 35.0158, lng: 135.6737 },
    { id: "v2", sourceItemId: "p1", name: "Kinkaku-ji", dayNumber: 2, startTime: "09:00", lat: 35.0394, lng: 135.7292 },
    { id: "v3", name: "Fushimi Inari", dayNumber: 2, startTime: "15:00", lat: 34.9671, lng: 135.7727 },
  ];
  const version: MapVersion = {
    key: "B",
    label: "B",
    stops: vStops,
    days: diffVersionDays(plan, vStops),
    anchor: { kind: "stay", name: "Ryokan Gion", lat: 35.003, lng: 135.775 },
  };
  const planDay: PlanDayStop[] = plan.map((p) => ({ id: p.id, name: p.name, time: p.startTime, lat: p.lat, lng: p.lng }));
  const s = buildMapScene({ dayNumber: 2, planStops: planDay, version, planAnchor: STAY, layers: { plan: true, browse: false } });
  const byId = Object.fromEntries(s.pins.map((p) => [p.id, p.state]));
  assert.equal(byId.v1, "moved", "Tenryu-ji keeps p3 in a different slot");
  assert.equal(byId.v2, "moved");
  assert.equal(byId.v3, "added");
  assert.equal(byId.p4, "ghost", "the dropped draft stop is ghosted");
  assert.equal(PIN_STYLE.moved.fill, "#C9A227", "moved is gold");
  assert.ok(PIN_STYLE.ghost.opacity < 1 && PIN_STYLE.ghost.dashed);
  assert.ok(sceneMarkers(s).some((m) => m.testId === "map-ghost-p4"));
  assert.equal(s.connector.length, 3, "ghosts are not on the connector");
  assert.equal(s.anchor?.name, "Ryokan Gion", "the anchor moves with the version");
});

test("M5 renderer: Google with a key, Leaflet/OSM otherwise; the fallback is once per page and sticky", () => {
  __resetMapFallbackForTests();
  assert.equal(chooseMapRenderer({ hasKey: true, fellBack: null }), "google");
  assert.equal(chooseMapRenderer({ hasKey: false, fellBack: null }), "leaflet");
  for (const reason of ["load_error", "timeout", "auth_error"] as const) {
    assert.equal(chooseMapRenderer({ hasKey: true, fellBack: reason }), "leaflet");
  }
  assert.equal(MAP_LOAD_TIMEOUT_MS, 10_000);
  assert.equal(MAP_FALLBACK_NOTICE, "Map by OpenStreetMap");
  markMapFallback("timeout");
  const src = read("client/src/lib/map-renderer.ts");
  assert.match(src, /gm_authFailure/, "a quota/auth error on load falls back");
  // Tiles: the config name is read, and absent ⇒ public OSM plus a logged warning.
  const markets = read("server/routes/markets.routes.ts");
  assert.match(markets, /MAP_FALLBACK_TILE_URL/);
  assert.match(markets, /© OpenStreetMap contributors/);
  __resetMapFallbackForTests();
});

test("M6 renderer parity: both renderers draw exactly sceneMarkers(scene) — same pins, anchor and layers", () => {
  const google = read("client/src/components/plancard/map/SceneMapGoogle.tsx");
  const leaflet = read("client/src/components/plancard/map/SceneMapLeaflet.tsx");
  for (const [name, src] of [["google", google], ["leaflet", leaflet]] as const) {
    assert.match(src, /sceneMarkers\(scene\)/, `${name} maps over the shared marker list`);
    assert.match(src, /scene\.connector/, `${name} draws the scene's connector`);
    assert.match(src, /scene\.areas/, `${name} draws the scene's areas`);
    assert.match(src, /data-testid|testId/, `${name} carries the descriptor testids`);
    // The one read either renderer makes is the tile configuration (Leaflet) — never plan data.
    assert.ok(!/planStops|versions\b|itinerary|plancard/.test(src), `${name} reads no plan data of its own`);
    for (const q of src.match(/queryKey: \[[^\]]*\]/g) ?? []) assert.match(q, /\/api\/maps\/tiles/);
  }
  // On the stored fixture, the marker list is one list — so the counts cannot differ by renderer.
  const s = buildMapScene({ dayNumber: 2, planStops: DAY2, planAnchor: STAY, layers: { plan: true, browse: false } });
  const markers = sceneMarkers(s);
  assert.equal(markers.filter((m) => m.kind === "pin").length, 2);
  assert.equal(markers.filter((m) => m.kind === "anchor").length, 1);
});

test("M7 no travel minutes unless the travel-time service is on", () => {
  const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
  assert.match(mcc, /if \(!showTravelMinutes \|\| version \|\| !day\?\.transports\?\.length\) return \[\];/);
  assert.match(read("server/routes/plancard.routes.ts"), /travelTimesShown: travelTimeServiceEnabled\(\)/);
  assert.match(read("client/src/components/plancard/SlipView.tsx"), /showTravelMinutes=\{data\.travelTimesShown === true\}/);
  // The board shows clock times only.
  assert.ok(!/durationMinutes\}|minutes\b.*\{/.test(read("client/src/components/plancard/VersionsBoard.tsx")));
});

test("M8 MapControlCenter is the only map on the slip, the Trip Card and the comparison screen", () => {
  for (const rel of [
    "client/src/components/plancard/SlipView.tsx",
    "client/src/components/plancard/PlanCard.tsx",
    "client/src/pages/itinerary-comparison.tsx",
    "client/src/components/plancard/VersionsBoard.tsx",
  ]) {
    const src = read(rel);
    assert.ok(!/<(LeafletPlanMap|ExperienceMap|ProposalComparisonMap|GoogleMap)\b/.test(src), `${rel} mounts no other map`);
  }
  assert.match(read("client/src/components/plancard/VersionsBoard.tsx"), /<MapControlCenter/);
  // The Workstation keeps its own map until step 7 (ruling 8).
  assert.match(read("client/src/pages/expert/workspace.tsx"), /LeafletPlanMap|GoogleMap|Map/);
});
