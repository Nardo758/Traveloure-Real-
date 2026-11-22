/**
 * A7 part 1 - the map beside the days (board R3_DaysBoard; Leon's go, Nov 21, 2026).
 *
 *   P1 the panel: chips, Browse nearby, the count line, and the slip's own line when nothing is located
 *   P2 a one-day plan draws no chips; a viewer who cannot add draws no Browse nearby
 *   P3 the panel changes nothing and asks the server for nothing
 *   P4 source: it draws the map view's own scene and keeps GC-1 (the OpenStreetMap canvas only for non-Google points)
 *   S1 source: the slip offers "Days and map" only at desktop width on a plan with stops, and it is the default there
 *   S2 source: "Days only" rides the URL and both day choices save as Days (PLAN_VIEWS is unchanged)
 *   S3 source: the page widens for it, the days keep the left, the panel stands beside them
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/plancard/__tests__/a7-days-map.test.tsx
 */
import { describe, it } from "node:test";
import "../../__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DaysMapPanel, type DaysMapPanelProps } from "../../plan/DaysMapPanel";
import { PLAN_VIEWS } from "@shared/plan-view";

(globalThis as any).React = React;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, rel), "utf8");

// No stop is located, so no map canvas mounts under the server renderer; the panel's own chrome is what is read.
const act = (id: string, name: string) => ({ id, name, time: null, lat: null, lng: null }) as any;
const days = [
  { dayNum: 1, dateIso: "2026-12-08", activities: [act("a", "Fushimi Inari Shrine"), act("b", "Tofuku-ji")] },
  { dayNum: 2, dateIso: "2026-12-09", activities: [act("c", "Tenryu-ji")] },
] as any[];
const EMPTY = "No stops are located yet — items need map locations before they can be shown on a map";
const html = (p: Partial<DaysMapPanelProps> = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  return renderToString(
    <QueryClientProvider client={qc}>
      <DaysMapPanel tripId="t1" days={days} anchor={null} emptyNote={EMPTY} onBrowse={() => {}} {...p} />
    </QueryClientProvider>,
  );
};

