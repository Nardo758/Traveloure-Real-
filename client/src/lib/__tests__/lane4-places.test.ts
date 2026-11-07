/**
 * Lane 4 — /places and /plans/new (ledger `2026-11-05-lane4-places`; briefs A-16, A-20, A-23, A-24, C-4, C-5).
 *
 *   P1  C-4 / A-16: `/places`, `/places?city=` and `/hidden-gems` go to `/places/{city}`; no city ⇒ the launch market;
 *       a city that names no market keeps its segment (and is then not found).
 *   P2  C-5 / A-20: the chip set, in the approved order, and only categories that have items.
 *   P3  A-24: arrow keys, Home and End move between tabs, wrapping.
 *   P4  A-23: the cities a cold /plans/new offers (marquee first, then live) and the start a pick makes (city only).
 *   P5  Source pins: the SPA routes, the page's heading (no "Local Picks", no "rarely find" line), the tablist's
 *       keyboard handler, and the three /plans/new empty states.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane4-places.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES_CHIP_LABELS, placesChips, placesMarketFor, placesRedirectTarget } from "@shared/places-path";
import { nextTabKey } from "../roving-tabs";
import { PLANS_NEW_START_COPY, startCityOptions, startForCity } from "../plans-new-start";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lane 4 places and plans/new", () => {
  it("P1 every /places address lands on /places/{city}", () => {
    assert.equal(placesRedirectTarget(null, "kyoto"), "/places/kyoto");
    assert.equal(placesRedirectTarget("Kyoto", "kyoto"), "/places/kyoto");
    assert.equal(placesRedirectTarget("kyoto, japan", null), "/places/kyoto");
    assert.equal(placesRedirectTarget("  ", "kyoto"), "/places/kyoto");
    assert.equal(placesRedirectTarget("Atlantis", "kyoto"), "/places/atlantis");
    assert.equal(placesMarketFor("atlantis"), null);
    assert.equal(placesMarketFor("KYOTO")?.marketKey, "kyoto");
  });

  it("P2 the approved chips, in order, only where there are items", () => {
    assert.deepEqual(
      PLACES_CHIP_LABELS.map(([, l]) => l),
      ["Viewpoints", "Historic sites", "Nature", "Local Markets", "Local Food", "Street Art", "Sunset Spots", "Beaches", "Cultural Experiences", "Nightlife"],
    );
    assert.deepEqual(placesChips([]), []);
    assert.deepEqual(placesChips(["nightlife_secrets", "hidden_viewpoints", "off_tourist_path", "seasonal_events"]), [
      { value: "hidden_viewpoints", label: "Viewpoints" },
      { value: "nightlife_secrets", label: "Nightlife" },
    ]);
  });

  it("P3 arrow keys move between tabs", () => {
    const keys = ["gems", "events", "services"] as const;
    assert.equal(nextTabKey(keys, "gems", "ArrowRight"), "events");
    assert.equal(nextTabKey(keys, "services", "ArrowRight"), "gems");
    assert.equal(nextTabKey(keys, "gems", "ArrowLeft"), "services");
    assert.equal(nextTabKey(keys, "events", "Home"), "gems");
    assert.equal(nextTabKey(keys, "events", "End"), "services");
    assert.equal(nextTabKey(keys, "events", "Enter"), null);
    assert.equal(nextTabKey([], "x" as never, "ArrowRight"), null);
  });

  it("P4 a cold /plans/new offers the open cities and starts with the city only", () => {
    assert.deepEqual(PLANS_NEW_START_COPY, { heading: "Start a plan", sub: "Pick a city, then set your dates and who's coming." });
    const opts = startCityOptions({ launch: "kyoto", live: ["goa"], beta: [], dates: {} });
    assert.equal(opts[0].marketKey, "kyoto", "the marquee first");
    assert.deepEqual(opts.map((m) => m.marketKey).sort(), ["goa", "kyoto"]);
    assert.deepEqual(startCityOptions({ launch: null, live: [], beta: [], dates: {} }), []);
    const s = startForCity(opts[0]);
    assert.equal(s.occasionSlug, null, "no invented occasion");
    assert.equal(s.city, "Kyoto");
    assert.equal("startDate" in s, false, "no invented dates");
  });

  it("P5 the routes, the page and the empty states", () => {
    const app = read("client/src/App.tsx");
    assert.match(app, /<Route path="\/places\/:city">\s*\{\(params: any\) => <Layout><HiddenGemsPage city=\{params\.city\} \/><\/Layout>\}/);
    assert.match(app, /<Route path="\/places">\s*<PlacesRedirect \/>/);
    assert.match(app, /<Route path="\/hidden-gems">\s*<PlacesRedirect \/>/);
    const page = read("client/src/pages/places.tsx");
    assert.doesNotMatch(page, /"Local Picks"/);
    assert.doesNotMatch(page, /rarely find/);
    assert.match(page, /if \(!market\) return <NotFound \/>;/);
    // FU-R3-1 (sanctioned edit): the page reads the city page's gems at /api/places/:city; ai_discovered_gems never.
    assert.match(page, /\/api\/places\//);
    assert.doesNotMatch(page, /\/api\/discovery\//);
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.match(mcc, /const next = nextTabKey\(shownTabs\.map\(\(x\) => x\.key\), tab, e\.key\);/);
    const guest = read("client/src/pages/guest-plan-map.tsx");
    assert.equal((guest.match(/<PlansNewStart\b/g) ?? []).length, 3, "all three empty states");
    assert.doesNotMatch(guest, /link-guest-map-start/, "the bare link is gone");
  });
});
