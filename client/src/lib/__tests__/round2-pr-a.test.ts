/**
 * PR A — round-2 UI fixes (Leon rulings Nov 10, 2026, 12:34 PM ET; Phase 0 on main 57eba1e9).
 *
 *   C3-1 a located REVIEWED event carries its venue point into the browse list and is pinned; an unlocated one and
 *        every gem carry no point (A-33 stands for gems: boolean only, never the point)
 *   C3-2 the slip's "N of M located" line is drawn only once the plan has a stop (never "0 of 0 located")
 *   C3-3 the guest map at phone width draws the list (sheet) before the map; from `lg` the split grid is unchanged
 *   TB2.6-1 the Kyoto feed's theme request keys on the DEBOUNCED slugs (300 ms), not the URL's instant value
 *
 * Run: npx tsx --test client/src/lib/__tests__/round2-pr-a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cityContentPlaces } from "../browse-supply";
import { DISCOVER_THEME_DEBOUNCE_MS } from "../../hooks/use-debounced-value";

const read = (p: string) => fs.readFileSync(p, "utf8");
const gemCategory = () => "do";

describe("cut-list #3 — guest map browse", () => {
  it("C3-1 located reviewed events are pinned; unlocated events and every gem are not", () => {
    const places = cityContentPlaces(
      {
        gems: { data: [{ id: "g1", placeName: "Bamboo Grove", placeType: "nature", located: true, latitude: "35.0", longitude: "135.0" }] },
        events: {
          data: {
            events: [
              { id: "e1", title: "Show", description: "Our words.", located: true, latitude: "35.0116", longitude: "135.7681" },
              { id: "e2", title: "Fair", description: "Our words.", located: false, latitude: null, longitude: null },
              // A row that says located but ships no point is listed, never pinned (§13: no guessed point).
              { id: "e3", title: "Half", description: "Our words.", located: true, latitude: "35.0", longitude: null },
              // Not reviewed ⇒ not listed at all (PARTNER-1), whatever its point.
              { id: "e4", title: "Raw", description: "", located: true, latitude: "35.0", longitude: "135.0" },
            ],
          },
        },
      },
      gemCategory,
    );
    assert.deepEqual(
      places.map((p) => [p.id, p.kind, p.located, p.lat, p.lng]),
      [
        ["g1", "gem", true, null, null],
        ["e1", "event", true, 35.0116, 135.7681],
        ["e2", "event", false, null, null],
        ["e3", "event", true, null, null],
      ],
    );
  });

  it("C3-2 the slip hides the located counter at zero stops", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /\{slipView === "map" && allActivities\.length > 0 && \(\s*<span className="text-xs text-muted-foreground" data-testid="text-slip-map-located">/);
  });

  it("C3-3 the guest map is list-first at phone width and the lg split grid is unchanged", () => {
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.match(mcc, /\$\{guest \? "flex flex-col " : ""\}lg:grid lg:grid-cols-\[minmax\(0,1fr\)_340px\] lg:items-start/);
    assert.match(mcc, /data-testid=\{`map-main-\$\{tripId\}`\}/);
    assert.match(mcc, /split && guest \? " order-2 lg:order-none" : ""/, "the map canvas draws second on the guest page at phone width");
    assert.match(mcc, /split && guest \? " order-1 lg:order-none border-t-0 border-b lg:border-b-0" : ""/, "the sheet draws first");
  });
});

describe("TB2.6 — theme requests are debounced", () => {
  it("TB2.6-1 the request keys on the settled slugs, and the settle time is the one the limiter cites", () => {
    assert.equal(DISCOVER_THEME_DEBOUNCE_MS, 300);
    const page = read("client/src/pages/discover-location.tsx");
    assert.match(page, /const settledThemeParam = useDebouncedValue\(selectedThemeSlugs\.join\(","\), DISCOVER_THEME_DEBOUNCE_MS\);/);
    assert.match(page, /queryKey: \["\/api\/discover", "location-theme", city, settledThemeParam, serviceType\]/);
    assert.match(page, /enabled: settledThemeParam\.length > 0 && !!city/);
    assert.match(page, /params\.set\(SERVICES_BROWSE_THEME_PARAM, settledThemeParam\)/);
    const limiter = read("server/infrastructure/rate-limiter.ts");
    assert.match(limiter, /DISCOVER_THEME_DEBOUNCE_MS/, "the server comment that sizes the limiter cites the client settle time");
  });
});