describe("A7 part 1 - the map beside the days", () => {
  it("P1 chips, Browse nearby, the count line and the empty line", () => {
    const out = html();
    assert.match(out, /data-testid="slip-days-map"/);
    assert.match(out, /data-testid="slip-days-map-chip-all"[^>]*>All days</);
    assert.match(out, /aria-pressed="true"[^>]*data-testid="slip-days-map-chip-all"/, "All days is chosen first");
    assert.match(out, /data-testid="slip-days-map-chip-1"[^>]*>Tue</);
    assert.match(out, /data-testid="slip-days-map-chip-2"[^>]*>Wed</);
    assert.match(out, /data-testid="slip-days-map-browse"[^>]*>Browse nearby</);
    assert.match(out, /data-testid="slip-days-map-count"[^>]*>0 of 3 stops on the map</);
    assert.match(out, /data-testid="slip-days-map-empty"[^>]*>No stops are located yet/);
    assert.doesNotMatch(out, /where you stay/, "no anchor, no anchor legend");
  });

  it("P2 one day: no chips; no way to add: no Browse nearby", () => {
    const one = html({ days: [days[0]] });
    assert.doesNotMatch(one, /slip-days-map-chip-/);
    assert.match(one, /slip-days-map-browse/);
    assert.match(one, />0 of 2 stops on the map</);
    const viewer = html({ onBrowse: null });
    assert.doesNotMatch(viewer, /slip-days-map-browse|Browse nearby/);
    assert.match(viewer, /slip-days-map-chip-all/);
    const bare = html({ days: [days[0]], onBrowse: null });
    assert.doesNotMatch(bare, /slip-days-map-chips|slip-days-map-browse/, "nothing to choose and nothing to open: no bar");
  });

  it("P3 the panel changes nothing and asks for nothing", () => {
    const src = read("../../plan/DaysMapPanel.tsx");
    assert.doesNotMatch(src, /useMutation|apiRequest|"POST"|"PATCH"|"DELETE"|"PUT"/, "no write");
    assert.doesNotMatch(src + read("../../plan/DaysMapCanvas.tsx"), /AddToPlanButton|browseAddBody|useMutation|apiRequest/, "no add, in the panel or its canvas");
    assert.doesNotMatch(src, /fetch\(|useQuery|\/api\//, "no request: it is on every desktop plan view");
    assert.match(src, /const center = firstPoint \? \{ lat: firstPoint\.lat, lng: firstPoint\.lng \} : fallbackCenter;/, "nothing located and no centre handed in: the slip's own line");
  });

  it("P4 the map view's own scene and canvases, and GC-1 kept", () => {
    const src = read("../../plan/DaysMapPanel.tsx");
    assert.match(src, /buildMapScene\(\{ dayNumber: null, planStops: daysMapStops\(days, key\), planAnchor: anchor, layers: \{ plan: true, browse: false \} \}\)/);
    assert.match(src, /const leafletMapAllowed = everyLocatedPointNonGoogle\(\s*leafletMountPoints\(/);
    assert.match(src, /located: locatedIds\.has\(a\.id\), coordSource: a\.coordSource/, "located is the scene's own answer");
    assert.match(src, /anchorIsGoogleDerived\(legendAnchor\)/, "a Google-derived anchor is named, never drawn, on the OpenStreetMap canvas");
    assert.match(src, /const listed = !!center && renderer === "leaflet" && !leafletMapAllowed;\s*const countLine = listed \? null : daysMapCountLine\(scene\.pins\.length, scene\.list\.length\);\s*const legendAnchor = listed \? null : scene\.anchor;/, "listed stops are not counted as on the map, and no mark is explained");
    assert.match(src, /const DaysMapCanvas = lazy\(\(\) => import\("\.\/DaysMapCanvas"\)\);/, "the map libraries load on demand");
    assert.doesNotMatch(src, /SceneMapGoogle|SceneMapLeaflet|from "leaflet"/, "the panel itself imports no map library");
    const canvas = read("../../plan/DaysMapCanvas.tsx");
    assert.match(canvas, /if \(renderer === "google"\) \{\s*return \(\s*<SceneMapGoogle /);
    assert.match(canvas, /if \(leafletMapAllowed\) \{\s*return <SceneMapLeaflet /, "the OpenStreetMap canvas mounts only when allowed");
    assert.match(canvas, /return <MapFallbackList tripId=\{tripId\} activities=\{activities\} \/>;/, "otherwise the stops are listed");
    for (const f of [src, canvas]) assert.doesNotMatch(f, /Polyline|DirectionsRenderer|minutes|duration/i, "no line and no travel time");
    assert.match(read("../MapControlCenter.tsx"), /export function MapFallbackList\(/, "the one fallback list, shared");
  });

  it("S1 the slip offers it only at desktop width on a plan with stops, and it is the default there", () => {
    const view = read("../SlipView.tsx");
    assert.match(view, /const besideOffered = desktopWidth && allActivities\.length > 0;\s*const besideMap = besideOffered && slipView === "list" && mapBeside;/);
    assert.match(view, /useState<boolean>\(\(\) => \{\s*try \{\s*return daysMapFromUrl\(window\.location\.search\);\s*\} catch \{\s*return true;\s*\}\s*\}\);/, "beside the days unless the URL says otherwise");
    assert.match(view, /\{besideOffered \? \(\s*<button[\s\S]{0,700}?data-testid="button-slip-view-days-map"[\s\S]{0,80}?\{DAYS_MAP_COPY\.view\}/);
    assert.match(view, /onClick=\{chooseDaysAndMap\}\s*aria-pressed=\{besideMap\}/);
    assert.match(view, /onClick=\{\(\) => chooseView\("list"\)\}\s*aria-pressed=\{slipView === "list" && !besideMap\}\s*data-testid="button-slip-view-list"/, "Days only is pressed when the map is not beside");
    assert.match(view, /data-testid="button-slip-view-calendar"/, "Calendar keeps its place, disabled");
    assert.match(view, /onClick=\{\(\) => chooseView\("map"\)\}/, "Map only is unchanged");
  });

  it("S2 the URL carries Days only; the account still remembers Days or Map", () => {
    assert.deepEqual([...PLAN_VIEWS], ["days", "map"], "the saved planners are unchanged");
    const view = read("../SlipView.tsx");
    assert.match(view, /return daysMapFromUrl\(window\.location\.search\);/);
    assert.match(view, /const chooseDaysAndMap = \(\) => \{\s*setSlipView\("list"\);\s*setMapBeside\(true\);\s*if \(!isGuest\) void savePlanView\("days"\);\s*\};/, "Days and map saves as Days");
    assert.match(view, /void savePlanView\(v === "map" \? "map" : "days"\);\s*\/\/ A7: the list button is "Days only" - it hides the map beside the days\.\s*if \(v === "list"\) setMapBeside\(false\);\s*\};/, "Days only hides the map beside the days");
    assert.match(view, /if \(slipView === "list" && !mapBeside\) params\.set\(DAYS_MAP_PARAM, DAYS_MAP_PARAM_HIDDEN\);\s*else params\.delete\(DAYS_MAP_PARAM\);/, "the default needs no word; Days only does");
    assert.match(view, /\}, \[slipView, mapBeside\]\);/);
  });

  it("S3 the page widens, the days keep the left, the panel stands beside them", () => {
    const view = read("../SlipView.tsx");
    assert.match(view, /slipView === "map" \|\| dayColumns \|\| besideMap \? "max-w-6xl" : "max-w-\[680px\]"/);
    assert.match(view, /className=\{besideMap \? "lg:grid lg:grid-cols-\[minmax\(0,1fr\)_320px\] lg:items-start lg:gap-4" : undefined\} data-days-map=\{besideMap \? "beside" : undefined\}/);
    const at = view.indexOf("{besideMap && data.trip ? (");
    assert.ok(at > view.indexOf("</StopDragProvider>"), "the panel follows the days");
    const mount = view.slice(at, at + 700);
    assert.match(mount, /<DaysMapPanel[\s\S]*days=\{mapDays\}[\s\S]*anchor=\{mapAnchor\}[\s\S]*emptyNote=\{planEmptyReason\}/, "the map view's own days, anchor and empty line");
    assert.doesNotMatch(mount, /tripDestination|canGeocode/, "nothing to geocode with");
    assert.match(mount, /onBrowse=\{canEditItems \|\| guest \? \(\) => openFindHost\(null\) : null\}/, "Browse nearby is the map view's Browse layer");
  });
});
