/**
 * Round 4 fixes (ledger `2026-11-06-round4-fixes`).
 *
 *   R4-1  an Events card built from a city_events row saves as `city_event` / its source id, with no client hints.
 *   R4-2  the calendar's request path never waits on the partner fetch (background refresh only).
 *   R4-3  the slip eyebrow reads "Your plan · Proposal" until dates are confirmed; no phase claim before that.
 *   R4-4  the guest plan banner / answers line read "2 adults" / "2 adults, 1 child" from the ONE helper.
 *   R4-5  the map's Browse rail finds a saved gem / event by its content row; the guest save button turns "Saved to plan".
 *   R4-6  the plan picker reads "Save to this plan".
 *   R4-7  a destination tile's nightly price is hidden in waitlist mode.
 *   R4-8  an open market's tile reads "Start a plan".
 *   R4-9  /search redirects to the marquee city page with its query.
 *   R4-10 the city page search narrows neighbourhood sections ("temple" and "tea" differ).
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/round4-fixes.test.tsx
 */
import { describe, it, beforeEach } from "node:test";
import "../../components/__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { planEyebrowLabel, phaseShown } from "@shared/plan-dates";
import { planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { guestAnswersLine, guestPlanBanner } from "../guest-map";
import { addedItemFor } from "../browse-supply";
import { markRefSaved, resetSavedRefs } from "../saved-refs";
import { SaveToPlanButton } from "../../components/plan/SaveToPlanButton";
import { CityCard } from "../../components/travelpulse/CityCard";
import { catalogueSearchRedirectTarget } from "../catalogue-search-route";
import { filterFeedBySearch } from "../../pages/discover-location";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function render(node: React.ReactNode, mode: "waitlist" | "open"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/destinations">{node}</Router>
    </QueryClientProvider>,
  );
}

describe("Round 4 fixes", () => {
  beforeEach(() => resetSavedRefs());

  it("R4-1 a city_events card saves as city_event by its source id; a partner event as event", () => {
    const card = read("client/src/components/city-feed-card.tsx");
    assert.match(card, /const isCityEvent = event\.planKind === "city_event"/);
    assert.match(card, /\? \{ type: "city_event", sourceContentId: String\(event\.sourceId\) \}/);
    assert.deepEqual(planItemRefFromFeedItem({ type: "city_event", sourceContentId: "kodaiji-autumn-night-2026" }, "Kyoto"), {
      kind: "city_event",
      source_id: "kodaiji-autumn-night-2026",
      city: "Kyoto",
    });
    // The location view: city events always; a Fever row only once it is in fever_event_cache.
    const view = read("server/services/location-view.service.ts");
    assert.match(view, /const own = await listCityEventsForLocation\(cityName\)/);
    assert.match(view, /const resolvable = result\.events\.filter\(\(e\) => cached\.has\(String\(e\.id\)\)\);/);
    assert.doesNotMatch(view, /void feverService\.cacheListedEvents/, "the cache write is awaited before the filter");
  });

  it("R4-2 the calendar never waits on the partner", () => {
    const src = read("server/services/partner-calendar.service.ts");
    assert.match(src, /if \(!deps\) \{\s*if \(!refreshing\) \{/);
    assert.match(src, /return cache && cache\.key === key \? cache\.events : \[\];/);
  });

  it("R4-3 the eyebrow: Proposal until dates are confirmed; no phase claim before that", () => {
    assert.equal(planEyebrowLabel({ datesConfirmed: false, occasionName: "Wedding" }), "Your plan · Proposal");
    assert.equal(planEyebrowLabel({ datesConfirmed: null }), "Your plan · Proposal");
    assert.equal(planEyebrowLabel({ datesConfirmed: true, occasionName: "Wedding" }), "Your plan · Wedding");
    assert.equal(planEyebrowLabel({ datesConfirmed: true }), "Your plan");
    assert.equal(phaseShown(false), false);
    assert.equal(phaseShown(undefined), false);
    assert.equal(phaseShown(true), true);
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /const phase = phaseShown\(datesConfirmed\) \? derivePhase\(start, end\) : null;/);
    assert.match(slip, /const eyebrow = planEyebrowLabel\(\{ datesConfirmed, occasionName \}\);/);
    assert.match(read("client/src/components/plancard/PlanCard.tsx"), /if \(!phaseShown\(datesConfirmed\)\) return/);
    assert.match(read("client/src/components/plancard/HeroSection.tsx"), /const timeLabel = !phaseShown\(\(trip as any\)\?\.datesConfirmed\)\s*\? "Planning"/);
  });

  it("R4-4 the party reads as stated, from the one helper", () => {
    const banner = (adults: number | null, kids: number | null) =>
      guestPlanBanner({ title: "Kyoto trip", startDate: "2027-04-09", endDate: "2027-04-12", datesConfirmed: false, adults, kids });
    assert.equal(banner(2, null), "Kyoto trip and 2 adults");
    assert.equal(banner(2, 1), "Kyoto trip and 2 adults, 1 child");
    assert.equal(banner(2, 3), "Kyoto trip and 2 adults, 3 children");
    assert.equal(banner(null, null), "Kyoto trip", "adults null until Save ⇒ no party (LD 33)");
    assert.equal(guestAnswersLine({ adults: "1", kids: "" } as any, "Kyoto"), "Kyoto and 1 adult");
    assert.doesNotMatch(read("client/src/lib/guest-map.ts"), /"traveler" : "travelers"/);
    assert.match(read("client/src/components/plancard/HeroSection.tsx"), /partyLabel=\{partyCompositionLabel\(/);
    assert.match(read("client/src/components/trip/trip-strip.tsx"), /const composition = partyCompositionLabel\(ctx\.adults, ctx\.kids\);/);
  });

  it("R4-5 a saved gem / event is found by its content row; the guest button turns Saved to plan", () => {
    const items = [{ id: "i1", contentType: "gem", contentId: "g1", dayNum: 2 }, { id: "i2", contentType: "event", contentId: "e9", dayNum: 1 }];
    assert.deepEqual(addedItemFor({ id: "g1", kind: "gem", name: "x", lat: null, lng: null } as any, items), { itemId: "i1", dayNum: 2 });
    assert.deepEqual(addedItemFor({ id: "e9", kind: "event", name: "x", lat: null, lng: null } as any, items), { itemId: "i2", dayNum: 1 });
    assert.equal(addedItemFor({ id: "g2", kind: "gem", name: "x", lat: null, lng: null } as any, items), null);
    const btn = <SaveToPlanButton testId="map-browse-add" savedKey="gem:g1" onSave={() => {}} />;
    assert.match(renderToString(btn), /data-testid="map-browse-add"[^>]*>Save to plan</);
    markRefSaved("gem:g1");
    assert.match(renderToString(btn), /disabled=""[^>]*data-testid="map-browse-add"[^>]*>Saved to plan</);
    assert.match(read("client/src/components/plancard/MapControlCenter.tsx"), /contentType: \(a as any\)\.contentType \?\? null,/);
    assert.match(read("server/services/trip-plan.service.ts"), /contentType: \(item as any\)\.contentType as string, contentId: \(item as any\)\.contentId as string/);
  });

  it("R4-6 the plan picker reads Save to this plan", () => {
    const src = read("client/src/components/plan-picker.tsx");
    assert.match(src, /mode\?\.confirmLabel \?\? "Save to this plan"/);
    assert.doesNotMatch(src, /Add to this plan/);
  });

  it("R4-7 a destination tile's nightly price shows in open mode only", () => {
    const node = <CityCard variant="pulse" cityName="Kyoto" country="Japan" score={80} avgPrice="120" primaryLabel="Start a plan" testId="card-city-kyoto" />;
    assert.doesNotMatch(render(node, "waitlist"), /\/night/, "waitlist: no price");
    assert.match(render(node, "open"), /\$(<!-- -->)?120<span[^>]*>\/night/);
  });

  it("R4-8 an open market's tile reads Start a plan", () => {
    const grid = read("client/src/components/travelpulse/CityGrid.tsx");
    assert.match(grid, /primaryLabel=\{waitlistOnly \? MARKET_STATUS_COPY\.waitlist : START_PLAN_LABEL\}/);
    assert.doesNotMatch(grid.replace(/\/\/.*$/gm, ""), /"Take me Here"/);
  });

  it("R4-9 /search goes to the marquee city page with its query", () => {
    assert.equal(catalogueSearchRedirectTarget("?q=temple", "Kyoto"), "/discover/location/kyoto?q=temple");
    assert.equal(catalogueSearchRedirectTarget("", "Kyoto"), "/discover/location/kyoto");
    assert.match(read("client/src/App.tsx"), /<Route path="\/search">\s*<CatalogueSearchRedirect \/>/);
  });

  it("R4-10 the search narrows neighbourhood sections", () => {
    const items: any[] = [
      { kind: "neighborhood", id: "n1", data: { name: "Higashiyama", gems: [{ id: "g1", placeName: "Kodai-ji Temple" }, { id: "g2", placeName: "Tea house Kagizen" }] } },
      { kind: "neighborhood", id: "n2", data: { name: "Gion", gems: [{ id: "g3", placeName: "Hanami-koji" }] } },
      { kind: "loose-gem", id: "g4", data: { placeName: "Matcha tea bar" } },
      { kind: "city-separator", id: "s", data: {} },
    ];
    const temple = filterFeedBySearch(items, "temple");
    const tea = filterFeedBySearch(items, "tea");
    assert.deepEqual(temple.map((i) => i.id), ["n1", "s"]);
    assert.deepEqual((temple[0].data as any).gems.map((g: any) => g.id), ["g1"]);
    assert.deepEqual(tea.map((i) => i.id), ["n1", "g4", "s"]);
    assert.deepEqual((tea[0].data as any).gems.map((g: any) => g.id), ["g2"]);
    assert.deepEqual(filterFeedBySearch(items, "gion").map((i) => i.id), ["n2", "s"], "a neighbourhood named by the query keeps all its tiles");
    assert.equal(filterFeedBySearch(items, ""), items);
  });
});
